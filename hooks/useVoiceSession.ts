import { useCallback, useEffect, useRef } from 'react';
import { useAudioRecorder } from '@siteed/expo-audio-stream';
import { WS_BASE_URL } from '../constants/api';
import { useAuthStore } from '../stores/authStore';
import { useCallStore } from '../stores/callStore';
import audioService from '../services/audioService';

const MAX_RECONNECT_ATTEMPTS = 5;
const BASE_RECONNECT_DELAY = 1000;

export function useVoiceSession() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isEndingRef = useRef(false);
  const agentIdRef = useRef<string | null>(null);

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
              // Server audio playback - log for now (needs native bridge for real playback)
              console.log('[VoiceSession] Received audio chunk, length:', msg.data?.length || 0);
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

  const startCall = useCallback(
    async (agentId: string) => {
      agentIdRef.current = agentId;

      await audioService.setupAudioMode();

      connectWebSocket(agentId);

      // Start audio recording and pipe chunks to WebSocket
      const config = audioService.getRecordingConfig((base64: string) => {
        const { isMuted } = useCallStore.getState();
        if (!isMuted && wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: 'audio', data: base64 }));
        }
      });

      try {
        await startAudioRecording(config);
      } catch (e) {
        console.error('[VoiceSession] Failed to start audio recording:', e);
      }
    },
    [connectWebSocket, startAudioRecording]
  );

  const endCall = useCallback(async () => {
    isEndingRef.current = true;

    try {
      await stopAudioRecording();
    } catch (e) {
      console.error('[VoiceSession] Failed to stop audio recording:', e);
    }

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'stop' }));
    }

    cleanup();
    agentIdRef.current = null;
  }, [stopAudioRecording, cleanup]);

  const toggleMute = useCallback(() => {
    useCallStore.getState().toggleMute();
    // When muted, we stop sending audio chunks but keep the WebSocket alive.
    // The audio recording continues but chunks are not sent (handled by isMuted check
    // in the audio chunk callback if needed in the future).
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isEndingRef.current = true;
      cleanup();
    };
  }, [cleanup]);

  return {
    isConnected: wsRef.current?.readyState === WebSocket.OPEN,
    isRecording,
    startCall,
    endCall,
    toggleMute,
  };
}
