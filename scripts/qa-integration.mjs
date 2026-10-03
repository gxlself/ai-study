import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdir, mkdtemp, readFile, writeFile, rename, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(path.join(root, 'apps/player/package.json'));
const { chromium, expect: baseExpect } = require('@playwright/test');
const expect = baseExpect.configure({ timeout: 20_000 });
const artifacts = path.join(root, 'qa-artifacts');
await mkdir(artifacts, { recursive: true });
const bundleText = await readFile(path.join(root, 'content/packs/sprout-core/bundle.json'), 'utf8');
const bundle = JSON.parse(bundleText);
assert.equal(bundle.lessons.length, 96, '必须使用完整正式 bundle');
const now = new Date();
const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
const birthday = (months) => {
  const born = new Date(now.getFullYear(), now.getMonth() - months, now.getDate());
  return `${born.getFullYear()}-${String(born.getMonth() + 1).padStart(2, '0')}-${String(born.getDate()).padStart(2, '0')}`;
};
const result = { date, formalBundle: true, bundleSha256: createHash('sha256').update(bundleText).digest('hex'), checks: [], lessons: [] };
const resultsFile = path.join(artifacts, 'integration-results.json');
if (process.env.SPROUT_QA_MERGE === '1') {
  const previous = JSON.parse(await readFile(resultsFile, 'utf8'));
  assert.equal(previous.bundleSha256, result.bundleSha256, '复测合并必须使用同一正式 bundle');
  assert.equal(previous.resourcesClosed, true, '必须先关闭上一轮验收资源');
  result.checks = previous.checks;
  result.lessons = previous.lessons;
}
let server;
let browser;
let port = Number(process.env.SPROUT_QA_PORT || 4310);
let base;
const dataDir = await mkdtemp(path.join(tmpdir(), 'sprout-t9-'));
const errors = new Map();
const persist = async () => {
  await writeFile(`${resultsFile}.tmp`, `${JSON.stringify(result, null, 2)}\n`);
  await rename(`${resultsFile}.tmp`, resultsFile);
};
const log = (text) => console.log(`[T9] ${text}`);
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function startServer() {
  for (let attempt = 0; attempt < 3; attempt++, port += 100) {
    base = `http://127.0.0.1:${port}`;
    try { await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(500) }); continue; } catch {}
    server = spawn(process.execPath, ['apps/server/dist/index.js'], {
      cwd: root, env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', SPROUT_DATA_DIR: dataDir },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const output = [];
    server.stdout.on('data', (chunk) => output.push(chunk.toString()));
    server.stderr.on('data', (chunk) => output.push(chunk.toString()));
    for (let retry = 0; retry < 80; retry++) {
      if (server.exitCode !== null) throw new Error(`验收服务启动失败：${output.join('').slice(-1000)}`);
      try {
        const response = await fetch(`${base}/api/health`);
        if (response.ok) { log(`临时服务器 ${base}，正式内容包`); return; }
      } catch {}
      await pause(200);
    }
    throw new Error('验收服务器启动超时');
  }
  throw new Error('验收端口均已占用');
}

async function pageFor(viewport, accelerated = false) {
  const context = await browser.newContext({ viewport, timezoneId: 'Asia/Seoul', reducedMotion: 'reduce', serviceWorkers: 'block' });
  context.setDefaultTimeout(20_000);
  context.setDefaultNavigationTimeout(30_000);
  if (accelerated) {
    await context.addInitScript(() => {
      const play = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function () {
        this.playbackRate = 16;
        return play.call(this);
      };
      Element.prototype.requestFullscreen = () => Promise.reject(new DOMException('验收固定视口', 'NotAllowedError'));
    });
  }
  const page = await context.newPage();
  errors.set(page, []);
  page.on('pageerror', (error) => errors.get(page).push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 400) errors.get(page).push(`HTTP ${response.status()} ${new URL(response.url()).pathname}`);
  });
  page.on('console', (message) => {
    if (message.type() === 'error') {
      const url = message.location().url;
      errors.get(page).push(`${message.text()}${url ? ` (${new URL(url).pathname})` : ''}`);
    }
  });
  if (accelerated) {
    const time = new Date(now);
    time.setHours(10, 0, 0, 0);
    await page.clock.install({ time });
  }
  return { page, context };
}

async function check(name, action) {
  log(name);
  const row = { name, passed: false };
  result.checks = result.checks.filter((item) => item.name !== name);
  result.checks.push(row);
  try { row.details = await action(); row.passed = true; }
  catch (error) { row.error = error.message; throw error; }
  finally { await persist(); }
}

async function screenshot(page, relative) {
  await page.evaluate(async () => { await Promise.all([...document.images].map((img) => img.decode().catch(() => undefined))); });
  const target = path.join(artifacts, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await page.screenshot({ path: target, fullPage: true });
  return page.evaluate(() => {
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'
        && !el.closest('[hidden]') && r.bottom > 0 && r.top < innerHeight;
    };
    const broken = [...document.images].filter((img) => !img.naturalWidth).map((img) => img.getAttribute('src'));
    const overflow = [...document.querySelectorAll('h1,h2,h3,p,button,output,dt,dd')].filter((el) =>
      visible(el) && el.textContent.trim() && el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 4
      && getComputedStyle(el).overflowX !== 'auto').map((el) => ({
      selector: el.className, text: el.textContent.slice(0, 100), width: el.clientWidth, scroll: el.scrollWidth,
    }));
    const sequenceHeading = document.querySelector('.spa-sequence > .spa-media-heading');
    const sequenceOptions = [...document.querySelectorAll('.spa-sequence-option')];
    if (sequenceHeading && sequenceOptions.length && sequenceHeading.getBoundingClientRect().bottom
      > Math.min(...sequenceOptions.map((el) => el.getBoundingClientRect().top)) - 4) {
      overflow.push({ selector: 'sequence-heading-overlap', text: sequenceHeading.textContent, width: 0, scroll: 0 });
    }
    const stage = document.querySelector('.activity-stage');
    const stageRect = stage?.getBoundingClientRect();
    return {
      broken, overflow, horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 4,
      blank: !document.body.innerText.trim() && !document.querySelector('img,svg,canvas'),
      unknown: !!document.querySelector('.missing-activity'),
      stage: stageRect ? { width: stageRect.width, height: stageRect.height } : null,
    };
  });
}

async function dpadTo(page, selector) {
  const keys = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
  for (let retry = 0; retry < 3; retry++) {
    const route = await page.evaluate((targetSelector) => {
      const elements = [...document.querySelectorAll('[data-focusable]')].filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width && r.height && !el.disabled && !el.closest('[hidden],[inert]')
          && getComputedStyle(el).visibility !== 'hidden';
      });
      const from = elements.indexOf(document.activeElement);
      const to = elements.indexOf(document.querySelector(targetSelector));
      if (from === to && to >= 0) return [];
      if (from < 0 || to < 0) return null;
      const centers = elements.map((el) => { const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
      const queue = [{ index: from, path: [] }], seen = new Set([from]);
      while (queue.length) {
        const item = queue.shift();
        for (const direction of ['up', 'down', 'left', 'right']) {
          const horizontal = direction === 'left' || direction === 'right';
          const sign = direction === 'left' || direction === 'up' ? -1 : 1;
          let best = -1, score = Infinity;
          centers.forEach((p, index) => {
            const origin = centers[item.index];
            const main = (horizontal ? p.x - origin.x : p.y - origin.y) * sign;
            const offset = Math.abs(horizontal ? p.y - origin.y : p.x - origin.x);
            if (main > 0 && main + 2 * offset < score) { best = index; score = main + 2 * offset; }
          });
          if (best < 0 || seen.has(best)) continue;
          const next = [...item.path, direction];
          if (best === to) return next;
          seen.add(best); queue.push({ index: best, path: next });
        }
      }
      return null;
    }, selector);
    assert.ok(route, `没有遥控器焦点路径：${selector}`);
    for (const direction of route) await page.keyboard.press(keys[direction]);
    if (await page.locator(selector).evaluate((el) => document.activeElement === el)) return;
  }
  throw new Error(`遥控器无法定位：${selector}`);
}

async function pressTarget(page, selector) {
  await dpadTo(page, selector);
  await page.keyboard.press('Enter');
}

async function selectOption(page, label, text) {
  await page.getByLabel(label, { exact: true }).click();
  const option = page.locator('.ant-select-dropdown:visible .ant-select-item-option').filter({ hasText: text });
  const popup = page.locator('.ant-select-dropdown:visible').last();
  await expect.poll(async () => {
    const box = await popup.boundingBox();
    return !!box && box.x >= 0 && box.y >= 0;
  }, { message: '减少动画时弹层仍须在视口内定位' }).toBe(true);
  assert.equal(await popup.evaluate((el) => getComputedStyle(el).transitionDuration), '0s');
  await option.click();
}

async function gate(page) {
  await expect(page.locator('.gate-sequence')).toBeVisible();
  const names = { 上: 'ArrowUp', 下: 'ArrowDown', 左: 'ArrowLeft', 右: 'ArrowRight' };
  for (const name of (await page.locator('.gate-sequence').getAttribute('aria-label')).split('、')) {
    await page.keyboard.press(names[name]);
  }
  await expect(page.locator('.gate-sequence')).toHaveCount(0);
}

async function settle(page, predicate, timeout = 15_000, argument) {
  const start = Date.now();
  do {
    if (await page.evaluate(predicate, argument)) return;
    await page.clock.runFor(500);
    await pause(60);
  } while (Date.now() - start < timeout);
  throw new Error('活动等待超时');
}

async function stepNumber(page) {
  const text = await page.locator('.step-dots').getAttribute('aria-label').catch(() => '');
  return Number(text?.match(/第 (\d+) 步/)?.[1] || 0);
}

async function finishStep(page, step, index) {
  let presses = 0;
  const key = async (name) => { assert.ok(++presses <= 40, `${step.type} 超过 40 次按键`); await page.keyboard.press(name); };
  const active = async () => await stepNumber(page) === index + 1;
  const focusChoice = async (selector, target) => {
    await settle(page, (query) => [...document.querySelectorAll(query)].includes(document.activeElement), 15_000, selector);
    for (let move = 0; move < 4; move++) {
      const current = await page.locator(selector).evaluateAll((buttons) => buttons.indexOf(document.activeElement));
      if (current === target) return;
      await key(current < target ? 'ArrowRight' : 'ArrowLeft');
      await page.clock.runFor(80);
    }
    assert.equal(await page.locator(selector).evaluateAll((buttons) => buttons.indexOf(document.activeElement)), target, '答案必须确实取得焦点');
  };
  if (step.type === 'guide') {
    await key('Enter');
    if (step.props.playMin > 0) {
      await expect(page.locator('.spa-guide--play')).toBeVisible();
      await page.clock.runFor(1200);
      await key('Enter'); await key('Enter'); await key('Enter');
    }
  } else if (step.type === 'song') {
    const total = step.props.lines.reduce((sum, line) => sum + line.notes.trim().split(/\s+/).reduce((beats, note) => beats + Number(note.split('/')[1]), 0), 0)
      * 60_000 / step.props.bpm * step.props.repeat + 5000;
    await page.clock.runFor(total);
    await settle(page, () => !document.querySelector('.spa-song'));
  } else if (step.type === 'word-cards' || step.type === 'story' || step.type === 'contrast') {
    for (let turn = 0; turn < 30 && await active(); turn++) {
      await key('ArrowRight'); await page.clock.runFor(100);
      if (await page.locator('.spa-word-finish,.spa-story-finish').count()) { await key('Enter'); break; }
    }
  } else if (step.type === 'choose') {
    for (const [roundIndex, round] of step.props.rounds.entries()) {
      await settle(page, (round) => Number(document.querySelector('.spa-choose-options')?.dataset.roundIndex) === round
        && !document.querySelector('.spa-choose .spa-feedback button'), 15_000, roundIndex);
      const target = round.options.findIndex((option) => (typeof option === 'string' ? option : option.id) === round.answer);
      await focusChoice('.spa-choose-card', target);
      await key('Enter');
      await settle(page, () => {
        const button = document.querySelector('.spa-choose .spa-feedback button');
        return !!button && !button.disabled;
      });
      await key('Enter'); await page.clock.runFor(200);
    }
  } else if (step.type === 'count') {
    for (const round of step.props.rounds) {
      if (step.props.mode === 'auto') await page.clock.runFor(round.count * 2000);
      else for (let n = 0; n < round.count; n++) {
        await key('Enter');
        await settle(page, () => {
          const buttons = [...document.querySelectorAll('.spa-count button')];
          return buttons.some((button) => !button.disabled);
        });
      }
      await settle(page, () => !!document.querySelector('.spa-count-summary button'));
      await key('Enter'); await page.clock.runFor(200);
    }
  } else if (step.type === 'sort') {
    for (const [itemIndex, item] of step.props.items.entries()) {
      await settle(page, (item) => Number(document.querySelector('.spa-sort-bins')?.dataset.itemIndex) === item, 15_000, itemIndex);
      const target = step.props.bins.findIndex((bin) => bin.id === item.bin);
      await focusChoice('.spa-sort-bin', target);
      await key('Enter');
      await settle(page, (item) => !document.querySelector('.spa-sort-bins')
        || Number(document.querySelector('.spa-sort-bins')?.dataset.itemIndex) > item, 15_000, itemIndex);
    }
  } else if (step.type === 'pattern') {
    for (const [roundIndex, round] of step.props.rounds.entries()) {
      await settle(page, (round) => Number(document.querySelector('.spa-pattern-options')?.dataset.roundIndex) === round
        && !document.querySelector('.spa-pattern .spa-feedback button'), 15_000, roundIndex);
      const target = round.options.indexOf(round.answer);
      await focusChoice('.spa-pattern-option', target);
      await key('Enter');
      await settle(page, () => {
        const button = document.querySelector('.spa-pattern .spa-feedback button');
        return !!button && !button.disabled;
      });
      await key('Enter'); await page.clock.runFor(200);
    }
  } else if (step.type === 'subitize') {
    for (const [roundIndex, round] of step.props.rounds.entries()) {
      await settle(page, (round) => Number(document.querySelector('.spa-subitize-choices')?.dataset.roundIndex) === round, 15_000, roundIndex);
      await settle(page, () => !!document.querySelector('.spa-number-choice,.spa-subitize-choices .spa-action'));
      if (step.props.choices) {
        const start = Math.max(1, round.count - 1), target = round.count - start;
        await focusChoice('.spa-number-choice', target);
        await key('Enter');
      }
      await settle(page, () => {
        const button = document.querySelector('.spa-subitize-choices .spa-action');
        return !!button && !button.disabled;
      });
      await key('Enter'); await page.clock.runFor(200);
    }
  } else if (step.type === 'sequence') {
    if (step.props.mode === 'show') {
      for (let i = 0; i <= step.props.steps.length; i++) { await key('ArrowRight'); await page.clock.runFor(200); }
    } else {
      for (let i = 0; i < step.props.steps.length; i++) {
        const selected = await page.evaluate((index) => {
          const options = [...document.querySelectorAll('.spa-sequence-option')];
          const target = index % 2 ? 0 : 1;
          return { current: options.indexOf(document.activeElement), target };
        }, i);
        if (selected.current !== selected.target) await key(selected.target === 0 ? 'ArrowLeft' : 'ArrowRight');
        await key('Enter');
        await settle(page, (completed) => document.querySelectorAll('.spa-sequence-strip li').length >= completed
          && !document.querySelector('.spa-sequence-option[disabled]'), 15_000, i + 1);
        await page.clock.runFor(200);
        await pause(30);
      }
      await key('Enter');
    }
  } else if (step.type === 'movement') {
    for (let i = 0; i < step.props.moves.length; i++) { await key('Enter'); await page.clock.runFor(200); }
    await settle(page, () => !document.querySelector('.spa-movement'));
  } else if (step.type === 'calm') {
    await settle(page, () => !document.querySelector('.spa-calm'));
  } else if (step.type === 'example.hello-stars') {
    const count = step.props.count || 3;
    while (await active() && await page.locator('.hello-stars output').count()
      && Number(await page.locator('.hello-stars output').textContent()) < count) {
      await key('Enter');
      await page.clock.runFor(1000);
      await pause(120);
    }
  } else {
    for (let i = 0; i < 20 && await active(); i++) { await key('Enter'); await key('ArrowRight'); await page.clock.runFor(500); }
  }
  await settle(page, (number) => !document.querySelector('.phase-playing')
    || Number(document.querySelector('.step-dots')?.getAttribute('aria-label')?.match(/第 (\d+) 步/)?.[1] || 0) !== number, 15_000, index + 1);
  if (await active()) throw new Error(`${step.type} 未推进到下一步`);
  return presses;
}

async function beginLesson(page) {
  await expect(page.locator('.start-lesson')).toBeVisible();
  await pressTarget(page, '.start-lesson');
  await page.clock.runFor(new URL(page.url()).hash.startsWith('#/preview') ? 100 : 4000);
  await expect(page.locator('.activity-stage > *')).toBeVisible();
}

async function runFlow(admin, player) {
  let token;
  const api = async (url, method = 'GET', body) => {
    const response = await fetch(`${base}${url}`, { method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const payload = await response.json();
    assert.ok(response.ok, `${url}：${JSON.stringify(payload)}`);
    return payload;
  };
  let children;
  await check('后台首次设置与三个孩子档案', async () => {
    await admin.goto(`${base}/admin/`);
    await admin.getByLabel('家庭名', { exact: true }).fill('T9 验收家庭');
    await admin.getByLabel('管理员密码', { exact: true }).fill('Sprout-T9-qa!');
    await admin.getByLabel('再次输入密码', { exact: true }).fill('Sprout-T9-qa!');
    await admin.getByRole('button', { name: /下一步/ }).click();
    await admin.getByLabel('孩子名字', { exact: true }).fill('小芽7');
    await admin.getByLabel('生日', { exact: true }).fill(birthday(7));
    await admin.getByLabel('生日', { exact: true }).press('Enter');
    await expect(admin.getByRole('heading', { name: '今日概览', exact: true })).toBeVisible();
    token = await admin.evaluate(() => localStorage.getItem('sprout.adminToken'));
    assert.ok(token);
    await admin.goto(`${base}/admin/children`);
    for (const age of [20, 30]) {
      await admin.getByRole('button', { name: /新建档案/ }).click();
      const modal = admin.getByRole('dialog');
      await modal.getByLabel('名字', { exact: true }).fill(`小芽${age}`);
      await modal.getByLabel('生日', { exact: true }).fill(birthday(age));
      await modal.getByLabel('生日', { exact: true }).press('Enter');
      await modal.getByRole('button', { name: /保存档案/ }).click();
      await expect(modal).toHaveCount(0);
    }
    children = (await api('/api/children')).sort((a, b) => a.name.localeCompare(b.name));
    assert.equal(children.length, 3);
    await screenshot(admin, 'flow/children.png');
    return children.map(({ name, birthday }) => ({ name, birthday }));
  });
  const c7 = children.find((child) => child.name === '小芽7');
  const c20 = children.find((child) => child.name === '小芽20');
  const c30 = children.find((child) => child.name === '小芽30');
  const childItem = (child) => admin.locator('.family-child-item').filter({ has: admin.getByRole('heading', { name: child.name, exact: true }) });
  async function editChild(child, change) {
    await admin.goto(`${base}/admin/children`);
    await childItem(child).getByRole('button', { name: /编辑/ }).click();
    await change(admin.getByRole('dialog'));
    await admin.getByRole('dialog').getByRole('button', { name: /保存档案/ }).click();
    await expect(admin.getByRole('dialog')).toHaveCount(0);
  }
  await check('分龄计划、每日共看上限与知情提示', async () => {
    const p7 = await api(`/api/children/${c7.id}/today`);
    const p20 = await api(`/api/children/${c20.id}/today`);
    const p30 = await api(`/api/children/${c30.id}/today`);
    assert.equal(p7.screen.mode, 'parent-only');
    assert.ok(p7.items.every((item) => item.lesson.audience === 'parent'));
    assert.equal(p7.items.length, 2);
    assert.equal(p20.screen.mode, 'parent-only');
    assert.equal(p20.items.length, 2);
    assert.equal(p30.screen.mode, 'co-view');
    assert.equal(p30.items.length, 2);
    assert.ok(p30.items.reduce((sum, item) => sum + item.lesson.durationMin, 0) <= 30);
    await editChild(c20, async (modal) => {
      await selectOption(admin, '孩子侧屏幕模式', '开启亲子共看');
    });
    const enabled = await api(`/api/children/${c20.id}/today`);
    assert.equal(enabled.screen.mode, 'co-view');
    assert.equal(enabled.items.filter((item) => item.lesson.audience !== 'parent').length, 1);
    assert.ok(enabled.items.filter((item) => item.lesson.audience !== 'parent').every((item) => item.lesson.durationMin <= 8));
    await expect(childItem(c30).getByText(/中国卫健委/)).toBeVisible();
    await childItem(c30).getByRole('button', { name: `关闭${c30.name}的亲子共看提示`, exact: true }).click();
    await admin.reload();
    await expect(childItem(c30).getByText(/中国卫健委/)).toHaveCount(0);
    return { ages: [p7.child.ageMonths, p20.child.ageMonths, p30.child.ageMonths], counts: [p7.items.length, p20.items.length, p30.items.length], enabledChildLessons: 1 };
  });
  await check('遥控器连接、后台配对、选孩子、家长暗屏与记录', async () => {
    await player.goto(base);
    await pressTarget(player, '.setup-option.remote');
    await pressTarget(player, '.keypad-confirm');
    await expect(player.locator('.pair-code')).toBeVisible();
    const code = (await player.locator('.pair-code').getAttribute('aria-label')).split(' ').at(-1);
    await admin.goto(`${base}/admin/devices`);
    await admin.getByRole('button', { name: /添加设备/ }).first().click();
    await admin.getByRole('dialog').getByLabel('6 位配对码', { exact: true }).fill(code);
    await admin.getByRole('dialog').getByLabel('设备名称', { exact: true }).fill('T9 电视');
    await selectOption(admin, '绑定孩子', '暂不绑定孩子');
    await admin.getByRole('button', { name: /配对设备/ }).click();
    await admin.getByRole('button', { name: '确认配对', exact: true }).click();
    await expect(admin.getByRole('dialog')).toHaveCount(0);
    await player.clock.runFor(2500);
    await expect(player.locator('.children-list')).toBeVisible();
    const chosen = await player.locator('.children-list button').allTextContents();
    await pressTarget(player, `.children-list button:nth-child(${chosen.findIndex((name) => name.includes(c7.name)) + 1})`);
    await expect(player.locator('.parent-journey')).toBeVisible();
    const plan = await api(`/api/children/${c7.id}/today`);
    const parentId = plan.items.find((item) => bundle.lessons.find((lesson) => lesson.id === item.lessonId).steps[0].type === 'guide').lessonId;
    await pressTarget(player, `[data-lesson-id="${parentId}"]`);
    await beginLesson(player);
    await player.keyboard.press('Enter');
    await expect(player.locator('.spa-guide--play')).toBeVisible();
    await player.clock.runFor(1200);
    const before = await player.locator('.spa-guide-timer').textContent();
    await player.clock.runFor(1500);
    assert.notEqual(await player.locator('.spa-guide-timer').textContent(), before);
    await player.clock.fastForward(181_000);
    assert.equal(await player.locator('.pause-overlay').count(), 0);
    await screenshot(player, 'flow/guide-dark.png');
    await player.keyboard.press('Enter'); await player.keyboard.press('Enter'); await player.keyboard.press('Enter');
    const lesson = bundle.lessons.find((entry) => entry.id === parentId);
    if (lesson.steps.length > 1) {
      for (let i = 1; i < lesson.steps.length; i++) await finishStep(player, lesson.steps[i], i);
    }
    await expect(player.locator('.lesson-end')).toBeVisible();
    await screenshot(player, 'flow/parent-end.png');
    await pressTarget(player, '.lesson-end > .primary');
    const sessions = await api(`/api/sessions?childId=${c7.id}`);
    assert.ok(sessions.some((session) => session.completed && session.audience === 'parent'));
    assert.equal((await api(`/api/children/${c7.id}/screen`)).usedSec, 0);
    return { pairing: true, guideTimer: true, guideIdleExempt: true, parentScreenSec: 0 };
  });
  async function switchPlayer(child) {
    await player.keyboard.press('Escape'); await gate(player);
    await expect(player.locator('.parent-children')).toBeVisible();
    const names = await player.locator('.parent-children button').allTextContents();
    const selected = `.parent-children button:nth-child(${names.findIndex((name) => name.includes(child.name)) + 1})`;
    await pressTarget(player, selected);
    await expect(player.locator(selected)).toHaveClass(/selected/);
    await player.keyboard.press('Escape');
  }
  await check('共看课、结束线下活动及后台学习记录', async () => {
    await switchPlayer(c30);
    await expect(player.locator('.co-view-notice')).toBeVisible();
    await player.keyboard.press('Enter');
    await expect(player.locator('.co-view-notice')).toHaveCount(0);
    const plan = await api(`/api/children/${c30.id}/today`);
    const lesson = bundle.lessons.find((entry) => entry.id === plan.items[0].lessonId);
    await pressTarget(player, `[data-lesson-id="${lesson.id}"]`);
    await beginLesson(player);
    for (const [index, step] of lesson.steps.entries()) await finishStep(player, step, index);
    await expect(player.locator('.lesson-end')).toBeVisible();
    await screenshot(player, 'flow/child-end.png');
    await pressTarget(player, '.lesson-end > .primary');
    const sessions = await api(`/api/sessions?childId=${c30.id}`);
    assert.ok(sessions.some((session) => session.completed && session.audience === 'child'));
    await admin.goto(`${base}/admin/children`);
    await childItem(c30).getByRole('button', { name: /设为当前/ }).click();
    await admin.goto(`${base}/admin/sessions`);
    await expect(admin.getByText(lesson.title.zh, { exact: true }).first()).toBeVisible();
    await screenshot(admin, 'flow/sessions.png');
    return { lessonId: lesson.id, sessionAudience: 'child', completed: true };
  });
  await check('每日 1 分钟上限与家长门临时延长', async () => {
    await editChild(c30, async (modal) => {
      await modal.getByLabel('每日上限（分钟）', { exact: true }).fill('1');
    });
    await player.reload();
    const screen = await api(`/api/children/${c30.id}/screen`);
    if (screen.usedSec < 60) {
      await api('/api/sessions', 'POST', { childId: c30.id, lessonId: 'core.s6.fruit-pattern', startedAt: new Date().toISOString(), endedAt: new Date().toISOString(), durationSec: 60, audience: 'child', completed: false, stepsCompleted: 0, stepsTotal: 1, clientId: 'qa-limit-existing' });
      await player.reload();
    }
    await expect(player.locator('.rest-content')).toBeVisible();
    await screenshot(player, 'flow/rest-limit.png');
    await pressTarget(player, '.rest-content > .secondary');
    await gate(player);
    await expect(player.locator('.journey')).toBeVisible();
    assert.ok(await player.evaluate(() => localStorage.getItem('sprout.timeGrants')));
    return { dailyMaxSec: 60, rest: true, extendedThroughGate: true };
  });
  await check('parent-only 的仅线下计划、家长记录与后台徽标', async () => {
    await editChild(c30, async (modal) => {
      await selectOption(admin, '孩子侧屏幕模式', '仅家长指引');
    });
    const plan = await api(`/api/children/${c30.id}/today`);
    assert.equal(plan.items.length, 2);
    assert.ok(plan.items.every((item) => item.offlineOnly));
    await admin.goto(`${base}/admin/`);
    await expect(admin.getByText('线下版', { exact: true }).first()).toBeVisible();
    await player.reload();
    await expect(player.getByText('线下版', { exact: true }).first()).toBeVisible();
    const usedBefore = (await api(`/api/children/${c30.id}/screen`)).usedSec;
    await pressTarget(player, `[data-lesson-id="${plan.items[0].lessonId}"]`);
    await expect(player.locator('.offline-lesson')).toBeVisible();
    assert.equal(await player.locator('.activity-stage').count(), 0);
    await screenshot(player, 'flow/offline-only.png');
    await pressTarget(player, '.offline-lesson main > .primary');
    const sessions = await api(`/api/sessions?childId=${c30.id}`);
    assert.ok(sessions.some((session) => session.audience === 'parent' && session.stepsTotal === 0));
    assert.equal((await api(`/api/children/${c30.id}/screen`)).usedSec, usedBefore);
    return { offlineItems: 2, audience: 'parent', mountedActivities: 0 };
  });
  await check('A4 主题与单课打印无缺图', async () => {
    await admin.setViewportSize({ width: 794, height: 1123 });
    for (const [label, route] of [['theme', 'theme/s1-t1'], ['lesson', 'lesson/core.s3.find-animal']]) {
      await admin.goto(`${base}/admin/print/${route}`);
      await expect(admin.getByRole('button', { name: /打印/ })).toBeEnabled();
      await admin.emulateMedia({ media: 'print' });
      const metrics = await screenshot(admin, `print/${label}-a4.png`);
      assert.deepEqual(metrics.broken, []);
      await admin.emulateMedia({ media: 'screen' });
    }
    await admin.setViewportSize({ width: 1440, height: 1000 });
    return { routes: ['s1-t1', 'core.s3.find-animal'], missingImages: 0 };
  });
  await check('后台安装插件、自定义课与真实插件预览', async () => {
    await admin.goto(`${base}/admin/plugins`);
    await admin.getByRole('button', { name: /添加插件/ }).first().click();
    await admin.getByRole('dialog').locator('input[type=file]').setInputFiles(path.join(root, 'plugins/examples/hello-plugin/dist/example.hello-1.0.0.zip'));
    await admin.getByRole('checkbox', { name: /我信任此来源/ }).check();
    await admin.getByRole('button', { name: /安装插件/ }).click();
    await admin.getByRole('button', { name: '信任并安装', exact: true }).click();
    await expect(admin.getByRole('dialog')).toHaveCount(0);
    assert.ok((await api('/api/plugins')).some((plugin) => plugin.id === 'example.hello'));
    const input = structuredClone(bundle.lessons.find((lesson) => lesson.audience === 'child'));
    input.id = 'custom.qa-hello-stars';
    input.title = { zh: 'T9 一起数星星' };
    delete input.themeId;
    input.steps = [{ type: 'example.hello-stars', props: { count: 3 } }];
    const lesson = await api('/api/lessons', 'POST', input);
    await player.goto(`${base}/#/preview/${lesson.id}?token=${encodeURIComponent(token)}`);
    await beginLesson(player);
    await expect(player.locator('.hello-stars')).toBeVisible();
    await screenshot(player, 'flow/plugin-stars.png');
    await finishStep(player, lesson.steps[0], 0);
    await expect(player.locator('.lesson-end')).toBeVisible();
    return { installed: 'example.hello', customLesson: lesson.id, activity: 'example.hello-stars' };
  });
  await check('后台导出与同版本覆盖、hello-pack 导入课程库', async () => {
    await admin.goto(`${base}/admin/packs`);
    const pack = admin.locator('.system-item').filter({ hasText: 'sprout.core' });
    const downloadEvent = admin.waitForEvent('download');
    await pack.getByRole('button', { name: /导出/ }).click();
    const download = await downloadEvent;
    const exported = path.join(artifacts, 'sprout.core-export.zip');
    await download.saveAs(exported);
    for (const file of [exported, path.join(root, 'release/sprout.hello-1.0.0.zip')]) {
      await admin.getByRole('button', { name: /导入\s*ZIP/ }).click();
      await admin.getByRole('dialog').locator('input[type=file]').setInputFiles(file);
      await admin.getByRole('dialog').getByRole('button', { name: /导\s*入/ }).click();
      await admin.getByRole('button', { name: '确认导入', exact: true }).click();
      await expect(admin.getByRole('dialog')).toHaveCount(0);
    }
    const packs = await api('/api/packs');
    assert.equal(packs.find((item) => item.id === 'sprout.core').source, 'installed');
    assert.equal(packs.find((item) => item.id === 'sprout.hello').lessonCount, 2);
    await admin.goto(`${base}/admin/lessons?packId=sprout.hello`);
    await expect(admin.getByText('圆圆方方', { exact: true }).first()).toBeVisible();
    return { sameVersion: true, helloLessons: 2, coreLessons: 96 };
  });
  return token;
}

async function inspectLessons(token) {
  const ids = process.env.SPROUT_QA_IDS?.split(',');
  const types = process.env.SPROUT_QA_TYPES?.split(',');
  const lessons = bundle.lessons.filter((lesson) => (!ids || ids.includes(lesson.id))
    && (!types || lesson.steps.some((step) => types.includes(step.type))));
  for (const viewport of [{ width: 1920, height: 1080 }, { width: 1024, height: 768 }]) {
    const { page, context } = await pageFor(viewport, true);
    try {
      for (const lesson of lessons) {
        const row = { id: lesson.id, steps: lesson.steps.length, viewport: `${viewport.width}x${viewport.height}`, passed: false, inspections: [] };
        result.lessons = result.lessons.filter((item) => item.id !== row.id || item.viewport !== row.viewport);
        result.lessons.push(row);
        errors.set(page, []);
        try {
          await page.goto(`${base}/#/preview/${lesson.id}?token=${encodeURIComponent(token)}&age=${lesson.ageRange[0]}&mode=zh-en`);
          await beginLesson(page);
          for (const [index, step] of lesson.steps.entries()) {
            assert.equal(await stepNumber(page), index + 1, '当前步骤须与截图步骤一致');
            const metrics = await screenshot(page, `lessons/${lesson.id}/${row.viewport}-step-${index + 1}.png`);
            const inspection = { step: index + 1, type: step.type, ...metrics };
            row.inspections.push(inspection);
            assert.deepEqual(metrics.broken, [], '图片缺失');
            assert.deepEqual(metrics.overflow, [], '文字溢出');
            assert.equal(metrics.horizontalOverflow, false, '页面横向溢出');
            assert.equal(metrics.blank, false, '空白页');
            assert.equal(metrics.unknown, false, '未知活动');
            inspection.presses = await finishStep(page, step, index);
          }
          await expect(page.locator('.lesson-end')).toBeVisible();
          assert.deepEqual(errors.get(page), [], '控制台错误');
          await rm(path.join(artifacts, `lessons/${lesson.id}/${row.viewport}-failure.png`), { force: true });
          row.passed = true;
        } catch (error) {
          row.error = error.message;
          row.consoleErrors = [...errors.get(page)];
          await screenshot(page, `lessons/${lesson.id}/${row.viewport}-failure.png`).catch(() => undefined);
        }
        await persist();
        log(`${row.viewport} ${lesson.id} ${row.passed ? '通过' : `失败：${row.error}`}`);
      }
    } finally { await context.close(); }
  }
  assert.ok(result.lessons.filter((row) => lessons.some((lesson) => lesson.id === row.id)).every((row) => row.passed), '逐课巡检存在失败，详见 qa-artifacts/integration-results.json');
}

try {
  await startServer();
  browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true, args: ['--renderer-process-limit=2'], timeout: 120_000,
  });
  result.browserVersion = browser.version();
  let token;
  if (process.env.SPROUT_QA_PHASE === 'lessons') {
    const response = await fetch(`${base}/api/setup`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ familyName: 'T9 逐课验收', password: 'Sprout-T9-qa!' }),
    });
    assert.ok(response.ok);
    token = (await response.json()).token;
  } else {
    const admin = await pageFor({ width: 1440, height: 1000 });
    const player = await pageFor({ width: 1920, height: 1080 }, true);
    try { token = await runFlow(admin.page, player.page); }
    catch (error) {
      await mkdir(path.join(artifacts, 'flow'), { recursive: true });
      const dom = await admin.page.evaluate(() => [...document.querySelectorAll('.ant-select-dropdown')].map((el) => {
        const rect = el.getBoundingClientRect(), css = getComputedStyle(el);
        return { text: el.textContent, x: rect.x, y: rect.y, width: rect.width, height: rect.height,
          display: css.display, visibility: css.visibility, opacity: css.opacity, transform: css.transform,
          inline: el.getAttribute('style') };
      })).catch(() => []);
      await writeFile(path.join(artifacts, 'flow/admin-failure-dom.json'), JSON.stringify(dom, null, 2));
      await screenshot(admin.page, 'flow/admin-failure.png').catch(() => undefined);
      await screenshot(player.page, 'flow/player-failure.png').catch(() => undefined);
      throw error;
    }
    finally { await player.context.close(); await admin.context.close(); }
  }
  if (process.env.SPROUT_QA_PHASE !== 'flow') await inspectLessons(token);
  log('验收结束');
} catch (error) {
  result.error = error.message;
  console.error(error.stack);
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => undefined);
  if (server && server.exitCode === null) {
    server.kill('SIGTERM');
    await Promise.race([new Promise((resolve) => server.once('exit', resolve)), pause(5000)]);
    if (server.exitCode === null) { server.kill('SIGKILL'); await new Promise((resolve) => server.once('exit', resolve)); }
  }
  await rm(dataDir, { recursive: true, force: true });
  result.resourcesClosed = true;
  await persist();
}
