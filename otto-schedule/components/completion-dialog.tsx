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
import { Textarea } from '@/components/ui/textarea';
import { ScheduleItem } from '@/types/schedule';

interface CompletionDialogProps {
  open: boolean;
  item: ScheduleItem | undefined;
  onConfirm: (actualTime: string, notes?: string) => void;
  onCancel: () => void;
}

function getCurrentTime(): string {
  const now = new Date();
  const hours = now.getHours().toString().padStart(2, '0');
  const minutes = now.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

export function CompletionDialog({
  open,
  item,
  onConfirm,
  onCancel,
}: CompletionDialogProps) {
  const [actualTime, setActualTime] = useState(getCurrentTime());
  const [notes, setNotes] = useState('');

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setActualTime(getCurrentTime());
      setNotes('');
    }
  }, [open]);

  const handleConfirm = () => {
    onConfirm(actualTime, notes.trim() || undefined);
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Complete Activity</DialogTitle>
          <DialogDescription>
            {item?.activity}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="actual-time">Completion Time</Label>
            <Input
              id="actual-time"
              type="time"
              value={actualTime}
              onChange={(e) => setActualTime(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              placeholder="Any notes about this activity..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={handleConfirm}>
            Complete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
