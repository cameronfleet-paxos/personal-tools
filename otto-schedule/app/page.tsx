'use client';

import { useEffect, useCallback, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { ScheduleItemRow } from '@/components/schedule-item';
import { SplashScreen } from '@/components/splash-screen';
import { CompletionDialog } from '@/components/completion-dialog';
import { ScheduleEditorDialog } from '@/components/schedule-editor-dialog';
import { HistoryMenu } from '@/components/history-menu';
import { useScheduleStore } from '@/lib/store';
import { scheduleNotifications, clearAllNotifications } from '@/lib/notifications';
import { timeToMinutes, getCurrentTimeMinutes, getTodayDate } from '@/lib/utils';
import { ScheduleItem } from '@/types/schedule';
import { Plus, Copy, Check } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';

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
  const [editorDialogOpen, setEditorDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ScheduleItem | undefined>(undefined);
  const [copied, setCopied] = useState(false);
  const {
    schedule,
    dailyLog,
    editingId,
    isLoading,
    pendingCompletion,
    viewingDate,
    isEditMode,
    toggleComplete,
    confirmCompletion,
    cancelCompletion,
    updateItemTime,
    setEditingId,
    loadData,
    addItem,
    updateItem,
    removeItem,
    reorderItems,
  } = useScheduleStore();

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      reorderItems(active.id as string, over.id as string);
    }
  };

  // Determine if we're viewing historical data (read-only mode)
  const isHistorical = viewingDate !== null;

  // Handlers for schedule editing
  const handleAddNewItem = () => {
    setEditingItem(undefined);
    setEditorDialogOpen(true);
  };

  const handleEditItem = (item: ScheduleItem) => {
    setEditingItem(item);
    setEditorDialogOpen(true);
  };

  const handleSaveItem = (data: Omit<ScheduleItem, 'id'>) => {
    if (editingItem) {
      updateItem(editingItem.id, data);
    } else {
      addItem(data);
    }
    setEditorDialogOpen(false);
    setEditingItem(undefined);
  };

  const handleCancelEditor = () => {
    setEditorDialogOpen(false);
    setEditingItem(undefined);
  };

  // Copy current day's schedule data as JSON
  const handleCopyDayJson = async () => {
    const currentDate = viewingDate || getTodayDate();
    const dayData = {
      date: currentDate,
      schedule: schedule,
      completedItems: dailyLog.completedItems,
    };

    try {
      await navigator.clipboard.writeText(JSON.stringify(dayData, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

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
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground"
                onClick={handleCopyDayJson}
                title="Copy day data as JSON"
              >
                {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
              </Button>
              <HistoryMenu onAddItem={handleAddNewItem} />
            </div>
          </div>
          {isHistorical && (
            <div className="mt-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950 px-2 py-1 rounded">
              Read-only: Viewing historical data
            </div>
          )}
          {isEditMode && (
            <div className="mt-2 text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950 px-2 py-1 rounded">
              Edit mode: Drag to reorder, tap to edit, X to delete
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
          {isEditMode ? (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={schedule.map(item => item.id)}
                strategy={verticalListSortingStrategy}
              >
                {schedule.map((item) => {
                  const completedItem = dailyLog.completedItems.find(c => c.itemId === item.id);
                  return (
                    <ScheduleItemRow
                      key={item.id}
                      item={item}
                      isCompleted={!!completedItem}
                      completionData={completedItem}
                      isNext={false}
                      isEditing={false}
                      disabled={true}
                      isEditMode={true}
                      onToggle={() => {}}
                      onEditStart={() => {}}
                      onEditSave={() => {}}
                      onEditCancel={() => {}}
                      onEditItem={() => handleEditItem(item)}
                      onDeleteItem={() => removeItem(item.id)}
                    />
                  );
                })}
              </SortableContext>
            </DndContext>
          ) : (
            schedule.map((item) => {
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
                  isEditMode={false}
                  onToggle={() => !isHistorical && toggleComplete(item.id)}
                  onEditStart={() => !isHistorical && setEditingId(item.id)}
                  onEditSave={(time, endTime) => {
                    if (!isHistorical) {
                      updateItemTime(item.id, time, endTime);
                      setEditingId(null);
                    }
                  }}
                  onEditCancel={() => setEditingId(null)}
                  onEditItem={() => handleEditItem(item)}
                  onDeleteItem={() => removeItem(item.id)}
                />
              );
            })
          )}
          {isEditMode && (
            <Button
              onClick={handleAddNewItem}
              className="w-full mt-4"
              variant="outline"
            >
              <Plus className="mr-2 h-4 w-4" /> Add New Item
            </Button>
          )}
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

      <ScheduleEditorDialog
        open={editorDialogOpen}
        item={editingItem}
        onSave={handleSaveItem}
        onCancel={handleCancelEditor}
      />
    </div>
  );
}
