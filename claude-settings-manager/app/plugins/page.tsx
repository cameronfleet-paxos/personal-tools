"use client";

import { useSettingsStore } from "@/lib/store";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Puzzle, Info, Calendar, FolderOpen } from "lucide-react";

export default function PluginsPage() {
  const { plugins, updateSetting, isLoading, effectiveGlobal } =
    useSettingsStore();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading settings...</div>
      </div>
    );
  }

  const installedPlugins = plugins?.plugins || {};
  const enabledPlugins = effectiveGlobal?.enabledPlugins || {};

  const handleTogglePlugin = (pluginId: string, enabled: boolean) => {
    const newEnabledPlugins = { ...enabledPlugins, [pluginId]: enabled };
    updateSetting(
      ["enabledPlugins"],
      newEnabledPlugins,
      "global",
      `${enabled ? "Enabled" : "Disabled"} plugin: ${pluginId.split("@")[0]}`
    );
  };

  const pluginEntries = Object.entries(installedPlugins);

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold">Plugins</h1>
        <p className="text-muted-foreground">
          Manage your installed Claude Code plugins.
        </p>
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          To install new plugins, use the Claude Code CLI:{" "}
          <code className="bg-muted px-1.5 py-0.5 rounded">
            claude plugin install &lt;name&gt;
          </code>
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Puzzle className="h-5 w-5" />
            Installed Plugins
          </CardTitle>
          <CardDescription>
            {pluginEntries.length} plugin{pluginEntries.length !== 1 ? "s" : ""}{" "}
            installed
          </CardDescription>
        </CardHeader>
        <CardContent>
          {pluginEntries.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No plugins installed
            </div>
          ) : (
            <div className="space-y-3">
              {pluginEntries.map(([pluginId, installations]) => {
                const installation = installations[0];
                const [name, marketplace] = pluginId.split("@");
                const isEnabled = enabledPlugins[pluginId] ?? false;

                return (
                  <div
                    key={pluginId}
                    className={`flex items-center justify-between p-4 rounded-lg border transition-colors ${
                      isEnabled ? "bg-primary/5 border-primary/20" : ""
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Puzzle className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{name}</span>
                        <Badge variant="outline" className="text-xs">
                          {marketplace}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <span>v{installation.version}</span>
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {new Date(installation.installedAt).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <FolderOpen className="h-3 w-3" />
                        <span className="truncate max-w-[300px]">
                          {installation.installPath}
                        </span>
                      </div>
                    </div>
                    <Switch
                      checked={isEnabled}
                      onCheckedChange={(checked) =>
                        handleTogglePlugin(pluginId, checked)
                      }
                    />
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
