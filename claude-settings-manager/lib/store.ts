"use client";

import { create } from "zustand";
import type {
  Settings,
  InstalledPlugins,
  StatsCache,
  PendingChange,
  SettingsIndex,
  SettingsTarget,
  MultiSourceSettingsResponse,
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
  targets: SettingsTarget[]
): Settings {
  let result = { ...base } as Record<string, unknown>;
  for (const change of pendingChanges) {
    if (targets.includes(change.target)) {
      result = setValueAtPath(result, change.path, change.newValue);
    }
  }
  return result as Settings;
}

interface SettingsStore {
  // Multi-source settings data (3 sources when in project context)
  // Note: userLocalSettings removed - user-local doesn't exist per Claude Code docs
  userSettings: Settings | null;
  projectSettings: Settings | null;
  projectLocalSettings: Settings | null;

  // Legacy aliases for backward compatibility (point to user or project depending on context)
  globalSettings: Settings | null;
  localSettings: Settings | null;

  plugins: InstalledPlugins | null;
  stats: StatsCache | null;

  // Settings Index (multi-project discovery)
  settingsIndex: SettingsIndex | null;
  selectedProjectPath: string | null; // null = user settings mode

  // Computed effective settings (with pending changes applied)
  // Note: effectiveUserLocal removed - user-local doesn't exist per Claude Code docs
  effectiveUser: Settings;
  effectiveProject: Settings;
  effectiveProjectLocal: Settings;

  // Legacy aliases for backward compatibility
  effectiveGlobal: Settings;
  effectiveLocal: Settings;

  // Pending changes
  pendingChanges: PendingChange[];

  // UI State
  isLoading: boolean;
  isSaving: boolean;
  isIndexing: boolean;
  error: string | null;

  // Computed helpers
  getGlobalScopeLabel: () => "user" | "project";
  isInProjectContext: () => boolean;

  // Actions
  loadSettings: () => Promise<void>;
  updateSetting: (
    path: string[],
    value: unknown,
    target: SettingsTarget,
    description: string
  ) => void;
  discardChange: (changeId: string) => void;
  discardAllChanges: () => void;
  saveChanges: () => Promise<void>;
  loadIndex: () => Promise<void>;
  reindex: () => Promise<void>;
  selectProject: (path: string | null) => Promise<void>;
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  // Multi-source settings (userLocalSettings removed - doesn't exist per Claude Code docs)
  userSettings: null,
  projectSettings: null,
  projectLocalSettings: null,

  // Legacy aliases (computed based on context)
  globalSettings: null,
  localSettings: null,

  plugins: null,
  stats: null,
  settingsIndex: null,
  selectedProjectPath: null,

  // Effective settings (with pending changes) - effectiveUserLocal removed
  effectiveUser: {},
  effectiveProject: {},
  effectiveProjectLocal: {},

  // Legacy aliases
  effectiveGlobal: {},
  effectiveLocal: {},

  pendingChanges: [],
  isLoading: false,
  isSaving: false,
  isIndexing: false,
  error: null,

  // Returns "user" when viewing ~/.claude, "project" when viewing a project
  getGlobalScopeLabel: () => {
    return get().selectedProjectPath ? "project" : "user";
  },

  // Returns true when a project is selected
  isInProjectContext: () => {
    return get().selectedProjectPath !== null;
  },

  loadSettings: async () => {
    const state = get();
    set({ isLoading: true, error: null });
    try {
      const url = state.selectedProjectPath
        ? `/api/settings?path=${encodeURIComponent(state.selectedProjectPath)}`
        : "/api/settings";
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error("Failed to load settings");
      }
      const data = await response.json();

      if (state.selectedProjectPath) {
        // Multi-source response (project context) - userLocal removed
        const multiData = data as MultiSourceSettingsResponse;
        set({
          userSettings: multiData.user,
          projectSettings: multiData.project,
          projectLocalSettings: multiData.projectLocal,
          // Legacy aliases point to project settings in project context
          globalSettings: multiData.project,
          localSettings: multiData.projectLocal,
          plugins: multiData.plugins,
          stats: multiData.stats,
          effectiveUser: multiData.user || {},
          effectiveProject: multiData.project || {},
          effectiveProjectLocal: multiData.projectLocal || {},
          // Legacy aliases
          effectiveGlobal: multiData.project || {},
          effectiveLocal: multiData.projectLocal || {},
          isLoading: false,
          pendingChanges: [],
        });
      } else {
        // Legacy response (user settings only) - userLocal removed
        set({
          userSettings: data.global,
          projectSettings: null,
          projectLocalSettings: null,
          // Legacy aliases point to user settings when no project
          globalSettings: data.global,
          localSettings: null,
          plugins: data.plugins,
          stats: data.stats,
          effectiveUser: data.global || {},
          effectiveProject: {},
          effectiveProjectLocal: {},
          // Legacy aliases
          effectiveGlobal: data.global || {},
          effectiveLocal: {},
          isLoading: false,
          pendingChanges: [],
        });
      }
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Unknown error",
        isLoading: false,
      });
    }
  },

  updateSetting: (path, value, target, description) => {
    const state = get();

    // Get the base settings for the target (user-local removed - doesn't exist)
    const getBaseSettings = (t: SettingsTarget): Settings | null => {
      switch (t) {
        case "user":
          return state.userSettings;
        case "project":
          return state.projectSettings;
        case "project-local":
          return state.projectLocalSettings;
      }
    };

    const settings = getBaseSettings(target);
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

    // Recompute all effective settings (userLocal removed)
    set({
      pendingChanges: newPendingChanges,
      effectiveUser: computeEffectiveSettings(
        state.userSettings,
        newPendingChanges,
        ["user"]
      ),
      effectiveProject: computeEffectiveSettings(
        state.projectSettings,
        newPendingChanges,
        ["project"]
      ),
      effectiveProjectLocal: computeEffectiveSettings(
        state.projectLocalSettings,
        newPendingChanges,
        ["project-local"]
      ),
      // Legacy aliases
      effectiveGlobal: state.selectedProjectPath
        ? computeEffectiveSettings(state.projectSettings, newPendingChanges, ["project"])
        : computeEffectiveSettings(state.userSettings, newPendingChanges, ["user"]),
      effectiveLocal: state.selectedProjectPath
        ? computeEffectiveSettings(state.projectLocalSettings, newPendingChanges, ["project-local"])
        : {},
    });
  },

  discardChange: (changeId) => {
    const state = get();
    const newPendingChanges = state.pendingChanges.filter(
      (c) => c.id !== changeId
    );
    set({
      pendingChanges: newPendingChanges,
      effectiveUser: computeEffectiveSettings(
        state.userSettings,
        newPendingChanges,
        ["user"]
      ),
      effectiveProject: computeEffectiveSettings(
        state.projectSettings,
        newPendingChanges,
        ["project"]
      ),
      effectiveProjectLocal: computeEffectiveSettings(
        state.projectLocalSettings,
        newPendingChanges,
        ["project-local"]
      ),
      // Legacy aliases
      effectiveGlobal: state.selectedProjectPath
        ? computeEffectiveSettings(state.projectSettings, newPendingChanges, ["project"])
        : computeEffectiveSettings(state.userSettings, newPendingChanges, ["user"]),
      effectiveLocal: state.selectedProjectPath
        ? computeEffectiveSettings(state.projectLocalSettings, newPendingChanges, ["project-local"])
        : {},
    });
  },

  discardAllChanges: () => {
    const state = get();
    set({
      pendingChanges: [],
      effectiveUser: state.userSettings || {},
      effectiveProject: state.projectSettings || {},
      effectiveProjectLocal: state.projectLocalSettings || {},
      // Legacy aliases
      effectiveGlobal: state.selectedProjectPath
        ? (state.projectSettings || {})
        : (state.userSettings || {}),
      effectiveLocal: state.selectedProjectPath
        ? (state.projectLocalSettings || {})
        : {},
    });
  },

  saveChanges: async () => {
    const state = get();
    if (state.pendingChanges.length === 0) return;

    set({ isSaving: true, error: null });

    try {
      const hasUserChanges = state.pendingChanges.some(
        (c) => c.target === "user"
      );
      const hasUserLocalChanges = state.pendingChanges.some(
        (c) => c.target === "user-local"
      );
      const hasProjectChanges = state.pendingChanges.some(
        (c) => c.target === "project"
      );
      const hasProjectLocalChanges = state.pendingChanges.some(
        (c) => c.target === "project-local"
      );

      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user: hasUserChanges ? state.effectiveUser : undefined,
          userLocal: hasUserLocalChanges ? state.effectiveUserLocal : undefined,
          project: hasProjectChanges ? state.effectiveProject : undefined,
          projectLocal: hasProjectLocalChanges ? state.effectiveProjectLocal : undefined,
          path: state.selectedProjectPath || undefined,
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
        userSettings: hasUserChanges ? state.effectiveUser : state.userSettings,
        userLocalSettings: hasUserLocalChanges ? state.effectiveUserLocal : state.userLocalSettings,
        projectSettings: hasProjectChanges ? state.effectiveProject : state.projectSettings,
        projectLocalSettings: hasProjectLocalChanges ? state.effectiveProjectLocal : state.projectLocalSettings,
        // Update legacy aliases
        globalSettings: state.selectedProjectPath
          ? (hasProjectChanges ? state.effectiveProject : state.projectSettings)
          : (hasUserChanges ? state.effectiveUser : state.userSettings),
        localSettings: state.selectedProjectPath
          ? (hasProjectLocalChanges ? state.effectiveProjectLocal : state.projectLocalSettings)
          : (hasUserLocalChanges ? state.effectiveUserLocal : state.userLocalSettings),
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

  loadIndex: async () => {
    set({ isIndexing: true });
    try {
      const response = await fetch("/api/index");
      if (!response.ok) {
        throw new Error("Failed to load index");
      }
      const data = await response.json();
      set({ settingsIndex: data.index, isIndexing: false });
    } catch (err) {
      console.error("Error loading index:", err);
      set({ isIndexing: false });
    }
  },

  reindex: async () => {
    set({ isIndexing: true, error: null });
    try {
      const response = await fetch("/api/index", { method: "POST" });
      if (!response.ok) {
        throw new Error("Failed to reindex");
      }
      const data = await response.json();
      if (data.success) {
        set({ settingsIndex: data.index, isIndexing: false });
      } else {
        throw new Error(data.error || "Reindex failed");
      }
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Reindex failed",
        isIndexing: false,
      });
    }
  },

  selectProject: async (path) => {
    set({ selectedProjectPath: path, pendingChanges: [] });
    await get().loadSettings();
  },
}));
