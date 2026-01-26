'use client';

import { create } from 'zustand';
import { ScheduleItem, DailyLog, defaultSchedule } from '@/types/schedule';
import { getTodayDate } from './utils';

interface PendingCompletion {
  itemId: string;
}

interface ScheduleState {
  schedule: ScheduleItem[];
  dailyLog: DailyLog;
  editingId: string | null;
  isLoading: boolean;
  pendingCompletion: PendingCompletion | null;
  viewingDate: string | null; // null means "today", otherwise ISO date string
  availableDates: string[]; // list of dates with logs

  // Actions
  setSchedule: (schedule: ScheduleItem[]) => void;
  setDailyLog: (log: DailyLog) => void;
  toggleComplete: (itemId: string) => void;
  startCompletion: (itemId: string) => void;
  confirmCompletion: (itemId: string, actualTime: string, notes?: string) => void;
  cancelCompletion: () => void;
  updateItemTime: (itemId: string, time: string, endTime?: string) => void;
  setEditingId: (id: string | null) => void;
  loadData: () => Promise<void>;
  saveSchedule: () => Promise<void>;
  saveLog: () => Promise<void>;
  loadAvailableDates: () => Promise<void>;
  viewDate: (date: string | null) => Promise<void>;
}

export const useScheduleStore = create<ScheduleState>((set, get) => ({
  schedule: defaultSchedule,
  dailyLog: {
    date: getTodayDate(),
    completedItems: [],
  },
  editingId: null,
  isLoading: true,
  pendingCompletion: null,
  viewingDate: null,
  availableDates: [],

  setSchedule: (schedule) => set({ schedule }),

  setDailyLog: (dailyLog) => set({ dailyLog }),

  toggleComplete: (itemId) => {
    const { dailyLog, saveLog, startCompletion } = get();
    const isCompleted = dailyLog.completedItems.some(item => item.itemId === itemId);

    if (isCompleted) {
      // Unchecking - remove directly without dialog
      const newCompletedItems = dailyLog.completedItems.filter(item => item.itemId !== itemId);
      set({
        dailyLog: {
          ...dailyLog,
          completedItems: newCompletedItems,
        }
      });
      saveLog();
    } else {
      // Checking - open completion dialog
      startCompletion(itemId);
    }
  },

  startCompletion: (itemId) => {
    set({ pendingCompletion: { itemId } });
  },

  confirmCompletion: (itemId, actualTime, notes) => {
    const { dailyLog, saveLog } = get();
    const newCompletedItems = [
      ...dailyLog.completedItems,
      {
        itemId,
        completedAt: new Date().toISOString(),
        actualTime,
        notes: notes || undefined,
      }
    ];

    set({
      dailyLog: {
        ...dailyLog,
        completedItems: newCompletedItems,
      },
      pendingCompletion: null,
    });

    saveLog();
  },

  cancelCompletion: () => {
    set({ pendingCompletion: null });
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
    const { loadAvailableDates } = get();
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

      // Load available dates for history menu
      loadAvailableDates();
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

  loadAvailableDates: async () => {
    try {
      const res = await fetch('/api/logs');
      if (res.ok) {
        const data = await res.json();
        set({ availableDates: data.dates || [] });
      }
    } catch (error) {
      console.error('Failed to load available dates:', error);
    }
  },

  viewDate: async (date: string | null) => {
    const { loadAvailableDates } = get();

    if (date === null) {
      // Return to today
      try {
        const logRes = await fetch('/api/log');
        if (logRes.ok) {
          const logData = await logRes.json();
          const today = getTodayDate();
          if (logData.date === today) {
            set({ dailyLog: logData, viewingDate: null });
          } else {
            set({
              dailyLog: { date: today, completedItems: [] },
              viewingDate: null,
            });
          }
        }
      } catch (error) {
        console.error('Failed to load today\'s log:', error);
        set({ viewingDate: null });
      }
    } else {
      // Load historical date
      try {
        const logRes = await fetch(`/api/log?date=${date}`);
        if (logRes.ok) {
          const logData = await logRes.json();
          set({ dailyLog: logData, viewingDate: date });
        } else {
          // No log for that date
          set({
            dailyLog: { date, completedItems: [] },
            viewingDate: date,
          });
        }
      } catch (error) {
        console.error('Failed to load historical log:', error);
      }
    }

    // Refresh available dates
    loadAvailableDates();
  },
}));
