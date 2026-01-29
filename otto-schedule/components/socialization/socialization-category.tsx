'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { SocializationCategory as SocializationCategoryType } from '@/types/socialization';
import { SocializationItem } from './socialization-item';
import { cn } from '@/lib/utils';

interface SocializationCategoryProps {
  category: SocializationCategoryType;
  onToggleItem: (itemId: string, completed: boolean) => void;
  defaultExpanded?: boolean;
}

export function SocializationCategory({
  category,
  onToggleItem,
  defaultExpanded = false,
}: SocializationCategoryProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const completedCount = category.items.filter(item => item.completed).length;
  const totalCount = category.items.length;
  const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
          <span className="font-medium text-sm">{category.name}</span>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={cn(
              'text-xs',
              completedCount === totalCount
                ? 'text-green-600 dark:text-green-400'
                : 'text-muted-foreground'
            )}
          >
            {completedCount}/{totalCount}
          </span>
          <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className={cn(
                'h-full transition-all duration-300',
                completedCount === totalCount
                  ? 'bg-green-500'
                  : 'bg-primary'
              )}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </button>

      {isExpanded && (
        <div className="divide-y">
          {category.items.map(item => (
            <SocializationItem
              key={item.id}
              item={item}
              onToggle={(completed) => onToggleItem(item.id, completed)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
