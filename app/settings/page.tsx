"use client";

import { useState } from "react";
import { useSettingsStore } from "@/lib/store";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingOverlay } from "@/components/loading-overlay";
import { cn } from "@/lib/utils";
import { PathsSettings } from "./components/PathsSettings";

type SettingsSection = "paths" | "general" | "appearance" | "notifications" | "privacy";

interface SidebarItem {
  id: SettingsSection;
  label: string;
  description: string;
}

const sidebarItems: SidebarItem[] = [
  {
    id: "paths",
    label: "Paths",
    description: "Tool paths and system configuration",
  },
  {
    id: "general",
    label: "General",
    description: "General application settings and preferences",
  },
  {
    id: "appearance",
    label: "Appearance",
    description: "Customize the look and feel",
  },
  {
    id: "notifications",
    label: "Notifications",
    description: "Manage notification preferences",
  },
  {
    id: "privacy",
    label: "Privacy",
    description: "Privacy and data settings",
  },
];

export default function SettingsPage() {
  const { isLoading, effectiveUser } = useSettingsStore();
  const [activeSection, setActiveSection] = useState<SettingsSection>("paths");

  const hasData = effectiveUser !== null;

  if (isLoading && !hasData) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading settings...</div>
      </div>
    );
  }

  const renderContent = () => {
    switch (activeSection) {
      case "paths":
        return <PathsSettings />;
      case "general":
        return (
          <Card>
            <CardHeader>
              <CardTitle>General Settings</CardTitle>
              <CardDescription>
                Configure general application preferences
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                General settings content will be added here.
              </p>
            </CardContent>
          </Card>
        );
      case "appearance":
        return (
          <Card>
            <CardHeader>
              <CardTitle>Appearance</CardTitle>
              <CardDescription>
                Customize how the application looks
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Appearance settings content will be added here.
              </p>
            </CardContent>
          </Card>
        );
      case "notifications":
        return (
          <Card>
            <CardHeader>
              <CardTitle>Notifications</CardTitle>
              <CardDescription>
                Manage how you receive notifications
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Notification settings content will be added here.
              </p>
            </CardContent>
          </Card>
        );
      case "privacy":
        return (
          <Card>
            <CardHeader>
              <CardTitle>Privacy</CardTitle>
              <CardDescription>
                Control your privacy and data preferences
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Privacy settings content will be added here.
              </p>
            </CardContent>
          </Card>
        );
    }
  };

  return (
    <>
      <LoadingOverlay isVisible={isLoading && hasData} />
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Settings</h1>
          <p className="text-muted-foreground">
            Manage your application settings and preferences
          </p>
        </div>

        <div className="flex gap-6">
          {/* Sidebar Navigation */}
          <div className="w-64 shrink-0">
            <nav className="space-y-1">
              {sidebarItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setActiveSection(item.id)}
                  className={cn(
                    "w-full text-left px-3 py-2 rounded-md text-sm transition-colors",
                    activeSection === item.id
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted text-muted-foreground hover:text-foreground"
                  )}
                >
                  <div className="font-medium">{item.label}</div>
                  <div className="text-xs opacity-80 mt-0.5">
                    {item.description}
                  </div>
                </button>
              ))}
            </nav>
          </div>

          {/* Main Content Area */}
          <div className="flex-1 min-w-0">
            <div className="space-y-6">{renderContent()}</div>
          </div>
        </div>
      </div>
    </>
  );
}
