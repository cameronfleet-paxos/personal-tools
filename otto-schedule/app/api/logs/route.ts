import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

// Get data directory - use app's userData in packaged app, or project data/ in dev
function getDataDir(): string {
  if (process.env.NODE_ENV === 'production') {
    const homeDir = process.env.HOME || process.env.USERPROFILE || '';
    return path.join(homeDir, '.otto-schedule');
  }
  return path.join(process.cwd(), 'data');
}

function getLogsDir(): string {
  return path.join(getDataDir(), 'logs');
}

export async function GET() {
  try {
    const logsDir = getLogsDir();

    try {
      await fs.access(logsDir);
    } catch {
      // No logs directory yet
      return NextResponse.json({ dates: [] });
    }

    const files = await fs.readdir(logsDir);

    // Filter for .json files and extract dates
    const dates = files
      .filter(file => file.endsWith('.json'))
      .map(file => file.replace('.json', ''))
      .filter(date => /^\d{4}-\d{2}-\d{2}$/.test(date)) // Validate date format
      .sort((a, b) => b.localeCompare(a)); // Sort newest first

    return NextResponse.json({ dates });
  } catch (error) {
    console.error('Failed to list logs:', error);
    return NextResponse.json({ dates: [] });
  }
}
