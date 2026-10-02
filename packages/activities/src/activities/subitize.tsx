import { useRef, useState } from 'react';
import { PHRASES, type SubitizeProps } from '@sprout/schema';
import type { ActivityContext } from '@sprout/plugin-sdk';
import { QuantityField } from '../QuantityField';
import { Action, countSpeech, defineBuiltin, InputHint, Stage, Text, useBusy, useNav, useSession, useTask } from '../shared';

export function subitizeChoices(count: number): number[] {
  const start = Math.max(1, count - 1);
  return [start, start + 1, start + 2];
}

function SubitizeActivity({ ctx }: { ctx: ActivityContext<SubitizeProps> }) {
  const props = ctx.props;
  const s = useSession(ctx);
  const busy = useBusy();
  const [roundIndex, setRoundIndex] = useState(0);
  const [phase, setPhase] = useState<'show' | 'question' | 'count' | 'done'>('show');
  const [peek, setPeek] = useState(false);
  const [counted, setCounted] = useState(0);
  const [wrong, setWrong] = useState(false);
  const [focusIndex, setFocusIndex] = useState(0);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const round = props.rounds[roundIndex];
  const choices = subitizeChoices(round.count);

  async function recount(signal = s.signal) {
    setPhase('count');
    for (let i = 1; i <= round.count; i++) {
      setCounted(i);
      await s.speak(countSpeech(i), signal);
      await s.delay(800, signal);
    }
    setPhase('done');
  }

  useTask(s, async (signal) => {
    setPhase('show');
    setPeek(false);
    setWrong(false);
    setCounted(0);
    ctx.log('subitize:show', { round: roundIndex, count: round.count });
    await s.delay(props.showSec * 1000, signal);
    setPhase('question');
    await s.delay(600, signal);
    await s.speak(PHRASES.howMany, signal);
    if (!props.choices) await recount(signal);
  }, [roundIndex]);

  function pick(value: number) {
    if (phase !== 'question') return;
    s.run(() => busy.perform(s, async () => {
      if (value !== round.count) {
        setWrong(true);
        setPeek(true);
        ctx.log('subitize:retry', { round: roundIndex, answer: value });
        await s.speak(PHRASES.lookAgain);
      } else {
        setWrong(false);
        ctx.log('subitize:correct', { round: roundIndex, answer: value });
        s.sfx('chime');
        await recount();
      }
    }));
  }
  function next() {
    if (phase !== 'done' || busy.busy) return;
    if (roundIndex + 1 === props.rounds.length) s.complete({ data: { rounds: props.rounds.length } });
    else { setPhase('show'); setRoundIndex((value) => value + 1); }
  }
  useNav(ctx, (key) => {
    if (key === 'left' || key === 'right') {
      const index = (focusIndex + (key === 'right' ? 1 : 2)) % choices.length;
      setFocusIndex(index);
      ctx.focus.focus(buttons.current[index]);
      return true;
    }
    if (key === 'ok') {
      if (phase === 'done') next();
      else if (props.choices) pick(choices[focusIndex]);
      return true;
    }
    return false;
  });

  return <Stage ctx={ctx} className="spa-subitize">
    <div className={`spa-subitize-field ${phase === 'question' && !peek ? 'is-hidden' : ''}`}
      data-focusable={phase === 'show' ? '' : undefined} tabIndex={phase === 'show' ? 0 : undefined}
      aria-label={ctx.locale.pick({ zh: '看一看', en: 'Look together' }).primary}>
      <QuantityField ctx={ctx} count={round.count} item={round.item} layout={round.arrangement} activeCount={counted} numbered />
    </div>
    <Text ctx={ctx} text={wrong ? PHRASES.lookAgain : PHRASES.howMany} className={`spa-question ${phase === 'show' ? 'spa-invisible' : ''}`} />
    <div className="spa-subitize-choices">
      {phase === 'question' && props.choices && choices.map((value, index) =>
        <button key={value} ref={(el) => { buttons.current[index] = el; }} type="button" data-focusable
          className="spa-number-choice" disabled={busy.busy} onClick={() => pick(value)} aria-label={String(value)}>
          <span className="spa-choice-dots">{Array.from({ length: value }, (_, i) => <i className="spa-dot" key={i} />)}</span>
        </button>)}
      {phase === 'done' && <Action ctx={ctx} onClick={next} disabled={busy.busy}><Text ctx={ctx}
        text={roundIndex + 1 === props.rounds.length ? PHRASES.allDone : { zh: '下一轮', en: 'Next' }} /></Action>}
    </div>
    <InputHint ctx={ctx} />
  </Stage>;
}

export const subitizeActivity = defineBuiltin<SubitizeProps>('subitize', SubitizeActivity, (props) => [
  PHRASES.howMany, PHRASES.lookAgain,
  ...Array.from({ length: Math.max(...props.rounds.map((round) => round.count)) }, (_, i) => countSpeech(i + 1)),
]);
