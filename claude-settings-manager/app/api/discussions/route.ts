import { NextResponse } from "next/server";
import type { DiscussionsResponse } from "@/types/settings";
import { getOrBuildIndex, rebuildIndex, queryIndex } from "@/lib/discussions-index";

export async function GET(
  request: Request
): Promise<NextResponse<DiscussionsResponse>> {
  const { searchParams } = new URL(request.url);

  const search = searchParams.get("search") || "";
  const project = searchParams.get("project") || "all";
  const rebuild = searchParams.get("rebuild") === "true";

  // Parse limit (default 50, max 500)
  let limit = 50;
  const limitParam = searchParams.get("limit");
  if (limitParam) {
    const parsed = parseInt(limitParam, 10);
    if (!isNaN(parsed) && parsed > 0) {
      limit = Math.min(parsed, 500);
    }
  }

  // Parse offset (default 0)
  let offset = 0;
  const offsetParam = searchParams.get("offset");
  if (offsetParam) {
    const parsed = parseInt(offsetParam, 10);
    if (!isNaN(parsed) && parsed >= 0) {
      offset = parsed;
    }
  }

  const index = rebuild ? await rebuildIndex() : await getOrBuildIndex();
  const result = queryIndex(index, { search, project, limit, offset });

  return NextResponse.json(result);
}
