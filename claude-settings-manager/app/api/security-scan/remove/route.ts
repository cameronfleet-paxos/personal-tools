import { NextResponse } from "next/server";
import * as fs from "fs/promises";
import * as path from "path";
import type {
  RemoveTokenRequest,
  RemoveTokenResponse,
  Settings,
} from "@/types/settings";
import { loadSecurityScanCache, saveSecurityScanCache } from "@/lib/security-scanner";

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

async function writeJsonFile(filePath: string, data: unknown): Promise<void> {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
}

/**
 * Recursively search and remove a pattern from settings object
 */
function removePatternFromSettings(
  obj: unknown,
  fullPattern: string
): { modified: boolean; result: unknown } {
  if (typeof obj === 'string') {
    // Check if this string contains the pattern
    if (obj.includes(fullPattern)) {
      return { modified: true, result: undefined }; // Mark for deletion
    }
    return { modified: false, result: obj };
  }

  if (Array.isArray(obj)) {
    let modified = false;
    const newArray = obj.filter(item => {
      const itemResult = removePatternFromSettings(item, fullPattern);
      if (itemResult.modified && itemResult.result === undefined) {
        modified = true;
        return false; // Remove this item
      }
      return true;
    });

    return { modified, result: modified ? newArray : obj };
  }

  if (obj && typeof obj === 'object') {
    let modified = false;
    const newObj: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
      const valueResult = removePatternFromSettings(value, fullPattern);

      if (valueResult.modified && valueResult.result === undefined) {
        modified = true;
        // Skip this key (delete it)
      } else {
        newObj[key] = valueResult.modified ? valueResult.result : value;
        if (valueResult.modified) {
          modified = true;
        }
      }
    }

    return { modified, result: modified ? newObj : obj };
  }

  return { modified: false, result: obj };
}

/**
 * DELETE /api/security-scan/remove
 * Remove a token finding (from settings or discussion)
 */
export async function DELETE(
  request: Request
): Promise<NextResponse<RemoveTokenResponse>> {
  try {
    const body = (await request.json()) as RemoveTokenRequest;
    const { id, location } = body;

    if (location.source === 'settings') {
      // Remove pattern from settings file
      const { scope, projectPath } = location;

      if (!scope) {
        return NextResponse.json({
          success: false,
          error: 'Scope is required for settings token removal',
        });
      }

      // Determine settings file path
      let settingsPath: string;
      if (scope === 'user') {
        settingsPath = path.join(USER_CLAUDE_DIR, 'settings.json');
      } else if (scope === 'project' || scope === 'project-local') {
        if (!projectPath) {
          return NextResponse.json({
            success: false,
            error: 'projectPath is required for project scope',
          });
        }
        const fileName = scope === 'project-local' ? 'settings.local.json' : 'settings.json';
        settingsPath = path.join(projectPath, fileName);
      } else {
        return NextResponse.json({
          success: false,
          error: `Unknown scope: ${scope}`,
        });
      }

      // Load settings
      const settings = await readJsonFile<Settings>(settingsPath);
      if (!settings) {
        return NextResponse.json({
          success: false,
          error: 'Could not load settings file',
        });
      }

      // Find and remove the token pattern
      // We need to find the full pattern from the TokenMatch (stored in request)
      // For now, we'll use the id to match and remove
      // Note: In a real implementation, we'd need to pass the fullPattern in the request

      // For settings, we can't easily remove without the full pattern
      // Let's require it in the location
      return NextResponse.json({
        success: false,
        error: 'Settings token removal not fully implemented - manually edit the settings file',
      });
    } else if (location.source === 'discussion') {
      // Delete the entire .jsonl conversation file
      const { filePath, sessionId } = location;

      if (!filePath) {
        return NextResponse.json({
          success: false,
          error: 'filePath is required for discussion token removal',
        });
      }

      // Verify the file exists and is a .jsonl file in the projects directory
      const projectsDir = path.join(USER_CLAUDE_DIR, 'projects');
      if (!filePath.startsWith(projectsDir) || !filePath.endsWith('.jsonl')) {
        return NextResponse.json({
          success: false,
          error: 'Invalid file path',
        });
      }

      try {
        // Try to delete the file (may already be gone)
        try {
          await fs.unlink(filePath);
        } catch (unlinkErr) {
          // File doesn't exist - that's fine, treat as success
          // (could have been deleted manually or from a previous attempt)
          if ((unlinkErr as NodeJS.ErrnoException).code !== 'ENOENT') {
            throw unlinkErr; // Re-throw if it's a different error
          }
        }

        // Update the cache to remove tokens from this session
        try {
          const cache = await loadSecurityScanCache();
          if (cache.tokens && sessionId) {
            cache.tokens = cache.tokens.filter(
              (t) => !(t.location.source === 'discussion' && t.location.sessionId === sessionId)
            );
            await saveSecurityScanCache(cache);
          }
        } catch (cacheErr) {
          console.error('Failed to update cache after deletion:', cacheErr);
          // Continue anyway - file was deleted successfully
        }

        return NextResponse.json({
          success: true,
          deletedFile: sessionId || path.basename(filePath),
        });
      } catch (err) {
        return NextResponse.json({
          success: false,
          error: err instanceof Error ? err.message : 'Failed to delete file',
        });
      }
    } else {
      return NextResponse.json({
        success: false,
        error: 'Invalid source type',
      });
    }
  } catch (err) {
    console.error('Error removing token:', err);

    return NextResponse.json({
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    });
  }
}
