import { describe, expect, it } from 'vitest';
import { BUILTIN_ACTIVITY_PROPS } from '@sprout/schema';
import { builtinActivities } from './index';

const speeches = (type: keyof typeof BUILTIN_ACTIVITY_PROPS, props: unknown) =>
  builtinActivities.find((activity) => activity.type === type)!.speeches!(BUILTIN_ACTIVITY_PROPS[type].parse(props));
const inline = { zh: '小球', en: 'ball', image: 'assets/ball.svg', phrase: { zh: '滚球。', en: 'Roll it.' } };

describe('内置活动语料声明', () => {
  it('不把静音词卡、家长问题、关闭旁白和场景词条递归变成朗读', () => {
    expect(JSON.stringify(speeches('word-cards', { items: [inline], speak: 'none' }))).not.toContain('小球');
    const story = JSON.stringify(speeches('story', { title: { zh: '故事标题' }, pages: [{
      text: { zh: '静音正文' }, narrate: false, scene: { sprites: [{ concept: inline, x: 50, y: 50 }] },
      prompts: [{ kind: 'wh', zh: '家长提问' }],
    }] }));
    expect(story).toContain('故事标题');
    expect(story).not.toMatch(/静音正文|小球|家长提问/);
  });
  it('song 只声明标题和固定提示，不以 TTS 读歌词', () => {
    const song = JSON.stringify(speeches('song', {
      title: { zh: '歌名' }, lines: [{ lang: 'zh', text: '这是歌词', notes: 'C4/1' }], actions: [{ zh: '动作提示' }],
    }));
    expect(song).toContain('歌名');
    expect(song).not.toMatch(/这是歌词|动作提示/);
  });
  it('count 关闭基数句时不额外生成内联数量句', () => {
    const count = JSON.stringify(speeches('count', { rounds: [{ item: inline, count: 2 }], cardinality: false }));
    expect(count).toContain('二');
    expect(count).not.toContain('一共');
  });
});
