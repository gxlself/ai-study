import { useRef, useState } from 'react';
import { cardinalitySpeech, PHRASES, type CountProps } from '@sprout/schema';
import type { ActivityContext } from '@sprout/plugin-sdk';
import { QuantityField } from '../QuantityField';
import { Action, countSpeech, defineBuiltin, InputHint, quantitySpeeches, Stage, Text, useBusy, useNav, useSession, useTask } from '../shared';

function CountActivity({ ctx }: { ctx: ActivityContext<CountProps> }) {
  const props = ctx.props;
  const s = useSession(ctx);
  const [roundIndex, setRoundIndex] = useState(0);
  const [counted, setCounted] = useState(0);
  const [ready, setReady] = useState(false);
  const progress = useRef(0);
  const busy = useBusy();
  const round = props.rounds[roundIndex];

  async function countOne(signal = s.signal) {
    if (progress.current >= round.count) return;
    const next = ++progress.current;
    setCounted(next);
    ctx.log('count:item', { round: roundIndex, index: next });
    s.sfx('tap');
    await s.speak(countSpeech(next), signal);
    if (next === round.count) {
      if (props.cardinality) {
        const concept = ctx.concept(round.item) ?? { zh: '物体', en: 'item' };
        await s.speak(cardinalitySpeech(round.count, concept), signal);
      }
      setReady(true);
    }
  }

  useTask(s, async (signal) => {
    progress.current = 0;
    setCounted(0);
    setReady(false);
    ctx.log('count:round', { round: roundIndex, count: round.count, layout: round.layout });
    if (props.mode === 'auto') {
      for (let i = 0; i < round.count; i++) {
        await s.delay(1500, signal);
        await countOne(signal);
      }
    }
  }, [roundIndex]);

  function next() {
    if (!ready || busy.busy) return;
    if (roundIndex + 1 === props.rounds.length) {
      s.complete({ data: { rounds: props.rounds.length, counts: props.rounds.map((r) => r.count) } });
    } else {
      setReady(false);
      setRoundIndex((index) => index + 1);
    }
  }
  function tap() {
    if (ready) next();
    else if (props.mode === 'guided') s.run(() => busy.perform(s, () => countOne()));
  }
  useNav(ctx, (key) => {
    if (key === 'ok') { tap(); return true; }
    return false;
  });

  return <Stage ctx={ctx} className="spa-count">
    <header className="spa-activity-header">
      <span>{roundIndex + 1} / {props.rounds.length}</span>
      <Text ctx={ctx} text={PHRASES.letsCount} />
    </header>
    <div className={`spa-count-stage ${ready && props.cardinality ? 'spa-celebrate' : ''}`}>
      <QuantityField ctx={ctx} count={round.count} item={round.item} layout={round.layout}
        activeCount={counted} numbered onTap={tap} disabled={busy.busy || s.paused} />
    </div>
    <div className="spa-count-summary" aria-live="polite">
      {ready && props.showNumeral && <strong className="spa-numeral">{round.count}</strong>}
      {ready && <Action ctx={ctx} onClick={next}><Text ctx={ctx}
        text={roundIndex + 1 === props.rounds.length ? PHRASES.allDone : { zh: '下一轮', en: 'Next' }} /></Action>}
    </div>
    <InputHint ctx={ctx} />
  </Stage>;
}

export const countActivity = defineBuiltin<CountProps>('count', CountActivity, (props) =>
  props.rounds.flatMap((round) => quantitySpeeches(round.item, round.count)));
