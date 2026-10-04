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
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

const PROGRESS_RADIUS = 43;
const PROGRESS_LENGTH = 2 * Math.PI * PROGRESS_RADIUS;

function GuideActivity({ ctx }: { ctx: ActivityContext<GuideProps> }) {
  const s = useSession(ctx);
  const props = ctx.props;
  const duration = Math.ceil(props.playMin * 60_000);
  const [phase, setPhase] = useState<Phase>('read');
  const phaseRef = useRef<Phase>('read');
  const [remaining, setRemaining] = useState(duration);
  const [selected, setSelected] = useState(0);
  const readArea = useRef<HTMLDivElement>(null);
  const readFooter = useRef<HTMLElement>(null);
  const endButton = useRef<HTMLButtonElement>(null);
  const reviewButton = useRef<HTMLButtonElement>(null);
  const reactionButtons = useRef<(HTMLButtonElement | null)[]>([]);
  const elapsed = useRef(0);
  const reason = useRef<'elapsed' | 'manual'>('elapsed');
  const answered = useRef(false);
  const firstSay = props.steps.find((step) => step.say?.zh || step.say?.en)?.say;

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
  function review() {
    if (!s.active() || s.paused || phaseRef.current !== 'play') return;
    ctx.log('guide:review');
    enter('read');
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
    if (phase === 'play') ctx.focus.focus(endButton.current);
    if (phase === 'reaction') ctx.focus.focus(reactionButtons.current[0]);
  }, [ctx, phase]);

  useActivityKeys((key) => {
    if (key === 'back') return false;
    if (!s.active() || s.paused) return true;
    if (phaseRef.current === 'play') {
      if (key === 'ok') {
        if (ctx.focus.current() === reviewButton.current) review();
        else finish(true);
      } else if (key === 'left' || key === 'right') {
        ctx.focus.focus(ctx.focus.current() === endButton.current ? reviewButton.current : endButton.current);
      }
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
      <p className="spa-guide-reading-note">这节是给家长看的：读完点「开始陪玩」，屏幕会调暗，你去和宝宝玩。</p>
      <ReadingArea areaRef={readArea} className="spa-guide-reading" label="家长陪玩指引">
        <div className="spa-guide-columns">
          <section className="spa-guide-section spa-guide-playbook">
            <h3>一起这样玩</h3>
            <ol className="spa-guide-steps">{props.steps.map((step, index) => {
              const illustrationLabel = (step.concept && ctx.concept(step.concept)?.zh) || '陪玩示意';
              return <li key={index}>
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
                  <ConceptImage ctx={ctx} concept={step.concept} image={step.image} alt={illustrationLabel} />
                  <figcaption>{illustrationLabel}</figcaption>
                </figure>}
              </li>;
            })}</ol>
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
      <header className="spa-guide-play-header">
        <p>陪玩进行中 · 屏幕已调暗，宝宝不用看屏幕</p>
      </header>
      <main className="spa-guide-play-main">
        <section className="spa-guide-play-timer" aria-label="剩余陪玩时间">
          <div className="spa-guide-timer-ring">
            <svg className="spa-guide-progress-ring" viewBox="0 0 100 100" aria-hidden="true">
              <circle className="spa-guide-progress-track" cx="50" cy="50" r={PROGRESS_RADIUS} />
              <circle
                className="spa-guide-progress-value"
                cx="50"
                cy="50"
                r={PROGRESS_RADIUS}
                strokeDasharray={PROGRESS_LENGTH}
                strokeDashoffset={PROGRESS_LENGTH * (1 - Math.max(0, Math.min(1, remaining / duration)))}
              />
            </svg>
            <div className="spa-guide-timer-copy">
              <span className="spa-guide-timer-label">剩余时间</span>
              <span className="spa-guide-timer" role="timer" aria-label="剩余陪玩时间" aria-live="off">{timeLabel(remaining)}</span>
            </div>
          </div>
        </section>
        <section className="spa-guide-play-summary" aria-label="陪玩要点">
          <h2>现在和宝宝一起：</h2>
          <p className="spa-guide-play-goal">{props.goal}</p>
          <ol className="spa-guide-play-steps">
            {props.steps.slice(0, 3).map((step, index) => <li key={index}>
              <span className="spa-guide-play-step-number" aria-hidden="true">{index + 1}</span>
              <span className="spa-guide-play-step-text" title={step.text}>{step.text}</span>
            </li>)}
          </ol>
          {firstSay && <div className="spa-guide-play-say">
            <strong>可以这样说</strong>
            {firstSay.zh && <p lang="zh">{firstSay.zh}</p>}
            {firstSay.en && <p lang="en">{firstSay.en}</p>}
          </div>}
        </section>
      </main>
      <footer className="spa-guide-play-footer">
        <button type="button" data-focusable className="spa-guide-play-action spa-guide-end" ref={endButton}
          aria-label="结束陪玩" title="结束陪玩" disabled={s.paused} onClick={() => finish(true)}>
          按 OK / 点一下屏幕：结束陪玩
        </button>
        <button type="button" data-focusable className="spa-guide-play-action spa-guide-review" ref={reviewButton}
          disabled={s.paused} onClick={review}>
          再看一遍步骤
        </button>
      </footer>
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
