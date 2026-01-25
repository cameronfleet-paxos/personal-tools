'use client';

import { useEffect, useCallback, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { ScheduleItemRow } from '@/components/schedule-item';
import { SplashScreen } from '@/components/splash-screen';
import { useScheduleStore } from '@/lib/store';
import { scheduleNotifications, clearAllNotifications } from '@/lib/notifications';
import { timeToMinutes, getCurrentTimeMinutes, getTodayDate } from '@/lib/utils';
import { ScheduleItem } from '@/types/schedule';

// Extend window type for Electron API
declare global {
  interface Window {
    electronAPI?: {
      platform: string;
      isElectron: boolean;
      showNotification: (title: string, body: string) => Promise<boolean>;
    };
  }
}

export default function Home() {
  const [showSplash, setShowSplash] = useState(true);
  const {
    schedule,
    dailyLog,
    editingId,
    isLoading,
    toggleComplete,
    updateItemTime,
    setEditingId,
    loadData,
  } = useScheduleStore();

  // Load data on mount
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Find next upcoming item
  const getNextItemId = useCallback((): string | null => {
    const currentMinutes = getCurrentTimeMinutes();

    // Find incomplete items
    const incompleteItems = schedule.filter(
      item => !dailyLog.completedItems.some(c => c.itemId === item.id)
    );

    // Find the first item that hasn't started yet, or the most recent one that has
    for (const item of incompleteItems) {
      const itemMinutes = timeToMinutes(item.time);
      if (itemMinutes >= currentMinutes) {
        return item.id;
      }
    }

    // If all items are in the past, return the last incomplete one
    return incompleteItems.length > 0 ? incompleteItems[incompleteItems.length - 1].id : null;
  }, [schedule, dailyLog]);

  const nextItemId = getNextItemId();

  // Schedule notifications
  useEffect(() => {
    const handleNotification = async (item: ScheduleItem) => {
      const title = 'Otto Schedule';
      const body = `${item.activity} in 5 minutes`;

      // Try Electron notification first
      if (window.electronAPI?.showNotification) {
        await window.electronAPI.showNotification(title, body);
      } else if ('Notification' in window && Notification.permission === 'granted') {
        // Fallback to web notification
        new Notification(title, { body });
      }
    };

    scheduleNotifications(schedule, handleNotification);

    return () => {
      clearAllNotifications();
    };
  }, [schedule]);

  // Request notification permission for web
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // Calculate progress
  const completedCount = dailyLog.completedItems.length;
  const totalCount = schedule.length;
  const progressPercent = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  if (isLoading || showSplash) {
    return (
      <SplashScreen
        duration={2500}
        onComplete={() => setShowSplash(false)}
      />
    );
  }

  return (
    <div className="max-w-lg mx-auto">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Otto&apos;s Schedule</CardTitle>
          <CardDescription>{getTodayDate()}</CardDescription>
          <div className="mt-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span>{completedCount} of {totalCount} completed</span>
              <span>{Math.round(progressPercent)}%</span>
            </div>
            <Progress value={progressPercent} />
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {schedule.map((item) => (
            <ScheduleItemRow
              key={item.id}
              item={item}
              isCompleted={dailyLog.completedItems.some(c => c.itemId === item.id)}
              isNext={item.id === nextItemId}
              isEditing={editingId === item.id}
              onToggle={() => toggleComplete(item.id)}
              onEditStart={() => setEditingId(item.id)}
              onEditSave={(time, endTime) => {
                updateItemTime(item.id, time, endTime);
                setEditingId(null);
              }}
              onEditCancel={() => setEditingId(null)}
            />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
