import type { Lang } from '@sprout/schema';

export type TtsProvider = 'auto' | 'macos-say' | 'none';

export interface SystemSettings {
  familyName: string;
  ttsProvider: TtsProvider;
  ttsVoices: Record<Lang, string>;
  serverUrlHint: string;
}

export interface TtsStatus {
  available: boolean;
  provider: string;
  voices: Record<Lang, string[]>;
}

export interface HealthStatus {
  ok: boolean;
  version: string;
  time: string;
}
