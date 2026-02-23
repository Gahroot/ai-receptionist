import { create } from 'zustand';
import type { TranscriptEntry } from '../lib/types';
import logger from '../lib/logger';

interface CallState {
  isInCall: boolean;
  callId: string | null;
  contactName: string | null;
  contactNumber: string | null;
  duration: number;
  isMuted: boolean;
  isSpeaker: boolean;
  isAiSpeaking: boolean;
  isUserSpeaking: boolean;
  transcript: TranscriptEntry[];
  incomingCallId: string | null;
  incomingCallerName: string | null;
  incomingCallerNumber: string | null;

  startCall: (opts: { callId?: string; contactName?: string; contactNumber?: string }) => void;
  endCall: () => void;
  toggleMute: () => void;
  toggleSpeaker: () => void;
  setAiSpeaking: (speaking: boolean) => void;
  setUserSpeaking: (speaking: boolean) => void;
  addTranscript: (entry: TranscriptEntry) => void;
  incrementDuration: () => void;
  setCallId: (id: string) => void;
  setIncomingCall: (callId: string, name: string, number: string) => void;
  clearIncomingCall: () => void;
}

export const useCallStore = create<CallState>()((set, get) => ({
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
  incomingCallId: null,
  incomingCallerName: null,
  incomingCallerNumber: null,

  startCall: ({ callId, contactName, contactNumber }) => {
    logger.stateChange('Call', 'startCall', { callId, contactName, contactNumber });
    return set({
      isInCall: true,
      callId: callId || null,
      contactName: contactName || null,
      contactNumber: contactNumber || null,
      duration: 0,
      isMuted: false,
      isSpeaker: false,
      isAiSpeaking: false,
      isUserSpeaking: false,
      transcript: [],
    });
  },

  endCall: () => {
    const duration = get().duration;
    logger.stateChange('Call', 'endCall', { duration });
    return set({
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
      incomingCallId: null,
      incomingCallerName: null,
      incomingCallerNumber: null,
    });
  },

  toggleMute: () => {
    const newIsMuted = !get().isMuted;
    set({ isMuted: newIsMuted });
    logger.stateChange('Call', 'toggleMute', { isMuted: newIsMuted });
  },
  toggleSpeaker: () => {
    const newIsSpeaker = !get().isSpeaker;
    set({ isSpeaker: newIsSpeaker });
    logger.stateChange('Call', 'toggleSpeaker', { isSpeaker: newIsSpeaker });
  },
  setAiSpeaking: (speaking) => {
    // Only log state changes, not every update
    const currentIsAiSpeaking = get().isAiSpeaking;
    if (currentIsAiSpeaking !== speaking) {
      logger.debug('AI speaking state changed', { isSpeaking: speaking }, 'CallStore');
    }
    return set({ isAiSpeaking: speaking });
  },
  setUserSpeaking: (speaking) => set({ isUserSpeaking: speaking }),
  addTranscript: (entry) => {
    logger.debug('Transcript entry added', { role: entry.role, textLength: entry.text.length }, 'CallStore');
    return set((state) => ({ transcript: [...state.transcript, entry] }));
  },
  incrementDuration: () => set((state) => ({ duration: state.duration + 1 })),
  setCallId: (id) => {
    logger.stateChange('Call', 'setCallId', { callId: id });
    return set({ callId: id });
  },

  setIncomingCall: (callId, name, number) => {
    logger.stateChange('Call', 'setIncomingCall', { callId, name, number });
    return set({ incomingCallId: callId, incomingCallerName: name, incomingCallerNumber: number });
  },

  clearIncomingCall: () => {
    return set({ incomingCallId: null, incomingCallerName: null, incomingCallerNumber: null });
  },
}));
