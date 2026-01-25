"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useSettingsStore } from "@/lib/store";
import { Save, RotateCcw } from "lucide-react";

export function Header() {
  const { pendingChanges, saveChanges, discardAllChanges, isSaving } =
    useSettingsStore();

  const hasChanges = pendingChanges.length > 0;

  return (
    <header className="flex h-14 items-center justify-between border-b px-6">
      <div className="flex items-center gap-3">
        {hasChanges && (
          <Badge variant="secondary" className="gap-1">
            {pendingChanges.length} unsaved change
            {pendingChanges.length !== 1 ? "s" : ""}
          </Badge>
        )}
      </div>
      <div className="flex items-center gap-2">
        {hasChanges && (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={discardAllChanges}
              disabled={isSaving}
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Discard
            </Button>
            <Button size="sm" onClick={saveChanges} disabled={isSaving}>
              <Save className="mr-2 h-4 w-4" />
              {isSaving ? "Saving..." : "Save Changes"}
            </Button>
          </>
        )}
      </div>
    </header>
  );
}
