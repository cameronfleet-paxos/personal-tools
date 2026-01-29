import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { SocializationData, emptySocializationData } from '@/types/socialization';
import { defaultSocializationCategories } from '@/lib/socialization-data';

function getDataDir(): string {
  if (process.env.NODE_ENV === 'production') {
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

function getSocializationPath(): string {
  return path.join(getDataDir(), 'socialization.json');
}

function getDefaultData(): SocializationData {
  return {
    categories: JSON.parse(JSON.stringify(defaultSocializationCategories)),
    lastUpdated: new Date().toISOString(),
  };
}

export async function GET() {
  try {
    await ensureDataDir();
    const socializationPath = getSocializationPath();

    try {
      const data = await fs.readFile(socializationPath, 'utf-8');
      const socialization: SocializationData = JSON.parse(data);
      return NextResponse.json(socialization);
    } catch {
      // Initialize with default data if file doesn't exist
      const defaultData = getDefaultData();
      await fs.writeFile(socializationPath, JSON.stringify(defaultData, null, 2));
      return NextResponse.json(defaultData);
    }
  } catch (error) {
    console.error('Failed to read socialization data:', error);
    return NextResponse.json(getDefaultData());
  }
}

export async function POST(request: Request) {
  try {
    await ensureDataDir();
    const socializationPath = getSocializationPath();

    const { categoryId, itemId, completed, notes } = await request.json();

    let socialization: SocializationData;
    try {
      const data = await fs.readFile(socializationPath, 'utf-8');
      socialization = JSON.parse(data);
    } catch {
      socialization = getDefaultData();
    }

    // Find and update the item
    const category = socialization.categories.find(c => c.id === categoryId);
    if (category) {
      const item = category.items.find(i => i.id === itemId);
      if (item) {
        if (completed !== undefined) {
          item.completed = completed;
          item.completedAt = completed ? new Date().toISOString() : undefined;
        }
        if (notes !== undefined) {
          item.notes = notes || undefined;
        }
      }
    }

    socialization.lastUpdated = new Date().toISOString();

    await fs.writeFile(socializationPath, JSON.stringify(socialization, null, 2));
    return NextResponse.json({ success: true, socialization });
  } catch (error) {
    console.error('Failed to save socialization:', error);
    return NextResponse.json({ error: 'Failed to save socialization' }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    await ensureDataDir();
    const socializationPath = getSocializationPath();

    // Reset to default data
    const defaultData = getDefaultData();
    await fs.writeFile(socializationPath, JSON.stringify(defaultData, null, 2));

    return NextResponse.json({ success: true, socialization: defaultData });
  } catch (error) {
    console.error('Failed to reset socialization:', error);
    return NextResponse.json({ error: 'Failed to reset socialization' }, { status: 500 });
  }
}
