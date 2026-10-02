import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { writeJson } from '../lib/io';

export function lesson(id = 'hello.lesson', props: Record<string, unknown> = { items: ['circle'] }) {
  return {
    schemaVersion: 1, id, title: { zh: '你好，圆形', en: 'Hello, circle' },
    ageRange: [18, 24], domains: ['language'], durationMin: 2, coView: 'required',
    themeId: 'hello.theme', objectives: [{ zh: '一起看看圆形' }],
    parentGuide: { intro: '陪宝宝一起看。' }, offline: [{ title: '找圆形', steps: ['和宝宝看看家里的圆形物品。'] }],
    steps: [{ type: 'word-cards', props }],
  };
}

export function route() {
  return {
    schemaVersion: 1, id: 'hello.route', title: { zh: '一起看' },
    stages: [{
      id: 'hello.stage', title: { zh: '探索' }, ageRange: [18, 24],
      focus: [{ zh: '一起看看圆形' }],
      screen: { sessionMaxMin: 3, dailyMaxMin: 5, lessonsPerDay: 1, coView: 'required' },
      themes: [{ id: 'hello.theme', title: { zh: '圆形' }, weeks: 1, domains: ['language'], lessons: ['hello.lesson'] }],
    }],
  };
}

export async function fixturePack(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sprout-pipeline-'));
  await writeJson(root, 'pack.json', {
    schemaVersion: 1, id: 'hello.pack', version: '1.0.0', name: { zh: '你好' }, ageRange: [18, 24],
    routes: ['routes/hello.json'],
  });
  await writeJson(root, 'lexicon.json', { schemaVersion: 1, concepts: [{
    id: 'circle', category: 'shapes', zh: '圆形', en: 'circle', image: 'assets/circle.svg',
  }] });
  await mkdir(path.join(root, 'assets'), { recursive: true });
  await writeFile(path.join(root, 'assets/circle.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="12"/></svg>');
  await writeJson(root, 'lessons/hello.json', lesson());
  await writeJson(root, 'routes/hello.json', route());
  return root;
}
