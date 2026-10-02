import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Blocks, Moon, Sun } from 'lucide-react';
import { useApp } from '../state/AppContext';
import { Brand, LessonCard, Page, ParentButton, useMinuteRefresh } from '../ui/common';
import { ageOf } from '@sprout/schema';
import { resolvePlaybackMode } from '../data';
import { effectiveScreen, grantTenMinutes, todayGrant } from '../state/policy';

export function Rest() {
  const app = useApp();
  const navigate = useNavigate();
  const [message, setMessage] = useState('');
  const child = app.bootstrap?.child;
  const screen = app.plan?.screen;
  const hour = new Date().getHours();
  const night = hour >= 19 || hour < 7;
  useMinuteRefresh();
  const effective = child && screen ? effectiveScreen(screen, child.id) : screen;
  async function extend() {
    if (!child || !screen || !await app.askParent()) return;
    try {
      if (grantTenMinutes(child.id, screen)) {
        await app.refresh();
        navigate('/', { replace: true });
      } else setMessage('今天已经延长过一次，明天再来吧');
    } catch (e) { setMessage(e instanceof Error ? e.message : '暂时无法保存'); }
  }
  const parentOnly = child && resolvePlaybackMode(screen, child) === 'parent-only';
  const canExtend = child && !parentOnly && (screen?.usedSec ?? 0) < 3600 && !todayGrant(child.id);
  const age = child ? ageOf(child.birthday).months : 0;
  const guides = app.lessons.filter((lesson) => lesson.audience === 'parent' && !child?.plan.skipped.includes(lesson.id) && age >= lesson.ageRange[0] && age <= lesson.ageRange[1]).slice(0, 3);
  return <Page className={`rest ${night ? 'night' : 'day'}`} onBack={() => void app.askParent().then((ok) => { if (ok) { app.setParentAccess(true); navigate('/parent'); } })}>
    <header><Brand /></header>
    <main className="rest-content">
      <div className="rest-art" aria-hidden="true">{night ? <Moon /> : <><Sun /><Blocks /></>}</div>
      <h1>{effective?.reason === 'outside-window' ? '现在是休息时间' : effective?.allowedNow ? '小旅程准备好啦' : '今天的屏幕时间用完啦'}</h1>
      <p>{effective?.reason === 'outside-window' ? `${effective.nextWindow ?? '明天'} 再见` : '把小小的发现，带到生活里'}</p>
      <div className="rest-suggestions">
        <article><h3>搭一座小小的家</h3><p>和宝宝轮流放一块大积木，再轻轻数一数。</p><small>选择适龄大积木，家长全程陪伴。</small></article>
        <article><h3>抱一抱，说晚安</h3><p>找一本喜欢的图画书，靠在一起指指、说说。</p><small>让宝宝决定什么时候翻到下一页。</small></article>
      </div>
      {parentOnly || effective?.allowedNow ? <button data-focusable className="primary" onClick={() => navigate('/')}>{parentOnly ? '回到家长模式首页' : '回到首页'}</button>
        : <button data-focusable className="secondary" disabled={!canExtend} onClick={() => void extend()}>{canExtend ? '家长 · 临时再给 10 分钟' : (screen?.usedSec ?? 0) >= 3600 ? '今日屏幕时间已达到上限' : '今天已延长过一次'}</button>}
      {!parentOnly && !effective?.allowedNow && <small>本设备 · 每天一次，不突破每日 60 分钟</small>}
      {message && <p role="status">{message}</p>}
    </main>
    <section className="rest-guides"><h2>家长指引</h2><div className="parent-guide-grid">{guides.map((lesson) => <LessonCard key={lesson.id} lesson={lesson} adult />)}</div>{!guides.length && <p className="muted">当前内容包暂无适龄的家长指引课。</p>}</section>
    <ParentButton />
  </Page>;
}
