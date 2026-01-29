'use client';

import { SocializationItem as SocializationItemType } from '@/types/socialization';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';

interface SocializationItemProps {
  item: SocializationItemType;
  onToggle: (completed: boolean) => void;
}

export function SocializationItem({ item, onToggle }: SocializationItemProps) {
  return (
    <label
      className={cn(
        'flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-muted/50 transition-colors',
        item.completed && 'opacity-60'
      )}
    >
      <Checkbox
        checked={item.completed}
        onCheckedChange={(checked) => onToggle(checked === true)}
      />
      <span
        className={cn(
          'text-sm flex-1',
          item.completed && 'line-through text-muted-foreground'
        )}
      >
        {item.name}
      </span>
    </label>
  );
}
