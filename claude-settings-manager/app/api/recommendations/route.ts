import { NextResponse } from "next/server";
import * as fs from "fs/promises";
import * as path from "path";
import type {
  Settings,
  SettingRecommendation,
  RecommendationsResponse,
  RecommendationType,
  SettingOccurrence,
} from "@/types/settings";
import { loadIndex } from "@/lib/indexer";

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

interface SettingValue {
  value: string;
  projectPath: string;
  projectName: string;
  scope: "project" | "project-local";
}

interface ValueAccumulator {
  [key: string]: {
    type: RecommendationType;
    occurrences: SettingOccurrence[];
  };
}

function extractValues(
  settings: Settings | null,
  projectPath: string,
  projectName: string,
  scope: "project" | "project-local",
  accumulator: ValueAccumulator
): void {
  if (!settings) return;

  const addValue = (type: RecommendationType, value: string) => {
    const key = `${type}:${value}`;
    if (!accumulator[key]) {
      accumulator[key] = { type, occurrences: [] };
    }
    accumulator[key].occurrences.push({ projectPath, projectName, scope });
  };

  // Extract permissions
  if (settings.permissions?.allow) {
    for (const value of settings.permissions.allow) {
      addValue("permission-allow", value);
    }
  }
  if (settings.permissions?.deny) {
    for (const value of settings.permissions.deny) {
      addValue("permission-deny", value);
    }
  }
  if (settings.permissions?.ask) {
    for (const value of settings.permissions.ask) {
      addValue("permission-ask", value);
    }
  }

  // Extract sandbox settings
  if (settings.sandbox?.network?.allowedHosts) {
    for (const value of settings.sandbox.network.allowedHosts) {
      addValue("sandbox-host", value);
    }
  }
  if (settings.sandbox?.filesystem?.write?.allowOnly) {
    for (const value of settings.sandbox.filesystem.write.allowOnly) {
      addValue("sandbox-path", value);
    }
  }
  if (settings.sandbox?.network?.allowUnixSockets) {
    for (const value of settings.sandbox.network.allowUnixSockets) {
      addValue("sandbox-socket", value);
    }
  }
}

function checkUserHasValue(
  userSettings: Settings | null,
  type: RecommendationType,
  value: string
): boolean {
  if (!userSettings) return false;

  switch (type) {
    case "permission-allow":
      return userSettings.permissions?.allow?.includes(value) ?? false;
    case "permission-deny":
      return userSettings.permissions?.deny?.includes(value) ?? false;
    case "permission-ask":
      return userSettings.permissions?.ask?.includes(value) ?? false;
    case "sandbox-host":
      return userSettings.sandbox?.network?.allowedHosts?.includes(value) ?? false;
    case "sandbox-path":
      return userSettings.sandbox?.filesystem?.write?.allowOnly?.includes(value) ?? false;
    case "sandbox-socket":
      return userSettings.sandbox?.network?.allowUnixSockets?.includes(value) ?? false;
    default:
      return false;
  }
}

export async function GET(): Promise<NextResponse<RecommendationsResponse>> {
  // Load the settings index
  const index = await loadIndex();
  if (!index || index.locations.length === 0) {
    return NextResponse.json({
      recommendations: [],
      analyzedProjects: 0,
    });
  }

  // Load user settings for comparison
  const userSettingsPath = path.join(USER_CLAUDE_DIR, "settings.json");
  const userSettings = await readJsonFile<Settings>(userSettingsPath);

  // Accumulate all values from all projects
  const accumulator: ValueAccumulator = {};
  let analyzedProjects = 0;

  for (const location of index.locations) {
    // Skip user-level .claude directory
    if (location.path === USER_CLAUDE_DIR) {
      continue;
    }

    analyzedProjects++;

    // Load project settings
    const settingsPath = path.join(location.path, "settings.json");
    const localSettingsPath = path.join(location.path, "settings.local.json");

    const [projectSettings, projectLocalSettings] = await Promise.all([
      readJsonFile<Settings>(settingsPath),
      readJsonFile<Settings>(localSettingsPath),
    ]);

    extractValues(
      projectSettings,
      location.path,
      location.projectName,
      "project",
      accumulator
    );
    extractValues(
      projectLocalSettings,
      location.path,
      location.projectName,
      "project-local",
      accumulator
    );
  }

  // Convert to recommendations (only values appearing in 2+ projects AND not already in user)
  const recommendations: SettingRecommendation[] = [];
  let idCounter = 0;

  for (const [key, data] of Object.entries(accumulator)) {
    // Count unique projects (a project may have same value in both settings.json and settings.local.json)
    const uniqueProjects = new Set(data.occurrences.map((o) => o.projectPath));

    if (uniqueProjects.size >= 2) {
      const value = key.substring(key.indexOf(":") + 1);
      const alreadyInUser = checkUserHasValue(userSettings, data.type, value);

      // Skip recommendations that are already in user scope - they're not actionable
      if (alreadyInUser) {
        continue;
      }

      recommendations.push({
        id: `rec-${++idCounter}`,
        settingType: data.type,
        value,
        occurrences: data.occurrences,
        alreadyInUser: false,
      });
    }
  }

  // Sort by occurrence count (most common first), then by value for stability
  recommendations.sort((a, b) => {
    const countDiff = b.occurrences.length - a.occurrences.length;
    if (countDiff !== 0) return countDiff;
    return a.value.localeCompare(b.value);
  });

  return NextResponse.json({
    recommendations,
    analyzedProjects,
  });
}
