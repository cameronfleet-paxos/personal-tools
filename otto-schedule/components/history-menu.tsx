'use client';

import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { useScheduleStore } from '@/lib/store';
import { getTodayDate } from '@/lib/utils';

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function HistoryMenu() {
  const { availableDates, viewingDate, viewDate } = useScheduleStore();
  const today = getTodayDate();

  // Filter out today from historical dates
  const historicalDates = availableDates.filter(date => date !== today);
  const isViewingToday = viewingDate === null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
          <Menu className="h-4 w-4" />
          <span className="sr-only">View history</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>View Date</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          checked={isViewingToday}
          onCheckedChange={() => viewDate(null)}
        >
          Today ({formatDate(today)})
        </DropdownMenuCheckboxItem>

        {historicalDates.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground">Previous Days</DropdownMenuLabel>
            {historicalDates.map(date => (
              <DropdownMenuCheckboxItem
                key={date}
                checked={viewingDate === date}
                onCheckedChange={() => viewDate(date)}
              >
                {formatDate(date)}
              </DropdownMenuCheckboxItem>
            ))}
          </>
        )}

        {historicalDates.length === 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled className="text-xs text-muted-foreground">
              No previous days yet
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
