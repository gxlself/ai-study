import { useEffect, useMemo, useRef, useState } from 'react';
import { PHRASES } from '@sprout/schema';
import type { LText, SongProps } from '@sprout/schema';
import type { ActivityContext } from '@sprout/plugin-sdk';
import { Scene } from '../Scene';
import { createSongPlayer, parseNotes } from '../music';
import type { SongPlayer, SongPosition } from '../music';
import { Action, InputHint, Stage, Text, defineBuiltin, useNav, useSession, useTask } from '../shared';

function actionSymbol(action: LText) {
  if (/拍|clap/i.test(`${action.zh} ${action.en}`)) return '👏';
  if (/挥|招手|wave/i.test(`${action.zh} ${action.en}`)) return '👋';
  if (/脚|踏|走|步|stomp|walk/i.test(`${action.zh} ${action.en}`)) return '👣';
  return '♪';
}

function SongActivity({ ctx }: { ctx: ActivityContext<SongProps> }) {
  const s = useSession(ctx);
  const { lines, scene, title, actions, credit, repeat } = ctx.props;
  const player = useRef<SongPlayer | null>(null);
  const audio = useRef<AudioContext | null>(null);
  const [position, setPosition] = useState<SongPosition | null>(null);
  const [localPaused, setLocalPaused] = useState(false);
  const localPausedRef = useRef(false);
  const [waiting, setWaiting] = useState(false);
  const [finished, setFinished] = useState(false);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const starting = useRef(false);
  const noteRows = useMemo(() => {
    try { return lines.map((line) => parseNotes(line.notes, ctx.props.bpm)); }
    catch { return []; }
  }, [lines, ctx.props.bpm]);
  const currentLine = position?.line ?? 0;

  useEffect(() => {
    if (!s.active()) return;
    let stateChanged: (() => void) | undefined;
    const fail = (cause: unknown) => {
      if (!s.active()) return;
      player.current?.stop();
      setError(true);
      ctx.log('song:error', { message: cause instanceof Error ? cause.message : String(cause) });
    };
    try {
      const context = ctx.audioContext();
      audio.current = context;
      const melody = createSongPlayer({
        audio: context,
        lines,
        bpm: ctx.props.bpm,
        instrument: ctx.props.instrument,
        repeat,
        signal: s.signal,
        delay: s.delay,
        onNote(value) {
          if (!s.active()) return;
          setPosition(value);
          if (value.noteIndex === 0) ctx.log('song:line', { line: value.line, repetition: value.repetition });
        },
        onFinish() {
          if (!s.active()) return;
          setFinished(true);
          ctx.log('song:ended', { repeat });
        },
        onError: fail,
      });
      player.current = melody;
      stateChanged = () => { if (s.active()) setWaiting(context.state !== 'running'); };
      context.addEventListener('statechange', stateChanged);
      stateChanged();
      if (!s.paused && !localPausedRef.current) melody.resume();
    } catch (cause) { fail(cause); }
    return () => {
      player.current?.stop();
      player.current = null;
      if (stateChanged) audio.current?.removeEventListener('statechange', stateChanged);
    };
  }, [ctx, s, attempt]);

  useEffect(() => {
    if (s.paused || localPaused) player.current?.pause();
    else if (!error) player.current?.resume();
  }, [s, s.paused, localPaused, error]);

  useTask(s, async (signal) => {
    if (!finished) return;
    await s.delay(2200, signal);
    s.complete({ data: { lines: lines.length, repeat, credit } });
  }, [finished]);

  const toggle = () => {
    if (!s.active() || s.paused || finished || starting.current) return;
    if (error) {
      setError(false);
      setPosition(null);
      setAttempt((value) => value + 1);
      return;
    }
    const context = audio.current;
    if (!context) return;
    if (localPausedRef.current || waiting || context.state !== 'running') {
      starting.current = true;
      s.run(async () => {
        try {
          if (context.state !== 'running') await context.resume();
          if (!s.active() || s.paused) return;
          localPausedRef.current = false;
          setLocalPaused(false);
          setWaiting(context.state !== 'running');
          player.current?.resume();
          ctx.log('song:resume');
        } catch (cause) {
          setWaiting(true);
          ctx.log('song:play-blocked', { message: cause instanceof Error ? cause.message : String(cause) });
        } finally { starting.current = false; }
      });
    } else {
      localPausedRef.current = true;
      setLocalPaused(true);
      player.current?.pause();
      ctx.log('song:pause');
    }
  };
  useNav(ctx, (key) => {
    if (key !== 'ok') return false;
    toggle();
    return true;
  });

  const control = error ? { zh: '再试一次', en: 'Try again' }
    : localPaused || waiting ? { zh: '继续唱', en: 'Sing along' } : { zh: '暂停', en: 'Pause' };

  return (
    <Stage ctx={ctx} className="spa-media spa-song">
      <header className="spa-song-header">
        <Text ctx={ctx} text={title} className="spa-media-heading" />
        <Text ctx={ctx} text={PHRASES.singTogether} className="spa-media-caption" />
      </header>
      {scene && <Scene ctx={ctx} scene={scene} paused={s.paused || localPaused || waiting || finished || error}
        className="spa-song-scene" />}
      <div className="spa-song-lyrics" aria-live="off">
        {lines.map((line, i) => (
          <div key={i} className={`spa-song-line${currentLine === i ? ' spa-song-line--current' : ''}`}
            hidden={Math.abs(currentLine - i) > 1} aria-current={currentLine === i ? 'true' : undefined}>
            <p lang={line.lang}>{line.text}</p>
            {currentLine === i && (
              <div className="spa-song-notes" aria-hidden="true">
                {noteRows[i]?.map((note, n) => (
                  <span key={n} className={position?.noteIndex === n && !finished ? 'spa-song-note--current' : ''}
                    data-note={n} data-pitch={note.pitch}>{note.pitch === 'R' ? '―' : '♪'}</span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      {!!actions?.length && (
        <div className="spa-song-actions">
          {actions.map((action, i) => (
            <div key={i} className="spa-song-action">
              <span aria-hidden="true">{actionSymbol(action)}</span>
              <Text ctx={ctx} text={action} />
            </div>
          ))}
        </div>
      )}
      <div className="spa-song-controls">
        {finished ? <Text ctx={ctx} text={PHRASES.allDone} />
          : <Action ctx={ctx} onClick={toggle} label={ctx.locale.pick(control).primary} disabled={s.paused}>
            <span aria-hidden="true">{error ? '↻' : localPaused || waiting ? '▶' : 'Ⅱ'}</span>
          </Action>}
        {error && <Text ctx={ctx} text={{ zh: '声音暂时无法播放', en: 'Sound is unavailable' }} />}
        <InputHint ctx={ctx} />
        {error && <Action ctx={ctx} onClick={() => s.complete({ data: { reason: 'audio-unavailable' } })}>
          <Text ctx={ctx} text={PHRASES.allDone} />
        </Action>}
      </div>
      <small className="spa-song-credit">{credit}</small>
    </Stage>
  );
}

export const songActivity = defineBuiltin<SongProps>('song', SongActivity, (props) => [
  props.title, PHRASES.singTogether,
  ...props.lines.map((line) => ({ [line.lang]: line.text })),
]);
