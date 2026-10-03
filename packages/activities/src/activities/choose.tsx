import { useRef, useState, type CSSProperties } from 'react';
import { PHRASES, type ChooseOption, type ChooseProps } from '@sprout/schema';
import { chooseOptions, type ActivityContext } from '@sprout/plugin-sdk';
import {
  Action, ConceptImage, conceptSpeech, defineBuiltin, InputHint, Stage, Text,
  speechForConcept, useBusy, useNav, useSession, useTask,
} from '../shared';

function ChooseActivity({ ctx }: { ctx: ActivityContext<ChooseProps> }) {
  const props = ctx.props;
  const s = useSession(ctx);
  const busy = useBusy();
  const [roundIndex, setRoundIndex] = useState(0);
  const [wrong, setWrong] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [correct, setCorrect] = useState(false);
  const firstCorrect = useRef(0);
  const failures = useRef(0);
  const round = props.rounds[roundIndex];
  const options = chooseOptions(round.options);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const [focusIndex, setFocusIndex] = useState(0);

  useTask(s, async (signal) => {
    failures.current = 0;
    setWrong(0);
    setSelected(null);
    setCorrect(false);
    setFocusIndex(0);
    ctx.log('choose:round', { round: roundIndex });
    await s.speak(round.prompt, signal);
  }, [roundIndex]);

  function choose(option: ChooseOption) {
    if (correct) return;
    s.run(() => busy.perform(s, async () => {
      setSelected(option.id);
      if (option.id !== round.answer) {
        setWrong(++failures.current);
        ctx.log('choose:retry', { round: roundIndex, option: option.id, wrong: failures.current });
        s.sfx('soft-no');
        await s.speak(PHRASES.tryAgain);
        return;
      }
      setCorrect(true);
      if (failures.current === 0) firstCorrect.current++;
      ctx.log('choose:correct', { round: roundIndex, option: option.id, firstTry: failures.current === 0 });
      s.sfx('chime');
      await s.speak(conceptSpeech(ctx, option.concept) ?? option.label);
      await s.speak(round.explain);
    }));
  }

  function next() {
    if (!correct || busy.busy) return;
    if (roundIndex + 1 === props.rounds.length) {
      s.complete({ accuracy: firstCorrect.current / props.rounds.length,
        data: { rounds: props.rounds.length, firstCorrect: firstCorrect.current } });
    } else {
      setCorrect(false);
      setRoundIndex((index) => index + 1);
    }
  }

  useNav(ctx, (key) => {
    if (key === 'left' || key === 'right') {
      const focused = ctx.focus.current();
      const focusedIndex = focused ? buttons.current.indexOf(focused as HTMLButtonElement) : -1;
      const currentIndex = focusedIndex >= 0 ? focusedIndex : focusIndex;
      const index = (currentIndex + (key === 'right' ? 1 : options.length - 1)) % options.length;
      setFocusIndex(index);
      ctx.focus.focus(buttons.current[index]);
      return true;
    }
    if (key === 'ok') {
      if (correct) next();
      else {
        const focused = buttons.current.indexOf(ctx.focus.current() as HTMLButtonElement);
        choose(options[focused >= 0 ? focused : focusIndex]);
      }
      return true;
    }
    return false;
  });

  return <Stage ctx={ctx} className="spa-choose">
    <Text ctx={ctx} text={round.prompt} className="spa-question" />
    <div className="spa-choose-options" data-round-index={roundIndex}>
      {options.map((option, index) => {
        const concept = option.concept ? ctx.concept(option.concept) : undefined;
        const label = option.label ?? concept ?? { zh: option.id };
        return <button key={`${roundIndex}-${option.id}`} ref={(el) => { buttons.current[index] = el; }}
          type="button" data-focusable disabled={busy.busy || correct}
          className={`spa-choose-card ${selected === option.id ? correct ? 'is-correct' : 'is-retry' : ''}
            ${!correct && wrong >= props.hintAfter && option.id === round.answer ? 'is-hint' : ''}`}
          style={{ backgroundColor: option.tint, '--spa-card-scale': option.scale ?? 1 } as CSSProperties}
          aria-label={ctx.locale.pick(label).primary} onClick={() => choose(option)}>
          <span className={`spa-choose-card-art ${(option.count ?? 1) > 1 ? 'spa-many' : ''}`}>
            {Array.from({ length: option.count ?? 1 }, (_, i) =>
              <ConceptImage key={i} ctx={ctx} concept={option.concept} image={option.image} />)}
          </span>
          {props.showLabels && <Text ctx={ctx} text={label} className="spa-option-label" />}
        </button>;
      })}
    </div>
    <div className="spa-feedback" aria-live="polite">
      {correct ? <Action ctx={ctx} onClick={next} disabled={busy.busy}>
        <Text ctx={ctx} text={roundIndex + 1 === props.rounds.length ? PHRASES.allDone : { zh: '继续', en: 'Continue' }} />
      </Action> : selected && <Text ctx={ctx} text={PHRASES.tryAgain} />}
    </div>
    <InputHint ctx={ctx} />
  </Stage>;
}

export const chooseActivity = defineBuiltin<ChooseProps>('choose', ChooseActivity, (props) => [
  PHRASES.tryAgain,
  ...props.rounds.flatMap((round) => [
    round.prompt, ...(round.explain ? [round.explain] : []),
    ...round.options.flatMap((option) => {
      if (typeof option === 'string') return [];
      const speech = speechForConcept(option.concept) ?? option.label;
      return speech ? [speech] : [];
    }),
  ]),
]);
