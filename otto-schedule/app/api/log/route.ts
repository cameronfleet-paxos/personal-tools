import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { DailyLog } from '@/types/schedule';

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

async function ensureLogsDir(): Promise<void> {
  const logsDir = getLogsDir();
  try {
    await fs.access(logsDir);
  } catch {
    await fs.mkdir(logsDir, { recursive: true });
  }
}

function getTodayDate(): string {
  return new Date().toISOString().split('T')[0];
}

function getLogPath(date: string): string {
  return path.join(getLogsDir(), `${date}.json`);
}

export async function GET() {
  try {
    await ensureLogsDir();
    const today = getTodayDate();
    const logPath = getLogPath(today);

    try {
      const data = await fs.readFile(logPath, 'utf-8');
      const log: DailyLog = JSON.parse(data);
      return NextResponse.json(log);
    } catch {
      // No log for today yet, return empty log
      const emptyLog: DailyLog = {
        date: today,
        completedItems: [],
      };
      return NextResponse.json(emptyLog);
    }
  } catch (error) {
    console.error('Failed to read log:', error);
    const today = getTodayDate();
    return NextResponse.json({
      date: today,
      completedItems: [],
    });
  }
}

export async function POST(request: Request) {
  try {
    await ensureLogsDir();
    const log: DailyLog = await request.json();
    const logPath = getLogPath(log.date);

    await fs.writeFile(logPath, JSON.stringify(log, null, 2));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to save log:', error);
    return NextResponse.json({ error: 'Failed to save log' }, { status: 500 });
  }
}
