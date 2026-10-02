import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

describe('web fixture 完成协议', () => {
  it.each([
    ['http://localhost:5312', true],
    ['http://127.0.0.1:5312', false],
    ['http://localhost:5412', false],
    ['https://example.com', false],
    ['*', false],
  ])('parentOrigin=%s 的来源白名单', async (parentOrigin, allowed) => {
    const html = await readFile(resolve(import.meta.dirname, './assets/web-fixture.html'), 'utf8');
    const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
    expect(script).toBeDefined();
    document.body.innerHTML = '<button id="finish">你好</button><output id="result"></output>';
    const postMessage = vi.fn();
    const fixtureWindow = {
      location: new URL(`http://127.0.0.1:5312/assets/web-fixture.html?parentOrigin=${encodeURIComponent(parentOrigin)}`),
      parent: { postMessage },
    };
    // 仅在测试环境执行仓库内的固定 fixture 脚本，不接收外部代码。
    new Function('window', 'document', script!)(fixtureWindow, document);
    const button = document.getElementById('finish') as HTMLButtonElement;
    button.click();
    button.click();
    if (allowed) {
      expect(postMessage).toHaveBeenCalledExactlyOnceWith({ type: 'sprout:complete' }, parentOrigin);
    } else expect(postMessage).not.toHaveBeenCalled();
    expect(button.disabled).toBe(true);
  });
});
