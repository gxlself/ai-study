import { useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { PHRASES } from '@sprout/schema';
import type { CalmProps } from '@sprout/schema';
import type { ActivityContext } from '@sprout/plugin-sdk';
import { Action, InputHint, Stage, Text, defineBuiltin, useNav, useSession, useTask } from '../shared';

type Breath = { cycle: number; phase: 'intro' | 'inhale' | 'exhale' };

function CalmDrawing({ visual }: { visual: CalmProps['visual'] }) {
  switch (visual) {
    case 'balloon':
      return <g stroke="var(--sp-ink)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M100 143 C80 159 124 169 98 193" fill="none" />
        <path d="M100 136 L89 151 L112 151 Z" fill="var(--sp-accent)" />
        <ellipse cx="100" cy="77" rx="63" ry="71" fill="var(--sp-accent)" />
        <path d="M65 77 Q61 47 82 33" fill="none" stroke="var(--sp-surface)" strokeWidth="9" />
      </g>;
    case 'star':
      return <path d="M100 16 L125 70 L183 77 L141 120 L151 180 L100 152 L49 180 L59 120 L17 77 L75 70 Z"
        fill="var(--sp-warn)" stroke="var(--sp-ink)" strokeWidth="3" strokeLinejoin="round" />;
    case 'flower':
      return <g stroke="var(--sp-ink)" strokeWidth="3">
        <path d="M100 115 V190" stroke="var(--sp-ok)" strokeWidth="8" strokeLinecap="round" />
        <path d="M100 178 Q57 177 54 148 Q84 145 100 178 Z" fill="var(--sp-bg-grass)" />
        {[0, 60, 120, 180, 240, 300].map((angle) => <ellipse key={angle} cx="100" cy="48" rx="25" ry="36"
          transform={`rotate(${angle} 100 88)`} fill="var(--sp-accent)" />)}
        <circle cx="100" cy="88" r="29" fill="var(--sp-warn)" />
      </g>;
    case 'moon':
      return <g fill="var(--sp-warn)">
        <path d="M137 19 A83 83 0 1 0 183 137 A80 80 0 0 1 137 19 Z" stroke="var(--sp-ink)" strokeWidth="3" strokeLinejoin="round" />
        <circle cx="54" cy="106" r="11" fill="var(--sp-bg-2)" />
        <circle cx="92" cy="157" r="8" fill="var(--sp-bg-2)" />
      </g>;
  }
}

function CalmActivity({ ctx }: { ctx: ActivityContext<CalmProps> }) {
  const s = useSession(ctx);
  const { visual, cycles, inhaleSec, exhaleSec, say } = ctx.props;
  const [breath, setBreath] = useState<Breath>({ cycle: 0, phase: 'intro' });
  const [request, setRequest] = useState<{ breath: Breath; id: number } | null>(null);
  const replayLock = useRef(false);
  const requestId = useRef(0);
  const phrase = breath.phase === 'inhale' ? PHRASES.breatheIn
    : breath.phase === 'exhale' ? PHRASES.breatheOut : say ?? PHRASES.breatheIntro;

  useTask(s, async (signal) => {
    await s.speak(say ?? PHRASES.breatheIntro, signal);
    for (let cycle = 0; cycle < cycles; cycle += 1) {
      await s.delay(0, signal);
      setBreath({ cycle, phase: 'inhale' });
      ctx.log('calm:breath', { cycle, phase: 'inhale' });
      await s.delay(inhaleSec * 1000, signal);
      setBreath({ cycle, phase: 'exhale' });
      ctx.log('calm:breath', { cycle, phase: 'exhale' });
      await s.delay(exhaleSec * 1000, signal);
    }
    s.complete({ data: { cycles, inhaleSec, exhaleSec } });
  }, []);

  useTask(s, async (signal) => {
    if (!request || request.breath !== breath) return;
    try {
      await s.speak(phrase, signal);
    } finally {
      if (requestId.current === request.id) replayLock.current = false;
    }
  }, [request, breath]);

  const reread = () => {
    if (!s.active() || s.paused || breath.phase === 'intro' || replayLock.current) return;
    replayLock.current = true;
    requestId.current += 1;
    ctx.log('calm:repeat', { cycle: breath.cycle, phase: breath.phase });
    setRequest({ breath, id: requestId.current });
  };
  useNav(ctx, (key) => {
    if (key !== 'ok') return false;
    reread();
    return true;
  });

  return <Stage ctx={ctx} className="spa-early spa-calm">
    <div className={`spa-calm-night${breath.phase === 'intro' ? '' : ' spa-calm-night--started'}`} aria-hidden="true"
      style={{ '--spa-calm-duration': `${cycles * (inhaleSec + exhaleSec)}s` } as CSSProperties} />
    <Action ctx={ctx} onClick={reread} className="spa-calm-target" label={ctx.locale.pick(phrase).primary}>
      <span key={`${breath.cycle}-${breath.phase}`} className={`spa-calm-visual spa-calm-visual--${breath.phase}`}
        style={{ '--spa-breath-duration': `${breath.phase === 'inhale' ? inhaleSec : exhaleSec}s` } as CSSProperties}>
        <svg viewBox="0 0 200 200" data-visual={visual} aria-hidden="true"><CalmDrawing visual={visual} /></svg>
      </span>
    </Action>
    <div className="spa-calm-copy" data-phase={breath.phase} aria-live="polite">
      <Text ctx={ctx} text={phrase} />
      <span className="spa-early-counter">{breath.cycle + 1} / {cycles}</span>
    </div>
    <InputHint ctx={ctx} />
  </Stage>;
}

export const calmActivity = defineBuiltin<CalmProps>('calm', CalmActivity, (props) => [
  props.say ?? PHRASES.breatheIntro, PHRASES.breatheIn, PHRASES.breatheOut,
]);
