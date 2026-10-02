import { describe, expect, it } from 'vitest';
import type { PluginInfo } from '@sprout/schema';
import {
  downloadName, fileSelectionError, formatLastSeen, groupPlugins, isLoopbackAddress,
  normalizeHttpUrl, parseBackup, permissionInfo, playerAddress, validationIssues,
} from './helpers';

describe('系统页外部地址', () => {
  it('仅接受 HTTP(S)，并阻止带凭据的 URL', () => {
    expect(normalizeHttpUrl(' https://example.com/plugin.json ')).toBe('https://example.com/plugin.json');
    expect(normalizeHttpUrl('http://192.168.1.20:4310')).toBe('http://192.168.1.20:4310/');
    for (const url of [
      'javascript:alert(1)', 'data:text/html,hello', 'file:///tmp/plugin.json',
      '//example.com/plugin.json', 'https://name:secret@example.com/plugin.json', '/relative/plugin.json', '',
    ]) {
      expect(normalizeHttpUrl(url), url).toBeUndefined();
    }
  });

  it('播放地址优先使用服务器提示，移除后台路径、查询参数和 hash', () => {
    expect(playerAddress('http://192.168.1.20:4310/admin/?token=secret#tab', 'http://localhost:5311'))
      .toBe('http://192.168.1.20:4310/');
    expect(playerAddress('192.168.1.20:4310', 'http://localhost:5311'))
      .toBe('http://192.168.1.20:4310/');
    expect(playerAddress('', 'https://family.example/admin/')).toBe('https://family.example/');
    expect(playerAddress('javascript:alert(1)', 'https://family.example')).toBe('https://family.example/');
  });

  it('识别电视无法使用的回环和监听地址', () => {
    for (const host of ['localhost', '127.0.0.1', '[::1]', '0.0.0.0']) {
      expect(isLoopbackAddress(`http://${host}:4310/`)).toBe(true);
    }
    expect(isLoopbackAddress('http://192.168.1.20:4310/')).toBe(false);
  });
});

describe('上传前检查', () => {
  it('支持大写扩展名，拒绝空文件和错误扩展名', () => {
    expect(fileSelectionError({ name: '课程.ZIP', size: 123 }, 'zip')).toBeNull();
    expect(fileSelectionError({ name: 'backup.JSON', size: 123 }, 'json')).toBeNull();
    expect(fileSelectionError({ name: 'empty.zip', size: 0 }, 'zip')).toContain('为空');
    expect(fileSelectionError({ name: 'backup.json.exe', size: 123 }, 'json')).toContain('JSON');
    expect(fileSelectionError({ name: 'plugin.json', size: 123 }, 'zip')).toContain('ZIP');
  });

  it('在读取文件前拒绝超过服务端限制的备份', () => {
    expect(fileSelectionError({ name: 'backup.json', size: 25 * 1024 * 1024 }, 'json')).toBeNull();
    expect(fileSelectionError({ name: 'backup.json', size: 25 * 1024 * 1024 + 1 }, 'json')).toContain('25 MB');
  });

  it('检查 JSON 对象，不把空文件、数组或无效 JSON 当作备份', () => {
    expect(parseBackup('{"schemaVersion":1,"children":[]}')).toEqual({ schemaVersion: 1, children: [] });
    for (const text of ['', '{bad}', '[]', 'null', '"text"', '42', '{}', '\uFEFF{"schemaVersion":1}']) {
      expect(() => parseBackup(text), text).toThrow();
    }
  });
});

describe('权限与数据展示', () => {
  it('内置和第三方分组不依赖固定数量', () => {
    const plugin = (source: PluginInfo['source'], id: string): PluginInfo => ({
      id, source, enabled: true, name: { zh: id }, version: '1.0.0', activities: [], permissions: [],
    });
    const items = [plugin('installed', 'acme.one'), plugin('builtin', 'core'), plugin('remote', 'acme.two')];
    expect(groupPlugins(items).builtin.map((item) => item.id)).toEqual(['core']);
    expect(groupPlugins(items).external.map((item) => item.id)).toEqual(['acme.one', 'acme.two']);
    expect(groupPlugins([])).toEqual({ builtin: [], external: [] });
  });

  it('未知权限仍然明确警告', () => {
    expect(permissionInfo('microphone').risk).toContain('隐私');
    expect(permissionInfo('unexpected-permission').label).toContain('未知权限');
    expect(permissionInfo('unexpected-permission').risk).toContain('确认用途');
    expect(permissionInfo('__proto__').label).toContain('未知权限');
    expect(permissionInfo('constructor').label).toContain('未知权限');
  });

  it('只展示符合契约的校验 issues', () => {
    const issue = { path: 'lessons.0.title', message: '请输入标题', level: 'error' };
    expect(validationIssues({ issues: [issue, null, { message: 'bad' }, { ...issue, level: 'info' }] })).toEqual([issue]);
    expect(validationIssues(new Error('网络失败'))).toEqual([]);
    expect(validationIssues(null)).toEqual([]);
  });

  it('下载文件名不能携带路径', () => {
    expect(downloadName('sprout.core', '1.0.0')).toBe('sprout.core-1.0.0.zip');
    expect(downloadName('../../bad', '1/2')).not.toMatch(/[\\/]/);
  });

  it('没有最后在线时间时不虚构在线状态', () => {
    expect(formatLastSeen(null)).toBe('尚未上线');
    expect(formatLastSeen('invalid')).toBe('时间暂不可用');
    expect(formatLastSeen('2026-10-02T12:00:00Z')).toContain('2026');
  });
});
