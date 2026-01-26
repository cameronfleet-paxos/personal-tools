"use client";

import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { useSettingsStore } from "@/lib/store";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

function formatLastSynced(date: Date | null): string {
  if (!date) return "Never synced";
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (seconds < 60) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return date.toLocaleString();
}

export function SyncButton() {
  const { loadSettings, isSyncing, lastSyncedAt } = useSettingsStore();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          onClick={() => loadSettings()}
          disabled={isSyncing}
        >
          <RefreshCw
            className={`h-4 w-4 mr-2 ${isSyncing ? "animate-spin" : ""}`}
          />
          Sync
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>Last synced: {formatLastSynced(lastSyncedAt)}</p>
      </TooltipContent>
    </Tooltip>
  );
}
