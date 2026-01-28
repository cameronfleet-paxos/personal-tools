"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useSettingsStore } from "@/lib/store";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Trash2,
  Plug,
  Info,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Globe,
  Terminal,
  Edit2,
  RefreshCw,
} from "lucide-react";
import { LoadingOverlay } from "@/components/loading-overlay";
import type {
  MCPServerEntry,
  MCPHealthStatus,
  MCPServerConfig,
  MCPServerStdio,
  MCPServerRemote,
  MCPSource,
  MCPsResponse,
  MCPConfigFile,
} from "@/types/settings";

type MCPServerType = "stdio" | "http" | "sse" | "ws";

function isStdioConfig(config: MCPServerConfig): config is MCPServerStdio {
  return "command" in config;
}

function isRemoteConfig(config: MCPServerConfig): config is MCPServerRemote {
  return "url" in config;
}

function getServerType(config: MCPServerConfig): MCPServerType {
  if (isRemoteConfig(config)) {
    return config.type;
  }
  return "stdio";
}

function getServerTypeDisplay(type: MCPServerType): string {
  switch (type) {
    case "stdio":
      return "Command";
    case "http":
      return "HTTP";
    case "sse":
      return "SSE";
    case "ws":
      return "WebSocket";
  }
}

interface SourceBadgeProps {
  source: MCPSource;
  pluginName?: string;
  isInherited?: boolean;
}

function SourceBadge({ source, pluginName, isInherited }: SourceBadgeProps) {
  const config = {
    user: {
      label: "User",
      bgColor: "bg-blue-500/10",
      textColor: "text-blue-600 dark:text-blue-400",
      borderColor: "border-blue-500/30",
    },
    project: {
      label: "Project",
      bgColor: "bg-purple-500/10",
      textColor: "text-purple-600 dark:text-purple-400",
      borderColor: "border-purple-500/30",
    },
    plugin: {
      label: pluginName || "Plugin",
      bgColor: "bg-green-500/10",
      textColor: "text-green-600 dark:text-green-400",
      borderColor: "border-green-500/30",
    },
  };

  const c = config[source];

  return (
    <span className="inline-flex items-center gap-1">
      <span
        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${c.bgColor} ${c.textColor} ${c.borderColor}`}
      >
        {c.label}
      </span>
      {isInherited && (
        <span className="text-xs text-muted-foreground">inherited</span>
      )}
    </span>
  );
}

interface HealthIndicatorProps {
  status: "connected" | "failed" | "unknown";
}

function HealthIndicator({ status }: HealthIndicatorProps) {
  switch (status) {
    case "connected":
      return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    case "failed":
      return <XCircle className="h-4 w-4 text-red-500" />;
    default:
      return <HelpCircle className="h-4 w-4 text-muted-foreground" />;
  }
}

interface KeyValuePair {
  key: string;
  value: string;
}

export default function MCPsPage() {
  const {
    selectedProjectPath,
    isInProjectContext,
    settingsIndex,
    isIndexing,
    isMCPsSyncing,
    refreshIndex,
    refreshMCPs,
  } = useSettingsStore();
  const inProject = isInProjectContext();

  const [projectMCPs, setProjectMCPs] = useState<MCPServerEntry[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingServer, setEditingServer] = useState<MCPServerEntry | null>(null);

  // Form state
  const [formName, setFormName] = useState("");
  const [formType, setFormType] = useState<MCPServerType>("stdio");
  const [formScope, setFormScope] = useState<"user" | "project">("user");
  const [formCommand, setFormCommand] = useState("");
  const [formArgs, setFormArgs] = useState("");
  const [formEnv, setFormEnv] = useState<KeyValuePair[]>([]);
  const [formUrl, setFormUrl] = useState("");
  const [formHeaders, setFormHeaders] = useState<KeyValuePair[]>([]);

  // Get MCPs from store's index
  const mcps = settingsIndex?.mcps;
  const health = useMemo(() => mcps?.health || [], [mcps?.health]);

  // Combine enabled, available, and project MCPs
  const servers = useMemo(() => {
    const all: MCPServerEntry[] = [];
    if (mcps) {
      all.push(...mcps.enabled);
      all.push(...mcps.available);
    }
    all.push(...projectMCPs);
    return all;
  }, [mcps, projectMCPs]);

  const isLoading = isIndexing && !settingsIndex;

  // Load project-specific MCPs if in project context
  const loadProjectMCPs = useCallback(async () => {
    if (!selectedProjectPath) {
      setProjectMCPs([]);
      return;
    }
    try {
      const params = new URLSearchParams({ path: selectedProjectPath });
      const response = await fetch(`/api/mcps?${params.toString()}`);
      const data: MCPsResponse = await response.json();
      // Filter to only project-scoped MCPs
      setProjectMCPs(data.servers.filter((s) => s.source === "project"));
    } catch (error) {
      console.error("Failed to load project MCPs:", error);
    }
  }, [selectedProjectPath]);

  useEffect(() => {
    loadProjectMCPs();
  }, [loadProjectMCPs]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      // Fast refresh first (immediate)
      await refreshIndex();
      await loadProjectMCPs();
      // Then trigger background MCP refresh
      refreshMCPs(); // Fire and forget - don't await
    } finally {
      setIsRefreshing(false);
    }
  };

  const getHealthStatus = (name: string): "connected" | "failed" | "unknown" => {
    const h = health.find((s) => s.name === name);
    return h?.status || "unknown";
  };

  const resetForm = () => {
    setFormName("");
    setFormType("stdio");
    setFormScope(inProject ? "project" : "user");
    setFormCommand("");
    setFormArgs("");
    setFormEnv([]);
    setFormUrl("");
    setFormHeaders([]);
    setEditingServer(null);
  };

  const openAddDialog = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  const openEditDialog = (server: MCPServerEntry) => {
    setEditingServer(server);
    setFormName(server.name);
    setFormScope(server.source === "project" ? "project" : "user");

    if (isStdioConfig(server.config)) {
      setFormType("stdio");
      setFormCommand(server.config.command);
      setFormArgs(server.config.args?.join("\n") || "");
      setFormEnv(
        Object.entries(server.config.env || {}).map(([key, value]) => ({
          key,
          value,
        }))
      );
      setFormUrl("");
      setFormHeaders([]);
    } else if (isRemoteConfig(server.config)) {
      setFormType(server.config.type);
      setFormUrl(server.config.url);
      setFormHeaders(
        Object.entries(server.config.headers || {}).map(([key, value]) => ({
          key,
          value,
        }))
      );
      setFormCommand("");
      setFormArgs("");
      setFormEnv([]);
    }

    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formName.trim()) return;

    setIsSaving(true);
    try {
      let config: MCPServerConfig;

      if (formType === "stdio") {
        const stdioConfig: MCPServerStdio = {
          command: formCommand.trim(),
        };
        if (formArgs.trim()) {
          stdioConfig.args = formArgs.split("\n").map((a) => a.trim()).filter(Boolean);
        }
        if (formEnv.length > 0) {
          stdioConfig.env = {};
          for (const { key, value } of formEnv) {
            if (key.trim()) {
              stdioConfig.env[key.trim()] = value;
            }
          }
        }
        config = stdioConfig;
      } else {
        const remoteConfig: MCPServerRemote = {
          type: formType,
          url: formUrl.trim(),
        };
        if (formHeaders.length > 0) {
          remoteConfig.headers = {};
          for (const { key, value } of formHeaders) {
            if (key.trim()) {
              remoteConfig.headers[key.trim()] = value;
            }
          }
        }
        config = remoteConfig;
      }

      const response = await fetch("/api/mcps", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName.trim(),
          config,
          scope: formScope,
          projectPath: formScope === "project" ? selectedProjectPath : undefined,
        }),
      });

      const result = await response.json();
      if (result.success) {
        setIsDialogOpen(false);
        resetForm();
        // The API already triggers refreshIndex, but we may need project MCPs
        await loadProjectMCPs();
      } else {
        console.error("Failed to save MCP:", result.error);
      }
    } catch (error) {
      console.error("Failed to save MCP:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (server: MCPServerEntry) => {
    if (server.source === "plugin") return;

    setIsSaving(true);
    try {
      const response = await fetch("/api/mcps", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: server.name,
          scope: server.source,
          projectPath: server.source === "project" ? selectedProjectPath : undefined,
        }),
      });

      const result = await response.json();
      if (result.success) {
        // The API already triggers refreshIndex, but we may need project MCPs
        await loadProjectMCPs();
      } else {
        console.error("Failed to delete MCP:", result.error);
      }
    } catch (error) {
      console.error("Failed to delete MCP:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const addKeyValuePair = (type: "env" | "headers") => {
    if (type === "env") {
      setFormEnv([...formEnv, { key: "", value: "" }]);
    } else {
      setFormHeaders([...formHeaders, { key: "", value: "" }]);
    }
  };

  const updateKeyValuePair = (
    type: "env" | "headers",
    index: number,
    field: "key" | "value",
    value: string
  ) => {
    if (type === "env") {
      const updated = [...formEnv];
      updated[index][field] = value;
      setFormEnv(updated);
    } else {
      const updated = [...formHeaders];
      updated[index][field] = value;
      setFormHeaders(updated);
    }
  };

  const removeKeyValuePair = (type: "env" | "headers", index: number) => {
    if (type === "env") {
      setFormEnv(formEnv.filter((_, i) => i !== index));
    } else {
      setFormHeaders(formHeaders.filter((_, i) => i !== index));
    }
  };

  const isInherited = (source: MCPSource): boolean => {
    return inProject && source === "user";
  };

  const filterServers = (filter: "all" | "user" | "project" | "plugin"): MCPServerEntry[] => {
    if (filter === "all") return servers;
    return servers.filter((s) => s.source === filter);
  };

  const isFormValid = (): boolean => {
    if (!formName.trim()) return false;
    if (formType === "stdio" && !formCommand.trim()) return false;
    if (formType !== "stdio" && !formUrl.trim()) return false;
    return true;
  };

  const ServerCard = ({ server }: { server: MCPServerEntry }) => {
    const type = getServerType(server.config);
    const healthStatus = getHealthStatus(server.name);
    const isPlugin = server.source === "plugin";
    const inherited = isInherited(server.source);

    return (
      <div
        className={`flex items-center justify-between p-4 rounded-lg border ${
          inherited ? "bg-muted/30" : ""
        }`}
      >
        <div className="space-y-1 flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <HealthIndicator status={healthStatus} />
            <span className="font-medium">{server.name}</span>
            <Badge variant="outline" className="text-xs">
              {getServerTypeDisplay(type)}
            </Badge>
            <SourceBadge
              source={server.source}
              pluginName={server.pluginName}
              isInherited={inherited}
            />
          </div>
          <div className="text-xs text-muted-foreground truncate">
            {isStdioConfig(server.config) ? (
              <span className="flex items-center gap-1">
                <Terminal className="h-3 w-3" />
                {server.config.command}
                {server.config.args && ` ${server.config.args.join(" ")}`}
              </span>
            ) : isRemoteConfig(server.config) ? (
              <span className="flex items-center gap-1">
                <Globe className="h-3 w-3" />
                {server.config.url}
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-2 ml-4">
          {!isPlugin && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => openEditDialog(server)}
              >
                <Edit2 className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDelete(server)}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </>
          )}
        </div>
      </div>
    );
  };

  const ServerList = ({ filter }: { filter: "all" | "user" | "project" | "plugin" }) => {
    const filteredServers = filterServers(filter);

    if (filteredServers.length === 0) {
      return (
        <div className="text-center py-8 text-muted-foreground">
          No MCP servers configured
        </div>
      );
    }

    return (
      <div className="space-y-2">
        {filteredServers.map((server, index) => (
          <ServerCard key={`${server.source}-${server.name}-${index}`} server={server} />
        ))}
      </div>
    );
  };

  // Show loading state
  if (isLoading && servers.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading MCP servers...</div>
      </div>
    );
  }

  const userCount = filterServers("user").length;
  const projectCount = filterServers("project").length;
  const pluginCount = filterServers("plugin").length;

  return (
    <>
      <LoadingOverlay isVisible={isSaving} />
      <div className="space-y-6 max-w-3xl">
        <div>
          <h1 className="text-2xl font-semibold">MCP Servers</h1>
          <p className="text-muted-foreground">
            Manage Model Context Protocol servers.
          </p>
        </div>

        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            MCPs extend Claude&apos;s capabilities with external tools and data sources.
            Plugin-provided MCPs are read-only.
          </AlertDescription>
        </Alert>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Plug className="h-5 w-5" />
                  Configured Servers
                </CardTitle>
                <CardDescription>
                  {servers.length} server{servers.length !== 1 ? "s" : ""} configured
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                {isMCPsSyncing && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <RefreshCw className="h-3 w-3 animate-spin" />
                    Syncing MCPs...
                  </span>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRefresh}
                  disabled={isRefreshing || isIndexing}
                >
                  <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing || isIndexing ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" onClick={openAddDialog}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Server
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>
                      {editingServer ? "Edit MCP Server" : "Add MCP Server"}
                    </DialogTitle>
                    <DialogDescription>
                      Configure a Model Context Protocol server.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label>Name</Label>
                      <Input
                        value={formName}
                        onChange={(e) => setFormName(e.target.value)}
                        placeholder="my-mcp-server"
                        disabled={!!editingServer}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Type</Label>
                        <Select
                          value={formType}
                          onValueChange={(v) => setFormType(v as MCPServerType)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="stdio">Command (stdio)</SelectItem>
                            <SelectItem value="http">HTTP</SelectItem>
                            <SelectItem value="sse">SSE</SelectItem>
                            <SelectItem value="ws">WebSocket</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label>Scope</Label>
                        <Select
                          value={formScope}
                          onValueChange={(v) => setFormScope(v as "user" | "project")}
                          disabled={!inProject}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="user">User</SelectItem>
                            {inProject && (
                              <SelectItem value="project">Project</SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {formType === "stdio" ? (
                      <>
                        <div className="space-y-2">
                          <Label>Command</Label>
                          <Input
                            value={formCommand}
                            onChange={(e) => setFormCommand(e.target.value)}
                            placeholder="npx"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label>Arguments (one per line)</Label>
                          <Textarea
                            value={formArgs}
                            onChange={(e) => setFormArgs(e.target.value)}
                            placeholder={"-y\n@my/mcp-package"}
                            rows={3}
                          />
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label>Environment Variables</Label>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => addKeyValuePair("env")}
                            >
                              <Plus className="h-3 w-3 mr-1" />
                              Add
                            </Button>
                          </div>
                          {formEnv.map((pair, index) => (
                            <div key={index} className="flex gap-2">
                              <Input
                                placeholder="KEY"
                                value={pair.key}
                                onChange={(e) =>
                                  updateKeyValuePair("env", index, "key", e.target.value)
                                }
                                className="flex-1"
                              />
                              <Input
                                placeholder="value"
                                value={pair.value}
                                onChange={(e) =>
                                  updateKeyValuePair("env", index, "value", e.target.value)
                                }
                                className="flex-1"
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => removeKeyValuePair("env", index)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="space-y-2">
                          <Label>URL</Label>
                          <Input
                            value={formUrl}
                            onChange={(e) => setFormUrl(e.target.value)}
                            placeholder="https://api.example.com/mcp"
                          />
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label>Headers</Label>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => addKeyValuePair("headers")}
                            >
                              <Plus className="h-3 w-3 mr-1" />
                              Add
                            </Button>
                          </div>
                          {formHeaders.map((pair, index) => (
                            <div key={index} className="flex gap-2">
                              <Input
                                placeholder="Header-Name"
                                value={pair.key}
                                onChange={(e) =>
                                  updateKeyValuePair("headers", index, "key", e.target.value)
                                }
                                className="flex-1"
                              />
                              <Input
                                placeholder="value"
                                value={pair.value}
                                onChange={(e) =>
                                  updateKeyValuePair("headers", index, "value", e.target.value)
                                }
                                className="flex-1"
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => removeKeyValuePair("headers", index)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                  <DialogFooter>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setIsDialogOpen(false);
                        resetForm();
                      }}
                    >
                      Cancel
                    </Button>
                    <Button onClick={handleSave} disabled={!isFormValid() || isSaving}>
                      {editingServer ? "Save Changes" : "Add Server"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="all">
              <TabsList className={`grid w-full ${inProject ? "grid-cols-4" : "grid-cols-3"}`}>
                <TabsTrigger value="all">All ({servers.length})</TabsTrigger>
                <TabsTrigger value="user">User ({userCount})</TabsTrigger>
                {inProject && (
                  <TabsTrigger value="project">Project ({projectCount})</TabsTrigger>
                )}
                <TabsTrigger value="plugin">Plugins ({pluginCount})</TabsTrigger>
              </TabsList>
              <TabsContent value="all" className="mt-4">
                <ServerList filter="all" />
              </TabsContent>
              <TabsContent value="user" className="mt-4">
                <ServerList filter="user" />
              </TabsContent>
              {inProject && (
                <TabsContent value="project" className="mt-4">
                  <ServerList filter="project" />
                </TabsContent>
              )}
              <TabsContent value="plugin" className="mt-4">
                <ServerList filter="plugin" />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
