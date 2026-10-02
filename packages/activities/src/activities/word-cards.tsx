import { useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { PHRASES } from '@sprout/schema';
import type { Speech, WordCardsProps } from '@sprout/schema';
import type { ActivityContext } from '@sprout/plugin-sdk';
import {
  Action, ConceptImage, InputHint, Stage, Text, conceptSpeech, defineBuiltin,
  speechForConcept, useNav, useSession, useTask,
} from '../shared';

function WordCardsActivity({ ctx }: { ctx: ActivityContext<WordCardsProps> }) {
  const s = useSession(ctx);
  const { items, show, speak, autoAdvanceSec, intro } = ctx.props;
  const [page, setPage] = useState({ index: 0, reading: 0 });
  const currentPage = useRef(page);
  const readLock = useRef(false);
  const introduced = useRef(false);
  const replays = useRef(0);
  const [reading, setReading] = useState(false);
  const atEnd = page.index === items.length;
  const ref = items[Math.min(page.index, items.length - 1)];
  const concept = ctx.concept(ref);
  const name = conceptSpeech(ctx, ref);
  const pinyin = concept?.pinyin ?? (typeof ref === 'object' ? ref.pinyin : undefined);
  const visibleName = name && {
    zh: name.zh,
    en: show.english ? name.en : undefined,
  };

  const turn = (target: number, source: 'input' | 'timer', expected = page) => {
    if (!s.active() || s.paused || currentPage.current !== expected) return;
    const index = Math.max(0, Math.min(items.length, target));
    if (index === expected.index) return;
    const next = { index, reading: 0 };
    currentPage.current = next;
    readLock.current = false;
    ctx.log('word-cards:page', { from: expected.index, to: index, source });
    s.sfx('page');
    setPage(next);
  };
  const reread = () => {
    if (!s.active() || s.paused || atEnd || readLock.current || currentPage.current !== page) return;
    readLock.current = true;
    const next = { index: page.index, reading: page.reading + 1 };
    currentPage.current = next;
    replays.current += 1;
    ctx.log('word-cards:reread', { index: page.index });
    setPage(next);
  };
  const finish = () => {
    if (s.active() && !s.paused && atEnd) {
      s.complete({ data: { cards: items.length, replays: replays.current } });
    }
  };

  useTask(s, async (signal) => {
    readLock.current = true;
    setReading(true);
    try {
      if (!introduced.current) {
        introduced.current = true;
        await s.speak(intro, signal);
      }
      if (atEnd) {
        await s.speak(PHRASES.allDone, signal);
        return;
      }
      if (page.reading === 0) ctx.log('word-cards:show', { index: page.index });
      const read = async () => {
        if (speak === 'none') return;
        await s.speak(name, signal);
        const extra = speak === 'name+sound' ? concept?.sound ?? (typeof ref === 'object' ? ref.sound : undefined)
          : speak === 'name+phrase' ? concept?.phrase ?? (typeof ref === 'object' ? ref.phrase : undefined)
          : undefined;
        await s.speak(extra, signal);
      };
      await Promise.all([read(), ...(page.reading ? [s.delay(750, signal)] : [])]);
    } finally {
      if (currentPage.current === page && s.active() && !signal.aborted) {
        readLock.current = false;
        setReading(false);
      }
    }
    if (autoAdvanceSec !== null) {
      await s.delay(autoAdvanceSec * 1000, signal);
      turn(page.index + 1, 'timer', page);
    }
  }, [page]);

  useNav(ctx, (key) => {
    if (key === 'left') { turn(page.index - 1, 'input'); return true; }
    if (key === 'right') { if (!atEnd) turn(page.index + 1, 'input'); return true; }
    if (key !== 'ok') return false;
    if (atEnd) finish(); else reread();
    return true;
  });

  const labelStyle = {
    '--spa-word-scale': Math.max(0.45, Math.min(1, 14 / Math.max(name?.zh?.length ?? 0, name?.en?.length ?? 0, 1))),
  } as CSSProperties;

  return <Stage ctx={ctx} className="spa-early spa-word-cards">
    <div className="spa-word-body">
      {atEnd ? <div className="spa-word-end">
        <ConceptImage ctx={ctx} concept={ref} className="spa-word-picture" />
        <Action ctx={ctx} onClick={finish} className="spa-word-finish"><Text ctx={ctx} text={PHRASES.allDone} /></Action>
      </div> : <Action ctx={ctx} onClick={reread} className="spa-word-card"
        label={ctx.locale.pick({ zh: '再读一遍', en: 'Read again' }).primary}>
        <span key={`${page.index}-${page.reading}`} className={`spa-word-picture${page.reading && reading ? ' spa-word-picture--bounce' : ''}`}>
          <ConceptImage ctx={ctx} concept={ref} />
        </span>
        <span className="spa-word-labels" style={labelStyle}>
          {show.text && visibleName && (show.english || ctx.locale.mode !== 'en') && (
            <Text ctx={ctx} text={visibleName} className="spa-word-name" />
          )}
          {show.text && show.pinyin && ctx.locale.showPinyin && pinyin && ctx.locale.mode !== 'en'
            && <span className="spa-word-pinyin" lang="zh-Latn">{pinyin}</span>}
        </span>
      </Action>}
    </div>
    <div className="spa-early-navigation">
      <Action ctx={ctx} onClick={() => turn(page.index - 1, 'input')} disabled={page.index === 0}
        className="spa-early-arrow" label={ctx.locale.pick({ zh: '上一张', en: 'Previous card' }).primary}>
        <span aria-hidden="true">←</span>
      </Action>
      <div className="spa-word-location">
        <span className="spa-early-counter">{Math.min(page.index + 1, items.length)} / {items.length}</span>
        <InputHint ctx={ctx} />
      </div>
      <Action ctx={ctx} onClick={() => turn(page.index + 1, 'input')} disabled={atEnd}
        className="spa-early-arrow" label={ctx.locale.pick({ zh: '下一张', en: 'Next card' }).primary}>
        <span aria-hidden="true">→</span>
      </Action>
    </div>
  </Stage>;
}

export const wordCardsActivity = defineBuiltin<WordCardsProps>('word-cards', WordCardsActivity, (props) => {
  const speeches: Speech[] = [...(props.intro ? [props.intro] : []), PHRASES.allDone];
  if (props.speak !== 'none') {
    for (const ref of props.items) {
      const name = speechForConcept(ref);
      if (name) speeches.push(name);
      if (typeof ref !== 'object') continue;
      const extra = props.speak === 'name+sound' ? ref.sound : props.speak === 'name+phrase' ? ref.phrase : undefined;
      if (extra) speeches.push(extra);
    }
  }
  return speeches;
});
