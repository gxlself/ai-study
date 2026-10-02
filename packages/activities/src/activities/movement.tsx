import { useRef, useState } from 'react';
import { PHRASES } from '@sprout/schema';
import type { MovementProps } from '@sprout/schema';
import type { ActivityContext } from '@sprout/plugin-sdk';
import { Action, ConceptImage, InputHint, Stage, Text, defineBuiltin, useNav, useSession, useTask } from '../shared';

function MovementActivity({ ctx }: { ctx: ActivityContext<MovementProps> }) {
  const s = useSession(ctx);
  const { moves, intro, bpm } = ctx.props;
  const [index, setIndex] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const introduced = useRef(false);
  const skipped = useRef(0);
  const move = moves[index];
  const finished = index >= moves.length;
  const duration = move ? move.seconds * 1000 : 1;
  const fraction = Math.min(1, elapsed / duration);

  useTask(s, async (signal) => {
    if (finished) {
      await s.speak(PHRASES.moveDone, signal);
      await s.delay(900, signal);
      s.complete({ data: { moves: moves.length, skipped: skipped.current } });
      return;
    }
    setElapsed(0);
    if (!introduced.current) {
      introduced.current = true;
      if (intro) await s.speak(intro, signal);
    }
    ctx.log('movement:move', { move: index });
    await s.speak(move.say, signal);
    const beatMs = bpm ? 60_000 / bpm : Infinity;
    let nextBeat = 0;
    let time = 0;
    while (time < duration) {
      if (bpm && time >= nextBeat) {
        s.sfx('tap');
        nextBeat += beatMs;
      }
      const delta = Math.min(100, duration - time, bpm ? nextBeat - time : Infinity);
      await s.delay(delta, signal);
      if (signal.aborted) return;
      time += delta;
      setElapsed(time);
    }
    setIndex((value) => value + 1);
  }, [index]);

  const skip = () => {
    if (!s.active() || s.paused || finished) return;
    skipped.current += 1;
    ctx.log('movement:skip', { move: index });
    setElapsed(0);
    setIndex((value) => Math.min(value + 1, moves.length));
  };
  useNav(ctx, (key) => {
    if (key !== 'ok') return false;
    skip();
    return true;
  });

  return (
    <Stage ctx={ctx} className="spa-media spa-movement">
      {finished ? <Text ctx={ctx} text={PHRASES.moveDone} className="spa-media-heading" /> : (
        <>
          <div className="spa-movement-top">
            <span className="spa-media-counter">{index + 1} / {moves.length}</span>
            <div className="spa-movement-timer" role="timer"
              aria-label={ctx.locale.pick({ zh: '剩余秒数', en: 'Seconds remaining' }).primary}>
              <svg viewBox="0 0 100 100" aria-hidden="true">
                <circle className="spa-movement-track" cx="50" cy="50" r="42" />
                <circle className="spa-movement-progress" cx="50" cy="50" r="42"
                  pathLength="100" strokeDasharray="100" strokeDashoffset={fraction * 100} />
              </svg>
              <span>{Math.max(0, Math.ceil((duration - elapsed) / 1000))}</span>
            </div>
          </div>
          <ConceptImage ctx={ctx} concept={move.concept} image={move.image} className="spa-movement-image" />
          <Text ctx={ctx} text={move.name} className="spa-media-heading" />
          <div className="spa-media-navigation">
            <InputHint ctx={ctx} />
            <Action ctx={ctx} onClick={skip} disabled={s.paused}
              label={ctx.locale.pick({ zh: '下一个动作', en: 'Next movement' }).primary}>
              <span aria-hidden="true">→</span>
            </Action>
          </div>
        </>
      )}
    </Stage>
  );
}

export const movementActivity = defineBuiltin<MovementProps>('movement', MovementActivity, (props) => [
  ...(props.intro ? [props.intro] : []),
  ...props.moves.map((move) => move.say),
  PHRASES.moveDone,
]);
