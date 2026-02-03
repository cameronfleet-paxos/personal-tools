import { NextResponse } from "next/server";
import type { TriggerScanResponse } from "@/types/settings";
import {
  loadSecurityScanCache,
  saveSecurityScanCache,
  runBackgroundScan,
} from "@/lib/security-scanner";

/**
 * POST /api/security-scan/trigger
 * Start background scan (non-blocking)
 */
export async function POST(): Promise<NextResponse<TriggerScanResponse>> {
  try {
    // Check if scan is already running
    const cache = await loadSecurityScanCache();

    if (cache.scanStatus === 'running') {
      return NextResponse.json(
        {
          success: false,
          message: 'Scan already in progress',
        },
        { status: 409 }
      );
    }

    // Start background scan (fire and forget)
    runBackgroundScan().catch(err => {
      console.error('Background scan error:', err);
    });

    return NextResponse.json(
      {
        success: true,
        message: 'Background scan started',
      },
      { status: 202 }
    );
  } catch (err) {
    console.error('Error triggering background scan:', err);

    return NextResponse.json(
      {
        success: false,
        message: err instanceof Error ? err.message : 'Failed to start scan',
      },
      { status: 500 }
    );
  }
}
