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
  Terminal,
  RefreshCw,
  User,
  FolderOpen,
  Search,
  FileText,
  Clock,
  Sparkles,
} from "lucide-react";
import type { CommandEntry } from "@/types/settings";

function truncatePath(filePath: string): string {
  const homeDir = process.env.HOME || process.env.USERPROFILE || "";
  if (homeDir && filePath.startsWith(homeDir)) {
    return "~" + filePath.slice(homeDir.length);
  }
  return filePath;
}

function groupCommandsByNamespace(commands: CommandEntry[]): Map<string, CommandEntry[]> {
  const groups = new Map<string, CommandEntry[]>();

  for (const cmd of commands) {
    const colonIndex = cmd.name.indexOf(":");
    const namespace = colonIndex > 0 ? cmd.name.substring(0, colonIndex) : "";

    if (!groups.has(namespace)) {
      groups.set(namespace, []);
    }
    groups.get(namespace)!.push(cmd);
  }

  return groups;
}

function formatLastIndexed(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const date = new Date(dateStr);
  return date.toLocaleString();
}

export default function CommandsPage() {
  const {
    commands,
    commandsLastIndexed,
    commandsSearchQuery,
    commandsSourceFilter,
    commandsTypeFilter,
    filteredCommands,
    setCommandsSearchQuery,
    setCommandsSourceFilter,
    setCommandsTypeFilter,
    reindex,
    isIndexing,
  } = useSettingsStore();

  const filtered = filteredCommands();
  const grouped = groupCommandsByNamespace(filtered);
  const userCount = commands.filter((c) => c.source === "user").length;
  const projectCount = commands.filter((c) => c.source === "project").length;
  const commandCount = commands.filter((c) => c.type === "command").length;
  const skillCount = commands.filter((c) => c.type === "skill").length;

  // Sort namespace keys: empty string (ungrouped) last, then alphabetically
  const sortedNamespaces = Array.from(grouped.keys()).sort((a, b) => {
    if (a === "" && b !== "") return 1;
    if (b === "" && a !== "") return -1;
    return a.localeCompare(b);
  });

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Commands & Skills</h1>
          <p className="text-muted-foreground">
            Browse and search your Claude Code commands and skills.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => reindex()}
          disabled={isIndexing}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isIndexing ? "animate-spin" : ""}`} />
          Re-index
        </Button>
      </div>

      {/* Stats Bar */}
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <div className="flex items-center gap-1">
          <Clock className="h-4 w-4" />
          <span>Last indexed: {formatLastIndexed(commandsLastIndexed)}</span>
        </div>
        <span className="text-muted-foreground/50">|</span>
        <div className="flex items-center gap-1">
          <Terminal className="h-4 w-4" />
          <span>{commandCount} command{commandCount !== 1 ? "s" : ""}</span>
        </div>
        <span className="text-muted-foreground/50">|</span>
        <div className="flex items-center gap-1">
          <Sparkles className="h-4 w-4" />
          <span>{skillCount} skill{skillCount !== 1 ? "s" : ""}</span>
        </div>
        <span className="text-muted-foreground/50">|</span>
        <div className="flex items-center gap-1">
          <User className="h-3 w-3" />
          <span>{userCount} user</span>
        </div>
        <span className="text-muted-foreground/50">|</span>
        <div className="flex items-center gap-1">
          <FolderOpen className="h-3 w-3" />
          <span>{projectCount} project</span>
        </div>
      </div>

      {/* Search and Filter */}
      <div className="flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or description..."
            value={commandsSearchQuery}
            onChange={(e) => setCommandsSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select
          value={commandsTypeFilter}
          onValueChange={(value) => setCommandsTypeFilter(value as "all" | "command" | "skill")}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Filter type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="command">Commands</SelectItem>
            <SelectItem value="skill">Skills</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={commandsSourceFilter}
          onValueChange={(value) => setCommandsSourceFilter(value as "all" | "user" | "project")}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Filter source" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sources</SelectItem>
            <SelectItem value="user">User Only</SelectItem>
            <SelectItem value="project">Project Only</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Commands Grid */}
      {commands.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Terminal className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg font-medium">No commands or skills found</p>
            <p className="text-sm mt-1">
              Commands: <code className="bg-muted px-1.5 py-0.5 rounded">~/.claude/commands/</code> or <code className="bg-muted px-1.5 py-0.5 rounded">.claude/commands/</code>
            </p>
            <p className="text-sm mt-1">
              Skills: <code className="bg-muted px-1.5 py-0.5 rounded">~/.claude/skills/</code> or <code className="bg-muted px-1.5 py-0.5 rounded">.claude/skills/</code>
            </p>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg font-medium">No matching results</p>
            <p className="text-sm mt-1">
              Try adjusting your search or filter criteria.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {sortedNamespaces.map((namespace) => {
            const namespaceCommands = grouped.get(namespace)!;
            const groupTitle = namespace || "Ungrouped";

            return (
              <Card key={namespace}>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Terminal className="h-5 w-5" />
                    {groupTitle}
                  </CardTitle>
                  <CardDescription>
                    {namespaceCommands.length} item{namespaceCommands.length !== 1 ? "s" : ""}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3">
                    {namespaceCommands.map((cmd) => (
                      <div
                        key={cmd.filePath}
                        className="flex flex-col gap-2 p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-center gap-2">
                            <code className="text-sm font-semibold text-primary">
                              /{cmd.name}
                            </code>
                            {cmd.type === "skill" ? (
                              <Badge variant="default" className="text-xs bg-purple-600 hover:bg-purple-700">
                                <Sparkles className="h-3 w-3 mr-1" />
                                Skill
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="text-xs">
                                <Terminal className="h-3 w-3 mr-1" />
                                Command
                              </Badge>
                            )}
                            {cmd.source === "user" ? (
                              <Badge variant="outline" className="text-xs">
                                <User className="h-3 w-3 mr-1" />
                                User
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-xs">
                                <FolderOpen className="h-3 w-3 mr-1" />
                                Project
                              </Badge>
                            )}
                          </div>
                          {cmd.metadata.argumentHint && (
                            <code className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                              {cmd.metadata.argumentHint}
                            </code>
                          )}
                        </div>

                        <p className="text-sm text-muted-foreground">
                          {cmd.metadata.description || "No description available"}
                        </p>

                        <div className="flex items-center gap-1 text-xs text-muted-foreground/70">
                          <FileText className="h-3 w-3" />
                          <span className="truncate">{truncatePath(cmd.filePath)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
