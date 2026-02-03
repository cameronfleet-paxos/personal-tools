import { NextResponse } from "next/server";
import type { SessionConversationResponse } from "@/types/settings";
import { parseFullConversation, findSessionProject } from "@/lib/discussions";

interface RouteParams {
  params: Promise<{ sessionId: string }>;
}

export async function GET(
  request: Request,
  context: RouteParams
): Promise<NextResponse<SessionConversationResponse>> {
  const { searchParams } = new URL(request.url);
  const { sessionId } = await context.params;

  // Get project path from query param, or try to find it
  let projectPath = searchParams.get("project");

  console.log('[Discussion API] sessionId:', sessionId);
  console.log('[Discussion API] projectPath from query:', projectPath);
  console.log('[Discussion API] Route timestamp:', new Date().toISOString());

  if (!projectPath) {
    // Try to find which project this session belongs to
    projectPath = await findSessionProject(sessionId);
    console.log('[Discussion API] projectPath from search:', projectPath);

    if (!projectPath) {
      console.error('[Discussion API] Session not found:', sessionId);
      return NextResponse.json({
        conversation: null,
        error: "Session not found",
      });
    }
  }

  console.log('[Discussion API] Attempting to parse conversation with projectPath:', projectPath);
  const conversation = await parseFullConversation(sessionId, projectPath);

  if (!conversation) {
    console.error('[Discussion API] Failed to parse conversation. sessionId:', sessionId, 'projectPath:', projectPath);
    return NextResponse.json({
      conversation: null,
      error: "Failed to parse conversation",
    });
  }

  return NextResponse.json({ conversation });
}
