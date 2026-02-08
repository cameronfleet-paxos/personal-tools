"use client";

import { Loader2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DeepSearchProgressProps {
  searching: boolean;
  progress: { searched: number; total: number } | null;
  complete: boolean;
  totalMatches: number;
  durationMs: number;
  onCancel: () => void;
  onClear: () => void;
}

export function DeepSearchProgress({
  searching,
  progress,
  complete,
  totalMatches,
  durationMs,
  onCancel,
  onClear,
}: DeepSearchProgressProps) {
  if (!searching && !complete) return null;

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground px-1 py-1.5">
      {searching ? (
        <>
          <Loader2 className="h-3.5 w-3.5 animate-spin flex-shrink-0" />
          <span>
            Searching{" "}
            {progress
              ? `${progress.searched} of ${progress.total}`
              : "..."}{" "}
            conversations...
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-5 px-1.5 text-xs text-muted-foreground hover:text-foreground"
            onClick={onCancel}
          >
            <X className="h-3 w-3" />
          </Button>
        </>
      ) : complete ? (
        <>
          <Check className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
          <span>
            Found {totalMatches} match{totalMatches !== 1 ? "es" : ""} in{" "}
            {progress?.total ?? 0} conversations ({(durationMs / 1000).toFixed(1)}s)
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-5 px-1.5 text-xs text-muted-foreground hover:text-foreground"
            onClick={onClear}
          >
            <X className="h-3 w-3" />
          </Button>
        </>
      ) : null}
    </div>
  );
}
