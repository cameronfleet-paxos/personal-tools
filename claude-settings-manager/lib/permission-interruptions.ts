import * as fs from "fs/promises";
import * as path from "path";
import * as readline from "readline";
import { createReadStream } from "fs";
import type {
  AggregatedInterruption,
  PermissionTimeFilter,
  PermissionInterruptionsResponse,
  Settings,
  ToolExample,
} from "@/types/settings";

const HOME = process.env.HOME || process.env.USERPROFILE || "";
const CLAUDE_DIR = path.join(HOME, ".claude");
const DEBUG_DIR = path.join(CLAUDE_DIR, "debug");
const PROJECTS_DIR = path.join(CLAUDE_DIR, "projects");
const DISMISSED_FILE = path.join(CLAUDE_DIR, "dismissed-interruptions.json");

/**
 * Normalize a pattern to fix malformed paths (e.g., //Users -> /Users)
 */
function normalizePattern(pattern: string): string {
  // Fix double slashes at start of path (//Users -> /Users)
  return pattern.replace(/^\/\/+/, "/");
}

// Dismissed patterns storage
interface DismissedInterruptions {
  patterns: string[]; // List of fullPattern values that are dismissed
  dismissedAt: Record<string, number>; // timestamp when each was dismissed
}

// Cache with TTL
interface CacheEntry {
  data: PermissionInterruptionsResponse;
  timestamp: number;
}

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const cache = new Map<PermissionTimeFilter, CacheEntry>();

export function invalidateCache(): void {
  cache.clear();
}

interface PermissionSuggestion {
  type: string;
  rules?: Array<{
    toolName: string;
    ruleContent: string;
  }>;
  behavior?: string;
  destination?: string;
  mode?: string;
}

interface ParsedInterruption {
  sessionId: string;
  timestamp: number;
  toolName: string;
  ruleContent: string;
  fullPattern: string;
}

// JSONL entry types
interface JournalEntry {
  type: string;
  timestamp: string;
  uuid: string;
  message?: {
    role?: string;
    content?: string | ContentBlock[];
  };
  isMeta?: boolean;
}

interface ContentBlock {
  type: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
}

interface ToolUseMatch {
  timestamp: number;
  toolInput: Record<string, unknown>;
  userPrompt?: string;
}

function getTimeRange(filter: PermissionTimeFilter): { start: number; end: number } {
  const now = Date.now();
  const end = now;
  let start: number;

  switch (filter) {
    case "day":
      start = now - 24 * 60 * 60 * 1000;
      break;
    case "week":
      start = now - 7 * 24 * 60 * 60 * 1000;
      break;
    case "month":
      start = now - 30 * 24 * 60 * 60 * 1000;
      break;
  }

  return { start, end };
}

async function getDebugFilesInRange(
  start: number,
  end: number
): Promise<string[]> {
  try {
    const files = await fs.readdir(DEBUG_DIR);
    const debugFiles: Array<{ path: string; mtime: number }> = [];

    for (const file of files) {
      if (!file.endsWith(".txt")) continue;
      const filePath = path.join(DEBUG_DIR, file);
      try {
        const stat = await fs.stat(filePath);
        if (stat.mtimeMs >= start && stat.mtimeMs <= end) {
          debugFiles.push({ path: filePath, mtime: stat.mtimeMs });
        }
      } catch {
        // Skip files we can't stat
      }
    }

    // Sort by mtime descending (most recent first)
    debugFiles.sort((a, b) => b.mtime - a.mtime);
    return debugFiles.map((f) => f.path);
  } catch {
    return [];
  }
}

async function findSessionJsonlPath(sessionId: string): Promise<string | null> {
  try {
    const projectDirs = await fs.readdir(PROJECTS_DIR);

    for (const projectDir of projectDirs) {
      // Skip temp directories
      if (projectDir.includes("-T-") || projectDir.includes("var-folders")) {
        continue;
      }

      const projectPath = path.join(PROJECTS_DIR, projectDir);
      const jsonlPath = path.join(projectPath, `${sessionId}.jsonl`);

      try {
        await fs.access(jsonlPath);
        return jsonlPath;
      } catch {
        // File doesn't exist in this project, continue
      }
    }
  } catch {
    // Projects dir doesn't exist
  }

  return null;
}

async function extractConversationContext(
  sessionId: string,
  timestamp: number,
  toolName: string
): Promise<ToolUseMatch | null> {
  const jsonlPath = await findSessionJsonlPath(sessionId);
  if (!jsonlPath) return null;

  const entries: JournalEntry[] = [];

  return new Promise((resolve) => {
    const fileStream = createReadStream(jsonlPath, { encoding: "utf-8" });
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    rl.on("line", (line) => {
      try {
        const entry = JSON.parse(line) as JournalEntry;
        entries.push(entry);
      } catch {
        // Skip malformed lines
      }
    });

    rl.on("close", () => {
      // Find the tool_use entry closest to the permission timestamp
      let bestMatch: ToolUseMatch | null = null;
      let lastUserPrompt: string | undefined;
      const targetTime = timestamp;
      const tolerance = 10000; // 10 seconds tolerance

      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const entryTime = new Date(entry.timestamp).getTime();

        // Track the most recent non-meta user message
        if (
          entry.type === "user" &&
          !entry.isMeta &&
          entry.message?.role === "user" &&
          typeof entry.message.content === "string"
        ) {
          // Skip tool results and system messages
          const content = entry.message.content;
          if (
            !content.startsWith("<") &&
            !content.includes("tool_result")
          ) {
            lastUserPrompt = content.slice(0, 200); // Limit length
          }
        }

        // Look for assistant messages with tool_use blocks
        if (entry.type === "assistant" && entry.message?.content) {
          const content = entry.message.content;
          if (Array.isArray(content)) {
            for (const block of content) {
              if (
                block.type === "tool_use" &&
                block.name === toolName &&
                block.input
              ) {
                // Check if this is close to our target timestamp
                const timeDiff = Math.abs(entryTime - targetTime);
                if (timeDiff <= tolerance) {
                  const currentBestDiff = bestMatch
                    ? Math.abs(bestMatch.timestamp - targetTime)
                    : Infinity;

                  if (timeDiff < currentBestDiff) {
                    bestMatch = {
                      timestamp: entryTime,
                      toolInput: block.input,
                      userPrompt: lastUserPrompt,
                    };
                  }
                }
              }
            }
          }
        }
      }

      resolve(bestMatch);
    });

    rl.on("error", () => {
      resolve(null);
    });
  });
}

async function buildSessionToProjectMap(): Promise<Map<string, string>> {
  const sessionToProject = new Map<string, string>();

  try {
    const projectDirs = await fs.readdir(PROJECTS_DIR);

    for (const projectDir of projectDirs) {
      // Skip temp directories
      if (projectDir.includes("-T-") || projectDir.includes("var-folders")) {
        continue;
      }

      const projectPath = path.join(PROJECTS_DIR, projectDir);
      try {
        const stat = await fs.stat(projectPath);
        if (!stat.isDirectory()) continue;

        // Decode the project path from the directory name
        // e.g., "-Users-cameronfleet-dev-pax" -> "/Users/cameronfleet/dev/pax"
        const decodedPath = "/" + projectDir.replace(/-/g, "/").replace(/^\/+/, "");

        const files = await fs.readdir(projectPath);
        for (const file of files) {
          if (file.endsWith(".jsonl")) {
            const sessionId = file.replace(".jsonl", "");
            sessionToProject.set(sessionId, decodedPath);
          }
        }
      } catch {
        // Skip directories we can't read
      }
    }
  } catch {
    // If projects dir doesn't exist, return empty map
  }

  return sessionToProject;
}

async function parseDebugFile(
  filePath: string
): Promise<ParsedInterruption[]> {
  const interruptions: ParsedInterruption[] = [];
  const sessionId = path.basename(filePath, ".txt");

  return new Promise((resolve) => {
    const fileStream = createReadStream(filePath, { encoding: "utf-8" });
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    let accumulatingJson = false;
    let jsonBuffer = "";
    let currentToolName = "";
    let currentTimestamp = 0;
    let braceCount = 0;
    let bracketCount = 0;

    rl.on("line", (line) => {
      // Check if this is a "Permission suggestions for {Tool}:" line
      const suggestionMatch = line.match(
        /^(\d{4}-\d{2}-\d{2}T[\d:.]+Z)\s+\[DEBUG\]\s+Permission suggestions for (\w+):\s+\[$/
      );

      if (suggestionMatch) {
        // Start accumulating JSON
        accumulatingJson = true;
        jsonBuffer = "[";
        currentTimestamp = new Date(suggestionMatch[1]).getTime();
        currentToolName = suggestionMatch[2];
        bracketCount = 1;
        braceCount = 0;
        return;
      }

      if (accumulatingJson) {
        // Check if this line is a timestamp line (end of JSON block)
        if (/^\d{4}-\d{2}-\d{2}T[\d:.]+Z\s+\[DEBUG\]/.test(line)) {
          // End of JSON block, parse what we have
          try {
            const suggestions = JSON.parse(jsonBuffer) as PermissionSuggestion[];
            for (const suggestion of suggestions) {
              if (suggestion.rules) {
                for (const rule of suggestion.rules) {
                  // Only track if this was a permission prompt (interruption)
                  // We use the "addRules" type as indicator
                  if (suggestion.type === "addRules") {
                    const normalizedRuleContent = normalizePattern(rule.ruleContent);
                    const fullPattern = `${rule.toolName}(${normalizedRuleContent})`;
                    interruptions.push({
                      sessionId,
                      timestamp: currentTimestamp,
                      toolName: rule.toolName,
                      ruleContent: normalizedRuleContent,
                      fullPattern,
                    });
                  }
                }
              }
            }
          } catch {
            // Invalid JSON, skip
          }
          accumulatingJson = false;
          jsonBuffer = "";
          return;
        }

        // Accumulate the line
        jsonBuffer += line;

        // Count braces/brackets to detect end of JSON
        for (const char of line) {
          if (char === "[") bracketCount++;
          if (char === "]") bracketCount--;
          if (char === "{") braceCount++;
          if (char === "}") braceCount--;
        }

        // If we're back to zero brackets and braces at zero or positive, JSON might be complete
        if (bracketCount === 0 && braceCount === 0) {
          try {
            const suggestions = JSON.parse(jsonBuffer) as PermissionSuggestion[];
            for (const suggestion of suggestions) {
              if (suggestion.rules) {
                for (const rule of suggestion.rules) {
                  if (suggestion.type === "addRules") {
                    const normalizedRuleContent = normalizePattern(rule.ruleContent);
                    const fullPattern = `${rule.toolName}(${normalizedRuleContent})`;
                    interruptions.push({
                      sessionId,
                      timestamp: currentTimestamp,
                      toolName: rule.toolName,
                      ruleContent: normalizedRuleContent,
                      fullPattern,
                    });
                  }
                }
              }
            }
          } catch {
            // Still accumulating, JSON not complete yet
            return;
          }
          accumulatingJson = false;
          jsonBuffer = "";
        }
      }
    });

    rl.on("close", () => {
      resolve(interruptions);
    });

    rl.on("error", () => {
      resolve(interruptions);
    });
  });
}

async function getUserAllowList(): Promise<Set<string>> {
  const allowSet = new Set<string>();
  try {
    const settingsPath = path.join(CLAUDE_DIR, "settings.json");
    const content = await fs.readFile(settingsPath, "utf-8");
    const settings = JSON.parse(content) as Settings;
    if (settings.permissions?.allow) {
      for (const pattern of settings.permissions.allow) {
        allowSet.add(pattern);
      }
    }
  } catch {
    // No settings or can't read
  }
  return allowSet;
}

interface GroupedInterruption {
  toolName: string;
  pattern: string;
  fullPattern: string;
  occurrences: number;
  lastOccurrence: number;
  projects: Set<string>;
  // Store up to 3 most recent interruptions for context extraction
  recentInterruptions: Array<{
    sessionId: string;
    timestamp: number;
  }>;
}

async function aggregateInterruptions(
  interruptions: ParsedInterruption[],
  sessionToProject: Map<string, string>,
  userAllowList: Set<string>
): Promise<AggregatedInterruption[]> {
  // Group by fullPattern
  const grouped = new Map<string, GroupedInterruption>();

  for (const interruption of interruptions) {
    const existing = grouped.get(interruption.fullPattern);
    const project = sessionToProject.get(interruption.sessionId) || "Unknown";

    if (existing) {
      existing.occurrences++;
      if (interruption.timestamp > existing.lastOccurrence) {
        existing.lastOccurrence = interruption.timestamp;
      }
      existing.projects.add(project);

      // Keep track of most recent 3 interruptions for context extraction
      existing.recentInterruptions.push({
        sessionId: interruption.sessionId,
        timestamp: interruption.timestamp,
      });
      // Sort by timestamp descending and keep top 3
      existing.recentInterruptions.sort((a, b) => b.timestamp - a.timestamp);
      if (existing.recentInterruptions.length > 3) {
        existing.recentInterruptions = existing.recentInterruptions.slice(0, 3);
      }
    } else {
      grouped.set(interruption.fullPattern, {
        toolName: interruption.toolName,
        pattern: interruption.ruleContent,
        fullPattern: interruption.fullPattern,
        occurrences: 1,
        lastOccurrence: interruption.timestamp,
        projects: new Set([project]),
        recentInterruptions: [
          {
            sessionId: interruption.sessionId,
            timestamp: interruption.timestamp,
          },
        ],
      });
    }
  }

  // Convert to array and sort by occurrences
  const result: AggregatedInterruption[] = [];
  let idCounter = 0;

  // Extract conversation context for each pattern (limited to 3 examples per pattern)
  const contextExtractionPromises: Array<{
    fullPattern: string;
    toolName: string;
    sessionId: string;
    timestamp: number;
  }> = [];

  for (const [, value] of grouped) {
    for (const recent of value.recentInterruptions) {
      contextExtractionPromises.push({
        fullPattern: value.fullPattern,
        toolName: value.toolName,
        sessionId: recent.sessionId,
        timestamp: recent.timestamp,
      });
    }
  }

  // Extract contexts in parallel (with concurrency limit)
  const CONTEXT_CONCURRENCY = 5;
  const contextResults = new Map<string, ToolExample[]>();

  for (let i = 0; i < contextExtractionPromises.length; i += CONTEXT_CONCURRENCY) {
    const batch = contextExtractionPromises.slice(i, i + CONTEXT_CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (item) => {
        const context = await extractConversationContext(
          item.sessionId,
          item.timestamp,
          item.toolName
        );
        return { fullPattern: item.fullPattern, context };
      })
    );

    for (const { fullPattern, context } of results) {
      if (context) {
        const existing = contextResults.get(fullPattern) || [];
        existing.push({
          toolInput: context.toolInput,
          userPrompt: context.userPrompt,
          timestamp: context.timestamp,
        });
        contextResults.set(fullPattern, existing);
      }
    }
  }

  for (const [, value] of grouped) {
    const examples = contextResults.get(value.fullPattern) || [];
    // Sort examples by timestamp descending and deduplicate
    const uniqueExamples = examples
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 3);

    result.push({
      id: `pi-${++idCounter}`,
      toolName: value.toolName,
      pattern: value.pattern,
      fullPattern: value.fullPattern,
      occurrences: value.occurrences,
      lastOccurrence: value.lastOccurrence,
      projects: Array.from(value.projects),
      alreadyInUserScope: userAllowList.has(value.fullPattern),
      examples: uniqueExamples,
    });
  }

  // Sort by occurrences descending
  result.sort((a, b) => b.occurrences - a.occurrences);

  return result;
}

export async function getPermissionInterruptions(
  filter: PermissionTimeFilter
): Promise<PermissionInterruptionsResponse> {
  // Check cache
  const cached = cache.get(filter);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  const { start, end } = getTimeRange(filter);

  // Get debug files in range
  const debugFiles = await getDebugFilesInRange(start, end);

  // Build session to project map
  const sessionToProject = await buildSessionToProjectMap();

  // Get user allow list
  const userAllowList = await getUserAllowList();

  // Parse all debug files in parallel (with concurrency limit)
  const CONCURRENCY = 10;
  const allInterruptions: ParsedInterruption[] = [];

  for (let i = 0; i < debugFiles.length; i += CONCURRENCY) {
    const batch = debugFiles.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(parseDebugFile));
    for (const result of results) {
      allInterruptions.push(...result);
    }
  }

  // Filter to only interruptions in the time range
  const filteredInterruptions = allInterruptions.filter(
    (i) => i.timestamp >= start && i.timestamp <= end
  );

  // Get dismissed patterns
  const dismissedPatterns = await getDismissedPatterns();

  // Aggregate
  const aggregated = await aggregateInterruptions(
    filteredInterruptions,
    sessionToProject,
    userAllowList
  );

  // Filter out dismissed patterns
  const filteredAggregated = aggregated.filter(
    (i) => !dismissedPatterns.has(i.fullPattern)
  );

  const response: PermissionInterruptionsResponse = {
    interruptions: filteredAggregated,
    timeFilter: filter,
    totalEvents: filteredInterruptions.length,
  };

  // Update cache
  cache.set(filter, {
    data: response,
    timestamp: Date.now(),
  });

  return response;
}

export async function addPatternToUserAllowList(
  pattern: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const settingsPath = path.join(CLAUDE_DIR, "settings.json");
    let settings: Settings = {};

    try {
      const content = await fs.readFile(settingsPath, "utf-8");
      settings = JSON.parse(content);
    } catch {
      // File doesn't exist or is invalid, start with empty settings
    }

    // Ensure permissions.allow exists
    if (!settings.permissions) {
      settings.permissions = {};
    }
    if (!settings.permissions.allow) {
      settings.permissions.allow = [];
    }

    // Check if already exists
    if (settings.permissions.allow.includes(pattern)) {
      return { success: true }; // Already exists, no-op
    }

    // Add the pattern
    settings.permissions.allow.push(pattern);

    // Write back
    await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2), "utf-8");

    // Invalidate cache since settings changed
    invalidateCache();

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

/**
 * Get the set of dismissed patterns
 */
export async function getDismissedPatterns(): Promise<Set<string>> {
  try {
    const content = await fs.readFile(DISMISSED_FILE, "utf-8");
    const data = JSON.parse(content) as DismissedInterruptions;
    return new Set(data.patterns || []);
  } catch {
    // File doesn't exist or is invalid
    return new Set();
  }
}

/**
 * Dismiss a pattern (hide it from the list)
 */
export async function dismissPattern(
  fullPattern: string
): Promise<{ success: boolean; error?: string }> {
  try {
    let data: DismissedInterruptions = { patterns: [], dismissedAt: {} };

    try {
      const content = await fs.readFile(DISMISSED_FILE, "utf-8");
      data = JSON.parse(content) as DismissedInterruptions;
    } catch {
      // File doesn't exist, start fresh
    }

    // Ensure arrays exist
    if (!data.patterns) data.patterns = [];
    if (!data.dismissedAt) data.dismissedAt = {};

    // Add pattern if not already dismissed
    if (!data.patterns.includes(fullPattern)) {
      data.patterns.push(fullPattern);
      data.dismissedAt[fullPattern] = Date.now();
    }

    await fs.writeFile(DISMISSED_FILE, JSON.stringify(data, null, 2), "utf-8");

    // Invalidate cache
    invalidateCache();

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

/**
 * Reset all dismissed patterns (restore them to the list)
 */
export async function resetDismissedPatterns(): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    // Delete the file or write empty data
    const emptyData: DismissedInterruptions = { patterns: [], dismissedAt: {} };
    await fs.writeFile(DISMISSED_FILE, JSON.stringify(emptyData, null, 2), "utf-8");

    // Invalidate cache
    invalidateCache();

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}
