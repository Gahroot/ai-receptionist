import { useCallback, useEffect, useRef } from 'react';
import { useAudioRecorder } from '@siteed/expo-audio-studio';
import { GROK_REALTIME_URL } from '../constants/api';
import { useAuthStore } from '../stores/authStore';
import { useCallStore } from '../stores/callStore';
import audioService from '../services/audioService';
import audioPlaybackService from '../services/audioPlaybackService';
import api from '../services/api';
import logger from '../lib/logger';

const MAX_RECONNECT_ATTEMPTS = 3;
const BASE_RECONNECT_DELAY = 2000;

interface VoiceSessionResponse {
  token: string;
  expires_at: number;
  agent: {
    instructions: string;
    voice: string;
    initial_greeting: string | null;
    tools: unknown[];
  };
}

export function useVoiceSession() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isEndingRef = useRef(false);
  const agentIdRef = useRef<string | null>(null);
  const sessionTokenRef = useRef<string | null>(null);

  // Log hook mount
  useEffect(() => {
    logger.lifecycle('useVoiceSession', 'mount');
    return () => {
      logger.lifecycle('useVoiceSession', 'unmount');
    };
  }, []);

  const workspaceId = useAuthStore((s) => s.workspaceId);
  const { addTranscript } = useCallStore();

  const {
    startRecording: startAudioRecording,
    stopRecording: stopAudioRecording,
    isRecording,
  } = useAudioRecorder();

  const cleanup = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.onopen = null;
      wsRef.current.onmessage = null;
      wsRef.current.onerror = null;
      wsRef.current.onclose = null;
      if (wsRef.current.readyState === WebSocket.OPEN ||
          wsRef.current.readyState === WebSocket.CONNECTING) {
        wsRef.current.close();
      }
      wsRef.current = null;
    }
    reconnectAttemptRef.current = 0;
    sessionTokenRef.current = null;
  }, []);

  /**
   * Connect directly to Grok's Realtime WebSocket using an ephemeral token.
   */
  const connectToGrok = useCallback(
    (token: string, agentConfig: VoiceSessionResponse['agent']) => {
      cleanup();
      isEndingRef.current = false;

      const url = GROK_REALTIME_URL;

      // Grok uses sec-websocket-protocol for auth
      const ws = new WebSocket(url, ['realtime', `openai-insecure-api-key.${token}`]);
      wsRef.current = ws;

      logger.websocket('Connecting to Grok Realtime', { url });

      ws.onopen = () => {
        logger.websocket('Connected to Grok Realtime', { url });
        reconnectAttemptRef.current = 0;

        // Send session.update with agent config
        const sessionUpdate = {
          type: 'session.update',
          session: {
            modalities: ['text', 'audio'],
            instructions: agentConfig.instructions,
            voice: agentConfig.voice,
            input_audio_format: 'pcm16',
            output_audio_format: 'pcm16',
            input_audio_transcription: {
              model: 'grok-2-public',
            },
            turn_detection: {
              type: 'server_vad',
              threshold: 0.5,
              prefix_padding_ms: 300,
              silence_duration_ms: 500,
            },
          },
        };
        ws.send(JSON.stringify(sessionUpdate));
        logger.info('Sent session.update to Grok', {}, 'VoiceSession');

        // If agent has an initial greeting, send it as a conversation item
        if (agentConfig.initial_greeting) {
          const greetingMessage = {
            type: 'conversation.item.create',
            item: {
              type: 'message',
              role: 'user',
              content: [
                {
                  type: 'input_text',
                  text: `You are starting a new call. Greet the caller with: "${agentConfig.initial_greeting}"`,
                },
              ],
            },
          };
          ws.send(JSON.stringify(greetingMessage));
          ws.send(JSON.stringify({ type: 'response.create' }));
        }
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);

          switch (msg.type) {
            case 'session.created':
            case 'session.updated':
              logger.info(`Grok ${msg.type}`, {}, 'VoiceSession');
              break;

            case 'response.audio.delta':
              // Incoming audio from Grok — base64 PCM16 24kHz
              if (msg.delta) {
                audioPlaybackService.enqueue(msg.delta);
              }
              break;

            case 'response.audio_transcript.delta':
              // Partial transcript of AI speech (streaming)
              break;

            case 'response.audio_transcript.done':
              // Complete AI transcript
              if (msg.transcript) {
                addTranscript({ role: 'assistant', text: msg.transcript });
              }
              break;

            case 'conversation.item.input_audio_transcription.completed':
              // User's speech transcribed
              if (msg.transcript) {
                addTranscript({ role: 'user', text: msg.transcript });
              }
              break;

            case 'input_audio_buffer.speech_started':
              // Grok's server VAD detected speech start
              useCallStore.getState().setUserSpeaking(true);
              // Barge-in: if AI is speaking, interrupt it
              if (useCallStore.getState().isAiSpeaking) {
                audioPlaybackService.flush();
              }
              break;

            case 'input_audio_buffer.speech_stopped':
              // Grok's server VAD detected speech end
              useCallStore.getState().setUserSpeaking(false);
              break;

            case 'response.audio.done':
              // AI finished sending audio for this response
              break;

            case 'response.done':
              // Full response complete
              break;

            case 'error':
              logger.error('Grok error', null, { error: msg.error }, 'VoiceSession');
              break;

            default:
              // Other Grok events (rate_limits.updated, etc.)
              break;
          }
        } catch (e) {
          logger.error('Failed to parse Grok message', e, { data: event.data }, 'VoiceSession');
        }
      };

      ws.onerror = (error) => {
        logger.error('Grok WebSocket error', error, { url }, 'VoiceSession');
      };

      ws.onclose = () => {
        logger.websocket('Grok disconnected', { url });
        useCallStore.getState().setAiSpeaking(false);
        useCallStore.getState().setUserSpeaking(false);

        if (!isEndingRef.current && reconnectAttemptRef.current < MAX_RECONNECT_ATTEMPTS) {
          const delay = BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttemptRef.current);
          reconnectAttemptRef.current += 1;
          logger.info(`Reconnecting in ${delay}ms`, { attempt: reconnectAttemptRef.current }, 'VoiceSession');
          reconnectTimeoutRef.current = setTimeout(() => {
            // Re-use the saved token if it hasn't expired
            if (sessionTokenRef.current) {
              connectToGrok(sessionTokenRef.current, agentConfig);
            }
          }, delay);
        } else if (reconnectAttemptRef.current >= MAX_RECONNECT_ATTEMPTS) {
          logger.error('Max reconnect attempts reached', null, { attempts: reconnectAttemptRef.current }, 'VoiceSession');
        }
      };
    },
    [cleanup, addTranscript]
  );

  const startCall = useCallback(
    async (agentId: string) => {
      logger.lifecycle('VoiceSession', 'startCall:start', { agentId });

      agentIdRef.current = agentId;

      // Reset playback service for new call
      audioPlaybackService.reset();

      // Wire AI speaking state to call store
      audioPlaybackService.setOnAiSpeakingChange((speaking) => {
        useCallStore.getState().setAiSpeaking(speaking);
      });

      try {
        await audioService.setupAudioMode();
      } catch (e) {
        logger.error('Failed to setup audio mode', e, {}, 'VoiceSession');
      }

      // Step 1: Get ephemeral token from our backend
      let sessionData: VoiceSessionResponse;
      try {
        const response = await api.post('/voice/session', {
          workspace_id: workspaceId,
          agent_id: agentId,
        });
        sessionData = response.data;
        sessionTokenRef.current = sessionData.token;
        logger.info('Got ephemeral token', { expires_at: sessionData.expires_at }, 'VoiceSession');
      } catch (e) {
        logger.error('Failed to get voice session token', e, {}, 'VoiceSession');
        throw e;
      }

      // Step 2: Connect directly to Grok's WebSocket
      connectToGrok(sessionData.token, sessionData.agent);

      // Step 3: Start audio recording and pipe chunks to Grok
      const config = audioService.getRecordingConfig({
        onAudioChunk: (base64: string) => {
          const { isMuted } = useCallStore.getState();
          if (!isMuted && wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
              type: 'input_audio_buffer.append',
              audio: base64,
            }));
          }
        },
      });

      try {
        await startAudioRecording(config);
        logger.lifecycle('VoiceSession', 'startCall:success');
      } catch (e) {
        logger.error('Failed to start audio recording', e, {}, 'VoiceSession');
      }
    },
    [workspaceId, connectToGrok, startAudioRecording]
  );

  const endCall = useCallback(async () => {
    logger.lifecycle('VoiceSession', 'endCall:start');

    isEndingRef.current = true;

    audioPlaybackService.flush();

    try {
      await stopAudioRecording();
    } catch (e) {
      logger.error('Failed to stop audio recording', e, {}, 'VoiceSession');
    }

    cleanup();
    audioPlaybackService.destroy();
    agentIdRef.current = null;

    logger.lifecycle('VoiceSession', 'endCall:complete');
  }, [stopAudioRecording, cleanup]);

  const toggleMute = useCallback(() => {
    useCallStore.getState().toggleMute();
  }, []);

  const toggleSpeaker = useCallback(async () => {
    const newSpeaker = !useCallStore.getState().isSpeaker;
    useCallStore.getState().toggleSpeaker();
    await audioService.setSpeakerMode(newSpeaker);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isEndingRef.current = true;
      cleanup();
      audioPlaybackService.destroy();
    };
  }, [cleanup]);

  return {
    isConnected: wsRef.current?.readyState === WebSocket.OPEN,
    isRecording,
    startCall,
    endCall,
    toggleMute,
    toggleSpeaker,
  };
}
