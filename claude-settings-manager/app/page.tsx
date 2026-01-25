"use client";

import { useSettingsStore } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { Brain, Shield, Box, Puzzle, BarChart3, ArrowRight } from "lucide-react";

export default function DashboardPage() {
  const { localSettings, plugins, stats, isLoading, effectiveGlobal } =
    useSettingsStore();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading settings...</div>
      </div>
    );
  }

  const currentModel = effectiveGlobal?.model || "sonnet";
  const enabledPlugins = Object.values(
    effectiveGlobal?.enabledPlugins || {}
  ).filter(Boolean).length;
  const totalPlugins = Object.keys(plugins?.plugins || {}).length;
  const sandboxEnabled = localSettings?.sandbox?.enabled !== false;
  const totalPermissions =
    (effectiveGlobal?.permissions?.allow?.length || 0) +
    (localSettings?.permissions?.allow?.length || 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-muted-foreground">
          Overview of your Claude Code settings.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Link href="/model">
          <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">
                Current Model
              </CardTitle>
              <Brain className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold capitalize">{currentModel}</div>
              <p className="text-xs text-muted-foreground">
                {effectiveGlobal?.alwaysThinkingEnabled
                  ? "Extended thinking enabled"
                  : "Standard mode"}
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/plugins">
          <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">
                Active Plugins
              </CardTitle>
              <Puzzle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {enabledPlugins} / {totalPlugins}
              </div>
              <p className="text-xs text-muted-foreground">plugins enabled</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/sandbox">
          <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Sandbox</CardTitle>
              <Box className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <Badge variant={sandboxEnabled ? "default" : "secondary"}>
                {sandboxEnabled ? "Enabled" : "Disabled"}
              </Badge>
              <p className="text-xs text-muted-foreground mt-1">
                execution restrictions
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/permissions">
          <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Permissions</CardTitle>
              <Shield className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalPermissions}</div>
              <p className="text-xs text-muted-foreground">
                allow rules configured
              </p>
            </CardContent>
          </Card>
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Quick Links</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {[
              { href: "/model", label: "Change model", icon: Brain },
              { href: "/permissions", label: "Manage permissions", icon: Shield },
              { href: "/plugins", label: "Configure plugins", icon: Puzzle },
              { href: "/stats", label: "View usage stats", icon: BarChart3 },
            ].map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <link.icon className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{link.label}</span>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            ))}
          </CardContent>
        </Card>

        {stats && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Usage Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Sessions</span>
                  <span className="font-medium">
                    {stats.totalSessions?.toLocaleString() || 0}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Messages</span>
                  <span className="font-medium">
                    {stats.totalMessages?.toLocaleString() || 0}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">First Session</span>
                  <span className="font-medium">
                    {stats.firstSessionDate
                      ? new Date(stats.firstSessionDate).toLocaleDateString()
                      : "N/A"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Last Updated</span>
                  <span className="font-medium">
                    {stats.lastComputedDate || "N/A"}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
