"use client";

import { useSettingsStore } from "@/lib/store";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  BarChart3,
  MessageSquare,
  Clock,
  Calendar,
  Activity,
  Coins,
} from "lucide-react";

export default function StatsPage() {
  const { stats, isLoading } = useSettingsStore();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading settings...</div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Usage Statistics</h1>
          <p className="text-muted-foreground">
            No usage statistics available yet.
          </p>
        </div>
      </div>
    );
  }

  // Calculate recent activity from dailyActivity
  const recentActivity = stats.dailyActivity?.slice(-7) || [];
  const weekMessages = recentActivity.reduce(
    (sum, day) => sum + (day.messageCount || 0),
    0
  );
  const weekSessions = recentActivity.reduce(
    (sum, day) => sum + (day.sessionCount || 0),
    0
  );
  const weekToolCalls = recentActivity.reduce(
    (sum, day) => sum + (day.toolCallCount || 0),
    0
  );

  // Get peak hour
  const hourCounts = stats.hourCounts || {};
  const peakHour = Object.entries(hourCounts).reduce(
    (max, [hour, count]) =>
      count > (max.count || 0) ? { hour: parseInt(hour), count } : max,
    { hour: 0, count: 0 }
  );

  // Format hour for display
  const formatHour = (hour: number) => {
    if (hour === 0) return "12 AM";
    if (hour < 12) return `${hour} AM`;
    if (hour === 12) return "12 PM";
    return `${hour - 12} PM`;
  };

  // Calculate total cost
  const totalCost = Object.values(stats.modelUsage || {}).reduce(
    (sum, usage) => sum + (usage.costUSD || 0),
    0
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Usage Statistics</h1>
        <p className="text-muted-foreground">
          Last computed: {stats.lastComputedDate || "N/A"}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Sessions</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats.totalSessions?.toLocaleString() || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              {weekSessions} this week
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Messages</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats.totalMessages?.toLocaleString() || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              {weekMessages} this week
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Peak Hour</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatHour(peakHour.hour)}</div>
            <p className="text-xs text-muted-foreground">
              {peakHour.count} messages
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Cost</CardTitle>
            <Coins className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${totalCost.toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground">estimated</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Daily Activity (Last 14 Days)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentActivity.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No recent activity data
              </div>
            ) : (
              <div className="space-y-2">
                {stats.dailyActivity?.slice(-14).map((day) => {
                  const maxMessages = Math.max(
                    ...stats.dailyActivity!.slice(-14).map((d) => d.messageCount || 0)
                  );
                  const percentage =
                    maxMessages > 0
                      ? ((day.messageCount || 0) / maxMessages) * 100
                      : 0;

                  return (
                    <div key={day.date} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">
                          {new Date(day.date).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                        <span className="font-medium">
                          {day.messageCount || 0} msgs
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Model Usage</CardTitle>
            <CardDescription>Token usage by model</CardDescription>
          </CardHeader>
          <CardContent>
            {Object.keys(stats.modelUsage || {}).length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No model usage data
              </div>
            ) : (
              <div className="space-y-4">
                {Object.entries(stats.modelUsage || {}).map(
                  ([model, usage]) => (
                    <div key={model} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm truncate max-w-[200px]">
                          {model.replace("claude-", "").split("-").slice(0, 2).join(" ")}
                        </span>
                        {usage.costUSD && (
                          <Badge variant="secondary">
                            ${usage.costUSD.toFixed(2)}
                          </Badge>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                        <div>
                          Input: {((usage.inputTokens || 0) / 1000).toFixed(1)}K
                        </div>
                        <div>
                          Output: {((usage.outputTokens || 0) / 1000).toFixed(1)}K
                        </div>
                        {usage.cacheReadInputTokens && (
                          <div>
                            Cache Read:{" "}
                            {(usage.cacheReadInputTokens / 1000).toFixed(1)}K
                          </div>
                        )}
                        {usage.webSearchRequests && (
                          <div>Web Searches: {usage.webSearchRequests}</div>
                        )}
                      </div>
                    </div>
                  )
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Session History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">First Session</span>
              <span className="font-medium">
                {stats.firstSessionDate
                  ? new Date(stats.firstSessionDate).toLocaleDateString()
                  : "N/A"}
              </span>
            </div>
            {stats.longestSession && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Longest Session</span>
                <span className="font-medium">
                  {stats.longestSession.messages} messages
                  {stats.longestSession.project && (
                    <span className="text-muted-foreground ml-1">
                      ({stats.longestSession.project})
                    </span>
                  )}
                </span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Tool Calls This Week</span>
              <span className="font-medium">{weekToolCalls}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
