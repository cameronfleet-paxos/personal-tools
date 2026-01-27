import * as fs from "fs/promises";
import * as path from "path";
import * as readline from "readline";
import { createReadStream } from "fs";
import type {
  SessionMetadata,
  SessionConversation,
  ConversationMessage,
  ContentBlock,
  DiscussionsResponse,
} from "@/types/settings";

const HOME = process.env.HOME || process.env.USERPROFILE || "";
const CLAUDE_DIR = path.join(HOME, ".claude");
const PROJECTS_DIR = path.join(CLAUDE_DIR, "projects");

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
 * Decode a project directory name to a readable path
 * e.g., "-Users-cameronfleet-dev-pax" -> "/Users/cameronfleet/dev/pax"
 */
function decodeProjectPath(dirName: string): string {
  return "/" + dirName.replace(/-/g, "/").replace(/^\/+/, "");
}

/**
 * Get a display name from a project path
 * e.g., "/Users/cameronfleet/dev/pax" -> "pax"
 */
function getProjectDisplayName(projectPath: string): string {
  return path.basename(projectPath) || projectPath;
}

/**
 * Check if a directory should be skipped
 */
function shouldSkipDirectory(dirName: string): boolean {
  return dirName.includes("-T-") || dirName.includes("var-folders");
}

/**
 * Extract the first user prompt from a JSONL file by reading only the first N lines
 * Returns a snippet of ~150 characters
 */
async function extractFirstUserPrompt(
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
          entry.message?.role === "user" &&
          typeof entry.message.content === "string"
        ) {
          const content = entry.message.content;

          // Skip tool results and system tags
          if (
            content.startsWith("<") ||
            content.includes("tool_result") ||
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
): Promise<DiscussionsResponse> {
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
  // Encode project path back to directory name (directories have leading dash)
  const encodedPath = "-" + projectPath.replace(/^\//,"").replace(/\//g, "-");
  const projectDir = path.join(PROJECTS_DIR, encodedPath);
  const jsonlPath = path.join(projectDir, `${sessionId}.jsonl`);

  try {
    await fs.access(jsonlPath);
  } catch {
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
