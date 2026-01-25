"use client";

import { create } from "zustand";
import type {
  Settings,
  InstalledPlugins,
  StatsCache,
  PendingChange,
} from "@/types/settings";

function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

function getValueAtPath(obj: unknown, path: string[]): unknown {
  let current = obj as Record<string, unknown>;
  for (const key of path) {
    if (current === null || current === undefined) return undefined;
    current = current[key] as Record<string, unknown>;
  }
  return current;
}

function setValueAtPath(
  obj: Record<string, unknown>,
  path: string[],
  value: unknown
): Record<string, unknown> {
  const result = { ...obj };
  let current = result;

  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    current[key] = { ...(current[key] as Record<string, unknown>) };
    current = current[key] as Record<string, unknown>;
  }

  const lastKey = path[path.length - 1];
  if (value === undefined) {
    delete current[lastKey];
  } else {
    current[lastKey] = value;
  }

  return result;
}

function computeEffectiveSettings(
  base: Settings | null,
  pendingChanges: PendingChange[],
  target: "global" | "local"
): Settings {
  let result = { ...base } as Record<string, unknown>;
  for (const change of pendingChanges) {
    if (change.target === target) {
      result = setValueAtPath(result, change.path, change.newValue);
    }
  }
  return result as Settings;
}

interface SettingsStore {
  // Data
  globalSettings: Settings | null;
  localSettings: Settings | null;
  plugins: InstalledPlugins | null;
  stats: StatsCache | null;

  // Computed effective settings (with pending changes applied)
  effectiveGlobal: Settings;
  effectiveLocal: Settings;

  // Pending changes
  pendingChanges: PendingChange[];

  // UI State
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;

  // Actions
  loadSettings: () => Promise<void>;
  updateSetting: (
    path: string[],
    value: unknown,
    target: "global" | "local",
    description: string
  ) => void;
  discardChange: (changeId: string) => void;
  discardAllChanges: () => void;
  saveChanges: () => Promise<void>;
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  globalSettings: null,
  localSettings: null,
  plugins: null,
  stats: null,
  effectiveGlobal: {},
  effectiveLocal: {},
  pendingChanges: [],
  isLoading: false,
  isSaving: false,
  error: null,

  loadSettings: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await fetch("/api/settings");
      if (!response.ok) {
        throw new Error("Failed to load settings");
      }
      const data = await response.json();
      set({
        globalSettings: data.global,
        localSettings: data.local,
        plugins: data.plugins,
        stats: data.stats,
        effectiveGlobal: data.global || {},
        effectiveLocal: data.local || {},
        isLoading: false,
        pendingChanges: [],
      });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Unknown error",
        isLoading: false,
      });
    }
  },

  updateSetting: (path, value, target, description) => {
    const state = get();
    const settings =
      target === "global" ? state.globalSettings : state.localSettings;
    const oldValue = getValueAtPath(settings, path);

    // Don't add change if value is the same
    if (JSON.stringify(oldValue) === JSON.stringify(value)) {
      return;
    }

    // Check if there's already a pending change for this path
    const existingIndex = state.pendingChanges.findIndex(
      (c) => c.target === target && c.path.join(".") === path.join(".")
    );

    const newChange: PendingChange = {
      id: generateId(),
      path,
      oldValue,
      newValue: value,
      target,
      description,
      timestamp: new Date(),
    };

    let newPendingChanges: PendingChange[];

    if (existingIndex >= 0) {
      const updated = [...state.pendingChanges];
      // If reverting to original value, remove the change
      if (
        JSON.stringify(updated[existingIndex].oldValue) === JSON.stringify(value)
      ) {
        updated.splice(existingIndex, 1);
        newPendingChanges = updated;
      } else {
        updated[existingIndex] = {
          ...newChange,
          oldValue: updated[existingIndex].oldValue,
        };
        newPendingChanges = updated;
      }
    } else {
      newPendingChanges = [...state.pendingChanges, newChange];
    }

    // Recompute effective settings
    set({
      pendingChanges: newPendingChanges,
      effectiveGlobal: computeEffectiveSettings(
        state.globalSettings,
        newPendingChanges,
        "global"
      ),
      effectiveLocal: computeEffectiveSettings(
        state.localSettings,
        newPendingChanges,
        "local"
      ),
    });
  },

  discardChange: (changeId) => {
    const state = get();
    const newPendingChanges = state.pendingChanges.filter(
      (c) => c.id !== changeId
    );
    set({
      pendingChanges: newPendingChanges,
      effectiveGlobal: computeEffectiveSettings(
        state.globalSettings,
        newPendingChanges,
        "global"
      ),
      effectiveLocal: computeEffectiveSettings(
        state.localSettings,
        newPendingChanges,
        "local"
      ),
    });
  },

  discardAllChanges: () => {
    const state = get();
    set({
      pendingChanges: [],
      effectiveGlobal: state.globalSettings || {},
      effectiveLocal: state.localSettings || {},
    });
  },

  saveChanges: async () => {
    const state = get();
    if (state.pendingChanges.length === 0) return;

    set({ isSaving: true, error: null });

    try {
      const hasGlobalChanges = state.pendingChanges.some(
        (c) => c.target === "global"
      );
      const hasLocalChanges = state.pendingChanges.some(
        (c) => c.target === "local"
      );

      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          global: hasGlobalChanges ? state.effectiveGlobal : undefined,
          local: hasLocalChanges ? state.effectiveLocal : undefined,
        }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(
          result.errors?.map((e: { error: string }) => e.error).join(", ") ||
            "Save failed"
        );
      }

      // Update base settings to match effective and clear pending changes
      set({
        globalSettings: hasGlobalChanges
          ? state.effectiveGlobal
          : state.globalSettings,
        localSettings: hasLocalChanges
          ? state.effectiveLocal
          : state.localSettings,
        pendingChanges: [],
        isSaving: false,
      });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Save failed",
        isSaving: false,
      });
    }
  },
}));
