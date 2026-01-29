'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useSocializationStore } from '@/lib/socialization-store';
import { SocializationCategory } from './socialization-category';

export function SocializationPage() {
  const router = useRouter();
  const { socialization, isLoading, loadSocialization, toggleItem, resetChecklist } =
    useSocializationStore();

  useEffect(() => {
    loadSocialization();
  }, [loadSocialization]);

  // Calculate overall progress
  const totalItems = socialization.categories.reduce(
    (acc, cat) => acc + cat.items.length,
    0
  );
  const completedItems = socialization.categories.reduce(
    (acc, cat) => acc + cat.items.filter(item => item.completed).length,
    0
  );
  const overallProgress = totalItems > 0 ? (completedItems / totalItems) * 100 : 0;

  const handleReset = async () => {
    if (confirm('Are you sure you want to reset all items? This cannot be undone.')) {
      await resetChecklist();
    }
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
            <h1 className="text-xl font-semibold">Socialization</h1>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReset}
            className="text-muted-foreground"
          >
            <RotateCcw className="h-4 w-4 mr-1" />
            Reset
          </Button>
        </div>

        {/* Overall Progress */}
        <div className="bg-card border rounded-lg p-4 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Overall Progress</span>
            <span className="font-medium">
              {completedItems} / {totalItems} ({Math.round(overallProgress)}%)
            </span>
          </div>
          <Progress value={overallProgress} className="h-2" />
        </div>

        {/* Categories */}
        <div className="space-y-3">
          {socialization.categories.map(category => (
            <SocializationCategory
              key={category.id}
              category={category}
              onToggleItem={(itemId, completed) =>
                toggleItem(category.id, itemId, completed)
              }
            />
          ))}
        </div>
      </div>
    </div>
  );
}
