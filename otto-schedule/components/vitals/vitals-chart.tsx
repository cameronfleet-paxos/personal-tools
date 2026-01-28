'use client';

import { useMemo, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { VitalMeasurement } from '@/types/vitals';

type DateRange = 'week' | 'month' | '3mo' | 'all';

interface VitalsChartProps {
  measurements: VitalMeasurement[];
}

function getDateRangeFilter(range: DateRange): Date {
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  switch (range) {
    case 'week':
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case 'month':
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    case '3mo':
      return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    case 'all':
    default:
      return new Date(0);
  }
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function VitalsChart({ measurements }: VitalsChartProps) {
  const [range, setRange] = useState<DateRange>('month');

  const chartData = useMemo(() => {
    const minDate = getDateRangeFilter(range);

    const filtered = measurements
      .filter(m => new Date(m.date + 'T00:00:00') >= minDate)
      .reverse();

    return filtered.map(m => ({
      date: m.date,
      dateLabel: formatDate(m.date),
      weight: m.weight,
      length: m.length,
    }));
  }, [measurements, range]);

  const hasWeight = chartData.some(d => d.weight !== undefined);
  const hasLength = chartData.some(d => d.length !== undefined);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">Growth Chart</CardTitle>
          <div className="flex gap-1">
            {(['week', 'month', '3mo', 'all'] as DateRange[]).map(r => (
              <Button
                key={r}
                variant={range === r ? 'default' : 'ghost'}
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setRange(r)}
              >
                {r === '3mo' ? '3M' : r === 'all' ? 'All' : r.charAt(0).toUpperCase() + r.slice(1)}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">
            No data for this period
          </div>
        ) : (
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="dateLabel"
                  tick={{ fontSize: 11 }}
                  className="text-muted-foreground"
                />
                <YAxis
                  yAxisId="weight"
                  tick={{ fontSize: 11 }}
                  className="text-muted-foreground"
                  domain={['auto', 'auto']}
                  hide={!hasWeight}
                />
                <YAxis
                  yAxisId="length"
                  orientation="right"
                  tick={{ fontSize: 11 }}
                  className="text-muted-foreground"
                  domain={['auto', 'auto']}
                  hide={!hasLength}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                  formatter={(value, name) => {
                    if (value === undefined || value === null) return ['-', String(name)];
                    const unit = name === 'weight' ? 'kg' : 'cm';
                    const label = String(name).charAt(0).toUpperCase() + String(name).slice(1);
                    return [`${value} ${unit}`, label];
                  }}
                />
                <Legend
                  wrapperStyle={{ fontSize: '12px' }}
                  formatter={(value) => value.charAt(0).toUpperCase() + value.slice(1)}
                />
                {hasWeight && (
                  <Line
                    yAxisId="weight"
                    type="monotone"
                    dataKey="weight"
                    stroke="var(--chart-1)"
                    strokeWidth={2}
                    dot={{ fill: 'var(--chart-1)', strokeWidth: 0, r: 3 }}
                    connectNulls
                  />
                )}
                {hasLength && (
                  <Line
                    yAxisId="length"
                    type="monotone"
                    dataKey="length"
                    stroke="var(--chart-2)"
                    strokeWidth={2}
                    dot={{ fill: 'var(--chart-2)', strokeWidth: 0, r: 3 }}
                    connectNulls
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
