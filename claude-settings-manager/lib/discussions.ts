import * as fs from "fs/promises";
import * as path from "path";
import * as readline from "readline";
import { createReadStream, existsSync } from "fs";
import type {
  SessionMetadata,
  SessionConversation,
  ConversationMessage,
  ContentBlock,
  FavouritesData,
} from "@/types/settings";

const HOME = process.env.HOME || process.env.USERPROFILE || "";
const CLAUDE_DIR = path.join(HOME, ".claude");
const PROJECTS_DIR = path.join(CLAUDE_DIR, "projects");
const FAVOURITES_FILE = path.join(CLAUDE_DIR, "favourites.json");

// JSONL entry types (internal)
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

/**
 * macOS folders that trigger permission prompts when accessed.
 * We should avoid calling existsSync() on paths inside these folders.
 */
const SENSITIVE_MACOS_FOLDERS = [
  "Downloads",
  "Documents",
  "Desktop",
  "Pictures",
  "Movies",
  "Music",
];

/**
 * Check if a path is inside a sensitive macOS folder that would trigger permission prompts.
 */
function isInSensitiveFolder(pathToCheck: string): boolean {
  const parts = pathToCheck.split("/");
  // Check if any path component is a sensitive folder (typically at /Users/username/SensitiveFolder)
  return parts.some((part) => SENSITIVE_MACOS_FOLDERS.includes(part));
}

/**
 * Decode a project directory name to a readable path.
 * Claude Code encodes paths by replacing "/" with "-", but this is ambiguous
 * when folder names contain hyphens. We resolve ambiguity by checking which
 * paths actually exist on disk.
 *
 * Strategy: Try to find the longest valid hyphenated path at each step.
 * For example, if both /dev/pax and /dev/pax-agent1 exist, and we're decoding
 * "dev-pax-agent1", we should prefer pax-agent1 over pax/agent1.
 *
 * e.g., "-Users-cameronfleet-dev-personal-tools" -> "/Users/cameronfleet/dev/personal-tools"
 */
export function decodeProjectPath(dirName: string): string {
  // For paths in sensitive folders, fall back to simple decode to avoid permission prompts
  if (SENSITIVE_MACOS_FOLDERS.some((folder) => dirName.includes(`-${folder}-`) || dirName.endsWith(`-${folder}`))) {
    return "/" + dirName.replace(/-/g, "/").replace(/^\/+/, "");
  }

  // Remove leading dash and split by dash
  const segments = dirName.replace(/^-/, "").split("-");

  if (segments.length === 0) return dirName;

  let currentPath = "";
  let i = 0;

  while (i < segments.length) {
    const segment = segments[i];
    const testPath = currentPath + "/" + segment;

    // Skip existsSync for sensitive folders to avoid permission prompts
    if (isInSensitiveFolder(testPath)) {
      const remaining = segments.slice(i).join("/");
      return currentPath + "/" + remaining;
    }

    // Try to find the longest valid hyphenated path starting from this segment
    // Check from longest to shortest to prefer longer matches
    let bestMatch = "";
    let bestMatchEndIndex = i;

    // First check if the single segment works
    if (existsSync(testPath)) {
      bestMatch = testPath;
      bestMatchEndIndex = i + 1;
    }

    // Then try joining with subsequent segments (longer paths)
    let joined = segment;
    for (let j = i + 1; j < segments.length; j++) {
      joined += "-" + segments[j];
      const joinedPath = currentPath + "/" + joined;

      // Skip existsSync for sensitive folders
      if (isInSensitiveFolder(joinedPath)) {
        break;
      }

      if (existsSync(joinedPath)) {
        // Found a longer valid path - prefer this one
        bestMatch = joinedPath;
        bestMatchEndIndex = j + 1;
      }
    }

    if (bestMatch) {
      currentPath = bestMatch;
      i = bestMatchEndIndex;
    } else {
      // Couldn't find any valid path, fall back to simple replacement
      // for remaining segments
      const remaining = segments.slice(i).join("/");
      return currentPath + "/" + remaining;
    }
  }

  return currentPath || "/" + dirName.replace(/-/g, "/").replace(/^\/+/, "");
}

/**
 * Get a display name from a project path
 * e.g., "/Users/cameronfleet/dev/pax" -> "pax"
 */
export function getProjectDisplayName(projectPath: string): string {
  return path.basename(projectPath) || projectPath;
}

/**
 * Check if a directory should be skipped
 */
export function shouldSkipDirectory(dirName: string): boolean {
  return dirName.includes("-T-") || dirName.includes("var-folders");
}

/**
 * Extract the first user prompt from a JSONL file by reading only the first N lines
 * Returns a snippet of ~150 characters
 */
export async function extractFirstUserPrompt(
  jsonlPath: string,
  maxLines: number = 50
): Promise<string> {
  return new Promise((resolve) => {
    const fileStream = createReadStream(jsonlPath, { encoding: "utf-8" });
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    let lineCount = 0;
    let firstPrompt = "";

    rl.on("line", (line) => {
      lineCount++;
      if (lineCount > maxLines || firstPrompt) {
        rl.close();
        fileStream.destroy();
        return;
      }

      try {
        const entry = JSON.parse(line) as JournalEntry;

        // Look for user messages that aren't meta
        if (
          entry.type === "user" &&
          !entry.isMeta &&
          entry.message?.role === "user"
        ) {
          let content: string | null = null;

          // Handle string content
          if (typeof entry.message.content === "string") {
            content = entry.message.content;
          }
          // Handle array content (e.g., when images are present)
          else if (Array.isArray(entry.message.content)) {
            // Find the first text block
            const textBlock = entry.message.content.find(
              (block) => block.type === "text" && typeof block.text === "string"
            );
            if (textBlock && textBlock.text) {
              content = textBlock.text;
            }
          }

          if (!content) return;

          // Handle slash command messages - extract command-args if present
          if (content.startsWith("<command-name>")) {
            const argsMatch =
              content.match(/<command-args>([\s\S]*?)<\/command-args>/);
            if (argsMatch && argsMatch[1].trim()) {
              // Use the command args as the prompt
              content = argsMatch[1].trim();
            } else {
              // No meaningful args (e.g., /clear), skip this message
              return;
            }
          }

          // Skip other system tags and tool results
          if (
            content.startsWith("<local-command") ||
            content.startsWith("<tool_result>") ||
            content.startsWith("[")
          ) {
            return;
          }

          // Found a valid user prompt
          firstPrompt = content.slice(0, 150).trim();
          if (content.length > 150) {
            firstPrompt += "...";
          }
          rl.close();
          fileStream.destroy();
        }
      } catch {
        // Skip malformed lines
      }
    });

    rl.on("close", () => {
      resolve(firstPrompt || "(No user prompt found)");
    });

    rl.on("error", () => {
      resolve("(Error reading file)");
    });
  });
}

/**
 * Scan all sessions across all projects
 * Returns metadata sorted by timestamp (most recent first)
 */
export async function scanAllSessions(
  limit: number = 50
): Promise<{ sessions: SessionMetadata[]; totalCount: number }> {
  const sessions: Array<{
    sessionId: string;
    projectPath: string;
    projectName: string;
    jsonlPath: string;
    mtime: number;
  }> = [];

  try {
    const projectDirs = await fs.readdir(PROJECTS_DIR);

    for (const projectDir of projectDirs) {
      if (shouldSkipDirectory(projectDir)) {
        continue;
      }

      const projectPath = path.join(PROJECTS_DIR, projectDir);

      try {
        const stat = await fs.stat(projectPath);
        if (!stat.isDirectory()) continue;

        const decodedPath = decodeProjectPath(projectDir);
        const projectName = getProjectDisplayName(decodedPath);

        const files = await fs.readdir(projectPath);
        for (const file of files) {
          if (!file.endsWith(".jsonl")) continue;

          const jsonlPath = path.join(projectPath, file);
          const sessionId = file.replace(".jsonl", "");

          try {
            const fileStat = await fs.stat(jsonlPath);
            sessions.push({
              sessionId,
              projectPath: decodedPath,
              projectName,
              jsonlPath,
              mtime: fileStat.mtimeMs,
            });
          } catch {
            // Skip files we can't stat
          }
        }
      } catch {
        // Skip directories we can't read
      }
    }
  } catch {
    // Projects dir doesn't exist
    return { sessions: [], totalCount: 0 };
  }

  // Sort by mtime descending (most recent first)
  sessions.sort((a, b) => b.mtime - a.mtime);

  const totalCount = sessions.length;

  // Limit results
  const limitedSessions = sessions.slice(0, limit);

  // Extract first user prompt for each session (with concurrency limit)
  const CONCURRENCY = 10;
  const results: SessionMetadata[] = [];

  for (let i = 0; i < limitedSessions.length; i += CONCURRENCY) {
    const batch = limitedSessions.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map(async (session) => {
        const firstUserPrompt = await extractFirstUserPrompt(session.jsonlPath);
        return {
          sessionId: session.sessionId,
          projectPath: session.projectPath,
          projectName: session.projectName,
          timestamp: session.mtime,
          firstUserPrompt,
        };
      })
    );
    results.push(...batchResults);
  }

  return { sessions: results, totalCount };
}

/**
 * Parse a full conversation from a JSONL file
 */
export async function parseFullConversation(
  sessionId: string,
  projectPath: string
): Promise<SessionConversation | null> {
  console.log('[parseFullConversation] Input projectPath:', projectPath);

  // Handle both old and new formats:
  // Old (broken): /Users/cameronfleet/.claude/projects/-Users-cameronfleet-dev-personal-tools
  // New (correct): /Users/cameronfleet/dev/personal-tools

  let projectDir: string;

  if (projectPath.includes('/.claude/projects/')) {
    // Old format - projectPath contains the full encoded path like:
    // /Users/cameronfleet/.claude/projects/-Users-cameronfleet-dev-personal-tools
    // Extract the encoded directory name and decode it to get the real project path
    const dirName = path.basename(projectPath);
    const decodedProjectPath = decodeProjectPath(dirName);
    console.log('[parseFullConversation] Using old format, decoded:', decodedProjectPath);
    // Now encode it properly
    const encodedPath = "-" + decodedProjectPath.replace(/^\//,"").replace(/\//g, "-");
    projectDir = path.join(PROJECTS_DIR, encodedPath);
  } else {
    // New format - need to encode the project path to directory name
    const encodedPath = "-" + projectPath.replace(/^\//,"").replace(/\//g, "-");
    projectDir = path.join(PROJECTS_DIR, encodedPath);
    console.log('[parseFullConversation] Using new format (encoded path):', encodedPath);
  }

  const jsonlPath = path.join(projectDir, `${sessionId}.jsonl`);

  console.log('[parseFullConversation] Project dir:', projectDir);
  console.log('[parseFullConversation] JSONL path:', jsonlPath);

  try {
    await fs.access(jsonlPath);
    console.log('[parseFullConversation] JSONL file exists');
  } catch (err) {
    console.error('[parseFullConversation] JSONL file not found:', jsonlPath);
    console.error('[parseFullConversation] Error:', err);
    return null;
  }

  const messages: ConversationMessage[] = [];
  const projectName = getProjectDisplayName(projectPath);

  return new Promise((resolve) => {
    const fileStream = createReadStream(jsonlPath, { encoding: "utf-8" });
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    rl.on("line", (line) => {
      try {
        const entry = JSON.parse(line) as JournalEntry;

        // Skip meta entries and non-message types
        if (entry.isMeta) return;
        if (entry.type === "progress") return;
        if (entry.type === "file-history-snapshot") return;

        // Process user messages
        if (entry.type === "user" && entry.message?.role === "user") {
          const content = entry.message.content;

          if (typeof content === "string") {
            // Skip local commands and system tags
            if (content.startsWith("<local-command-")) {
              return;
            }

            // Classify as tool_result if it contains tool result tags
            if (
              content.includes("<tool_result>") ||
              content.includes("</tool_result>")
            ) {
              messages.push({
                uuid: entry.uuid,
                type: "user",
                subtype: "tool_result",
                timestamp: entry.timestamp,
                content: content,
              });
              return;
            }

            // Skip other system XML tags (but not user prompts)
            if (content.startsWith("<") && content.includes("</") && !content.includes("\n")) {
              return;
            }
          }

          // Regular user prompt
          messages.push({
            uuid: entry.uuid,
            type: "user",
            subtype: "prompt",
            timestamp: entry.timestamp,
            content: content || "",
          });
        }

        // Process assistant messages
        if (entry.type === "assistant" && entry.message?.content) {
          messages.push({
            uuid: entry.uuid,
            type: "assistant",
            timestamp: entry.timestamp,
            content: entry.message.content,
          });
        }
      } catch {
        // Skip malformed lines
      }
    });

    rl.on("close", () => {
      resolve({
        sessionId,
        projectPath,
        projectName,
        messages,
      });
    });

    rl.on("error", () => {
      resolve(null);
    });
  });
}

/**
 * Parse a full conversation using the encoded project directory name directly.
 * This is faster than parseFullConversation() because it skips path decoding.
 * Used when navigating from security scan results which store encodedProjectDir.
 */
export async function parseFullConversationByEncodedDir(
  sessionId: string,
  encodedDir: string
): Promise<SessionConversation | null> {
  console.log('[parseFullConversationByEncodedDir] encodedDir:', encodedDir);

  // Build path directly using encoded directory name (no decoding needed)
  const projectDir = path.join(PROJECTS_DIR, encodedDir);
  const jsonlPath = path.join(projectDir, `${sessionId}.jsonl`);

  console.log('[parseFullConversationByEncodedDir] Project dir:', projectDir);
  console.log('[parseFullConversationByEncodedDir] JSONL path:', jsonlPath);

  try {
    await fs.access(jsonlPath);
    console.log('[parseFullConversationByEncodedDir] JSONL file exists');
  } catch (err) {
    console.error('[parseFullConversationByEncodedDir] JSONL file not found:', jsonlPath);
    console.error('[parseFullConversationByEncodedDir] Error:', err);
    return null;
  }

  // Decode the path ONLY NOW for display purposes (lazy decoding)
  const decodedProjectPath = decodeProjectPath(encodedDir);
  const projectName = getProjectDisplayName(decodedProjectPath);

  const messages: ConversationMessage[] = [];

  return new Promise((resolve) => {
    const fileStream = createReadStream(jsonlPath, { encoding: "utf-8" });
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    rl.on("line", (line) => {
      try {
        const entry = JSON.parse(line) as JournalEntry;

        // Skip meta entries and non-message types
        if (entry.isMeta) return;
        if (entry.type === "progress") return;
        if (entry.type === "file-history-snapshot") return;

        // Process user messages
        if (entry.type === "user" && entry.message?.role === "user") {
          const content = entry.message.content;

          if (typeof content === "string") {
            // Skip local commands and system tags
            if (content.startsWith("<local-command-")) {
              return;
            }

            // Classify as tool_result if it contains tool result tags
            if (
              content.includes("<tool_result>") ||
              content.includes("</tool_result>")
            ) {
              messages.push({
                uuid: entry.uuid,
                type: "user",
                subtype: "tool_result",
                timestamp: entry.timestamp,
                content: content,
              });
              return;
            }

            // Skip other system XML tags (but not user prompts)
            if (content.startsWith("<") && content.includes("</") && !content.includes("\n")) {
              return;
            }
          }

          // Regular user prompt
          messages.push({
            uuid: entry.uuid,
            type: "user",
            subtype: "prompt",
            timestamp: entry.timestamp,
            content: content || "",
          });
        }

        // Process assistant messages
        if (entry.type === "assistant" && entry.message?.content) {
          messages.push({
            uuid: entry.uuid,
            type: "assistant",
            timestamp: entry.timestamp,
            content: entry.message.content,
          });
        }
      } catch {
        // Skip malformed lines
      }
    });

    rl.on("close", () => {
      resolve({
        sessionId,
        projectPath: decodedProjectPath,
        projectName,
        messages,
      });
    });

    rl.on("error", () => {
      resolve(null);
    });
  });
}

/**
 * Find the jsonl file for a session across all projects
 * Returns the decoded project path if found
 */
export async function findSessionProject(
  sessionId: string
): Promise<string | null> {
  try {
    const projectDirs = await fs.readdir(PROJECTS_DIR);

    for (const projectDir of projectDirs) {
      if (shouldSkipDirectory(projectDir)) {
        continue;
      }

      const projectPath = path.join(PROJECTS_DIR, projectDir);
      const jsonlPath = path.join(projectPath, `${sessionId}.jsonl`);

      try {
        await fs.access(jsonlPath);
        return decodeProjectPath(projectDir);
      } catch {
        // File doesn't exist in this project, continue
      }
    }
  } catch {
    // Projects dir doesn't exist
  }

  return null;
}

/**
 * Load favourites from ~/.claude/favourites.json
 * Returns empty array if file doesn't exist
 */
export async function loadFavourites(): Promise<string[]> {
  try {
    const content = await fs.readFile(FAVOURITES_FILE, "utf-8");
    const data = JSON.parse(content) as FavouritesData;
    return data.favourites || [];
  } catch {
    // File doesn't exist or is invalid
    return [];
  }
}

/**
 * Save favourites to ~/.claude/favourites.json
 */
export async function saveFavourites(sessionIds: string[]): Promise<void> {
  const data: FavouritesData = { favourites: sessionIds };
  await fs.writeFile(FAVOURITES_FILE, JSON.stringify(data, null, 2), "utf-8");
}

/**
 * Toggle a session's favourite status
 * Returns the updated list of favourite session IDs
 */
export async function toggleFavourite(sessionId: string): Promise<string[]> {
  const favourites = await loadFavourites();
  const index = favourites.indexOf(sessionId);

  if (index === -1) {
    // Add to favourites
    favourites.push(sessionId);
  } else {
    // Remove from favourites
    favourites.splice(index, 1);
  }

  await saveFavourites(favourites);
  return favourites;
}
