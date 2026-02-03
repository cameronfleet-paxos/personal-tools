import { NextResponse } from "next/server";
import type {
  SecurityScanResponse,
  TokenMatch,
  ScanMetadata,
  SecurityRecommendation,
} from "@/types/settings";
import {
  scanSettingsForTokens,
  loadSecurityScanCache,
} from "@/lib/security-scanner";

// Import existing dangerous patterns scanner
import { GET as getSecurityRecommendations } from "@/app/api/security-recommendations/route";

/**
 * GET /api/security-scan
 * Fast response: scan settings (sync) + load cached discussion tokens
 */
export async function GET(): Promise<NextResponse<SecurityScanResponse>> {
  try {
    // 1. Scan settings for tokens (fast, synchronous)
    const settingsTokens = await scanSettingsForTokens();

    // 2. Load cached discussion tokens
    const cache = await loadSecurityScanCache();
    const discussionTokens: TokenMatch[] = cache.tokens || [];

    // 3. Build scan metadata from cache
    const scanMetadata: ScanMetadata = {
      lastScanTimestamp: cache.lastScanTimestamp,
      lastScanDuration: cache.lastScanDuration,
      scanStatus: cache.scanStatus,
      scanError: cache.scanError,
      scannedSources: cache.scannedSources,
    };

    // 4. Get existing dangerous patterns (from existing API)
    const securityRecommendationsResponse = await getSecurityRecommendations();
    const securityData = await securityRecommendationsResponse.json();
    const settingsIssues: SecurityRecommendation[] = securityData.recommendations || [];

    return NextResponse.json({
      settingsTokens,
      discussionTokens,
      scanMetadata,
      settingsIssues,
    });
  } catch (err) {
    console.error('Error in GET /api/security-scan:', err);

    // Return empty response on error
    return NextResponse.json({
      settingsTokens: [],
      discussionTokens: [],
      scanMetadata: {
        lastScanTimestamp: null,
        lastScanDuration: null,
        scanStatus: 'error',
        scanError: err instanceof Error ? err.message : 'Unknown error',
        scannedSources: {
          settingsScanned: false,
          discussionsScanned: false,
          discussionCount: 0,
        },
      },
      settingsIssues: [],
    });
  }
}
