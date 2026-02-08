"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
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
import { Input } from "@/components/ui/input";
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
  Search,
  X,
} from "lucide-react";
import { LoadingOverlay } from "@/components/loading-overlay";
import { DeepSearchProgress } from "@/components/deep-search-progress";
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

/**
 * Highlight search term within text by wrapping matches in <mark> tags.
 */
function HighlightedText({ text, search }: { text: string; search: string }) {
  if (!search || search.length < 2) return <>{text}</>;

  const searchLower = search.toLowerCase();
  const textLower = text.toLowerCase();
  const parts: Array<{ text: string; highlighted: boolean }> = [];

  let lastIndex = 0;
  let matchIndex = textLower.indexOf(searchLower, lastIndex);

  while (matchIndex !== -1) {
    if (matchIndex > lastIndex) {
      parts.push({ text: text.slice(lastIndex, matchIndex), highlighted: false });
    }
    parts.push({
      text: text.slice(matchIndex, matchIndex + search.length),
      highlighted: true,
    });
    lastIndex = matchIndex + search.length;
    matchIndex = textLower.indexOf(searchLower, lastIndex);
  }

  if (lastIndex < text.length) {
    parts.push({ text: text.slice(lastIndex), highlighted: false });
  }

  return (
    <>
      {parts.map((part, i) =>
        part.highlighted ? (
          <mark key={i} className="bg-yellow-200 dark:bg-yellow-800 rounded-sm px-0.5">
            {part.text}
          </mark>
        ) : (
          <span key={i}>{part.text}</span>
        )
      )}
    </>
  );
}

function DiscussionCard({
  session,
  isFavourite,
  onToggleFavourite,
  searchQuery,
  isDeepSearchOnly,
}: {
  session: SessionMetadata;
  isFavourite: boolean;
  onToggleFavourite: (sessionId: string) => void;
  searchQuery: string;
  isDeepSearchOnly: boolean;
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
              {isDeepSearchOnly && (
                <Badge
                  variant="outline"
                  className="text-xs bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30"
                >
                  Conversation match
                </Badge>
              )}
            </div>
            <CardTitle className="text-sm font-normal line-clamp-2">
              {session.firstUserPrompt}
            </CardTitle>
            {session.matchContext && (
              <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">
                <HighlightedText text={session.matchContext} search={searchQuery} />
              </p>
            )}
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
    discussionsSearchQuery,
    discussionsProjectFilter,
    discussionsProjects,
    discussionsIndexedCount,
    loadDiscussions,
    setDiscussionsSearchQuery,
    setDiscussionsProjectFilter,
    favourites,
    favouriteSessions,
    loadFavourites,
    toggleFavourite,
    // Deep search
    deepSearchResults,
    deepSearching,
    deepSearchProgress,
    deepSearchComplete,
    deepSearchTotalMatches,
    deepSearchDurationMs,
    startDeepSearch,
    cancelDeepSearch,
    clearDeepSearch,
  } = useSettingsStore();

  const [searchInput, setSearchInput] = useState(discussionsSearchQuery);
  const [favouriteFilter, setFavouriteFilter] = useState<"all" | "favourites">("all");
  const indexDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deepSearchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialLoadDone = useRef(false);

  // Initial load
  useEffect(() => {
    if (!initialLoadDone.current) {
      initialLoadDone.current = true;
      loadDiscussions();
      loadFavourites();
    }
  }, [loadDiscussions, loadFavourites]);

  // Debounce search input -> store (200ms for index search)
  useEffect(() => {
    if (indexDebounceRef.current) {
      clearTimeout(indexDebounceRef.current);
    }
    indexDebounceRef.current = setTimeout(() => {
      setDiscussionsSearchQuery(searchInput);
    }, 200);
    return () => {
      if (indexDebounceRef.current) {
        clearTimeout(indexDebounceRef.current);
      }
    };
  }, [searchInput, setDiscussionsSearchQuery]);

  // Reload when search query or project filter changes (after debounce)
  useEffect(() => {
    // Skip the initial render (handled by initial load above)
    if (!initialLoadDone.current) return;
    loadDiscussions();
  }, [discussionsSearchQuery, discussionsProjectFilter, loadDiscussions]);

  // Deep search effect: triggered with 600ms debounce when project is selected and search >= 3 chars
  useEffect(() => {
    // Clear any pending deep search debounce
    if (deepSearchDebounceRef.current) {
      clearTimeout(deepSearchDebounceRef.current);
      deepSearchDebounceRef.current = null;
    }

    // Cancel any in-progress deep search when inputs change
    cancelDeepSearch();

    // Only trigger deep search when a specific project is selected and search is long enough
    if (discussionsProjectFilter === "all" || !discussionsSearchQuery || discussionsSearchQuery.length < 3) {
      clearDeepSearch();
      return;
    }

    deepSearchDebounceRef.current = setTimeout(() => {
      startDeepSearch(discussionsProjectFilter, discussionsSearchQuery);
    }, 600);

    return () => {
      if (deepSearchDebounceRef.current) {
        clearTimeout(deepSearchDebounceRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [discussionsSearchQuery, discussionsProjectFilter]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelDeepSearch();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleProjectFilterChange = useCallback(
    (value: string) => {
      setDiscussionsProjectFilter(value);
    },
    [setDiscussionsProjectFilter]
  );

  const handleRefresh = useCallback(() => {
    loadDiscussions({ rebuild: true });
  }, [loadDiscussions]);

  const handleClearSearch = useCallback(() => {
    setSearchInput("");
    setDiscussionsSearchQuery("");
    clearDeepSearch();
  }, [setDiscussionsSearchQuery, clearDeepSearch]);

  // Merge index results with deep search results, deduplicating by sessionId
  const mergedResults = useMemo(() => {
    const indexSessionIds = new Set(discussions.map((s) => s.sessionId));
    const deepOnly = deepSearchResults.filter((s) => !indexSessionIds.has(s.sessionId));

    // For index results that also have deep search matches, add the match context
    const enrichedIndex = discussions.map((session) => {
      const deepMatch = deepSearchResults.find((d) => d.sessionId === session.sessionId);
      if (deepMatch) {
        return {
          ...session,
          matchContext: deepMatch.matchContext,
          matchRole: deepMatch.matchRole,
        };
      }
      return session;
    });

    return [...enrichedIndex, ...deepOnly];
  }, [discussions, deepSearchResults]);

  // Track which sessionIds are deep-search-only (not in index results)
  const deepSearchOnlyIds = useMemo(() => {
    const indexSessionIds = new Set(discussions.map((s) => s.sessionId));
    return new Set(deepSearchResults.filter((s) => !indexSessionIds.has(s.sessionId)).map((s) => s.sessionId));
  }, [discussions, deepSearchResults]);

  // When favourites filter is active, use favouriteSessions directly from the API
  // (not filtered from mergedResults) so ALL favourites appear regardless of pagination
  const filteredDiscussions = useMemo(() => {
    if (favouriteFilter === "favourites") {
      return favouriteSessions;
    }
    return mergedResults;
  }, [mergedResults, favouriteFilter, favouriteSessions]);

  const hasData = discussions.length > 0 || deepSearchResults.length > 0;
  const isFiltering = discussionsSearchQuery || discussionsProjectFilter !== "all";
  const hasDeepResults = deepSearchResults.length > 0;
  const showDeepSearchProgress = deepSearching || deepSearchComplete;

  // Count text
  const countText = useMemo(() => {
    const showing = filteredDiscussions.length;
    const indexMatching = discussionsTotalCount;
    const total = discussionsIndexedCount;

    if (hasDeepResults && isFiltering) {
      const titleMatches = discussions.length;
      const convMatches = deepSearchResults.filter(
        (d) => !discussions.some((s) => s.sessionId === d.sessionId)
      ).length;
      if (convMatches > 0) {
        return `${titleMatches} from titles, ${convMatches} from conversations (${total} total)`;
      }
    }

    if (isFiltering || favouriteFilter === "favourites") {
      return `${showing} of ${indexMatching} matching (${total} total)`;
    }
    if (showing < total) {
      return `${showing} of ${total} sessions`;
    }
    return `${total} session${total !== 1 ? "s" : ""}`;
  }, [filteredDiscussions.length, discussionsTotalCount, discussionsIndexedCount, isFiltering, favouriteFilter, hasDeepResults, discussions, deepSearchResults]);

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
            onClick={handleRefresh}
            disabled={discussionsLoading}
          >
            <RefreshCw
              className={`h-4 w-4 mr-2 ${discussionsLoading ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        </div>

        {/* Search + Filters Bar */}
        <div className="flex flex-col gap-4">
          <div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search conversations..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-9 pr-9"
              />
              {searchInput && (
                <button
                  onClick={handleClearSearch}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            {showDeepSearchProgress && (
              <DeepSearchProgress
                searching={deepSearching}
                progress={deepSearchProgress}
                complete={deepSearchComplete}
                totalMatches={deepSearchTotalMatches}
                durationMs={deepSearchDurationMs}
                onCancel={cancelDeepSearch}
                onClear={clearDeepSearch}
              />
            )}
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-1">
                <MessageSquare className="h-4 w-4" />
                <span>{countText}</span>
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

              {discussionsProjects.length > 1 && (
                <>
                  <Filter className="h-4 w-4 text-muted-foreground" />
                  <Select value={discussionsProjectFilter} onValueChange={handleProjectFilterChange}>
                    <SelectTrigger className="w-[200px]">
                      <SelectValue placeholder="Filter by project" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All projects</SelectItem>
                      {discussionsProjects.map((project) => (
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
              ) : discussionsSearchQuery ? (
                <>
                  <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p className="text-lg font-medium">
                    No conversations matching &quot;{discussionsSearchQuery}&quot;
                  </p>
                  {discussionsProjectFilter === "all" && discussionsSearchQuery.length >= 3 && (
                    <p className="text-sm mt-1">
                      Select a project to search full conversation content.
                    </p>
                  )}
                  <Button
                    variant="link"
                    className="mt-2"
                    onClick={handleClearSearch}
                  >
                    Clear search
                  </Button>
                </>
              ) : (
                <>
                  <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p className="text-lg font-medium">
                    {discussionsProjectFilter !== "all" ? "No discussions in this project" : "No discussions found"}
                  </p>
                  {discussionsProjectFilter !== "all" ? (
                    <Button
                      variant="link"
                      className="mt-2"
                      onClick={() => handleProjectFilterChange("all")}
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
                searchQuery={discussionsSearchQuery}
                isDeepSearchOnly={deepSearchOnlyIds.has(session.sessionId)}
              />
            ))}
          </div>
        )}

        {/* Load More */}
        {discussions.length < discussionsTotalCount && (
          <div className="flex justify-center">
            <Button
              variant="outline"
              onClick={() => loadDiscussions({ limit: discussions.length + 50 })}
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
