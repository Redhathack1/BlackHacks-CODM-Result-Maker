
export interface ScoringSystem {
  pointsPerKill: number;
  rankPoints: number[]; // Index 0 = Rank 1, Index 1 = Rank 2, etc.
}

export interface ScoringPreset {
  id: string;
  name: string;
  system: ScoringSystem;
}

export interface Team {
  id: string;
  name: string;
  logo?: string; // Optional URL for logo
}

export interface TeamMatchResult {
  teamId: string;
  kills: number;
  place: number;
  totalPoints: number; // Calculated (Place Pts + Kill Pts)
}

export interface Match {
  id: string;
  matchNumber: number; // 1-10
  mapName?: string;
  screenshots: string[]; // URLs of uploaded images
  results: TeamMatchResult[];
  isCompleted: boolean;
}

export interface Penalty {
  id: string;
  teamId: string;
  points: number; // Can be negative (deduction) or positive (bonus)
  reason: string;
}

export type EventType = 'scrim' | 'tournament';

export interface DayData {
  id: string;
  dayNumber: number; // 1-10
  date?: string; // ISO Date String for Scrims/Tournaments
  teams?: Team[]; // Optional Daily Roster Override (Crucial for Scrims)
  matches: Match[];
  penalties: Penalty[];
}

export interface TournamentData {
  id: string;
  ownerId: string; // User ID who owns this tournament
  name: string;
  type: EventType;
  teams: Team[]; // Global roster (used as default or for Tournaments)
  scoring: ScoringSystem;
  days: DayData[];
  currentDay: number; // Acts as index for selected day in UI
}

export interface NewsItem {
  title: string;
  source: string;
  url: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
}

// --- Auth & License Types ---

export type UserRole = 'admin' | 'user';

export interface User {
  id: string;
  username: string;
  email: string;
  password: string; // In a real app, this would be hashed
  role: UserRole;
  licenseKey?: string;
  licenseExpiry?: number; // Timestamp
  lastActive?: number; // Timestamp
}

export type LicenseDuration = '1h' | '2h' | '3h' | '1d' | '3d' | '7d' | '14d' | '21d' | '1m' | '3m' | '6m' | '1y' | 'infinity';

export interface LicenseKey {
  code: string;
  durationLabel: LicenseDuration;
  durationMs: number | null; // null for infinity
  isUsed: boolean;
  usedByUserId?: string;
  usedByUsername?: string; // NEW: For cross-device identification
  isRevoked: boolean;
  createdAt: number;
}