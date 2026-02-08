import * as path from "path";
import * as readline from "readline";
import { createReadStream } from "fs";
import type {
  DiscussionsIndex,
  DiscussionsIndexEntry,
  DeepSearchEvent,
  DeepSearchMatch,
  ContentBlock,
} from "@/types/settings";

const HOME = process.env.HOME || process.env.USERPROFILE || "";
const CLAUDE_DIR = path.join(HOME, ".claude");
const PROJECTS_DIR = path.join(CLAUDE_DIR, "projects");

// JSONL entry types (matches discussions.ts)
interface JournalEntry {
  type: string;
  message?: {
    role?: string;
    content?: string | ContentBlock[];
  };
  isMeta?: boolean;
}

/**
 * Encode a project path to its directory name.
 * e.g., "/Users/cameronfleet/dev/personal-tools" -> "-Users-cameronfleet-dev-personal-tools"
 */
function encodeProjectPath(projectPath: string): string {
  return "-" + projectPath.replace(/^\//, "").replace(/\//g, "-");
}

/**
 * Extract text content from a JSONL entry's message.
 * Handles both string and ContentBlock[] formats.
 */
function extractTextFromEntry(entry: JournalEntry): string | null {
  if (!entry.message?.content) return null;

  if (typeof entry.message.content === "string") {
    return entry.message.content;
  }

  if (Array.isArray(entry.message.content)) {
    const texts: string[] = [];
    for (const block of entry.message.content) {
      if (block.type === "text" && typeof block.text === "string") {
        texts.push(block.text);
      }
    }
    return texts.length > 0 ? texts.join(" ") : null;
  }

  return null;
}

/**
 * Extract a ~200 character context snippet around the first match position.
 */
function extractContextSnippet(text: string, searchLower: string): string {
  const textLower = text.toLowerCase();
  const matchIndex = textLower.indexOf(searchLower);
  if (matchIndex === -1) return text.slice(0, 200);

  // Center the snippet around the match
  const snippetLength = 200;
  const matchLen = searchLower.length;
  const contextBefore = Math.floor((snippetLength - matchLen) / 2);

  let start = Math.max(0, matchIndex - contextBefore);
  let end = Math.min(text.length, start + snippetLength);

  // Adjust start if we're near the end
  if (end === text.length) {
    start = Math.max(0, end - snippetLength);
  }

  let snippet = text.slice(start, end).trim();

  // Clean up: collapse whitespace
  snippet = snippet.replace(/\s+/g, " ");

  if (start > 0) snippet = "..." + snippet;
  if (end < text.length) snippet = snippet + "...";

  return snippet;
}

/**
 * Search a single JSONL file for a search term.
 * Returns the first match found (early termination).
 */
function searchFile(
  jsonlPath: string,
  searchLower: string,
  signal?: AbortSignal
): Promise<{ matchContext: string; matchRole: "user" | "assistant" } | null> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve(null);
      return;
    }

    const fileStream = createReadStream(jsonlPath, { encoding: "utf-8" });
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    let found = false;

    const cleanup = () => {
      rl.close();
      fileStream.destroy();
    };

    // Listen for abort signal
    const onAbort = () => {
      cleanup();
      resolve(null);
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    rl.on("line", (line) => {
      if (found) return;

      try {
        const entry = JSON.parse(line) as JournalEntry;

        // Skip non-message types
        if (entry.type === "progress") return;
        if (entry.type === "file-history-snapshot") return;
        if (entry.isMeta) return;

        // Only search user and assistant messages
        if (entry.type !== "user" && entry.type !== "assistant") return;

        const text = extractTextFromEntry(entry);
        if (!text) return;

        // Case-insensitive substring match
        if (text.toLowerCase().includes(searchLower)) {
          found = true;
          const role: "user" | "assistant" =
            entry.type === "user" ? "user" : "assistant";
          const matchContext = extractContextSnippet(text, searchLower);
          cleanup();
          signal?.removeEventListener("abort", onAbort);
          resolve({ matchContext, matchRole: role });
        }
      } catch {
        // Skip malformed lines
      }
    });

    rl.on("close", () => {
      signal?.removeEventListener("abort", onAbort);
      if (!found) resolve(null);
    });

    rl.on("error", () => {
      signal?.removeEventListener("abort", onAbort);
      resolve(null);
    });
  });
}

/**
 * Deep search all conversations in a project for a search term.
 * Async generator that yields progress, result, and complete events.
 *
 * Uses the index to get the list of sessions (avoids re-scanning filesystem).
 * Processes files in batches of 12 concurrent readline streams.
 */
export async function* deepSearchProject(
  projectPath: string,
  searchTerm: string,
  signal: AbortSignal,
  index: DiscussionsIndex
): AsyncGenerator<DeepSearchEvent> {
  const startTime = Date.now();
  const searchLower = searchTerm.toLowerCase();

  // Filter index entries for this project, sorted by mtime descending
  const projectEntries: DiscussionsIndexEntry[] = Object.values(index.entries)
    .filter((e) => e.projectPath === projectPath)
    .sort((a, b) => b.mtime - a.mtime);

  const total = projectEntries.length;
  if (total === 0) {
    yield { type: "complete", totalMatches: 0, totalSearched: 0, durationMs: Date.now() - startTime };
    return;
  }

  const encodedDir = encodeProjectPath(projectPath);
  const projectDir = path.join(PROJECTS_DIR, encodedDir);

  let searched = 0;
  let totalMatches = 0;
  const BATCH_SIZE = 12;

  for (let i = 0; i < projectEntries.length; i += BATCH_SIZE) {
    if (signal.aborted) return;

    const batch = projectEntries.slice(i, i + BATCH_SIZE);

    const results = await Promise.all(
      batch.map(async (entry) => {
        if (signal.aborted) return null;

        const jsonlPath = path.join(projectDir, `${entry.sessionId}.jsonl`);
        const match = await searchFile(jsonlPath, searchLower, signal);

        if (match) {
          return {
            sessionId: entry.sessionId,
            projectPath: entry.projectPath,
            projectName: entry.projectName,
            timestamp: entry.mtime,
            firstUserPrompt: entry.firstUserPrompt,
            matchContext: match.matchContext,
            matchRole: match.matchRole,
          } satisfies DeepSearchMatch;
        }
        return null;
      })
    );

    if (signal.aborted) return;

    // Yield results from this batch
    for (const match of results) {
      if (match) {
        totalMatches++;
        yield { type: "result", match };
      }
    }

    searched += batch.length;
    yield { type: "progress", searched, total };
  }

  yield {
    type: "complete",
    totalMatches,
    totalSearched: searched,
    durationMs: Date.now() - startTime,
  };
}
