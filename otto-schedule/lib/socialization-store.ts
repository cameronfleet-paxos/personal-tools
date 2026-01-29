'use client';

import { create } from 'zustand';
import { SocializationData, emptySocializationData } from '@/types/socialization';

interface SocializationState {
  socialization: SocializationData;
  isLoading: boolean;

  loadSocialization: () => Promise<void>;
  toggleItem: (categoryId: string, itemId: string, completed: boolean) => Promise<void>;
  updateItemNotes: (categoryId: string, itemId: string, notes: string) => Promise<void>;
  resetChecklist: () => Promise<void>;
}

export const useSocializationStore = create<SocializationState>((set, get) => ({
  socialization: emptySocializationData,
  isLoading: true,

  loadSocialization: async () => {
    try {
      const res = await fetch('/api/socialization');
      if (res.ok) {
        const data = await res.json();
        set({ socialization: data, isLoading: false });
      } else {
        set({ isLoading: false });
      }
    } catch (error) {
      console.error('Failed to load socialization:', error);
      set({ isLoading: false });
    }
  },

  toggleItem: async (categoryId: string, itemId: string, completed: boolean) => {
    // Optimistic update
    const currentData = get().socialization;
    const updatedCategories = currentData.categories.map(cat => {
      if (cat.id === categoryId) {
        return {
          ...cat,
          items: cat.items.map(item => {
            if (item.id === itemId) {
              return {
                ...item,
                completed,
                completedAt: completed ? new Date().toISOString() : undefined,
              };
            }
            return item;
          }),
        };
      }
      return cat;
    });

    set({
      socialization: {
        ...currentData,
        categories: updatedCategories,
        lastUpdated: new Date().toISOString(),
      },
    });

    try {
      const res = await fetch('/api/socialization', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categoryId, itemId, completed }),
      });

      if (res.ok) {
        const data = await res.json();
        set({ socialization: data.socialization });
      }
    } catch (error) {
      console.error('Failed to toggle item:', error);
      // Revert on error
      set({ socialization: currentData });
    }
  },

  updateItemNotes: async (categoryId: string, itemId: string, notes: string) => {
    try {
      const res = await fetch('/api/socialization', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categoryId, itemId, notes }),
      });

      if (res.ok) {
        const data = await res.json();
        set({ socialization: data.socialization });
      }
    } catch (error) {
      console.error('Failed to update notes:', error);
    }
  },

  resetChecklist: async () => {
    try {
      const res = await fetch('/api/socialization', {
        method: 'DELETE',
      });

      if (res.ok) {
        const data = await res.json();
        set({ socialization: data.socialization });
      }
    } catch (error) {
      console.error('Failed to reset checklist:', error);
    }
  },
}));
