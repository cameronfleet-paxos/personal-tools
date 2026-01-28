'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { VitalMeasurement } from '@/types/vitals';
import { Scale, Ruler } from 'lucide-react';

interface VitalsSummaryProps {
  measurements: VitalMeasurement[];
}

function formatDaysAgo(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const diffTime = today.getTime() - date.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  return `${diffDays} days ago`;
}

export function VitalsSummary({ measurements }: VitalsSummaryProps) {
  const latestWeight = measurements.find(m => m.weight !== undefined);
  const latestLength = measurements.find(m => m.length !== undefined);

  return (
    <div className="grid grid-cols-2 gap-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Scale className="h-4 w-4" />
            Weight
          </CardTitle>
        </CardHeader>
        <CardContent>
          {latestWeight?.weight !== undefined ? (
            <>
              <div className="text-2xl font-bold">{latestWeight.weight} kg</div>
              <p className="text-xs text-muted-foreground">
                Last measured {formatDaysAgo(latestWeight.date)}
              </p>
            </>
          ) : (
            <div className="text-muted-foreground text-sm">No data</div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Ruler className="h-4 w-4" />
            Length
          </CardTitle>
        </CardHeader>
        <CardContent>
          {latestLength?.length !== undefined ? (
            <>
              <div className="text-2xl font-bold">{latestLength.length} cm</div>
              <p className="text-xs text-muted-foreground">
                Last measured {formatDaysAgo(latestLength.date)}
              </p>
            </>
          ) : (
            <div className="text-muted-foreground text-sm">No data</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
