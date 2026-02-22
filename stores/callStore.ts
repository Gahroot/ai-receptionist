import { create } from 'zustand';
import type { TranscriptEntry } from '../lib/types';

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

  startCall: (opts: { callId?: string; contactName?: string; contactNumber?: string }) => void;
  endCall: () => void;
  toggleMute: () => void;
  toggleSpeaker: () => void;
  setAiSpeaking: (speaking: boolean) => void;
  setUserSpeaking: (speaking: boolean) => void;
  addTranscript: (entry: TranscriptEntry) => void;
  incrementDuration: () => void;
  setCallId: (id: string) => void;
}

export const useCallStore = create<CallState>()((set) => ({
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

  startCall: ({ callId, contactName, contactNumber }) =>
    set({
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
    }),

  endCall: () =>
    set({
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
    }),

  toggleMute: () => set((state) => ({ isMuted: !state.isMuted })),
  toggleSpeaker: () => set((state) => ({ isSpeaker: !state.isSpeaker })),
  setAiSpeaking: (speaking) => set({ isAiSpeaking: speaking }),
  setUserSpeaking: (speaking) => set({ isUserSpeaking: speaking }),
  addTranscript: (entry) => set((state) => ({ transcript: [...state.transcript, entry] })),
  incrementDuration: () => set((state) => ({ duration: state.duration + 1 })),
  setCallId: (id) => set({ callId: id }),
}));
