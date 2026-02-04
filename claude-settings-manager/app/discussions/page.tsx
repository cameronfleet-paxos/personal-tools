"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useSettingsStore } from "@/lib/store";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  MessageSquare,
  RefreshCw,
  Clock,
  FolderOpen,
  Loader2,
  ChevronRight,
  Filter,
  Star,
} from "lucide-react";
import { LoadingOverlay } from "@/components/loading-overlay";
import type { SessionMetadata } from "@/types/settings";

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;

  const date = new Date(timestamp);
  return date.toLocaleDateString();
}

function DiscussionCard({
  session,
  isFavourite,
  onToggleFavourite,
}: {
  session: SessionMetadata;
  isFavourite: boolean;
  onToggleFavourite: (sessionId: string) => void;
}) {
  const router = useRouter();

  const handleClick = () => {
    router.push(
      `/discussions/${session.sessionId}?project=${encodeURIComponent(session.projectPath)}`
    );
  };

  const handleFavouriteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleFavourite(session.sessionId);
  };

  return (
    <Card
      className="overflow-hidden cursor-pointer hover:bg-accent/50 transition-colors"
      onClick={handleClick}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Badge
                variant="outline"
                className="text-xs bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/30"
              >
                <FolderOpen className="h-3 w-3 mr-1" />
                {session.projectName}
              </Badge>
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatRelativeTime(session.timestamp)}
              </span>
            </div>
            <CardTitle className="text-sm font-normal line-clamp-2">
              {session.firstUserPrompt}
            </CardTitle>
          </div>
          <div className="flex-shrink-0 flex items-center gap-1">
            <button
              onClick={handleFavouriteClick}
              className="p-1 rounded-md hover:bg-accent transition-colors"
              title={isFavourite ? "Remove from favourites" : "Add to favourites"}
            >
              <Star
                className={`h-4 w-4 ${
                  isFavourite
                    ? "fill-yellow-400 text-yellow-400"
                    : "text-muted-foreground"
                }`}
              />
            </button>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </div>
        </div>
      </CardHeader>
    </Card>
  );
}

export default function DiscussionsPage() {
  const {
    discussions,
    discussionsLoading,
    discussionsTotalCount,
    loadDiscussions,
    favourites,
    loadFavourites,
    toggleFavourite,
  } = useSettingsStore();

  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [favouriteFilter, setFavouriteFilter] = useState<"all" | "favourites">("all");

  useEffect(() => {
    loadDiscussions();
    loadFavourites();
  }, [loadDiscussions, loadFavourites]);

  // Extract unique projects from discussions
  const uniqueProjects = useMemo(() => {
    const projectMap = new Map<string, { name: string; path: string; count: number }>();
    for (const session of discussions) {
      const existing = projectMap.get(session.projectPath);
      if (existing) {
        existing.count++;
      } else {
        projectMap.set(session.projectPath, {
          name: session.projectName,
          path: session.projectPath,
          count: 1,
        });
      }
    }
    // Sort by count (most sessions first)
    return Array.from(projectMap.values()).sort((a, b) => b.count - a.count);
  }, [discussions]);

  // Filter discussions by project and favourites
  const filteredDiscussions = useMemo(() => {
    let result = discussions;
    if (projectFilter !== "all") {
      result = result.filter((s) => s.projectPath === projectFilter);
    }
    if (favouriteFilter === "favourites") {
      result = result.filter((s) => favourites.has(s.sessionId));
    }
    return result;
  }, [discussions, projectFilter, favouriteFilter, favourites]);

  const hasData = discussions.length > 0;

  return (
    <>
      <LoadingOverlay isVisible={discussionsLoading && hasData} />
      <div className="space-y-6 max-w-4xl">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Discussions</h1>
            <p className="text-muted-foreground">
              Browse recent Claude Code conversations across all projects.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => loadDiscussions()}
            disabled={discussionsLoading}
          >
            <RefreshCw
              className={`h-4 w-4 mr-2 ${discussionsLoading ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        </div>

        {/* Filters Bar */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <MessageSquare className="h-4 w-4" />
              <span>
                {filteredDiscussions.length}
                {(projectFilter !== "all" || favouriteFilter !== "all") && ` of ${discussions.length}`} session
                {filteredDiscussions.length !== 1 ? "s" : ""}
                {projectFilter === "all" && favouriteFilter === "all" && ` (${discussionsTotalCount} total)`}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant={favouriteFilter === "favourites" ? "default" : "outline"}
              size="sm"
              onClick={() =>
                setFavouriteFilter(favouriteFilter === "favourites" ? "all" : "favourites")
              }
              className={
                favouriteFilter === "favourites"
                  ? "bg-yellow-500 hover:bg-yellow-600 text-white"
                  : ""
              }
            >
              <Star
                className={`h-4 w-4 mr-1 ${
                  favouriteFilter === "favourites" ? "fill-current" : ""
                }`}
              />
              Favourites
            </Button>

            {uniqueProjects.length > 1 && (
              <>
                <Filter className="h-4 w-4 text-muted-foreground" />
                <Select value={projectFilter} onValueChange={setProjectFilter}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Filter by project" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All projects</SelectItem>
                    {uniqueProjects.map((project) => (
                      <SelectItem key={project.path} value={project.path}>
                        {project.name} ({project.count})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            )}
          </div>
        </div>

        {/* Discussions List */}
        {discussionsLoading && !hasData ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <Loader2 className="h-12 w-12 mx-auto mb-4 animate-spin opacity-50" />
              <p className="text-lg font-medium">Loading discussions...</p>
            </CardContent>
          </Card>
        ) : filteredDiscussions.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              {favouriteFilter === "favourites" ? (
                <>
                  <Star className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p className="text-lg font-medium">No favourites yet</p>
                  <p className="text-sm mt-1">
                    Click the star icon on a conversation to add it to your favourites.
                  </p>
                  <Button
                    variant="link"
                    className="mt-2"
                    onClick={() => setFavouriteFilter("all")}
                  >
                    Show all conversations
                  </Button>
                </>
              ) : (
                <>
                  <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p className="text-lg font-medium">
                    {projectFilter !== "all" ? "No discussions in this project" : "No discussions found"}
                  </p>
                  {projectFilter !== "all" ? (
                    <Button
                      variant="link"
                      className="mt-2"
                      onClick={() => setProjectFilter("all")}
                    >
                      Show all projects
                    </Button>
                  ) : (
                    <p className="text-sm mt-1">
                      Conversations are stored in{" "}
                      <code className="bg-muted px-1.5 py-0.5 rounded">
                        ~/.claude/projects/
                      </code>
                    </p>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredDiscussions.map((session) => (
              <DiscussionCard
                key={session.sessionId}
                session={session}
                isFavourite={favourites.has(session.sessionId)}
                onToggleFavourite={toggleFavourite}
              />
            ))}
          </div>
        )}

        {/* Load More */}
        {discussions.length < discussionsTotalCount && (
          <div className="flex justify-center">
            <Button
              variant="outline"
              onClick={() => loadDiscussions(discussions.length + 50)}
              disabled={discussionsLoading}
            >
              Load More Sessions
            </Button>
          </div>
        )}
      </div>
    </>
  );
}
