import { NextResponse } from "next/server";
import type { ScanStatusResponse } from "@/types/settings";
import { loadSecurityScanCache } from "@/lib/security-scanner";

/**
 * GET /api/security-scan/status
 * Quick status check for polling
 */
export async function GET(): Promise<NextResponse<ScanStatusResponse>> {
  try {
    const cache = await loadSecurityScanCache();

    return NextResponse.json({
      scanStatus: cache.scanStatus,
      lastScanTimestamp: cache.lastScanTimestamp,
      scanError: cache.scanError,
      tokenCount: cache.tokens.length,
    });
  } catch (err) {
    console.error('Error loading scan status:', err);

    return NextResponse.json({
      scanStatus: 'error',
      lastScanTimestamp: null,
      scanError: err instanceof Error ? err.message : 'Unknown error',
      tokenCount: 0,
    });
  }
}
