import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { BookOpen, Check, ChevronDown, Info, Monitor, SlidersHorizontal, Users, Volume2 } from 'lucide-react';
import { ageOf, DOMAIN_LABELS, DOMAINS, type Domain, type LanguageMode, type Stage } from '@sprout/schema';
import { useApp } from '../state/AppContext';
import { LocalSource } from '../data';
import { BackButton, Brand, LessonCard, Loading, Page } from '../ui/common';
import { ChildForm } from '../ui/ChildForm';

type Tab = 'children' | 'library' | 'settings' | 'about';
const tabs = [
  { id: 'children', label: '孩子', icon: Users },
  { id: 'library', label: '课程库', icon: BookOpen },
  { id: 'settings', label: '设置', icon: SlidersHorizontal },
  { id: 'about', label: '关于', icon: Info },
] as const;
const languages: { value: LanguageMode; label: string }[] = [
  { value: 'zh-en', label: '中文 → 英文' }, { value: 'zh', label: '中文' },
  { value: 'en-zh', label: '英文 → 中文' }, { value: 'en', label: '英文' },
];

export function Parent() {
  const app = useApp();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('children');
  const [domain, setDomain] = useState<Domain | ''>('');
  const [stageId, setStageId] = useState('');
  const [stages, setStages] = useState<Stage[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const prompted = useRef(false);
  const child = app.bootstrap?.child;
  const local = app.source?.kind === 'local';
  useEffect(() => {
    if (app.parentAccess || prompted.current) return;
    prompted.current = true;
    void app.askParent().then((passed) => { if (passed) app.setParentAccess(true); else navigate('/', { replace: true }); });
  }, [app.parentAccess, app.askParent, app.setParentAccess, navigate]);
  useEffect(() => {
    let active = true;
    void app.source?.routes().then((routes) => { if (active) setStages(routes.flatMap((route) => route.stages)); }).catch(() => undefined);
    return () => { active = false; };
  }, [app.source]);
  async function run(action: () => Promise<void>) {
    setBusy(true); setMessage('');
    try { await action(); setMessage('已保存'); } catch (e) { setMessage(e instanceof Error ? e.message : '操作未完成'); }
    finally { setBusy(false); }
  }
  const selectedStage = stages.find((stage) => stage.id === stageId);
  const stageLessons = new Set(selectedStage?.themes.flatMap((theme) => theme.lessons));
  const filtered = app.lessons.filter((lesson) => (!domain || lesson.domains.includes(domain)) && (!selectedStage || stageLessons.has(lesson.id)));
  if (!app.parentAccess) return <Page><Loading text="等待家长确认" /></Page>;
  return <Page className="parent-page" onBack={() => navigate('/')}>
    <header><div className="header-group"><BackButton home onClick={() => navigate('/')} /><h1>家长菜单</h1></div><Brand /></header>
    <div className="parent-layout">
      <nav className="parent-tabs" aria-label="家长菜单">{tabs.map(({ id, label, icon: Icon }) => <button data-focusable key={id} aria-current={id === tab ? 'page' : undefined} onClick={() => { setTab(id); setMessage(''); }}><Icon /><span>{label}</span></button>)}</nav>
      <main className="parent-content" key={tab}>
        {tab === 'children' && <><h2>陪谁一起长大</h2>
          <div className="parent-children">{app.bootstrap?.children.map((profile) => <button data-focusable key={profile.id} disabled={busy} className={profile.id === child?.id ? 'selected' : ''} onClick={() => void run(() => app.switchChild(profile.id))}>
            <Users /><span>{profile.nickname || profile.name}<small>{profile.birthday.slice(0, 7)}</small></span>{profile.id === child?.id && <Check />}
          </button>)}</div>
          {local && child && <section className="profile-editor"><h3>孩子信息</h3><ChildForm key={child.id} child={child} label="保存孩子信息" onSave={async (input) => {
            if (!(app.source instanceof LocalSource)) return;
            await app.source.saveChild(input, child.id); await app.refresh(); setMessage('已保存');
          }} /></section>}
          {!local && <p className="muted">孩子信息与屏幕时间由家庭服务器后台管理。</p>}
        </>}
        {tab === 'library' && <><h2>课程库</h2><div className="library-filters">
          <label>成长阶段<span><select data-focusable aria-label="成长阶段" value={stageId} onChange={(e) => setStageId(e.target.value)}><option value="">全部阶段</option>{stages.map((stage, i) => <option key={`${stage.id}-${i}`} value={stage.id}>{stage.title.zh} · {stage.ageRange[0]}–{stage.ageRange[1]} 月</option>)}</select><ChevronDown /></span></label>
          <label>学习领域<span><select data-focusable aria-label="学习领域" value={domain} onChange={(e) => setDomain(e.target.value as Domain | '')}><option value="">全部领域</option>{DOMAINS.map((item) => <option value={item} key={item}>{DOMAIN_LABELS[item].zh}</option>)}</select><ChevronDown /></span></label>
        </div><div className="library-grid">{filtered.map((lesson) => <LessonCard key={lesson.id} lesson={lesson} />)}</div>{!filtered.length && <p className="empty">这个阶段暂时没有对应课程。</p>}</>}
        {tab === 'settings' && <><h2>播放设置</h2>
          <section className="settings-section">
            <h3>屏幕模式</h3>
            {local && child ? <div className="segmented" role="group" aria-label="屏幕模式">{([
              { value: 'auto', label: '跟随月龄' }, { value: 'parent-only', label: '家长模式' }, { value: 'co-view', label: '亲子共看' },
            ] as const).map(({ value, label }) => <button data-focusable key={value} aria-pressed={(child.screen.mode ?? 'auto') === value} disabled={busy || (value === 'co-view' && ageOf(child.birthday).months < 18)} onClick={() => void run(async () => {
              if (app.source instanceof LocalSource) { await app.source.saveChild({ ...child, screen: { ...child.screen, mode: value } }, child.id); await app.refresh(); }
            })}>{label}</button>)}</div> : <p>请在家庭服务器后台设置；18 月龄以下只提供家长指引。</p>}
            {local && <p className="mode-guidance">18 月龄以下不给宝宝看屏幕；18–23 月龄默认关闭共看。共看时家长必须全程陪同。</p>}
          </section>
          <section className="settings-section">
            <h3>语言模式</h3>
            {local && child ? <div className="segmented" role="group" aria-label="语言模式">{languages.map(({ value, label }) => <button data-focusable key={value} aria-pressed={child.languageMode === value} disabled={busy} onClick={() => void run(async () => {
              if (app.source instanceof LocalSource) { await app.source.saveChild({ ...child, languageMode: value }, child.id); await app.refresh(); }
            })}>{label}</button>)}</div> : <p>{languages.find((lang) => lang.value === child?.languageMode)?.label} · 请在家庭服务器后台修改</p>}
            <label className="toggle-row"><span>家长提示条</span><input data-focusable type="checkbox" checked={app.prefs.parentHints} onChange={(e) => app.setPrefs({ parentHints: e.target.checked })} /></label>
            <label className="toggle-row"><span>减少动画</span><input data-focusable type="checkbox" checked={app.prefs.reducedMotion} onChange={(e) => app.setPrefs({ reducedMotion: e.target.checked })} /></label>
            {local && child && <label className="toggle-row"><span>护眼距离提醒</span><input data-focusable type="checkbox" checked={child.screen.distanceReminder} disabled={busy} onChange={(e) => void run(async () => {
              if (app.source instanceof LocalSource) { await app.source.saveChild({ ...child, screen: { ...child.screen, distanceReminder: e.target.checked } }, child.id); await app.refresh(); }
            })} /></label>}
            <label className="volume-row"><span><Volume2 />朗读与提示音</span><input data-focusable type="range" min="0" max="1" step="0.05" aria-label="音量" value={app.prefs.volume} onChange={(e) => app.setPrefs({ volume: Number(e.target.value) })} /><output>{Math.round(app.prefs.volume * 100)}%</output></label>
          </section>
          <section className="settings-section"><h3>家庭服务器</h3><p className="connection-address">{local ? '离线模式 · 数据保存在这台设备' : localStorage.getItem('sprout.server')}</p>
            <div className="settings-actions"><button data-focusable className="secondary" onClick={() => navigate('/setup?connect=1')}><Monitor />{local ? '连接家庭服务器' : '更换服务器 / 重新配对'}</button>
              {!local && <button data-focusable className="secondary" onClick={() => navigate('/setup?offline=1')}>切换离线模式</button>}</div>
          </section>
        </>}
        {tab === 'about' && <><h2>芽芽成长 Sprout</h2><p>播放端 1.0.0 · 亲子共学</p><section className="settings-section"><h3>内容与素材许可</h3>
          {app.bootstrap?.packs.map((pack) => <article className="pack-credit" key={pack.id}><h4>{pack.name.zh} <small>{pack.version}</small></h4><p>{pack.author} {pack.license}</p><ul>{pack.credits.map((credit, i) => <li key={i}>{credit.name} · {credit.license}{credit.note && <p>{credit.note}</p>}{credit.url && /^https?:\/\//.test(credit.url) && <a data-focusable href={credit.url} target="_blank" rel="noopener noreferrer">来源</a>}</li>)}</ul></article>)}
          <p className="muted">界面图标：Lucide，ISC 许可。</p>
        </section></>}
        {message && <p className="save-message" role="status">{message}</p>}
      </main>
    </div>
  </Page>;
}
