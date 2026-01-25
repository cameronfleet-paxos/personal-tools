"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Settings,
  Brain,
  Shield,
  Box,
  Webhook,
  Puzzle,
  BarChart3,
  Wrench,
  Home,
} from "lucide-react";

const navigation = [
  { name: "Dashboard", href: "/", icon: Home },
  { name: "Model", href: "/model", icon: Brain },
  { name: "Permissions", href: "/permissions", icon: Shield },
  { name: "Sandbox", href: "/sandbox", icon: Box },
  { name: "Hooks", href: "/hooks", icon: Webhook },
  { name: "Plugins", href: "/plugins", icon: Puzzle },
  { name: "Advanced", href: "/advanced", icon: Wrench },
  { name: "Stats", href: "/stats", icon: BarChart3 },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <div className="flex h-full w-64 flex-col border-r bg-muted/30">
      <div className="flex h-14 items-center border-b px-4">
        <Settings className="mr-2 h-5 w-5" />
        <span className="font-semibold">Claude Settings</span>
      </div>
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
