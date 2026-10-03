// @vitest-environment node
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import react from '@vitejs/plugin-react';
import { describe, expect, it } from 'vitest';
import { runtimePolicy } from './csp';

describe('开发引导脚本的精确 CSP hash', () => {
  it.each(['/', './'])('已安装 Vite React 的 %s 引导在 HTML 与开发运行期均被放行', (base) => {
    const code = react.preambleCode.replace('__BASE__', base);
    const source = `'sha256-${createHash('sha256').update(code).digest('base64')}'`;
    const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
    expect(html).toContain(source);
    expect(runtimePolicy('', [], true)).toContain(source);
    expect(runtimePolicy('', [], false)).not.toContain(source);
  });
});
