import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../services/api';

interface VoicemailState {
  unreadCount: number;
  isLoading: boolean;

  fetchUnreadCount: (workspaceId: string) => Promise<void>;
  markAsRead: (workspaceId: string, callId: string) => Promise<void>;
  decrementUnread: () => void;
  setUnreadCount: (n: number) => void;
  reset: () => void;
}

export const useVoicemailStore = create<VoicemailState>()(
  persist(
    (set, get) => ({
      unreadCount: 0,
      isLoading: false,

      fetchUnreadCount: async (workspaceId) => {
        set({ isLoading: true });
        try {
          const response = await api.get<{ unread: number }>(
            `/workspaces/${workspaceId}/calls/voicemail/unread-count`
          );
          set({ unreadCount: response.data.unread, isLoading: false });
        } catch {
          set({ isLoading: false });
        }
      },

      markAsRead: async (workspaceId, callId) => {
        // Optimistic decrement
        const prev = get().unreadCount;
        if (prev > 0) {
          set({ unreadCount: prev - 1 });
        }

        try {
          await api.put(`/workspaces/${workspaceId}/calls/${callId}/read`);
        } catch {
          // Rollback on failure
          set({ unreadCount: prev });
        }
      },

      decrementUnread: () => {
        const current = get().unreadCount;
        if (current > 0) {
          set({ unreadCount: current - 1 });
        }
      },

      setUnreadCount: (n) => set({ unreadCount: n }),

      reset: () => set({ unreadCount: 0, isLoading: false }),
    }),
    {
      name: 'voicemail-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        unreadCount: state.unreadCount,
      }),
    }
  )
);
