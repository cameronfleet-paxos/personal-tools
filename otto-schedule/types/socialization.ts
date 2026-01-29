export interface SocializationItem {
  id: string;
  name: string;
  completed: boolean;
  completedAt?: string;
  notes?: string;
}

export interface SocializationCategory {
  id: string;
  name: string;
  items: SocializationItem[];
}

export interface SocializationData {
  categories: SocializationCategory[];
  lastUpdated: string;
}

export const emptySocializationData: SocializationData = {
  categories: [],
  lastUpdated: new Date().toISOString(),
};
