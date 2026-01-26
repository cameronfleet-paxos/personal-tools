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
  isEditMode: boolean; // edit mode for modifying schedule

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
  setEditMode: (editing: boolean) => void;
  addItem: (item: Omit<ScheduleItem, 'id'>) => void;
  removeItem: (itemId: string) => void;
  updateItem: (itemId: string, updates: Partial<ScheduleItem>) => void;
  reorderItems: (activeId: string, overId: string) => void;
}

// Helper to sort schedule items by time
const sortByTime = (items: ScheduleItem[]): ScheduleItem[] => {
  return [...items].sort((a, b) => {
    const [aHours, aMinutes] = a.time.split(':').map(Number);
    const [bHours, bMinutes] = b.time.split(':').map(Number);
    return (aHours * 60 + aMinutes) - (bHours * 60 + bMinutes);
  });
};

// Generate unique ID
const generateId = (): string => {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
};

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
  isEditMode: false,

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

  setEditMode: (editing: boolean) => {
    set({ isEditMode: editing, editingId: null });
  },

  addItem: (item: Omit<ScheduleItem, 'id'>) => {
    const { schedule, saveSchedule } = get();
    const newItem: ScheduleItem = {
      ...item,
      id: generateId(),
    };
    const newSchedule = sortByTime([...schedule, newItem]);
    set({ schedule: newSchedule });
    saveSchedule();
  },

  removeItem: (itemId: string) => {
    const { schedule, dailyLog, saveSchedule, saveLog } = get();
    const newSchedule = schedule.filter(item => item.id !== itemId);
    // Also remove any completion data for this item
    const newCompletedItems = dailyLog.completedItems.filter(c => c.itemId !== itemId);
    set({
      schedule: newSchedule,
      dailyLog: {
        ...dailyLog,
        completedItems: newCompletedItems,
      },
    });
    saveSchedule();
    if (newCompletedItems.length !== dailyLog.completedItems.length) {
      saveLog();
    }
  },

  updateItem: (itemId: string, updates: Partial<ScheduleItem>) => {
    const { schedule, saveSchedule } = get();
    const newSchedule = schedule.map(item => {
      if (item.id === itemId) {
        return { ...item, ...updates };
      }
      return item;
    });
    // Re-sort if time was updated
    const sortedSchedule = updates.time ? sortByTime(newSchedule) : newSchedule;
    set({ schedule: sortedSchedule });
    saveSchedule();
  },

  reorderItems: (activeId: string, overId: string) => {
    const { schedule, saveSchedule } = get();
    const oldIndex = schedule.findIndex(item => item.id === activeId);
    const newIndex = schedule.findIndex(item => item.id === overId);

    if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) {
      return;
    }

    const newSchedule = [...schedule];
    const [movedItem] = newSchedule.splice(oldIndex, 1);
    newSchedule.splice(newIndex, 0, movedItem);

    set({ schedule: newSchedule });
    saveSchedule();
  },
}));
