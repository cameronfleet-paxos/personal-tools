'use client';

import { ScheduleItem as ScheduleItemType, CompletedItem, categoryColors } from '@/types/schedule';
import { Checkbox } from '@/components/ui/checkbox';
import { TimeEditor } from '@/components/time-editor';
import { cn, formatTime } from '@/lib/utils';

interface ScheduleItemProps {
  item: ScheduleItemType;
  isCompleted: boolean;
  completionData?: CompletedItem;
  isNext: boolean;
  isEditing: boolean;
  disabled?: boolean;
  onToggle: () => void;
  onEditStart: () => void;
  onEditSave: (time: string, endTime?: string) => void;
  onEditCancel: () => void;
}

export function ScheduleItemRow({
  item,
  isCompleted,
  completionData,
  isNext,
  isEditing,
  disabled = false,
  onToggle,
  onEditStart,
  onEditSave,
  onEditCancel,
}: ScheduleItemProps) {
  const colors = categoryColors[item.category];

  return (
    <div
      className={cn(
        "flex items-center gap-3 p-3 rounded-lg border transition-all",
        colors.bg,
        colors.border,
        isCompleted && "opacity-60",
        isNext && "ring-2 ring-primary ring-offset-2 ring-offset-background"
      )}
    >
      <Checkbox
        checked={isCompleted}
        onCheckedChange={onToggle}
        disabled={disabled}
        className="shrink-0"
      />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <TimeEditor
            time={item.time}
            endTime={item.endTime}
            isEditing={isEditing}
            onEdit={onEditStart}
            onSave={onEditSave}
            onCancel={onEditCancel}
            className={cn(isCompleted && "line-through")}
          />
          {isCompleted && completionData?.actualTime && (
            <span className="text-xs text-muted-foreground">
              @ {formatTime(completionData.actualTime)}
            </span>
          )}
          {isNext && (
            <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded-full">
              Next
            </span>
          )}
        </div>
        <p
          className={cn(
            "text-sm text-muted-foreground mt-0.5",
            isCompleted && "line-through"
          )}
        >
          {item.activity}
        </p>
        {isCompleted && completionData?.notes && (
          <p className="text-xs text-muted-foreground mt-1 italic">
            {completionData.notes}
          </p>
        )}
      </div>

      <span
        className={cn(
          "text-xs font-medium px-2 py-1 rounded capitalize",
          colors.bg,
          colors.text
        )}
      >
        {item.category}
      </span>
    </div>
  );
}
