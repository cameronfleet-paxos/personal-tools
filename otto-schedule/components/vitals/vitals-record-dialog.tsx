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
import { getTodayDate } from '@/lib/utils';
import { VitalMeasurement } from '@/types/vitals';

interface VitalsRecordDialogProps {
  open: boolean;
  measurement?: VitalMeasurement;
  onSave: (data: { date: string; weight?: number; length?: number; notes?: string }) => void;
  onDelete?: () => void;
  onCancel: () => void;
}

export function VitalsRecordDialog({
  open,
  measurement,
  onSave,
  onDelete,
  onCancel,
}: VitalsRecordDialogProps) {
  const [date, setDate] = useState(getTodayDate());
  const [weight, setWeight] = useState('');
  const [length, setLength] = useState('');
  const [notes, setNotes] = useState('');

  const isEditing = !!measurement;

  useEffect(() => {
    if (open) {
      if (measurement) {
        setDate(measurement.date);
        setWeight(measurement.weight?.toString() ?? '');
        setLength(measurement.length?.toString() ?? '');
        setNotes(measurement.notes ?? '');
      } else {
        setDate(getTodayDate());
        setWeight('');
        setLength('');
        setNotes('');
      }
    }
  }, [open, measurement]);

  const handleSave = () => {
    const weightNum = weight ? parseFloat(weight) : undefined;
    const lengthNum = length ? parseFloat(length) : undefined;

    if (!weightNum && !lengthNum) {
      return;
    }

    onSave({
      date,
      weight: weightNum,
      length: lengthNum,
      notes: notes.trim() || undefined,
    });
  };

  const isValid = weight || length;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Vitals' : 'Record Vitals'}</DialogTitle>
          <DialogDescription>
            {isEditing ? 'Update this measurement' : "Record Otto's weight and/or length"}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="date">Date</Label>
            <Input
              id="date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="weight">Weight (kg)</Label>
            <Input
              id="weight"
              type="number"
              step="0.1"
              min="0"
              placeholder="e.g., 5.5"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="length">Length (cm)</Label>
            <Input
              id="length"
              type="number"
              step="0.5"
              min="0"
              placeholder="e.g., 45"
              value={length}
              onChange={(e) => setLength(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              placeholder="Any observations..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
        </div>
        <DialogFooter className="flex-row justify-between sm:justify-between">
          {isEditing && onDelete ? (
            <Button variant="destructive" onClick={onDelete}>
              Delete
            </Button>
          ) : (
            <div />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!isValid}>
              Save
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
