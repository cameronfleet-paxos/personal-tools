"use client";

import { useEffect } from "react";
import { useSettingsStore } from "@/lib/store";

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const loadSettings = useSettingsStore((s) => s.loadSettings);

  useEffect(() => {
    loadSettings();

    // Auto-sync every 30 minutes
    const interval = setInterval(() => {
      loadSettings();
    }, 30 * 60 * 1000);

    return () => clearInterval(interval);
  }, [loadSettings]);

  return <>{children}</>;
}
