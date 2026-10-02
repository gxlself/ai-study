import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, LockKeyhole, X } from 'lucide-react';
import { advanceGate, createGateSequence, type NavigationManager } from '../host';

type Direction = 'up' | 'down' | 'left' | 'right';
const icons = { up: ArrowUp, down: ArrowDown, left: ArrowLeft, right: ArrowRight };
const labels = { up: '上', down: '下', left: '左', right: '右' };

export function ParentGate({ navigation, onClose }: { navigation: NavigationManager; onClose(passed: boolean): void }) {
  const [sequence, setSequence] = useState(createGateSequence);
  const [progress, setProgress] = useState(0);
  const [wrong, setWrong] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const lastActivity = useRef(Date.now());
  const pressRef = useRef<(direction: Direction) => void>(() => undefined);
  pressRef.current = (direction) => {
    lastActivity.current = Date.now();
    const result = advanceGate(sequence, progress, direction);
    if (result === 'passed') onClose(true);
    else if (result === 'wrong') { setSequence(createGateSequence()); setProgress(0); setWrong(true); }
    else { setProgress(result); setWrong(false); }
  };
  useLayoutEffect(() => {
    if (!ref.current) return;
    return navigation.pushScope(ref.current, {
      onKey: (key) => {
        lastActivity.current = Date.now();
        if (key in icons) { pressRef.current(key as Direction); return true; }
        return false;
      },
      onBack: () => onClose(false),
    });
  }, [navigation, onClose]);
  useEffect(() => {
    const timer = setInterval(() => { if (Date.now() - lastActivity.current >= 30_000) onClose(false); }, 1000);
    return () => clearInterval(timer);
  }, [onClose]);
  return <div className="modal-backdrop">
    <div className="parent-gate" ref={ref} role="dialog" aria-modal="true" aria-labelledby="gate-title" onPointerDown={() => { lastActivity.current = Date.now(); }}>
      <button className="icon-button modal-close" data-focusable aria-label="关闭家长验证" onClick={() => onClose(false)}><X /></button>
      <LockKeyhole className="gate-lock" aria-hidden="true" />
      <h2 id="gate-title">请家长来一下</h2>
      <div className="gate-sequence" aria-label={sequence.map((key) => labels[key]).join('、')}>
        {sequence.map((key, i) => { const Icon = icons[key]; return <span key={i} className={i < progress ? 'done' : ''}><Icon /></span>; })}
      </div>
      <p className="gate-status" aria-live="polite">{wrong ? '再试一组' : '家长验证'}</p>
      <div className="gate-arrows">{(['left', 'up', 'down', 'right'] as const).map((direction) => {
        const Icon = icons[direction];
        return <button data-focusable key={direction} aria-label={labels[direction]} title={labels[direction]} onClick={() => pressRef.current(direction)}><Icon /></button>;
      })}</div>
    </div>
  </div>;
}
