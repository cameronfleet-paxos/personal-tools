// Placeholder store for settings UI
// This is a minimal implementation since we're using Electron IPC

import { create } from 'zustand';

interface SettingsStore {
  isLoading: boolean;
  effectiveUser: any;
}

export const useSettingsStore = create<SettingsStore>(() => ({
  isLoading: false,
  effectiveUser: null,
}));
