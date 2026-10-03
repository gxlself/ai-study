import { useEffect, useMemo, useRef, useState } from 'react';
import { PHRASES } from '@sprout/schema';
import type { WebProps } from '@sprout/schema';
import type { ActivityContext } from '@sprout/plugin-sdk';
import { Action, InputHint, Stage, Text, defineBuiltin, useNav, useSession, useTask } from '../shared';
import { checkWebTarget, webNonce, webTarget } from '../security';

function WebActivity({ ctx }: { ctx: ActivityContext<WebProps> }) {
  const s = useSession(ctx);
  const frame = useRef<HTMLIFrameElement>(null);
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  const [stopped, setStopped] = useState(ctx.signal.aborted);
  const [validated, setValidated] = useState<{ href: string; nonce: string } | null>(null);
  const { title, allowFullscreen, maxSec } = ctx.props;
  const target = useMemo(() => webTarget(ctx.props.url), [ctx.props.url]);
  useEffect(() => {
    setValidated(null);
    if (!target || s.paused || !s.active()) return;
    let active = true;
    const controller = new AbortController();
    const abort = () => controller.abort();
    s.signal.addEventListener('abort', abort, { once: true });
    const timeout = setTimeout(abort, 10_000);
    setStatus('loading');
    void checkWebTarget(target, controller.signal).then(() => {
      if (!active || controller.signal.aborted || !s.active()) return;
      const nonce = webNonce();
      const url = new URL(target);
      url.searchParams.set('sproutNonce', nonce);
      url.searchParams.set('sproutParentOrigin', window.location.origin);
      setValidated({ href: url.href, nonce });
    }).catch(() => {
      if (active && s.active() && !s.paused) { setStatus('error'); ctx.log('web:origin-rejected'); }
    }).finally(() => clearTimeout(timeout));
    return () => { active = false; controller.abort(); clearTimeout(timeout); s.signal.removeEventListener('abort', abort); };
  }, [ctx, s, target, attempt, s.paused]);

  const finish = (reason: string) => {
    if (!s.active() || s.paused) return;
    setStopped(true);
    s.complete({ data: { reason } });
  };
  useEffect(() => {
    const receive = (event: MessageEvent<unknown>) => {
      if (!s.active() || s.paused || !target || status !== 'loaded' || !validated || !frame.current) return;
      // 不给网页 allow-same-origin：最终文档始终是 opaque origin，随机值绑定本次 iframe。
      if (event.source !== frame.current.contentWindow || event.origin !== 'null') return;
      const data = event.data;
      if (!data || typeof data !== 'object' || Array.isArray(data)
        || !Object.prototype.hasOwnProperty.call(data, 'type')
        || (data as Record<string, unknown>).type !== 'sprout:complete'
        || (data as Record<string, unknown>).nonce !== validated.nonce) return;
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
  }, [ctx, s, target, status, validated]);

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
        {target && validated && !failed && !stopped && !s.paused && (
          <iframe key={attempt} ref={frame} src={validated.href}
            title={title ? ctx.locale.pick(title).primary : ctx.locale.pick({ zh: '网页互动', en: 'Web activity' }).primary}
            sandbox="allow-scripts" allowFullScreen={allowFullscreen}
            allow={`camera 'none'; microphone 'none'; geolocation 'none';${allowFullscreen ? ' fullscreen' : ''}`}
            referrerPolicy="no-referrer" data-focusable
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
