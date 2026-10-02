// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { ContrastPattern as PatternSchema } from '@sprout/schema';
import { contrastSvg, type ContrastPattern } from './contrast-svg';

const palettes = ['bw', 'bwr'] as const;
const patterns = PatternSchema.options;

describe('纯 SVG 高对比图案', () => {
  it('在没有 DOM 的 Node 环境中生成完整 SVG', () => {
    const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
    const documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
    Reflect.deleteProperty(globalThis, 'window');
    Reflect.deleteProperty(globalThis, 'document');
    try {
      expect(typeof window).toBe('undefined');
      expect(typeof document).toBe('undefined');
      expect(contrastSvg('circle', 'bw')).toContain('<svg');
    } finally {
      if (windowDescriptor) Object.defineProperty(globalThis, 'window', windowDescriptor);
      if (documentDescriptor) Object.defineProperty(globalThis, 'document', documentDescriptor);
    }
    expect(patterns).toHaveLength(12);
    expect(contrastSvg('circle', 'bw')).toMatch(
      /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="200" height="200" viewBox="0 0 200 200">.+<\/svg>$/,
    );
  });

  describe.each(patterns)('%s', (pattern) => {
    it.each(palettes)('%s 调色板可正反显示且输出确定', (palette) => {
      for (const invert of [false, true]) {
        const svg = contrastSvg(pattern, palette, { invert });
        const background = invert ? '#000' : '#fff';
        const ink = palette === 'bwr' ? '#dc2626' : invert ? '#fff' : '#000';
        expect(svg).toContain(`<rect width="200" height="200" fill="${background}"/>`);
        expect(svg).toContain(`<g fill="${ink}">`);
        expect(svg).toMatch(new RegExp(`<g fill="${ink}"><(?:circle|rect|path|g)\\b`));
        expect(svg.endsWith('</g></svg>')).toBe(true);
        expect(svg).toBe(contrastSvg(pattern, palette, { invert }));
        expect(svg).not.toMatch(/currentColor|var\(|<script|<style|<image|<foreignObject|<animate|\son\w+=|\s(?:href|xlink:href)=/i);
        expect(svg).not.toMatch(/NaN|Infinity|undefined|null/);
        if (palette === 'bw') expect(svg).not.toContain('#dc2626');
      }
    });
  });

  it.each(palettes)('%s 的十二种图案各不相同', (palette) => {
    expect(new Set(patterns.map((pattern) => contrastSvg(pattern, palette))).size).toBe(12);
  });

  it('反转同心圆时同时交换镂空间隔的颜色', () => {
    for (const palette of palettes) {
      for (const invert of [false, true]) {
        const svg = contrastSvg('bullseye', palette, { invert });
        const background = invert ? '#000' : '#fff';
        const ink = palette === 'bwr' ? '#dc2626' : invert ? '#fff' : '#000';
        for (const radius of [88, 44]) {
          expect(svg).toContain(`<circle cx="100" cy="100" r="${radius}" fill="${ink}"/>`);
        }
        for (const radius of [66, 22]) {
          expect(svg).toContain(`<circle cx="100" cy="100" r="${radius}" fill="${background}"/>`);
        }
      }
    }
  });

  it.each([1, 64, 512, 1024, 512.5])('size=%s 只改变输出尺寸，不改变图案坐标', (size) => {
    for (const pattern of patterns) {
      for (const palette of palettes) {
        for (const invert of [false, true]) {
          const svg = contrastSvg(pattern, palette, { size, invert });
          const defaultSvg = contrastSvg(pattern, palette, { invert });
          expect(svg).toContain(`width="${size}" height="${size}" viewBox="0 0 200 200"`);
          expect(svg.slice(svg.indexOf('>') + 1)).toBe(defaultSvg.slice(defaultSvg.indexOf('>') + 1));
        }
      }
    }
  });
});

describe('SVG 输入安全', () => {
  it.each(['unknown', '__proto__', 'constructor', 'toString', 'circle"><script>alert(1)</script>'])(
    '拒绝图案 %s，不把输入拼入 XML',
    (pattern) => {
      expect(() => contrastSvg(pattern as ContrastPattern, 'bw')).toThrow('Unknown contrast pattern');
    },
  );

  it('拒绝非法调色板和反转值', () => {
    expect(() => contrastSvg('circle', 'red" onload="alert(1)' as 'bw')).toThrow('Unknown contrast palette');
    expect(() => contrastSvg('circle', 'bw', { invert: 'true' as unknown as boolean })).toThrow(TypeError);
  });

  it.each([0, -1, NaN, Infinity, -Infinity, null, '200', '200" onload="alert(1)', {}, []].map((size) => ({ size })))(
    '拒绝非正有限数值尺寸 $size',
    ({ size }) => {
      expect(() => contrastSvg('circle', 'bw', { size: size as number })).toThrow(RangeError);
    },
  );

  it('不调用参数对象的字符串转换，也不修改配置', () => {
    const untrusted = { toString() { throw new Error('Unexpected coercion'); } };
    expect(() => contrastSvg(untrusted as unknown as ContrastPattern, 'bw')).toThrow('Unknown contrast pattern');
    expect(() => contrastSvg('circle', 'bw', { size: untrusted as unknown as number })).toThrow(RangeError);
    const options = Object.freeze({ invert: true, size: 512 });
    expect(contrastSvg('face', 'bwr', options)).toBe(contrastSvg('face', 'bwr', options));
    expect(options).toEqual({ invert: true, size: 512 });
  });
});
