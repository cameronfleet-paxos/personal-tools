"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useSettingsStore } from "@/lib/store";
import {
  Settings,
  Brain,
  Shield,
  Box,
  Webhook,
  Puzzle,
  Plug,
  BarChart3,
  Wrench,
  Home,
  FolderOpen,
  ChevronRight,
  User,
  Users,
  Terminal,
  MessageSquare,
} from "lucide-react";

const navigation = [
  { name: "Dashboard", href: "/", icon: Home },
  { name: "Projects", href: "/projects", icon: FolderOpen },
  { name: "Discussions", href: "/discussions", icon: MessageSquare },
{ name: "Model", href: "/model", icon: Brain },
  { name: "Permissions", href: "/permissions", icon: Shield },
  { name: "Sandbox", href: "/sandbox", icon: Box },
  { name: "Hooks", href: "/hooks", icon: Webhook },
  { name: "Plugins", href: "/plugins", icon: Puzzle },
  { name: "MCPs", href: "/mcps", icon: Plug },
  { name: "Commands", href: "/commands", icon: Terminal },
  { name: "Advanced", href: "/advanced", icon: Wrench },
  { name: "Stats", href: "/stats", icon: BarChart3 },
];

export function Sidebar() {
  const pathname = usePathname();
  const { selectedProjectPath, settingsIndex } = useSettingsStore();

  // Get current project name
  const currentProjectName = selectedProjectPath === null
    ? "Global"
    : settingsIndex?.locations.find((l) => l.path === selectedProjectPath)?.projectName || "Project";

  return (
    <div className="flex h-full w-64 flex-col border-r bg-muted/30">
      <div className="flex h-14 items-center border-b px-4">
        <Settings className="mr-2 h-5 w-5" />
        <span className="font-semibold">Claude Settings</span>
      </div>

      {/* Current Project Indicator */}
      <Link
        href="/projects"
        className="flex items-center gap-2 px-4 py-3 border-b bg-muted/50 hover:bg-muted transition-colors"
      >
        {selectedProjectPath === null ? (
          <div className="flex items-center justify-center h-8 w-8 rounded-full bg-blue-500/10 border border-blue-500/20">
            <User className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          </div>
        ) : (
          <div className="flex items-center justify-center h-8 w-8 rounded-full bg-purple-500/10 border border-purple-500/20">
            <Users className="h-4 w-4 text-purple-600 dark:text-purple-400" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{currentProjectName}</p>
          <p className="text-xs text-muted-foreground truncate">
            {selectedProjectPath === null ? "User Settings" : "Project Settings"}
          </p>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </Link>

      <nav className="flex-1 space-y-1 p-2">
        {navigation.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.name}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
