import { useRef, useState } from 'react';
import { PHRASES } from '@sprout/schema';
import type { SequenceProps } from '@sprout/schema';
import type { ActivityContext } from '@sprout/plugin-sdk';
import { Action, ConceptImage, InputHint, Stage, Text, defineBuiltin, useNav, useSession, useTask } from '../shared';

function SequenceActivity({ ctx }: { ctx: ActivityContext<SequenceProps> }) {
  const s = useSession(ctx);
  const { steps, mode, intro } = ctx.props;
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const introduced = useRef(false);
  const missed = useRef(new Set<number>());
  const reviewed = index === steps.length;
  const current = steps[index];
  const distractor = (index + 1) % steps.length;
  const options = index % 2 ? [index, distractor] : [distractor, index];

  const move = (next: number) => {
    if (!s.active() || s.paused || lock.current) return;
    ctx.log('sequence:page', { from: index, to: next, mode });
    setAnswer(null);
    setIndex(Math.max(0, Math.min(steps.length, next)));
  };
  const finish = () => {
    if (!s.active() || s.paused) return;
    s.complete({
      accuracy: mode === 'order' ? (steps.length - missed.current.size) / steps.length : undefined,
      data: { mode, steps: steps.length },
    });
  };
  const choose = (choice: number) => {
    if (!s.active() || s.paused || lock.current) return;
    lock.current = true;
    setBusy(true);
    setAnswer(choice);
    ctx.log('sequence:answer', { step: index, choice, correct: choice === index });
  };

  useTask(s, async (signal) => {
    if (!introduced.current) {
      introduced.current = true;
      if (intro) await s.speak(intro, signal);
    }
    if (reviewed) {
      await s.speak(PHRASES.allDone, signal);
      return;
    }
    if (mode === 'show') {
      await s.speak(current.say ?? current.caption, signal);
      return;
    }
    if (answer === null) {
      await s.speak(PHRASES.whatToDoNext, signal);
      return;
    }
    if (answer === index) {
      s.sfx('chime');
      await s.speak(current.say ?? current.caption, signal);
      await s.delay(900, signal);
      if (signal.aborted) return;
      setIndex((value) => value + 1);
    } else {
      missed.current.add(index);
      s.sfx('soft-no');
      await s.speak(PHRASES.thinkAgain, signal);
      await s.delay(600, signal);
    }
    if (signal.aborted) return;
    lock.current = false;
    setBusy(false);
    setAnswer(null);
  }, [index, answer]);

  useNav(ctx, (key) => {
    if (s.paused) return key !== 'back';
    if (key === 'left' && mode === 'show') { move(index - 1); return true; }
    if (key === 'right' && mode === 'show') {
      if (reviewed) finish(); else move(index + 1);
      return true;
    }
    if (key !== 'ok') return false;
    const focused = ctx.focus.current();
    if (focused) focused.click();
    else if (reviewed) finish();
    else if (mode === 'show') move(index + 1);
    else choose(options[0]);
    return true;
  });

  const thumbnails = (all: boolean) => (
    <ol className={`spa-sequence-strip${all ? ' spa-sequence-strip--review' : ''}`}>
      {steps.slice(0, all ? steps.length : index).map((step, i) => (
        <li key={i} className="spa-sequence-thumb">
          <span className="spa-media-number">{i + 1}</span>
          <ConceptImage ctx={ctx} concept={step.concept} image={step.image} />
          <Text ctx={ctx} text={step.caption} />
        </li>
      ))}
    </ol>
  );

  return (
    <Stage ctx={ctx} className="spa-media spa-sequence">
      {reviewed ? (
        <>
          <Text ctx={ctx} text={PHRASES.allDone} className="spa-media-heading" />
          {thumbnails(true)}
          <Action ctx={ctx} onClick={finish} disabled={s.paused} className="spa-media-finish">
            <Text ctx={ctx} text={PHRASES.allDone} />
          </Action>
          <InputHint ctx={ctx} />
        </>
      ) : mode === 'show' ? (
        <>
          <div className="spa-media-counter" aria-live="polite">{index + 1} / {steps.length}</div>
          <Action ctx={ctx} onClick={() => move(index + 1)} className="spa-sequence-main" disabled={s.paused}>
            <span className="spa-media-number">{index + 1}</span>
            <ConceptImage ctx={ctx} concept={current.concept} image={current.image} />
            <Text ctx={ctx} text={current.caption} className="spa-media-heading" />
          </Action>
          <div className="spa-media-navigation">
            <Action ctx={ctx} onClick={() => move(index - 1)} disabled={index === 0 || s.paused}
              label={ctx.locale.pick({ zh: '上一步', en: 'Previous step' }).primary}>
              <span aria-hidden="true">←</span>
            </Action>
            <InputHint ctx={ctx} />
            <Action ctx={ctx} onClick={() => move(index + 1)} disabled={s.paused}
              label={ctx.locale.pick({ zh: '下一步', en: 'Next step' }).primary}>
              <span aria-hidden="true">→</span>
            </Action>
          </div>
        </>
      ) : (
        <>
          {thumbnails(false)}
          <Text ctx={ctx} text={PHRASES.whatToDoNext} className="spa-media-heading" />
          <div className="spa-sequence-options">
            {options.map((choice) => (
              <Action key={`${index}-${choice}`} ctx={ctx} onClick={() => choose(choice)}
                disabled={busy || s.paused}
                className={`spa-sequence-option${answer === choice ? ' spa-sequence-option--selected' : ''}`}>
                <ConceptImage ctx={ctx} concept={steps[choice].concept} image={steps[choice].image} />
                <Text ctx={ctx} text={steps[choice].caption} />
              </Action>
            ))}
          </div>
          <InputHint ctx={ctx} />
        </>
      )}
    </Stage>
  );
}

export const sequenceActivity = defineBuiltin<SequenceProps>('sequence', SequenceActivity, (props) => [
  ...(props.intro ? [props.intro] : []),
  ...props.steps.map((step) => step.say ?? step.caption),
  ...(props.mode === 'order' ? [PHRASES.whatToDoNext, PHRASES.thinkAgain] : []),
  PHRASES.allDone,
]);
