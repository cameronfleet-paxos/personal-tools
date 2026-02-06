"use client";

import { useSettingsStore } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import {
  Brain,
  Shield,
  Box,
  Puzzle,
  Plug,
  Terminal,
  Wrench,
  Webhook,
  ArrowRight,
  Settings,
} from "lucide-react";
import { SyncButton } from "@/components/sync-button";
import { LoadingOverlay } from "@/components/loading-overlay";
import type { Settings as SettingsType, HookType, HookMatcher } from "@/types/settings";

function countPermissionRules(...sources: (SettingsType | null)[]): { total: number; allow: number; deny: number; ask: number } {
  let allow = 0, deny = 0, ask = 0;
  for (const s of sources) {
    if (!s?.permissions) continue;
    allow += s.permissions.allow?.length || 0;
    deny += s.permissions.deny?.length || 0;
    ask += s.permissions.ask?.length || 0;
  }
  return { total: allow + deny + ask, allow, deny, ask };
}

function countHooks(...sources: (SettingsType | null)[]): { total: number; events: number } {
  let total = 0;
  const events = new Set<string>();
  for (const s of sources) {
    if (!s?.hooks) continue;
    for (const [eventType, matchers] of Object.entries(s.hooks)) {
      if (matchers && (matchers as HookMatcher[]).length > 0) {
        events.add(eventType);
        total += (matchers as HookMatcher[]).length;
      }
    }
  }
  return { total, events: events.size };
}

function countBashPatterns(...sources: (SettingsType | null)[]): number {
  let total = 0;
  for (const s of sources) {
    total += s?.allowedBashPatterns?.length || 0;
  }
  return total;
}

function countNetworkHosts(...sources: (SettingsType | null)[]): number {
  let total = 0;
  for (const s of sources) {
    total += s?.sandbox?.network?.allowedHosts?.length || 0;
  }
  return total;
}

export default function SettingsPage() {
  const {
    effectiveUser,
    effectiveProject,
    effectiveProjectLocal,
    isInProjectContext,
    plugins,
    settingsIndex,
    commands,
    selectedProjectPath,
    isLoading,
  } = useSettingsStore();

  const inProject = isInProjectContext();
  const sources: (SettingsType | null)[] = inProject
    ? [effectiveUser, effectiveProject, effectiveProjectLocal]
    : [effectiveUser];

  // Check if we have data
  const hasData = effectiveUser !== null;

  if (isLoading && !hasData) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading settings...</div>
      </div>
    );
  }

  // Compute metrics
  const currentModel = effectiveUser?.model || "sonnet";
  const thinkingEnabled = effectiveUser?.alwaysThinkingEnabled;

  const perms = countPermissionRules(...sources);

  const sandboxEnabled = effectiveUser?.sandbox?.enabled !== false;
  const networkHosts = countNetworkHosts(...sources);

  const hooks = countHooks(...sources);

  const enabledPlugins = Object.values(effectiveUser?.enabledPlugins || {}).filter(Boolean).length;
  const totalPlugins = Object.keys(plugins?.plugins || {}).length;

  const mcpEnabled = settingsIndex?.mcps?.enabled?.length || 0;
  const mcpHealthy = settingsIndex?.mcps?.health?.filter(h => h.status === "connected").length || 0;

  const totalCommands = commands.length;
  const commandCount = commands.filter(c => c.type === "command").length;
  const skillCount = commands.filter(c => c.type === "skill").length;

  const bashPatterns = countBashPatterns(...sources);

  const cards = [
    {
      href: "/model",
      title: "Model",
      icon: Brain,
      metric: <span className="capitalize">{currentModel}</span>,
      subtitle: thinkingEnabled ? "Extended thinking enabled" : "Standard mode",
    },
    {
      href: "/permissions",
      title: "Permissions",
      icon: Shield,
      metric: `${perms.total}`,
      subtitle: perms.total > 0
        ? `${perms.allow} allow, ${perms.deny} deny, ${perms.ask} ask`
        : "No rules configured",
    },
    {
      href: "/sandbox",
      title: "Sandbox",
      icon: Box,
      metric: (
        <Badge variant={sandboxEnabled ? "default" : "secondary"}>
          {sandboxEnabled ? "Enabled" : "Disabled"}
        </Badge>
      ),
      subtitle: networkHosts > 0 ? `${networkHosts} network hosts` : "Default restrictions",
    },
    {
      href: "/hooks",
      title: "Hooks",
      icon: Webhook,
      metric: `${hooks.total}`,
      subtitle: hooks.events > 0 ? `${hooks.events} lifecycle events` : "No hooks configured",
    },
    {
      href: "/plugins",
      title: "Plugins",
      icon: Puzzle,
      metric: `${enabledPlugins} / ${totalPlugins}`,
      subtitle: "plugins enabled",
    },
    {
      href: "/mcps",
      title: "MCPs",
      icon: Plug,
      metric: `${mcpEnabled}`,
      subtitle: mcpEnabled > 0 ? `${mcpHealthy} connected` : "No MCPs configured",
    },
    {
      href: "/commands",
      title: "Commands",
      icon: Terminal,
      metric: `${totalCommands}`,
      subtitle: totalCommands > 0
        ? `${commandCount} commands, ${skillCount} skills`
        : "No commands found",
    },
    {
      href: "/advanced",
      title: "Advanced",
      icon: Wrench,
      metric: `${bashPatterns}`,
      subtitle: "bash patterns",
    },
  ];

  return (
    <>
      <LoadingOverlay isVisible={isLoading && hasData} />
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Settings</h1>
            <p className="text-muted-foreground">
              Overview of your Claude Code configuration.
            </p>
          </div>
          <SyncButton />
        </div>

        {inProject && (
          <Card className="border-purple-500/20 bg-purple-500/5">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-2">
                <Settings className="h-4 w-4 text-purple-500" />
                <span className="text-sm font-medium">Active Project Context</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Showing merged settings from user, project, and project-local scopes.
              </p>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {cards.map((card) => (
            <Link key={card.href} href={card.href}>
              <Card className="hover:bg-muted/50 transition-colors cursor-pointer h-full">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">
                    {card.title}
                  </CardTitle>
                  <card.icon className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{card.metric}</div>
                  <p className="text-xs text-muted-foreground">
                    {card.subtitle}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wrench className="h-5 w-5" />
              Configuration Files
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="p-3 rounded-lg border">
                <div className="text-sm font-medium">User Settings</div>
                <code className="text-xs text-muted-foreground">
                  ~/.claude/settings.json
                </code>
              </div>
              {selectedProjectPath && (
                <>
                  <div className="p-3 rounded-lg border border-purple-500/20 bg-purple-500/5">
                    <div className="text-sm font-medium">Project Settings</div>
                    <code className="text-xs text-muted-foreground">
                      {selectedProjectPath}/settings.json
                    </code>
                  </div>
                  <div className="p-3 rounded-lg border border-amber-500/20 bg-amber-500/5">
                    <div className="text-sm font-medium">Project Local Settings</div>
                    <code className="text-xs text-muted-foreground">
                      {selectedProjectPath}/settings.local.json
                    </code>
                  </div>
                </>
              )}
              <div className="p-3 rounded-lg border">
                <div className="text-sm font-medium">Installed Plugins</div>
                <code className="text-xs text-muted-foreground">
                  ~/.claude/plugins/installed_plugins.json
                </code>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
