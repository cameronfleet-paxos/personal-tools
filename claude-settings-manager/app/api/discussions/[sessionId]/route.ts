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

  if (!projectPath) {
    // Try to find which project this session belongs to
    projectPath = await findSessionProject(sessionId);

    if (!projectPath) {
      return NextResponse.json({
        conversation: null,
        error: "Session not found",
      });
    }
  }

  const conversation = await parseFullConversation(sessionId, projectPath);

  if (!conversation) {
    return NextResponse.json({
      conversation: null,
      error: "Failed to parse conversation",
    });
  }

  return NextResponse.json({ conversation });
}
