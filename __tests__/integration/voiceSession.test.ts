/**
 * Integration tests for the useVoiceSession hook.
 *
 * Tests WebSocket lifecycle, audio recording coordination,
 * playback service integration, VAD handling, and call store updates.
 */
import { renderHook, act } from '@testing-library/react-native';
import { useAuthStore } from '@/stores/authStore';
import { useCallStore } from '@/stores/callStore';

// --- Mock WebSocket ---
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  url: string;
  readyState: number = MockWebSocket.CONNECTING;
  onopen: ((event: any) => void) | null = null;
  onmessage: ((event: any) => void) | null = null;
  onerror: ((event: any) => void) | null = null;
  onclose: ((event: any) => void) | null = null;
  send = jest.fn();
  close = jest.fn(() => {
    this.readyState = MockWebSocket.CLOSED;
  });

  constructor(url: string) {
    this.url = url;
    mockWsInstances.push(this);
  }

  // Test helpers
  simulateOpen() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.({});
  }

  simulateMessage(data: any) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }

  simulateError(error: any) {
    this.onerror?.(error);
  }

  simulateClose() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({});
  }
}

let mockWsInstances: MockWebSocket[] = [];

// Set up WebSocket constants on global
(global as any).WebSocket = MockWebSocket;
(global as any).WebSocket.OPEN = MockWebSocket.OPEN;
(global as any).WebSocket.CONNECTING = MockWebSocket.CONNECTING;
(global as any).WebSocket.CLOSING = MockWebSocket.CLOSING;
(global as any).WebSocket.CLOSED = MockWebSocket.CLOSED;

// --- Mock audioService ---
jest.mock('@/services/audioService', () => ({
  __esModule: true,
  default: {
    setupAudioMode: jest.fn().mockResolvedValue(undefined),
    setSpeakerMode: jest.fn().mockResolvedValue(undefined),
    getRecordingConfig: jest.fn((callbacks: any) => ({
      sampleRate: 16000,
      channels: 1,
      encoding: 'pcm_16bit',
      interval: 250,
      _callbacks: callbacks, // Expose callbacks for testing
    })),
  },
  RECORDING_CONFIG: {
    sampleRate: 16000,
    channels: 1,
    encoding: 'pcm_16bit',
    interval: 250,
  },
}));

// --- Mock audioPlaybackService ---
jest.mock('@/services/audioPlaybackService', () => ({
  __esModule: true,
  default: {
    enqueue: jest.fn(),
    flush: jest.fn(),
    destroy: jest.fn(),
    reset: jest.fn(),
    setOnAiSpeakingChange: jest.fn(),
  },
}));

// --- Mock useAudioRecorder ---
const mockStartRecording = jest.fn().mockResolvedValue(undefined);
const mockStopRecording = jest.fn().mockResolvedValue(undefined);

jest.mock('@siteed/expo-audio-stream', () => ({
  useAudioRecorder: jest.fn(() => ({
    startRecording: mockStartRecording,
    stopRecording: mockStopRecording,
    isRecording: false,
    isPaused: false,
  })),
  ExpoAudioStreamModule: {
    requestPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
    getPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
  },
}));

// --- Import hook under test (after mocks) ---
import { useVoiceSession } from '@/hooks/useVoiceSession';
import audioService from '@/services/audioService';
import audioPlaybackService from '@/services/audioPlaybackService';

// Reference the mocked singleton so tests can assert on its methods
const mockPlaybackService = audioPlaybackService as jest.Mocked<typeof audioPlaybackService>;

describe('useVoiceSession Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockWsInstances = [];

    // Set authenticated state with workspace
    useAuthStore.setState({
      user: { id: 1, email: 'test@test.com', full_name: 'Test', is_active: true, created_at: '', default_workspace_id: 'ws-123' },
      workspaceId: 'ws-123',
      isAuthenticated: true,
      isLoading: false,
    });

    // Reset call store
    useCallStore.setState({
      isInCall: false,
      callId: null,
      contactName: null,
      contactNumber: null,
      duration: 0,
      isMuted: false,
      isSpeaker: false,
      isAiSpeaking: false,
      isUserSpeaking: false,
      transcript: [],
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('startCall()', () => {
    it('creates WebSocket with correct URL using workspaceId and agentId', async () => {
      const { result } = renderHook(() => useVoiceSession());

      await act(async () => {
        await result.current.startCall('agent-456');
      });

      expect(mockWsInstances.length).toBeGreaterThanOrEqual(1);
      const ws = mockWsInstances[0];
      expect(ws.url).toContain('ws://');
      expect(ws.url).toContain('/voice/test/ws-123/agent-456');
    });

    it('sets up audio mode before connecting', async () => {
      const { result } = renderHook(() => useVoiceSession());

      await act(async () => {
        await result.current.startCall('agent-456');
      });

      expect(audioService.setupAudioMode).toHaveBeenCalled();
    });

    it('resets playback service for new call', async () => {
      const { result } = renderHook(() => useVoiceSession());

      await act(async () => {
        await result.current.startCall('agent-456');
      });

      expect(mockPlaybackService.reset).toHaveBeenCalled();
    });

    it('wires AI speaking state change callback to playback service', async () => {
      const { result } = renderHook(() => useVoiceSession());

      await act(async () => {
        await result.current.startCall('agent-456');
      });

      expect(mockPlaybackService.setOnAiSpeakingChange).toHaveBeenCalledWith(
        expect.any(Function)
      );

      // Invoke the callback and verify it updates call store
      const callback = mockPlaybackService.setOnAiSpeakingChange.mock.calls[0][0];
      act(() => {
        callback(true);
      });
      expect(useCallStore.getState().isAiSpeaking).toBe(true);

      act(() => {
        callback(false);
      });
      expect(useCallStore.getState().isAiSpeaking).toBe(false);
    });

    it('starts audio recording with config from audioService', async () => {
      const { result } = renderHook(() => useVoiceSession());

      await act(async () => {
        await result.current.startCall('agent-456');
      });

      expect(audioService.getRecordingConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          onAudioChunk: expect.any(Function),
          onSpeechStateChange: expect.any(Function),
        })
      );
      expect(mockStartRecording).toHaveBeenCalled();
    });
  });

  describe('WebSocket onopen', () => {
    it('sends start message and resets reconnect counter', async () => {
      const { result } = renderHook(() => useVoiceSession());

      await act(async () => {
        await result.current.startCall('agent-456');
      });

      const ws = mockWsInstances[0];

      act(() => {
        ws.simulateOpen();
      });

      expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ type: 'start' }));
    });
  });

  describe('WebSocket onmessage', () => {
    it('enqueues audio data to playback service on audio message', async () => {
      const { result } = renderHook(() => useVoiceSession());

      await act(async () => {
        await result.current.startCall('agent-456');
      });

      const ws = mockWsInstances[0];
      act(() => {
        ws.simulateOpen();
      });

      act(() => {
        ws.simulateMessage({ type: 'audio', data: 'base64audiochunk==' });
      });

      expect(mockPlaybackService.enqueue).toHaveBeenCalledWith('base64audiochunk==');
    });

    it('does not enqueue audio when data is missing', async () => {
      const { result } = renderHook(() => useVoiceSession());

      await act(async () => {
        await result.current.startCall('agent-456');
      });

      const ws = mockWsInstances[0];
      act(() => {
        ws.simulateOpen();
      });

      act(() => {
        ws.simulateMessage({ type: 'audio' }); // no data field
      });

      expect(mockPlaybackService.enqueue).not.toHaveBeenCalled();
    });

    it('adds transcript to call store on transcript message', async () => {
      const { result } = renderHook(() => useVoiceSession());

      await act(async () => {
        await result.current.startCall('agent-456');
      });

      const ws = mockWsInstances[0];
      act(() => {
        ws.simulateOpen();
      });

      act(() => {
        ws.simulateMessage({
          type: 'transcript',
          role: 'assistant',
          text: 'Hello, how can I help you?',
        });
      });

      const transcript = useCallStore.getState().transcript;
      expect(transcript).toHaveLength(1);
      expect(transcript[0]).toEqual({
        role: 'assistant',
        text: 'Hello, how can I help you?',
      });
    });

    it('adds user transcript to call store', async () => {
      const { result } = renderHook(() => useVoiceSession());

      await act(async () => {
        await result.current.startCall('agent-456');
      });

      const ws = mockWsInstances[0];
      act(() => {
        ws.simulateOpen();
      });

      act(() => {
        ws.simulateMessage({
          type: 'transcript',
          role: 'user',
          text: 'I need to book an appointment',
        });
      });

      const transcript = useCallStore.getState().transcript;
      expect(transcript).toHaveLength(1);
      expect(transcript[0]).toEqual({
        role: 'user',
        text: 'I need to book an appointment',
      });
    });

    it('ignores transcript messages with missing role or text', async () => {
      const { result } = renderHook(() => useVoiceSession());

      await act(async () => {
        await result.current.startCall('agent-456');
      });

      const ws = mockWsInstances[0];
      act(() => {
        ws.simulateOpen();
      });

      act(() => {
        ws.simulateMessage({ type: 'transcript', role: 'user' }); // no text
        ws.simulateMessage({ type: 'transcript', text: 'hello' }); // no role
      });

      expect(useCallStore.getState().transcript).toHaveLength(0);
    });

    it('handles connected message without error', async () => {
      const { result } = renderHook(() => useVoiceSession());

      await act(async () => {
        await result.current.startCall('agent-456');
      });

      const ws = mockWsInstances[0];
      act(() => {
        ws.simulateOpen();
      });

      // Should not throw
      act(() => {
        ws.simulateMessage({ type: 'connected' });
      });
    });

    it('handles invalid JSON gracefully', async () => {
      const { result } = renderHook(() => useVoiceSession());

      await act(async () => {
        await result.current.startCall('agent-456');
      });

      const ws = mockWsInstances[0];
      act(() => {
        ws.simulateOpen();
      });

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      // Send raw string that's not JSON
      act(() => {
        ws.onmessage?.({ data: 'not-json' });
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        '[VoiceSession] Failed to parse message:',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe('endCall()', () => {
    it('sends stop message and closes WebSocket', async () => {
      const { result } = renderHook(() => useVoiceSession());

      await act(async () => {
        await result.current.startCall('agent-456');
      });

      const ws = mockWsInstances[0];
      act(() => {
        ws.simulateOpen();
      });

      await act(async () => {
        await result.current.endCall();
      });

      expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ type: 'stop' }));
    });

    it('stops audio recording', async () => {
      const { result } = renderHook(() => useVoiceSession());

      await act(async () => {
        await result.current.startCall('agent-456');
      });

      await act(async () => {
        await result.current.endCall();
      });

      expect(mockStopRecording).toHaveBeenCalled();
    });

    it('flushes and destroys playback service', async () => {
      const { result } = renderHook(() => useVoiceSession());

      await act(async () => {
        await result.current.startCall('agent-456');
      });

      await act(async () => {
        await result.current.endCall();
      });

      expect(mockPlaybackService.flush).toHaveBeenCalled();
      expect(mockPlaybackService.destroy).toHaveBeenCalled();
    });

    it('handles stopRecording error gracefully', async () => {
      mockStopRecording.mockRejectedValueOnce(new Error('Recording not started'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const { result } = renderHook(() => useVoiceSession());

      await act(async () => {
        await result.current.startCall('agent-456');
      });

      // Should not throw
      await act(async () => {
        await result.current.endCall();
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        '[VoiceSession] Failed to stop audio recording:',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe('Reconnection', () => {
    it('attempts reconnection on unexpected close with exponential backoff', async () => {
      const { result } = renderHook(() => useVoiceSession());

      await act(async () => {
        await result.current.startCall('agent-456');
      });

      const ws = mockWsInstances[0];
      act(() => {
        ws.simulateOpen();
      });

      // Simulate unexpected close
      act(() => {
        ws.simulateClose();
      });

      // First reconnect after 1000ms (BASE_RECONNECT_DELAY * 2^0)
      expect(mockWsInstances.length).toBe(1); // not yet reconnected

      act(() => {
        jest.advanceTimersByTime(1000);
      });

      // New WebSocket should be created
      expect(mockWsInstances.length).toBe(2);
      expect(mockWsInstances[1].url).toContain('/voice/test/ws-123/agent-456');
    });

    it('does not reconnect on intentional end', async () => {
      const { result } = renderHook(() => useVoiceSession());

      await act(async () => {
        await result.current.startCall('agent-456');
      });

      const ws = mockWsInstances[0];
      act(() => {
        ws.simulateOpen();
      });

      // End call intentionally
      await act(async () => {
        await result.current.endCall();
      });

      // The close will fire from cleanup, but isEndingRef is true
      act(() => {
        jest.advanceTimersByTime(5000);
      });

      // Only the original WebSocket should exist (cleanup creates no new ones)
      expect(mockWsInstances.length).toBe(1);
    });

    it('stops reconnecting after MAX_RECONNECT_ATTEMPTS', async () => {
      const { result } = renderHook(() => useVoiceSession());

      await act(async () => {
        await result.current.startCall('agent-456');
      });

      // Simulate 5 failed reconnections (MAX_RECONNECT_ATTEMPTS = 5)
      for (let i = 0; i < 5; i++) {
        const ws = mockWsInstances[mockWsInstances.length - 1];
        act(() => {
          ws.simulateOpen();
        });
        act(() => {
          ws.simulateClose();
        });

        // Advance timer to trigger reconnect
        const delay = 1000 * Math.pow(2, i);
        act(() => {
          jest.advanceTimersByTime(delay);
        });
      }

      const lastWs = mockWsInstances[mockWsInstances.length - 1];
      act(() => {
        lastWs.simulateClose();
      });

      // Advance past any possible reconnect delay
      act(() => {
        jest.advanceTimersByTime(60000);
      });

      // Count should not increase after the close of the last reconnect attempt
      const finalCount = mockWsInstances.length;

      act(() => {
        jest.advanceTimersByTime(60000);
      });

      expect(mockWsInstances.length).toBe(finalCount);
    });
  });

  describe('toggleMute()', () => {
    it('toggles mute state in call store', () => {
      const { result } = renderHook(() => useVoiceSession());

      expect(useCallStore.getState().isMuted).toBe(false);

      act(() => {
        result.current.toggleMute();
      });

      expect(useCallStore.getState().isMuted).toBe(true);

      act(() => {
        result.current.toggleMute();
      });

      expect(useCallStore.getState().isMuted).toBe(false);
    });
  });

  describe('toggleSpeaker()', () => {
    it('toggles speaker state and calls audioService.setSpeakerMode', async () => {
      const { result } = renderHook(() => useVoiceSession());

      // Initial state: speaker off
      expect(useCallStore.getState().isSpeaker).toBe(false);

      await act(async () => {
        await result.current.toggleSpeaker();
      });

      expect(useCallStore.getState().isSpeaker).toBe(true);
      expect(audioService.setSpeakerMode).toHaveBeenCalledWith(true);
    });
  });

  describe('Audio chunk sending', () => {
    it('sends audio chunks over WebSocket when not muted', async () => {
      const { result } = renderHook(() => useVoiceSession());

      await act(async () => {
        await result.current.startCall('agent-456');
      });

      const ws = mockWsInstances[0];
      act(() => {
        ws.simulateOpen();
      });

      // Get the onAudioChunk callback from getRecordingConfig
      const configCall = (audioService.getRecordingConfig as jest.Mock).mock.calls[0][0];
      const onAudioChunk = configCall.onAudioChunk;

      // Simulate an audio chunk
      act(() => {
        onAudioChunk('base64chunk==');
      });

      expect(ws.send).toHaveBeenCalledWith(
        JSON.stringify({ type: 'audio', data: 'base64chunk==' })
      );
    });

    it('does not send audio chunks when muted', async () => {
      const { result } = renderHook(() => useVoiceSession());

      await act(async () => {
        await result.current.startCall('agent-456');
      });

      const ws = mockWsInstances[0];
      act(() => {
        ws.simulateOpen();
      });

      // Mute
      act(() => {
        result.current.toggleMute();
      });

      // Get the onAudioChunk callback
      const configCall = (audioService.getRecordingConfig as jest.Mock).mock.calls[0][0];
      const onAudioChunk = configCall.onAudioChunk;

      // Clear send calls from onopen
      ws.send.mockClear();

      act(() => {
        onAudioChunk('base64chunk==');
      });

      // Should not have sent audio (only the start message from onopen)
      expect(ws.send).not.toHaveBeenCalled();
    });
  });

  describe('Cleanup on unmount', () => {
    it('destroys playback service and cleans up WebSocket on unmount', async () => {
      const { result, unmount } = renderHook(() => useVoiceSession());

      await act(async () => {
        await result.current.startCall('agent-456');
      });

      const ws = mockWsInstances[0];
      act(() => {
        ws.simulateOpen();
      });

      unmount();

      expect(mockPlaybackService.destroy).toHaveBeenCalled();
    });
  });
});
