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

export interface SandboxFilesystemRead {
  denyOnly?: string[];
}

export interface SandboxFilesystem {
  read?: SandboxFilesystemRead;
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
  excludedCommands?: string[];
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

// Command types (for commands explorer)
export interface CommandMetadata {
  description?: string;
  argumentHint?: string;
  allowedTools?: string[];
}

export interface CommandEntry {
  name: string; // e.g., "jira2:new" or "prd"
  filePath: string; // Absolute path to .md file
  source: "user" | "project";
  type: "command" | "skill"; // Commands are in commands/, skills are in skills/
  projectPath?: string; // For project commands/skills
  repoUrl?: string; // Git remote origin URL for deduplication across worktrees/clones
  metadata: CommandMetadata;
  lastModified: string;
}

export interface CommandsData {
  commands: CommandEntry[];
  totalCount: number;
}

export interface MCPIndexData {
  enabled: MCPServerEntry[];  // From claude mcp list (enabled and attempted connection)
  available: MCPServerEntry[]; // From plugin .mcp.json files (not enabled yet)
  health: MCPHealthStatus[];  // Health status for enabled MCPs
}

export interface SettingsIndex {
  lastIndexed: string; // ISO timestamp
  locations: SettingsLocation[];
  commands?: CommandsData; // Optional for backward compatibility
  mcps?: MCPIndexData; // Optional for backward compatibility
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

// Recommendations types (for promoting duplicated project settings to user scope)
export interface SettingOccurrence {
  projectPath: string;
  projectName: string;
  scope: "project" | "project-local";
}

export type RecommendationType =
  | "permission-allow"
  | "permission-deny"
  | "permission-ask"
  | "sandbox-host"
  | "sandbox-path"
  | "sandbox-socket";

export interface SettingRecommendation {
  id: string;
  settingType: RecommendationType;
  value: string; // The duplicated value (e.g., "Bash(git *)")
  occurrences: SettingOccurrence[];
  alreadyInUser: boolean; // True if already exists at user scope
}

export interface RecommendationsResponse {
  recommendations: SettingRecommendation[];
  analyzedProjects: number;
}

export interface ApplyRecommendationResponse {
  success: boolean;
  errors?: Array<{ project: string; error: string }>;
}

// Security recommendations types
export type SecuritySeverity = "critical" | "high" | "medium";

export interface SecurityRecommendation {
  id: string;
  severity: SecuritySeverity;
  title: string;
  description: string;
  pattern: string;
  location: "allow" | "deny" | "ask";
  scope: SettingsTarget;
  projectPath?: string;
  projectName?: string;
  remediation: string;
}

export interface SecurityRecommendationsResponse {
  recommendations: SecurityRecommendation[];
  checkedScopes: SettingsTarget[];
}

export interface FixSecurityRecommendationRequest {
  pattern: string;
  scope: SettingsTarget;
  location: "allow" | "deny" | "ask";
  projectPath?: string;
}

export interface FixSecurityRecommendationResponse {
  success: boolean;
  error?: string;
}

// Permission interruptions types (for tracking frequently blocked commands)
export type PermissionTimeFilter = "day" | "week" | "month";

export interface ToolExample {
  toolInput: Record<string, unknown>; // The actual tool input (e.g., {command: "git commit -m 'foo'"})
  userPrompt?: string; // What the user asked (if available nearby)
  timestamp: number;
}

export interface AggregatedInterruption {
  id: string;
  toolName: string; // "Bash", "Read", etc.
  pattern: string; // "git add:*"
  fullPattern: string; // "Bash(git add:*)"
  occurrences: number;
  lastOccurrence: number; // timestamp
  projects: string[]; // affected project paths
  alreadyInUserScope: boolean;
  examples: ToolExample[]; // Up to 3 recent examples with context
}

export interface PermissionInterruptionsResponse {
  interruptions: AggregatedInterruption[];
  timeFilter: PermissionTimeFilter;
  totalEvents: number;
}

// Discussions types (for browsing conversation history)
export interface SessionMetadata {
  sessionId: string;
  projectPath: string; // Decoded path
  projectName: string; // Display name (derived from path)
  timestamp: number; // File mtime (for sorting)
  firstUserPrompt: string; // Snippet (~150 chars)
}

export interface ConversationMessage {
  uuid: string;
  type: "user" | "assistant";
  subtype?: "prompt" | "tool_result";
  timestamp: string;
  content: string | ContentBlock[];
}

export interface ContentBlock {
  type: string;
  id?: string;
  name?: string;
  text?: string;
  input?: Record<string, unknown>;
}

export interface SessionConversation {
  sessionId: string;
  projectPath: string;
  projectName: string;
  messages: ConversationMessage[];
}

export interface DiscussionsResponse {
  sessions: SessionMetadata[];
  totalCount: number;
}

export interface SessionConversationResponse {
  conversation: SessionConversation | null;
  error?: string;
}

// MCP (Model Context Protocol) types
export type MCPServerType = 'stdio' | 'http' | 'sse' | 'ws';

export interface MCPServerStdio {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface MCPServerRemote {
  type: 'http' | 'sse' | 'ws';
  url: string;
  headers?: Record<string, string>;
}

export type MCPServerConfig = MCPServerStdio | MCPServerRemote;

export type MCPSource = 'user' | 'project' | 'plugin';

export interface MCPServerEntry {
  name: string;
  config: MCPServerConfig;
  source: MCPSource;
  pluginName?: string; // For plugin sources
}

export interface MCPHealthStatus {
  name: string;
  status: 'connected' | 'failed' | 'unknown';
  transport?: string;
}

export type MCPConfigFile = Record<string, MCPServerConfig>;

export interface MCPsResponse {
  servers: MCPServerEntry[];
  health: MCPHealthStatus[];
}

export interface SaveMCPRequest {
  name: string;
  config: MCPServerConfig;
  scope: 'user' | 'project';
  projectPath?: string;
}

export interface SaveMCPResponse {
  success: boolean;
  error?: string;
}

export interface DeleteMCPRequest {
  name: string;
  scope: 'user' | 'project';
  projectPath?: string;
}

export interface DeleteMCPResponse {
  success: boolean;
  error?: string;
}

// Async MCP refresh response
export interface MCPRefreshResponse {
  success: boolean;
  mcps?: MCPIndexData;
  error?: string;
}
