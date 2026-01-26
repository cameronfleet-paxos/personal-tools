"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSettingsStore } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  RefreshCw,
  Clock,
  ExternalLink,
  User,
  CheckCircle2,
} from "lucide-react";
import { ScopeBadge } from "@/components/ui/scope-badge";
import { LoadingOverlay } from "@/components/loading-overlay";

export default function ProjectsPage() {
  const router = useRouter();
  const { settingsIndex, isIndexing, loadIndex, reindex, selectProject, selectedProjectPath } =
    useSettingsStore();

  useEffect(() => {
    loadIndex();
  }, [loadIndex]);

  const handleReindex = async () => {
    await reindex();
  };

  const handleSelectProject = async (path: string | null) => {
    await selectProject(path);
    router.push("/");
  };

  const formatLastIndexed = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleString();
  };

  const formatLastModified = (isoString: string) => {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return "Today";
    } else if (diffDays === 1) {
      return "Yesterday";
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    } else if (diffDays < 30) {
      const weeks = Math.floor(diffDays / 7);
      return `${weeks} week${weeks > 1 ? "s" : ""} ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  // Check if we have data (for initial load vs subsequent re-indexing)
  const hasData = settingsIndex !== null;

  // Show skeleton on initial load when there's no data
  if (isIndexing && !hasData) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-2 text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin" />
          <span>Scanning for projects...</span>
        </div>
      </div>
    );
  }

  return (
    <>
      <LoadingOverlay isVisible={isIndexing && hasData} />
      <div className="space-y-6">
        <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Projects</h1>
          <p className="text-muted-foreground">
            Discovered Claude settings across your home directory.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleReindex}
          disabled={isIndexing}
        >
          {isIndexing ? (
            <>
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              Scanning...
            </>
          ) : (
            <>
              <RefreshCw className="mr-2 h-4 w-4" />
              Re-index
            </>
          )}
        </Button>
      </div>

      {settingsIndex && (
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <Clock className="h-4 w-4" />
            <span>Last indexed: {formatLastIndexed(settingsIndex.lastIndexed)}</span>
          </div>
          <div>
            <Badge variant="secondary">
              {settingsIndex.locations.length} project
              {settingsIndex.locations.length !== 1 ? "s" : ""} found
            </Badge>
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* User Settings Card */}
        <Card
          className={`hover:bg-muted/50 transition-colors cursor-pointer ${
            selectedProjectPath === null ? "ring-2 ring-primary" : ""
          }`}
          onClick={() => handleSelectProject(null)}
        >
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between">
              <CardTitle className="text-base font-medium flex items-center gap-2">
                <User className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                User Settings
              </CardTitle>
              {selectedProjectPath === null && (
                <CheckCircle2 className="h-4 w-4 text-primary" />
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                ~/.claude/
              </p>
              <p className="text-sm text-muted-foreground">
                Base settings inherited by all projects
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Project Cards */}
        {settingsIndex && settingsIndex.locations.map((location) => (
          <Card
            key={location.path}
            className={`hover:bg-muted/50 transition-colors cursor-pointer ${
              selectedProjectPath === location.path ? "ring-2 ring-primary" : ""
            }`}
            onClick={() => handleSelectProject(location.path)}
          >
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between">
                <CardTitle className="text-base font-medium">
                  {location.projectName}
                </CardTitle>
                {selectedProjectPath === location.path ? (
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                ) : (
                  <ExternalLink className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <p
                  className="text-xs text-muted-foreground truncate"
                  title={location.path}
                >
                  {location.path}
                </p>

                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-muted-foreground">+ User</span>
                  {location.hasSettings && (
                    <ScopeBadge scope="project" />
                  )}
                  {location.hasLocalSettings && (
                    <ScopeBadge scope="local" />
                  )}
                </div>

                <p className="text-xs text-muted-foreground">
                  Modified {formatLastModified(location.lastModified)}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      </div>
    </>
  );
}
