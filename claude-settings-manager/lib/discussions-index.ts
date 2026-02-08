import * as fs from "fs/promises";
import * as path from "path";
import type {
  DiscussionsIndex,
  DiscussionsIndexEntry,
  DiscussionsProjectInfo,
  SessionMetadata,
} from "@/types/settings";
import {
  decodeProjectPath,
  extractFirstUserPrompt,
  shouldSkipDirectory,
  getProjectDisplayName,
} from "@/lib/discussions";

const HOME = process.env.HOME || process.env.USERPROFILE || "";
const CLAUDE_DIR = path.join(HOME, ".claude");
const PROJECTS_DIR = path.join(CLAUDE_DIR, "projects");
const INDEX_FILE = path.join(CLAUDE_DIR, "discussions-index.json");
const INDEX_VERSION = 1;

const EMPTY_PROMPTS = new Set(["(No user prompt found)"]);

// In-memory cache
let cachedIndex: DiscussionsIndex | null = null;
let buildPromise: Promise<DiscussionsIndex> | null = null;

interface QueryParams {
  search?: string;
  project?: string;
  limit?: number;
  offset?: number;
}

interface QueryResult {
  sessions: SessionMetadata[];
  totalCount: number;
  projects: DiscussionsProjectInfo[];
  indexedCount: number;
}

/**
 * Load the discussions index from disk cache.
 * Returns null if the file doesn't exist or is invalid.
 */
async function loadDiscussionsIndex(): Promise<DiscussionsIndex | null> {
  try {
    const content = await fs.readFile(INDEX_FILE, "utf-8");
    const index = JSON.parse(content) as DiscussionsIndex;
    if (index.version !== INDEX_VERSION) {
      return null;
    }
    return index;
  } catch {
    return null;
  }
}

/**
 * Save the discussions index to disk.
 */
async function saveDiscussionsIndex(index: DiscussionsIndex): Promise<void> {
  await fs.writeFile(INDEX_FILE, JSON.stringify(index), "utf-8");
}

/**
 * Build or incrementally update the discussions index.
 * Only extracts prompts for new/modified sessions.
 */
async function buildOrUpdateIndex(): Promise<DiscussionsIndex> {
  const existing = await loadDiscussionsIndex();
  const existingEntries = existing?.entries || {};

  // Scan all project dirs and stat all .jsonl files
  const discovered: Array<{
    sessionId: string;
    projectPath: string;
    projectName: string;
    jsonlPath: string;
    mtime: number;
  }> = [];

  try {
    const projectDirs = await fs.readdir(PROJECTS_DIR);

    // Process project dirs in parallel batches
    const BATCH_SIZE = 20;
    for (let i = 0; i < projectDirs.length; i += BATCH_SIZE) {
      const batch = projectDirs.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map(async (projectDir) => {
          if (shouldSkipDirectory(projectDir)) return [];

          const projectFullPath = path.join(PROJECTS_DIR, projectDir);
          const results: typeof discovered = [];

          try {
            const stat = await fs.stat(projectFullPath);
            if (!stat.isDirectory()) return [];

            const decodedPath = decodeProjectPath(projectDir);
            const projectName = getProjectDisplayName(decodedPath);

            const files = await fs.readdir(projectFullPath);
            const jsonlFiles = files.filter((f) => f.endsWith(".jsonl"));

            // Stat files in parallel
            const fileResults = await Promise.all(
              jsonlFiles.map(async (file) => {
                const jsonlPath = path.join(projectFullPath, file);
                const sessionId = file.replace(".jsonl", "");
                try {
                  const fileStat = await fs.stat(jsonlPath);
                  return {
                    sessionId,
                    projectPath: decodedPath,
                    projectName,
                    jsonlPath,
                    mtime: fileStat.mtimeMs,
                  };
                } catch {
                  return null;
                }
              })
            );

            for (const r of fileResults) {
              if (r) results.push(r);
            }
          } catch {
            // Skip unreadable dirs
          }

          return results;
        })
      );

      for (const results of batchResults) {
        discovered.push(...results);
      }
    }
  } catch {
    // Projects dir doesn't exist
  }

  // Build a set of discovered session IDs for deletion detection
  const discoveredIds = new Set(discovered.map((d) => d.sessionId));

  // Diff: find new, modified, unchanged, and deleted sessions
  const toExtract: typeof discovered = [];
  const newEntries: Record<string, DiscussionsIndexEntry> = {};

  for (const session of discovered) {
    const existing = existingEntries[session.sessionId];
    if (existing && existing.mtime === session.mtime) {
      // Unchanged - reuse cached entry (skip empty sessions)
      if (!EMPTY_PROMPTS.has(existing.firstUserPrompt)) {
        newEntries[session.sessionId] = existing;
      }
    } else {
      // New or modified - needs extraction
      toExtract.push(session);
    }
  }

  // Extract prompts for new/modified sessions (batches of 10, parallel)
  const CONCURRENCY = 10;
  for (let i = 0; i < toExtract.length; i += CONCURRENCY) {
    const batch = toExtract.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (session) => {
        const firstUserPrompt = await extractFirstUserPrompt(session.jsonlPath);
        return {
          sessionId: session.sessionId,
          projectPath: session.projectPath,
          projectName: session.projectName,
          mtime: session.mtime,
          firstUserPrompt,
          promptLower: firstUserPrompt.toLowerCase(),
        } satisfies DiscussionsIndexEntry;
      })
    );

    for (const entry of results) {
      if (!EMPTY_PROMPTS.has(entry.firstUserPrompt)) {
        newEntries[entry.sessionId] = entry;
      }
    }
  }

  // Deleted sessions are simply not in newEntries (they weren't in discoveredIds)

  const index: DiscussionsIndex = {
    version: INDEX_VERSION,
    lastBuilt: Date.now(),
    entries: newEntries,
  };

  // Save to disk (fire and forget for speed, but await to ensure consistency)
  await saveDiscussionsIndex(index);

  return index;
}

/**
 * Get the index, building it if necessary.
 * Uses promise deduplication to avoid concurrent builds.
 */
export async function getOrBuildIndex(): Promise<DiscussionsIndex> {
  if (cachedIndex) return cachedIndex;

  // If a build is already in progress, wait for it
  if (buildPromise) return buildPromise;

  buildPromise = buildOrUpdateIndex()
    .then((index) => {
      cachedIndex = index;
      buildPromise = null;
      return index;
    })
    .catch((err) => {
      buildPromise = null;
      throw err;
    });

  return buildPromise;
}

/**
 * Force rebuild the index (invalidate cache + rebuild).
 */
export async function rebuildIndex(): Promise<DiscussionsIndex> {
  cachedIndex = null;
  buildPromise = null;

  const index = await buildOrUpdateIndex();
  cachedIndex = index;
  return index;
}

/**
 * Invalidate the in-memory cache.
 */
export function invalidateCache(): void {
  cachedIndex = null;
  buildPromise = null;
}

/**
 * Query the index with search, project filter, and pagination.
 * Pure synchronous filtering on the index entries.
 */
export function queryIndex(index: DiscussionsIndex, params: QueryParams): QueryResult {
  const entries = Object.values(index.entries);
  const indexedCount = entries.length;

  // Compute projects from the full set (before filtering)
  const projectMap = new Map<string, DiscussionsProjectInfo>();
  for (const entry of entries) {
    const existing = projectMap.get(entry.projectPath);
    if (existing) {
      existing.count++;
    } else {
      projectMap.set(entry.projectPath, {
        name: entry.projectName,
        path: entry.projectPath,
        count: 1,
      });
    }
  }
  const projects = Array.from(projectMap.values()).sort((a, b) => b.count - a.count);

  // Sort by mtime descending (most recent first)
  let filtered = entries.sort((a, b) => b.mtime - a.mtime);

  // Filter by project
  if (params.project && params.project !== "all") {
    filtered = filtered.filter((e) => e.projectPath === params.project);
  }

  // Filter by search (substring match on pre-lowercased prompt)
  if (params.search) {
    const searchLower = params.search.toLowerCase();
    filtered = filtered.filter((e) => e.promptLower.includes(searchLower));
  }

  const totalCount = filtered.length;

  // Apply pagination
  const offset = params.offset || 0;
  const limit = params.limit || 50;
  const paginated = filtered.slice(offset, offset + limit);

  // Convert to SessionMetadata
  const sessions: SessionMetadata[] = paginated.map((e) => ({
    sessionId: e.sessionId,
    projectPath: e.projectPath,
    projectName: e.projectName,
    timestamp: e.mtime,
    firstUserPrompt: e.firstUserPrompt,
  }));

  return {
    sessions,
    totalCount,
    projects,
    indexedCount,
  };
}
