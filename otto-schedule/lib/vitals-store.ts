'use client';

import { create } from 'zustand';
import { VitalsData, VitalMeasurement, emptyVitalsData } from '@/types/vitals';

interface VitalsState {
  vitals: VitalsData;
  isLoading: boolean;

  loadVitals: () => Promise<void>;
  addMeasurement: (measurement: Omit<VitalMeasurement, 'id' | 'recordedAt'>) => Promise<void>;
  updateMeasurement: (measurement: VitalMeasurement) => Promise<void>;
  deleteMeasurement: (id: string) => Promise<void>;
}

const generateId = (): string => {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
};

export const useVitalsStore = create<VitalsState>((set, get) => ({
  vitals: emptyVitalsData,
  isLoading: true,

  loadVitals: async () => {
    try {
      const res = await fetch('/api/vitals');
      if (res.ok) {
        const data = await res.json();
        set({ vitals: data, isLoading: false });
      } else {
        set({ isLoading: false });
      }
    } catch (error) {
      console.error('Failed to load vitals:', error);
      set({ isLoading: false });
    }
  },

  addMeasurement: async (measurementData) => {
    const measurement: VitalMeasurement = {
      ...measurementData,
      id: generateId(),
      recordedAt: new Date().toISOString(),
    };

    try {
      const res = await fetch('/api/vitals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(measurement),
      });

      if (res.ok) {
        const data = await res.json();
        set({ vitals: data.vitals });
      }
    } catch (error) {
      console.error('Failed to add measurement:', error);
    }
  },

  updateMeasurement: async (measurement) => {
    try {
      const res = await fetch('/api/vitals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(measurement),
      });

      if (res.ok) {
        const data = await res.json();
        set({ vitals: data.vitals });
      }
    } catch (error) {
      console.error('Failed to update measurement:', error);
    }
  },

  deleteMeasurement: async (id) => {
    try {
      const res = await fetch(`/api/vitals?id=${id}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        const data = await res.json();
        set({ vitals: data.vitals });
      }
    } catch (error) {
      console.error('Failed to delete measurement:', error);
    }
  },
}));
