"use client";

import { useEffect } from "react";
import { useSettingsStore } from "@/lib/store";

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const loadSettings = useSettingsStore((s) => s.loadSettings);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  return <>{children}</>;
}
