'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useVitalsStore } from '@/lib/vitals-store';
import { VitalMeasurement } from '@/types/vitals';
import { VitalsSummary } from './vitals-summary';
import { VitalsChart } from './vitals-chart';
import { VitalsRecordDialog } from './vitals-record-dialog';

export function VitalsPage() {
  const router = useRouter();
  const { vitals, isLoading, loadVitals, addMeasurement, updateMeasurement, deleteMeasurement } = useVitalsStore();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingMeasurement, setEditingMeasurement] = useState<VitalMeasurement | undefined>();

  useEffect(() => {
    loadVitals();
  }, [loadVitals]);

  const handleSave = async (data: {
    date: string;
    weight?: number;
    length?: number;
    notes?: string;
  }) => {
    if (editingMeasurement) {
      await updateMeasurement({
        ...editingMeasurement,
        ...data,
      });
    } else {
      await addMeasurement(data);
    }
    setDialogOpen(false);
    setEditingMeasurement(undefined);
  };

  const handleDelete = async () => {
    if (editingMeasurement) {
      await deleteMeasurement(editingMeasurement.id);
      setDialogOpen(false);
      setEditingMeasurement(undefined);
    }
  };

  const handleEditMeasurement = (measurement: VitalMeasurement) => {
    setEditingMeasurement(measurement);
    setDialogOpen(true);
  };

  const handleDialogClose = () => {
    setDialogOpen(false);
    setEditingMeasurement(undefined);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-lg mx-auto p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => router.push('/')}
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="sr-only">Back</span>
            </Button>
            <h1 className="text-xl font-semibold">Vitals</h1>
          </div>
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Record
          </Button>
        </div>

        {/* Summary Cards */}
        <VitalsSummary measurements={vitals.measurements} />

        {/* Chart */}
        <VitalsChart measurements={vitals.measurements} />

        {/* History List */}
        {vitals.measurements.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">History</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y">
                {vitals.measurements.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => handleEditMeasurement(m)}
                    className="w-full px-4 py-3 flex items-center justify-between hover:bg-muted/50 transition-colors text-left"
                  >
                    <span className="text-sm font-medium">
                      {new Date(m.date + 'T00:00:00').toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {[
                        m.weight !== undefined ? `${m.weight} kg` : null,
                        m.length !== undefined ? `${m.length} cm` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Record Dialog */}
        <VitalsRecordDialog
          open={dialogOpen}
          measurement={editingMeasurement}
          onSave={handleSave}
          onDelete={editingMeasurement ? handleDelete : undefined}
          onCancel={handleDialogClose}
        />
      </div>
    </div>
  );
}
