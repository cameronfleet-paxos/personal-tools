"use client";

import { useEffect, useState } from "react";
import { useSettingsStore } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import {
  Brain,
  Shield,
  Box,
  Puzzle,
  BarChart3,
  ArrowRight,
  Lightbulb,
  ChevronDown,
  ChevronUp,
  ArrowUpRight,
  Loader2,
} from "lucide-react";
import type { RecommendationType } from "@/types/settings";

function getTypeLabel(type: RecommendationType): string {
  switch (type) {
    case "permission-allow":
      return "Allow";
    case "permission-deny":
      return "Deny";
    case "permission-ask":
      return "Ask";
    case "sandbox-host":
      return "Host";
    case "sandbox-path":
      return "Path";
    case "sandbox-socket":
      return "Socket";
    default:
      return type;
  }
}

function getTypeColor(type: RecommendationType): string {
  switch (type) {
    case "permission-allow":
      return "bg-green-500/10 text-green-500";
    case "permission-deny":
      return "bg-red-500/10 text-red-500";
    case "permission-ask":
      return "bg-yellow-500/10 text-yellow-500";
    case "sandbox-host":
    case "sandbox-path":
    case "sandbox-socket":
      return "bg-blue-500/10 text-blue-500";
    default:
      return "bg-muted text-muted-foreground";
  }
}

export default function DashboardPage() {
  const {
    localSettings,
    plugins,
    stats,
    isLoading,
    effectiveGlobal,
    recommendations,
    recommendationsLoading,
    analyzedProjects,
    loadRecommendations,
    applyRecommendation,
  } = useSettingsStore();

  const [expandedRec, setExpandedRec] = useState<string | null>(null);
  const [applyingId, setApplyingId] = useState<string | null>(null);

  // Load recommendations on mount
  useEffect(() => {
    loadRecommendations();
  }, [loadRecommendations]);

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

      {/* Recommendations Section */}
      {recommendations.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div className="flex items-center gap-2">
              <Lightbulb className="h-5 w-5 text-yellow-500" />
              <CardTitle className="text-lg">Recommendations</CardTitle>
              <Badge variant="secondary" className="ml-2">
                {recommendations.length}
              </Badge>
            </div>
            <span className="text-xs text-muted-foreground">
              Analyzed {analyzedProjects} projects
            </span>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground mb-4">
              These settings appear in multiple projects. Promote them to user scope for consistency.
            </p>
            {recommendations.slice(0, 5).map((rec) => {
              const isExpanded = expandedRec === rec.id;
              const isApplying = applyingId === rec.id;
              const uniqueProjects = new Set(rec.occurrences.map((o) => o.projectPath));

              return (
                <div
                  key={rec.id}
                  className="border rounded-lg p-3 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <Badge
                        variant="outline"
                        className={`shrink-0 ${getTypeColor(rec.settingType)}`}
                      >
                        {getTypeLabel(rec.settingType)}
                      </Badge>
                      <code className="text-sm font-mono truncate">{rec.value}</code>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="secondary">
                        {uniqueProjects.size} projects
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setExpandedRec(isExpanded ? null : rec.id)}
                      >
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        size="sm"
                        disabled={rec.alreadyInUser || isApplying || recommendationsLoading}
                        onClick={async () => {
                          setApplyingId(rec.id);
                          await applyRecommendation(rec.id);
                          setApplyingId(null);
                        }}
                      >
                        {isApplying ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : rec.alreadyInUser ? (
                          "Already in User"
                        ) : (
                          <>
                            <ArrowUpRight className="h-4 w-4 mr-1" />
                            Promote
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="mt-2 pl-2 border-l-2 border-muted space-y-1">
                      {rec.occurrences.map((occ, idx) => (
                        <div
                          key={`${occ.projectPath}-${occ.scope}-${idx}`}
                          className="text-sm text-muted-foreground flex items-center gap-2"
                        >
                          <span className="font-medium">{occ.projectName}</span>
                          <Badge variant="outline" className="text-xs">
                            {occ.scope}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {recommendations.length > 5 && (
              <p className="text-sm text-muted-foreground text-center pt-2">
                +{recommendations.length - 5} more recommendations
              </p>
            )}
          </CardContent>
        </Card>
      )}

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
