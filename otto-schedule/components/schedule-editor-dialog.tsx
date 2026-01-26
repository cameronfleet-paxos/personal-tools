'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { ScheduleItem, Category, categoryLabels } from '@/types/schedule';

interface ScheduleEditorDialogProps {
  open: boolean;
  item?: ScheduleItem; // undefined means adding new item
  onSave: (data: Omit<ScheduleItem, 'id'>) => void;
  onCancel: () => void;
}

const categories: Category[] = ['wake', 'potty', 'eat', 'play', 'nap'];

export function ScheduleEditorDialog({
  open,
  item,
  onSave,
  onCancel,
}: ScheduleEditorDialogProps) {
  const [time, setTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [activity, setActivity] = useState('');
  const [category, setCategory] = useState<Category>('play');

  // Reset form when dialog opens or item changes
  useEffect(() => {
    if (open) {
      if (item) {
        setTime(item.time);
        setEndTime(item.endTime || '');
        setActivity(item.activity);
        setCategory(item.category);
      } else {
        // Default values for new item
        setTime('');
        setEndTime('');
        setActivity('');
        setCategory('play');
      }
    }
  }, [open, item]);

  const handleSave = () => {
    if (!time || !activity) return;

    onSave({
      time,
      endTime: endTime || undefined,
      activity,
      category,
    });
  };

  const isEditing = !!item;
  const isValid = time && activity;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Activity' : 'Add Activity'}</DialogTitle>
          <DialogDescription>
            {isEditing ? 'Modify the schedule item details.' : 'Add a new item to the schedule.'}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="start-time">Start Time</Label>
              <Input
                id="start-time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="end-time">End Time (optional)</Label>
              <Input
                id="end-time"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="activity">Activity</Label>
            <Input
              id="activity"
              type="text"
              placeholder="e.g., Play/Train, Potty, Eat"
              value={activity}
              onChange={(e) => setActivity(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="category">Category</Label>
            <select
              id="category"
              value={category}
              onChange={(e) => setCategory(e.target.value as Category)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {categoryLabels[cat]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!isValid}>
            {isEditing ? 'Save' : 'Add'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
