/**
 * Integration tests for the useVoiceSession hook.
 *
 * Tests Grok Realtime WebSocket lifecycle, audio recording coordination,
 * playback service integration, and call store updates.
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
  protocols: string | string[];
  readyState: number = MockWebSocket.CONNECTING;
  onopen: ((event: any) => void) | null = null;
  onmessage: ((event: any) => void) | null = null;
  onerror: ((event: any) => void) | null = null;
  onclose: ((event: any) => void) | null = null;
  send = jest.fn();
  close = jest.fn(() => {
    this.readyState = MockWebSocket.CLOSED;
  });

  constructor(url: string, protocols?: string | string[]) {
    this.url = url;
    this.protocols = protocols || '';
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

// --- Mock api service (for ephemeral token request) ---
jest.mock('@/services/api', () => ({
  __esModule: true,
  default: {
    post: jest.fn(),
    get: jest.fn(),
  },
}));

// --- Mock audioService ---
jest.mock('@/services/audioService', () => ({
  __esModule: true,
  default: {
    setupAudioMode: jest.fn().mockResolvedValue(undefined),
    setSpeakerMode: jest.fn().mockResolvedValue(undefined),
    getRecordingConfig: jest.fn((callbacks: any) => ({
      sampleRate: 24000,
      channels: 1,
      encoding: 'pcm_16bit',
      interval: 250,
      _callbacks: callbacks, // Expose callbacks for testing
    })),
  },
  RECORDING_CONFIG: {
    sampleRate: 24000,
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

jest.mock('@siteed/expo-audio-studio', () => ({
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
import api from '@/services/api';

// Reference the mocked singleton so tests can assert on its methods
const mockPlaybackService = audioPlaybackService as jest.Mocked<typeof audioPlaybackService>;
const mockApi = api as jest.Mocked<typeof api>;

const MOCK_SESSION_RESPONSE = {
  data: {
    token: 'ephemeral-test-token-123',
    expires_at: Math.floor(Date.now() / 1000) + 300,
    agent: {
      instructions: 'You are a helpful receptionist.',
      voice: 'Ara',
      initial_greeting: 'Hello! How can I help you?',
      tools: [],
    },
  },
};

describe('useVoiceSession Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockWsInstances = [];

    // Mock the ephemeral token API call
    mockApi.post.mockResolvedValue(MOCK_SESSION_RESPONSE);

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
    it('requests ephemeral token from backend then connects to Grok', async () => {
      const { result } = renderHook(() => useVoiceSession());

      await act(async () => {
        await result.current.startCall('agent-456');
      });

      // Verify token request
      expect(mockApi.post).toHaveBeenCalledWith('/voice/session', {
        workspace_id: 'ws-123',
        agent_id: 'agent-456',
      });

      // Verify WebSocket connects to Grok
      expect(mockWsInstances.length).toBeGreaterThanOrEqual(1);
      const ws = mockWsInstances[0];
      expect(ws.url).toBe('wss://api.x.ai/v1/realtime');
    });

    it('passes ephemeral token via WebSocket protocols', async () => {
      const { result } = renderHook(() => useVoiceSession());

      await act(async () => {
        await result.current.startCall('agent-456');
      });

      const ws = mockWsInstances[0];
      expect(ws.protocols).toContain('openai-insecure-api-key.ephemeral-test-token-123');
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
    });

    it('starts audio recording with 24kHz config', async () => {
      const { result } = renderHook(() => useVoiceSession());

      await act(async () => {
        await result.current.startCall('agent-456');
      });

      expect(audioService.getRecordingConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          onAudioChunk: expect.any(Function),
        })
      );
      expect(mockStartRecording).toHaveBeenCalled();
    });
  });

  describe('WebSocket onopen', () => {
    it('sends session.update with agent config on connect', async () => {
      const { result } = renderHook(() => useVoiceSession());

      await act(async () => {
        await result.current.startCall('agent-456');
      });

      const ws = mockWsInstances[0];

      act(() => {
        ws.simulateOpen();
      });

      // First message should be session.update
      const firstCall = ws.send.mock.calls[0][0];
      const parsed = JSON.parse(firstCall);
      expect(parsed.type).toBe('session.update');
      expect(parsed.session.voice).toBe('Ara');
      expect(parsed.session.instructions).toBe('You are a helpful receptionist.');
      expect(parsed.session.input_audio_format).toBe('pcm16');
      expect(parsed.session.output_audio_format).toBe('pcm16');
      expect(parsed.session.turn_detection.type).toBe('server_vad');
    });

    it('sends initial greeting as conversation item', async () => {
      const { result } = renderHook(() => useVoiceSession());

      await act(async () => {
        await result.current.startCall('agent-456');
      });

      const ws = mockWsInstances[0];

      act(() => {
        ws.simulateOpen();
      });

      // Should have sent: session.update, conversation.item.create, response.create
      expect(ws.send).toHaveBeenCalledTimes(3);

      const greetingCall = JSON.parse(ws.send.mock.calls[1][0]);
      expect(greetingCall.type).toBe('conversation.item.create');

      const responseCreate = JSON.parse(ws.send.mock.calls[2][0]);
      expect(responseCreate.type).toBe('response.create');
    });
  });

  describe('WebSocket onmessage', () => {
    it('enqueues audio data on response.output_audio.delta', async () => {
      const { result } = renderHook(() => useVoiceSession());

      await act(async () => {
        await result.current.startCall('agent-456');
      });

      const ws = mockWsInstances[0];
      act(() => {
        ws.simulateOpen();
      });

      act(() => {
        ws.simulateMessage({ type: 'response.output_audio.delta', delta: 'base64audiochunk==' });
      });

      expect(mockPlaybackService.enqueue).toHaveBeenCalledWith('base64audiochunk==');
    });

    it('adds AI transcript on response.output_audio_transcript.done', async () => {
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
          type: 'response.output_audio_transcript.done',
          transcript: 'Hello, how can I help you?',
        });
      });

      const transcript = useCallStore.getState().transcript;
      expect(transcript).toHaveLength(1);
      expect(transcript[0]).toEqual({
        role: 'assistant',
        text: 'Hello, how can I help you?',
      });
    });

    it('adds user transcript on input_audio_transcription.completed', async () => {
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
          type: 'conversation.item.input_audio_transcription.completed',
          transcript: 'I need to book an appointment',
        });
      });

      const transcript = useCallStore.getState().transcript;
      expect(transcript).toHaveLength(1);
      expect(transcript[0]).toEqual({
        role: 'user',
        text: 'I need to book an appointment',
      });
    });

    it('updates user speaking state from server VAD events', async () => {
      const { result } = renderHook(() => useVoiceSession());

      await act(async () => {
        await result.current.startCall('agent-456');
      });

      const ws = mockWsInstances[0];
      act(() => {
        ws.simulateOpen();
      });

      act(() => {
        ws.simulateMessage({ type: 'input_audio_buffer.speech_started' });
      });
      expect(useCallStore.getState().isUserSpeaking).toBe(true);

      act(() => {
        ws.simulateMessage({ type: 'input_audio_buffer.speech_stopped' });
      });
      expect(useCallStore.getState().isUserSpeaking).toBe(false);
    });

    it('flushes playback on barge-in (speech_started while AI speaking)', async () => {
      const { result } = renderHook(() => useVoiceSession());

      await act(async () => {
        await result.current.startCall('agent-456');
      });

      const ws = mockWsInstances[0];
      act(() => {
        ws.simulateOpen();
      });

      // Set AI as speaking
      act(() => {
        useCallStore.getState().setAiSpeaking(true);
      });

      // User starts speaking (barge-in)
      act(() => {
        ws.simulateMessage({ type: 'input_audio_buffer.speech_started' });
      });

      expect(mockPlaybackService.flush).toHaveBeenCalled();
    });

    it('handles session.created without error', async () => {
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
        ws.simulateMessage({ type: 'session.created' });
      });
    });
  });

  describe('endCall()', () => {
    it('stops audio recording and cleans up', async () => {
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

      expect(useCallStore.getState().isSpeaker).toBe(false);

      await act(async () => {
        await result.current.toggleSpeaker();
      });

      expect(useCallStore.getState().isSpeaker).toBe(true);
      expect(audioService.setSpeakerMode).toHaveBeenCalledWith(true);
    });
  });

  describe('Audio chunk sending', () => {
    it('sends audio chunks to Grok using input_audio_buffer.append', async () => {
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

      // Clear send calls from onopen (session.update, greeting, etc.)
      ws.send.mockClear();

      // Simulate an audio chunk
      act(() => {
        onAudioChunk('base64chunk==');
      });

      expect(ws.send).toHaveBeenCalledWith(
        JSON.stringify({ type: 'input_audio_buffer.append', audio: 'base64chunk==' })
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
