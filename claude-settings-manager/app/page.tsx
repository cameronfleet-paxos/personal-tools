"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
  AlertTriangle,
  Wrench,
  ShieldAlert,
  Check,
  X,
  RotateCcw,
  Eye,
  EyeOff,
  RefreshCw,
  Trash2,
  ExternalLink,
} from "lucide-react";
import type { RecommendationType, SecuritySeverity, PermissionTimeFilter, ToolExample, TokenMatch } from "@/types/settings";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SyncButton } from "@/components/sync-button";
import { LoadingOverlay } from "@/components/loading-overlay";
import { Skeleton } from "@/components/ui/skeleton";

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

function getSeverityLabel(severity: SecuritySeverity): string {
  return severity.toUpperCase();
}

function getSeverityColor(severity: SecuritySeverity): string {
  switch (severity) {
    case "critical":
      return "bg-red-500/10 text-red-500 border-red-500/20";
    case "high":
      return "bg-orange-500/10 text-orange-500 border-orange-500/20";
    case "medium":
      return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function getScopeLabel(scope: string, projectName?: string): string {
  if (scope === "user") return "User settings";
  if (scope === "project" && projectName) return `${projectName} (project)`;
  if (scope === "project-local" && projectName) return `${projectName} (project-local)`;
  return scope;
}

function formatToolInput(toolName: string, input: Record<string, unknown>): string {
  switch (toolName) {
    case "Bash":
      return (input.command as string) || JSON.stringify(input);
    case "Read":
      return (input.file_path as string) || JSON.stringify(input);
    case "Edit":
      return `editing ${input.file_path as string}`;
    case "Write":
      return `writing ${input.file_path as string}`;
    case "Grep":
      return input.path
        ? `${input.pattern} in ${input.path}`
        : (input.pattern as string) || JSON.stringify(input);
    case "Glob":
      return (input.pattern as string) || JSON.stringify(input);
    case "WebFetch":
      return (input.url as string) || JSON.stringify(input);
    default:
      // For other tools, show a condensed JSON
      const keys = Object.keys(input);
      if (keys.length === 1) {
        const value = input[keys[0]];
        return typeof value === "string" ? value : JSON.stringify(value);
      }
      return JSON.stringify(input).slice(0, 100);
  }
}

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

function isDangerousPattern(pattern: string): boolean {
  // Check for overly broad patterns that could be security risks
  const dangerousPatterns = [
    "*",
    "Bash(*)",
    "Bash:*",
    "bash:*",
    "Bash *",
    "bash *",
    "Edit(*)",
    "Write(*)",
  ];
  return dangerousPatterns.some((p) => pattern.includes(p) || pattern === p);
}

function getToolColor(toolName: string): string {
  switch (toolName) {
    case "Bash":
      return "bg-orange-500/10 text-orange-500 border-orange-500/20";
    case "Read":
      return "bg-blue-500/10 text-blue-500 border-blue-500/20";
    case "Edit":
      return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
    case "Write":
      return "bg-green-500/10 text-green-500 border-green-500/20";
    case "Grep":
      return "bg-cyan-500/10 text-cyan-500 border-cyan-500/20";
    case "Glob":
      return "bg-teal-500/10 text-teal-500 border-teal-500/20";
    case "WebFetch":
      return "bg-indigo-500/10 text-indigo-500 border-indigo-500/20";
    default:
      return "bg-purple-500/10 text-purple-500 border-purple-500/20";
  }
}

function getTokenTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    anthropic_key: "Anthropic API",
    github_token: "GitHub Token",
    jira_token: "Jira Token",
    aws_key: "AWS Key",
    private_key: "Private Key",
    jwt_token: "JWT",
    generic_secret: "Generic Secret",
  };
  return labels[type] || type;
}

function getWorstSeverity(tokens: TokenMatch[]): SecuritySeverity {
  if (tokens.some(t => t.severity === "critical")) return "critical";
  if (tokens.some(t => t.severity === "high")) return "high";
  return "medium";
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
    securityRecommendations,
    securityRecommendationsLoading,
    loadSecurityRecommendations,
    fixSecurityRecommendation,
    tokenScanResults,
    tokenScanMetadata,
    tokenScanLoading,
    loadTokenScan,
    triggerTokenScan,
    removeTokenFinding,
    permissionInterruptions,
    permissionInterruptionsLoading,
    permissionInterruptionsFilter,
    permissionInterruptionsTotalEvents,
    loadPermissionInterruptions,
    setPermissionInterruptionsFilter,
    allowPermissionPattern,
    dismissPermissionInterruption,
    resetDismissedInterruptions,
  } = useSettingsStore();

  const [expandedRec, setExpandedRec] = useState<string | null>(null);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [fixingSecurityId, setFixingSecurityId] = useState<string | null>(null);
  const [removingTokenId, setRemovingTokenId] = useState<string | null>(null);
  const [confirmDeleteToken, setConfirmDeleteToken] = useState<string | null>(null);
  const [allowingPatternId, setAllowingPatternId] = useState<string | null>(null);
  const [dismissingPatternId, setDismissingPatternId] = useState<string | null>(null);
  const [expandedInterruption, setExpandedInterruption] = useState<string | null>(null);
  const [showAllowed, setShowAllowed] = useState(false);
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(new Set());

  const router = useRouter();

  // Filter interruptions based on showAllowed toggle
  const filteredInterruptions = showAllowed
    ? permissionInterruptions
    : permissionInterruptions.filter(i => !i.alreadyInUserScope);

  // Load recommendations on mount
  useEffect(() => {
    loadRecommendations();
    loadSecurityRecommendations();
    loadTokenScan();
    loadPermissionInterruptions();
  }, [loadRecommendations, loadSecurityRecommendations, loadTokenScan, loadPermissionInterruptions]);

  // Check if we have data (for initial load vs subsequent syncs)
  const hasData = effectiveGlobal !== null || localSettings !== null;

  const currentModel = effectiveGlobal?.model || "sonnet";
  const enabledPlugins = Object.values(
    effectiveGlobal?.enabledPlugins || {}
  ).filter(Boolean).length;
  const totalPlugins = Object.keys(plugins?.plugins || {}).length;
  const sandboxEnabled = localSettings?.sandbox?.enabled !== false;
  const totalPermissions =
    (effectiveGlobal?.permissions?.allow?.length || 0) +
    (localSettings?.permissions?.allow?.length || 0);

  // Show skeleton on initial load when there's no data
  if (isLoading && !hasData) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading settings...</div>
      </div>
    );
  }

  return (
    <>
      <LoadingOverlay isVisible={isLoading && hasData} />
      <div className="space-y-6">
        <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-muted-foreground">
            Overview of your Claude Code settings.
          </p>
        </div>
        <SyncButton />
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
      {(recommendations.length > 0 || recommendationsLoading) && (
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
            {recommendationsLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="border rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-1">
                        <Skeleton className="h-5 w-20" />
                        <Skeleton className="h-4 w-48" />
                      </div>
                      <div className="flex items-center gap-2">
                        <Skeleton className="h-5 w-16" />
                        <Skeleton className="h-8 w-20" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <>
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
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Security Issues Section (Unified: patterns + tokens) */}
      {(() => {
        // Group discussion tokens by sessionId
        const groupedBySession = tokenScanResults
          .filter(t => t.location.source === 'discussion')
          .reduce((acc, token) => {
            const sessionId = token.location.sessionId || 'unknown';
            if (!acc.has(sessionId)) {
              acc.set(sessionId, []);
            }
            acc.get(sessionId)!.push(token);
            return acc;
          }, new Map<string, TokenMatch[]>());

        // Settings tokens remain ungrouped
        const settingsTokens = tokenScanResults.filter(t => t.location.source === 'settings');

        // Calculate total unique issues (unique sessions + settings tokens + pattern recommendations)
        const totalIssues = securityRecommendations.length + groupedBySession.size + settingsTokens.length;
        const isScanning = tokenScanMetadata.scanStatus === 'running';
        const lastScanned = tokenScanMetadata.lastScanTimestamp;

        // Sort grouped sessions by severity and token count
        const sortedSessions = Array.from(groupedBySession.entries())
          .map(([sessionId, tokens]) => ({
            sessionId,
            tokens,
            worstSeverity: getWorstSeverity(tokens),
          }))
          .sort((a, b) => {
            const severityOrder = { critical: 0, high: 1, medium: 2 };
            const severityDiff = severityOrder[a.worstSeverity] - severityOrder[b.worstSeverity];
            if (severityDiff !== 0) return severityDiff;
            return b.tokens.length - a.tokens.length;
          });

        const toggleExpanded = (sessionId: string) => {
          setExpandedSessions(prev => {
            const next = new Set(prev);
            if (next.has(sessionId)) {
              next.delete(sessionId);
            } else {
              next.add(sessionId);
            }
            return next;
          });
        };

        return (
          <Card className={totalIssues > 0 ? "border-orange-500/20" : "border-green-500/20"}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div className="flex items-center gap-2">
                {totalIssues > 0 ? (
                  <AlertTriangle className="h-5 w-5 text-orange-500" />
                ) : (
                  <Shield className="h-5 w-5 text-green-500" />
                )}
                <CardTitle className="text-lg">Security Issues</CardTitle>
                {!securityRecommendationsLoading && !tokenScanLoading && (
                  <Badge
                    variant="secondary"
                    className={totalIssues > 0
                      ? "ml-2 bg-orange-500/10 text-orange-500"
                      : "ml-2 bg-green-500/10 text-green-500"
                    }
                  >
                    {totalIssues > 0
                      ? `${totalIssues} issues`
                      : "All clear"
                    }
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                {lastScanned && (
                  <span className="text-xs text-muted-foreground">
                    Last scanned: {formatRelativeTime(lastScanned)}
                  </span>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isScanning}
                  onClick={() => triggerTokenScan()}
                >
                  {isScanning ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      Scanning...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4 mr-1" />
                      Scan Now
                    </>
                  )}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {securityRecommendationsLoading || tokenScanLoading ? (
                <div className="space-y-3">
                  {[1, 2].map((i) => (
                    <div key={i} className="border rounded-lg p-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-2">
                            <Skeleton className="h-5 w-16" />
                            <Skeleton className="h-4 w-32" />
                          </div>
                          <Skeleton className="h-4 w-40" />
                          <Skeleton className="h-6 w-full" />
                          <Skeleton className="h-4 w-56" />
                        </div>
                        <Skeleton className="h-8 w-16" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : totalIssues === 0 ? (
                <div className="flex flex-col items-center justify-center py-6 text-center">
                  <div className="rounded-full bg-green-500/10 p-3 mb-3">
                    <Check className="h-6 w-6 text-green-500" />
                  </div>
                  <p className="text-sm font-medium text-green-600 dark:text-green-400">
                    Looking good! No security issues detected.
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    No dangerous patterns or exposed credentials found.
                  </p>
                </div>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground mb-4">
                    Review these security issues in your settings and conversation history.
                  </p>
                  {/* Combine and sort all issues by severity */}
                  {[...securityRecommendations.map(rec => ({ type: 'pattern' as const, data: rec })),
                    ...sortedSessions.map(session => ({ type: 'grouped-tokens' as const, data: session })),
                    ...settingsTokens.map(token => ({ type: 'settings-token' as const, data: token }))]
                    .sort((a, b) => {
                      const severityOrder = { critical: 0, high: 1, medium: 2 };
                      const getSeverity = (item: typeof a) => {
                        if (item.type === 'pattern') return item.data.severity;
                        if (item.type === 'grouped-tokens') return item.data.worstSeverity;
                        return item.data.severity;
                      };
                      return severityOrder[getSeverity(a)] - severityOrder[getSeverity(b)];
                    })
                    .map((item) => {
                      if (item.type === 'pattern') {
                        const rec = item.data;
                        const isFixing = fixingSecurityId === rec.id;

                        return (
                          <div
                            key={rec.id}
                            className="border rounded-lg p-4 space-y-3"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 space-y-2">
                                <div className="flex items-center gap-2">
                                  <Badge
                                    variant="outline"
                                    className={`shrink-0 font-semibold ${getSeverityColor(rec.severity)}`}
                                  >
                                    {getSeverityLabel(rec.severity)}
                                  </Badge>
                                  <span className="font-medium text-sm">{rec.title}</span>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                  Found in: {getScopeLabel(rec.scope, rec.projectName)}
                                </p>
                                <code className="block text-xs bg-muted px-2 py-1 rounded font-mono">
                                  {rec.pattern}
                                </code>
                                <p className="text-sm text-muted-foreground">
                                  {rec.remediation}
                                </p>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  disabled={isFixing || securityRecommendationsLoading}
                                  onClick={async () => {
                                    setFixingSecurityId(rec.id);
                                    await fixSecurityRecommendation(rec.id);
                                    setFixingSecurityId(null);
                                  }}
                                >
                                  {isFixing ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <>
                                      <Wrench className="h-4 w-4 mr-1" />
                                      Fix
                                    </>
                                  )}
                                </Button>
                              </div>
                            </div>
                          </div>
                        );
                      } else if (item.type === 'grouped-tokens') {
                        // Grouped discussion tokens by session
                        const { sessionId, tokens, worstSeverity } = item.data;
                        const isExpanded = expandedSessions.has(sessionId);
                        const firstToken = tokens[0];
                        const projectName = firstToken.location.projectName || 'Unknown Project';
                        const projectPath = firstToken.location.projectPath || '';

                        // Get unique token types for summary
                        const uniqueTypes = Array.from(new Set(tokens.map(t => t.type)));

                        return (
                          <div
                            key={sessionId}
                            className="border rounded-lg p-4 space-y-3"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 space-y-2">
                                {/* Header - shows worst severity + count */}
                                <div className="flex items-center gap-2 flex-wrap">
                                  <Badge
                                    variant="outline"
                                    className={`shrink-0 font-semibold ${getSeverityColor(worstSeverity)}`}
                                  >
                                    {getSeverityLabel(worstSeverity)}
                                  </Badge>
                                  <Link
                                    href={`/discussions/${sessionId}?project=${encodeURIComponent(projectPath)}`}
                                    className="font-medium text-sm hover:underline"
                                  >
                                    {projectName}
                                  </Link>
                                  <span className="text-muted-foreground text-xs">
                                    {tokens.length} {tokens.length === 1 ? 'token' : 'tokens'} found
                                  </span>
                                </div>

                                {/* Summary - show token types */}
                                <div className="flex items-center gap-2 flex-wrap">
                                  {uniqueTypes.map(type => (
                                    <Badge variant="outline" key={type} className="text-xs">
                                      {getTokenTypeLabel(type)}
                                    </Badge>
                                  ))}
                                </div>

                                {/* Expand/collapse button */}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => toggleExpanded(sessionId)}
                                  className="h-8"
                                >
                                  {isExpanded ? <ChevronUp className="h-4 w-4 mr-1" /> : <ChevronDown className="h-4 w-4 mr-1" />}
                                  {isExpanded ? 'Hide' : 'Show'} details
                                </Button>

                                {/* Expanded: show all tokens */}
                                {isExpanded && (
                                  <div className="mt-4 space-y-2 pl-4 border-l-2">
                                    {tokens.map(token => (
                                      <div key={token.id} className="space-y-1">
                                        <div className="flex items-center gap-2">
                                          <Badge
                                            variant="outline"
                                            className={`shrink-0 ${getSeverityColor(token.severity)}`}
                                          >
                                            {getTokenTypeLabel(token.type)}
                                          </Badge>
                                          <code className="text-xs font-mono">{token.redactedValue}</code>
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                          {token.description}
                                        </p>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>

                              {/* Actions */}
                              <div className="flex items-center gap-2 shrink-0">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => router.push(`/discussions/${sessionId}?project=${encodeURIComponent(projectPath)}`)}
                                >
                                  <ExternalLink className="h-4 w-4 mr-1" />
                                  View
                                </Button>
                                {!confirmDeleteToken && (
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    disabled={removingTokenId !== null || tokenScanLoading}
                                    onClick={() => setConfirmDeleteToken(sessionId)}
                                  >
                                    <Trash2 className="h-4 w-4 mr-1" />
                                    Delete
                                  </Button>
                                )}
                                {confirmDeleteToken === sessionId && (
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-muted-foreground">Delete conversation?</span>
                                    <Button
                                      size="sm"
                                      variant="destructive"
                                      disabled={removingTokenId !== null}
                                      onClick={async () => {
                                        setRemovingTokenId(sessionId);
                                        // Delete using first token's ID and location
                                        await removeTokenFinding(tokens[0].id, tokens[0].location);
                                        setRemovingTokenId(null);
                                        setConfirmDeleteToken(null);
                                      }}
                                    >
                                      {removingTokenId === sessionId ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                      ) : (
                                        'Confirm'
                                      )}
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => setConfirmDeleteToken(null)}
                                    >
                                      Cancel
                                    </Button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      } else {
                        // Settings token (individual)
                        const token = item.data;

                        return (
                          <div
                            key={token.id}
                            className="border rounded-lg p-4 space-y-3"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 space-y-2">
                                <div className="flex items-center gap-2">
                                  <Badge
                                    variant="outline"
                                    className={`shrink-0 font-semibold ${getSeverityColor(token.severity)}`}
                                  >
                                    {getSeverityLabel(token.severity)}
                                  </Badge>
                                  <span className="font-medium text-sm">{token.description}</span>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                  Found in: {getScopeLabel(token.location.scope || '', token.location.projectName)}
                                </p>
                                <code className="block text-xs bg-muted px-2 py-1 rounded font-mono">
                                  {token.redactedValue}
                                </code>
                                <p className="text-sm text-muted-foreground">
                                  {token.remediation}
                                </p>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled
                                  title="Manually edit settings file to remove"
                                >
                                  Manual Fix
                                </Button>
                              </div>
                            </div>
                          </div>
                        );
                      }
                    })}
                </>
              )}
            </CardContent>
          </Card>
        );
      })()}

      {/* Permission Interruptions Section */}
      {(filteredInterruptions.length > 0 || permissionInterruptionsLoading) && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-blue-500" />
              <CardTitle className="text-lg">Top Blocked Commands</CardTitle>
              {permissionInterruptionsTotalEvents > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {permissionInterruptionsTotalEvents} events
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAllowed(!showAllowed)}
              >
                {showAllowed ? <EyeOff className="h-4 w-4 mr-1" /> : <Eye className="h-4 w-4 mr-1" />}
                {showAllowed ? "Hide Allowed" : "Show Allowed"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => resetDismissedInterruptions()}
                disabled={permissionInterruptionsLoading}
                title="Restore dismissed items"
              >
                <RotateCcw className="h-4 w-4 mr-1" />
                Reset
              </Button>
              <Select
                value={permissionInterruptionsFilter}
                onValueChange={(value) =>
                  setPermissionInterruptionsFilter(value as PermissionTimeFilter)
                }
              >
                <SelectTrigger className="w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">Last Day</SelectItem>
                  <SelectItem value="week">Last Week</SelectItem>
                  <SelectItem value="month">Last Month</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {permissionInterruptionsLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="border rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-1">
                        <Skeleton className="h-5 w-16" />
                        <Skeleton className="h-4 w-40" />
                      </div>
                      <div className="flex items-center gap-2">
                        <Skeleton className="h-5 w-10" />
                        <Skeleton className="h-8 w-16" />
                        <Skeleton className="h-8 w-8" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredInterruptions.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No permission interruptions found in the selected time period.
              </p>
            ) : (
              <>
                <p className="text-sm text-muted-foreground mb-4">
                  Commands that required permission prompts. Allow at user level to reduce interruptions.
                </p>
                {filteredInterruptions.slice(0, 5).map((interruption) => {
                  const isExpanded = expandedInterruption === interruption.id;
                  const isAllowing = allowingPatternId === interruption.id;
                  const isDismissing = dismissingPatternId === interruption.id;
                  const projectCount = interruption.projects.length;

                  return (
                    <div
                      key={interruption.id}
                      className="border rounded-lg p-3 space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <Badge variant="outline" className={`shrink-0 ${getToolColor(interruption.toolName)}`}>
                            {interruption.toolName}
                          </Badge>
                          <code className="text-sm font-mono truncate">
                            {interruption.pattern}
                          </code>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge variant="secondary">
                            {interruption.occurrences}x
                          </Badge>
                          {projectCount > 0 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                setExpandedInterruption(isExpanded ? null : interruption.id)
                              }
                            >
                              {isExpanded ? (
                                <ChevronUp className="h-4 w-4" />
                              ) : (
                                <ChevronDown className="h-4 w-4" />
                              )}
                            </Button>
                          )}
                          <Button
                            size="sm"
                            disabled={interruption.alreadyInUserScope || isAllowing || permissionInterruptionsLoading}
                            onClick={async () => {
                              setAllowingPatternId(interruption.id);
                              await allowPermissionPattern(interruption.id);
                              setAllowingPatternId(null);
                            }}
                          >
                            {isAllowing ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : interruption.alreadyInUserScope ? (
                              <>
                                <Check className="h-4 w-4 mr-1" />
                                Allowed
                              </>
                            ) : (
                              "Allow"
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={isDismissing || permissionInterruptionsLoading}
                            onClick={async () => {
                              setDismissingPatternId(interruption.id);
                              await dismissPermissionInterruption(interruption.id);
                              setDismissingPatternId(null);
                            }}
                            title="Dismiss this recommendation"
                          >
                            {isDismissing ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <X className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </div>
                      {isExpanded && (
                        <div className="mt-3 space-y-3">
                          {/* Dangerous pattern warning */}
                          {isDangerousPattern(interruption.pattern) && (
                            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-md p-3">
                              <div className="flex items-start gap-2">
                                <Lightbulb className="h-4 w-4 text-yellow-500 mt-0.5 shrink-0" />
                                <div className="text-sm">
                                  <span className="font-medium text-yellow-500">Tip:</span>{" "}
                                  <span className="text-muted-foreground">
                                    Instead of allowing broad patterns like{" "}
                                    <code className="bg-muted px-1 rounded">{interruption.pattern}</code>,
                                    consider creating specific rules for the commands you need.
                                  </span>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Conversation examples */}
                          {interruption.examples && interruption.examples.length > 0 && (
                            <div className="space-y-2">
                              <div className="text-xs text-muted-foreground font-medium">
                                Recent examples:
                              </div>
                              {interruption.examples.map((example: ToolExample, idx: number) => (
                                <div
                                  key={`example-${idx}`}
                                  className="bg-muted/50 rounded-md p-3 space-y-2"
                                >
                                  <div className="text-xs text-muted-foreground">
                                    {formatRelativeTime(example.timestamp)}
                                  </div>
                                  {example.userPrompt && (
                                    <div className="text-sm">
                                      <span className="text-muted-foreground">User: </span>
                                      <span className="italic">&quot;{example.userPrompt}&quot;</span>
                                    </div>
                                  )}
                                  <div className="flex items-start gap-2">
                                    <Badge variant="outline" className="shrink-0 text-xs">
                                      {interruption.toolName}
                                    </Badge>
                                    <code className="text-xs font-mono break-all">
                                      {formatToolInput(interruption.toolName, example.toolInput)}
                                    </code>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Projects affected */}
                          {projectCount > 0 && (
                            <div className="pl-2 border-l-2 border-muted space-y-1">
                              <div className="text-xs text-muted-foreground mb-1">
                                Projects affected:
                              </div>
                              {interruption.projects.slice(0, 5).map((project, idx) => (
                                <div
                                  key={`${project}-${idx}`}
                                  className="text-sm text-muted-foreground font-mono truncate"
                                >
                                  {project}
                                </div>
                              ))}
                              {projectCount > 5 && (
                                <div className="text-xs text-muted-foreground">
                                  +{projectCount - 5} more projects
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                {filteredInterruptions.length > 5 && (
                  <p className="text-sm text-muted-foreground text-center pt-2">
                    +{filteredInterruptions.length - 5} more commands
                  </p>
                )}
              </>
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
    </>
  );
}
