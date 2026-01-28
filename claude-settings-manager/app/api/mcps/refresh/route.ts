import { NextResponse } from "next/server";
import { scanMCPsAsync, updateIndexMCPs } from "@/lib/indexer";
import type { MCPRefreshResponse } from "@/types/settings";

// POST - Async MCP refresh (performs the slow MCP scan)
export async function POST(): Promise<NextResponse<MCPRefreshResponse>> {
  try {
    // Scan MCPs (this is the slow part - calls claude CLI)
    const mcps = await scanMCPsAsync();

    // Update the index with fresh MCP data
    await updateIndexMCPs(mcps);

    return NextResponse.json({
      success: true,
      mcps,
    });
  } catch (error) {
    console.error("Error refreshing MCPs:", error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
