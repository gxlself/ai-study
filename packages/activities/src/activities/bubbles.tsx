import { useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { PHRASES } from '@sprout/schema';
import type { BubblesProps, ConceptRef, Speech } from '@sprout/schema';
import type { ActivityContext } from '@sprout/plugin-sdk';
import {
  ConceptImage, InputHint, Stage, Text, conceptSpeech, defineBuiltin, speechForConcept,
  useBusy, useInputMode, useNav, useSession,
} from '../shared';

const slots = [0, 1, 2, 3, 4];
const offsets = [2, 8, 5, 10, 3];

function BubblesActivity({ ctx }: { ctx: ActivityContext<BubblesProps> }) {
  const s = useSession(ctx);
  const busy = useBusy();
  const mode = useInputMode(ctx);
  const { items, pops, sayName, speed } = ctx.props;
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const selected = useRef(2);
  const count = useRef(0);
  const [choice, setChoice] = useState(2);
  const [revealed, setRevealed] = useState<{ slot: number; item?: ConceptRef } | null>(null);
  const [leaving, setLeaving] = useState(false);

  useLayoutEffect(() => {
    if (mode === 'dpad' && s.active() && !s.paused && !leaving) ctx.focus.focus(buttons.current[choice]);
  }, [ctx, choice, mode, s.paused, leaving]);

  const select = (slot: number) => {
    if (!s.active() || s.paused || leaving) return;
    selected.current = slot;
    setChoice(slot);
    ctx.focus.focus(buttons.current[slot]);
  };
  const pop = (slot: number) => {
    if (leaving || count.current >= pops) return;
    s.run(() => busy.perform(s, async () => {
      const index = count.current;
      const item = items.length ? items[index % items.length] : undefined;
      count.current += 1;
      selected.current = slot;
      setChoice(slot);
      setRevealed({ slot, item });
      s.sfx('pop');
      ctx.log('bubbles:pop', { pop: count.current, slot, item: typeof item === 'string' ? item : item?.id });
      await Promise.all([
        s.delay(1500),
        ...(sayName && item ? [s.speak(conceptSpeech(ctx, item))] : []),
      ]);
      setRevealed(null);
      if (count.current === pops) {
        setLeaving(true);
        ctx.log('bubbles:bye', { pops: count.current });
        await Promise.all([s.speak(PHRASES.bubblesBye), s.delay(1600)]);
        s.complete({ data: { pops: count.current } });
      }
    }));
  };

  useNav(ctx, (key) => {
    if (key === 'left' || key === 'right') {
      select((selected.current + (key === 'left' ? -1 : 1) + slots.length) % slots.length);
      return true;
    }
    if (key !== 'ok') return false;
    pop(selected.current);
    return true;
  });

  return <Stage ctx={ctx} className={`spa-early spa-bubbles${leaving ? ' spa-bubbles--leaving' : ''}`}>
    <div className="spa-bubble-field">
      {slots.map((slot) => <div key={slot} className="spa-bubble-lane" style={{
        '--spa-bubble-x': `${10 + slot * 20}%`,
        '--spa-bubble-delay': `${-offsets[slot]}s`,
        '--spa-bubble-duration': `${speed === 'slow' ? 12 : 9}s`,
        '--spa-bubble-still-y': `${[45, 15, 35, 60, 25][slot]}%`,
      } as CSSProperties}>
        <div className="spa-bubble-track">
          <button ref={(element) => { buttons.current[slot] = element; }}
            type="button" data-focusable data-bubble={slot}
            className={`spa-action spa-bubble${revealed?.slot === slot ? ' spa-bubble--popped' : ''}`}
            aria-label={ctx.locale.pick({ zh: `泡泡 ${slot + 1}`, en: `Bubble ${slot + 1}` }).primary}
            aria-disabled={busy.busy || leaving || undefined}
            disabled={s.paused || ctx.signal.aborted || leaving}
            onFocus={() => { selected.current = slot; }}
            onClick={() => pop(slot)}>
            <span className="spa-bubble-glint" aria-hidden="true" />
          </button>
        </div>
      </div>)}
      {revealed?.item && <div className="spa-bubble-reveal" aria-live="polite">
        <ConceptImage ctx={ctx} concept={revealed.item} />
      </div>}
    </div>
    <div className="spa-bubble-footer">
      {leaving ? <Text ctx={ctx} text={PHRASES.bubblesBye} /> : <InputHint ctx={ctx} />}
    </div>
  </Stage>;
}

export const bubblesActivity = defineBuiltin<BubblesProps>('bubbles', BubblesActivity, (props) => [
  PHRASES.bubblesBye,
  ...(props.sayName ? props.items.map(speechForConcept).filter((speech): speech is Speech => !!speech) : []),
]);
