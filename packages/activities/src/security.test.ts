import { describe, expect, it } from 'vitest';
import { mediaAsset, sortColor, webTarget } from './security';

const helpers = {
  resolveAsset: (path: string) => /^https?:/.test(path) ? path : `/packs/test/${path}`,
  concept: () => undefined,
};

describe('资源与颜色白名单', () => {
  it.each(['#f08', '#f08a', '#f08a5d', '#f08a5dff', 'rgb(0, 128, 255)', 'rgba(255, 0, 12, .5)', 'red', 'Blue', 'transparent'])('允许安全颜色 %s', (value) => {
    expect(sortColor(value)).toBe(value.toLowerCase());
  });
  it.each(['url(https://tracking.test/a)', 'var(--untrusted)', 'red; background:url(x)', 'rgb(256,0,0)', 'rgba(0,0,0,2)', 'rgb(0,0,0,.5)', '#abcdex', 'hsl(0,0%,0%)', 'currentColor', 'color-mix(in srgb, red, blue)'])('拒绝 CSS token %s', (value) => {
    expect(sortColor(value)).toBeUndefined();
  });
  it('媒体只接受包内路径和解析服务器的同源 HTTP(S) URL', () => {
    expect(mediaAsset('video.mp4', helpers)).toBe('/packs/test/video.mp4');
    expect(mediaAsset(`${window.location.origin}/video.mp4`, helpers)).toBe(`${window.location.origin}/video.mp4`);
    for (const value of ['https://tracking.test/video.mp4', '//tracking.test/a', 'data:video/mp4;base64,AA==', 'blob:http://localhost/id', '../a', '%252e%252e/a', 'javascript:alert(1)']) {
      expect(mediaAsset(value, helpers)).toBeUndefined();
    }
  });
  it('网页必须为无凭据 HTTP(S) 独立来源', () => {
    expect(webTarget('https://child.test/a')?.origin).toBe('https://child.test');
    expect(webTarget(`${window.location.origin}/a`)).toBeNull();
    expect(webTarget('https://user:password@child.test/a')).toBeNull();
    expect(webTarget('javascript:alert(1)')).toBeNull();
  });
});
