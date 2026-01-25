import * as React from "react";
import { cn } from "@/lib/utils";
import { User, Users, Lock } from "lucide-react";
import type { SettingsTarget } from "@/types/settings";

// Scope types for display (extends SettingsTarget for compatibility)
export type Scope = SettingsTarget | "local"; // "local" is legacy alias

interface ScopeBadgeProps {
  scope: Scope;
  showLabel?: boolean;
  className?: string;
}

interface ScopeConfigItem {
  label: string;
  icon: typeof User;
  bgColor: string;
  textColor: string;
  borderColor: string;
  borderStyle?: string;
}

// Note: user-local removed - doesn't exist per Claude Code docs
const scopeConfig: Record<Scope, ScopeConfigItem> = {
  user: {
    label: "User",
    icon: User,
    bgColor: "bg-blue-500/10",
    textColor: "text-blue-600 dark:text-blue-400",
    borderColor: "border-blue-500/30",
  },
  project: {
    label: "Project",
    icon: Users,
    bgColor: "bg-purple-500/10",
    textColor: "text-purple-600 dark:text-purple-400",
    borderColor: "border-purple-500/30",
  },
  "project-local": {
    label: "Project Local",
    icon: Lock,
    bgColor: "bg-amber-500/10",
    textColor: "text-amber-600 dark:text-amber-400",
    borderColor: "border-amber-500/30",
  },
  // Legacy alias
  local: {
    label: "Local",
    icon: Lock,
    bgColor: "bg-amber-500/10",
    textColor: "text-amber-600 dark:text-amber-400",
    borderColor: "border-amber-500/30",
  },
};

export function ScopeBadge({
  scope,
  showLabel = true,
  className,
}: ScopeBadgeProps) {
  const config = scopeConfig[scope];
  const Icon = config.icon;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
        config.bgColor,
        config.textColor,
        config.borderColor,
        config.borderStyle,
        className
      )}
    >
      <Icon className="h-3 w-3" />
      {showLabel && <span>{config.label}</span>}
    </span>
  );
}

export function getScopeDescription(scope: Scope, isInProject: boolean): string {
  switch (scope) {
    case "user":
      return "Applies to all projects (saved in ~/.claude/settings.json)";
    case "project":
      return "Shared with team, committed to git (saved in project/.claude/settings.json)";
    case "project-local":
      return "Only you, this project, not committed (saved in project/.claude/settings.local.json)";
    case "local":
      // Legacy support
      return isInProject
        ? "Only you, this project (not committed)"
        : "Personal user settings (not shared)";
  }
}
