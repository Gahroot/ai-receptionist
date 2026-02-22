import { create } from 'zustand';
import api from '../services/api';
import type { DailyRecap } from '../lib/types';

interface RecapState {
  currentRecap: DailyRecap | null;
  isLoading: boolean;
  error: string | null;
  selectedDate: string;

  fetchRecap: (workspaceId: string, date: string) => Promise<void>;
  generateRecap: (workspaceId: string) => Promise<void>;
  setSelectedDate: (date: string) => void;
  reset: () => void;
}

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

export const useRecapStore = create<RecapState>()((set, get) => ({
  currentRecap: null,
  isLoading: false,
  error: null,
  selectedDate: formatDate(new Date()),

  fetchRecap: async (workspaceId, date) => {
    set({ isLoading: true, error: null });
    try {
      const res = await api.get<DailyRecap>(
        `/workspaces/${workspaceId}/daily-recap?date=${date}`
      );
      set({ currentRecap: res.data, isLoading: false });
    } catch (err: any) {
      if (err?.response?.status === 404) {
        set({ currentRecap: null, isLoading: false });
      } else {
        set({
          error: err?.response?.data?.detail || 'Failed to load recap',
          isLoading: false,
        });
      }
    }
  },

  generateRecap: async (workspaceId) => {
    set({ isLoading: true, error: null });
    try {
      await api.post(`/workspaces/${workspaceId}/daily-recap/generate`);
      const date = get().selectedDate;
      const res = await api.get<DailyRecap>(
        `/workspaces/${workspaceId}/daily-recap?date=${date}`
      );
      set({ currentRecap: res.data, isLoading: false });
    } catch (err: any) {
      set({
        error: err?.response?.data?.detail || 'Failed to generate recap',
        isLoading: false,
      });
    }
  },

  setSelectedDate: (date) => set({ selectedDate: date }),

  reset: () =>
    set({
      currentRecap: null,
      isLoading: false,
      error: null,
      selectedDate: formatDate(new Date()),
    }),
}));
