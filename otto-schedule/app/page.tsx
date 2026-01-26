'use client';

import { useEffect, useCallback, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { ScheduleItemRow } from '@/components/schedule-item';
import { SplashScreen } from '@/components/splash-screen';
import { CompletionDialog } from '@/components/completion-dialog';
import { HistoryMenu } from '@/components/history-menu';
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
    pendingCompletion,
    viewingDate,
    toggleComplete,
    confirmCompletion,
    cancelCompletion,
    updateItemTime,
    setEditingId,
    loadData,
  } = useScheduleStore();

  // Determine if we're viewing historical data (read-only mode)
  const isHistorical = viewingDate !== null;

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

  // Get the pending item for the completion dialog
  const pendingItem = pendingCompletion
    ? schedule.find(item => item.id === pendingCompletion.itemId)
    : undefined;

  return (
    <div className="max-w-lg mx-auto">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-2xl">Otto&apos;s Schedule</CardTitle>
              <CardDescription>
                {isHistorical ? (
                  <span className="text-amber-600 dark:text-amber-400">
                    Viewing: {new Date(viewingDate + 'T00:00:00').toLocaleDateString('en-US', {
                      weekday: 'long',
                      month: 'long',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </span>
                ) : (
                  getTodayDate()
                )}
              </CardDescription>
            </div>
            <HistoryMenu />
          </div>
          {isHistorical && (
            <div className="mt-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950 px-2 py-1 rounded">
              Read-only: Viewing historical data
            </div>
          )}
          <div className="mt-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span>{completedCount} of {totalCount} completed</span>
              <span>{Math.round(progressPercent)}%</span>
            </div>
            <Progress value={progressPercent} />
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {schedule.map((item) => {
            const completedItem = dailyLog.completedItems.find(c => c.itemId === item.id);
            return (
              <ScheduleItemRow
                key={item.id}
                item={item}
                isCompleted={!!completedItem}
                completionData={completedItem}
                isNext={!isHistorical && item.id === nextItemId}
                isEditing={!isHistorical && editingId === item.id}
                disabled={isHistorical}
                onToggle={() => !isHistorical && toggleComplete(item.id)}
                onEditStart={() => !isHistorical && setEditingId(item.id)}
                onEditSave={(time, endTime) => {
                  if (!isHistorical) {
                    updateItemTime(item.id, time, endTime);
                    setEditingId(null);
                  }
                }}
                onEditCancel={() => setEditingId(null)}
              />
            );
          })}
        </CardContent>
      </Card>

      <CompletionDialog
        open={!!pendingCompletion}
        item={pendingItem}
        onConfirm={(actualTime, notes) => {
          if (pendingCompletion) {
            confirmCompletion(pendingCompletion.itemId, actualTime, notes);
          }
        }}
        onCancel={cancelCompletion}
      />
    </div>
  );
}
