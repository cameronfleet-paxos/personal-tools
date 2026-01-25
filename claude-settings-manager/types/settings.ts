// Types for Claude Code settings

export interface HookCommand {
  type: "command";
  command: string;
  timeout?: number;
}

export interface HookPrompt {
  type: "prompt";
  prompt: string;
}

export type Hook = HookCommand | HookPrompt;

export interface HookMatcher {
  matcher?: string;
  hooks: Hook[];
}

export type HookType =
  | "PreCompact"
  | "SessionStart"
  | "UserPromptSubmit"
  | "PreToolUse"
  | "PostToolUse";

export interface Permissions {
  allow?: string[];
  deny?: string[];
  ask?: string[];
}

export interface SandboxFilesystemWrite {
  allowOnly?: string[];
  denyWithinAllow?: string[];
}

export interface SandboxFilesystem {
  write?: SandboxFilesystemWrite;
}

export interface SandboxNetwork {
  allowedHosts?: string[];
  allowUnixSockets?: string[];
  allowLocalBinding?: boolean;
}

export interface Sandbox {
  enabled?: boolean;
  autoAllowBashIfSandboxed?: boolean;
  filesystem?: SandboxFilesystem;
  network?: SandboxNetwork;
}

export interface FeedbackSurveyState {
  lastShownTime?: number;
}

export interface Settings {
  $schema?: string;
  model?: string;
  permissions?: Permissions;
  hooks?: Partial<Record<HookType, HookMatcher[]>>;
  enabledPlugins?: Record<string, boolean>;
  sandbox?: Sandbox;
  alwaysThinkingEnabled?: boolean;
  allowedBashPatterns?: string[];
  feedbackSurveyState?: FeedbackSurveyState;
}

// Plugin types
export interface PluginInstallation {
  scope: "user" | "project";
  installPath: string;
  version: string;
  installedAt: string;
  lastUpdated: string;
  gitCommitSha?: string;
}

export interface InstalledPlugins {
  version: number;
  plugins: Record<string, PluginInstallation[]>;
}

// Stats types
export interface DailyActivity {
  date: string;
  messageCount: number;
  sessionCount: number;
  toolCallCount: number;
}

export interface ModelUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens?: number;
  cacheCreationInputTokens?: number;
  webSearchRequests?: number;
  costUSD?: number;
  contextWindow?: number;
  maxOutputTokens?: number;
}

export interface StatsCache {
  version: number;
  lastComputedDate: string;
  dailyActivity: DailyActivity[];
  dailyModelTokens: Array<{
    date: string;
    tokensByModel: Record<string, number>;
  }>;
  modelUsage: Record<string, ModelUsage>;
  totalSessions: number;
  totalMessages: number;
  longestSession?: {
    messages: number;
    project: string;
  };
  firstSessionDate: string;
  hourCounts: Record<string, number>;
}

// API Response types
export interface SettingsResponse {
  global: Settings;
  local: Settings;
  plugins: InstalledPlugins | null;
  stats: StatsCache | null;
}

export interface SaveSettingsRequest {
  global?: Settings;
  local?: Settings;
}

export interface SaveSettingsResponse {
  success: boolean;
  errors?: Array<{ file: string; error: string }>;
}

// Settings target types - 3 sources for settings inheritance in project context
// Note: user-local does NOT exist per Claude Code docs - only project-local has a .local.json scope
export type SettingsTarget = "user" | "project" | "project-local";

// Store types
export interface PendingChange {
  id: string;
  path: string[];
  oldValue: unknown;
  newValue: unknown;
  target: SettingsTarget;
  description: string;
  timestamp: Date;
}

// Multi-source response when viewing a project (includes inherited user settings)
// Note: userLocal removed - user-local settings don't exist per Claude Code docs
export interface MultiSourceSettingsResponse {
  user: Settings;
  project: Settings;
  projectLocal: Settings;
  plugins: InstalledPlugins | null;
  stats: StatsCache | null;
}

// Settings Index types (for multi-project discovery)
export interface SettingsLocation {
  path: string; // e.g., "/Users/cam/dev/project/.claude"
  projectName: string; // Derived from parent folder name
  hasSettings: boolean; // settings.json exists
  hasLocalSettings: boolean; // settings.local.json exists
  lastModified: string; // Most recent file mtime (ISO timestamp)
}

export interface SettingsIndex {
  lastIndexed: string; // ISO timestamp
  locations: SettingsLocation[];
}

export interface IndexResponse {
  index: SettingsIndex | null;
  isFirstRun: boolean;
}

export interface ReindexResponse {
  success: boolean;
  index: SettingsIndex;
  duration: number; // ms
  error?: string;
}
