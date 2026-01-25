"use client";

import { useSettingsStore } from "@/lib/store";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
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
  const { updateSetting, isLoading, effectiveGlobal } = useSettingsStore();

  const currentModel = effectiveGlobal?.model || "sonnet";
  const thinkingEnabled = effectiveGlobal?.alwaysThinkingEnabled ?? false;

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
          <CardTitle>Default Model</CardTitle>
          <CardDescription>
            Select which Claude model to use by default for your sessions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup
            value={currentModel}
            onValueChange={(value) =>
              updateSetting(["model"], value, "global", `Changed model to ${value}`)
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
          </CardTitle>
          <CardDescription>
            Enable Claude to reason through complex problems step by step before responding.
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
                  "global",
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
