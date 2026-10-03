import { parseArgs } from 'node:util';
import { PackManifest, Route, Stage } from '@sprout/schema';
import { isMain, runCli } from './lib/cli';
import { CORE_PACK, packDirectories, readJson, writeJson } from './lib/io';

export function mergeStages(input: readonly unknown[]): Route {
  const stages = input.map((stage) => Stage.parse(stage)).sort((a, b) => a.ageRange[0] - b.ageRange[0]);
  if (stages.length !== 6 || new Set(stages.map((stage) => stage.id)).size !== 6
    || stages.some((stage, index) => stage.id !== `s${index + 1}`)) {
    throw new Error('核心路线必须包含 s1–s6 六个唯一阶段，并按月龄顺序排列');
  }
  if (stages[0].ageRange[0] !== 6 || stages.at(-1)!.ageRange[1] !== 36) {
    throw new Error('核心路线必须完整覆盖 6–36 月龄');
  }
  stages.forEach((stage, index) => {
    if (index && stage.ageRange[0] !== stages[index - 1].ageRange[1] + 1) {
      throw new Error(`${stages[index - 1].id} 与 ${stage.id} 月龄有缺口或重叠`);
    }
  });
  return Route.parse({
    schemaVersion: 1,
    id: 'sprout.core.route',
    title: { zh: '芽芽成长路线', en: 'Sprout Growth Route' },
    description: {
      zh: '从六个月到三岁，跟随宝宝的节奏，在亲子陪伴与线下游戏中一起成长。',
      en: 'Grow together from six months to three years through shared attention and offline play at your child’s pace.',
    },
    stages,
  });
}

export async function mergeRoute(directory = CORE_PACK): Promise<Route | null> {
  const manifest = PackManifest.parse(await readJson(directory, 'pack.json'));
  if (manifest.id !== 'sprout.core') return null;
  const input = await Promise.all(Array.from({ length: 6 }, (_, index) =>
    readJson(directory, `routes/_stages/s${index + 1}.json`)));
  const route = mergeStages(input);
  await writeJson(directory, 'routes/sprout-core-route.json', route);
  console.log(`${directory}：已合并六个阶段，覆盖 6–36 月龄；_stages 源文件保持不变`);
  return route;
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  const { values } = parseArgs({ args, options: { pack: { type: 'string' }, help: { type: 'boolean' } } });
  if (values.help) { console.log('用法：pnpm content:route [--pack <dir>]'); return; }
  for (const directory of await packDirectories(values.pack)) await mergeRoute(directory);
}

if (isMain(import.meta.url)) runCli(() => main());
