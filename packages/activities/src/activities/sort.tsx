import { useRef, useState, type CSSProperties } from 'react';
import { PHRASES, type SortProps } from '@sprout/schema';
import type { ActivityContext } from '@sprout/plugin-sdk';
import { ConceptImage, conceptSpeech, defineBuiltin, InputHint, Stage, Text, speechForConcept, useBusy, useNav, useSession, useTask } from '../shared';
import { sortColor } from '../security';

function SortActivity({ ctx }: { ctx: ActivityContext<SortProps> }) {
  const props = ctx.props;
  const s = useSession(ctx);
  const busy = useBusy();
  const [itemIndex, setItemIndex] = useState(0);
  const [selectedBin, setSelectedBin] = useState(0);
  const [wrong, setWrong] = useState(false);
  const [dropped, setDropped] = useState(false);
  const [done, setDone] = useState(false);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const current = props.items[itemIndex];

  useTask(s, async (signal) => {
    setWrong(false);
    setDropped(false);
    ctx.log('sort:item', { index: itemIndex });
    if (itemIndex === 0) await s.speak(props.prompt, signal);
    await s.speak(conceptSpeech(ctx, current.item), signal);
  }, [itemIndex]);

  function place(index: number) {
    const bin = props.bins[index];
    if (done) return;
    s.run(() => busy.perform(s, async () => {
      setSelectedBin(index);
      if (bin.id !== current.bin) {
        setWrong(true);
        ctx.log('sort:retry', { index: itemIndex, bin: bin.id });
        s.sfx('soft-no');
        await s.speak(PHRASES.thinkAgain);
        return;
      }
      setWrong(false);
      setDropped(true);
      ctx.log('sort:correct', { index: itemIndex, bin: bin.id });
      s.sfx('chime');
      await s.delay(900);
      if (itemIndex + 1 === props.items.length) {
        setDone(true);
        await s.delay(900);
        s.complete({ data: { items: props.items.length } });
      } else setItemIndex((value) => value + 1);
    }));
  }
  useNav(ctx, (key) => {
    if (key === 'left' || key === 'right') {
      const focused = ctx.focus.current();
      const focusedIndex = focused ? buttons.current.indexOf(focused as HTMLButtonElement) : -1;
      const currentIndex = focusedIndex >= 0 ? focusedIndex : selectedBin;
      const index = (currentIndex + (key === 'right' ? 1 : props.bins.length - 1)) % props.bins.length;
      setSelectedBin(index);
      ctx.focus.focus(buttons.current[index]);
      return true;
    }
    if (key === 'ok') {
      const focused = ctx.focus.current();
      const index = focused ? buttons.current.indexOf(focused as HTMLButtonElement) : -1;
      place(index >= 0 ? index : selectedBin);
      return true;
    }
    return false;
  });

  return <Stage ctx={ctx} className="spa-sort">
    <Text ctx={ctx} text={props.prompt} className="spa-question" />
    <div key={itemIndex} className={`spa-sort-item ${wrong ? 'is-retry' : ''} ${dropped ? 'is-dropped' : ''}`}
      style={{ '--spa-drop-x': `${(selectedBin - (props.bins.length - 1) / 2) * 180}px` } as CSSProperties}>
      <ConceptImage ctx={ctx} concept={current.item} />
    </div>
    <div className={`spa-sort-bins ${done ? 'spa-celebrate' : ''}`} data-item-index={itemIndex}>
      {props.bins.map((bin, index) => <button type="button" data-focusable key={bin.id}
        ref={(el) => { buttons.current[index] = el; }} disabled={busy.busy || done}
        className={`spa-sort-bin ${selectedBin === index ? 'is-selected' : ''}`}
        style={{ '--spa-bin-color': sortColor(bin.color) ?? 'var(--sp-accent-2)' } as CSSProperties}
        onClick={() => place(index)} aria-label={ctx.locale.pick(bin.label).primary}>
        {(bin.concept || bin.image) && <ConceptImage ctx={ctx} concept={bin.concept} image={bin.image} />}
        <Text ctx={ctx} text={bin.label} />
      </button>)}
    </div>
    <div className="spa-feedback">{wrong && <Text ctx={ctx} text={PHRASES.thinkAgain} />}</div>
    <InputHint ctx={ctx} />
  </Stage>;
}

export const sortActivity = defineBuiltin<SortProps>('sort', SortActivity, (props) => [
  PHRASES.thinkAgain, props.prompt,
  ...props.items.flatMap(({ item }) => {
    const speech = speechForConcept(item);
    return speech ? [speech] : [];
  }),
  ...props.bins.map((bin) => bin.label),
]);
