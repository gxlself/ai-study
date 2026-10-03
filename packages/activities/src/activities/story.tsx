import { useEffect, useState } from 'react';
import { PHRASES } from '@sprout/schema';
import type { StoryProps } from '@sprout/schema';
import type { ActivityContext } from '@sprout/plugin-sdk';
import { Scene } from '../Scene';
import { Action, InputHint, Stage, Text, defineBuiltin, useNav, useSession, useTask } from '../shared';

function StoryActivity({ ctx }: { ctx: ActivityContext<StoryProps> }) {
  const s = useSession(ctx);
  const { title, pages, cover } = ctx.props;
  const [index, setIndex] = useState(-1);
  const [reading, setReading] = useState(0);
  const atEnd = index === pages.length;
  const page = index >= 0 && !atEnd ? pages[index] : undefined;
  const prompts = page?.prompts ?? [];
  const scene = page?.scene ?? (atEnd ? pages[pages.length - 1].scene : cover ?? pages[0].scene);

  const turn = (next: number) => {
    if (!s.active() || s.paused) return;
    const target = Math.max(-1, Math.min(pages.length, next));
    if (target === index) return;
    ctx.log('story:page', { from: index, to: target });
    s.sfx('page');
    setIndex(target);
  };
  const reread = () => {
    if (!s.active() || s.paused) return;
    ctx.log('story:reread', { page: index });
    setReading((value) => value + 1);
  };
  const finish = () => {
    if (s.active() && !s.paused) s.complete({ data: { pages: pages.length } });
  };

  useTask(s, async (signal) => {
    if (index === -1) await s.speak(title, signal);
    else if (atEnd) await s.speak(PHRASES.storyEnd, signal);
    else if (page?.narrate) await s.speak(page.text, signal);
  }, [index, reading]);

  useEffect(() => {
    const hint = prompts.map((prompt) => {
      const text = ctx.locale.pick(prompt);
      return [text.primary, text.secondary].filter(Boolean).join(' / ');
    }).join(' · ');
    ctx.setParentHint(hint || null);
    return () => ctx.setParentHint(null);
  }, [ctx, index]);

  useNav(ctx, (key) => {
    if (s.paused) return key !== 'back';
    if (key === 'left') { turn(index - 1); return true; }
    if (key === 'right') { if (atEnd) finish(); else turn(index + 1); return true; }
    if (key === 'ok') {
      if (atEnd) finish();
      else if (index === -1) turn(0);
      else reread();
      return true;
    }
    return false;
  });

  return (
    <Stage ctx={ctx} className="spa-media spa-story">
      <div className={`spa-story-book ${index === -1 || atEnd ? 'spa-story-book--cover' : ''}`}>
        <div className={`spa-story-picture ${index === -1 || atEnd ? 'spa-story-picture--cover' : ''}`}>
          <Scene key={index} ctx={ctx} scene={scene} paused={s.paused} />
          {(index === -1 || atEnd) && (
            <div className="spa-story-cover-text">
              <Text ctx={ctx} text={atEnd ? PHRASES.storyEnd : title} className="spa-media-heading" />
            </div>
          )}
        </div>
        <div className="spa-story-copy">
          {page ? (
            <>
              <Action ctx={ctx} onClick={reread} disabled={s.paused} className="spa-story-read"
                label={ctx.locale.pick({ zh: '再读一遍', en: 'Read again' }).primary}>
                <Text ctx={ctx} text={page.text} />
              </Action>
              {!!prompts.length && (
                <aside className="spa-story-prompts">
                  {prompts.map((prompt, i) => (
                    <Text key={i} ctx={ctx} text={{
                      zh: `问：${prompt.zh}`,
                      en: prompt.en ? `Ask: ${prompt.en}` : undefined,
                    }} />
                  ))}
                </aside>
              )}
            </>
          ) : (
            <Action ctx={ctx} onClick={() => atEnd ? finish() : turn(0)} disabled={s.paused}>
              {atEnd ? <Text ctx={ctx} text={PHRASES.storyEnd} />
                : <Text ctx={ctx} text={{ zh: '一起读', en: 'Read together' }} />}
            </Action>
          )}
        </div>
      </div>
      <div className="spa-media-navigation">
        <Action ctx={ctx} onClick={() => turn(index - 1)} disabled={index === -1 || s.paused}
          label={ctx.locale.pick({ zh: '上一页', en: 'Previous page' }).primary}>
          <span aria-hidden="true">←</span>
        </Action>
        <div className="spa-story-location">
          <span className="spa-media-counter">{Math.max(0, Math.min(pages.length, index + 1))} / {pages.length}</span>
          <InputHint ctx={ctx} />
        </div>
        <Action ctx={ctx} onClick={() => atEnd ? finish() : turn(index + 1)} disabled={s.paused}
          label={ctx.locale.pick(atEnd ? PHRASES.storyEnd : { zh: '下一页', en: 'Next page' }).primary}>
          <span aria-hidden="true">{atEnd ? '✓' : '→'}</span>
        </Action>
      </div>
    </Stage>
  );
}

export const storyActivity = defineBuiltin<StoryProps>('story', StoryActivity, (props) => [
  props.title,
  ...props.pages.filter((page) => page.narrate).map((page) => page.text),
  PHRASES.storyEnd,
]);
