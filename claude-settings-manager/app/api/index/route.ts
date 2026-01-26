import { NextResponse } from "next/server";
import type { IndexResponse, ReindexResponse } from "@/types/settings";
import { getOrCreateIndex, reindex, refreshIndex } from "@/lib/indexer";

export async function GET(): Promise<NextResponse<IndexResponse>> {
  try {
    const { index, isFirstRun } = await getOrCreateIndex();

    return NextResponse.json({
      index,
      isFirstRun,
    });
  } catch (error) {
    console.error("Error getting index:", error);
    return NextResponse.json({
      index: null,
      isFirstRun: false,
    });
  }
}

export async function POST(): Promise<NextResponse<ReindexResponse>> {
  const startTime = Date.now();

  try {
    const index = await reindex();
    const duration = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      index,
      duration,
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error("Error during reindex:", error);

    return NextResponse.json({
      success: false,
      index: { lastIndexed: new Date().toISOString(), locations: [] },
      duration,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

export async function PUT(): Promise<NextResponse<ReindexResponse>> {
  const startTime = Date.now();

  try {
    const index = await refreshIndex();
    const duration = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      index,
      duration,
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error("Error during refresh:", error);

    return NextResponse.json({
      success: false,
      index: { lastIndexed: new Date().toISOString(), locations: [] },
      duration,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
