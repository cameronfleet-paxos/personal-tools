"use client";

import { useState } from "react";
import { useSettingsStore } from "@/lib/store";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Trash2, Terminal, Wrench } from "lucide-react";

export default function AdvancedPage() {
  const { updateSetting, isLoading, effectiveGlobal } = useSettingsStore();

  const [newPattern, setNewPattern] = useState("");
  const [isPatternDialogOpen, setIsPatternDialogOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading settings...</div>
      </div>
    );
  }

  const bashPatterns = effectiveGlobal?.allowedBashPatterns || [];

  const handleAddPattern = () => {
    if (!newPattern.trim()) return;
    const updatedPatterns = [...bashPatterns, newPattern.trim()];
    updateSetting(
      ["allowedBashPatterns"],
      updatedPatterns,
      "global",
      `Added bash pattern: ${newPattern}`
    );
    setNewPattern("");
    setIsPatternDialogOpen(false);
  };

  const handleRemovePattern = (pattern: string) => {
    const updatedPatterns = bashPatterns.filter((p) => p !== pattern);
    updateSetting(
      ["allowedBashPatterns"],
      updatedPatterns.length > 0 ? updatedPatterns : undefined,
      "global",
      `Removed bash pattern: ${pattern}`
    );
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold">Advanced Settings</h1>
        <p className="text-muted-foreground">
          Additional configuration options for power users.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Terminal className="h-5 w-5" />
              Bash Patterns Whitelist
            </CardTitle>
            <CardDescription>
              Pre-approved bash script patterns that can run without confirmation.
            </CardDescription>
          </div>
          <Dialog
            open={isPatternDialogOpen}
            onOpenChange={setIsPatternDialogOpen}
          >
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="mr-2 h-4 w-4" />
                Add Pattern
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Bash Pattern</DialogTitle>
                <DialogDescription>
                  Add a glob pattern for scripts that should be auto-approved.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Pattern</Label>
                  <Input
                    value={newPattern}
                    onChange={(e) => setNewPattern(e.target.value)}
                    placeholder="**/scripts/*.sh"
                  />
                  <p className="text-xs text-muted-foreground">
                    Use glob patterns. ** matches any directory depth. Examples:
                    <br />
                    • **/setup.sh - Any setup.sh file
                    <br />
                    • /path/to/scripts/** - Everything in scripts directory
                    <br />• **/*.sh - All shell scripts
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setIsPatternDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button onClick={handleAddPattern} disabled={!newPattern.trim()}>
                  Add Pattern
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {bashPatterns.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No bash patterns configured
            </div>
          ) : (
            <div className="space-y-2">
              {bashPatterns.map((pattern, index) => (
                <div
                  key={`${pattern}-${index}`}
                  className="flex items-center justify-between p-3 rounded-lg border"
                >
                  <code className="text-sm">{pattern}</code>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemovePattern(pattern)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5" />
            Configuration Files
          </CardTitle>
          <CardDescription>
            Direct paths to your Claude Code configuration files.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="p-3 rounded-lg border">
              <div className="text-sm font-medium">Global Settings</div>
              <code className="text-xs text-muted-foreground">
                ~/.claude/settings.json
              </code>
            </div>
            <div className="p-3 rounded-lg border">
              <div className="text-sm font-medium">Local Settings</div>
              <code className="text-xs text-muted-foreground">
                ~/.claude/settings.local.json
              </code>
            </div>
            <div className="p-3 rounded-lg border">
              <div className="text-sm font-medium">Installed Plugins</div>
              <code className="text-xs text-muted-foreground">
                ~/.claude/plugins/installed_plugins.json
              </code>
            </div>
            <div className="p-3 rounded-lg border">
              <div className="text-sm font-medium">Usage Statistics</div>
              <code className="text-xs text-muted-foreground">
                ~/.claude/stats-cache.json
              </code>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
