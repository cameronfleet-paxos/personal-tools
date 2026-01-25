import { NextResponse } from "next/server";
import * as fs from "fs/promises";
import * as path from "path";
import type {
  Settings,
  SettingRecommendation,
  ApplyRecommendationResponse,
  RecommendationType,
} from "@/types/settings";

const HOME = process.env.HOME || process.env.USERPROFILE || "";
const USER_CLAUDE_DIR = path.join(HOME, ".claude");

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

function addValueToUserSettings(
  settings: Settings,
  type: RecommendationType,
  value: string
): Settings {
  const result = { ...settings };

  switch (type) {
    case "permission-allow":
      result.permissions = result.permissions || {};
      result.permissions.allow = result.permissions.allow || [];
      if (!result.permissions.allow.includes(value)) {
        result.permissions.allow = [...result.permissions.allow, value];
      }
      break;
    case "permission-deny":
      result.permissions = result.permissions || {};
      result.permissions.deny = result.permissions.deny || [];
      if (!result.permissions.deny.includes(value)) {
        result.permissions.deny = [...result.permissions.deny, value];
      }
      break;
    case "permission-ask":
      result.permissions = result.permissions || {};
      result.permissions.ask = result.permissions.ask || [];
      if (!result.permissions.ask.includes(value)) {
        result.permissions.ask = [...result.permissions.ask, value];
      }
      break;
    case "sandbox-host":
      result.sandbox = result.sandbox || {};
      result.sandbox.network = result.sandbox.network || {};
      result.sandbox.network.allowedHosts = result.sandbox.network.allowedHosts || [];
      if (!result.sandbox.network.allowedHosts.includes(value)) {
        result.sandbox.network.allowedHosts = [...result.sandbox.network.allowedHosts, value];
      }
      break;
    case "sandbox-path":
      result.sandbox = result.sandbox || {};
      result.sandbox.filesystem = result.sandbox.filesystem || {};
      result.sandbox.filesystem.write = result.sandbox.filesystem.write || {};
      result.sandbox.filesystem.write.allowOnly = result.sandbox.filesystem.write.allowOnly || [];
      if (!result.sandbox.filesystem.write.allowOnly.includes(value)) {
        result.sandbox.filesystem.write.allowOnly = [...result.sandbox.filesystem.write.allowOnly, value];
      }
      break;
    case "sandbox-socket":
      result.sandbox = result.sandbox || {};
      result.sandbox.network = result.sandbox.network || {};
      result.sandbox.network.allowUnixSockets = result.sandbox.network.allowUnixSockets || [];
      if (!result.sandbox.network.allowUnixSockets.includes(value)) {
        result.sandbox.network.allowUnixSockets = [...result.sandbox.network.allowUnixSockets, value];
      }
      break;
  }

  return result;
}

function removeValueFromSettings(
  settings: Settings,
  type: RecommendationType,
  value: string
): Settings {
  const result: Settings = JSON.parse(JSON.stringify(settings));

  switch (type) {
    case "permission-allow":
      if (result.permissions?.allow) {
        const filtered = result.permissions.allow.filter((v) => v !== value);
        if (filtered.length === 0) {
          delete result.permissions.allow;
        } else {
          result.permissions.allow = filtered;
        }
        if (result.permissions && Object.keys(result.permissions).length === 0) {
          delete result.permissions;
        }
      }
      break;
    case "permission-deny":
      if (result.permissions?.deny) {
        const filtered = result.permissions.deny.filter((v) => v !== value);
        if (filtered.length === 0) {
          delete result.permissions.deny;
        } else {
          result.permissions.deny = filtered;
        }
        if (result.permissions && Object.keys(result.permissions).length === 0) {
          delete result.permissions;
        }
      }
      break;
    case "permission-ask":
      if (result.permissions?.ask) {
        const filtered = result.permissions.ask.filter((v) => v !== value);
        if (filtered.length === 0) {
          delete result.permissions.ask;
        } else {
          result.permissions.ask = filtered;
        }
        if (result.permissions && Object.keys(result.permissions).length === 0) {
          delete result.permissions;
        }
      }
      break;
    case "sandbox-host":
      if (result.sandbox?.network?.allowedHosts) {
        const filtered = result.sandbox.network.allowedHosts.filter((v) => v !== value);
        if (filtered.length === 0) {
          delete result.sandbox.network.allowedHosts;
        } else {
          result.sandbox.network.allowedHosts = filtered;
        }
        if (result.sandbox.network && Object.keys(result.sandbox.network).length === 0) {
          delete result.sandbox.network;
        }
        if (result.sandbox && Object.keys(result.sandbox).length === 0) {
          delete result.sandbox;
        }
      }
      break;
    case "sandbox-path":
      if (result.sandbox?.filesystem?.write?.allowOnly) {
        const filtered = result.sandbox.filesystem.write.allowOnly.filter((v) => v !== value);
        if (filtered.length === 0) {
          delete result.sandbox.filesystem.write.allowOnly;
        } else {
          result.sandbox.filesystem.write.allowOnly = filtered;
        }
        if (result.sandbox.filesystem.write && Object.keys(result.sandbox.filesystem.write).length === 0) {
          delete result.sandbox.filesystem.write;
        }
        if (result.sandbox.filesystem && Object.keys(result.sandbox.filesystem).length === 0) {
          delete result.sandbox.filesystem;
        }
        if (result.sandbox && Object.keys(result.sandbox).length === 0) {
          delete result.sandbox;
        }
      }
      break;
    case "sandbox-socket":
      if (result.sandbox?.network?.allowUnixSockets) {
        const filtered = result.sandbox.network.allowUnixSockets.filter((v) => v !== value);
        if (filtered.length === 0) {
          delete result.sandbox.network.allowUnixSockets;
        } else {
          result.sandbox.network.allowUnixSockets = filtered;
        }
        if (result.sandbox.network && Object.keys(result.sandbox.network).length === 0) {
          delete result.sandbox.network;
        }
        if (result.sandbox && Object.keys(result.sandbox).length === 0) {
          delete result.sandbox;
        }
      }
      break;
  }

  return result;
}

interface ApplyRequest {
  recommendation: SettingRecommendation;
}

export async function POST(
  request: Request
): Promise<NextResponse<ApplyRecommendationResponse>> {
  const body = (await request.json()) as ApplyRequest;
  const { recommendation } = body;
  const errors: Array<{ project: string; error: string }> = [];

  // 1. Add value to user settings
  const userSettingsPath = path.join(USER_CLAUDE_DIR, "settings.json");
  let userSettings = (await readJsonFile<Settings>(userSettingsPath)) || {};

  userSettings = addValueToUserSettings(
    userSettings,
    recommendation.settingType,
    recommendation.value
  );

  const userResult = await writeJsonFile(userSettingsPath, userSettings);
  if (!userResult.success) {
    return NextResponse.json({
      success: false,
      errors: [{ project: "~/.claude", error: userResult.error || "Failed to update user settings" }],
    });
  }

  // 2. Remove value from each project occurrence
  for (const occurrence of recommendation.occurrences) {
    const settingsFile =
      occurrence.scope === "project"
        ? path.join(occurrence.projectPath, "settings.json")
        : path.join(occurrence.projectPath, "settings.local.json");

    let projectSettings = await readJsonFile<Settings>(settingsFile);
    if (!projectSettings) {
      continue; // File doesn't exist or couldn't be read
    }

    projectSettings = removeValueFromSettings(
      projectSettings,
      recommendation.settingType,
      recommendation.value
    );

    const projectResult = await writeJsonFile(settingsFile, projectSettings);
    if (!projectResult.success) {
      errors.push({
        project: occurrence.projectName,
        error: projectResult.error || "Failed to update project settings",
      });
    }
  }

  return NextResponse.json({
    success: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined,
  });
}
