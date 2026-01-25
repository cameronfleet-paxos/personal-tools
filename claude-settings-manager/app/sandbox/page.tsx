"use client";

import { useState } from "react";
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
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ScopeBadge } from "@/components/ui/scope-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
  Plus,
  Trash2,
  FolderOpen,
  Globe,
  AlertTriangle,
  Shield,
} from "lucide-react";
import type { SettingsTarget, Settings } from "@/types/settings";

interface SandboxItem {
  value: string;
  source: SettingsTarget;
}

export default function SandboxPage() {
  const {
    updateSetting,
    isLoading,
    effectiveUser,
    effectiveProject,
    effectiveProjectLocal,
    isInProjectContext,
  } = useSettingsStore();

  const inProject = isInProjectContext();

  const [newPath, setNewPath] = useState("");
  const [newDenyPath, setNewDenyPath] = useState("");
  const [newHost, setNewHost] = useState("");
  const [newSocket, setNewSocket] = useState("");
  const [isPathDialogOpen, setIsPathDialogOpen] = useState(false);
  const [isDenyPathDialogOpen, setIsDenyPathDialogOpen] = useState(false);
  const [isHostDialogOpen, setIsHostDialogOpen] = useState(false);
  const [isSocketDialogOpen, setIsSocketDialogOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading settings...</div>
      </div>
    );
  }

  // Helper to get items from a specific source
  const getPathsFromSource = (settings: Settings | null, source: SettingsTarget): SandboxItem[] => {
    return (settings?.sandbox?.filesystem?.write?.allowOnly || []).map((value) => ({
      value,
      source,
    }));
  };

  const getDenyPathsFromSource = (settings: Settings | null, source: SettingsTarget): SandboxItem[] => {
    return (settings?.sandbox?.filesystem?.read?.denyOnly || []).map((value) => ({
      value,
      source,
    }));
  };

  const getHostsFromSource = (settings: Settings | null, source: SettingsTarget): SandboxItem[] => {
    return (settings?.sandbox?.network?.allowedHosts || []).map((value) => ({
      value,
      source,
    }));
  };

  const getSocketsFromSource = (settings: Settings | null, source: SettingsTarget): SandboxItem[] => {
    return (settings?.sandbox?.network?.allowUnixSockets || []).map((value) => ({
      value,
      source,
    }));
  };

  // Collect items from all sources (user-local removed)
  const getAllPaths = (): SandboxItem[] => {
    if (inProject) {
      return [
        ...getPathsFromSource(effectiveUser, "user"),
        ...getPathsFromSource(effectiveProject, "project"),
        ...getPathsFromSource(effectiveProjectLocal, "project-local"),
      ];
    }
    return [
      ...getPathsFromSource(effectiveUser, "user"),
    ];
  };

  const getAllDenyPaths = (): SandboxItem[] => {
    if (inProject) {
      return [
        ...getDenyPathsFromSource(effectiveUser, "user"),
        ...getDenyPathsFromSource(effectiveProject, "project"),
        ...getDenyPathsFromSource(effectiveProjectLocal, "project-local"),
      ];
    }
    return [
      ...getDenyPathsFromSource(effectiveUser, "user"),
    ];
  };

  const getAllHosts = (): SandboxItem[] => {
    if (inProject) {
      return [
        ...getHostsFromSource(effectiveUser, "user"),
        ...getHostsFromSource(effectiveProject, "project"),
        ...getHostsFromSource(effectiveProjectLocal, "project-local"),
      ];
    }
    return [
      ...getHostsFromSource(effectiveUser, "user"),
    ];
  };

  const getAllSockets = (): SandboxItem[] => {
    if (inProject) {
      return [
        ...getSocketsFromSource(effectiveUser, "user"),
        ...getSocketsFromSource(effectiveProject, "project"),
        ...getSocketsFromSource(effectiveProjectLocal, "project-local"),
      ];
    }
    return [
      ...getSocketsFromSource(effectiveUser, "user"),
    ];
  };

  // Get settings object for a given target (user-local removed)
  const getSettingsForTarget = (target: SettingsTarget): Settings => {
    switch (target) {
      case "user":
        return effectiveUser;
      case "project":
        return effectiveProject;
      case "project-local":
        return effectiveProjectLocal;
    }
  };

  // Default target for new items
  const defaultTarget: SettingsTarget = inProject ? "project" : "user";

  // Get sandbox settings with priority (project-local > project > user)
  // user-local removed - doesn't exist per Claude Code docs
  const getSandboxEnabledSetting = (): { value: boolean; source: SettingsTarget } => {
    if (inProject) {
      if (effectiveProjectLocal?.sandbox?.enabled !== undefined)
        return { value: effectiveProjectLocal.sandbox.enabled, source: "project-local" };
      if (effectiveProject?.sandbox?.enabled !== undefined)
        return { value: effectiveProject.sandbox.enabled, source: "project" };
      if (effectiveUser?.sandbox?.enabled !== undefined)
        return { value: effectiveUser.sandbox.enabled, source: "user" };
    } else {
      if (effectiveUser?.sandbox?.enabled !== undefined)
        return { value: effectiveUser.sandbox.enabled, source: "user" };
    }
    return { value: true, source: "user" }; // Default enabled
  };

  const getAutoAllowBashSetting = (): { value: boolean; source: SettingsTarget } => {
    if (inProject) {
      if (effectiveProjectLocal?.sandbox?.autoAllowBashIfSandboxed !== undefined)
        return { value: effectiveProjectLocal.sandbox.autoAllowBashIfSandboxed, source: "project-local" };
      if (effectiveProject?.sandbox?.autoAllowBashIfSandboxed !== undefined)
        return { value: effectiveProject.sandbox.autoAllowBashIfSandboxed, source: "project" };
      if (effectiveUser?.sandbox?.autoAllowBashIfSandboxed !== undefined)
        return { value: effectiveUser.sandbox.autoAllowBashIfSandboxed, source: "user" };
    } else {
      if (effectiveUser?.sandbox?.autoAllowBashIfSandboxed !== undefined)
        return { value: effectiveUser.sandbox.autoAllowBashIfSandboxed, source: "user" };
    }
    return { value: false, source: "user" };
  };

  const sandboxSetting = getSandboxEnabledSetting();
  const autoAllowBashSetting = getAutoAllowBashSetting();
  const sandboxEnabled = sandboxSetting.value;
  const autoAllowBash = autoAllowBashSetting.value;
  const writePaths = getAllPaths();
  const denyPaths = getAllDenyPaths();
  const allowedHosts = getAllHosts();
  const unixSockets = getAllSockets();

  // Check if inherited
  const isInherited = (source: SettingsTarget): boolean => {
    return inProject && source === "user";
  };

  // Use project-local for sandbox toggles (machine-specific)
  const sandboxTarget: SettingsTarget = inProject ? "project-local" : "user";

  const handleToggleSandbox = (enabled: boolean) => {
    updateSetting(
      ["sandbox", "enabled"],
      enabled,
      sandboxTarget,
      `${enabled ? "Enabled" : "Disabled"} sandbox`
    );
  };

  const handleToggleAutoAllowBash = (enabled: boolean) => {
    updateSetting(
      ["sandbox", "autoAllowBashIfSandboxed"],
      enabled,
      sandboxTarget,
      `${enabled ? "Enabled" : "Disabled"} auto-allow bash in sandbox`
    );
  };

  const handleAddPath = () => {
    if (!newPath.trim()) return;
    const settings = getSettingsForTarget(defaultTarget);
    const currentPaths = settings?.sandbox?.filesystem?.write?.allowOnly || [];
    const updatedPaths = [...currentPaths, newPath.trim()];
    updateSetting(
      ["sandbox", "filesystem", "write", "allowOnly"],
      updatedPaths,
      defaultTarget,
      `Added write path: ${newPath}`
    );
    setNewPath("");
    setIsPathDialogOpen(false);
  };

  const handleRemovePath = (item: SandboxItem) => {
    const settings = getSettingsForTarget(item.source);
    const currentPaths = settings?.sandbox?.filesystem?.write?.allowOnly || [];
    const updatedPaths = currentPaths.filter((p) => p !== item.value);
    updateSetting(
      ["sandbox", "filesystem", "write", "allowOnly"],
      updatedPaths,
      item.source,
      `Removed write path: ${item.value}`
    );
  };

  const handleAddDenyPath = () => {
    if (!newDenyPath.trim()) return;
    const settings = getSettingsForTarget(defaultTarget);
    const currentPaths = settings?.sandbox?.filesystem?.read?.denyOnly || [];
    const updatedPaths = [...currentPaths, newDenyPath.trim()];
    updateSetting(
      ["sandbox", "filesystem", "read", "denyOnly"],
      updatedPaths,
      defaultTarget,
      `Added read deny path: ${newDenyPath}`
    );
    setNewDenyPath("");
    setIsDenyPathDialogOpen(false);
  };

  const handleRemoveDenyPath = (item: SandboxItem) => {
    const settings = getSettingsForTarget(item.source);
    const currentPaths = settings?.sandbox?.filesystem?.read?.denyOnly || [];
    const updatedPaths = currentPaths.filter((p) => p !== item.value);
    updateSetting(
      ["sandbox", "filesystem", "read", "denyOnly"],
      updatedPaths,
      item.source,
      `Removed read deny path: ${item.value}`
    );
  };

  const handleAddHost = () => {
    if (!newHost.trim()) return;
    const settings = getSettingsForTarget(defaultTarget);
    const currentHosts = settings?.sandbox?.network?.allowedHosts || [];
    const updatedHosts = [...currentHosts, newHost.trim()];
    updateSetting(
      ["sandbox", "network", "allowedHosts"],
      updatedHosts,
      defaultTarget,
      `Added allowed host: ${newHost}`
    );
    setNewHost("");
    setIsHostDialogOpen(false);
  };

  const handleRemoveHost = (item: SandboxItem) => {
    const settings = getSettingsForTarget(item.source);
    const currentHosts = settings?.sandbox?.network?.allowedHosts || [];
    const updatedHosts = currentHosts.filter((h) => h !== item.value);
    updateSetting(
      ["sandbox", "network", "allowedHosts"],
      updatedHosts,
      item.source,
      `Removed allowed host: ${item.value}`
    );
  };

  const handleAddSocket = () => {
    if (!newSocket.trim()) return;
    const settings = getSettingsForTarget(defaultTarget);
    const currentSockets = settings?.sandbox?.network?.allowUnixSockets || [];
    const updatedSockets = [...currentSockets, newSocket.trim()];
    updateSetting(
      ["sandbox", "network", "allowUnixSockets"],
      updatedSockets,
      defaultTarget,
      `Added unix socket: ${newSocket}`
    );
    setNewSocket("");
    setIsSocketDialogOpen(false);
  };

  const handleRemoveSocket = (item: SandboxItem) => {
    const settings = getSettingsForTarget(item.source);
    const currentSockets = settings?.sandbox?.network?.allowUnixSockets || [];
    const updatedSockets = currentSockets.filter((s) => s !== item.value);
    updateSetting(
      ["sandbox", "network", "allowUnixSockets"],
      updatedSockets,
      item.source,
      `Removed unix socket: ${item.value}`
    );
  };

  // Reusable list component for items
  const ItemList = ({
    items,
    onRemove,
    emptyMessage,
  }: {
    items: SandboxItem[];
    onRemove: (item: SandboxItem) => void;
    emptyMessage: string;
  }) => {
    if (items.length === 0) {
      return (
        <div className="text-center py-8 text-muted-foreground">
          {emptyMessage}
        </div>
      );
    }

    return (
      <div className="space-y-2">
        {items.map((item, index) => (
          <div
            key={`${item.source}-${item.value}-${index}`}
            className={`flex items-center justify-between p-3 rounded-lg border ${
              isInherited(item.source) ? "bg-muted/30" : ""
            }`}
          >
            <div className="flex items-center gap-3">
              <code className="text-sm">{item.value}</code>
              <ScopeBadge scope={item.source} />
              {isInherited(item.source) && (
                <span className="text-xs text-muted-foreground">← inherited</span>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onRemove(item)}
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold">Sandbox Settings</h1>
        <p className="text-muted-foreground">
          Control execution restrictions for Claude.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Sandbox Mode
          </CardTitle>
          <CardDescription>
            Restrict filesystem and network access for enhanced security.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Label className="font-medium">Enable Sandbox</Label>
                <ScopeBadge scope={sandboxSetting.source} />
                {isInherited(sandboxSetting.source) && (
                  <span className="text-xs text-muted-foreground">← inherited</span>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                Restrict commands to only allowed paths and hosts.
              </p>
            </div>
            <Switch
              checked={sandboxEnabled}
              onCheckedChange={handleToggleSandbox}
            />
          </div>

          {!sandboxEnabled && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Sandbox Disabled</AlertTitle>
              <AlertDescription>
                Commands run without filesystem or network restrictions. Enable
                sandbox for enhanced security.
              </AlertDescription>
            </Alert>
          )}

          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Label className="font-medium">Auto-allow bash if sandboxed</Label>
                <ScopeBadge scope={autoAllowBashSetting.source} />
                {isInherited(autoAllowBashSetting.source) && (
                  <span className="text-xs text-muted-foreground">← inherited</span>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                Automatically allow bash commands when sandbox is enabled.
              </p>
            </div>
            <Switch
              checked={autoAllowBash}
              onCheckedChange={handleToggleAutoAllowBash}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5" />
            Filesystem Access
          </CardTitle>
          <CardDescription>
            Control where Claude can read and write files.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="write">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="write">
                Write Allow ({writePaths.length})
              </TabsTrigger>
              <TabsTrigger value="read">
                Read Deny ({denyPaths.length})
              </TabsTrigger>
            </TabsList>
            <TabsContent value="write" className="mt-4">
              <div className="flex justify-end mb-4">
                <Dialog open={isPathDialogOpen} onOpenChange={setIsPathDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm">
                      <Plus className="mr-2 h-4 w-4" />
                      Add Path
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add Write Path</DialogTitle>
                      <DialogDescription>
                        Add a path where Claude can write files.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label>Path</Label>
                        <Input
                          value={newPath}
                          onChange={(e) => setNewPath(e.target.value)}
                          placeholder="/path/to/directory"
                        />
                        <p className="text-xs text-muted-foreground">
                          Use . for current directory. Supports glob patterns like *
                        </p>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button
                        variant="outline"
                        onClick={() => setIsPathDialogOpen(false)}
                      >
                        Cancel
                      </Button>
                      <Button onClick={handleAddPath} disabled={!newPath.trim()}>
                        Add Path
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
              <ItemList
                items={writePaths}
                onRemove={handleRemovePath}
                emptyMessage="No write paths configured"
              />
            </TabsContent>
            <TabsContent value="read" className="mt-4">
              <div className="flex justify-end mb-4">
                <Dialog open={isDenyPathDialogOpen} onOpenChange={setIsDenyPathDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm">
                      <Plus className="mr-2 h-4 w-4" />
                      Add Path
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add Read Deny Path</DialogTitle>
                      <DialogDescription>
                        Add a path that Claude cannot read from.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label>Path</Label>
                        <Input
                          value={newDenyPath}
                          onChange={(e) => setNewDenyPath(e.target.value)}
                          placeholder="~/.secrets/*"
                        />
                        <p className="text-xs text-muted-foreground">
                          Supports glob patterns like *. Example: ~/.aws/credentials
                        </p>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button
                        variant="outline"
                        onClick={() => setIsDenyPathDialogOpen(false)}
                      >
                        Cancel
                      </Button>
                      <Button onClick={handleAddDenyPath} disabled={!newDenyPath.trim()}>
                        Add Path
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
              <ItemList
                items={denyPaths}
                onRemove={handleRemoveDenyPath}
                emptyMessage="No read deny paths configured"
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Network Access
          </CardTitle>
          <CardDescription>
            Control network connections Claude can make.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="hosts">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="hosts">
                Allowed Hosts ({allowedHosts.length})
              </TabsTrigger>
              <TabsTrigger value="sockets">
                Unix Sockets ({unixSockets.length})
              </TabsTrigger>
            </TabsList>
            <TabsContent value="hosts" className="mt-4">
              <div className="flex justify-end mb-4">
                <Dialog open={isHostDialogOpen} onOpenChange={setIsHostDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm">
                      <Plus className="mr-2 h-4 w-4" />
                      Add Host
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add Allowed Host</DialogTitle>
                      <DialogDescription>
                        Add a hostname that Claude can connect to.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label>Hostname</Label>
                        <Input
                          value={newHost}
                          onChange={(e) => setNewHost(e.target.value)}
                          placeholder="api.example.com"
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button
                        variant="outline"
                        onClick={() => setIsHostDialogOpen(false)}
                      >
                        Cancel
                      </Button>
                      <Button onClick={handleAddHost} disabled={!newHost.trim()}>
                        Add Host
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
              <ItemList
                items={allowedHosts}
                onRemove={handleRemoveHost}
                emptyMessage="No allowed hosts configured"
              />
            </TabsContent>
            <TabsContent value="sockets" className="mt-4">
              <div className="flex justify-end mb-4">
                <Dialog open={isSocketDialogOpen} onOpenChange={setIsSocketDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm">
                      <Plus className="mr-2 h-4 w-4" />
                      Add Socket
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add Unix Socket</DialogTitle>
                      <DialogDescription>
                        Add a unix socket path that Claude can access.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label>Socket Path</Label>
                        <Input
                          value={newSocket}
                          onChange={(e) => setNewSocket(e.target.value)}
                          placeholder="/path/to/socket/*"
                        />
                        <p className="text-xs text-muted-foreground">
                          Use * for wildcards. Example: ~/.gnupg/*
                        </p>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button
                        variant="outline"
                        onClick={() => setIsSocketDialogOpen(false)}
                      >
                        Cancel
                      </Button>
                      <Button onClick={handleAddSocket} disabled={!newSocket.trim()}>
                        Add Socket
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
              <ItemList
                items={unixSockets}
                onRemove={handleRemoveSocket}
                emptyMessage="No unix sockets configured"
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
