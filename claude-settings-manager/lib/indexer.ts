import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import { SettingsIndex, SettingsLocation, CommandEntry, CommandsData, CommandMetadata } from "@/types/settings";
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

  return {
    lastIndexed: new Date().toISOString(),
    locations,
    commands,
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

  const refreshedIndex: SettingsIndex = {
    lastIndexed: new Date().toISOString(),
    locations: existing.locations, // Keep existing locations
    commands,
  };

  await saveIndex(refreshedIndex);
  return refreshedIndex;
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
