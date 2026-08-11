export interface Account {
  id: string;
  nickname: string;
  email?: string;
  password?: string;
  profilePath: string;
  sessionStatus: 'connected' | 'disconnected' | 'expired';
  createdAt: string;
  updatedAt: string;
  lastUsedAt?: string | null;
  username?: string | null;
  avatarUrl?: string | null;
}

export interface Board {
  id: string;
  accountId: string;
  name: string;
  url: string;
  lastFetchedAt: string;
}

export interface Draft {
  id: string;
  title: string;
  description: string;
  destinationUrl: string;
  altText: string;
  notes: string;
  imagePath: string;
  /** Optional AI-generated image prompt */
  imagePrompt?: string;
  accountId?: string | null;
  boardName?: string | null;
  boardUrl?: string | null;
  scheduledDate?: string | null;
  scheduledTime?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface QueueJob {
  id: string;
  accountId: string;
  boardName: string;
  boardUrl: string;
  imagePath: string;
  /** Optional AI-generated image prompt */
  imagePrompt?: string;
  title: string;
  description: string;
  destinationUrl: string;
  altText: string;
  notes: string;
  // import { WebContents } from 'electron'; // unused
  status: 'pending' | 'running' | 'completed' | 'failed' | 'paused' | 'scheduled';
  errorMessage?: string | null;
  screenshotPath?: string | null;
  livePinUrl?: string | null;
  scheduledDate?: string | null;
  scheduledTime?: string | null;
  createdAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
}

export interface Log {
  id?: number;
  level: 'info' | 'warn' | 'error';
  message: string;
  context?: string | null;
  createdAt: string;
}

export interface Setting {
  key: string;
  value: string;
}

export interface QueueProgressData {
  jobId: string;
  status: QueueJob['status'];
  progress: number;
  message: string;
  errorMessage?: string;
  completedCount: number;
  failedCount: number;
  totalCount: number;
}

export interface BrowserStatusData {
  accountId: string;
  isOpen: boolean;
  message: string;
}

export interface LogFilters {
  level?: Log['level'];
  search?: string;
}

export interface AnalyticsSnapshot {
  id: string;
  accountId: string;
  followers: number;
  monthlyViews: number;
  impressions: number;
  engagements: number;
  outboundClicks: number;
  saves: number;
  followersRaw?: string;
  monthlyViewsRaw?: string;
  timestamp: string;
  snapshotDate: string;
}

