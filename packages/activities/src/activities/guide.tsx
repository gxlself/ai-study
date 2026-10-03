import { useLayoutEffect, useRef, useState } from 'react';
import type { GuideProps } from '@sprout/schema';
import { useActivityKeys, type ActivityContext } from '@sprout/plugin-sdk';
import { Action, ConceptImage, InputHint, Stage, defineBuiltin, useSession, useTask } from '../shared';
import { ReadingArea, scrollReadingArea } from '../ReadingArea';

const reactions = [
  { value: 'liked', label: '很喜欢' },
  { value: 'neutral', label: '一般' },
  { value: 'not-yet', label: '还不感兴趣' },
] as const;
type Reaction = typeof reactions[number]['value'];
type Phase = 'read' | 'play' | 'reaction';

function timeLabel(ms: number) {
  const seconds = Math.ceil(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function GuideActivity({ ctx }: { ctx: ActivityContext<GuideProps> }) {
  const s = useSession(ctx);
  const props = ctx.props;
  const duration = Math.ceil(props.playMin * 60_000);
  const [phase, setPhase] = useState<Phase>('read');
  const phaseRef = useRef<Phase>('read');
  const [remaining, setRemaining] = useState(duration);
  const [controls, setControls] = useState(false);
  const controlsRef = useRef(false);
  const [selected, setSelected] = useState(0);
  const readArea = useRef<HTMLDivElement>(null);
  const readFooter = useRef<HTMLElement>(null);
  const wakeButton = useRef<HTMLButtonElement>(null);
  const endButton = useRef<HTMLButtonElement>(null);
  const reactionButtons = useRef<(HTMLButtonElement | null)[]>([]);
  const elapsed = useRef(0);
  const reason = useRef<'elapsed' | 'manual'>('elapsed');
  const answered = useRef(false);

  function enter(next: Phase) {
    phaseRef.current = next;
    setPhase(next);
  }
  function start() {
    if (!s.active() || s.paused || phaseRef.current !== 'read') return;
    ctx.log('guide:start', { playMin: props.playMin });
    if (duration === 0) {
      s.complete({ data: { playMin: 0, playedSec: 0 } });
      return;
    }
    ctx.stopSpeaking();
    ctx.setParentHint(null);
    enter('play');
  }
  function finish(manual: boolean) {
    if (!s.active() || s.paused || phaseRef.current !== 'play') return;
    reason.current = manual ? 'manual' : 'elapsed';
    ctx.log('guide:play-end', { reason: reason.current, playedSec: Math.floor(elapsed.current / 1000) });
    if (!manual) s.sfx('chime');
    enter('reaction');
  }
  function reveal() {
    if (!s.active() || s.paused || phaseRef.current !== 'play') return;
    if (!controlsRef.current) {
      controlsRef.current = true;
      setControls(true);
      ctx.log('guide:controls');
    }
  }
  function react(value: Reaction) {
    if (!s.active() || s.paused || phaseRef.current !== 'reaction' || answered.current) return;
    answered.current = true;
    ctx.log('reaction', { value });
    s.complete({ data: {
      reaction: value, playMin: props.playMin,
      playedSec: Math.floor(elapsed.current / 1000), reason: reason.current,
    } });
  }

  useTask(s, async (signal) => {
    if (phase !== 'play') return;
    while (elapsed.current < duration) {
      const step = Math.min(1000, duration - elapsed.current);
      await s.delay(step, signal);
      if (signal.aborted || phaseRef.current !== 'play') return;
      elapsed.current += step;
      setRemaining(duration - elapsed.current);
    }
    finish(false);
  }, [phase]);

  useLayoutEffect(() => {
    ctx.focus.refresh();
    if (phase === 'read') ctx.focus.focus(readFooter.current?.querySelector('.spa-guide-start') ?? null);
    if (phase === 'play') ctx.focus.focus(controls ? endButton.current : wakeButton.current);
    if (phase === 'reaction') ctx.focus.focus(reactionButtons.current[0]);
  }, [ctx, phase, controls]);

  useActivityKeys((key) => {
    if (key === 'back') {
      if (phaseRef.current === 'play') reveal();
      return false;
    }
    if (!s.active() || s.paused) return true;
    if (phaseRef.current === 'play') {
      if (!controlsRef.current) reveal();
      else if (key === 'ok') finish(true);
      return true;
    }
    if (phaseRef.current === 'read') {
      if (key === 'ok') start();
      else if (key === 'up' || key === 'down') {
        scrollReadingArea(readArea.current, key, ctx.reducedMotion);
      }
      return key !== 'left' && key !== 'right';
    }
    if (key === 'ok') react(reactions[selected].value);
    else {
      const next = (selected + (key === 'right' || key === 'down' ? 1 : reactions.length - 1)) % reactions.length;
      setSelected(next);
      ctx.focus.focus(reactionButtons.current[next]);
    }
    return true;
  });

  return <Stage ctx={ctx} className={`spa-guide spa-guide--${phase}`}>
    {phase === 'read' && <>
      <header className="spa-guide-goal"><span>给家长的陪玩指引</span><h2>{props.goal}</h2></header>
      <ReadingArea areaRef={readArea} className="spa-guide-reading" label="家长陪玩指引">
        <div className="spa-guide-columns">
        <section className="spa-guide-section spa-guide-playbook">
          <h3>一起这样玩</h3>
          <ol className="spa-guide-steps">{props.steps.map((step, index) => <li key={index}>
            <span className="spa-guide-step-number" aria-hidden="true">{index + 1}</span>
            <div className="spa-guide-step-body">
              <p>{step.text}</p>
              {(step.say?.zh || step.say?.en) && <div className="spa-guide-say">
                <strong>可以这样说</strong>
                {step.say.zh && <p lang="zh">{step.say.zh}</p>}
                {step.say.en && <p lang="en">{step.say.en}</p>}
              </div>}
            </div>
            {(step.concept || step.image) && <figure className="spa-guide-figure">
              <ConceptImage ctx={ctx} concept={step.concept} image={step.image}
                alt={step.concept ? ctx.concept(step.concept)?.zh ?? '陪玩示意' : '陪玩示意'} />
              <figcaption>{step.concept ? ctx.concept(step.concept)?.zh ?? '陪玩示意' : '陪玩示意'}</figcaption>
            </figure>}
          </li>)}</ol>
        </section>
        <aside className="spa-guide-notes">
        {!!props.materials.length && <section className="spa-guide-section">
          <h3>准备材料</h3>
          <ul className="spa-guide-materials">{props.materials.map((item, index) => <li key={index}>{item}</li>)}</ul>
        </section>}
        {!!props.observe?.length && <section className="spa-guide-section">
          <h3>留意宝宝的反应</h3>
          <ul>{props.observe.map((item, index) => <li key={index}>{item}</li>)}</ul>
        </section>}
        {props.safety && <section className="spa-guide-section spa-guide-safety">
          <h3>安全提醒</h3><p>{props.safety}</p>
        </section>}
        </aside>
        </div>
      </ReadingArea>
      <footer className="spa-guide-footer" ref={readFooter}>
        <InputHint ctx={ctx} />
        <Action ctx={ctx} className="spa-guide-start" onClick={start}>
          {props.playMin > 0 ? `开始陪玩 ${props.playMin} 分钟` : '完成'}
        </Action>
      </footer>
    </>}
    {phase === 'play' && <>
      <button className="spa-guide-wake" type="button" data-focusable ref={wakeButton}
        aria-label="显示陪玩选项" onClick={reveal}>
        <span className="spa-guide-dot" aria-hidden="true" />
        <span className="spa-guide-timer" role="timer" aria-label="剩余陪玩时间" aria-live="off">{timeLabel(remaining)}</span>
      </button>
      {controls && <button type="button" data-focusable className="spa-guide-end" ref={endButton}
        disabled={s.paused} onClick={() => finish(true)}>结束陪玩</button>}
    </>}
    {phase === 'reaction' && <div className="spa-guide-reaction">
      <h2>宝宝今天的反应？</h2>
      <div className="spa-guide-reactions">
        {reactions.map((reaction, index) => <button type="button" data-focusable className="spa-action"
          key={reaction.value} ref={(el) => { reactionButtons.current[index] = el; }}
          disabled={s.paused} onClick={() => react(reaction.value)}>{reaction.label}</button>)}
      </div>
      <InputHint ctx={ctx} />
    </div>}
  </Stage>;
}

// “可以这样说”只供家长阅读，不能进入 TTS 收集或自动朗读。
export const guideActivity = {
  ...defineBuiltin<GuideProps>('guide', GuideActivity),
  speeches: (_props: GuideProps) => [],
};
