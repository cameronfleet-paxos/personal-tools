export type Category = 'potty' | 'eat' | 'play' | 'nap' | 'wake';

export interface ScheduleItem {
  id: string;
  time: string;           // "06:30" format
  endTime?: string;       // "07:25" for ranges
  activity: string;       // "Wake up + Potty"
  category: Category;
}

export interface CompletedItem {
  itemId: string;
  completedAt: string;    // ISO timestamp
  actualTime: string;     // "07:30" format - when actually completed
  notes?: string;         // Optional notes about completion
}

export interface DailyLog {
  date: string;           // "2025-01-25"
  completedItems: CompletedItem[];
}

export const defaultSchedule: ScheduleItem[] = [
  { id: '1', time: '06:30', activity: 'Wake up + Potty', category: 'wake' },
  { id: '2', time: '06:40', activity: 'Eat 1', category: 'eat' },
  { id: '3', time: '07:00', activity: 'Potty', category: 'potty' },
  { id: '4', time: '07:05', endTime: '07:25', activity: 'Play/Train', category: 'play' },
  { id: '5', time: '07:35', endTime: '07:55', activity: 'Play/Train', category: 'play' },
  { id: '6', time: '07:55', activity: 'Potty', category: 'potty' },
  { id: '7', time: '08:00', activity: 'Nap', category: 'nap' },
  { id: '8', time: '10:00', activity: 'Wake + Potty', category: 'wake' },
  { id: '9', time: '10:05', activity: 'Eat 2', category: 'eat' },
  { id: '10', time: '10:10', endTime: '10:30', activity: 'Play/Train', category: 'play' },
  { id: '11', time: '10:30', activity: 'Potty', category: 'potty' },
  { id: '12', time: '10:35', endTime: '10:55', activity: 'Play/Train', category: 'play' },
  { id: '13', time: '11:00', endTime: '13:00', activity: 'Nap', category: 'nap' },
  { id: '14', time: '13:00', activity: 'Wake + Potty', category: 'wake' },
  { id: '15', time: '13:05', endTime: '13:25', activity: 'Play/Train', category: 'play' },
  { id: '16', time: '13:25', endTime: '13:30', activity: 'Eat 3', category: 'eat' },
  { id: '17', time: '13:35', endTime: '13:55', activity: 'Play/Train', category: 'play' },
  { id: '18', time: '13:55', activity: 'Potty', category: 'potty' },
  { id: '19', time: '14:00', activity: 'Nap', category: 'nap' },
  { id: '20', time: '16:00', activity: 'Wake + Potty', category: 'wake' },
  { id: '21', time: '16:05', endTime: '17:00', activity: 'Independent Play', category: 'play' },
  { id: '22', time: '17:00', activity: 'Potty', category: 'potty' },
  { id: '23', time: '17:00', endTime: '18:30', activity: 'Nap', category: 'nap' },
  { id: '24', time: '18:30', activity: 'Wake + Potty', category: 'wake' },
  { id: '25', time: '18:35', activity: 'Eat 4', category: 'eat' },
  { id: '26', time: '18:35', activity: 'Calm Play', category: 'play' },
];

export const categoryColors: Record<Category, { bg: string; border: string; text: string }> = {
  potty: { bg: 'bg-potty/20', border: 'border-potty', text: 'text-potty' },
  eat: { bg: 'bg-eat/20', border: 'border-eat', text: 'text-eat' },
  play: { bg: 'bg-play/20', border: 'border-play', text: 'text-play' },
  nap: { bg: 'bg-nap/20', border: 'border-nap', text: 'text-nap' },
  wake: { bg: 'bg-wake/20', border: 'border-wake', text: 'text-wake' },
};

export const categoryLabels: Record<Category, string> = {
  potty: 'Potty',
  eat: 'Eat',
  play: 'Play',
  nap: 'Nap',
  wake: 'Wake',
};
