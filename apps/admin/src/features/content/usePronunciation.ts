import { useCallback, useEffect, useRef, useState } from 'react';
import { App } from 'antd';
import type { Lang } from '@sprout/schema';
import { api } from '../../lib/api';

export function usePronunciation() {
  const { message } = App.useApp();
  const audio = useRef<HTMLAudioElement | null>(null);
  const request = useRef(0);
  const [playing, setPlaying] = useState<string>();
  const stop = useCallback(() => {
    ++request.current;
    audio.current?.pause();
    audio.current = null;
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    setPlaying(undefined);
  }, []);
  useEffect(() => () => {
    ++request.current;
    audio.current?.pause();
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  }, []);

  async function speak(key: string, lang: Lang, text: string) {
    if (playing === key) { stop(); return; }
    stop();
    const sequence = ++request.current;
    setPlaying(key);
    const finished = () => { if (sequence === request.current) setPlaying(undefined); };
    const browser = () => {
      if (sequence !== request.current) return;
      if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') {
        finished();
        void message.warning('当前设备无法朗读，服务端语音也暂不可用');
        return;
      }
      const speech = new SpeechSynthesisUtterance(text);
      speech.lang = lang === 'zh' ? 'zh-CN' : 'en-US';
      speech.rate = 0.85;
      speech.onend = finished;
      speech.onerror = () => {
        if (sequence === request.current) { finished(); void message.warning('语音播放未完成，请重试'); }
      };
      window.speechSynthesis.speak(speech);
    };
    try {
      const result = await api.post<{ url: string }>('/api/tts', { lang, text });
      if (sequence !== request.current) return;
      const next = new Audio(result.url);
      audio.current = next;
      next.onended = finished;
      let fallback = false;
      const fail = () => { if (!fallback) { fallback = true; browser(); } };
      next.onerror = fail;
      try { await next.play(); } catch { fail(); }
    } catch { browser(); }
  }
  return { playing, speak, stop };
}
