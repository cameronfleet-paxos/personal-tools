import { NextResponse } from "next/server";
import type { DiscussionsResponse } from "@/types/settings";
import { scanAllSessions } from "@/lib/discussions";

export async function GET(
  request: Request
): Promise<NextResponse<DiscussionsResponse>> {
  const { searchParams } = new URL(request.url);
  const limitParam = searchParams.get("limit");

  // Parse and validate limit (default 50, max 200)
  let limit = 50;
  if (limitParam) {
    const parsed = parseInt(limitParam, 10);
    if (!isNaN(parsed) && parsed > 0) {
      limit = Math.min(parsed, 200);
    }
  }

  const response = await scanAllSessions(limit);
  return NextResponse.json(response);
}
