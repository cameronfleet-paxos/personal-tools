import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { VitalsData, VitalMeasurement, emptyVitalsData } from '@/types/vitals';

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

function getVitalsPath(): string {
  return path.join(getDataDir(), 'vitals.json');
}

export async function GET() {
  try {
    await ensureDataDir();
    const vitalsPath = getVitalsPath();

    try {
      const data = await fs.readFile(vitalsPath, 'utf-8');
      const vitals: VitalsData = JSON.parse(data);
      return NextResponse.json(vitals);
    } catch {
      return NextResponse.json(emptyVitalsData);
    }
  } catch (error) {
    console.error('Failed to read vitals:', error);
    return NextResponse.json(emptyVitalsData);
  }
}

export async function POST(request: Request) {
  try {
    await ensureDataDir();
    const vitalsPath = getVitalsPath();

    const measurement: VitalMeasurement = await request.json();

    let vitals: VitalsData;
    try {
      const data = await fs.readFile(vitalsPath, 'utf-8');
      vitals = JSON.parse(data);
    } catch {
      vitals = { ...emptyVitalsData };
    }

    const existingIndex = vitals.measurements.findIndex(m => m.id === measurement.id);
    if (existingIndex >= 0) {
      vitals.measurements[existingIndex] = measurement;
    } else {
      vitals.measurements.push(measurement);
    }

    vitals.measurements.sort((a, b) => b.date.localeCompare(a.date));
    vitals.lastUpdated = new Date().toISOString();

    await fs.writeFile(vitalsPath, JSON.stringify(vitals, null, 2));
    return NextResponse.json({ success: true, vitals });
  } catch (error) {
    console.error('Failed to save vital:', error);
    return NextResponse.json({ error: 'Failed to save vital' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    await ensureDataDir();
    const vitalsPath = getVitalsPath();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Missing measurement ID' }, { status: 400 });
    }

    let vitals: VitalsData;
    try {
      const data = await fs.readFile(vitalsPath, 'utf-8');
      vitals = JSON.parse(data);
    } catch {
      return NextResponse.json({ error: 'Vitals data not found' }, { status: 404 });
    }

    const initialLength = vitals.measurements.length;
    vitals.measurements = vitals.measurements.filter(m => m.id !== id);

    if (vitals.measurements.length === initialLength) {
      return NextResponse.json({ error: 'Measurement not found' }, { status: 404 });
    }

    vitals.lastUpdated = new Date().toISOString();
    await fs.writeFile(vitalsPath, JSON.stringify(vitals, null, 2));

    return NextResponse.json({ success: true, vitals });
  } catch (error) {
    console.error('Failed to delete vital:', error);
    return NextResponse.json({ error: 'Failed to delete vital' }, { status: 500 });
  }
}
