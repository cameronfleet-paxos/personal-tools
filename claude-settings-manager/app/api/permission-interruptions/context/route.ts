import { NextRequest, NextResponse } from "next/server";
import { extractConversationContext } from "@/lib/permission-interruptions";
import type { ToolExample } from "@/types/settings";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const toolName = searchParams.get("toolName");
  const sessionsParam = searchParams.get("sessions");

  if (!toolName || !sessionsParam) {
    return NextResponse.json(
      { error: "Missing toolName or sessions parameter" },
      { status: 400 }
    );
  }

  // Parse sessions: "sessionId:timestamp,sessionId:timestamp,..."
  const sessionPairs = sessionsParam.split(",").map((pair) => {
    const [sessionId, ts] = pair.split(":");
    return { sessionId, timestamp: parseInt(ts, 10) };
  });

  // Extract context for each session in parallel
  const results = await Promise.all(
    sessionPairs.map(async ({ sessionId, timestamp }) => {
      const context = await extractConversationContext(
        sessionId,
        timestamp,
        toolName
      );
      return context;
    })
  );

  const examples: ToolExample[] = results
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .map((context) => ({
      toolInput: context.toolInput,
      userPrompt: context.userPrompt,
      timestamp: context.timestamp,
    }))
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 3);

  return NextResponse.json({ examples });
}
