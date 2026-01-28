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
import { ScopeBadge, getScopeDescription } from "@/components/ui/scope-badge";
import type { Scope } from "@/components/ui/scope-badge";
import type { SettingsTarget, Settings } from "@/types/settings";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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
  Globe,
  Terminal,
  Search,
  FileText,
  Edit3,
  Server,
} from "lucide-react";
import { LoadingOverlay } from "@/components/loading-overlay";

type RuleType = "allow" | "deny" | "ask";
type ToolCategory = "bash" | "webfetch" | "websearch" | "read" | "edit" | "mcp" | "other";

interface ParsedRule {
  rule: string;
  source: SettingsTarget;
  type: RuleType;
}

const toolCategories = [
  { id: "bash", name: "Bash Command", icon: Terminal, prefix: "Bash(" },
  { id: "webfetch", name: "Web Fetch", icon: Globe, prefix: "WebFetch(" },
  { id: "websearch", name: "Web Search", icon: Search, prefix: "WebSearch" },
  { id: "read", name: "File Read", icon: FileText, prefix: "Read(" },
  { id: "edit", name: "File Edit", icon: Edit3, prefix: "Edit(" },
  { id: "mcp", name: "MCP Tool", icon: Server, prefix: "mcp__" },
  { id: "other", name: "Other", icon: Terminal, prefix: "" },
];

function getToolIcon(rule: string) {
  if (rule.startsWith("Bash(") || rule === "Bash") return Terminal;
  if (rule.startsWith("WebFetch(") || rule === "WebFetch") return Globe;
  if (rule.startsWith("WebSearch") || rule === "WebSearch") return Search;
  if (rule.startsWith("Read(") || rule === "Read") return FileText;
  if (rule.startsWith("Edit(") || rule === "Edit") return Edit3;
  if (rule.startsWith("mcp__")) return Server;
  return Terminal;
}

function getToolType(rule: string): ToolCategory {
  if (rule.startsWith("Bash(") || rule === "Bash") return "bash";
  if (rule.startsWith("WebFetch(") || rule === "WebFetch") return "webfetch";
  if (rule.startsWith("WebSearch") || rule === "WebSearch") return "websearch";
  if (rule.startsWith("Read(") || rule === "Read") return "read";
  if (rule.startsWith("Edit(") || rule === "Edit") return "edit";
  if (rule.startsWith("mcp__")) return "mcp";
  return "other";
}

export default function PermissionsPage() {
  const {
    updateSetting,
    isLoading,
    effectiveUser,
    effectiveProject,
    effectiveProjectLocal,
    effectiveGlobal,
    isInProjectContext,
    permissionsSearchQuery,
    permissionsSourceFilter,
    permissionsToolTypeFilter,
    setPermissionsSearchQuery,
    setPermissionsSourceFilter,
    setPermissionsToolTypeFilter,
  } = useSettingsStore();

  const inProject = isInProjectContext();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newRuleType, setNewRuleType] = useState<RuleType>("allow");
  const [newRuleCategory, setNewRuleCategory] = useState<ToolCategory>("bash");
  const [newRulePattern, setNewRulePattern] = useState("");
  const [newRuleTarget, setNewRuleTarget] = useState<SettingsTarget>(
    inProject ? "project" : "user"
  );

  // Check if we have data (for initial load vs subsequent syncs)
  const hasData = effectiveUser !== null || effectiveGlobal !== null;

  // Helper to get rules from a settings source
  const getRulesFromSource = (
    settings: Settings | null,
    source: SettingsTarget,
    type: RuleType
  ): ParsedRule[] => {
    return (settings?.permissions?.[type] || []).map((rule) => ({
      rule,
      source,
      type,
    }));
  };

  // Combine rules from all sources (3 sources in project context, 1 otherwise)
  // Note: user-local removed - doesn't exist per Claude Code docs
  const getAllRules = (type: RuleType): ParsedRule[] => {
    if (inProject) {
      // In project context, show all 3 sources
      return [
        ...getRulesFromSource(effectiveUser, "user", type),
        ...getRulesFromSource(effectiveProject, "project", type),
        ...getRulesFromSource(effectiveProjectLocal, "project-local", type),
      ];
    } else {
      // User settings only (1 source)
      return [
        ...getRulesFromSource(effectiveGlobal, "user", type),
      ];
    }
  };

  // Show skeleton on initial load when there's no data
  if (isLoading && !hasData) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading settings...</div>
      </div>
    );
  }

  const allowRules = getAllRules("allow");
  const askRules = getAllRules("ask");
  const denyRules = getAllRules("deny");

  // Filter function
  const filterRules = (rules: ParsedRule[]) => {
    const query = permissionsSearchQuery.toLowerCase();
    return rules.filter((rule) => {
      // Source filter
      if (permissionsSourceFilter !== "all" && rule.source !== permissionsSourceFilter) return false;
      // Tool type filter
      if (permissionsToolTypeFilter !== "all" && getToolType(rule.rule) !== permissionsToolTypeFilter) return false;
      // Search query (case-insensitive)
      if (query && !rule.rule.toLowerCase().includes(query)) return false;
      return true;
    });
  };

  const filteredAllowRules = filterRules(allowRules);
  const filteredAskRules = filterRules(askRules);
  const filteredDenyRules = filterRules(denyRules);

  const hasActiveFilters = permissionsSearchQuery || permissionsSourceFilter !== "all" || permissionsToolTypeFilter !== "all";

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

  const handleDeleteRule = (rule: ParsedRule) => {
    const settings = getSettingsForTarget(rule.source);
    const currentRules = settings?.permissions?.[rule.type] || [];
    const newRules = currentRules.filter((r) => r !== rule.rule);
    updateSetting(
      ["permissions", rule.type],
      newRules,
      rule.source,
      `Removed ${rule.type} rule: ${rule.rule}`
    );
  };

  const handleAddRule = () => {
    const category = toolCategories.find((c) => c.id === newRuleCategory);
    let fullRule = "";

    if (newRuleCategory === "websearch") {
      fullRule = "WebSearch";
    } else if (newRuleCategory === "other") {
      fullRule = newRulePattern;
    } else if (category) {
      fullRule = `${category.prefix}${newRulePattern})`;
    }

    if (!fullRule) return;

    const settings = getSettingsForTarget(newRuleTarget);
    const currentRules = settings?.permissions?.[newRuleType] || [];

    // Don't add duplicates
    if (currentRules.includes(fullRule)) {
      setIsDialogOpen(false);
      return;
    }

    updateSetting(
      ["permissions", newRuleType],
      [...currentRules, fullRule],
      newRuleTarget,
      `Added ${newRuleType} rule: ${fullRule}`
    );

    // Reset form
    setNewRulePattern("");
    setIsDialogOpen(false);
  };

  const RuleList = ({ rules, totalCount }: { rules: ParsedRule[]; totalCount: number }) => {
    if (rules.length === 0) {
      return (
        <div className="text-center py-8 text-muted-foreground">
          {totalCount > 0 ? "No matching rules" : "No rules configured"}
        </div>
      );
    }

    // Check if this rule is inherited (from user settings while viewing project)
    const isInherited = (source: SettingsTarget): boolean => {
      return inProject && source === "user";
    };

    return (
      <div className="space-y-2">
        {rules.map((rule, index) => {
          const Icon = getToolIcon(rule.rule);
          const inherited = isInherited(rule.source);
          return (
            <div
              key={`${rule.source}-${rule.rule}-${index}`}
              className={`flex items-center justify-between p-3 rounded-lg border ${
                inherited ? "bg-muted/30" : ""
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon className="h-4 w-4 text-muted-foreground" />
                <div>
                  <code className="text-sm">{rule.rule}</code>
                  <div className="flex items-center gap-2 mt-1">
                    <ScopeBadge scope={rule.source} />
                    {inherited && (
                      <span className="text-xs text-muted-foreground">← inherited</span>
                    )}
                  </div>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDeleteRule(rule)}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          );
        })}
      </div>
    );
  };

  const getPatternPlaceholder = () => {
    switch (newRuleCategory) {
      case "bash":
        return "npm run *";
      case "webfetch":
        return "domain:example.com";
      case "read":
      case "edit":
        return "/path/to/file";
      case "mcp":
        return "mcp__server__tool";
      default:
        return "Pattern...";
    }
  };

  const getPatternHelp = () => {
    switch (newRuleCategory) {
      case "bash":
        return "Use * as wildcard. Examples: npm run *, git push, chmod *";
      case "webfetch":
        return "Format: domain:example.com. Examples: domain:github.com";
      case "websearch":
        return "No pattern needed - allows all web searches";
      case "read":
      case "edit":
        return "File path pattern. Use * for wildcards.";
      case "mcp":
        return "Full MCP tool name. Example: mcp__glean_default__search";
      default:
        return "Enter the full permission rule";
    }
  };

  return (
    <>
      <LoadingOverlay isVisible={isLoading && hasData} />
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Permissions</h1>
          <p className="text-muted-foreground">
            Control what Claude can do automatically.
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Rule
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Add Permission Rule</DialogTitle>
              <DialogDescription>
                Create a new permission rule for Claude.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Rule Type</Label>
                <RadioGroup
                  value={newRuleType}
                  onValueChange={(v) => setNewRuleType(v as RuleType)}
                  className="flex gap-4"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="allow" id="allow" />
                    <Label htmlFor="allow">Allow</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="ask" id="ask" />
                    <Label htmlFor="ask">Ask</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="deny" id="deny" />
                    <Label htmlFor="deny">Deny</Label>
                  </div>
                </RadioGroup>
              </div>

              <div className="space-y-2">
                <Label>Tool Category</Label>
                <Select
                  value={newRuleCategory}
                  onValueChange={(v) => setNewRuleCategory(v as ToolCategory)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {toolCategories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        <div className="flex items-center gap-2">
                          <cat.icon className="h-4 w-4" />
                          {cat.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {newRuleCategory !== "websearch" && (
                <div className="space-y-2">
                  <Label>Pattern</Label>
                  <Input
                    value={newRulePattern}
                    onChange={(e) => setNewRulePattern(e.target.value)}
                    placeholder={getPatternPlaceholder()}
                  />
                  <p className="text-xs text-muted-foreground">
                    {getPatternHelp()}
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <Label>Save to</Label>
                <RadioGroup
                  value={newRuleTarget}
                  onValueChange={(v) => setNewRuleTarget(v as SettingsTarget)}
                  className="space-y-2"
                >
                  {inProject ? (
                    // Project context: show 3 options (user-local removed)
                    <>
                      <label
                        htmlFor="project"
                        className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                          newRuleTarget === "project"
                            ? "border-primary bg-primary/5"
                            : "hover:bg-muted/50"
                        }`}
                      >
                        <RadioGroupItem value="project" id="project" className="mt-1" />
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">Project</span>
                            <ScopeBadge scope="project" showLabel={false} />
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {getScopeDescription("project", true)}
                          </p>
                        </div>
                      </label>
                      <label
                        htmlFor="project-local"
                        className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                          newRuleTarget === "project-local"
                            ? "border-primary bg-primary/5"
                            : "hover:bg-muted/50"
                        }`}
                      >
                        <RadioGroupItem value="project-local" id="project-local" className="mt-1" />
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">Project Local</span>
                            <ScopeBadge scope="project-local" showLabel={false} />
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {getScopeDescription("project-local", true)}
                          </p>
                        </div>
                      </label>
                      <label
                        htmlFor="user"
                        className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                          newRuleTarget === "user"
                            ? "border-primary bg-primary/5"
                            : "hover:bg-muted/50"
                        }`}
                      >
                        <RadioGroupItem value="user" id="user" className="mt-1" />
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">User (Global)</span>
                            <ScopeBadge scope="user" showLabel={false} />
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {getScopeDescription("user", true)}
                          </p>
                        </div>
                      </label>
                    </>
                  ) : (
                    // User context: show only user (user-local doesn't exist)
                    <label
                      htmlFor="user"
                      className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                        newRuleTarget === "user"
                          ? "border-primary bg-primary/5"
                          : "hover:bg-muted/50"
                      }`}
                    >
                      <RadioGroupItem value="user" id="user" className="mt-1" />
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">User Settings</span>
                          <ScopeBadge scope="user" showLabel={false} />
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {getScopeDescription("user", false)}
                        </p>
                      </div>
                    </label>
                  )}
                </RadioGroup>
              </div>

              {(newRulePattern || newRuleCategory === "websearch") && (
                <div className="space-y-2">
                  <Label>Preview</Label>
                  <div className="rounded-md bg-muted p-3">
                    <code className="text-sm">
                      {newRuleCategory === "websearch"
                        ? "WebSearch"
                        : newRuleCategory === "other"
                        ? newRulePattern
                        : `${
                            toolCategories.find((c) => c.id === newRuleCategory)
                              ?.prefix
                          }${newRulePattern})`}
                    </code>
                  </div>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleAddRule}
                disabled={
                  newRuleCategory !== "websearch" && !newRulePattern.trim()
                }
              >
                Add Rule
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search and Filters */}
      <div className="flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search rules..."
            value={permissionsSearchQuery}
            onChange={(e) => setPermissionsSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select
          value={permissionsToolTypeFilter}
          onValueChange={(v) => setPermissionsToolTypeFilter(v as typeof permissionsToolTypeFilter)}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Tool type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="bash">Bash</SelectItem>
            <SelectItem value="webfetch">WebFetch</SelectItem>
            <SelectItem value="websearch">WebSearch</SelectItem>
            <SelectItem value="read">Read</SelectItem>
            <SelectItem value="edit">Edit</SelectItem>
            <SelectItem value="mcp">MCP</SelectItem>
            <SelectItem value="other">Other</SelectItem>
          </SelectContent>
        </Select>
        {inProject && (
          <Select
            value={permissionsSourceFilter}
            onValueChange={(v) => setPermissionsSourceFilter(v as typeof permissionsSourceFilter)}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Source" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sources</SelectItem>
              <SelectItem value="user">User</SelectItem>
              <SelectItem value="project">Project</SelectItem>
              <SelectItem value="project-local">Project Local</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Permission Rules</CardTitle>
          <CardDescription>
            Rules determine whether Claude can perform actions automatically,
            needs to ask, or is blocked.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="allow">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="allow">
                Allow ({hasActiveFilters ? `${filteredAllowRules.length}/${allowRules.length}` : allowRules.length})
              </TabsTrigger>
              <TabsTrigger value="ask">
                Ask ({hasActiveFilters ? `${filteredAskRules.length}/${askRules.length}` : askRules.length})
              </TabsTrigger>
              <TabsTrigger value="deny">
                Deny ({hasActiveFilters ? `${filteredDenyRules.length}/${denyRules.length}` : denyRules.length})
              </TabsTrigger>
            </TabsList>
            <TabsContent value="allow" className="mt-4">
              <RuleList rules={filteredAllowRules} totalCount={allowRules.length} />
            </TabsContent>
            <TabsContent value="ask" className="mt-4">
              <RuleList rules={filteredAskRules} totalCount={askRules.length} />
            </TabsContent>
            <TabsContent value="deny" className="mt-4">
              <RuleList rules={filteredDenyRules} totalCount={denyRules.length} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
      </div>
    </>
  );
}
