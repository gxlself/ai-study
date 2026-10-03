import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { SCENE_BACKGROUNDS } from '@sprout/schema';
import type { Scene as SceneData } from '@sprout/schema';
import type { ActivityContext } from '@sprout/plugin-sdk';
import { ConceptImage } from './shared';

export interface SceneProps {
  ctx: ActivityContext<unknown>;
  scene: SceneData;
  paused?: boolean;
  className?: string;
}

export function Scene({ ctx, scene, paused = false, className = '' }: SceneProps) {
  const element = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  useLayoutEffect(() => {
    const el = element.current;
    if (!el) return;
    // 精灵按场景高度保持正方形，不能依赖电视尚不支持的 aspect-ratio。
    const resize = () => setHeight(el.clientHeight);
    resize();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
    observer?.observe(el);
    window.addEventListener('resize', resize);
    return () => { observer?.disconnect(); window.removeEventListener('resize', resize); };
  }, []);
  const [stopped, setStopped] = useState(ctx.signal.aborted);
  useEffect(() => {
    const stop = () => setStopped(true);
    ctx.signal.addEventListener('abort', stop, { once: true });
    return () => ctx.signal.removeEventListener('abort', stop);
  }, [ctx.signal]);
  const preset = SCENE_BACKGROUNDS.find((name) => name === scene.bg);

  return (
    <div
      ref={element}
      className={`spa-scene spa-scene--${preset ?? 'paper'} ${className}`}
      data-reduced-motion={ctx.reducedMotion}
      data-paused={paused || stopped}
      style={preset ? undefined : { backgroundColor: scene.bg, backgroundImage: 'none' }}
    >
      {scene.ground !== 'none' && (
        <div className={`spa-scene-ground spa-scene-ground--${scene.ground}`} aria-hidden="true" />
      )}
      {scene.sprites.map((sprite, index) => (
        <div
          className="spa-scene-sprite"
          key={index}
          style={{
            left: `${sprite.x}%`,
            top: `${sprite.y}%`,
            height: `${sprite.size}%`,
            width: height * sprite.size / 100,
            zIndex: sprite.z ?? 1,
            '--spa-sprite-delay': `${sprite.delay ?? 0}s`,
          } as CSSProperties}
        >
          <div className="spa-scene-entrance">
            <div className={`spa-scene-motion spa-scene-motion--${sprite.anim}`}>
              <ConceptImage
                ctx={ctx}
                concept={sprite.concept}
                image={sprite.image}
                className="spa-scene-image"
                style={{ transform: sprite.flip ? 'scaleX(-1)' : undefined }}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
