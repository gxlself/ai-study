import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../', import.meta.url)));
const FORBIDDEN_AUDIO_PATH = /(?:^|\/)audio\/tts\//;
const AUDIO_EXTENSIONS = /\.(?:m4a|mp3|wav|aac|caf|aiff?|ogg|flac|wma|opus)$/i;
const SYSTEM_VOICES = new Set([
  'tingting', 'samantha', 'meijia', 'sinji', 'kyoko', 'otoya', 'yuna',
  'daniel', 'karen', 'moira', 'fiona', 'alex', 'victoria', 'fred',
  'tessa', 'thomas', 'amelie', 'anna', 'carmit', 'damayanti', 'diego',
  'eddy', 'flo', 'grandma', 'grandpa', 'jester', 'ioana', 'jacques',
  'joana', 'jorge', 'juan', 'luca', 'luciana', 'monica', 'nora', 'reed',
  'rishi', 'satu', 'shelley', 'superstar', 'tarik', 'xander', 'zarvox',
  'agata', 'albert', 'alice', 'alva', 'bad news', 'bahh', 'bells', 'boing',
  'bruce', 'bubbles', 'cellos', 'daria', 'ellen', 'good news', 'junior',
  'kathy', 'klara', 'laura', 'lekha', 'lesya', 'milena', 'nicolas', 'paulina',
  'petra', 'princess', 'ralph', 'sandy', 'sara', 'soledad', 'trinoids',
  'veena', 'whisper', 'yuri', 'zosia',
]);

function trackedFiles(root = ROOT) {
  return execFileSync('git', ['-C', root, 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], { encoding: 'utf8' })
    .split('\0')
    .filter(Boolean);
}

function voiceValues(value, found = [], insideVoices = false) {
  if (Array.isArray(value)) {
    for (const item of value) voiceValues(item, found, insideVoices);
  } else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      const inVoices = insideVoices || key === 'voices';
      if (inVoices && typeof item === 'string') {
        const name = item.trim().toLocaleLowerCase().replace(/\s+\(.*/, '');
        if (SYSTEM_VOICES.has(name) || /(?:com\.apple\.|macos-say|\bsiri\b)/i.test(item)) found.push(item);
      } else if (typeof item === 'object') voiceValues(item, found, inVoices);
    }
  }
  return found;
}

export function audioIssues(value, label = 'manifest/bundle') {
  const issues = voiceValues(value).map((voice) =>
    `${label}: voices 指向 macOS 系统声音 "${voice}"，系统语音不可公开再分发`);
  const visit = (item) => {
    if (!item || typeof item !== 'object') return;
    for (const [key, child] of Object.entries(item)) {
      if (key === 'entries' && child && typeof child === 'object') {
        for (const file of Object.values(child)) {
          if (typeof file === 'string' && FORBIDDEN_AUDIO_PATH.test(file)) {
            issues.push(`${label}: 公开清单引用本地 audio/tts 路径 ${file}`);
          }
        }
      } else if (typeof child === 'object') visit(child);
    }
  };
  visit(value);
  return issues;
}

export function scanRedistributable(files, root = ROOT) {
  const issues = [];
  for (const file of files) {
    if (FORBIDDEN_AUDIO_PATH.test(file) && AUDIO_EXTENSIONS.test(file)) {
      issues.push(`${file}: 被 git 跟踪的 audio/tts 音频不得进入公开仓库`);
    }
    if (/(?:^|\/)audio\/manifest\.local\.json$/i.test(file)) {
      issues.push(`${file}: 本地音频清单不得被 git 跟踪`);
    }
    if (!/(?:manifest|bundle).*\.json$/i.test(basename(file))) continue;
    let value;
    try {
      value = JSON.parse(readFileSync(join(root, file), 'utf8'));
    } catch (error) {
      if (error.code !== 'ENOENT') issues.push(`${file}: 清单 JSON 无法解析，无法审查音频许可`);
      continue;
    }
    issues.push(...audioIssues(value, file));
  }
  return issues;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const issues = scanRedistributable(trackedFiles());
  if (issues.length) {
    console.error('可再分发版权守卫失败：');
    for (const issue of issues) console.error(`- ${issue}`);
    process.exitCode = 1;
  } else {
    console.log('可再分发版权守卫通过：git 跟踪文件未发现 TTS 录音或 macOS 系统声音清单。');
  }
}
