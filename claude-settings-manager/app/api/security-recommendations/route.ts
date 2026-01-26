import { NextResponse } from "next/server";
import * as fs from "fs/promises";
import * as path from "path";
import type {
  Settings,
  SecurityRecommendation,
  SecurityRecommendationsResponse,
  SecuritySeverity,
  SettingsTarget,
  FixSecurityRecommendationRequest,
  FixSecurityRecommendationResponse,
} from "@/types/settings";
import { loadIndex } from "@/lib/indexer";

const HOME = process.env.HOME || process.env.USERPROFILE || "";
const USER_CLAUDE_DIR = path.join(HOME, ".claude");

interface SecurityRule {
  pattern: RegExp;
  severity: SecuritySeverity;
  title: string;
  description: string;
  remediation: string;
}

// Dangerous allow patterns to check for
const DANGEROUS_ALLOW_PATTERNS: SecurityRule[] = [
  {
    pattern: /^Bash\(bash[:\s]\*\)$/i,
    severity: "critical",
    title: "Bash(bash:*) allows arbitrary execution",
    description: "This pattern allows Claude to execute any bash command without restriction, bypassing all security controls.",
    remediation: "Remove this pattern and use specific command patterns instead (e.g., Bash(git *), Bash(npm *))",
  },
  {
    pattern: /^Bash\(\*[:\s]\*\)$/i,
    severity: "critical",
    title: "Bash(*:*) allows all commands",
    description: "This wildcard pattern allows execution of any command, completely disabling permission controls.",
    remediation: "Remove this pattern and explicitly allow only the commands you need",
  },
  {
    pattern: /^Bash\(man[:\s]\*\)$/i,
    severity: "high",
    title: "Bash(man:*) exploitable via --html flag",
    description: "The man command with --html flag can execute arbitrary commands through browser invocation.",
    remediation: "Remove man from allows, or add 'Bash(man --html*)' to deny list",
  },
  {
    pattern: /^Bash\(sort[:\s]\*\)$/i,
    severity: "high",
    title: "Bash(sort:*) exploitable via --compress-program",
    description: "The sort command's --compress-program flag can execute arbitrary programs.",
    remediation: "Remove sort from allows, or deny sort with --compress-program flag",
  },
  {
    pattern: /^Bash\(sed[:\s]\*\)$/i,
    severity: "high",
    title: "Bash(sed:*) allows command execution",
    description: "Sed's 'e' modifier allows executing shell commands on pattern matches.",
    remediation: "Remove sed from allows - use the Edit tool instead for file modifications",
  },
  {
    pattern: /^Bash\(xargs[:\s]\*\)$/i,
    severity: "high",
    title: "Bash(xargs:*) has argument interpretation vulnerabilities",
    description: "Xargs can be exploited through crafted input to execute unintended commands.",
    remediation: "Remove xargs from allows or use more restrictive patterns",
  },
  {
    pattern: /^Bash\(history[:\s]\*\)$/i,
    severity: "high",
    title: "Bash(history:*) can write to shell config files",
    description: "History command with -s flag can inject commands into shell history and config files.",
    remediation: "Remove history from allows - it's rarely needed for legitimate operations",
  },
  {
    pattern: /^Bash\(rm\s+-rf\s+\*\)$/i,
    severity: "critical",
    title: "Bash(rm -rf *) allows destructive operations",
    description: "This pattern allows recursive force deletion of any files and directories.",
    remediation: "Remove this pattern - use more specific rm patterns or rely on sandbox restrictions",
  },
  {
    pattern: /^Bash\(curl[:\s]\*\)$/i,
    severity: "medium",
    title: "Bash(curl:*) allows arbitrary network requests",
    description: "Unrestricted curl access can exfiltrate data or download malicious content.",
    remediation: "Use sandbox network allowedHosts instead to control network access",
  },
  {
    pattern: /^Bash\(wget[:\s]\*\)$/i,
    severity: "medium",
    title: "Bash(wget:*) allows arbitrary network requests",
    description: "Unrestricted wget access can exfiltrate data or download malicious content.",
    remediation: "Use sandbox network allowedHosts instead to control network access",
  },
];

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

interface CheckPatternOptions {
  settings: Settings | null;
  scope: SettingsTarget;
  recommendations: SecurityRecommendation[];
  idCounter: { value: number };
  projectPath?: string;
  projectName?: string;
}

function checkAllowPatterns(options: CheckPatternOptions): void {
  const { settings, scope, recommendations, idCounter, projectPath, projectName } = options;
  if (!settings?.permissions?.allow) return;

  for (const allowPattern of settings.permissions.allow) {
    for (const rule of DANGEROUS_ALLOW_PATTERNS) {
      if (rule.pattern.test(allowPattern)) {
        recommendations.push({
          id: `sec-${++idCounter.value}`,
          severity: rule.severity,
          title: rule.title,
          description: rule.description,
          pattern: allowPattern,
          location: "allow",
          scope,
          projectPath,
          projectName,
          remediation: rule.remediation,
        });
        break; // Only match first rule per pattern
      }
    }
  }
}

export async function GET(): Promise<NextResponse<SecurityRecommendationsResponse>> {
  const recommendations: SecurityRecommendation[] = [];
  const checkedScopes: SettingsTarget[] = [];
  const idCounter = { value: 0 };

  // Load and check user settings
  const userSettingsPath = path.join(USER_CLAUDE_DIR, "settings.json");
  const userSettings = await readJsonFile<Settings>(userSettingsPath);

  if (userSettings) {
    checkedScopes.push("user");
    checkAllowPatterns({
      settings: userSettings,
      scope: "user",
      recommendations,
      idCounter,
    });
  }

  // Load the settings index to scan all projects
  const index = await loadIndex();
  if (index && index.locations.length > 0) {
    for (const location of index.locations) {
      // Skip user-level .claude directory (already checked above)
      if (location.path === USER_CLAUDE_DIR) {
        continue;
      }

      // Load project settings
      const settingsPath = path.join(location.path, "settings.json");
      const localSettingsPath = path.join(location.path, "settings.local.json");

      const [projectSettings, projectLocalSettings] = await Promise.all([
        readJsonFile<Settings>(settingsPath),
        readJsonFile<Settings>(localSettingsPath),
      ]);

      // Check project settings.json
      if (projectSettings) {
        if (!checkedScopes.includes("project")) {
          checkedScopes.push("project");
        }
        checkAllowPatterns({
          settings: projectSettings,
          scope: "project",
          recommendations,
          idCounter,
          projectPath: location.path,
          projectName: location.projectName,
        });
      }

      // Check project settings.local.json
      if (projectLocalSettings) {
        if (!checkedScopes.includes("project-local")) {
          checkedScopes.push("project-local");
        }
        checkAllowPatterns({
          settings: projectLocalSettings,
          scope: "project-local",
          recommendations,
          idCounter,
          projectPath: location.path,
          projectName: location.projectName,
        });
      }
    }
  }

  // Sort by severity (critical first, then high, then medium)
  const severityOrder: Record<SecuritySeverity, number> = {
    critical: 0,
    high: 1,
    medium: 2,
  };

  recommendations.sort((a, b) => {
    const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
    if (severityDiff !== 0) return severityDiff;
    return a.pattern.localeCompare(b.pattern);
  });

  return NextResponse.json({
    recommendations,
    checkedScopes,
  });
}

export async function POST(
  request: Request
): Promise<NextResponse<FixSecurityRecommendationResponse>> {
  try {
    const body = (await request.json()) as FixSecurityRecommendationRequest;
    const { pattern, scope, location, projectPath } = body;

    if (location !== "allow") {
      // For now, only support removing from allow list
      return NextResponse.json({
        success: false,
        error: "Only 'allow' location fixes are supported",
      });
    }

    // Determine which settings file to modify
    let settingsPath: string;
    if (scope === "user") {
      settingsPath = path.join(USER_CLAUDE_DIR, "settings.json");
    } else if (scope === "project" || scope === "project-local") {
      if (!projectPath) {
        return NextResponse.json({
          success: false,
          error: "projectPath is required for project scope fixes",
        });
      }
      const fileName = scope === "project-local" ? "settings.local.json" : "settings.json";
      settingsPath = path.join(projectPath, fileName);
    } else {
      return NextResponse.json({
        success: false,
        error: `Unknown scope: ${scope}`,
      });
    }

    // Load current settings
    const settings = await readJsonFile<Settings>(settingsPath);
    if (!settings) {
      return NextResponse.json({
        success: false,
        error: "Could not load settings file",
      });
    }

    // Remove the pattern from allow list
    if (settings.permissions?.allow) {
      const index = settings.permissions.allow.indexOf(pattern);
      if (index > -1) {
        settings.permissions.allow.splice(index, 1);

        // Clean up empty arrays
        if (settings.permissions.allow.length === 0) {
          delete settings.permissions.allow;
        }
        if (
          settings.permissions &&
          !settings.permissions.allow &&
          !settings.permissions.deny &&
          !settings.permissions.ask
        ) {
          delete settings.permissions;
        }

        await writeJsonFile(settingsPath, settings);

        return NextResponse.json({ success: true });
      }
    }

    return NextResponse.json({
      success: false,
      error: "Pattern not found in settings",
    });
  } catch (err) {
    return NextResponse.json({
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    });
  }
}
