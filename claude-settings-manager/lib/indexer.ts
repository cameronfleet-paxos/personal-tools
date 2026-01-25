import * as fs from "fs";
import * as path from "path";
import { SettingsIndex, SettingsLocation } from "@/types/settings";
import os from "os";

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

  return {
    lastIndexed: new Date().toISOString(),
    locations,
  };
}

export async function reindex(): Promise<SettingsIndex> {
  const index = await scanForSettings();
  await saveIndex(index);
  return index;
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
