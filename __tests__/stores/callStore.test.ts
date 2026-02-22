import { useCallStore } from '@/stores/callStore';
import type { TranscriptEntry } from '@/lib/types';

describe('callStore', () => {
  beforeEach(() => {
    // Reset store to initial state between tests
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

  // --- Initial state ---

  test('has correct initial state values', () => {
    const state = useCallStore.getState();
    expect(state.isInCall).toBe(false);
    expect(state.callId).toBeNull();
    expect(state.contactName).toBeNull();
    expect(state.contactNumber).toBeNull();
    expect(state.duration).toBe(0);
    expect(state.isMuted).toBe(false);
    expect(state.isSpeaker).toBe(false);
    expect(state.isAiSpeaking).toBe(false);
    expect(state.isUserSpeaking).toBe(false);
    expect(state.transcript).toEqual([]);
  });

  // --- startCall ---

  test('startCall sets isInCall, callId, contactName, contactNumber', () => {
    useCallStore.getState().startCall({
      callId: 'call-123',
      contactName: 'John Doe',
      contactNumber: '+15551234567',
    });

    const state = useCallStore.getState();
    expect(state.isInCall).toBe(true);
    expect(state.callId).toBe('call-123');
    expect(state.contactName).toBe('John Doe');
    expect(state.contactNumber).toBe('+15551234567');
  });

  test('startCall resets duration, mute, speaker, speaking states, and transcript', () => {
    // Dirty the state first
    useCallStore.setState({
      duration: 120,
      isMuted: true,
      isSpeaker: true,
      isAiSpeaking: true,
      isUserSpeaking: true,
      transcript: [{ role: 'user', text: 'old' }],
    });

    useCallStore.getState().startCall({ callId: 'call-new' });

    const state = useCallStore.getState();
    expect(state.duration).toBe(0);
    expect(state.isMuted).toBe(false);
    expect(state.isSpeaker).toBe(false);
    expect(state.isAiSpeaking).toBe(false);
    expect(state.isUserSpeaking).toBe(false);
    expect(state.transcript).toEqual([]);
  });

  test('startCall with missing optional params sets them to null', () => {
    useCallStore.getState().startCall({});

    const state = useCallStore.getState();
    expect(state.isInCall).toBe(true);
    expect(state.callId).toBeNull();
    expect(state.contactName).toBeNull();
    expect(state.contactNumber).toBeNull();
  });

  // --- endCall ---

  test('endCall resets ALL state back to defaults', () => {
    // Set up a fully active call
    useCallStore.getState().startCall({
      callId: 'call-456',
      contactName: 'Jane',
      contactNumber: '+15559999999',
    });
    useCallStore.getState().toggleMute();
    useCallStore.getState().toggleSpeaker();
    useCallStore.getState().setAiSpeaking(true);
    useCallStore.getState().setUserSpeaking(true);
    useCallStore.getState().addTranscript({ role: 'user', text: 'hello' });
    useCallStore.getState().incrementDuration();

    // End the call
    useCallStore.getState().endCall();

    const state = useCallStore.getState();
    expect(state.isInCall).toBe(false);
    expect(state.callId).toBeNull();
    expect(state.contactName).toBeNull();
    expect(state.contactNumber).toBeNull();
    expect(state.duration).toBe(0);
    expect(state.isMuted).toBe(false);
    expect(state.isSpeaker).toBe(false);
    expect(state.isAiSpeaking).toBe(false);
    expect(state.isUserSpeaking).toBe(false);
    expect(state.transcript).toEqual([]);
  });

  test('endCall resets transcript array', () => {
    useCallStore.getState().addTranscript({ role: 'user', text: 'hi' });
    useCallStore.getState().addTranscript({ role: 'assistant', text: 'hello' });
    expect(useCallStore.getState().transcript).toHaveLength(2);

    useCallStore.getState().endCall();
    expect(useCallStore.getState().transcript).toEqual([]);
  });

  // --- toggleMute ---

  test('toggleMute toggles isMuted from false to true', () => {
    expect(useCallStore.getState().isMuted).toBe(false);
    useCallStore.getState().toggleMute();
    expect(useCallStore.getState().isMuted).toBe(true);
  });

  test('toggleMute toggles isMuted from true to false', () => {
    useCallStore.setState({ isMuted: true });
    useCallStore.getState().toggleMute();
    expect(useCallStore.getState().isMuted).toBe(false);
  });

  test('toggleMute can be called multiple times', () => {
    useCallStore.getState().toggleMute();
    useCallStore.getState().toggleMute();
    useCallStore.getState().toggleMute();
    expect(useCallStore.getState().isMuted).toBe(true);
  });

  // --- toggleSpeaker ---

  test('toggleSpeaker toggles isSpeaker from false to true', () => {
    expect(useCallStore.getState().isSpeaker).toBe(false);
    useCallStore.getState().toggleSpeaker();
    expect(useCallStore.getState().isSpeaker).toBe(true);
  });

  test('toggleSpeaker toggles isSpeaker from true to false', () => {
    useCallStore.setState({ isSpeaker: true });
    useCallStore.getState().toggleSpeaker();
    expect(useCallStore.getState().isSpeaker).toBe(false);
  });

  // --- setAiSpeaking ---

  test('setAiSpeaking(true) sets isAiSpeaking to true', () => {
    useCallStore.getState().setAiSpeaking(true);
    expect(useCallStore.getState().isAiSpeaking).toBe(true);
  });

  test('setAiSpeaking(false) sets isAiSpeaking to false', () => {
    useCallStore.setState({ isAiSpeaking: true });
    useCallStore.getState().setAiSpeaking(false);
    expect(useCallStore.getState().isAiSpeaking).toBe(false);
  });

  // --- setUserSpeaking ---

  test('setUserSpeaking(true) sets isUserSpeaking to true', () => {
    useCallStore.getState().setUserSpeaking(true);
    expect(useCallStore.getState().isUserSpeaking).toBe(true);
  });

  test('setUserSpeaking(false) sets isUserSpeaking to false', () => {
    useCallStore.setState({ isUserSpeaking: true });
    useCallStore.getState().setUserSpeaking(false);
    expect(useCallStore.getState().isUserSpeaking).toBe(false);
  });

  // --- addTranscript ---

  test('addTranscript appends a single entry', () => {
    const entry: TranscriptEntry = { role: 'user', text: 'Hello' };
    useCallStore.getState().addTranscript(entry);

    const transcript = useCallStore.getState().transcript;
    expect(transcript).toHaveLength(1);
    expect(transcript[0]).toEqual(entry);
  });

  test('addTranscript maintains order with multiple entries', () => {
    const entry1: TranscriptEntry = { role: 'user', text: 'Hello' };
    const entry2: TranscriptEntry = { role: 'assistant', text: 'Hi there!' };
    const entry3: TranscriptEntry = { role: 'user', text: 'How are you?' };

    useCallStore.getState().addTranscript(entry1);
    useCallStore.getState().addTranscript(entry2);
    useCallStore.getState().addTranscript(entry3);

    const transcript = useCallStore.getState().transcript;
    expect(transcript).toHaveLength(3);
    expect(transcript[0]).toEqual(entry1);
    expect(transcript[1]).toEqual(entry2);
    expect(transcript[2]).toEqual(entry3);
  });

  test('addTranscript accumulates entries without losing previous ones', () => {
    for (let i = 0; i < 5; i++) {
      useCallStore.getState().addTranscript({
        role: i % 2 === 0 ? 'user' : 'assistant',
        text: `Message ${i}`,
      });
    }
    expect(useCallStore.getState().transcript).toHaveLength(5);
  });

  // --- incrementDuration ---

  test('incrementDuration increments by 1 each call', () => {
    expect(useCallStore.getState().duration).toBe(0);
    useCallStore.getState().incrementDuration();
    expect(useCallStore.getState().duration).toBe(1);
    useCallStore.getState().incrementDuration();
    expect(useCallStore.getState().duration).toBe(2);
    useCallStore.getState().incrementDuration();
    expect(useCallStore.getState().duration).toBe(3);
  });

  // --- setCallId ---

  test('setCallId updates callId', () => {
    useCallStore.getState().setCallId('new-call-id');
    expect(useCallStore.getState().callId).toBe('new-call-id');
  });

  test('setCallId can overwrite an existing callId', () => {
    useCallStore.getState().setCallId('first-id');
    expect(useCallStore.getState().callId).toBe('first-id');

    useCallStore.getState().setCallId('second-id');
    expect(useCallStore.getState().callId).toBe('second-id');
  });

  // --- Full lifecycle test ---

  test('start call, add data, end call results in clean state', () => {
    // Start a call
    useCallStore.getState().startCall({
      callId: 'lifecycle-call',
      contactName: 'Alice',
      contactNumber: '+15550001111',
    });

    // Add various data during the call
    useCallStore.getState().toggleMute();
    useCallStore.getState().toggleSpeaker();
    useCallStore.getState().setAiSpeaking(true);
    useCallStore.getState().setUserSpeaking(true);
    useCallStore.getState().addTranscript({ role: 'user', text: 'Test 1' });
    useCallStore.getState().addTranscript({ role: 'assistant', text: 'Test 2' });
    useCallStore.getState().incrementDuration();
    useCallStore.getState().incrementDuration();
    useCallStore.getState().incrementDuration();

    // Verify data was set
    expect(useCallStore.getState().isInCall).toBe(true);
    expect(useCallStore.getState().transcript).toHaveLength(2);
    expect(useCallStore.getState().duration).toBe(3);

    // End the call
    useCallStore.getState().endCall();

    // Verify everything is clean
    const state = useCallStore.getState();
    expect(state.isInCall).toBe(false);
    expect(state.callId).toBeNull();
    expect(state.contactName).toBeNull();
    expect(state.contactNumber).toBeNull();
    expect(state.duration).toBe(0);
    expect(state.isMuted).toBe(false);
    expect(state.isSpeaker).toBe(false);
    expect(state.isAiSpeaking).toBe(false);
    expect(state.isUserSpeaking).toBe(false);
    expect(state.transcript).toEqual([]);
  });
});
