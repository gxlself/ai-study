import { useEffect, useMemo, useRef, useState } from 'react';
import { PHRASES } from '@sprout/schema';
import type { WebProps } from '@sprout/schema';
import type { ActivityContext } from '@sprout/plugin-sdk';
import { Action, InputHint, Stage, Text, defineBuiltin, useNav, useSession, useTask } from '../shared';

function WebActivity({ ctx }: { ctx: ActivityContext<WebProps> }) {
  const s = useSession(ctx);
  const frame = useRef<HTMLIFrameElement>(null);
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  const [stopped, setStopped] = useState(ctx.signal.aborted);
  const { title, allowFullscreen, maxSec } = ctx.props;
  const target = useMemo(() => {
    try {
      const url = new URL(ctx.props.url);
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.origin === 'null') return null;
      // 双 sandbox 权限下，同源页面可移除 sandbox，必须使用独立来源。
      if (url.origin === window.location.origin) return null;
      return url;
    } catch { return null; }
  }, [ctx.props.url]);

  const finish = (reason: string) => {
    if (!s.active() || s.paused) return;
    setStopped(true);
    s.complete({ data: { reason } });
  };
  useEffect(() => {
    const receive = (event: MessageEvent<unknown>) => {
      if (!s.active() || s.paused || !target || status === 'error' || !frame.current) return;
      if (event.source !== frame.current.contentWindow || event.origin !== target.origin) return;
      const data = event.data;
      if (!data || typeof data !== 'object' || Array.isArray(data)
        || !Object.prototype.hasOwnProperty.call(data, 'type')
        || (data as Record<string, unknown>).type !== 'sprout:complete') return;
      ctx.log('web:complete-message', { origin: target.origin });
      finish('message');
    };
    const abort = () => setStopped(true);
    window.addEventListener('message', receive);
    s.signal.addEventListener('abort', abort, { once: true });
    if (s.signal.aborted) abort();
    return () => {
      window.removeEventListener('message', receive);
      s.signal.removeEventListener('abort', abort);
    };
  }, [ctx, s, target, status]);

  useEffect(() => {
    if (!s.paused && s.active()) setStatus('loading');
  }, [s, s.paused]);

  useTask(s, async (signal) => {
    if (maxSec === undefined) return;
    await s.delay(maxSec * 1000, signal);
    finish('max-duration');
  }, [maxSec]);
  useTask(s, async (signal) => {
    if (!target || status !== 'loading' || s.paused) return;
    await s.delay(15_000, signal);
    if (!signal.aborted && s.active()) {
      setStatus('error');
      ctx.log('web:load-timeout');
    }
  }, [status, attempt, s.paused]);

  const retry = () => {
    if (!s.active() || s.paused) return;
    ctx.log('web:retry');
    setStatus('loading');
    setAttempt((value) => value + 1);
  };
  useNav(ctx, (key) => {
    if (key !== 'ok') return false;
    const focused = ctx.focus.current();
    if (focused && focused !== frame.current) { focused.click(); return true; }
    if (status === 'error') { retry(); return true; }
    return false;
  });
  const failed = !target || status === 'error';

  return (
    <Stage ctx={ctx} className="spa-media spa-web">
      {title && <Text ctx={ctx} text={title} className="spa-media-heading" />}
      <div className="spa-web-screen" aria-busy={status === 'loading' && !failed && !s.paused}>
        {target && !failed && !stopped && !s.paused && (
          <iframe key={attempt} ref={frame} src={target.href}
            title={title ? ctx.locale.pick(title).primary : ctx.locale.pick({ zh: '网页互动', en: 'Web activity' }).primary}
            sandbox="allow-scripts allow-same-origin" allowFullScreen={allowFullscreen}
            allow={allowFullscreen ? 'fullscreen' : undefined} referrerPolicy="no-referrer" data-focusable
            onLoad={() => {
              if (!s.active()) return;
              setStatus('loaded');
              ctx.log('web:loaded', { origin: target.origin });
            }}
            onError={() => {
              if (!s.active()) return;
              setStatus('error');
              ctx.log('web:load-error', { origin: target.origin });
            }} />
        )}
        {!stopped && (s.paused || failed || status === 'loading') && (
          <div className="spa-web-status" role="status">
            <Text ctx={ctx} text={s.paused ? PHRASES.restTime
              : failed ? { zh: '页面暂时无法打开', en: 'This page is unavailable' }
                : { zh: '正在打开…', en: 'Loading…' }} />
            {failed && !s.paused && (
              <div className="spa-web-recovery">
                {target && <Action ctx={ctx} onClick={retry}
                  label={ctx.locale.pick({ zh: '重新打开', en: 'Retry' }).primary}>
                  <span aria-hidden="true">↻</span>
                </Action>}
                <Action ctx={ctx} onClick={() => finish('unavailable')}>
                  <Text ctx={ctx} text={PHRASES.allDone} />
                </Action>
              </div>
            )}
          </div>
        )}
      </div>
      <InputHint ctx={ctx} />
    </Stage>
  );
}

export const webActivity = defineBuiltin<WebProps>('web', WebActivity, () => []);
