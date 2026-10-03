import path from 'node:path';
import { builtinActivities } from '../../packages/activities/src/index';
import { cardinalitySpeech, speechKey, type ConceptRef, type Speech } from '@sprout/schema';
import { describe, expect, it } from 'vitest';
import { collectSpeech } from '../lib/collect-speech';
import { CORE_PACK, REPO_ROOT, fileExists, writeJson } from '../lib/io';
import { inspectPack } from '../lib/validate-pack';

describe('正式课程实际插件朗读覆盖', () => {
  it('96 课每个步骤的 speeches、词库与基数句全部有真实离线音频', async () => {
    const pack = await inspectPack(CORE_PACK);
    expect(pack.validLessons).toHaveLength(96);
    const plugins = new Map(builtinActivities.map((activity) => [activity.type, activity]));
    const concepts = new Map(pack.lexicon!.concepts.map((concept) => [concept.id, concept]));
    const collected = new Set(pack.speech.map((entry) => entry.key));
    const present = new Set<string>();
    for (const [key, file] of Object.entries(pack.audio?.entries ?? {})) {
      if (await fileExists(CORE_PACK, file)) present.add(key);
    }
    const resolve = (ref: ConceptRef) => typeof ref === 'string' ? concepts.get(ref) : ref;
    const rows: { lessonId: string; step: number; type: string; required: number; missing: string[]; uncollected: string[] }[] = [];
    const allRequired = new Set(collectSpeech({ lexicon: pack.lexicon }).map((entry) => entry.key));
    for (const lesson of pack.validLessons) {
      for (const [index, step] of lesson.steps.entries()) {
        const plugin = plugins.get(step.type);
        expect(plugin, `${lesson.id} / ${step.type}`).toBeDefined();
        const speeches: Speech[] = [...plugin!.speeches?.(step.props) ?? []];
        // 运行时词库名称、拟声和短句由独立解析器收集；基数句再按活动参数交叉核对。
        speeches.push(...collectSpeech({ lessons: [{ ...lesson, steps: [step] }], fallbackConcepts: pack.lexicon!.concepts, includeCommon: false })
          .map((entry) => ({ [entry.lang]: entry.text })));
        if (step.type === 'count' || step.type === 'subitize') {
          const rounds = step.props.rounds as { item?: ConceptRef; count: number }[];
          for (const round of rounds) {
            const concept = round.item ? resolve(round.item) : undefined;
            if (concept && (step.type === 'subitize' || step.props.cardinality !== false)) speeches.push(cardinalitySpeech(round.count, concept));
          }
        }
        const keys = new Set(speeches.flatMap((speech) => (['zh', 'en'] as const)
          .flatMap((lang) => speech[lang] ? [speechKey(lang, speech[lang]!)] : [])));
        keys.forEach((key) => allRequired.add(key));
        rows.push({
          lessonId: lesson.id, step: index + 1, type: step.type, required: keys.size,
          missing: [...keys].filter((key) => !present.has(key)),
          uncollected: [...keys].filter((key) => !collected.has(key)),
        });
      }
    }
    const missing = [...allRequired].filter((key) => !present.has(key));
    await writeJson(path.join(REPO_ROOT, 'qa-artifacts'), 'audio-coverage.json', {
      lessons: pack.validLessons.length, steps: rows.length,
      required: allRequired.size, present: allRequired.size - missing.length, missing, rows,
    });
    expect(rows.filter((row) => row.uncollected.length), '流水线与插件 speeches 不一致').toEqual([]);
    expect(missing, '缺失真实音频').toEqual([]);
  });
});
