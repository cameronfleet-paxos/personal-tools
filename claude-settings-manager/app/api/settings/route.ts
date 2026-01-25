import { NextResponse } from "next/server";
import * as fs from "fs/promises";
import * as path from "path";
import type {
  Settings,
  InstalledPlugins,
  StatsCache,
  SettingsResponse,
  SaveSettingsRequest,
  SaveSettingsResponse,
} from "@/types/settings";

const HOME = process.env.HOME || process.env.USERPROFILE || "";
const CLAUDE_DIR = path.join(HOME, ".claude");
const GLOBAL_SETTINGS_PATH = path.join(CLAUDE_DIR, "settings.json");
const LOCAL_SETTINGS_PATH = path.join(CLAUDE_DIR, "settings.local.json");
const PLUGINS_PATH = path.join(CLAUDE_DIR, "plugins", "installed_plugins.json");
const STATS_PATH = path.join(CLAUDE_DIR, "stats-cache.json");

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

export async function GET(): Promise<NextResponse<SettingsResponse>> {
  const [global, local, plugins, stats] = await Promise.all([
    readJsonFile<Settings>(GLOBAL_SETTINGS_PATH),
    readJsonFile<Settings>(LOCAL_SETTINGS_PATH),
    readJsonFile<InstalledPlugins>(PLUGINS_PATH),
    readJsonFile<StatsCache>(STATS_PATH),
  ]);

  return NextResponse.json({
    global: global || {},
    local: local || {},
    plugins,
    stats,
  });
}

export async function PUT(
  request: Request
): Promise<NextResponse<SaveSettingsResponse>> {
  const body = (await request.json()) as SaveSettingsRequest;
  const errors: Array<{ file: string; error: string }> = [];

  if (body.global !== undefined) {
    const result = await writeJsonFile(GLOBAL_SETTINGS_PATH, body.global);
    if (!result.success) {
      errors.push({ file: "settings.json", error: result.error || "Unknown" });
    }
  }

  if (body.local !== undefined) {
    const result = await writeJsonFile(LOCAL_SETTINGS_PATH, body.local);
    if (!result.success) {
      errors.push({
        file: "settings.local.json",
        error: result.error || "Unknown",
      });
    }
  }

  return NextResponse.json({
    success: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined,
  });
}
