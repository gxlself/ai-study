import { useCallback, useEffect, useRef, useState } from 'react';
import { PHRASES } from '@sprout/schema';
import type { VideoProps } from '@sprout/schema';
import type { ActivityContext } from '@sprout/plugin-sdk';
import { Action, InputHint, Stage, Text, defineBuiltin, useNav, useSession, useTask } from '../shared';

function VideoActivity({ ctx }: { ctx: ActivityContext<VideoProps> }) {
  const s = useSession(ctx);
  const media = useRef<HTMLVideoElement>(null);
  const request = useRef(0);
  const pending = useRef(false);
  const wantedPlaying = useRef(false);
  const resumeAfterPause = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState(false);
  const [stopped, setStopped] = useState(false);
  const { src, poster, title, captions, maxSec } = ctx.props;

  const finish = useCallback((reason: string) => {
    if (!s.active() || s.paused) return;
    request.current += 1;
    pending.current = false;
    wantedPlaying.current = false;
    const video = media.current;
    video?.pause();
    const currentTime = video && Number.isFinite(video.currentTime) ? video.currentTime : 0;
    setStopped(true);
    s.complete({ data: { reason, watchedSec: Math.min(currentTime, maxSec ?? Infinity) } });
  }, [s, maxSec]);

  const play = useCallback(() => {
    const video = media.current;
    if (!video || !s.active() || s.paused || pending.current) return;
    const id = ++request.current;
    pending.current = true;
    wantedPlaying.current = true;
    setError(false);
    s.run(async () => {
      try {
        if (video.error) video.load();
        await video.play();
        if (id !== request.current || !s.active() || s.paused) {
          if (!wantedPlaying.current || !s.active() || s.paused) video.pause();
          return;
        }
        setPlaying(true);
        ctx.log('video:play', { time: video.currentTime });
      } catch (cause) {
        if (id !== request.current || !s.active()) return;
        wantedPlaying.current = false;
        setPlaying(false);
        setError(true);
        ctx.log('video:play-failed', { message: cause instanceof Error ? cause.message : String(cause) });
      } finally {
        if (id === request.current) pending.current = false;
      }
    });
  }, [ctx, s]);

  const toggle = () => {
    const video = media.current;
    if (!video || !s.active() || s.paused) return;
    if (!video.paused || pending.current) {
      request.current += 1;
      pending.current = false;
      wantedPlaying.current = false;
      video.pause();
      setPlaying(false);
      ctx.log('video:pause', { time: video.currentTime });
    } else play();
  };

  useEffect(() => {
    const video = media.current;
    const stop = () => {
      request.current += 1;
      pending.current = false;
      wantedPlaying.current = false;
      video?.pause();
      video?.removeAttribute('src');
      video?.load();
      setStopped(true);
    };
    s.signal.addEventListener('abort', stop, { once: true });
    if (s.signal.aborted) stop();
    return () => {
      s.signal.removeEventListener('abort', stop);
      request.current += 1;
      wantedPlaying.current = false;
      video?.pause();
      video?.removeAttribute('src');
      video?.load();
    };
  }, [s]);

  useEffect(() => {
    const video = media.current;
    if (!video) return;
    if (s.paused) {
      resumeAfterPause.current = !video.paused || pending.current;
      request.current += 1;
      pending.current = false;
      wantedPlaying.current = false;
      video.pause();
      setPlaying(false);
    } else if (resumeAfterPause.current) {
      resumeAfterPause.current = false;
      play();
    }
  }, [s, s.paused, play]);

  useTask(s, async (signal) => {
    if (title) await s.speak(title, signal);
  }, []);
  useTask(s, async (signal) => {
    if (maxSec === undefined || !playing) return;
    while (!signal.aborted && s.active()) {
      await s.delay(200, signal);
      if (media.current && media.current.currentTime >= maxSec) {
        finish('max-duration');
        return;
      }
    }
  }, [maxSec, playing]);
  useNav(ctx, (key) => {
    if (key !== 'ok') return false;
    const focused = ctx.focus.current();
    if (focused?.classList.contains('spa-video-finish')) focused.click();
    else toggle();
    return true;
  });
  const control = playing ? { zh: '暂停', en: 'Pause' } : { zh: '播放', en: 'Play' };

  return (
    <Stage ctx={ctx} className="spa-media spa-video">
      {title && <Text ctx={ctx} text={title} className="spa-media-heading" />}
      <div className="spa-video-screen">
        {!stopped && (
          <video ref={media} src={ctx.resolveAsset(src)} poster={poster ? ctx.resolveAsset(poster) : undefined}
            playsInline preload="metadata" controls={false}
            aria-label={title ? ctx.locale.pick(title).primary : ctx.locale.pick({ zh: '视频', en: 'Video' }).primary}
            onPlay={() => {
              if (!s.active() || s.paused) { media.current?.pause(); return; }
              ctx.stopSpeaking();
              setPlaying(true);
            }}
            onPause={() => setPlaying(false)}
            onEnded={() => finish('ended')}
            onTimeUpdate={() => {
              if (maxSec !== undefined && media.current && media.current.currentTime >= maxSec) finish('max-duration');
            }}
            onError={() => {
              if (!s.active()) return;
              setError(true);
              setPlaying(false);
              ctx.log('video:error', { code: media.current?.error?.code });
            }}>
            {captions && <track kind="captions" src={ctx.resolveAsset(captions)} default
              srcLang={ctx.locale.mode.startsWith('en') ? 'en' : 'zh'}
              label={ctx.locale.pick({ zh: '字幕', en: 'Captions' }).primary} />}
          </video>
        )}
        {!playing && !stopped && (
          <div className="spa-video-overlay">
            <Action ctx={ctx} onClick={toggle} label={ctx.locale.pick(control).primary}
              disabled={s.paused} className="spa-video-play">
              <span aria-hidden="true">{error ? '↻' : '▶'}</span>
            </Action>
          </div>
        )}
      </div>
      <div className="spa-video-controls">
        {playing && <Action ctx={ctx} onClick={toggle} label={ctx.locale.pick(control).primary} disabled={s.paused}>
          <span aria-hidden="true">Ⅱ</span>
        </Action>}
        <InputHint ctx={ctx} />
        {error && (
          <>
            <Text ctx={ctx} text={{ zh: '视频暂时无法播放', en: 'Video is unavailable' }} />
            <Action ctx={ctx} onClick={() => finish('unavailable')} className="spa-video-finish">
              <Text ctx={ctx} text={PHRASES.allDone} />
            </Action>
          </>
        )}
      </div>
    </Stage>
  );
}

export const videoActivity = defineBuiltin<VideoProps>('video', VideoActivity, (props) => props.title ? [props.title] : []);
