import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { access, rm, writeFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { promisify } from 'node:util';
import {
  normalizeTtsText, TtsError,
  type TtsProvider, type TtsProviderStatus, type TtsSynthesis, type TtsVoices,
} from './provider';

const SAY = '/usr/bin/say';
const AFCONVERT = '/usr/bin/afconvert';
const execFileAsync = promisify(execFile);

export type TtsCommandRunner = (
  command: string,
  args: string[],
  options: { timeout: number },
) => Promise<{ stdout: string }>;

export interface MacOsSayOptions {
  platform?: NodeJS.Platform;
  runCommand?: TtsCommandRunner;
  checkExecutable?: (path: string) => Promise<void>;
}

const runCommand: TtsCommandRunner = async (command, args, { timeout }) =>
  execFileAsync(command, args, {
    encoding: 'utf8',
    shell: false,
    timeout,
    killSignal: 'SIGKILL',
    maxBuffer: 1024 * 1024,
    windowsHide: true,
  });

function emptyStatus(): TtsProviderStatus {
  return { available: false, voices: { zh: [], en: [] } };
}

function copyStatus(status: TtsProviderStatus): TtsProviderStatus {
  return { available: status.available, voices: { zh: [...status.voices.zh], en: [...status.voices.en] } };
}

export class MacOsSayProvider implements TtsProvider {
  readonly id = 'macos-say';
  private readonly platform: NodeJS.Platform;
  private readonly run: TtsCommandRunner;
  private readonly checkExecutable: (path: string) => Promise<void>;
  private cached?: { status: TtsProviderStatus; expires: number };
  private probing?: Promise<TtsProviderStatus>;

  constructor(options: MacOsSayOptions = {}) {
    this.platform = options.platform ?? process.platform;
    this.run = options.runCommand ?? runCommand;
    this.checkExecutable = options.checkExecutable ?? ((path) => access(path, constants.X_OK));
  }

  async status(): Promise<TtsProviderStatus> {
    if (this.platform !== 'darwin') return emptyStatus();
    if (this.cached && this.cached.expires > Date.now()) return copyStatus(this.cached.status);
    if (!this.probing) {
      this.probing = this.probe().then((status) => {
        this.cached = { status, expires: Date.now() + (status.available ? 30_000 : 3_000) };
        return status;
      }).finally(() => { this.probing = undefined; });
    }
    return copyStatus(await this.probing);
  }

  private async probe(): Promise<TtsProviderStatus> {
    try {
      await this.checkExecutable(SAY);
      await this.checkExecutable(AFCONVERT);
      const { stdout } = await this.run(SAY, ['-v', '?'], { timeout: 5_000 });
      try {
        await this.run(AFCONVERT, ['-hf'], { timeout: 5_000 });
      } catch (cause) {
        // macOS 的格式帮助写入 stderr，正常列出格式时也可能以 2 退出。
        const error = cause as { code?: unknown; stdout?: string; stderr?: string };
        const help = `${error.stdout ?? ''}\n${error.stderr ?? ''}`;
        if (error.code !== 2 || !/\bm4af\b/u.test(help) || !/\baac\b/u.test(help)) throw cause;
      }
      const voices: TtsVoices = { zh: [], en: [] };
      for (const line of stdout.split(/\r?\n/u)) {
        const match = /^(.+?)\s+([a-z]{2,3}(?:[_-][a-z0-9]+)+)\s*(?:#.*)?$/iu.exec(line.trim());
        if (!match) continue;
        const voice = match[1].trim();
        const lang = match[2].split(/[_-]/u)[0].toLowerCase();
        if ((lang === 'zh' || lang === 'en') && voice && !voice.startsWith('-') &&
            !/[\u0000-\u001f\u007f]/u.test(voice) && !voices[lang].includes(voice)) {
          voices[lang].push(voice);
        }
      }
      return { available: voices.zh.length > 0 && voices.en.length > 0, voices };
    } catch {
      return emptyStatus();
    }
  }

  async synthesize({ lang, text, voice, outputPath }: TtsSynthesis): Promise<void> {
    text = normalizeTtsText(text);
    const status = await this.status();
    if (!status.available || (lang !== 'zh' && lang !== 'en') || !status.voices[lang].includes(voice)) {
      throw new TtsError(503, 'TTS_UNAVAILABLE', '本机朗读服务或所选语言声音不可用');
    }
    if (!isAbsolute(outputPath)) throw new TtsError(400, 'TTS_INVALID_INPUT', '音频输出须为绝对路径');

    const prefix = `${outputPath}.${randomUUID()}`;
    const textPath = `${prefix}.txt`;
    const aiffPath = `${prefix}.aiff`;
    try {
      // 文本不进入命令参数；同时禁用 say 的内嵌控制指令，避免任意长停顿等行为。
      await writeFile(textPath, text.replace(/\[(?=\[)/gu, '[ '), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
      await this.run(SAY, ['-v', voice, '-o', aiffPath, '-f', textPath], { timeout: 120_000 });
      await this.run(AFCONVERT, ['-f', 'm4af', '-d', 'aac', aiffPath, outputPath], { timeout: 30_000 });
    } catch (cause) {
      this.cached = undefined;
      const error = cause as NodeJS.ErrnoException & { killed?: boolean };
      if (error.code === 'ENOENT' || error.code === 'EACCES') {
        throw new TtsError(503, 'TTS_UNAVAILABLE', '本机朗读命令不可用或没有执行权限', { cause });
      }
      if (error.killed || error.code === 'ETIMEDOUT') {
        throw new TtsError(504, 'TTS_TIMEOUT', '朗读音频生成超时', { cause });
      }
      throw new TtsError(502, 'TTS_GENERATION_FAILED', '朗读音频生成失败', { cause });
    } finally {
      await Promise.all([rm(textPath, { force: true }), rm(aiffPath, { force: true })]);
    }
  }
}
