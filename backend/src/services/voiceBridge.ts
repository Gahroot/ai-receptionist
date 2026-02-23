/**
 * VoiceBridge — manages a single bridged call between Telnyx and Grok Realtime API.
 *
 * Telnyx sends mu-law 8kHz audio; Grok expects PCM16 24kHz.
 * This bridge converts audio bidirectionally in real-time.
 */

import WebSocket from 'ws';
import { db } from '../db/index.js';
import { agents, contacts, knowledgeBase, calls } from '../db/schema.js';
import { config } from '../config.js';
import { telnyxToGrok, grokToTelnyx, createDownsampleFilter, TELNYX_MIN_CHUNK_BYTES } from '../lib/audio.js';
import type { DownsampleFilter } from '../lib/audio.js';
import { toGrokVoice } from '../lib/grokVoice.js';
import { transferCall, hangupCall } from './telnyxApi.js';
import { eq, and } from 'drizzle-orm';

// ─── Active calls registry ──────────────────────────────────────────────────

export const activeCalls = new Map<string, VoiceBridge>();

// ─── Types ──────────────────────────────────────────────────────────────────

interface TranscriptEntry {
  role: 'assistant' | 'user';
  text: string;
}

export interface BridgeOptions {
  afterHours: boolean;
  screened: boolean;
  endingMessage?: string;
  forwardToNumber?: string;
}

// ─── Grok function tool definitions ──────────────────────────────────────────

const GROK_TOOLS = [
  {
    type: 'function',
    name: 'take_voicemail',
    description: 'Switch to voicemail mode. Use this when the caller wants to leave a message, or when the AI cannot help further and should offer voicemail.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    type: 'function',
    name: 'transfer_call',
    description: 'Transfer the call to a human operator. Use this when the caller specifically requests to speak with a person.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    type: 'function',
    name: 'end_call',
    description: 'End the call politely. Use this when the conversation is complete and the caller has said goodbye.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
];

// ─── VoiceBridge class ──────────────────────────────────────────────────────

export class VoiceBridge {
  private grokWs: WebSocket | null = null;
  private telnyxWs: WebSocket | null = null;
  private streamReady = false;
  private grokReady = false;
  private telnyxBuffer = Buffer.alloc(0);
  private transcript: TranscriptEntry[] = [];
  private startTime = Date.now();
  private streamId = '';
  private downsampleFilter: DownsampleFilter = createDownsampleFilter();
  private isVoicemail = false;
  private _greetingSent = false;
  private stopped = false;

  constructor(
    public readonly callControlId: string,
    public readonly workspaceId: string,
    public readonly agentId: string,
    public readonly fromNumber: string,
    public readonly toNumber: string,
    public readonly callDbId: string,
    public readonly options: BridgeOptions = { afterHours: false, screened: false },
  ) {}

  private sendToGrok(message: object): void {
    if (this.grokWs?.readyState === WebSocket.OPEN) {
      try { this.grokWs.send(JSON.stringify(message)); }
      catch (err) { console.error(`[bridge:${this.callControlId.slice(0, 8)}] Grok send error:`, err); }
    }
  }

  private sendToTelnyx(message: object): void {
    if (this.telnyxWs?.readyState === WebSocket.OPEN) {
      try { this.telnyxWs.send(JSON.stringify(message)); }
      catch (err) { console.error(`[bridge:${this.callControlId.slice(0, 8)}] Telnyx send error:`, err); }
    }
  }

  /** Start the bridge: connect to Grok, wire up both WebSockets. */
  async start(telnyxWs: WebSocket, streamId?: string): Promise<void> {
    this.telnyxWs = telnyxWs;
    if (streamId) {
      this.streamId = streamId;
      this.streamReady = true;
    }
    const tag = `[bridge:${this.callControlId.slice(0, 8)}]`;

    try {
    // 1. Fetch agent config
    const [agent] = await db
      .select()
      .from(agents)
      .where(and(eq(agents.id, this.agentId), eq(agents.workspaceId, this.workspaceId)))
      .limit(1);

    if (!agent) {
      throw new Error(`Agent not found: ${this.agentId}`);
    }

    // 2. Fetch knowledge base FAQ entries
    const faqEntries = await db
      .select()
      .from(knowledgeBase)
      .where(eq(knowledgeBase.workspaceId, this.workspaceId));

    // 3. Look up caller in contacts
    const [contact] = await db
      .select()
      .from(contacts)
      .where(
        and(
          eq(contacts.workspaceId, this.workspaceId),
          eq(contacts.phone, this.fromNumber),
        ),
      )
      .limit(1);

    // 4. Build system instructions
    let instructions = agent.systemPrompt;
    if (contact) {
      const name = [contact.firstName, contact.lastName].filter(Boolean).join(' ');
      instructions += `\n\nThe caller is ${name}${contact.company ? ` from ${contact.company}` : ''}.`;
    }
    if (faqEntries.length > 0) {
      instructions += '\n\nFrequently Asked Questions:';
      for (const faq of faqEntries) {
        instructions += `\nQ: ${faq.question}\nA: ${faq.answer}`;
      }
    }

    // Add after-hours context
    if (this.options.afterHours) {
      instructions += '\n\n[AFTER HOURS] The business is currently closed. Let the caller know they are reaching the after-hours service. Offer to take a voicemail message by calling the take_voicemail function, or provide basic information from the FAQ if possible.';
    }

    // Add screened call context
    if (this.options.screened && this.options.endingMessage) {
      instructions += `\n\n[SCREENED CALL] This call has been screened. Say the following message to the caller and then call the end_call function: "${this.options.endingMessage}"`;
    }

    // Add tool usage instructions
    instructions += '\n\nYou have the following abilities:\n- Call take_voicemail when the caller wants to leave a message\n- Call transfer_call when the caller wants to speak with a human\n- Call end_call when the conversation is complete';

    // 5. Connect to Grok Realtime API (server-side: use API key directly)
    if (!config.xaiApiKey) {
      throw new Error('xAI API key not configured');
    }

    console.log(`${tag} Connecting to Grok Realtime API...`);
    this.grokWs = new WebSocket('wss://api.x.ai/v1/realtime', {
      headers: { Authorization: `Bearer ${config.xaiApiKey}` },
    });

    this.grokWs.on('open', () => {
      console.log(`${tag} Grok WebSocket connected, sending session.update`);
      this.sendToGrok({
        type: 'session.update',
        session: {
          modalities: ['text', 'audio'],
          instructions,
          voice: toGrokVoice(agent.voiceId),
          input_audio_format: 'pcm16',
          output_audio_format: 'pcm16',
          input_audio_transcription: { model: 'grok-2-public' },
          turn_detection: {
            type: 'server_vad',
            threshold: 0.5,
            prefix_padding_ms: 300,
            silence_duration_ms: 500,
          },
          temperature: agent.temperature,
          max_response_output_tokens: agent.maxTokens,
          tools: GROK_TOOLS,
        },
      });
    });

    this.grokWs.on('message', (raw) => {
      this.handleGrokMessage(raw, agent.initialGreeting ?? null, tag);
    });

    this.grokWs.on('close', () => {
      console.log(`${tag} Grok WebSocket closed`);
    });

    this.grokWs.on('error', (err) => {
      console.error(`${tag} Grok WebSocket error:`, err);
      this.stop();
    });

    // 7. Wire up Telnyx WebSocket events
    telnyxWs.on('message', (raw) => {
      this.handleTelnyxMessage(raw, tag);
    });

    telnyxWs.on('close', () => {
      console.log(`${tag} Telnyx WebSocket closed`);
      this.stop();
    });

    telnyxWs.on('error', (err) => {
      console.error(`${tag} Telnyx WebSocket error:`, err);
      this.stop();
    });
    } catch (err) {
      console.error(`${tag} start() failed:`, err);
      try { this.grokWs?.close(); } catch { /* ignore */ }
      try { telnyxWs.close(); } catch { /* ignore */ }
      try {
        await db.update(calls).set({ status: 'failed' }).where(eq(calls.id, this.callDbId));
      } catch (dbErr) {
        console.error(`${tag} Failed to update call record:`, dbErr);
      }
      activeCalls.delete(this.callControlId);
    }
  }

  /** Handle messages from Grok. */
  private handleGrokMessage(
    raw: WebSocket.RawData,
    initialGreeting: string | null,
    tag: string,
  ): void {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    const type = msg.type as string;

    switch (type) {
      case 'session.created':
      case 'session.updated':
        console.log(`${tag} Grok ${type}`);
        this.grokReady = true;
        this.maybeTriggerGreeting(initialGreeting, tag);
        break;

      case 'response.output_audio.delta':
        if (msg.delta && this.telnyxWs?.readyState === WebSocket.OPEN) {
          const pcm24k = Buffer.from(msg.delta as string, 'base64');
          const mulaw = grokToTelnyx(pcm24k, this.downsampleFilter);

          // Buffer until we have at least TELNYX_MIN_CHUNK_BYTES
          this.telnyxBuffer = Buffer.concat([this.telnyxBuffer, mulaw]);
          while (this.telnyxBuffer.length >= TELNYX_MIN_CHUNK_BYTES) {
            const chunk = this.telnyxBuffer.subarray(0, TELNYX_MIN_CHUNK_BYTES);
            this.telnyxBuffer = this.telnyxBuffer.subarray(TELNYX_MIN_CHUNK_BYTES);
            this.sendToTelnyx({
              event: 'media',
              stream_id: this.streamId,
              media: { payload: chunk.toString('base64') },
            });
          }
        }
        break;

      case 'response.output_audio_transcript.done':
        if (msg.transcript) {
          this.transcript.push({ role: 'assistant', text: msg.transcript as string });
        }
        break;

      case 'conversation.item.input_audio_transcription.completed':
        if (msg.transcript) {
          this.transcript.push({ role: 'user', text: msg.transcript as string });
        }
        break;

      case 'response.function_call_arguments.done':
        this.handleFunctionCall(
          msg.name as string,
          msg.call_id as string,
          tag,
        );
        break;

      default:
        if (type === 'error') {
          console.error(`${tag} Grok error:`, raw.toString());
        } else if (!type.startsWith('response.output_audio')) {
          console.log(`${tag} Grok event: ${type}`);
        }
        break;
    }
  }

  /** Handle Grok function calls. */
  private handleFunctionCall(
    name: string,
    callId: string,
    tag: string,
  ): void {
    console.log(`${tag} Function call: ${name}`);

    switch (name) {
      case 'take_voicemail':
        this.isVoicemail = true;
        // Update DB
        db.update(calls)
          .set({ isVoicemail: true })
          .where(eq(calls.id, this.callDbId))
          .catch((err) => console.error(`${tag} Failed to set voicemail flag:`, err));

        // Respond to Grok so it continues
        this.sendToGrok({
          type: 'conversation.item.create',
          item: {
            type: 'function_call_output',
            call_id: callId,
            output: JSON.stringify({ status: 'voicemail_mode_activated' }),
          },
        });
        this.sendToGrok({ type: 'response.create' });
        break;

      case 'transfer_call':
        if (this.options.forwardToNumber) {
          transferCall(this.callControlId, this.options.forwardToNumber, this.toNumber).catch(
            (err) => console.error(`${tag} Transfer failed:`, err),
          );
          this.sendToGrok({
            type: 'conversation.item.create',
            item: {
              type: 'function_call_output',
              call_id: callId,
              output: JSON.stringify({ status: 'transferring', to: this.options.forwardToNumber }),
            },
          });
          this.sendToGrok({ type: 'response.create' });
          db.update(calls)
            .set({ status: 'forwarded' })
            .where(eq(calls.id, this.callDbId))
            .catch((err) => console.error(`${tag} Failed to update call status:`, err));
        } else {
          this.sendToGrok({
            type: 'conversation.item.create',
            item: {
              type: 'function_call_output',
              call_id: callId,
              output: JSON.stringify({ status: 'no_transfer_number_configured', message: 'No forwarding number is configured. Offer to take a voicemail instead.' }),
            },
          });
          this.sendToGrok({ type: 'response.create' });
        }
        break;

      case 'end_call':
        this.sendToGrok({
          type: 'conversation.item.create',
          item: {
            type: 'function_call_output',
            call_id: callId,
            output: JSON.stringify({ status: 'ending_call' }),
          },
        });
        // Give 3 seconds for Grok to finish speaking, then hang up
        setTimeout(() => {
          hangupCall(this.callControlId).catch((err) =>
            console.error(`${tag} Hangup failed:`, err),
          );
        }, 3000);
        break;

      default:
        console.warn(`${tag} Unknown function call: ${name}`);
    }
  }

  /** Handle messages from Telnyx media stream. */
  private handleTelnyxMessage(raw: WebSocket.RawData, tag: string): void {
    let msg: {
      event: string;
      stream_id?: string;
      media?: { payload?: string };
    };
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    switch (msg.event) {
      case 'media':
        if (msg.media?.payload && this.grokWs?.readyState === WebSocket.OPEN) {
          const mulaw = Buffer.from(msg.media.payload, 'base64');
          const pcm24k = telnyxToGrok(mulaw);
          this.sendToGrok({
            type: 'input_audio_buffer.append',
            audio: pcm24k.toString('base64'),
          });
        }
        break;

      case 'stop':
        console.log(`${tag} Telnyx stream stopped`);
        this.stop();
        break;
    }
  }

  /** Trigger initial greeting when both Telnyx and Grok are ready. */
  private maybeTriggerGreeting(
    initialGreeting: string | null,
    tag: string,
  ): void {
    if (!this.streamReady || !this.grokReady) return;
    if (!this.grokWs || this.grokWs.readyState !== WebSocket.OPEN) return;

    const greeting = initialGreeting;
    if (!greeting) return;

    // Prevent duplicate greeting
    if (this._greetingSent) return;
    this._greetingSent = true;

    console.log(`${tag} Both ready, sending greeting in 300ms...`);

    setTimeout(() => {
      if (this.grokWs?.readyState !== WebSocket.OPEN) return;

      this.sendToGrok({
        type: 'conversation.item.create',
        item: {
          type: 'message',
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: `[SYSTEM] The call just connected. Greet the caller with: "${greeting}"`,
            },
          ],
        },
      });
      this.sendToGrok({ type: 'response.create' });
      console.log(`${tag} Greeting triggered`);
    }, 300);
  }

  /** Stop the bridge, save call record, clean up. */
  async stop(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;

    activeCalls.delete(this.callControlId);

    // Flush remaining buffer to Telnyx
    if (this.telnyxBuffer.length > 0) {
      this.sendToTelnyx({
        event: 'media',
        stream_id: this.streamId,
        media: { payload: this.telnyxBuffer.toString('base64') },
      });
      this.telnyxBuffer = Buffer.alloc(0);
    }

    // Close Grok WS
    if (this.grokWs && this.grokWs.readyState === WebSocket.OPEN) {
      this.grokWs.close();
    }
    this.grokWs = null;

    // Calculate duration
    const durationSeconds = Math.round((Date.now() - this.startTime) / 1000);

    // Build update payload
    const updateData: Record<string, unknown> = {
      status: 'completed',
      durationSeconds,
      transcript: JSON.stringify(this.transcript),
    };

    // If voicemail, extract user transcript entries as voicemail transcription
    if (this.isVoicemail) {
      const userEntries = this.transcript
        .filter((e) => e.role === 'user')
        .map((e) => e.text);
      if (userEntries.length > 0) {
        updateData.voicemailTranscription = userEntries.join(' ');
      }
    }

    // Update call record with transcript + duration
    try {
      await db
        .update(calls)
        .set(updateData)
        .where(eq(calls.id, this.callDbId));
      console.log(
        `[bridge] Call ${this.callDbId} completed: ${durationSeconds}s, ${this.transcript.length} transcript entries${this.isVoicemail ? ' (voicemail)' : ''}`,
      );
    } catch (err) {
      console.error(`[bridge] Failed to update call record:`, err);
    }
  }
}
