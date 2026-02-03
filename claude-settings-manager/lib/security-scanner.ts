import * as fs from "fs/promises";
import * as path from "path";
import { createReadStream } from "fs";
import { createInterface } from "readline";
import type {
  Settings,
  TokenType,
  TokenMatch,
  SecurityScanCache,
  SecuritySeverity,
  SettingsTarget,
} from "@/types/settings";
import { decodeProjectPath } from "./discussions";

const HOME = process.env.HOME || process.env.USERPROFILE || "";
const USER_CLAUDE_DIR = path.join(HOME, ".claude");
const CACHE_FILE = path.join(USER_CLAUDE_DIR, "security-scan-cache.json");
const CACHE_VERSION = 1;

interface TokenPattern {
  type: TokenType;
  regex: RegExp;
  severity: SecuritySeverity;
  description: string;
  remediation: string;
}

// Token patterns to detect (Critical/High severity only)
const TOKEN_PATTERNS: TokenPattern[] = [
  {
    type: 'anthropic_key',
    regex: /sk-ant-[a-zA-Z0-9_-]{20,}/g,
    severity: 'critical',
    description: 'Anthropic API key detected',
    remediation: 'Remove this API key and rotate it immediately at https://console.anthropic.com',
  },
  {
    type: 'github_token',
    regex: /gh[pso]_[a-zA-Z0-9_]{20,}/g,
    severity: 'critical',
    description: 'GitHub personal access token detected',
    remediation: 'Remove this token and revoke it at https://github.com/settings/tokens',
  },
  {
    type: 'github_token',
    regex: /github_pat_[a-zA-Z0-9_]{22,}/g,
    severity: 'critical',
    description: 'GitHub fine-grained token detected',
    remediation: 'Remove this token and revoke it at https://github.com/settings/tokens',
  },
  {
    type: 'github_token',
    regex: /\bGITHUB_TOKEN\s*[:=]\s*["']?([a-zA-Z0-9_-]{20,})["']?/gi,
    severity: 'critical',
    description: 'GitHub token environment variable detected',
    remediation: 'Remove this token and revoke it at https://github.com/settings/tokens',
  },
  {
    type: 'jira_token',
    regex: /JIRA_[A-Z0-9_]{20,}/g,
    severity: 'high',
    description: 'Jira API token detected',
    remediation: 'Remove this token and rotate it in your Jira settings',
  },
  {
    type: 'aws_key',
    regex: /AKIA[0-9A-Z]{16}/g,
    severity: 'critical',
    description: 'AWS Access Key ID detected',
    remediation: 'Remove this key and rotate it immediately in AWS IAM',
  },
  {
    type: 'private_key',
    regex: /-----BEGIN\s+(?:RSA\s+|EC\s+|OPENSSH\s+|DSA\s+)?PRIVATE\s+KEY-----/gi,
    severity: 'critical',
    description: 'Private key detected',
    remediation: 'Remove this private key and regenerate a new key pair',
  },
  {
    type: 'jwt_token',
    regex: /\beyJ[a-zA-Z0-9_-]{10,}\.eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g,
    severity: 'high',
    description: 'JWT token detected',
    remediation: 'Remove this JWT token as it may contain sensitive claims',
  },
  {
    type: 'generic_secret',
    regex: /(?:api[_-]?key|api[_-]?secret|secret[_-]?key|access[_-]?token|auth[_-]?token)\s*[:=]\s*["']([a-zA-Z0-9_\-+/=]{20,})["']/gi,
    severity: 'medium',
    description: 'Potential API key or secret detected',
    remediation: 'Review this pattern and remove if it contains a real credential',
  },
];

// False positive patterns to exclude
const FALSE_POSITIVE_PATTERNS = [
  /sk-ant-xxxx/i,
  /sk-ant-api03-.*example/i,
  /example\.com/i,
  /YOUR_API_KEY/i,
  /\*\*\*REDACTED\*\*\*/i,
  /placeholder/i,
  /INSERT_.*_HERE/i,
  /<YOUR_/i,
  /\$\{.*\}/i, // Template variables
];

/**
 * Check if text should be excluded as a false positive
 */
function shouldExclude(text: string): boolean {
  return FALSE_POSITIVE_PATTERNS.some(pattern => pattern.test(text));
}

/**
 * Redact a token to show only first 4 + last 4 characters
 */
export function redactToken(token: string, type: TokenType): string {
  if (token.length <= 8) {
    return '***REDACTED***';
  }
  const first = token.slice(0, 4);
  const last = token.slice(-4);
  return `${first}***REDACTED***${last}`;
}

/**
 * Load security scan cache from disk
 */
export async function loadSecurityScanCache(): Promise<SecurityScanCache> {
  try {
    const content = await fs.readFile(CACHE_FILE, 'utf-8');
    const cache = JSON.parse(content) as SecurityScanCache;

    // Validate version
    if (cache.version !== CACHE_VERSION) {
      return getDefaultScanCache();
    }

    return cache;
  } catch {
    return getDefaultScanCache();
  }
}

/**
 * Save security scan cache to disk
 */
export async function saveSecurityScanCache(cache: SecurityScanCache): Promise<void> {
  try {
    // Ensure .claude directory exists
    await fs.mkdir(USER_CLAUDE_DIR, { recursive: true });

    // Write cache with restricted permissions (600)
    await fs.writeFile(CACHE_FILE, JSON.stringify(cache, null, 2), {
      encoding: 'utf-8',
      mode: 0o600,
    });
  } catch (err) {
    console.error('Failed to save security scan cache:', err);
  }
}

/**
 * Get default empty cache
 */
export function getDefaultScanCache(): SecurityScanCache {
  return {
    version: CACHE_VERSION,
    lastScanTimestamp: null,
    lastScanDuration: null,
    scanStatus: 'idle',
    scannedSources: {
      settingsScanned: false,
      discussionsScanned: false,
      discussionCount: 0,
    },
    tokens: [],
  };
}

/**
 * Scan a text string for token patterns
 */
function scanTextForTokens(text: string, context: Partial<TokenMatch['location']>): TokenMatch[] {
  const matches: TokenMatch[] = [];
  let idCounter = 0;

  for (const pattern of TOKEN_PATTERNS) {
    const foundMatches = text.matchAll(pattern.regex);

    for (const match of foundMatches) {
      const token = match[0];

      // Skip false positives
      if (shouldExclude(token)) {
        continue;
      }

      matches.push({
        id: `token-${Date.now()}-${++idCounter}`,
        type: pattern.type,
        severity: pattern.severity,
        description: pattern.description,
        remediation: pattern.remediation,
        redactedValue: redactToken(token, pattern.type),
        fullPattern: token,
        location: context as TokenMatch['location'],
      });
    }
  }

  return matches;
}

/**
 * Recursively scan a settings object for tokens
 */
function scanSettingsObject(
  obj: unknown,
  scope: SettingsTarget,
  projectPath?: string,
  projectName?: string,
  keyPath: string[] = []
): TokenMatch[] {
  const matches: TokenMatch[] = [];

  if (typeof obj === 'string') {
    // Scan string values
    const context: Partial<TokenMatch['location']> = {
      source: 'settings',
      scope,
      projectPath,
      projectName,
      settingsKey: keyPath.join('.'),
    };
    matches.push(...scanTextForTokens(obj, context));
  } else if (Array.isArray(obj)) {
    // Scan array elements
    obj.forEach((item, index) => {
      matches.push(
        ...scanSettingsObject(item, scope, projectPath, projectName, [...keyPath, `[${index}]`])
      );
    });
  } else if (obj && typeof obj === 'object') {
    // Scan object properties
    for (const [key, value] of Object.entries(obj)) {
      matches.push(
        ...scanSettingsObject(value, scope, projectPath, projectName, [...keyPath, key])
      );
    }
  }

  return matches;
}

/**
 * Scan all settings files for tokens (fast, synchronous)
 */
export async function scanSettingsForTokens(): Promise<TokenMatch[]> {
  const matches: TokenMatch[] = [];

  // Load user settings
  try {
    const userSettingsPath = path.join(USER_CLAUDE_DIR, 'settings.json');
    const userContent = await fs.readFile(userSettingsPath, 'utf-8');
    const userSettings = JSON.parse(userContent) as Settings;
    matches.push(...scanSettingsObject(userSettings, 'user'));
  } catch {
    // User settings not found, skip
  }

  // Load project settings from index
  try {
    const indexPath = path.join(USER_CLAUDE_DIR, 'index.json');
    const indexContent = await fs.readFile(indexPath, 'utf-8');
    const index = JSON.parse(indexContent);

    if (index?.locations && Array.isArray(index.locations)) {
      for (const location of index.locations) {
        // Skip user-level directory
        if (location.path === USER_CLAUDE_DIR) {
          continue;
        }

        // Scan project settings.json
        try {
          const settingsPath = path.join(location.path, 'settings.json');
          const settingsContent = await fs.readFile(settingsPath, 'utf-8');
          const settings = JSON.parse(settingsContent) as Settings;
          matches.push(
            ...scanSettingsObject(settings, 'project', location.path, location.projectName)
          );
        } catch {
          // Project settings not found, skip
        }

        // Scan project settings.local.json
        try {
          const localSettingsPath = path.join(location.path, 'settings.local.json');
          const localContent = await fs.readFile(localSettingsPath, 'utf-8');
          const localSettings = JSON.parse(localContent) as Settings;
          matches.push(
            ...scanSettingsObject(localSettings, 'project-local', location.path, location.projectName)
          );
        } catch {
          // Project local settings not found, skip
        }
      }
    }
  } catch {
    // Index not found, skip project scanning
  }

  return matches;
}

/**
 * Parse a single .jsonl conversation file and scan for tokens
 */
async function parseConversationForScan(
  jsonlPath: string,
  projectPath: string,
  projectName: string,
  sessionId: string
): Promise<TokenMatch[]> {
  const matches: TokenMatch[] = [];

  try {
    const fileStream = createReadStream(jsonlPath);
    const rl = createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      if (!line.trim()) continue;

      try {
        const message = JSON.parse(line);

        // Scan user prompts (check both direct content and nested message.content)
        if (message.type === 'user') {
          const context: Partial<TokenMatch['location']> = {
            source: 'discussion',
            projectPath,
            projectName,
            sessionId,
            filePath: jsonlPath,
          };

          // Check direct content field
          if (typeof message.content === 'string') {
            matches.push(...scanTextForTokens(message.content, context));
          }

          // Check nested message.message.content (actual Claude Code format)
          if (message.message?.content && typeof message.message.content === 'string') {
            matches.push(...scanTextForTokens(message.message.content, context));
          }

          // Also scan stringified message object for any embedded tokens
          const messageStr = JSON.stringify(message);
          matches.push(...scanTextForTokens(messageStr, context));
        }

        // Scan assistant messages and tool inputs
        if (message.type === 'assistant') {
          const context: Partial<TokenMatch['location']> = {
            source: 'discussion',
            projectPath,
            projectName,
            sessionId,
            filePath: jsonlPath,
          };

          // Scan tool inputs from content blocks
          if (Array.isArray(message.content)) {
            for (const block of message.content) {
              if (block.type === 'tool_use' && block.input) {
                const inputStr = JSON.stringify(block.input);
                matches.push(...scanTextForTokens(inputStr, context));
              }
            }
          }

          // Scan nested message.message structure if present
          if (message.message?.content) {
            if (typeof message.message.content === 'string') {
              matches.push(...scanTextForTokens(message.message.content, context));
            } else if (Array.isArray(message.message.content)) {
              for (const block of message.message.content) {
                if (block.type === 'tool_use' && block.input) {
                  const inputStr = JSON.stringify(block.input);
                  matches.push(...scanTextForTokens(inputStr, context));
                }
              }
            }
          }

          // Also scan stringified message for any embedded tokens
          const messageStr = JSON.stringify(message);
          matches.push(...scanTextForTokens(messageStr, context));
        }
      } catch {
        // Skip malformed JSON lines
      }
    }
  } catch (err) {
    console.error(`Error scanning ${jsonlPath}:`, err);
  }

  return matches;
}


/**
 * Scan all discussions in a project directory
 */
async function scanProjectDiscussions(projectDir: string): Promise<TokenMatch[]> {
  const matches: TokenMatch[] = [];

  try {
    const entries = await fs.readdir(projectDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.jsonl')) {
        const sessionId = entry.name.replace('.jsonl', '');
        const jsonlPath = path.join(projectDir, entry.name);

        // Decode the project directory name to get the actual path
        // projectDir is like: /Users/cameronfleet/.claude/projects/-Users-cameronfleet-dev-personal-tools
        // We want to extract just the directory name and decode it
        const dirName = path.basename(projectDir); // -Users-cameronfleet-dev-personal-tools
        const projectPath = decodeProjectPath(dirName); // /Users/cameronfleet/dev/personal-tools (handles dashes correctly)
        const projectName = path.basename(projectPath); // personal-tools

        console.log('[scanProjectDiscussions] projectDir:', projectDir);
        console.log('[scanProjectDiscussions] dirName:', dirName);
        console.log('[scanProjectDiscussions] decoded projectPath:', projectPath);
        console.log('[scanProjectDiscussions] projectName:', projectName);

        matches.push(
          ...await parseConversationForScan(jsonlPath, projectPath, projectName, sessionId)
        );
      }
    }
  } catch (err) {
    console.error(`Error scanning project discussions in ${projectDir}:`, err);
  }

  return matches;
}

/**
 * Scan all discussions in all projects (slow, asynchronous)
 */
async function scanAllDiscussions(): Promise<{ matches: TokenMatch[], discussionCount: number }> {
  const allMatches: TokenMatch[] = [];
  let discussionCount = 0;

  try {
    const projectsDir = path.join(USER_CLAUDE_DIR, 'projects');
    const projectDirs = await fs.readdir(projectsDir, { withFileTypes: true });

    // Process in batches of 5 for memory efficiency
    const batchSize = 5;
    for (let i = 0; i < projectDirs.length; i += batchSize) {
      const batch = projectDirs.slice(i, i + batchSize);

      const batchResults = await Promise.all(
        batch
          .filter(entry => entry.isDirectory())
          .map(async (entry) => {
            const projectDir = path.join(projectsDir, entry.name);

            // Count .jsonl files
            try {
              const files = await fs.readdir(projectDir);
              const jsonlCount = files.filter(f => f.endsWith('.jsonl')).length;
              discussionCount += jsonlCount;
            } catch {
              // Skip if can't read directory
            }

            return scanProjectDiscussions(projectDir);
          })
      );

      // Flatten batch results
      for (const matches of batchResults) {
        allMatches.push(...matches);
      }
    }
  } catch (err) {
    console.error('Error scanning all discussions:', err);
  }

  return { matches: allMatches, discussionCount };
}

/**
 * Run background scan of discussions (async, non-blocking)
 * This function updates the cache as it runs
 */
export async function runBackgroundScan(): Promise<void> {
  const startTime = Date.now();

  try {
    // Load cache and check if already running
    const cache = await loadSecurityScanCache();

    if (cache.scanStatus === 'running') {
      console.log('Background scan already running, skipping');
      return;
    }

    // Set status to running
    cache.scanStatus = 'running';
    cache.scanError = undefined;
    await saveSecurityScanCache(cache);

    // Scan all discussions
    const { matches, discussionCount } = await scanAllDiscussions();

    // Update cache with results
    const duration = Date.now() - startTime;
    const updatedCache: SecurityScanCache = {
      version: CACHE_VERSION,
      lastScanTimestamp: Date.now(),
      lastScanDuration: duration,
      scanStatus: 'completed',
      scannedSources: {
        settingsScanned: false, // Settings scanned separately on demand
        discussionsScanned: true,
        discussionCount,
      },
      tokens: matches,
    };

    await saveSecurityScanCache(updatedCache);
    console.log(`Background scan completed in ${duration}ms, found ${matches.length} tokens`);
  } catch (err) {
    console.error('Background scan failed:', err);

    // Update cache with error
    const cache = await loadSecurityScanCache();
    cache.scanStatus = 'error';
    cache.scanError = err instanceof Error ? err.message : 'Unknown error';
    await saveSecurityScanCache(cache);
  }
}
