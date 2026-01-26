import { NextResponse } from "next/server";
import type {
  PermissionTimeFilter,
  PermissionInterruptionsResponse,
} from "@/types/settings";
import {
  getPermissionInterruptions,
  addPatternToUserAllowList,
  dismissPattern,
  resetDismissedPatterns,
} from "@/lib/permission-interruptions";

export async function GET(
  request: Request
): Promise<NextResponse<PermissionInterruptionsResponse>> {
  const { searchParams } = new URL(request.url);
  const filterParam = searchParams.get("filter");

  // Validate and default the filter
  let filter: PermissionTimeFilter = "week";
  if (filterParam === "day" || filterParam === "week" || filterParam === "month") {
    filter = filterParam;
  }

  const response = await getPermissionInterruptions(filter);
  return NextResponse.json(response);
}

interface AllowPatternRequest {
  pattern: string;
}

interface AllowPatternResponse {
  success: boolean;
  error?: string;
}

export async function POST(
  request: Request
): Promise<NextResponse<AllowPatternResponse>> {
  try {
    const body = (await request.json()) as AllowPatternRequest;
    const { pattern } = body;

    if (!pattern || typeof pattern !== "string") {
      return NextResponse.json({
        success: false,
        error: "pattern is required and must be a string",
      });
    }

    const result = await addPatternToUserAllowList(pattern);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    });
  }
}

interface DismissPatternRequest {
  pattern?: string;
  reset?: boolean;
}

interface DismissPatternResponse {
  success: boolean;
  error?: string;
}

export async function DELETE(
  request: Request
): Promise<NextResponse<DismissPatternResponse>> {
  try {
    const body = (await request.json()) as DismissPatternRequest;

    // Reset all dismissed patterns
    if (body.reset === true) {
      const result = await resetDismissedPatterns();
      return NextResponse.json(result);
    }

    // Dismiss a single pattern
    const { pattern } = body;
    if (!pattern || typeof pattern !== "string") {
      return NextResponse.json({
        success: false,
        error: "pattern is required and must be a string, or reset must be true",
      });
    }

    const result = await dismissPattern(pattern);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    });
  }
}
