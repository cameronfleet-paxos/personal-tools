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

const HOME = process.env.HOME || process.env.USERPROFILE || "";
const USER_CLAUDE_DIR = path.join(HOME, ".claude");
const CACHE_FILE = path.join(USER_CLAUDE_DIR, "security-scan-cache.json");
const CACHE_VERSION = 2; // Bumped to invalidate old cache with projectPath format

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

/**
 * Windowed scanning: instead of running regex across entire multi-MB JSONL lines,
 * use indexOf (SIMD-optimized in V8) to find candidate positions, extract small
 * windows around each, and run the appropriate regex only on the window.
 *
 * Each entry: [literalPrefix, regex, patternMeta]
 * The regex is run on a ~500 char window around each indexOf hit.
 */
const WINDOW_SIZE = 500; // chars around each prefix hit

interface ScanRule {
  prefix: string;
  regex: RegExp;
  meta: TokenPattern;
}

const SCAN_RULES: ScanRule[] = [
  { prefix: 'sk-ant-', regex: /sk-ant-[a-zA-Z0-9_-]{20,}/g, meta: TOKEN_PATTERNS[0] },
  { prefix: 'ghp_', regex: /gh[pso]_[a-zA-Z0-9_]{20,}/g, meta: TOKEN_PATTERNS[1] },
  { prefix: 'ghs_', regex: /gh[pso]_[a-zA-Z0-9_]{20,}/g, meta: TOKEN_PATTERNS[1] },
  { prefix: 'gho_', regex: /gh[pso]_[a-zA-Z0-9_]{20,}/g, meta: TOKEN_PATTERNS[1] },
  { prefix: 'github_pat_', regex: /github_pat_[a-zA-Z0-9_]{22,}/g, meta: TOKEN_PATTERNS[2] },
  { prefix: 'GITHUB_TOKEN', regex: /\bGITHUB_TOKEN\s*[:=]\s*["']?([a-zA-Z0-9_-]{20,})["']?/gi, meta: TOKEN_PATTERNS[3] },
  { prefix: 'JIRA_', regex: /JIRA_[A-Z0-9_]{20,}/g, meta: TOKEN_PATTERNS[4] },
  { prefix: 'AKIA', regex: /AKIA[0-9A-Z]{16}/g, meta: TOKEN_PATTERNS[5] },
  { prefix: 'BEGIN', regex: /-----BEGIN\s+(?:RSA\s+|EC\s+|OPENSSH\s+|DSA\s+)?PRIVATE\s+KEY-----/gi, meta: TOKEN_PATTERNS[6] },
  // Generic secret prefixes: use longer, more specific prefixes that include the assignment
  // operator to avoid matching the thousands of times "api_key" appears in code discussions
  // without an actual value assignment. The regex is only run on a small window.
  { prefix: 'api_key=', regex: /(?:api[_-]?key|api[_-]?secret|secret[_-]?key|access[_-]?token|auth[_-]?token)\s*[:=]\s*["']([a-zA-Z0-9_\-+/=]{20,})["']/gi, meta: TOKEN_PATTERNS[8] },
  { prefix: 'api_key:', regex: /(?:api[_-]?key|api[_-]?secret|secret[_-]?key|access[_-]?token|auth[_-]?token)\s*[:=]\s*["']([a-zA-Z0-9_\-+/=]{20,})["']/gi, meta: TOKEN_PATTERNS[8] },
  { prefix: 'api-key=', regex: /(?:api[_-]?key|api[_-]?secret|secret[_-]?key|access[_-]?token|auth[_-]?token)\s*[:=]\s*["']([a-zA-Z0-9_\-+/=]{20,})["']/gi, meta: TOKEN_PATTERNS[8] },
  { prefix: 'api-key:', regex: /(?:api[_-]?key|api[_-]?secret|secret[_-]?key|access[_-]?token|auth[_-]?token)\s*[:=]\s*["']([a-zA-Z0-9_\-+/=]{20,})["']/gi, meta: TOKEN_PATTERNS[8] },
  { prefix: 'api_secret=', regex: /(?:api[_-]?key|api[_-]?secret|secret[_-]?key|access[_-]?token|auth[_-]?token)\s*[:=]\s*["']([a-zA-Z0-9_\-+/=]{20,})["']/gi, meta: TOKEN_PATTERNS[8] },
  { prefix: 'api_secret:', regex: /(?:api[_-]?key|api[_-]?secret|secret[_-]?key|access[_-]?token|auth[_-]?token)\s*[:=]\s*["']([a-zA-Z0-9_\-+/=]{20,})["']/gi, meta: TOKEN_PATTERNS[8] },
  { prefix: 'api-secret=', regex: /(?:api[_-]?key|api[_-]?secret|secret[_-]?key|access[_-]?token|auth[_-]?token)\s*[:=]\s*["']([a-zA-Z0-9_\-+/=]{20,})["']/gi, meta: TOKEN_PATTERNS[8] },
  { prefix: 'api-secret:', regex: /(?:api[_-]?key|api[_-]?secret|secret[_-]?key|access[_-]?token|auth[_-]?token)\s*[:=]\s*["']([a-zA-Z0-9_\-+/=]{20,})["']/gi, meta: TOKEN_PATTERNS[8] },
  { prefix: 'secret_key=', regex: /(?:api[_-]?key|api[_-]?secret|secret[_-]?key|access[_-]?token|auth[_-]?token)\s*[:=]\s*["']([a-zA-Z0-9_\-+/=]{20,})["']/gi, meta: TOKEN_PATTERNS[8] },
  { prefix: 'secret_key:', regex: /(?:api[_-]?key|api[_-]?secret|secret[_-]?key|access[_-]?token|auth[_-]?token)\s*[:=]\s*["']([a-zA-Z0-9_\-+/=]{20,})["']/gi, meta: TOKEN_PATTERNS[8] },
  { prefix: 'secret-key=', regex: /(?:api[_-]?key|api[_-]?secret|secret[_-]?key|access[_-]?token|auth[_-]?token)\s*[:=]\s*["']([a-zA-Z0-9_\-+/=]{20,})["']/gi, meta: TOKEN_PATTERNS[8] },
  { prefix: 'secret-key:', regex: /(?:api[_-]?key|api[_-]?secret|secret[_-]?key|access[_-]?token|auth[_-]?token)\s*[:=]\s*["']([a-zA-Z0-9_\-+/=]{20,})["']/gi, meta: TOKEN_PATTERNS[8] },
  { prefix: 'access_token=', regex: /(?:api[_-]?key|api[_-]?secret|secret[_-]?key|access[_-]?token|auth[_-]?token)\s*[:=]\s*["']([a-zA-Z0-9_\-+/=]{20,})["']/gi, meta: TOKEN_PATTERNS[8] },
  { prefix: 'access_token:', regex: /(?:api[_-]?key|api[_-]?secret|secret[_-]?key|access[_-]?token|auth[_-]?token)\s*[:=]\s*["']([a-zA-Z0-9_\-+/=]{20,})["']/gi, meta: TOKEN_PATTERNS[8] },
  { prefix: 'access-token=', regex: /(?:api[_-]?key|api[_-]?secret|secret[_-]?key|access[_-]?token|auth[_-]?token)\s*[:=]\s*["']([a-zA-Z0-9_\-+/=]{20,})["']/gi, meta: TOKEN_PATTERNS[8] },
  { prefix: 'access-token:', regex: /(?:api[_-]?key|api[_-]?secret|secret[_-]?key|access[_-]?token|auth[_-]?token)\s*[:=]\s*["']([a-zA-Z0-9_\-+/=]{20,})["']/gi, meta: TOKEN_PATTERNS[8] },
  { prefix: 'auth_token=', regex: /(?:api[_-]?key|api[_-]?secret|secret[_-]?key|access[_-]?token|auth[_-]?token)\s*[:=]\s*["']([a-zA-Z0-9_\-+/=]{20,})["']/gi, meta: TOKEN_PATTERNS[8] },
  { prefix: 'auth_token:', regex: /(?:api[_-]?key|api[_-]?secret|secret[_-]?key|access[_-]?token|auth[_-]?token)\s*[:=]\s*["']([a-zA-Z0-9_\-+/=]{20,})["']/gi, meta: TOKEN_PATTERNS[8] },
  { prefix: 'auth-token=', regex: /(?:api[_-]?key|api[_-]?secret|secret[_-]?key|access[_-]?token|auth[_-]?token)\s*[:=]\s*["']([a-zA-Z0-9_\-+/=]{20,})["']/gi, meta: TOKEN_PATTERNS[8] },
  { prefix: 'auth-token:', regex: /(?:api[_-]?key|api[_-]?secret|secret[_-]?key|access[_-]?token|auth[_-]?token)\s*[:=]\s*["']([a-zA-Z0-9_\-+/=]{20,})["']/gi, meta: TOKEN_PATTERNS[8] },
  // JWT: placed last because 'eyJ' is extremely common in base64 content.
  // Only checked on lines < LARGE_LINE_THRESHOLD (same as generic_secret rules).
  { prefix: 'eyJ', regex: /\beyJ[a-zA-Z0-9_-]{10,}\.eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g, meta: TOKEN_PATTERNS[7] },
];

// For lines > this threshold, only check high-value specific prefixes
// (skip generic_secret and JWT patterns whose prefixes are extremely common)
const LARGE_LINE_THRESHOLD = 50_000; // 50KB

// First 9 rules are high-value specific patterns (sk-ant, gh*, JIRA, AKIA, BEGIN)
const HIGH_VALUE_RULE_COUNT = 9;

/**
 * Scan a line using windowed approach: indexOf to find prefix positions,
 * then regex on small windows. Returns matched tokens with their metadata.
 */
function scanLineWindowed(line: string): Array<{ token: string; meta: TokenPattern }> {
  const results: Array<{ token: string; meta: TokenPattern }> = [];
  const seen = new Set<string>(); // deduplicate tokens found via overlapping windows

  // For large lines, skip generic_secret rules (their prefixes are too common in code)
  const rulesToCheck = line.length > LARGE_LINE_THRESHOLD
    ? SCAN_RULES.slice(0, HIGH_VALUE_RULE_COUNT)
    : SCAN_RULES;

  for (const rule of rulesToCheck) {
    let searchFrom = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const idx = line.indexOf(rule.prefix, searchFrom);
      if (idx === -1) break;

      // Extract a window around the hit
      const windowStart = Math.max(0, idx - 50); // small lookbehind for context
      const windowEnd = Math.min(line.length, idx + WINDOW_SIZE);
      const window = line.substring(windowStart, windowEnd);

      // Run regex on the small window
      rule.regex.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = rule.regex.exec(window)) !== null) {
        const token = match[0];
        if (!seen.has(token) && !shouldExclude(token)) {
          seen.add(token);
          results.push({ token, meta: rule.meta });
        }
      }

      searchFrom = idx + rule.prefix.length;
    }
  }

  return results;
}

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
 * Extract a simple project name from an encoded directory name without filesystem calls.
 * Takes the last segment after splitting by hyphens.
 * e.g., "-Users-cameronfleet-dev-personal-tools" -> "personal-tools"
 * Note: This may not be perfectly accurate for hyphenated folder names, but is acceptable for UI display.
 */
function getSimpleProjectName(encodedDir: string): string {
  // Remove leading dash and get segments
  const segments = encodedDir.replace(/^-/, '').split('-');
  // Return last segment, or the original if empty
  return segments[segments.length - 1] || encodedDir;
}

/**
 * Parse a single .jsonl conversation file and scan for tokens.
 * Optimized: uses windowed scanning (indexOf + small regex windows) to avoid
 * running regex across entire multi-MB JSONL lines. JSON.parse only on match.
 */
async function parseConversationForScan(
  jsonlPath: string,
  encodedProjectDir: string,
  projectName: string,
  sessionId: string
): Promise<TokenMatch[]> {
  const matches: TokenMatch[] = [];
  let idCounter = 0;

  try {
    const fileStream = createReadStream(jsonlPath);
    const rl = createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    const context: TokenMatch['location'] = {
      source: 'discussion',
      encodedProjectDir,
      projectName,
      sessionId,
      filePath: jsonlPath,
    };

    for await (const line of rl) {
      if (!line) continue;

      const hits = scanLineWindowed(line);
      if (hits.length === 0) continue;

      // Lazy JSON.parse: only when we actually have matches (very rare)
      let parsedMessage: Record<string, unknown>;
      try {
        parsedMessage = JSON.parse(line);
      } catch {
        continue; // Malformed line
      }

      // Only report tokens from user/assistant messages
      const msgType = parsedMessage.type as string;
      if (msgType !== 'user' && msgType !== 'assistant') continue;

      for (const hit of hits) {
        matches.push({
          id: `token-${Date.now()}-${++idCounter}`,
          type: hit.meta.type,
          severity: hit.meta.severity,
          description: hit.meta.description,
          remediation: hit.meta.remediation,
          redactedValue: redactToken(hit.token, hit.meta.type),
          fullPattern: hit.token,
          location: context,
        });
      }
    }
  } catch (err) {
    console.error(`Error scanning ${jsonlPath}:`, err);
  }

  return matches;
}


/**
 * Scan all discussions in a project directory.
 * Uses lazy path decoding - stores encoded directory name and derives a simple project name
 * without expensive filesystem calls. Full path decoding happens only when user clicks a link.
 */
async function scanProjectDiscussions(projectDir: string): Promise<TokenMatch[]> {
  try {
    const encodedProjectDir = path.basename(projectDir);
    const projectName = getSimpleProjectName(encodedProjectDir);

    const entries = await fs.readdir(projectDir, { withFileTypes: true });
    const jsonlFiles = entries.filter(e => e.isFile() && e.name.endsWith('.jsonl'));
    const projectStart = Date.now();

    // Parallelize file scanning within each project (batches of 10)
    const allMatches: TokenMatch[] = [];
    const fileBatchSize = 10;
    for (let i = 0; i < jsonlFiles.length; i += fileBatchSize) {
      const batch = jsonlFiles.slice(i, i + fileBatchSize);
      const batchResults = await Promise.all(
        batch.map(entry => {
          const sessionId = entry.name.replace('.jsonl', '');
          const jsonlPath = path.join(projectDir, entry.name);
          return parseConversationForScan(jsonlPath, encodedProjectDir, projectName, sessionId);
        })
      );
      for (const matches of batchResults) {
        allMatches.push(...matches);
      }
    }

    const projectMs = Date.now() - projectStart;
    if (projectMs > 500) {
      console.log(`[scan] ${projectName}: ${jsonlFiles.length} files in ${projectMs}ms (${allMatches.length} matches)`);
    }

    return allMatches;
  } catch (err) {
    console.error(`Error scanning project discussions in ${projectDir}:`, err);
    return [];
  }
}

/**
 * Scan all discussions in all projects (slow, asynchronous)
 */
async function scanAllDiscussions(): Promise<{ matches: TokenMatch[], discussionCount: number }> {
  const allMatches: TokenMatch[] = [];
  let discussionCount = 0;
  const scanStart = Date.now();

  try {
    const projectsDir = path.join(USER_CLAUDE_DIR, 'projects');
    const projectDirs = await fs.readdir(projectsDir, { withFileTypes: true });
    const dirs = projectDirs.filter(entry => entry.isDirectory());
    console.log(`[scan] Starting scan of ${dirs.length} projects...`);

    // Process in batches of 5 for memory efficiency
    const batchSize = 10;
    for (let i = 0; i < dirs.length; i += batchSize) {
      const batch = dirs.slice(i, i + batchSize);

      const batchResults = await Promise.all(
        batch.map(async (entry) => {
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

      // Progress log every 20 projects
      if ((i + batchSize) % 20 === 0 || i + batchSize >= dirs.length) {
        const elapsed = ((Date.now() - scanStart) / 1000).toFixed(1);
        console.log(`[scan] Progress: ${Math.min(i + batchSize, dirs.length)}/${dirs.length} projects (${elapsed}s elapsed, ${allMatches.length} matches so far)`);
      }
    }
  } catch (err) {
    console.error('Error scanning all discussions:', err);
  }

  const totalMs = Date.now() - scanStart;
  console.log(`[scan] Complete: ${discussionCount} files across ${totalMs}ms, ${allMatches.length} total matches`);

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
