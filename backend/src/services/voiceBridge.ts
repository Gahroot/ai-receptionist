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
import { telnyxToGrok, grokToTelnyx, TELNYX_MIN_CHUNK_BYTES } from '../lib/audio.js';
import { eq, and } from 'drizzle-orm';

// ─── Voice map (OpenAI-style → Grok) ────────────────────────────────────────

const GROK_VOICE_NAMES = ['Sal', 'Ara', 'Eve', 'Leo', 'Rex'] as const;
type GrokVoice = (typeof GROK_VOICE_NAMES)[number];

const VOICE_MAP: Record<string, GrokVoice> = {
  alloy: 'Sal',
  shimmer: 'Ara',
  nova: 'Eve',
  echo: 'Leo',
  onyx: 'Rex',
};

function toGrokVoice(voiceId: string): GrokVoice {
  if (GROK_VOICE_NAMES.includes(voiceId as GrokVoice)) return voiceId as GrokVoice;
  return VOICE_MAP[voiceId.toLowerCase()] ?? 'Ara';
}

// ─── Active calls registry ──────────────────────────────────────────────────

export const activeCalls = new Map<string, VoiceBridge>();

// ─── Transcript entry ───────────────────────────────────────────────────────

interface TranscriptEntry {
  role: 'assistant' | 'user';
  text: string;
}

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

  constructor(
    public readonly callControlId: string,
    public readonly workspaceId: string,
    public readonly agentId: string,
    public readonly fromNumber: string,
    public readonly toNumber: string,
    public readonly callDbId: string,
  ) {}

  /** Start the bridge: connect to Grok, wire up both WebSockets. */
  async start(telnyxWs: WebSocket): Promise<void> {
    this.telnyxWs = telnyxWs;
    const tag = `[bridge:${this.callControlId.slice(0, 8)}]`;

    // 1. Fetch agent config
    const [agent] = await db
      .select()
      .from(agents)
      .where(and(eq(agents.id, this.agentId), eq(agents.workspaceId, this.workspaceId)))
      .limit(1);

    if (!agent) {
      console.error(`${tag} Agent not found: ${this.agentId}`);
      return;
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

    // 5. Get Grok ephemeral token
    if (!config.xaiApiKey) {
      console.error(`${tag} xAI API key not configured`);
      return;
    }

    const tokenRes = await fetch('https://api.x.ai/v1/realtime/client_secrets', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.xaiApiKey}`,
      },
    });

    if (!tokenRes.ok) {
      console.error(`${tag} Failed to get Grok token: ${tokenRes.status}`);
      return;
    }

    const tokenData = (await tokenRes.json()) as {
      client_secret: { value: string };
    };
    const grokToken = tokenData.client_secret.value;

    // 6. Connect to Grok Realtime API
    console.log(`${tag} Connecting to Grok Realtime API...`);
    this.grokWs = new WebSocket('wss://api.x.ai/v1/realtime', {
      headers: { Authorization: `Bearer ${grokToken}` },
    });

    this.grokWs.on('open', () => {
      console.log(`${tag} Grok WebSocket connected, sending session.update`);
      this.grokWs!.send(
        JSON.stringify({
          type: 'session.update',
          session: {
            modalities: ['text', 'audio'],
            instructions,
            voice: toGrokVoice(agent.voiceId),
            input_audio_format: 'pcm16',
            output_audio_format: 'pcm16',
            input_audio_transcription: { model: 'whisper-1' },
            turn_detection: {
              type: 'server_vad',
              threshold: 0.5,
              prefix_padding_ms: 300,
              silence_duration_ms: 500,
            },
            temperature: agent.temperature,
            max_response_output_tokens: agent.maxTokens,
          },
        }),
      );
    });

    this.grokWs.on('message', (raw) => {
      this.handleGrokMessage(raw, agent.initialGreeting ?? null, tag);
    });

    this.grokWs.on('close', () => {
      console.log(`${tag} Grok WebSocket closed`);
    });

    this.grokWs.on('error', (err) => {
      console.error(`${tag} Grok WebSocket error:`, err);
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
    });
  }

  /** Handle messages from Grok. */
  private handleGrokMessage(
    raw: WebSocket.RawData,
    initialGreeting: string | null,
    tag: string,
  ): void {
    let msg: { type: string; delta?: string; transcript?: string };
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    switch (msg.type) {
      case 'session.created':
        console.log(`${tag} Grok session created`);
        this.grokReady = true;
        this.maybeTriggerGreeting(initialGreeting, tag);
        break;

      case 'response.audio.delta':
        if (msg.delta && this.telnyxWs?.readyState === WebSocket.OPEN) {
          const pcm24k = Buffer.from(msg.delta, 'base64');
          const mulaw = grokToTelnyx(pcm24k);

          // Buffer until we have at least TELNYX_MIN_CHUNK_BYTES
          this.telnyxBuffer = Buffer.concat([this.telnyxBuffer, mulaw]);
          while (this.telnyxBuffer.length >= TELNYX_MIN_CHUNK_BYTES) {
            const chunk = this.telnyxBuffer.subarray(0, TELNYX_MIN_CHUNK_BYTES);
            this.telnyxBuffer = this.telnyxBuffer.subarray(TELNYX_MIN_CHUNK_BYTES);
            this.telnyxWs.send(
              JSON.stringify({
                event: 'media',
                stream_id: this.streamId,
                media: { payload: chunk.toString('base64') },
              }),
            );
          }
        }
        break;

      case 'response.audio_transcript.done':
        if (msg.transcript) {
          this.transcript.push({ role: 'assistant', text: msg.transcript });
        }
        break;

      case 'conversation.item.input_audio_transcription.completed':
        if (msg.transcript) {
          this.transcript.push({ role: 'user', text: msg.transcript });
        }
        break;
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
      case 'start':
        console.log(`${tag} Telnyx stream started`);
        this.streamId = msg.stream_id ?? '';
        this.streamReady = true;
        this.maybeTriggerGreeting(null, tag);
        break;

      case 'media':
        if (msg.media?.payload && this.grokWs?.readyState === WebSocket.OPEN) {
          const mulaw = Buffer.from(msg.media.payload, 'base64');
          const pcm24k = telnyxToGrok(mulaw);
          this.grokWs.send(
            JSON.stringify({
              type: 'input_audio_buffer.append',
              audio: pcm24k.toString('base64'),
            }),
          );
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

    // Store greeting for later use (only set once from Grok handler)
    const greeting = initialGreeting ?? this._storedGreeting;
    if (!greeting) return;

    // Prevent duplicate greeting
    if (this._greetingSent) return;
    this._greetingSent = true;

    console.log(`${tag} Both ready, sending greeting in 300ms...`);

    setTimeout(() => {
      if (this.grokWs?.readyState !== WebSocket.OPEN) return;

      this.grokWs.send(
        JSON.stringify({
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
        }),
      );
      this.grokWs!.send(JSON.stringify({ type: 'response.create' }));
      console.log(`${tag} Greeting triggered`);
    }, 300);
  }

  // Store greeting across calls to maybeTriggerGreeting
  private _storedGreeting: string | null = null;
  private _greetingSent = false;

  /** Stop the bridge, save call record, clean up. */
  async stop(): Promise<void> {
    if (activeCalls.has(this.callControlId)) {
      activeCalls.delete(this.callControlId);
    }

    // Flush remaining buffer to Telnyx
    if (
      this.telnyxBuffer.length > 0 &&
      this.telnyxWs?.readyState === WebSocket.OPEN
    ) {
      this.telnyxWs.send(
        JSON.stringify({
          event: 'media',
          stream_id: this.streamId,
          media: { payload: this.telnyxBuffer.toString('base64') },
        }),
      );
      this.telnyxBuffer = Buffer.alloc(0);
    }

    // Close Grok WS
    if (this.grokWs && this.grokWs.readyState === WebSocket.OPEN) {
      this.grokWs.close();
    }
    this.grokWs = null;

    // Calculate duration
    const durationSeconds = Math.round((Date.now() - this.startTime) / 1000);

    // Update call record with transcript + duration
    try {
      await db
        .update(calls)
        .set({
          status: 'completed',
          durationSeconds,
          transcript: JSON.stringify(this.transcript),
        })
        .where(eq(calls.id, this.callDbId));
      console.log(
        `[bridge] Call ${this.callDbId} completed: ${durationSeconds}s, ${this.transcript.length} transcript entries`,
      );
    } catch (err) {
      console.error(`[bridge] Failed to update call record:`, err);
    }
  }
}
