import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { ScheduleItem, defaultSchedule } from '@/types/schedule';

// Get data directory - use app's userData in packaged app, or project data/ in dev
function getDataDir(): string {
  if (process.env.NODE_ENV === 'production') {
    // In packaged app, use a writable location
    const homeDir = process.env.HOME || process.env.USERPROFILE || '';
    return path.join(homeDir, '.otto-schedule');
  }
  return path.join(process.cwd(), 'data');
}

async function ensureDataDir(): Promise<void> {
  const dataDir = getDataDir();
  try {
    await fs.access(dataDir);
  } catch {
    await fs.mkdir(dataDir, { recursive: true });
  }
}

function getSchedulePath(): string {
  return path.join(getDataDir(), 'schedule.json');
}

export async function GET() {
  try {
    await ensureDataDir();
    const schedulePath = getSchedulePath();

    try {
      const data = await fs.readFile(schedulePath, 'utf-8');
      const schedule: ScheduleItem[] = JSON.parse(data);
      return NextResponse.json(schedule);
    } catch {
      // File doesn't exist, return default schedule
      // Also save the default schedule for future use
      await fs.writeFile(schedulePath, JSON.stringify(defaultSchedule, null, 2));
      return NextResponse.json(defaultSchedule);
    }
  } catch (error) {
    console.error('Failed to read schedule:', error);
    return NextResponse.json(defaultSchedule);
  }
}

export async function POST(request: Request) {
  try {
    await ensureDataDir();
    const schedule: ScheduleItem[] = await request.json();
    const schedulePath = getSchedulePath();

    await fs.writeFile(schedulePath, JSON.stringify(schedule, null, 2));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to save schedule:', error);
    return NextResponse.json({ error: 'Failed to save schedule' }, { status: 500 });
  }
}
