import type { Lang } from '@sprout/schema';

export interface TtsVoices {
  zh: string[];
  en: string[];
}

export interface TtsProviderStatus {
  available: boolean;
  voices: TtsVoices;
}

export interface TtsSynthesis {
  lang: Lang;
  text: string;
  voice: string;
  /** 由服务端分配的绝对路径，provider 必须写入 M4A，不播放声音。 */
  outputPath: string;
}

export interface TtsProvider {
  readonly id: string;
  status(): Promise<TtsProviderStatus>;
  synthesize(input: TtsSynthesis): Promise<void>;
  close?(): Promise<void>;
}

export interface TtsSettings {
  ttsProvider: 'auto' | 'macos-say' | 'none';
  /** 空字符串表示从已安装的对应语言声音中自动选择。 */
  ttsVoices: { zh: string; en: string };
}

export class TtsError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'TtsError';
  }
}

export const MAX_TTS_TEXT_LENGTH = 2000;

export function normalizeTtsText(text: string): string {
  if (typeof text !== 'string' || text.length > MAX_TTS_TEXT_LENGTH ||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(text)) {
    throw new TtsError(400, 'TTS_INVALID_INPUT', `朗读文本须为不含控制字符的字符串，最多 ${MAX_TTS_TEXT_LENGTH} 字符`);
  }
  const normalized = text.trim().replace(/\s+/gu, ' ');
  if (!normalized) throw new TtsError(400, 'TTS_INVALID_INPUT', '朗读文本不能为空');
  return normalized;
}
