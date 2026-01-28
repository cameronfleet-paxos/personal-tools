import { NextResponse } from "next/server";
import * as fs from "fs/promises";
import * as path from "path";
import { loadIndex, refreshIndex } from "@/lib/indexer";
import type {
  MCPServerEntry,
  MCPConfigFile,
  MCPsResponse,
  SaveMCPRequest,
  SaveMCPResponse,
  DeleteMCPRequest,
  DeleteMCPResponse,
} from "@/types/settings";

const HOME = process.env.HOME || process.env.USERPROFILE || "";
const USER_CLAUDE_DIR = path.join(HOME, ".claude");

function getUserMCPPath(): string {
  return path.join(USER_CLAUDE_DIR, ".mcp.json");
}

function getProjectMCPPath(projectPath: string): string {
  return path.join(projectPath, ".mcp.json");
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

async function writeJsonFile(
  filePath: string,
  data: unknown
): Promise<{ success: boolean; error?: string }> {
  try {
    // Create backup
    try {
      const existing = await fs.readFile(filePath, "utf-8");
      await fs.writeFile(`${filePath}.bak`, existing);
    } catch {
      // No existing file to backup
    }

    // Ensure directory exists
    await fs.mkdir(path.dirname(filePath), { recursive: true });

    // Write new content
    await fs.writeFile(filePath, JSON.stringify(data, null, 2) + "\n");
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

export async function GET(request: Request): Promise<NextResponse<MCPsResponse>> {
  const { searchParams } = new URL(request.url);
  const projectPath = searchParams.get("path");

  // Load from index (fast, already cached)
  const index = await loadIndex();
  const mcps = index?.mcps;

  // Combine enabled and available MCPs
  const servers: MCPServerEntry[] = [];

  if (mcps) {
    // Add enabled (user-configured) MCPs
    servers.push(...mcps.enabled);

    // Add available (plugin) MCPs
    servers.push(...mcps.available);
  }

  // If in project context, also load project-specific MCPs
  if (projectPath) {
    const projectMCPPath = getProjectMCPPath(projectPath);
    const projectMCPs = await readJsonFile<MCPConfigFile>(projectMCPPath);
    if (projectMCPs) {
      for (const [name, config] of Object.entries(projectMCPs)) {
        servers.push({ name, config, source: "project" });
      }
    }
  }

  return NextResponse.json({
    servers,
    health: mcps?.health || [],
  });
}

export async function PUT(
  request: Request
): Promise<NextResponse<SaveMCPResponse>> {
  const body = (await request.json()) as SaveMCPRequest;
  const { name, config, scope, projectPath } = body;

  if (!name || !config) {
    return NextResponse.json({
      success: false,
      error: "Name and config are required",
    });
  }

  const mcpPath = scope === "project" && projectPath
    ? getProjectMCPPath(projectPath)
    : getUserMCPPath();

  // Read existing config
  const existing = await readJsonFile<MCPConfigFile>(mcpPath) || {};

  // Add/update entry
  existing[name] = config;

  // Write back
  const result = await writeJsonFile(mcpPath, existing);

  if (!result.success) {
    return NextResponse.json({
      success: false,
      error: result.error,
    });
  }

  // Refresh index to update cached MCP data
  await refreshIndex();

  return NextResponse.json({ success: true });
}

export async function DELETE(
  request: Request
): Promise<NextResponse<DeleteMCPResponse>> {
  const body = (await request.json()) as DeleteMCPRequest;
  const { name, scope, projectPath } = body;

  if (!name) {
    return NextResponse.json({
      success: false,
      error: "Name is required",
    });
  }

  const mcpPath = scope === "project" && projectPath
    ? getProjectMCPPath(projectPath)
    : getUserMCPPath();

  // Read existing config
  const existing = await readJsonFile<MCPConfigFile>(mcpPath);
  if (!existing || !(name in existing)) {
    return NextResponse.json({
      success: false,
      error: "MCP server not found",
    });
  }

  // Remove entry
  delete existing[name];

  // Write back
  const result = await writeJsonFile(mcpPath, existing);

  if (!result.success) {
    return NextResponse.json({
      success: false,
      error: result.error,
    });
  }

  // Refresh index to update cached MCP data
  await refreshIndex();

  return NextResponse.json({ success: true });
}
