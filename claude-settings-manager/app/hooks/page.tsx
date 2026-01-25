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
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScopeBadge } from "@/components/ui/scope-badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Trash2, Terminal, MessageSquare } from "lucide-react";
import type { HookType, HookMatcher, Hook, SettingsTarget, Settings } from "@/types/settings";

interface HookItem {
  matcher: HookMatcher;
  source: SettingsTarget;
  index: number; // index within source
}

const hookTypes: { id: HookType; name: string; description: string }[] = [
  {
    id: "PreCompact",
    name: "Pre-Compact",
    description: "Runs before context is compacted",
  },
  {
    id: "SessionStart",
    name: "Session Start",
    description: "Runs when a new session begins",
  },
  {
    id: "UserPromptSubmit",
    name: "User Prompt Submit",
    description: "Runs when user submits a prompt",
  },
  {
    id: "PreToolUse",
    name: "Pre-Tool Use",
    description: "Runs before any tool is used",
  },
  {
    id: "PostToolUse",
    name: "Post-Tool Use",
    description: "Runs after any tool completes",
  },
];

export default function HooksPage() {
  const {
    updateSetting,
    isLoading,
    effectiveUser,
    effectiveProject,
    effectiveProjectLocal,
    isInProjectContext,
  } = useSettingsStore();

  const inProject = isInProjectContext();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedHookType, setSelectedHookType] = useState<HookType | null>(
    null
  );
  const [newHookKind, setNewHookKind] = useState<"command" | "prompt">(
    "command"
  );
  const [newCommand, setNewCommand] = useState("");
  const [newPrompt, setNewPrompt] = useState("");
  const [newMatcher, setNewMatcher] = useState("");
  const [newTimeout, setNewTimeout] = useState("");

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading settings...</div>
      </div>
    );
  }

  // Get settings object for a given target (user-local removed)
  const getSettingsForTarget = (target: SettingsTarget): Settings => {
    switch (target) {
      case "user":
        return effectiveUser;
      case "project":
        return effectiveProject;
      case "project-local":
        return effectiveProjectLocal;
    }
  };

  // Default target for new hooks
  const defaultTarget: SettingsTarget = inProject ? "project" : "user";

  // Check if inherited
  const isInherited = (source: SettingsTarget): boolean => {
    return inProject && source === "user";
  };

  // Helper to get hooks from a specific source
  const getHooksFromSource = (
    settings: Settings | null,
    source: SettingsTarget,
    type: HookType
  ): HookItem[] => {
    const matchers = settings?.hooks?.[type] || [];
    return matchers.map((matcher, index) => ({
      matcher,
      source,
      index,
    }));
  };

  // Collect hooks from all sources for a given type (user-local removed)
  const getAllHooksForType = (type: HookType): HookItem[] => {
    if (inProject) {
      return [
        ...getHooksFromSource(effectiveUser, "user", type),
        ...getHooksFromSource(effectiveProject, "project", type),
        ...getHooksFromSource(effectiveProjectLocal, "project-local", type),
      ];
    }
    return [
      ...getHooksFromSource(effectiveUser, "user", type),
    ];
  };

  // Legacy function for getting raw hooks (used in add/delete)
  const getHooksForType = (type: HookType, target: SettingsTarget): HookMatcher[] => {
    const settings = getSettingsForTarget(target);
    return settings?.hooks?.[type] || [];
  };

  const openAddDialog = (hookType: HookType) => {
    setSelectedHookType(hookType);
    setNewHookKind("command");
    setNewCommand("");
    setNewPrompt("");
    setNewMatcher("");
    setNewTimeout("");
    setIsDialogOpen(true);
  };

  const handleAddHook = () => {
    if (!selectedHookType) return;

    const hook: Hook =
      newHookKind === "command"
        ? {
            type: "command",
            command: newCommand,
            ...(newTimeout ? { timeout: parseInt(newTimeout) } : {}),
          }
        : {
            type: "prompt",
            prompt: newPrompt,
          };

    const newMatcher_: HookMatcher = {
      matcher: newMatcher || "",
      hooks: [hook],
    };

    const currentHooks = getHooksForType(selectedHookType, defaultTarget);
    const updatedHooks = [...currentHooks, newMatcher_];

    updateSetting(
      ["hooks", selectedHookType],
      updatedHooks,
      defaultTarget,
      `Added ${selectedHookType} hook`
    );

    setIsDialogOpen(false);
  };

  const handleDeleteHook = (hookType: HookType, item: HookItem) => {
    const settings = getSettingsForTarget(item.source);
    const currentHooks = settings?.hooks?.[hookType] || [];
    const updatedHooks = currentHooks.filter((_, i) => i !== item.index);

    if (updatedHooks.length === 0) {
      // Remove the entire hook type if no hooks remain
      const newHooks = { ...(settings?.hooks || {}) };
      delete newHooks[hookType];
      updateSetting(
        ["hooks"],
        Object.keys(newHooks).length > 0 ? newHooks : undefined,
        item.source,
        `Removed all ${hookType} hooks`
      );
    } else {
      updateSetting(
        ["hooks", hookType],
        updatedHooks,
        item.source,
        `Removed ${hookType} hook`
      );
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold">Hooks</h1>
        <p className="text-muted-foreground">
          Configure commands that run at specific lifecycle events.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Lifecycle Hooks
          </CardTitle>
          <CardDescription>
            Hooks run at specific points during Claude Code sessions.
            {inProject && " Shows hooks from all sources."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Accordion type="multiple" className="w-full">
            {hookTypes.map((hookType) => {
              const typeHooks = getAllHooksForType(hookType.id);
              return (
                <AccordionItem key={hookType.id} value={hookType.id}>
                  <AccordionTrigger className="hover:no-underline">
                    <div className="flex items-center gap-3">
                      <span className="font-medium">{hookType.name}</span>
                      {typeHooks.length > 0 && (
                        <Badge variant="secondary">{typeHooks.length}</Badge>
                      )}
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="pt-2 space-y-4">
                      <p className="text-sm text-muted-foreground">
                        {hookType.description}
                      </p>

                      {typeHooks.length === 0 ? (
                        <div className="text-center py-4 text-muted-foreground border rounded-lg">
                          No hooks configured
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {typeHooks.map((item, itemIndex) => (
                            <div
                              key={`${item.source}-${item.index}-${itemIndex}`}
                              className={`border rounded-lg p-4 space-y-2 ${
                                isInherited(item.source) ? "bg-muted/30" : ""
                              }`}
                            >
                              {item.matcher.hooks.map((hook, hookIndex) => (
                                <div
                                  key={hookIndex}
                                  className="flex items-start justify-between"
                                >
                                  <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                      {hook.type === "command" ? (
                                        <Terminal className="h-4 w-4 text-muted-foreground" />
                                      ) : (
                                        <MessageSquare className="h-4 w-4 text-muted-foreground" />
                                      )}
                                      <Badge variant="outline">
                                        {hook.type}
                                      </Badge>
                                      <ScopeBadge scope={item.source} />
                                      {isInherited(item.source) && (
                                        <span className="text-xs text-muted-foreground">← inherited</span>
                                      )}
                                    </div>
                                    <code className="text-sm block mt-1">
                                      {hook.type === "command"
                                        ? hook.command
                                        : hook.prompt}
                                    </code>
                                    {item.matcher.matcher && (
                                      <p className="text-xs text-muted-foreground">
                                        Matcher: {item.matcher.matcher}
                                      </p>
                                    )}
                                    {hook.type === "command" && hook.timeout && (
                                      <p className="text-xs text-muted-foreground">
                                        Timeout: {hook.timeout}ms
                                      </p>
                                    )}
                                  </div>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() =>
                                      handleDeleteHook(hookType.id, item)
                                    }
                                  >
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                      )}

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openAddDialog(hookType.id)}
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        Add Hook
                      </Button>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>
              Add Hook to{" "}
              {hookTypes.find((h) => h.id === selectedHookType)?.name}
            </DialogTitle>
            <DialogDescription>
              Configure a new hook to run at this lifecycle event.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Hook Type</Label>
              <RadioGroup
                value={newHookKind}
                onValueChange={(v) => setNewHookKind(v as "command" | "prompt")}
                className="flex gap-4"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="command" id="command" />
                  <Label htmlFor="command">Command</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="prompt" id="prompt" />
                  <Label htmlFor="prompt">Prompt</Label>
                </div>
              </RadioGroup>
            </div>

            {newHookKind === "command" ? (
              <>
                <div className="space-y-2">
                  <Label>Command</Label>
                  <Input
                    value={newCommand}
                    onChange={(e) => setNewCommand(e.target.value)}
                    placeholder="/path/to/script.sh or command"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Timeout (ms, optional)</Label>
                  <Input
                    type="number"
                    value={newTimeout}
                    onChange={(e) => setNewTimeout(e.target.value)}
                    placeholder="30000"
                  />
                </div>
              </>
            ) : (
              <div className="space-y-2">
                <Label>Prompt Template</Label>
                <Textarea
                  value={newPrompt}
                  onChange={(e) => setNewPrompt(e.target.value)}
                  placeholder="Enter prompt template..."
                  rows={4}
                />
                <p className="text-xs text-muted-foreground">
                  Use $ARGUMENTS for dynamic content
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label>Matcher (optional)</Label>
              <Input
                value={newMatcher}
                onChange={(e) => setNewMatcher(e.target.value)}
                placeholder="Tool pattern to match"
              />
              <p className="text-xs text-muted-foreground">
                Leave empty to match all. Use patterns like &quot;Edit&quot; or
                &quot;Bash&quot;.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAddHook}
              disabled={
                newHookKind === "command" ? !newCommand.trim() : !newPrompt.trim()
              }
            >
              Add Hook
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
