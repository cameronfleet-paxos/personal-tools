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
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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

export default function SandboxPage() {
  const { updateSetting, isLoading, effectiveGlobal, effectiveLocal } =
    useSettingsStore();

  const [newPath, setNewPath] = useState("");
  const [newHost, setNewHost] = useState("");
  const [newSocket, setNewSocket] = useState("");
  const [isPathDialogOpen, setIsPathDialogOpen] = useState(false);
  const [isHostDialogOpen, setIsHostDialogOpen] = useState(false);
  const [isSocketDialogOpen, setIsSocketDialogOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading settings...</div>
      </div>
    );
  }

  const sandboxEnabled = effectiveLocal?.sandbox?.enabled !== false;
  const autoAllowBash = effectiveLocal?.sandbox?.autoAllowBashIfSandboxed ?? false;
  const writePaths =
    effectiveGlobal?.sandbox?.filesystem?.write?.allowOnly || [];
  const allowedHosts = effectiveGlobal?.sandbox?.network?.allowedHosts || [];
  const unixSockets = effectiveGlobal?.sandbox?.network?.allowUnixSockets || [];

  const handleToggleSandbox = (enabled: boolean) => {
    updateSetting(
      ["sandbox", "enabled"],
      enabled,
      "local",
      `${enabled ? "Enabled" : "Disabled"} sandbox`
    );
  };

  const handleToggleAutoAllowBash = (enabled: boolean) => {
    updateSetting(
      ["sandbox", "autoAllowBashIfSandboxed"],
      enabled,
      "local",
      `${enabled ? "Enabled" : "Disabled"} auto-allow bash in sandbox`
    );
  };

  const handleAddPath = () => {
    if (!newPath.trim()) return;
    const updatedPaths = [...writePaths, newPath.trim()];
    updateSetting(
      ["sandbox", "filesystem", "write", "allowOnly"],
      updatedPaths,
      "global",
      `Added write path: ${newPath}`
    );
    setNewPath("");
    setIsPathDialogOpen(false);
  };

  const handleRemovePath = (path: string) => {
    const updatedPaths = writePaths.filter((p) => p !== path);
    updateSetting(
      ["sandbox", "filesystem", "write", "allowOnly"],
      updatedPaths,
      "global",
      `Removed write path: ${path}`
    );
  };

  const handleAddHost = () => {
    if (!newHost.trim()) return;
    const updatedHosts = [...allowedHosts, newHost.trim()];
    updateSetting(
      ["sandbox", "network", "allowedHosts"],
      updatedHosts,
      "global",
      `Added allowed host: ${newHost}`
    );
    setNewHost("");
    setIsHostDialogOpen(false);
  };

  const handleRemoveHost = (host: string) => {
    const updatedHosts = allowedHosts.filter((h) => h !== host);
    updateSetting(
      ["sandbox", "network", "allowedHosts"],
      updatedHosts,
      "global",
      `Removed allowed host: ${host}`
    );
  };

  const handleAddSocket = () => {
    if (!newSocket.trim()) return;
    const updatedSockets = [...unixSockets, newSocket.trim()];
    updateSetting(
      ["sandbox", "network", "allowUnixSockets"],
      updatedSockets,
      "global",
      `Added unix socket: ${newSocket}`
    );
    setNewSocket("");
    setIsSocketDialogOpen(false);
  };

  const handleRemoveSocket = (socket: string) => {
    const updatedSockets = unixSockets.filter((s) => s !== socket);
    updateSetting(
      ["sandbox", "network", "allowUnixSockets"],
      updatedSockets,
      "global",
      `Removed unix socket: ${socket}`
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
              <Label className="font-medium">Enable Sandbox</Label>
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
              <Label className="font-medium">Auto-allow bash if sandboxed</Label>
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
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FolderOpen className="h-5 w-5" />
              Filesystem Write Access
            </CardTitle>
            <CardDescription>
              Paths where Claude can write files.
            </CardDescription>
          </div>
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
        </CardHeader>
        <CardContent>
          {writePaths.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No write paths configured
            </div>
          ) : (
            <div className="space-y-2">
              {writePaths.map((path, index) => (
                <div
                  key={`${path}-${index}`}
                  className="flex items-center justify-between p-3 rounded-lg border"
                >
                  <code className="text-sm">{path}</code>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemovePath(path)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              Network Allowed Hosts
            </CardTitle>
            <CardDescription>
              Hosts that Claude can connect to.
            </CardDescription>
          </div>
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
        </CardHeader>
        <CardContent>
          {allowedHosts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No allowed hosts configured
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {allowedHosts.map((host, index) => (
                <Badge
                  key={`${host}-${index}`}
                  variant="secondary"
                  className="gap-2 py-1.5 px-3"
                >
                  {host}
                  <button
                    onClick={() => handleRemoveHost(host)}
                    className="hover:text-destructive"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Unix Sockets</CardTitle>
            <CardDescription>
              Unix socket paths that Claude can access.
            </CardDescription>
          </div>
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
        </CardHeader>
        <CardContent>
          {unixSockets.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No unix sockets configured
            </div>
          ) : (
            <div className="space-y-2">
              {unixSockets.map((socket, index) => (
                <div
                  key={`${socket}-${index}`}
                  className="flex items-center justify-between p-3 rounded-lg border"
                >
                  <code className="text-sm">{socket}</code>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveSocket(socket)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
