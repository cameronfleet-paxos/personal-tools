'use client';

import { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { formatTime, isValidTime } from '@/lib/utils';
import { cn } from '@/lib/utils';

interface TimeEditorProps {
  time: string;
  endTime?: string;
  isEditing: boolean;
  onEdit: () => void;
  onSave: (time: string, endTime?: string) => void;
  onCancel: () => void;
  className?: string;
}

export function TimeEditor({
  time,
  endTime,
  isEditing,
  onEdit,
  onSave,
  onCancel,
  className,
}: TimeEditorProps) {
  const [editTime, setEditTime] = useState(time);
  const [editEndTime, setEditEndTime] = useState(endTime || '');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  useEffect(() => {
    setEditTime(time);
    setEditEndTime(endTime || '');
  }, [time, endTime]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (isValidTime(editTime) && (!editEndTime || isValidTime(editEndTime))) {
        onSave(editTime, editEndTime || undefined);
      }
    } else if (e.key === 'Escape') {
      setEditTime(time);
      setEditEndTime(endTime || '');
      onCancel();
    }
  };

  const handleBlur = () => {
    if (isValidTime(editTime) && (!editEndTime || isValidTime(editEndTime))) {
      onSave(editTime, editEndTime || undefined);
    } else {
      setEditTime(time);
      setEditEndTime(endTime || '');
      onCancel();
    }
  };

  if (isEditing) {
    return (
      <div className={cn("flex items-center gap-1", className)}>
        <Input
          ref={inputRef}
          type="text"
          value={editTime}
          onChange={(e) => setEditTime(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          className="w-16 h-7 text-xs font-mono px-2"
          placeholder="HH:MM"
        />
        {(endTime || editEndTime) && (
          <>
            <span className="text-muted-foreground">-</span>
            <Input
              type="text"
              value={editEndTime}
              onChange={(e) => setEditEndTime(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={handleBlur}
              className="w-16 h-7 text-xs font-mono px-2"
              placeholder="HH:MM"
            />
          </>
        )}
      </div>
    );
  }

  return (
    <button
      onClick={onEdit}
      className={cn(
        "text-sm font-medium hover:underline cursor-pointer text-left",
        className
      )}
    >
      {formatTime(time)}
      {endTime && ` - ${formatTime(endTime)}`}
    </button>
  );
}
