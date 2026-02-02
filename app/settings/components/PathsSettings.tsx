"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface PathSettings {
  bd: string | null;
  gh: string | null;
  git: string | null;
}

interface DetectedPaths {
  bd: string | null;
  gh: string | null;
  git: string | null;
}

export function PathsSettings() {
  const [settings, setSettings] = useState<PathSettings>({
    bd: null,
    gh: null,
    git: null,
  });
  const [detectedPaths, setDetectedPaths] = useState<DetectedPaths>({
    bd: null,
    gh: null,
    git: null,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Load settings and detect paths on mount
  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);

      // Load saved settings
      const savedSettings = await window.electronAPI?.getToolPaths?.();
      if (savedSettings) {
        setSettings(savedSettings);
      }

      // Auto-detect paths
      const detected = await window.electronAPI?.detectToolPaths?.();
      if (detected) {
        setDetectedPaths(detected);
      }
    } catch (error) {
      console.error("Failed to load path settings:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await window.electronAPI?.updateToolPaths?.(settings);
    } catch (error) {
      console.error("Failed to save path settings:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleUseDetected = (tool: keyof PathSettings) => {
    setSettings((prev) => ({
      ...prev,
      [tool]: detectedPaths[tool],
    }));
  };

  const handleClearOverride = (tool: keyof PathSettings) => {
    setSettings((prev) => ({
      ...prev,
      [tool]: null,
    }));
  };

  const getEffectivePath = (tool: keyof PathSettings): string => {
    return settings[tool] || detectedPaths[tool] || "Not found";
  };

  const hasOverride = (tool: keyof PathSettings): boolean => {
    return settings[tool] !== null && settings[tool] !== detectedPaths[tool];
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Tool Paths</CardTitle>
          <CardDescription>
            Configure paths to required command-line tools
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Loading...</p>
        </CardContent>
      </Card>
    );
  }

  const tools: Array<{
    key: keyof PathSettings;
    name: string;
    description: string;
  }> = [
    {
      key: "bd",
      name: "bd (Beads)",
      description: "Beads task manager command-line tool",
    },
    {
      key: "gh",
      name: "gh (GitHub CLI)",
      description: "GitHub command-line interface",
    },
    {
      key: "git",
      name: "git",
      description: "Git version control system",
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tool Paths</CardTitle>
        <CardDescription>
          Configure paths to required command-line tools. Paths are auto-detected by default.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {tools.map((tool) => (
          <div key={tool.key} className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-base font-medium">{tool.name}</Label>
                <p className="text-sm text-muted-foreground">{tool.description}</p>
              </div>
              {hasOverride(tool.key) && (
                <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-1 rounded">
                  Override
                </span>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <div className="text-sm text-muted-foreground mb-1">
                    Auto-detected: {detectedPaths[tool.key] || "Not found"}
                  </div>
                  {detectedPaths[tool.key] && !hasOverride(tool.key) && (
                    <div className="text-xs text-green-600">
                      Using auto-detected path
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Label htmlFor={`path-${tool.key}`} className="text-sm">
                    Custom path (override)
                  </Label>
                  <Input
                    id={`path-${tool.key}`}
                    type="text"
                    value={settings[tool.key] || ""}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        [tool.key]: e.target.value || null,
                      }))
                    }
                    placeholder={detectedPaths[tool.key] || "Enter custom path"}
                    className="mt-1"
                  />
                </div>
                {hasOverride(tool.key) && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleClearOverride(tool.key)}
                  >
                    Clear
                  </Button>
                )}
                {detectedPaths[tool.key] && !hasOverride(tool.key) && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleUseDetected(tool.key)}
                  >
                    Set Default
                  </Button>
                )}
              </div>

              <div className="text-sm">
                <span className="text-muted-foreground">Effective path: </span>
                <code className="text-xs bg-muted px-2 py-1 rounded">
                  {getEffectivePath(tool.key)}
                </code>
              </div>
            </div>
          </div>
        ))}

        <div className="flex justify-end pt-4">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
