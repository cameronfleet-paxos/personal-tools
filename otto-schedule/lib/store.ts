'use client';

import { create } from 'zustand';
import { ScheduleItem, DailyLog, defaultSchedule } from '@/types/schedule';
import { getTodayDate } from './utils';

interface ScheduleState {
  schedule: ScheduleItem[];
  dailyLog: DailyLog;
  editingId: string | null;
  isLoading: boolean;

  // Actions
  setSchedule: (schedule: ScheduleItem[]) => void;
  setDailyLog: (log: DailyLog) => void;
  toggleComplete: (itemId: string) => void;
  updateItemTime: (itemId: string, time: string, endTime?: string) => void;
  setEditingId: (id: string | null) => void;
  loadData: () => Promise<void>;
  saveSchedule: () => Promise<void>;
  saveLog: () => Promise<void>;
}

export const useScheduleStore = create<ScheduleState>((set, get) => ({
  schedule: defaultSchedule,
  dailyLog: {
    date: getTodayDate(),
    completedItems: [],
  },
  editingId: null,
  isLoading: true,

  setSchedule: (schedule) => set({ schedule }),

  setDailyLog: (dailyLog) => set({ dailyLog }),

  toggleComplete: (itemId) => {
    const { dailyLog, saveLog } = get();
    const isCompleted = dailyLog.completedItems.some(item => item.itemId === itemId);

    let newCompletedItems;
    if (isCompleted) {
      newCompletedItems = dailyLog.completedItems.filter(item => item.itemId !== itemId);
    } else {
      newCompletedItems = [
        ...dailyLog.completedItems,
        { itemId, completedAt: new Date().toISOString() }
      ];
    }

    set({
      dailyLog: {
        ...dailyLog,
        completedItems: newCompletedItems,
      }
    });

    // Persist to server
    saveLog();
  },

  updateItemTime: (itemId, time, endTime) => {
    const { schedule, saveSchedule } = get();
    const newSchedule = schedule.map(item => {
      if (item.id === itemId) {
        return {
          ...item,
          time,
          endTime: endTime || item.endTime,
        };
      }
      return item;
    });

    set({ schedule: newSchedule });
    saveSchedule();
  },

  setEditingId: (id) => set({ editingId: id }),

  loadData: async () => {
    try {
      const [scheduleRes, logRes] = await Promise.all([
        fetch('/api/schedule'),
        fetch('/api/log'),
      ]);

      if (scheduleRes.ok) {
        const scheduleData = await scheduleRes.json();
        set({ schedule: scheduleData });
      }

      if (logRes.ok) {
        const logData = await logRes.json();
        // Check if log is for today, otherwise reset
        const today = getTodayDate();
        if (logData.date === today) {
          set({ dailyLog: logData });
        } else {
          // New day, reset the log
          set({
            dailyLog: {
              date: today,
              completedItems: [],
            }
          });
        }
      }
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      set({ isLoading: false });
    }
  },

  saveSchedule: async () => {
    const { schedule } = get();
    try {
      await fetch('/api/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(schedule),
      });
    } catch (error) {
      console.error('Failed to save schedule:', error);
    }
  },

  saveLog: async () => {
    const { dailyLog } = get();
    try {
      await fetch('/api/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dailyLog),
      });
    } catch (error) {
      console.error('Failed to save log:', error);
    }
  },
}));
