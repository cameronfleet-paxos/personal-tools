import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import {
  SettingsIndex,
  SettingsLocation,
  CommandEntry,
  CommandsData,
  CommandMetadata,
  MCPIndexData,
  MCPServerEntry,
  MCPHealthStatus,
  MCPConfigFile,
  MCPServerConfig,
  MCPServerStdio,
  MCPServerRemote,
} from "@/types/settings";
import os from "os";
import matter from "gray-matter";

const INDEX_FILE_NAME = "settings-index.json";

// Directories to skip during scanning
const EXCLUDED_DIRS = new Set([
  "node_modules",
  ".git",
  "Library",
  ".cache",
  ".Trash",
  "Applications",
  "vendor",
  "dist",
  "build",
  ".npm",
  ".yarn",
  ".pnpm",
  ".vscode",
  ".idea",
  "coverage",
  "__pycache__",
  ".next",
  ".nuxt",
  ".turbo",
  // macOS system folders that trigger permission prompts
  "Downloads",
  "Music",
  "Movies",
  "Pictures",
  "Public",
]);

// Max depth from home directory
const MAX_DEPTH = 5;

/**
 * Get the git remote origin URL for a directory
 * Returns null if not a git repo or no remote
 */
function getGitRemoteUrl(dir: string): string | null {
  try {
    const result = execSync("git config --get remote.origin.url", {
      cwd: dir,
      encoding: "utf-8",
      timeout: 5000,
      stdio: ["pipe", "pipe", "pipe"],
    });
    return result.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Deduplicate commands/skills from the same git repository
 * Groups by (name, type, repoUrl) and keeps the most recently modified
 * User commands (no repoUrl) are never deduplicated
 */
function deduplicateByRepo(commands: CommandEntry[]): CommandEntry[] {
  const groups = new Map<string, CommandEntry[]>();

  for (const cmd of commands) {
    // User commands get unique keys (never deduped)
    // Project commands with same name+type+repoUrl get grouped together
    const key = cmd.source === "user"
      ? `user:${cmd.name}:${cmd.type}:${cmd.filePath}`
      : `project:${cmd.name}:${cmd.type}:${cmd.repoUrl || cmd.filePath}`;

    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(cmd);
  }

  // For each group, pick the most recently modified
  const result: CommandEntry[] = [];
  for (const group of groups.values()) {
    const best = group.sort((a, b) =>
      new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()
    )[0];
    result.push(best);
  }

  return result;
}

export function getHomeDir(): string {
  return os.homedir();
}

export function getGlobalClaudeDir(): string {
  return path.join(getHomeDir(), ".claude");
}

export function getIndexFilePath(): string {
  return path.join(getGlobalClaudeDir(), INDEX_FILE_NAME);
}

export async function loadIndex(): Promise<SettingsIndex | null> {
  const indexPath = getIndexFilePath();

  try {
    if (fs.existsSync(indexPath)) {
      const content = fs.readFileSync(indexPath, "utf-8");
      return JSON.parse(content) as SettingsIndex;
    }
  } catch (error) {
    console.error("Error loading index:", error);
  }

  return null;
}

export async function saveIndex(index: SettingsIndex): Promise<void> {
  const indexPath = getIndexFilePath();
  const claudeDir = getGlobalClaudeDir();

  // Ensure .claude directory exists
  if (!fs.existsSync(claudeDir)) {
    fs.mkdirSync(claudeDir, { recursive: true });
  }

  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), "utf-8");
}

function shouldSkipDir(dirName: string): boolean {
  // Skip excluded directories
  if (EXCLUDED_DIRS.has(dirName)) {
    return true;
  }

  // Skip hidden directories (except .claude which we're looking for)
  if (dirName.startsWith(".") && dirName !== ".claude") {
    return true;
  }

  return false;
}

function getFileMtime(filePath: string): Date | null {
  try {
    const stats = fs.statSync(filePath);
    return stats.mtime;
  } catch {
    return null;
  }
}

// Command scanning functions

/**
 * Convert a file path to a command name
 * e.g., "jira2/new.md" -> "jira2:new", "prd.md" -> "prd"
 */
function getCommandName(filePath: string, commandsDir: string): string {
  const relativePath = path.relative(commandsDir, filePath);
  const withoutExt = relativePath.replace(/\.md$/, "");
  return withoutExt.replace(/\//g, ":");
}

/**
 * Parse a command file and extract YAML frontmatter metadata
 */
function parseCommandFile(filePath: string): CommandMetadata {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const parsed = matter(content);
    const data = parsed.data;

    return {
      description: typeof data.description === "string" ? data.description : undefined,
      argumentHint: typeof data.argumentHint === "string" ? data.argumentHint : undefined,
      allowedTools: Array.isArray(data.allowedTools) ? data.allowedTools : undefined,
    };
  } catch {
    return {};
  }
}

/**
 * Recursively scan a commands directory for .md files
 */
function scanCommandsDirectory(
  dir: string,
  source: "user" | "project",
  projectPath?: string,
  repoUrl?: string
): CommandEntry[] {
  const commands: CommandEntry[] = [];

  if (!fs.existsSync(dir)) {
    return commands;
  }

  function scanDir(currentDir: string) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const entryPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        // Recurse into subdirectories
        scanDir(entryPath);
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        const metadata = parseCommandFile(entryPath);
        const mtime = getFileMtime(entryPath);

        commands.push({
          name: getCommandName(entryPath, dir),
          filePath: entryPath,
          source,
          type: "command",
          projectPath,
          repoUrl: repoUrl || undefined,
          metadata,
          lastModified: mtime ? mtime.toISOString() : new Date().toISOString(),
        });
      }
    }
  }

  scanDir(dir);
  return commands;
}

/**
 * Convert a skill directory name to a skill name
 * Skills are stored in .claude/skills/<name>/SKILL.md
 */
function getSkillName(skillDir: string, skillsBaseDir: string): string {
  const relativePath = path.relative(skillsBaseDir, skillDir);
  return relativePath.replace(/\//g, ":");
}

/**
 * Scan skills directory for SKILL.md files
 * Skills are stored in .claude/skills/<name>/SKILL.md
 */
function scanSkillsDirectory(
  dir: string,
  source: "user" | "project",
  projectPath?: string,
  repoUrl?: string
): CommandEntry[] {
  const skills: CommandEntry[] = [];

  if (!fs.existsSync(dir)) {
    return skills;
  }

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return skills;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const skillDir = path.join(dir, entry.name);
    const skillFile = path.join(skillDir, "SKILL.md");

    if (fs.existsSync(skillFile)) {
      const metadata = parseCommandFile(skillFile);
      const mtime = getFileMtime(skillFile);

      skills.push({
        name: getSkillName(skillDir, dir),
        filePath: skillFile,
        source,
        type: "skill",
        projectPath,
        repoUrl: repoUrl || undefined,
        metadata,
        lastModified: mtime ? mtime.toISOString() : new Date().toISOString(),
      });
    }
  }

  return skills;
}

/**
 * Scan all command and skill directories (user + all projects)
 */
function scanAllCommands(projectLocations: SettingsLocation[]): CommandsData {
  const allCommands: CommandEntry[] = [];
  const globalClaudeDir = getGlobalClaudeDir();

  // Scan user commands (~/.claude/commands/)
  const userCommandsDir = path.join(globalClaudeDir, "commands");
  const userCommands = scanCommandsDirectory(userCommandsDir, "user");
  allCommands.push(...userCommands);

  // Scan user skills (~/.claude/skills/)
  const userSkillsDir = path.join(globalClaudeDir, "skills");
  const userSkills = scanSkillsDirectory(userSkillsDir, "user");
  allCommands.push(...userSkills);

  // Scan project commands and skills for each discovered project
  for (const location of projectLocations) {
    // Skip user-level .claude - already scanned as user commands/skills
    if (location.path === globalClaudeDir) {
      continue;
    }

    // Get the git remote URL for this project (parent of .claude dir)
    const projectDir = path.dirname(location.path);
    const repoUrl = getGitRemoteUrl(projectDir);

    const projectCommandsDir = path.join(location.path, "commands");
    const projectCommands = scanCommandsDirectory(
      projectCommandsDir,
      "project",
      location.path,
      repoUrl || undefined
    );
    allCommands.push(...projectCommands);

    const projectSkillsDir = path.join(location.path, "skills");
    const projectSkills = scanSkillsDirectory(
      projectSkillsDir,
      "project",
      location.path,
      repoUrl || undefined
    );
    allCommands.push(...projectSkills);
  }

  // Deduplicate commands from the same git repository
  const dedupedCommands = deduplicateByRepo(allCommands);

  // Sort by name for consistent ordering
  dedupedCommands.sort((a, b) => a.name.localeCompare(b.name));

  return {
    commands: dedupedCommands,
    totalCount: dedupedCommands.length,
  };
}

// MCP scanning functions

const PLUGINS_DIR = path.join(getGlobalClaudeDir(), "plugins", "marketplaces");

function readJsonFileSync<T>(filePath: string): T | null {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

/**
 * Scan plugin directories for available (not-yet-enabled) MCP servers
 */
function scanAvailableMCPs(): MCPServerEntry[] {
  const entries: MCPServerEntry[] = [];

  try {
    if (!fs.existsSync(PLUGINS_DIR)) {
      return entries;
    }

    const marketplaces = fs.readdirSync(PLUGINS_DIR);

    for (const marketplace of marketplaces) {
      const externalPluginsDir = path.join(PLUGINS_DIR, marketplace, "external_plugins");
      try {
        if (!fs.existsSync(externalPluginsDir)) continue;
        const plugins = fs.readdirSync(externalPluginsDir);
        for (const plugin of plugins) {
          const mcpPath = path.join(externalPluginsDir, plugin, ".mcp.json");
          const mcpConfig = readJsonFileSync<MCPConfigFile>(mcpPath);
          if (mcpConfig) {
            for (const [name, config] of Object.entries(mcpConfig)) {
              entries.push({
                name,
                config: config as MCPServerConfig,
                source: "plugin",
                pluginName: `${plugin}@${marketplace}`,
              });
            }
          }
        }
      } catch {
        // Directory doesn't exist or can't be read
      }
    }
  } catch {
    // Plugins directory doesn't exist
  }

  return entries;
}

/**
 * Parse claude mcp list output to get enabled MCPs with health status
 * Output format:
 *   mcp-server-datadog: npx -y @winor30/mcp-server-datadog - ✗ Failed to connect
 *   glean_default: https://paxos-be.glean.com/mcp/default (HTTP) - ✓ Connected
 */
function scanEnabledMCPs(): { enabled: MCPServerEntry[]; health: MCPHealthStatus[] } {
  const enabled: MCPServerEntry[] = [];
  const health: MCPHealthStatus[] = [];

  try {
    const stdout = execSync("claude mcp list 2>/dev/null", {
      encoding: "utf-8",
      timeout: 15000,
      stdio: ["pipe", "pipe", "pipe"],
    });

    const lines = stdout.split("\n");

    for (const line of lines) {
      if (!line.trim()) continue;

      // Parse server name (everything before first colon)
      const colonIndex = line.indexOf(":");
      if (colonIndex === -1) continue;

      const name = line.substring(0, colonIndex).trim();
      const rest = line.substring(colonIndex + 1).trim();

      // Determine health status
      const isConnected = rest.includes("✓") && rest.includes("Connected");
      const isFailed = rest.includes("✗") && rest.includes("Failed");

      // Determine transport type
      let transport: string | undefined;
      if (rest.includes("(HTTP)")) transport = "http";
      else if (rest.includes("(SSE)")) transport = "sse";
      else if (rest.includes("(WS)")) transport = "ws";
      else transport = "stdio";

      // Add health status
      health.push({
        name,
        status: isConnected ? "connected" : isFailed ? "failed" : "unknown",
        transport,
      });

      // Create a minimal MCPServerEntry - we don't have full config from mcp list
      // but we know it's enabled at user scope
      enabled.push({
        name,
        config: { command: "" }, // Placeholder - actual config not available from mcp list
        source: "user", // claude mcp list shows user-enabled MCPs
      });
    }
  } catch {
    // claude mcp list failed - return empty arrays
  }

  return { enabled, health };
}

/**
 * Parse the output of `claude mcp get <name>` to extract config
 *
 * Example stdio output:
 *   mcp-server-datadog:
 *     Scope: User config (available in all your projects)
 *     Status: ✗ Failed to connect
 *     Type: stdio
 *     Command: npx
 *     Args: -y @winor30/mcp-server-datadog
 *     Environment:
 *       DATADOG_API_KEY=xxx
 *       DATADOG_APP_KEY=xxx
 *
 * Example http output:
 *   glean_default:
 *     Scope: User config
 *     Status: ✓ Connected
 *     Type: http
 *     URL: https://paxos-be.glean.com/mcp/default
 */
function parseMCPGetOutput(output: string): MCPServerConfig | null {
  const lines = output.split("\n");
  const data: Record<string, string> = {};
  const envVars: Record<string, string> = {};
  const headers: Record<string, string> = {};
  let currentSection: "none" | "env" | "headers" = "none";

  for (const line of lines) {
    if (line.startsWith("  Type:")) {
      data.type = line.replace("  Type:", "").trim();
      currentSection = "none";
    } else if (line.startsWith("  Command:")) {
      data.command = line.replace("  Command:", "").trim();
      currentSection = "none";
    } else if (line.startsWith("  Args:")) {
      data.args = line.replace("  Args:", "").trim();
      currentSection = "none";
    } else if (line.startsWith("  URL:")) {
      data.url = line.replace("  URL:", "").trim();
      currentSection = "none";
    } else if (line.startsWith("  Environment:")) {
      currentSection = "env";
    } else if (line.startsWith("  Headers:")) {
      currentSection = "headers";
    } else if (currentSection === "env" && line.match(/^\s{4}\w+=/)) {
      const [key, ...valueParts] = line.trim().split("=");
      envVars[key] = valueParts.join("=");
    } else if (currentSection === "headers" && line.match(/^\s{4}\w+:/)) {
      // Headers format: "    KEY: value"
      const colonIdx = line.indexOf(":");
      if (colonIdx > 0) {
        const key = line.substring(0, colonIdx).trim();
        const value = line.substring(colonIdx + 1).trim();
        headers[key] = value;
      }
    } else if (line.startsWith("  ") && !line.startsWith("    ")) {
      // New top-level field, exit section
      currentSection = "none";
    }
  }

  // Build config based on type
  if (data.type === "stdio" && data.command) {
    const config: MCPServerStdio = { command: data.command };
    if (data.args) config.args = data.args.split(" ");
    if (Object.keys(envVars).length > 0) config.env = envVars;
    return config;
  }

  if (["http", "sse", "ws"].includes(data.type) && data.url) {
    const config: MCPServerRemote = { type: data.type as "http" | "sse" | "ws", url: data.url };
    if (Object.keys(headers).length > 0) config.headers = headers;
    return config;
  }

  return null;
}

/**
 * Read user MCPs by calling claude CLI commands
 * Uses `claude mcp list` to get names, then `claude mcp get <name>` for full config
 */
function readUserMCPs(): MCPServerEntry[] {
  const entries: MCPServerEntry[] = [];

  try {
    // Get list of MCP names from claude mcp list
    const listOutput = execSync("claude mcp list 2>/dev/null", {
      encoding: "utf-8",
      timeout: 15000,
      stdio: ["pipe", "pipe", "pipe"],
    });

    const names: string[] = [];
    for (const line of listOutput.split("\n")) {
      const colonIdx = line.indexOf(":");
      if (colonIdx > 0) {
        names.push(line.substring(0, colonIdx).trim());
      }
    }

    // Get full config for each MCP using claude mcp get
    for (const name of names) {
      try {
        const getOutput = execSync(`claude mcp get "${name}" 2>/dev/null`, {
          encoding: "utf-8",
          timeout: 5000,
          stdio: ["pipe", "pipe", "pipe"],
        });
        const config = parseMCPGetOutput(getOutput);
        if (config) {
          entries.push({ name, config, source: "user" });
        }
      } catch {
        // Skip MCPs that fail to get config
      }
    }
  } catch {
    // claude mcp list failed - return empty array
  }

  return entries;
}

/**
 * Scan all MCP sources and compile index data
 */
function scanAllMCPs(): MCPIndexData {
  // Get enabled MCPs and health from claude mcp list
  const { health } = scanEnabledMCPs();

  // Get user-configured MCPs with full config
  const userMCPs = readUserMCPs();

  // Get available plugin MCPs
  const pluginMCPs = scanAvailableMCPs();

  // Separate available (plugin MCPs not in user config) from enabled (user MCPs)
  const enabledNames = new Set(userMCPs.map((m) => m.name));
  const available = pluginMCPs.filter((m) => !enabledNames.has(m.name));

  return {
    enabled: userMCPs,
    available,
    health,
  };
}

function createSettingsLocation(claudeDir: string): SettingsLocation | null {
  const settingsPath = path.join(claudeDir, "settings.json");
  const localSettingsPath = path.join(claudeDir, "settings.local.json");

  const hasSettings = fs.existsSync(settingsPath);
  const hasLocalSettings = fs.existsSync(localSettingsPath);

  // Only include if at least one settings file exists
  if (!hasSettings && !hasLocalSettings) {
    return null;
  }

  // Get the most recent modification time
  const settingsMtime = hasSettings ? getFileMtime(settingsPath) : null;
  const localSettingsMtime = hasLocalSettings
    ? getFileMtime(localSettingsPath)
    : null;

  let lastModified: Date;
  if (settingsMtime && localSettingsMtime) {
    lastModified =
      settingsMtime > localSettingsMtime ? settingsMtime : localSettingsMtime;
  } else {
    lastModified = settingsMtime || localSettingsMtime || new Date();
  }

  // Derive project name from parent folder
  const parentDir = path.dirname(claudeDir);
  const projectName = path.basename(parentDir);

  return {
    path: claudeDir,
    projectName,
    hasSettings,
    hasLocalSettings,
    lastModified: lastModified.toISOString(),
  };
}

async function scanDirectory(
  dir: string,
  currentDepth: number,
  locations: SettingsLocation[]
): Promise<void> {
  if (currentDepth > MAX_DEPTH) {
    return;
  }

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    // Permission denied or other read error
    return;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const entryPath = path.join(dir, entry.name);

    // Check if this is a .claude directory
    if (entry.name === ".claude") {
      const location = createSettingsLocation(entryPath);
      if (location) {
        locations.push(location);
      }
      continue; // Don't recurse into .claude directories
    }

    // Skip excluded directories
    if (shouldSkipDir(entry.name)) {
      continue;
    }

    // Recurse into subdirectory
    await scanDirectory(entryPath, currentDepth + 1, locations);
  }
}

export interface ScanOptions {
  rootDir?: string;
  maxDepth?: number;
}

export async function scanForSettings(
  options: ScanOptions = {}
): Promise<SettingsIndex> {
  const rootDir = options.rootDir || getHomeDir();
  const locations: SettingsLocation[] = [];

  await scanDirectory(rootDir, 0, locations);

  // Sort by project name for consistent ordering
  locations.sort((a, b) => a.projectName.localeCompare(b.projectName));

  // Scan commands from user and all project directories
  const commands = scanAllCommands(locations);

  // Scan MCPs (enabled and available)
  const mcps = scanAllMCPs();

  return {
    lastIndexed: new Date().toISOString(),
    locations,
    commands,
    mcps,
  };
}

export async function reindex(): Promise<SettingsIndex> {
  const index = await scanForSettings();
  await saveIndex(index);
  return index;
}

/**
 * Refresh the index by re-reading commands/skills from existing locations
 * without scanning the filesystem for new projects
 */
export async function refreshIndex(): Promise<SettingsIndex> {
  const existing = await loadIndex();

  if (!existing) {
    // No existing index - fall back to full reindex
    return reindex();
  }

  // Re-scan commands from existing locations (without filesystem discovery)
  const commands = scanAllCommands(existing.locations);

  // Re-scan MCPs (enabled and available)
  const mcps = scanAllMCPs();

  const refreshedIndex: SettingsIndex = {
    lastIndexed: new Date().toISOString(),
    locations: existing.locations, // Keep existing locations
    commands,
    mcps,
  };

  await saveIndex(refreshedIndex);
  return refreshedIndex;
}

/**
 * Fast refresh - refreshes commands/locations only, skips MCPs
 * Returns immediately with cached MCPs (non-blocking for MCP sync)
 */
export async function refreshIndexFast(): Promise<SettingsIndex> {
  const existing = await loadIndex();

  if (!existing) {
    // No existing index - fall back to full reindex
    return reindex();
  }

  // Re-scan commands from existing locations (without MCP scan)
  const commands = scanAllCommands(existing.locations);

  const refreshedIndex: SettingsIndex = {
    lastIndexed: new Date().toISOString(),
    locations: existing.locations,
    commands,
    mcps: existing.mcps, // Keep cached MCPs - don't block
  };

  await saveIndex(refreshedIndex);
  return refreshedIndex;
}

/**
 * Async MCP-only scan (exported separately for background refresh)
 * This is the slow operation - calls claude CLI commands
 */
export async function scanMCPsAsync(): Promise<MCPIndexData> {
  return scanAllMCPs();
}

/**
 * Update just the MCPs in an existing index
 */
export async function updateIndexMCPs(mcps: MCPIndexData): Promise<SettingsIndex> {
  const existing = await loadIndex();

  if (!existing) {
    throw new Error("No index to update");
  }

  const updated: SettingsIndex = {
    ...existing,
    mcps,
    lastIndexed: new Date().toISOString(),
  };

  await saveIndex(updated);
  return updated;
}

export async function getOrCreateIndex(): Promise<{
  index: SettingsIndex;
  isFirstRun: boolean;
}> {
  const existing = await loadIndex();

  if (existing) {
    return { index: existing, isFirstRun: false };
  }

  // First run - create initial index
  const index = await reindex();
  return { index, isFirstRun: true };
}
