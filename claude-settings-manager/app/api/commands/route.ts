import { NextRequest, NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";
import { getGlobalClaudeDir } from "@/lib/indexer";

interface DeleteResponse {
  success: boolean;
  error?: string;
}

interface PromoteResponse {
  success: boolean;
  newPath?: string;
  error?: string;
}

interface PromoteRequest {
  action: "promote";
  filePath: string;
  type: "command" | "skill";
}

/**
 * DELETE /api/commands?path=/path/to/file.md
 * Deletes a command or skill file from disk
 */
export async function DELETE(
  request: NextRequest
): Promise<NextResponse<DeleteResponse>> {
  try {
    const filePath = request.nextUrl.searchParams.get("path");

    if (!filePath) {
      return NextResponse.json(
        { success: false, error: "Missing path parameter" },
        { status: 400 }
      );
    }

    // Security: ensure the path is within a .claude directory
    if (!filePath.includes("/.claude/")) {
      return NextResponse.json(
        { success: false, error: "Invalid path: must be within a .claude directory" },
        { status: 400 }
      );
    }

    // Security: ensure it's a .md file
    if (!filePath.endsWith(".md")) {
      return NextResponse.json(
        { success: false, error: "Invalid path: must be a .md file" },
        { status: 400 }
      );
    }

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return NextResponse.json(
        { success: false, error: "File not found" },
        { status: 404 }
      );
    }

    // Delete the file
    fs.unlinkSync(filePath);

    // For skills, also try to remove the parent directory if empty
    const parentDir = path.dirname(filePath);
    if (path.basename(filePath) === "SKILL.md") {
      try {
        const remaining = fs.readdirSync(parentDir);
        if (remaining.length === 0) {
          fs.rmdirSync(parentDir);
        }
      } catch {
        // Ignore errors when cleaning up directory
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting command:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/commands
 * Promote a project command/skill to user level
 * Body: { action: "promote", filePath: string, type: "command" | "skill" }
 */
export async function POST(
  request: NextRequest
): Promise<NextResponse<PromoteResponse>> {
  try {
    const body = (await request.json()) as PromoteRequest;

    if (body.action !== "promote") {
      return NextResponse.json(
        { success: false, error: "Invalid action" },
        { status: 400 }
      );
    }

    const { filePath, type } = body;

    if (!filePath || !type) {
      return NextResponse.json(
        { success: false, error: "Missing filePath or type" },
        { status: 400 }
      );
    }

    // Security: ensure the path is within a .claude directory
    if (!filePath.includes("/.claude/")) {
      return NextResponse.json(
        { success: false, error: "Invalid path: must be within a .claude directory" },
        { status: 400 }
      );
    }

    // Check if source file exists
    if (!fs.existsSync(filePath)) {
      return NextResponse.json(
        { success: false, error: "Source file not found" },
        { status: 404 }
      );
    }

    // Find the .claude directory in the path
    const claudeIndex = filePath.indexOf("/.claude/");
    if (claudeIndex === -1) {
      return NextResponse.json(
        { success: false, error: "Could not find .claude in path" },
        { status: 400 }
      );
    }

    // Get the relative path after .claude/commands/ or .claude/skills/
    const afterClaude = filePath.substring(claudeIndex + "/.claude/".length);
    const typeDir = type === "skill" ? "skills" : "commands";

    // Verify the file is in the expected directory type
    if (!afterClaude.startsWith(typeDir + "/")) {
      return NextResponse.json(
        { success: false, error: `File is not in ${typeDir}/ directory` },
        { status: 400 }
      );
    }

    // Get the relative path within the type directory
    const relativePath = afterClaude.substring(typeDir.length + 1);

    // Build the destination path in ~/.claude/
    const globalClaudeDir = getGlobalClaudeDir();
    const destPath = path.join(globalClaudeDir, typeDir, relativePath);
    const destDir = path.dirname(destPath);

    // Create destination directory if needed
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    // Check if destination already exists
    if (fs.existsSync(destPath)) {
      return NextResponse.json(
        { success: false, error: "A user-level command/skill with this name already exists" },
        { status: 409 }
      );
    }

    // Copy the file
    const content = fs.readFileSync(filePath, "utf-8");
    fs.writeFileSync(destPath, content, "utf-8");

    return NextResponse.json({ success: true, newPath: destPath });
  } catch (error) {
    console.error("Error promoting command:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
