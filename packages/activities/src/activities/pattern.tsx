import { useRef, useState } from 'react';
import { PHRASES, type PatternProps } from '@sprout/schema';
import type { ActivityContext } from '@sprout/plugin-sdk';
import { Action, ConceptImage, conceptSpeech, defineBuiltin, InputHint, Stage, Text, useBusy, useNav, useSession, useTask } from '../shared';

function PatternActivity({ ctx }: { ctx: ActivityContext<PatternProps> }) {
  const props = ctx.props;
  const s = useSession(ctx);
  const busy = useBusy();
  const [roundIndex, setRoundIndex] = useState(0);
  const [answer, setAnswer] = useState<string | null>(null);
  const [wrong, setWrong] = useState<string | null>(null);
  const [readingIndex, setReadingIndex] = useState(-1);
  const [focusIndex, setFocusIndex] = useState(0);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const round = props.rounds[roundIndex];

  useTask(s, async (signal) => {
    setAnswer(null);
    setWrong(null);
    ctx.log('pattern:round', { round: roundIndex });
    await s.speak(props.intro ?? PHRASES.whatsNext, signal);
  }, [roundIndex]);

  function choose(value: string) {
    if (answer) return;
    s.run(() => busy.perform(s, async () => {
      if (value !== round.answer) {
        setWrong(value);
        ctx.log('pattern:retry', { round: roundIndex, value });
        s.sfx('soft-no');
        await s.speak(PHRASES.tryAgain);
        return;
      }
      setWrong(null);
      setAnswer(value);
      ctx.log('pattern:correct', { round: roundIndex, value });
      s.sfx('chime');
      for (const [index, ref] of [...round.sequence, value].entries()) {
        setReadingIndex(index);
        await s.speak(conceptSpeech(ctx, ref));
        await s.delay(500);
      }
      setReadingIndex(-1);
    }));
  }
  function next() {
    if (!answer || busy.busy) return;
    if (roundIndex + 1 === props.rounds.length) s.complete({ data: { rounds: props.rounds.length } });
    else { setAnswer(null); setRoundIndex((value) => value + 1); }
  }
  useNav(ctx, (key) => {
    if (key === 'left' || key === 'right') {
      const focused = ctx.focus.current();
      const focusedIndex = focused ? buttons.current.indexOf(focused as HTMLButtonElement) : -1;
      const currentIndex = focusedIndex >= 0 ? focusedIndex : focusIndex;
      const index = (currentIndex + (key === 'right' ? 1 : round.options.length - 1)) % round.options.length;
      setFocusIndex(index);
      ctx.focus.focus(buttons.current[index]);
      return true;
    }
    if (key === 'ok') {
      if (answer) next();
      else {
        const focused = ctx.focus.current();
        const index = focused ? buttons.current.indexOf(focused as HTMLButtonElement) : -1;
        choose(round.options[index >= 0 ? index : focusIndex]);
      }
      return true;
    }
    return false;
  });

  return <Stage ctx={ctx} className="spa-pattern">
    <div className="spa-pattern-sequence">
      {round.sequence.map((item, index) => <div className={`spa-pattern-cell ${readingIndex === index ? 'is-current' : ''}`} key={index}>
        <ConceptImage ctx={ctx} concept={item} />
      </div>)}
      <div className={`spa-pattern-cell spa-pattern-gap ${answer ? 'is-filled' : ''} ${readingIndex === round.sequence.length ? 'is-current' : ''}`}>
        {answer ? <ConceptImage ctx={ctx} concept={answer} /> : <span>?</span>}
      </div>
    </div>
    <Text ctx={ctx} text={wrong ? PHRASES.tryAgain : PHRASES.whatsNext} className="spa-question" />
    <div className="spa-pattern-options" data-round-index={roundIndex}>
      {round.options.map((item, index) => <button type="button" data-focusable key={item}
        ref={(el) => { buttons.current[index] = el; }} disabled={busy.busy || !!answer}
        className={`spa-pattern-option ${wrong === item ? 'is-retry' : ''}`}
        onClick={() => choose(item)} aria-label={ctx.locale.pick(ctx.concept(item) ?? { zh: item }).primary}>
        <ConceptImage ctx={ctx} concept={item} />
      </button>)}
    </div>
    <div className="spa-feedback">{answer && <Action ctx={ctx} onClick={next} disabled={busy.busy}>
      <Text ctx={ctx} text={roundIndex + 1 === props.rounds.length ? PHRASES.allDone : { zh: '继续', en: 'Continue' }} />
    </Action>}</div>
    <InputHint ctx={ctx} />
  </Stage>;
}

export const patternActivity = defineBuiltin<PatternProps>('pattern', PatternActivity, (props) => [
  props.intro ?? PHRASES.whatsNext, PHRASES.tryAgain,
]);
