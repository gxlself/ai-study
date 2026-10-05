export const IS_DEMO = import.meta.env.VITE_SPROUT_DEMO === '1';

export function demoLabel(): string {
  return typeof navigator !== 'undefined' && /^zh/i.test(navigator.language)
    ? '演示版 · 数据只保存在本浏览器 · 无预录音频'
    : 'Demo · data stays in this browser · no pre-recorded audio';
}
