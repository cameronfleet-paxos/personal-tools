import { NextResponse } from "next/server";
import * as fs from "fs/promises";
import * as path from "path";
import type {
  Settings,
  InstalledPlugins,
  StatsCache,
  SettingsResponse,
  MultiSourceSettingsResponse,
  SaveSettingsRequest,
  SaveSettingsResponse,
  SettingsTarget,
} from "@/types/settings";

const HOME = process.env.HOME || process.env.USERPROFILE || "";
const USER_CLAUDE_DIR = path.join(HOME, ".claude");

function getUserPaths() {
  return {
    settings: path.join(USER_CLAUDE_DIR, "settings.json"),
    localSettings: path.join(USER_CLAUDE_DIR, "settings.local.json"),
    plugins: path.join(USER_CLAUDE_DIR, "plugins", "installed_plugins.json"),
    stats: path.join(USER_CLAUDE_DIR, "stats-cache.json"),
  };
}

function getProjectPaths(projectClaudeDir: string) {
  return {
    settings: path.join(projectClaudeDir, "settings.json"),
    localSettings: path.join(projectClaudeDir, "settings.local.json"),
  };
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

async function writeJsonFile(
  filePath: string,
  data: unknown
): Promise<{ success: boolean; error?: string }> {
  try {
    // Create backup
    try {
      const existing = await fs.readFile(filePath, "utf-8");
      await fs.writeFile(`${filePath}.bak`, existing);
    } catch {
      // No existing file to backup
    }

    // Write new content
    await fs.writeFile(filePath, JSON.stringify(data, null, 2) + "\n");
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

export async function GET(request: Request): Promise<NextResponse<SettingsResponse | MultiSourceSettingsResponse>> {
  const { searchParams } = new URL(request.url);
  const projectPath = searchParams.get("path");
  const userPaths = getUserPaths();

  // Always load user settings (note: user-local doesn't exist per Claude Code docs)
  const [userSettings, plugins, stats] = await Promise.all([
    readJsonFile<Settings>(userPaths.settings),
    readJsonFile<InstalledPlugins>(userPaths.plugins),
    readJsonFile<StatsCache>(userPaths.stats),
  ]);

  // If no project path, return user settings only (legacy format for backward compat)
  // Note: user-local doesn't exist, but we keep 'local' field empty for backward compat
  if (!projectPath) {
    return NextResponse.json({
      global: userSettings || {},
      local: {},
      plugins,
      stats,
    });
  }

  // Load project settings as well
  const projectPaths = getProjectPaths(projectPath);
  const [projectSettings, projectLocalSettings] = await Promise.all([
    readJsonFile<Settings>(projectPaths.settings),
    readJsonFile<Settings>(projectPaths.localSettings),
  ]);

  // Return multi-source response (user-local omitted - doesn't exist per Claude Code docs)
  return NextResponse.json({
    user: userSettings || {},
    project: projectSettings || {},
    projectLocal: projectLocalSettings || {},
    plugins,
    stats,
  });
}

// Extended save request with multi-source support
interface MultiSourceSaveRequest {
  // Legacy format (for non-project context)
  global?: Settings;
  local?: Settings;
  // Multi-source format (for project context)
  // Note: userLocal removed - user-local settings don't exist per Claude Code docs
  user?: Settings;
  project?: Settings;
  projectLocal?: Settings;
  // Project path (required for project-level saves)
  path?: string;
}

export async function PUT(
  request: Request
): Promise<NextResponse<SaveSettingsResponse>> {
  const body = (await request.json()) as MultiSourceSaveRequest;
  const userPaths = getUserPaths();
  const errors: Array<{ file: string; error: string }> = [];

  // Handle legacy format (global/local)
  if (body.global !== undefined) {
    const result = await writeJsonFile(userPaths.settings, body.global);
    if (!result.success) {
      errors.push({ file: "~/.claude/settings.json", error: result.error || "Unknown" });
    }
  }

  if (body.local !== undefined) {
    const result = await writeJsonFile(userPaths.localSettings, body.local);
    if (!result.success) {
      errors.push({ file: "~/.claude/settings.local.json", error: result.error || "Unknown" });
    }
  }

  // Handle multi-source format
  if (body.user !== undefined) {
    const result = await writeJsonFile(userPaths.settings, body.user);
    if (!result.success) {
      errors.push({ file: "~/.claude/settings.json", error: result.error || "Unknown" });
    }
  }

  // Note: userLocal removed - user-local settings don't exist per Claude Code docs

  // Project-level saves require a path
  if (body.path) {
    const projectPaths = getProjectPaths(body.path);

    if (body.project !== undefined) {
      const result = await writeJsonFile(projectPaths.settings, body.project);
      if (!result.success) {
        errors.push({ file: "project/.claude/settings.json", error: result.error || "Unknown" });
      }
    }

    if (body.projectLocal !== undefined) {
      const result = await writeJsonFile(projectPaths.localSettings, body.projectLocal);
      if (!result.success) {
        errors.push({ file: "project/.claude/settings.local.json", error: result.error || "Unknown" });
      }
    }
  }

  return NextResponse.json({
    success: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined,
  });
}
