import type { ActivityPlugin } from '@sprout/plugin-sdk';
import type { Speech } from '@sprout/schema';
import { readHelloProps, type HelloProps } from './props';

export { readHelloProps };
export type { HelloProps };

const zhNumbers = ['零', '一', '二', '三', '四', '五'];
const enNumbers = ['zero', 'one', 'two', 'three', 'four', 'five'];
function countingSpeech(count: number): Speech {
  return { zh: zhNumbers[count], en: enNumbers[count] };
}
function totalSpeech(count: number): Speech {
  return { zh: `一共${count === 2 ? '两' : zhNumbers[count]}颗星星`, en: `${enNumbers[count]} ${count === 1 ? 'star' : 'stars'}!` };
}
const styles = `
.hello-stars { width:100%; height:100%; display:flex; flex-direction:column; justify-content:center; align-items:center; gap:var(--sp-gap, 3vmin); padding:var(--sp-safe, 5vmin); background:var(--sp-bg-sky, #dff1fb); color:var(--sp-ink, #3b3226); font-family:var(--sp-font, system-ui); box-sizing:border-box; }
.hello-stars * { box-sizing:border-box; letter-spacing:0; }
.hello-stars h2 { margin:0; text-align:center; font-size:var(--sp-font-md, 4vmin); font-weight:600; overflow-wrap:anywhere; }
.hello-stars small { display:block; font-size:var(--sp-font-sm, 2.8vmin); font-weight:400; margin-top:1vmin; }
.hello-stars-row { width:100%; display:flex; align-items:center; justify-content:center; gap:2%; min-height:18vmin; }
.hello-star { flex:0 1 17%; aspect-ratio:1; min-width:0; border:0; border-radius:var(--sp-radius-sm, 1.6vmin); background:transparent; color:var(--sp-warn, #f2b134); padding:0; cursor:pointer; transition:transform 600ms ease-in-out, box-shadow 600ms ease-in-out; }
.hello-star svg { display:block; width:100%; height:100%; }
.hello-star:focus-visible, .hello-star.sp-focused { outline:none; box-shadow:var(--sp-focus-ring, 0 0 0 5px #ffc93c); transform:scale(var(--sp-focus-scale, 1.06)); }
.hello-star[aria-pressed=true] { color:var(--sp-ok, #6c9a3b); cursor:default; }
.hello-stars output { min-height:1.6em; font-size:var(--sp-font-lg, 6vmin); text-align:center; }
.hello-stars p { margin:0; font-size:var(--sp-font-sm, 2.8vmin); text-align:center; }
.hello-stars[data-reduced-motion] * { transition:none; }
@media (prefers-reduced-motion:reduce) { .hello-stars * { transition:none; } }
`;

const plugin: ActivityPlugin<HelloProps> = {
  type: 'example.hello-stars',
  version: '1.0.0',
  name: { zh: '一起数星星', en: 'Count the Stars' },
  ageRange: [18, 36],
  preload: () => [],
  speeches(input) {
    const props = readHelloProps(input);
    return [...Array.from({ length: props.count }, (_, index) => countingSpeech(index + 1)), totalSpeech(props.count)];
  },
  mount(el, ctx) {
    const props = readHelloProps(ctx.props);
    const document = el.ownerDocument;
    const root = document.createElement('section');
    root.className = 'hello-stars';
    if (ctx.reducedMotion) root.dataset.reducedMotion = 'true';
    const style = document.createElement('style');
    style.textContent = styles;
    const title = document.createElement('h2');
    const picked = ctx.locale.pick(props.title);
    title.textContent = picked.primary;
    if (picked.secondary) {
      const secondary = document.createElement('small');
      secondary.textContent = picked.secondary;
      title.append(secondary);
    }
    const row = document.createElement('div');
    row.className = 'hello-stars-row';
    const output = document.createElement('output');
    output.setAttribute('aria-live', 'polite');
    output.textContent = '0';
    const hint = document.createElement('p');
    root.append(style, title, row, output, hint);

    const counted = new Set<number>();
    const buttons: HTMLButtonElement[] = [];
    let paused = false;
    let disposed = false;
    let completed = false;
    let busy = false;
    let generation = 0;
    function updateHint(mode = ctx.input.mode) {
      hint.textContent = ctx.locale.pick(mode === 'dpad'
        ? { zh: '按 OK 数一颗星星', en: 'Press OK to count a star' }
        : { zh: '点一点，数一颗星星', en: 'Tap a star to count' }).primary;
    }
    const current = (ticket: number) => !disposed && !paused && !completed
      && !ctx.signal.aborted && ticket === generation;
    async function speak(text: Speech, ticket: number) {
      try { await ctx.speak(text); }
      catch (error) {
        if (current(ticket)) ctx.log('hello:speech-unavailable', { message: String(error) });
      }
      return current(ticket);
    }
    function finish() {
      if (disposed || paused || completed || busy || ctx.signal.aborted) return;
      const ticket = ++generation;
      busy = true;
      void speak(totalSpeech(counted.size), ticket).then((active) => {
        if (!active) return;
        busy = false;
        completed = true;
        hint.textContent = ctx.locale.pick({ zh: '一起数完啦', en: 'All counted together' }).primary;
        ctx.setParentHint(null);
        ctx.log('hello:complete', { count: counted.size });
        ctx.complete({ data: { count: counted.size } });
      });
    }
    function select(index: number) {
      if (disposed || paused || completed || busy || counted.has(index) || ctx.signal.aborted) return;
      counted.add(index);
      const button = buttons[index];
      button.disabled = true;
      button.setAttribute('aria-pressed', 'true');
      output.textContent = String(counted.size);
      const ticket = ++generation;
      busy = true;
      ctx.log('hello:count', { star: index + 1, count: counted.size });
      ctx.sfx('tap');
      void speak(countingSpeech(counted.size), ticket).then((active) => {
        if (!active) return;
        busy = false;
        ctx.focus.refresh();
        if (counted.size === props.count) finish();
        else ctx.focus.focus(buttons.find((item) => !item.disabled) ?? null);
      });
    }
    const clickHandlers: (() => void)[] = [];
    for (let index = 0; index < props.count; index++) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'hello-star';
      button.dataset.focusable = '';
      button.setAttribute('aria-pressed', 'false');
      button.setAttribute('aria-label', ctx.locale.pick({ zh: `第${index + 1}颗星星`, en: `Star ${index + 1}` }).primary);
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 120 120');
      svg.setAttribute('aria-hidden', 'true');
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', 'M60 10 75 40 108 45 84 69 90 103 60 87 30 103 36 69 12 45 45 40Z');
      path.setAttribute('fill', 'currentColor');
      path.setAttribute('stroke', 'currentColor');
      path.setAttribute('stroke-width', '5');
      path.setAttribute('stroke-linejoin', 'round');
      svg.append(path);
      button.append(svg);
      const onClick = () => select(index);
      clickHandlers.push(onClick);
      button.addEventListener('click', onClick);
      buttons.push(button);
      row.append(button);
    }
    updateHint();
    const unsubscribe = ctx.input.onChange(updateHint);
    function unmount() {
      if (disposed) return;
      disposed = true;
      generation++;
      unsubscribe();
      buttons.forEach((button, index) => button.removeEventListener('click', clickHandlers[index]));
      ctx.signal.removeEventListener('abort', unmount);
      ctx.stopSpeaking();
      ctx.setParentHint(null);
      root.remove();
    }
    if (ctx.signal.aborted) unmount();
    else {
      el.append(root);
      ctx.signal.addEventListener('abort', unmount, { once: true });
      ctx.setParentHint('和孩子一起一颗一颗数，不急着给答案。');
      ctx.focus.refresh();
    }
    return {
      unmount,
      onKey(key) {
        if (key === 'back') return false;
        if (disposed || paused || completed || ctx.signal.aborted) return true;
        const available = buttons.filter((button) => !button.disabled);
        const selected = ctx.focus.current();
        const index = Math.max(0, available.indexOf(selected as HTMLButtonElement));
        if (key === 'ok') { available[index]?.click(); return true; }
        if (key === 'left' || key === 'right') {
          ctx.focus.focus(available[Math.max(0, Math.min(available.length - 1, index + (key === 'left' ? -1 : 1)))] ?? null);
          return true;
        }
        return false;
      },
      pause() {
        if (disposed || paused || completed) return;
        paused = true;
        root.inert = true;
        generation++;
        busy = false;
        ctx.stopSpeaking();
      },
      resume() {
        if (disposed || !paused || completed) return;
        paused = false;
        root.inert = false;
        if (counted.size === props.count) finish();
        else ctx.focus.refresh();
      },
    };
  },
};

export default plugin;
