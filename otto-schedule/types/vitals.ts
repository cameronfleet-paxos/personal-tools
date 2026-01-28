export interface VitalMeasurement {
  id: string;
  date: string;           // "2025-01-25" format
  recordedAt: string;     // ISO timestamp
  weight?: number;        // Weight in kg (e.g., 5.5)
  length?: number;        // Length in cm
  notes?: string;
}

export interface VitalsData {
  measurements: VitalMeasurement[];
  lastUpdated: string;
}

export const emptyVitalsData: VitalsData = {
  measurements: [],
  lastUpdated: new Date().toISOString(),
};
