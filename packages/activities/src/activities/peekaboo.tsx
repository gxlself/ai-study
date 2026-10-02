import { useRef, useState } from 'react';
import { PHRASES } from '@sprout/schema';
import type { PeekabooProps, Speech } from '@sprout/schema';
import type { ActivityContext } from '@sprout/plugin-sdk';
import {
  Action, ConceptImage, InputHint, Stage, Text, conceptSpeech, defineBuiltin,
  speechForConcept, useNav, useSession, useTask,
} from '../shared';

type Phase = 'show' | 'covering' | 'hidden' | 'revealing' | 'revealed';
type Frame = { index: number; phase: Phase };

function Cover({ kind }: { kind: PeekabooProps['cover'] }) {
  switch (kind) {
    case 'curtain':
      return <g fill="var(--sp-accent-2)" stroke="var(--sp-bg-sky)" strokeWidth="5">
        <path d="M6 8 H198 V386 Q152 363 103 386 Q55 363 6 386 Z" />
        <path d="M202 8 H394 V386 Q345 363 297 386 Q248 363 202 386 Z" />
        <path d="M45 18 V348 M94 18 V348 M144 18 V348 M252 18 V348 M302 18 V348 M351 18 V348" />
      </g>;
    case 'hands':
      return <g fill="var(--sp-accent)" stroke="var(--sp-ink)" strokeWidth="4" strokeLinejoin="round">
        {[false, true].map((flip) => <path key={String(flip)} transform={flip ? 'translate(400 0) scale(-1 1)' : undefined}
          d="M48 385 L43 260 L17 203 Q7 172 31 168 Q48 169 61 197 L67 211 L55 84 Q54 55 73 55 Q91 55 96 84 L106 161 L101 44 Q101 16 120 16 Q141 16 142 46 L146 156 L150 66 Q151 41 171 44 Q190 46 188 72 L184 169 L190 111 Q194 86 212 91 Q229 97 224 123 L207 263 Q201 299 180 322 L181 385 Z" />)}
      </g>;
    case 'box':
      return <g stroke="var(--sp-ink)" strokeWidth="5" strokeLinejoin="round">
        <rect x="28" y="92" width="344" height="290" rx="12" fill="var(--sp-warn)" />
        <rect x="12" y="30" width="376" height="100" rx="12" fill="var(--sp-accent)" />
        <path d="M172 31 H228 V382 H172 Z" fill="var(--sp-bg-grass)" />
      </g>;
    case 'leaf':
      return <g stroke="var(--sp-ok)" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M30 367 C-10 193 63 5 364 26 C396 316 224 402 30 367 Z" fill="var(--sp-bg-grass)" />
        <path d="M27 374 L331 62 M113 288 L80 164 M175 226 L168 91 M237 164 L235 60 M111 289 L242 318 M174 226 L309 229 M237 164 L338 150" fill="none" />
      </g>;
    case 'cloud':
      return <path d="M74 336 C-18 336-20 221 38 189 C4 96 105 51 157 95 C193 11 321 30 334 127 C414 124 424 222 376 253 C408 350 304 396 244 356 C173 397 100 385 74 336 Z"
        fill="var(--sp-surface)" stroke="var(--sp-accent-2)" strokeWidth="7" strokeLinejoin="round" />;
  }
}

function PeekabooActivity({ ctx }: { ctx: ActivityContext<PeekabooProps> }) {
  const s = useSession(ctx);
  const { items, cover, hideSec } = ctx.props;
  const ask = ctx.props.ask ?? PHRASES.whereDidItGo;
  const reveal = ctx.props.reveal ?? PHRASES.peekaboo;
  const [frame, setFrame] = useState<Frame>({ index: 0, phase: 'show' });
  const current = useRef(frame);
  const manualReveals = useRef(0);
  const ref = items[frame.index];
  const name = conceptSpeech(ctx, ref);

  const move = (phase: Phase, index = frame.index, expected = frame) => {
    if (!s.active() || s.paused || current.current !== expected) return;
    const next = { phase, index };
    current.current = next;
    setFrame(next);
  };
  const next = (expected = frame) => {
    if (!s.active() || s.paused || current.current !== expected) return;
    if (expected.index + 1 === items.length) {
      s.complete({ data: { items: items.length, manualReveals: manualReveals.current } });
    } else {
      move('show', expected.index + 1, expected);
    }
  };
  const interact = () => {
    if (!s.active() || s.paused || current.current !== frame) return;
    if (frame.phase === 'hidden') {
      manualReveals.current += 1;
      ctx.log('peekaboo:reveal', { index: frame.index, source: 'input' });
      move('revealing');
    } else if (frame.phase === 'revealed') {
      ctx.log('peekaboo:next', { index: frame.index, source: 'input' });
      next();
    }
  };

  useTask(s, async (signal) => {
    ctx.log('peekaboo:phase', { index: frame.index, phase: frame.phase });
    switch (frame.phase) {
      case 'show':
        await s.speak(name, signal);
        await s.delay(1200, signal);
        move('covering');
        break;
      case 'covering':
        await s.delay(900, signal);
        move('hidden');
        break;
      case 'hidden':
        await s.speak(ask, signal);
        await s.delay(hideSec * 1000, signal);
        if (current.current === frame) {
          ctx.log('peekaboo:reveal', { index: frame.index, source: 'timer' });
          move('revealing');
        }
        break;
      case 'revealing':
        await s.delay(900, signal);
        await s.speak(reveal, signal);
        await s.speak(name, signal);
        s.sfx('chime');
        move('revealed');
        break;
      case 'revealed':
        await s.delay(1800, signal);
        next();
    }
  }, [frame]);

  useNav(ctx, (key) => {
    if (key !== 'ok') return false;
    interact();
    return true;
  });

  const prompt = frame.phase === 'hidden' || frame.phase === 'covering' ? ask
    : frame.phase === 'revealing' || frame.phase === 'revealed' ? reveal : name;

  return <Stage ctx={ctx} className="spa-early spa-peekaboo">
    <Action ctx={ctx} onClick={interact} className="spa-peekaboo-target"
      label={ctx.locale.pick(frame.phase === 'hidden' ? ask : { zh: '躲猫猫', en: 'Peekaboo' }).primary}>
      <span className="spa-peekaboo-scene" data-phase={frame.phase}>
        <span className="spa-peekaboo-object" aria-hidden={frame.phase === 'hidden'}>
          <ConceptImage ctx={ctx} concept={ref} />
        </span>
        <svg key={`${frame.index}-${frame.phase}`} className="spa-peekaboo-cover" data-phase={frame.phase}
          data-cover={cover} viewBox="0 0 400 400" aria-hidden="true"><Cover kind={cover} /></svg>
      </span>
    </Action>
    <div className="spa-peekaboo-caption" aria-live="polite">
      {prompt && <Text ctx={ctx} text={prompt} />}
    </div>
    <InputHint ctx={ctx} />
  </Stage>;
}

export const peekabooActivity = defineBuiltin<PeekabooProps>('peekaboo', PeekabooActivity, (props) => [
  props.ask ?? PHRASES.whereDidItGo,
  props.reveal ?? PHRASES.peekaboo,
  ...props.items.map(speechForConcept).filter((speech): speech is Speech => !!speech),
]);
