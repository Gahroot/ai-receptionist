import { useCallback, useEffect, useRef } from 'react';
import { useAudioRecorder } from '@siteed/expo-audio-stream';
import { WS_BASE_URL } from '../constants/api';
import { useAuthStore } from '../stores/authStore';
import { useCallStore } from '../stores/callStore';
import audioService from '../services/audioService';
import audioPlaybackService from '../services/audioPlaybackService';

const MAX_RECONNECT_ATTEMPTS = 5;
const BASE_RECONNECT_DELAY = 1000;

// VAD debounce timers (ms)
const SPEECH_START_DEBOUNCE = 100;
const SPEECH_END_DEBOUNCE = 500;

export function useVoiceSession() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isEndingRef = useRef(false);
  const agentIdRef = useRef<string | null>(null);

  // VAD debounce refs
  const speechStartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speechEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userSpeakingRef = useRef(false);

  const workspaceId = useAuthStore((s) => s.workspaceId);
  const { isInCall, isMuted, addTranscript } = useCallStore();

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
    if (speechStartTimerRef.current) {
      clearTimeout(speechStartTimerRef.current);
      speechStartTimerRef.current = null;
    }
    if (speechEndTimerRef.current) {
      clearTimeout(speechEndTimerRef.current);
      speechEndTimerRef.current = null;
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
    userSpeakingRef.current = false;
  }, []);

  const connectWebSocket = useCallback(
    (agentId: string) => {
      if (!workspaceId) return;

      cleanup();
      isEndingRef.current = false;

      const url = `${WS_BASE_URL}/voice/test/${workspaceId}/${agentId}`;
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        reconnectAttemptRef.current = 0;
        ws.send(JSON.stringify({ type: 'start' }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);

          switch (msg.type) {
            case 'connected':
              console.log('[VoiceSession] Connected to voice server');
              break;
            case 'audio':
              if (msg.data) {
                audioPlaybackService.enqueue(msg.data);
              }
              break;
            case 'transcript':
              if (msg.role && msg.text) {
                addTranscript({ role: msg.role, text: msg.text });
              }
              break;
            case 'error':
              console.error('[VoiceSession] Server error:', msg.message);
              break;
            case 'stopped':
              console.log('[VoiceSession] Server confirmed stop');
              break;
            default:
              console.log('[VoiceSession] Unknown message type:', msg.type);
          }
        } catch (e) {
          console.error('[VoiceSession] Failed to parse message:', e);
        }
      };

      ws.onerror = (error) => {
        console.error('[VoiceSession] WebSocket error:', error);
      };

      ws.onclose = () => {
        if (!isEndingRef.current && reconnectAttemptRef.current < MAX_RECONNECT_ATTEMPTS) {
          const delay = BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttemptRef.current);
          reconnectAttemptRef.current += 1;
          console.log(`[VoiceSession] Reconnecting in ${delay}ms (attempt ${reconnectAttemptRef.current})`);
          reconnectTimeoutRef.current = setTimeout(() => {
            connectWebSocket(agentId);
          }, delay);
        }
      };
    },
    [workspaceId, cleanup, addTranscript]
  );

  /**
   * VAD speech state change handler with debouncing.
   * - Speech start: 100ms debounce (responsive)
   * - Speech end: 500ms debounce (avoid flicker)
   * - Barge-in: flush AI playback when user starts speaking
   */
  const handleSpeechStateChange = useCallback((isSpeaking: boolean) => {
    if (isSpeaking) {
      // Clear any pending speech-end timer
      if (speechEndTimerRef.current) {
        clearTimeout(speechEndTimerRef.current);
        speechEndTimerRef.current = null;
      }

      if (!userSpeakingRef.current) {
        // Debounce speech start
        if (!speechStartTimerRef.current) {
          speechStartTimerRef.current = setTimeout(() => {
            speechStartTimerRef.current = null;
            userSpeakingRef.current = true;
            useCallStore.getState().setUserSpeaking(true);

            // Barge-in: if AI is speaking, interrupt it
            if (useCallStore.getState().isAiSpeaking) {
              audioPlaybackService.flush();
            }
          }, SPEECH_START_DEBOUNCE);
        }
      }
    } else {
      // Clear any pending speech-start timer
      if (speechStartTimerRef.current) {
        clearTimeout(speechStartTimerRef.current);
        speechStartTimerRef.current = null;
      }

      if (userSpeakingRef.current) {
        // Debounce speech end
        if (!speechEndTimerRef.current) {
          speechEndTimerRef.current = setTimeout(() => {
            speechEndTimerRef.current = null;
            userSpeakingRef.current = false;
            useCallStore.getState().setUserSpeaking(false);
          }, SPEECH_END_DEBOUNCE);
        }
      }
    }
  }, []);

  const startCall = useCallback(
    async (agentId: string) => {
      agentIdRef.current = agentId;

      // Reset playback service for new call
      audioPlaybackService.reset();

      // Wire AI speaking state to call store
      audioPlaybackService.setOnAiSpeakingChange((speaking) => {
        useCallStore.getState().setAiSpeaking(speaking);
      });

      await audioService.setupAudioMode();

      connectWebSocket(agentId);

      // Start audio recording with VAD and pipe chunks to WebSocket
      const config = audioService.getRecordingConfig({
        onAudioChunk: (base64: string) => {
          const { isMuted } = useCallStore.getState();
          if (!isMuted && wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'audio', data: base64 }));
          }
        },
        onSpeechStateChange: handleSpeechStateChange,
      });

      try {
        await startAudioRecording(config);
      } catch (e) {
        console.error('[VoiceSession] Failed to start audio recording:', e);
      }
    },
    [connectWebSocket, startAudioRecording, handleSpeechStateChange]
  );

  const endCall = useCallback(async () => {
    isEndingRef.current = true;

    audioPlaybackService.flush();

    try {
      await stopAudioRecording();
    } catch (e) {
      console.error('[VoiceSession] Failed to stop audio recording:', e);
    }

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'stop' }));
    }

    cleanup();
    audioPlaybackService.destroy();
    agentIdRef.current = null;
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
