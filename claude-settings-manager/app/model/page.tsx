"use client";

import { useSettingsStore } from "@/lib/store";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ScopeBadge, getScopeDescription } from "@/components/ui/scope-badge";
import type { Scope } from "@/components/ui/scope-badge";
import type { SettingsTarget } from "@/types/settings";
import { Brain, Zap, Sparkles, Lightbulb } from "lucide-react";

const models = [
  {
    id: "opus",
    name: "Claude Opus",
    description: "Most capable model. Best for complex reasoning, analysis, and detailed tasks.",
    icon: Sparkles,
    badge: "Most Capable",
  },
  {
    id: "sonnet",
    name: "Claude Sonnet",
    description: "Fast and capable. Great balance of speed and quality for most tasks.",
    icon: Zap,
    badge: "Balanced",
  },
  {
    id: "haiku",
    name: "Claude Haiku",
    description: "Fastest model. Ideal for simple tasks and quick iterations.",
    icon: Brain,
    badge: "Fastest",
  },
];

export default function ModelPage() {
  const {
    updateSetting,
    isLoading,
    effectiveUser,
    effectiveUserLocal,
    effectiveProject,
    effectiveProjectLocal,
    isInProjectContext,
  } = useSettingsStore();

  const inProject = isInProjectContext();

  // Determine effective model value and which source it comes from
  // Priority: project-local > project > user-local > user
  const getEffectiveModelSetting = (): { value: string | undefined; source: SettingsTarget } => {
    if (inProject) {
      if (effectiveProjectLocal?.model) return { value: effectiveProjectLocal.model, source: "project-local" };
      if (effectiveProject?.model) return { value: effectiveProject.model, source: "project" };
      if (effectiveUserLocal?.model) return { value: effectiveUserLocal.model, source: "user-local" };
      if (effectiveUser?.model) return { value: effectiveUser.model, source: "user" };
    } else {
      if (effectiveUserLocal?.model) return { value: effectiveUserLocal.model, source: "user-local" };
      if (effectiveUser?.model) return { value: effectiveUser.model, source: "user" };
    }
    return { value: undefined, source: "user" };
  };

  const getEffectiveThinkingSetting = (): { value: boolean; source: SettingsTarget } => {
    if (inProject) {
      if (effectiveProjectLocal?.alwaysThinkingEnabled !== undefined)
        return { value: effectiveProjectLocal.alwaysThinkingEnabled, source: "project-local" };
      if (effectiveProject?.alwaysThinkingEnabled !== undefined)
        return { value: effectiveProject.alwaysThinkingEnabled, source: "project" };
      if (effectiveUserLocal?.alwaysThinkingEnabled !== undefined)
        return { value: effectiveUserLocal.alwaysThinkingEnabled, source: "user-local" };
      if (effectiveUser?.alwaysThinkingEnabled !== undefined)
        return { value: effectiveUser.alwaysThinkingEnabled, source: "user" };
    } else {
      if (effectiveUserLocal?.alwaysThinkingEnabled !== undefined)
        return { value: effectiveUserLocal.alwaysThinkingEnabled, source: "user-local" };
      if (effectiveUser?.alwaysThinkingEnabled !== undefined)
        return { value: effectiveUser.alwaysThinkingEnabled, source: "user" };
    }
    return { value: false, source: "user" };
  };

  const modelSetting = getEffectiveModelSetting();
  const thinkingSetting = getEffectiveThinkingSetting();

  const currentModel = modelSetting.value || "sonnet";
  const thinkingEnabled = thinkingSetting.value;

  // Determine which target to use when making changes
  const defaultTarget: SettingsTarget = inProject ? "project" : "user";

  // Check if value is inherited from user settings while in project context
  const isInherited = (source: SettingsTarget): boolean => {
    return inProject && (source === "user" || source === "user-local");
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading settings...</div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Model Settings</h1>
        <p className="text-muted-foreground">
          Choose your default Claude model and configure thinking mode.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Default Model
            <ScopeBadge scope={modelSetting.source} />
            {isInherited(modelSetting.source) && (
              <span className="text-xs font-normal text-muted-foreground">← inherited</span>
            )}
          </CardTitle>
          <CardDescription>
            Select which Claude model to use by default for your sessions.
            {isInherited(modelSetting.source) && inProject && (
              <span className="block mt-1 text-xs">
                This value is inherited from user settings. Changes will override in project settings.
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup
            value={currentModel}
            onValueChange={(value) =>
              updateSetting(["model"], value, defaultTarget, `Changed model to ${value}`)
            }
            className="space-y-3"
          >
            {models.map((model) => (
              <label
                key={model.id}
                className={`flex items-start gap-4 rounded-lg border p-4 cursor-pointer transition-colors ${
                  currentModel === model.id
                    ? "border-primary bg-primary/5"
                    : "hover:bg-muted/50"
                }`}
              >
                <RadioGroupItem value={model.id} className="mt-1" />
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <model.icon className="h-4 w-4" />
                    <span className="font-medium">{model.name}</span>
                    <Badge variant="secondary" className="text-xs">
                      {model.badge}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {model.description}
                  </p>
                </div>
              </label>
            ))}
          </RadioGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lightbulb className="h-5 w-5" />
            Extended Thinking
            <ScopeBadge scope={thinkingSetting.source} />
            {isInherited(thinkingSetting.source) && (
              <span className="text-xs font-normal text-muted-foreground">← inherited</span>
            )}
          </CardTitle>
          <CardDescription>
            Enable Claude to reason through complex problems step by step before responding.
            {isInherited(thinkingSetting.source) && inProject && (
              <span className="block mt-1 text-xs">
                This value is inherited from user settings. Changes will override in project settings.
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-1">
              <Label htmlFor="thinking-toggle" className="font-medium">
                Always enable extended thinking
              </Label>
              <p className="text-sm text-muted-foreground">
                Uses more tokens but improves quality for difficult tasks.
              </p>
            </div>
            <Switch
              id="thinking-toggle"
              checked={thinkingEnabled}
              onCheckedChange={(checked) =>
                updateSetting(
                  ["alwaysThinkingEnabled"],
                  checked,
                  defaultTarget,
                  `${checked ? "Enabled" : "Disabled"} extended thinking`
                )
              }
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
