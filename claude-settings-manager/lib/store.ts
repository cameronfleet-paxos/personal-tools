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
  CommandEntry,
  SettingRecommendation,
  SecurityRecommendation,
  AggregatedInterruption,
  PermissionTimeFilter,
  SessionMetadata,
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

  // Commands state
  commands: CommandEntry[];
  commandsLastIndexed: string | null;
  commandsSearchQuery: string;
  commandsSourceFilter: "all" | "user" | "project";
  commandsTypeFilter: "all" | "command" | "skill";

  // Recommendations state
  recommendations: SettingRecommendation[];
  recommendationsLoading: boolean;
  analyzedProjects: number;

  // Security recommendations state
  securityRecommendations: SecurityRecommendation[];
  securityRecommendationsLoading: boolean;

  // Permission interruptions state
  permissionInterruptions: AggregatedInterruption[];
  permissionInterruptionsLoading: boolean;
  permissionInterruptionsFilter: PermissionTimeFilter;
  permissionInterruptionsTotalEvents: number;

  // Discussions state
  discussions: SessionMetadata[];
  discussionsLoading: boolean;
  discussionsTotalCount: number;

  // UI State
  isLoading: boolean;
  isSaving: boolean;
  isIndexing: boolean;
  isSyncing: boolean;
  isMCPsSyncing: boolean;
  error: string | null;

  // Sync state
  lastSyncedAt: Date | null;

  // Computed helpers
  getGlobalScopeLabel: () => "user" | "project";
  isInProjectContext: () => boolean;
  filteredCommands: () => CommandEntry[];

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
  refreshIndex: () => Promise<void>;
  refreshMCPs: () => Promise<void>;
  selectProject: (path: string | null) => Promise<void>;
  setCommandsSearchQuery: (query: string) => void;
  setCommandsSourceFilter: (filter: "all" | "user" | "project") => void;
  setCommandsTypeFilter: (filter: "all" | "command" | "skill") => void;

  // Recommendations actions
  loadRecommendations: () => Promise<void>;
  applyRecommendation: (id: string) => Promise<void>;

  // Security recommendations actions
  loadSecurityRecommendations: () => Promise<void>;
  fixSecurityRecommendation: (id: string) => Promise<void>;

  // Permission interruptions actions
  loadPermissionInterruptions: () => Promise<void>;
  setPermissionInterruptionsFilter: (filter: PermissionTimeFilter) => Promise<void>;
  allowPermissionPattern: (id: string) => Promise<void>;
  dismissPermissionInterruption: (id: string) => Promise<void>;
  resetDismissedInterruptions: () => Promise<void>;

  // Discussions actions
  loadDiscussions: (limit?: number) => Promise<void>;
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

  // Commands state
  commands: [],
  commandsLastIndexed: null,
  commandsSearchQuery: "",
  commandsSourceFilter: "all",
  commandsTypeFilter: "all",

  // Recommendations state
  recommendations: [],
  recommendationsLoading: false,
  analyzedProjects: 0,

  // Security recommendations state
  securityRecommendations: [],
  securityRecommendationsLoading: false,

  // Permission interruptions state
  permissionInterruptions: [],
  permissionInterruptionsLoading: false,
  permissionInterruptionsFilter: "week",
  permissionInterruptionsTotalEvents: 0,

  // Discussions state
  discussions: [],
  discussionsLoading: false,
  discussionsTotalCount: 0,

  isLoading: false,
  isSaving: false,
  isIndexing: false,
  isSyncing: false,
  isMCPsSyncing: false,
  error: null,

  // Sync state
  lastSyncedAt: null,

  // Returns "user" when viewing ~/.claude, "project" when viewing a project
  getGlobalScopeLabel: () => {
    return get().selectedProjectPath ? "project" : "user";
  },

  // Returns true when a project is selected
  isInProjectContext: () => {
    return get().selectedProjectPath !== null;
  },

  // Filter commands by search query, source, and type
  filteredCommands: () => {
    const { commands, commandsSearchQuery, commandsSourceFilter, commandsTypeFilter } = get();
    const query = commandsSearchQuery.toLowerCase();

    return commands.filter((cmd) => {
      // Filter by source
      if (commandsSourceFilter !== "all" && cmd.source !== commandsSourceFilter) {
        return false;
      }
      // Filter by type
      if (commandsTypeFilter !== "all" && cmd.type !== commandsTypeFilter) {
        return false;
      }
      // Filter by search query (matches name or description)
      if (query) {
        const matchesName = cmd.name.toLowerCase().includes(query);
        const matchesDescription = cmd.metadata.description?.toLowerCase().includes(query);
        if (!matchesName && !matchesDescription) {
          return false;
        }
      }
      return true;
    });
  },

  loadSettings: async () => {
    const state = get();
    set({ isLoading: true, isSyncing: true, isIndexing: true, error: null });
    try {
      const settingsUrl = state.selectedProjectPath
        ? `/api/settings?path=${encodeURIComponent(state.selectedProjectPath)}`
        : "/api/settings";

      // Fetch settings and refresh index in parallel
      const [settingsResponse, indexResponse] = await Promise.all([
        fetch(settingsUrl),
        fetch("/api/index", { method: "PUT" }),
      ]);

      if (!settingsResponse.ok) {
        throw new Error("Failed to load settings");
      }
      const data = await settingsResponse.json();

      // Process index response
      let indexData = null;
      if (indexResponse.ok) {
        indexData = await indexResponse.json();
      }

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
          // Update index data if refresh succeeded
          settingsIndex: indexData?.success ? indexData.index : state.settingsIndex,
          commands: indexData?.success ? (indexData.index?.commands?.commands || []) : state.commands,
          commandsLastIndexed: indexData?.success ? (indexData.index?.lastIndexed || null) : state.commandsLastIndexed,
          isLoading: false,
          isSyncing: false,
          isIndexing: false,
          lastSyncedAt: new Date(),
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
          // Update index data if refresh succeeded
          settingsIndex: indexData?.success ? indexData.index : state.settingsIndex,
          commands: indexData?.success ? (indexData.index?.commands?.commands || []) : state.commands,
          commandsLastIndexed: indexData?.success ? (indexData.index?.lastIndexed || null) : state.commandsLastIndexed,
          isLoading: false,
          isSyncing: false,
          isIndexing: false,
          lastSyncedAt: new Date(),
          pendingChanges: [],
        });
      }

      // Slow path - background MCP refresh (non-blocking)
      // Fire and forget - don't await, let it run in background
      get().refreshMCPs();
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Unknown error",
        isLoading: false,
        isSyncing: false,
        isIndexing: false,
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
      // userLocal removed - doesn't exist per Claude Code docs
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
        projectSettings: hasProjectChanges ? state.effectiveProject : state.projectSettings,
        projectLocalSettings: hasProjectLocalChanges ? state.effectiveProjectLocal : state.projectLocalSettings,
        // Update legacy aliases
        globalSettings: state.selectedProjectPath
          ? (hasProjectChanges ? state.effectiveProject : state.projectSettings)
          : (hasUserChanges ? state.effectiveUser : state.userSettings),
        localSettings: state.selectedProjectPath
          ? (hasProjectLocalChanges ? state.effectiveProjectLocal : state.projectLocalSettings)
          : null,
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
      const index = data.index;
      set({
        settingsIndex: index,
        commands: index?.commands?.commands || [],
        commandsLastIndexed: index?.lastIndexed || null,
        isIndexing: false,
      });
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
        const index = data.index;
        set({
          settingsIndex: index,
          commands: index?.commands?.commands || [],
          commandsLastIndexed: index?.lastIndexed || null,
          isIndexing: false,
        });
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

  refreshIndex: async () => {
    set({ isIndexing: true, error: null });
    try {
      const response = await fetch("/api/index", { method: "PUT" });
      if (!response.ok) {
        throw new Error("Failed to refresh index");
      }
      const data = await response.json();
      if (data.success) {
        const index = data.index;
        set({
          settingsIndex: index,
          commands: index?.commands?.commands || [],
          commandsLastIndexed: index?.lastIndexed || null,
          isIndexing: false,
        });
      } else {
        throw new Error(data.error || "Refresh failed");
      }
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Refresh failed",
        isIndexing: false,
      });
    }
  },

  refreshMCPs: async () => {
    set({ isMCPsSyncing: true });
    try {
      const response = await fetch("/api/mcps/refresh", { method: "POST" });
      if (!response.ok) {
        throw new Error("Failed to refresh MCPs");
      }
      const data = await response.json();
      if (data.success && data.mcps) {
        // Update store with new MCPs
        set((state) => ({
          settingsIndex: state.settingsIndex
            ? { ...state.settingsIndex, mcps: data.mcps }
            : state.settingsIndex,
          isMCPsSyncing: false,
        }));
      } else {
        set({ isMCPsSyncing: false });
      }
    } catch (err) {
      console.error("Error refreshing MCPs:", err);
      set({ isMCPsSyncing: false });
    }
  },

  selectProject: async (path) => {
    set({ selectedProjectPath: path, pendingChanges: [] });
    await get().loadSettings();
  },

  setCommandsSearchQuery: (query) => {
    set({ commandsSearchQuery: query });
  },

  setCommandsSourceFilter: (filter) => {
    set({ commandsSourceFilter: filter });
  },

  setCommandsTypeFilter: (filter) => {
    set({ commandsTypeFilter: filter });
  },

  loadRecommendations: async () => {
    set({ recommendationsLoading: true });
    try {
      const response = await fetch("/api/recommendations");
      if (!response.ok) {
        throw new Error("Failed to load recommendations");
      }
      const data = await response.json();
      set({
        recommendations: data.recommendations,
        analyzedProjects: data.analyzedProjects,
        recommendationsLoading: false,
      });
    } catch (err) {
      console.error("Error loading recommendations:", err);
      set({ recommendationsLoading: false });
    }
  },

  applyRecommendation: async (id) => {
    const state = get();
    const recommendation = state.recommendations.find((r) => r.id === id);
    if (!recommendation) return;

    set({ recommendationsLoading: true });
    try {
      const response = await fetch("/api/recommendations/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recommendation }),
      });

      if (!response.ok) {
        throw new Error("Failed to apply recommendation");
      }

      const result = await response.json();
      if (!result.success) {
        console.error("Errors applying recommendation:", result.errors);
      }

      // Remove the applied recommendation from the list
      set({
        recommendations: state.recommendations.filter((r) => r.id !== id),
        recommendationsLoading: false,
      });

      // Silently reload settings without triggering loading states
      // This avoids the jarring skeleton reload after promoting a recommendation
      try {
        const settingsUrl = state.selectedProjectPath
          ? `/api/settings?path=${encodeURIComponent(state.selectedProjectPath)}`
          : "/api/settings";
        const settingsResponse = await fetch(settingsUrl);
        if (settingsResponse.ok) {
          const data = await settingsResponse.json();
          if (state.selectedProjectPath) {
            set({
              userSettings: data.user,
              effectiveUser: data.user || {},
            });
          } else {
            set({
              userSettings: data.global,
              globalSettings: data.global,
              effectiveUser: data.global || {},
              effectiveGlobal: data.global || {},
            });
          }
        }
      } catch {
        // Silent fail - settings will refresh on next full load
      }
    } catch (err) {
      console.error("Error applying recommendation:", err);
      set({ recommendationsLoading: false });
    }
  },

  loadSecurityRecommendations: async () => {
    set({ securityRecommendationsLoading: true });
    try {
      const response = await fetch("/api/security-recommendations");
      if (!response.ok) {
        throw new Error("Failed to load security recommendations");
      }
      const data = await response.json();
      set({
        securityRecommendations: data.recommendations,
        securityRecommendationsLoading: false,
      });
    } catch (err) {
      console.error("Error loading security recommendations:", err);
      set({ securityRecommendationsLoading: false });
    }
  },

  fixSecurityRecommendation: async (id: string) => {
    const state = get();
    const recommendation = state.securityRecommendations.find((r) => r.id === id);
    if (!recommendation) return;

    set({ securityRecommendationsLoading: true });
    try {
      const response = await fetch("/api/security-recommendations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pattern: recommendation.pattern,
          scope: recommendation.scope,
          location: recommendation.location,
          projectPath: recommendation.projectPath,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to fix security recommendation");
      }

      const result = await response.json();
      if (!result.success) {
        console.error("Error fixing security recommendation:", result.error);
        set({ securityRecommendationsLoading: false });
        return;
      }

      // Remove the fixed recommendation from the list
      set({
        securityRecommendations: state.securityRecommendations.filter((r) => r.id !== id),
        securityRecommendationsLoading: false,
      });

      // Silently reload settings without triggering loading states
      try {
        const settingsUrl = state.selectedProjectPath
          ? `/api/settings?path=${encodeURIComponent(state.selectedProjectPath)}`
          : "/api/settings";
        const settingsResponse = await fetch(settingsUrl);
        if (settingsResponse.ok) {
          const data = await settingsResponse.json();
          if (state.selectedProjectPath) {
            set({
              userSettings: data.user,
              effectiveUser: data.user || {},
            });
          } else {
            set({
              userSettings: data.global,
              globalSettings: data.global,
              effectiveUser: data.global || {},
              effectiveGlobal: data.global || {},
            });
          }
        }
      } catch {
        // Silent fail - settings will refresh on next full load
      }
    } catch (err) {
      console.error("Error fixing security recommendation:", err);
      set({ securityRecommendationsLoading: false });
    }
  },

  loadPermissionInterruptions: async () => {
    const state = get();
    set({ permissionInterruptionsLoading: true });
    try {
      const response = await fetch(
        `/api/permission-interruptions?filter=${state.permissionInterruptionsFilter}`
      );
      if (!response.ok) {
        throw new Error("Failed to load permission interruptions");
      }
      const data = await response.json();
      set({
        permissionInterruptions: data.interruptions,
        permissionInterruptionsTotalEvents: data.totalEvents,
        permissionInterruptionsLoading: false,
      });
    } catch (err) {
      console.error("Error loading permission interruptions:", err);
      set({ permissionInterruptionsLoading: false });
    }
  },

  setPermissionInterruptionsFilter: async (filter: PermissionTimeFilter) => {
    set({ permissionInterruptionsFilter: filter });
    await get().loadPermissionInterruptions();
  },

  allowPermissionPattern: async (id: string) => {
    const state = get();
    const interruption = state.permissionInterruptions.find((i) => i.id === id);
    if (!interruption) return;

    set({ permissionInterruptionsLoading: true });
    try {
      const response = await fetch("/api/permission-interruptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pattern: interruption.fullPattern }),
      });

      if (!response.ok) {
        throw new Error("Failed to allow permission pattern");
      }

      const result = await response.json();
      if (!result.success) {
        console.error("Error allowing permission pattern:", result.error);
        set({ permissionInterruptionsLoading: false });
        return;
      }

      // Update the interruption to show it's now in user scope
      set({
        permissionInterruptions: state.permissionInterruptions.map((i) =>
          i.id === id ? { ...i, alreadyInUserScope: true } : i
        ),
        permissionInterruptionsLoading: false,
      });

      // Silently reload settings without triggering loading states
      try {
        const settingsUrl = state.selectedProjectPath
          ? `/api/settings?path=${encodeURIComponent(state.selectedProjectPath)}`
          : "/api/settings";
        const settingsResponse = await fetch(settingsUrl);
        if (settingsResponse.ok) {
          const data = await settingsResponse.json();
          if (state.selectedProjectPath) {
            set({
              userSettings: data.user,
              effectiveUser: data.user || {},
            });
          } else {
            set({
              userSettings: data.global,
              globalSettings: data.global,
              effectiveUser: data.global || {},
              effectiveGlobal: data.global || {},
            });
          }
        }
      } catch {
        // Silent fail - settings will refresh on next full load
      }
    } catch (err) {
      console.error("Error allowing permission pattern:", err);
      set({ permissionInterruptionsLoading: false });
    }
  },

  dismissPermissionInterruption: async (id: string) => {
    const state = get();
    const interruption = state.permissionInterruptions.find((i) => i.id === id);
    if (!interruption) return;

    try {
      const response = await fetch("/api/permission-interruptions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pattern: interruption.fullPattern }),
      });

      if (!response.ok) {
        throw new Error("Failed to dismiss permission interruption");
      }

      const result = await response.json();
      if (!result.success) {
        console.error("Error dismissing permission interruption:", result.error);
        return;
      }

      // Remove the dismissed interruption from the list
      set({
        permissionInterruptions: state.permissionInterruptions.filter((i) => i.id !== id),
      });
    } catch (err) {
      console.error("Error dismissing permission interruption:", err);
    }
  },

  resetDismissedInterruptions: async () => {
    set({ permissionInterruptionsLoading: true });

    try {
      const response = await fetch("/api/permission-interruptions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reset: true }),
      });

      if (!response.ok) {
        throw new Error("Failed to reset dismissed interruptions");
      }

      const result = await response.json();
      if (!result.success) {
        console.error("Error resetting dismissed interruptions:", result.error);
        set({ permissionInterruptionsLoading: false });
        return;
      }

      // Reload to show all interruptions again
      await get().loadPermissionInterruptions();
    } catch (err) {
      console.error("Error resetting dismissed interruptions:", err);
      set({ permissionInterruptionsLoading: false });
    }
  },

  loadDiscussions: async (limit: number = 50) => {
    set({ discussionsLoading: true });
    try {
      const response = await fetch(`/api/discussions?limit=${limit}`);
      if (!response.ok) {
        throw new Error("Failed to load discussions");
      }
      const data = await response.json();
      set({
        discussions: data.sessions,
        discussionsTotalCount: data.totalCount,
        discussionsLoading: false,
      });
    } catch (err) {
      console.error("Error loading discussions:", err);
      set({ discussionsLoading: false });
    }
  },

}));
