'use client';

import { X, GripVertical } from 'lucide-react';
import { ScheduleItem as ScheduleItemType, CompletedItem, categoryColors } from '@/types/schedule';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { TimeEditor } from '@/components/time-editor';
import { cn, formatTime } from '@/lib/utils';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface ScheduleItemProps {
  item: ScheduleItemType;
  isCompleted: boolean;
  completionData?: CompletedItem;
  isNext: boolean;
  isEditing: boolean;
  disabled?: boolean;
  isEditMode?: boolean;
  onToggle: () => void;
  onEditStart: () => void;
  onEditSave: (time: string, endTime?: string) => void;
  onEditCancel: () => void;
  onEditItem?: () => void;
  onDeleteItem?: () => void;
}

export function ScheduleItemRow({
  item,
  isCompleted,
  completionData,
  isNext,
  isEditing,
  disabled = false,
  isEditMode = false,
  onToggle,
  onEditStart,
  onEditSave,
  onEditCancel,
  onEditItem,
  onDeleteItem,
}: ScheduleItemProps) {
  const colors = categoryColors[item.category];

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id, disabled: !isEditMode });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const handleItemClick = () => {
    if (isEditMode && onEditItem) {
      onEditItem();
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-3 p-3 rounded-lg border transition-all",
        colors.bg,
        colors.border,
        isCompleted && !isEditMode && "opacity-60",
        isNext && !isEditMode && "ring-2 ring-primary ring-offset-2 ring-offset-background",
        isEditMode && "cursor-pointer hover:ring-2 hover:ring-primary hover:ring-offset-2 hover:ring-offset-background",
        isDragging && "opacity-50 z-50"
      )}
      onClick={handleItemClick}
    >
      {isEditMode && (
        <div
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing shrink-0 text-muted-foreground hover:text-foreground"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="h-5 w-5" />
        </div>
      )}
      {!isEditMode && (
        <Checkbox
          checked={isCompleted}
          onCheckedChange={onToggle}
          disabled={disabled}
          className="shrink-0"
        />
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {isEditMode ? (
            <span className="text-sm font-mono">
              {item.time}
              {item.endTime && ` - ${item.endTime}`}
            </span>
          ) : (
            <TimeEditor
              time={item.time}
              endTime={item.endTime}
              isEditing={isEditing}
              onEdit={onEditStart}
              onSave={onEditSave}
              onCancel={onEditCancel}
              className={cn(isCompleted && "line-through")}
            />
          )}
          {!isEditMode && isCompleted && completionData?.actualTime && (
            <span className="text-xs text-muted-foreground">
              @ {formatTime(completionData.actualTime)}
            </span>
          )}
          {!isEditMode && isNext && (
            <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded-full">
              Next
            </span>
          )}
        </div>
        <p
          className={cn(
            "text-sm text-muted-foreground mt-0.5",
            !isEditMode && isCompleted && "line-through"
          )}
        >
          {item.activity}
        </p>
        {!isEditMode && isCompleted && completionData?.notes && (
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

      {isEditMode && onDeleteItem && (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
          onClick={(e) => {
            e.stopPropagation();
            onDeleteItem();
          }}
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Delete</span>
        </Button>
      )}
    </div>
  );
}
