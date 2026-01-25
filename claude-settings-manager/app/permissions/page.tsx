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
import { Badge } from "@/components/ui/badge";
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

type RuleType = "allow" | "deny" | "ask";
type ToolCategory = "bash" | "webfetch" | "websearch" | "read" | "edit" | "mcp" | "other";

interface ParsedRule {
  rule: string;
  source: "global" | "local";
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

export default function PermissionsPage() {
  const { updateSetting, isLoading, effectiveGlobal, effectiveLocal } =
    useSettingsStore();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newRuleType, setNewRuleType] = useState<RuleType>("allow");
  const [newRuleCategory, setNewRuleCategory] = useState<ToolCategory>("bash");
  const [newRulePattern, setNewRulePattern] = useState("");
  const [newRuleTarget, setNewRuleTarget] = useState<"global" | "local">("global");

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading settings...</div>
      </div>
    );
  }

  // Combine rules from both sources
  const getAllRules = (type: RuleType): ParsedRule[] => {
    const globalRules = (effectiveGlobal?.permissions?.[type] || []).map(
      (rule) => ({
        rule,
        source: "global" as const,
        type,
      })
    );
    const localRules = (effectiveLocal?.permissions?.[type] || []).map(
      (rule) => ({
        rule,
        source: "local" as const,
        type,
      })
    );
    return [...globalRules, ...localRules];
  };

  const allowRules = getAllRules("allow");
  const askRules = getAllRules("ask");
  const denyRules = getAllRules("deny");

  const handleDeleteRule = (rule: ParsedRule) => {
    const settings =
      rule.source === "global" ? effectiveGlobal : effectiveLocal;
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

    const settings =
      newRuleTarget === "global" ? effectiveGlobal : effectiveLocal;
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

  const RuleList = ({ rules }: { rules: ParsedRule[] }) => {
    if (rules.length === 0) {
      return (
        <div className="text-center py-8 text-muted-foreground">
          No rules configured
        </div>
      );
    }

    return (
      <div className="space-y-2">
        {rules.map((rule, index) => {
          const Icon = getToolIcon(rule.rule);
          return (
            <div
              key={`${rule.source}-${rule.rule}-${index}`}
              className="flex items-center justify-between p-3 rounded-lg border"
            >
              <div className="flex items-center gap-3">
                <Icon className="h-4 w-4 text-muted-foreground" />
                <div>
                  <code className="text-sm">{rule.rule}</code>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline" className="text-xs">
                      {rule.source}
                    </Badge>
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
        return "npm run:*";
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
        return "Use * as wildcard. Examples: npm run:*, git push, chmod:*";
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
                  onValueChange={(v) => setNewRuleTarget(v as "global" | "local")}
                  className="flex gap-4"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="global" id="global" />
                    <Label htmlFor="global" className="font-normal">
                      settings.json (global)
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="local" id="local" />
                    <Label htmlFor="local" className="font-normal">
                      settings.local.json (local)
                    </Label>
                  </div>
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
                Allow ({allowRules.length})
              </TabsTrigger>
              <TabsTrigger value="ask">Ask ({askRules.length})</TabsTrigger>
              <TabsTrigger value="deny">Deny ({denyRules.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="allow" className="mt-4">
              <RuleList rules={allowRules} />
            </TabsContent>
            <TabsContent value="ask" className="mt-4">
              <RuleList rules={askRules} />
            </TabsContent>
            <TabsContent value="deny" className="mt-4">
              <RuleList rules={denyRules} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
