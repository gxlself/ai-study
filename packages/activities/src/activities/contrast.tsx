import { useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { ContrastProps } from '@sprout/schema';
import type { ActivityContext } from '@sprout/plugin-sdk';
import { contrastSvg, type ContrastPattern } from '../contrast-svg';
import { Action, InputHint, Stage, defineBuiltin, useNav, useSession, useTask } from '../shared';

const names: Record<ContrastPattern, { zh: string; en: string }> = {
  bullseye: { zh: '同心圆', en: 'Circles' },
  stripes: { zh: '条纹', en: 'Stripes' },
  checker: { zh: '棋盘', en: 'Checkerboard' },
  dots: { zh: '圆点', en: 'Dots' },
  face: { zh: '笑脸', en: 'A smiling face' },
  spiral: { zh: '螺旋', en: 'Spiral' },
  zigzag: { zh: '折线', en: 'Zigzag' },
  circle: { zh: '圆形', en: 'Circle' },
  square: { zh: '正方形', en: 'Square' },
  triangle: { zh: '三角形', en: 'Triangle' },
  star: { zh: '星星', en: 'Star' },
  heart: { zh: '爱心', en: 'Heart' },
};

function PatternDrawing({ pattern, palette, invert, label }: {
  pattern: ContrastPattern; palette: 'bw' | 'bwr'; invert: boolean; label: string;
}) {
  // 只注入固定图案与颜色白名单生成的 SVG，不接收任意标记。
  return <svg viewBox="0 0 200 200" role="img" aria-label={label} data-pattern={pattern}
    dangerouslySetInnerHTML={{ __html: contrastSvg(pattern, palette, { invert }) }} />;
}

function ContrastActivity({ ctx }: { ctx: ActivityContext<ContrastProps> }) {
  const s = useSession(ctx);
  const { patterns, palette, motion, secondsPerPattern, narration } = ctx.props;
  const [frame, setFrame] = useState({ index: 0, previous: null as number | null });
  const currentIndex = useRef(0);
  const changing = useRef(false);
  const manualAdvances = useRef(0);

  const next = (source: 'input' | 'timer', expected = frame.index) => {
    if (!s.active() || s.paused || changing.current || currentIndex.current !== expected) return;
    changing.current = true;
    if (source === 'input') manualAdvances.current += 1;
    ctx.log('contrast:next', { index: expected, source });
    if (expected + 1 === patterns.length) {
      s.complete({ data: { patterns: patterns.length, manualAdvances: manualAdvances.current } });
      return;
    }
    currentIndex.current = expected + 1;
    setFrame({ index: expected + 1, previous: expected });
  };

  useTask(s, async (signal) => {
    ctx.log('contrast:pattern', { index: frame.index, pattern: patterns[frame.index] });
    if (frame.previous !== null) {
      await s.delay(1000, signal);
      setFrame((value) => ({ ...value, previous: null }));
      changing.current = false;
    }
    await s.delay(secondsPerPattern * 1000, signal);
    next('timer', frame.index);
  }, [frame.index]);

  useTask(s, async (signal) => {
    if (frame.index === 0) await s.speak(narration, signal);
  }, [frame.index]);

  useNav(ctx, (key) => {
    if (key !== 'ok' && key !== 'right') return false;
    next('input');
    return true;
  });

  const layer = (index: number, entering: boolean) => {
    const inverse = index % 2 === 1;
    // 黑白红是本活动的内容色，不用于普通界面配色。
    const style = {
      '--spa-contrast-bg': inverse ? '#000' : '#fff',
      '--spa-contrast-ink': palette === 'bwr' && index % 3 === 2 ? '#dc2626' : inverse ? '#fff' : '#000',
    } as CSSProperties;
    return <span key={index} className={`spa-contrast-layer${entering ? ' spa-contrast-layer--enter' : ''}`}
      style={style} aria-hidden={index !== frame.index}>
      <span className={`spa-contrast-pattern spa-contrast-motion--${motion}`}>
        <PatternDrawing pattern={patterns[index]} invert={inverse}
          palette={palette === 'bwr' && index % 3 === 2 ? 'bwr' : 'bw'}
          label={ctx.locale.pick(names[patterns[index]]).primary} />
      </span>
    </span>;
  };

  return <Stage ctx={ctx} className="spa-early spa-contrast">
    <Action ctx={ctx} className="spa-contrast-canvas" onClick={() => next('input')}
      label={ctx.locale.pick({ zh: '下一张图案', en: 'Next pattern' }).primary}>
      {frame.previous !== null && layer(frame.previous, false)}
      {layer(frame.index, frame.previous !== null)}
    </Action>
    <div className="spa-contrast-hint"><InputHint ctx={ctx} /></div>
  </Stage>;
}

export const contrastActivity = defineBuiltin<ContrastProps>('contrast', ContrastActivity,
  (props) => props.narration ? [props.narration] : []);
