import { lazy, Suspense, useEffect, useState } from 'react';
import { Alert, App as AntApp, Button, Drawer, Grid, Layout, Menu, Popconfirm, Select, Spin, Tag, Tooltip } from 'antd';
import {
  AppstoreOutlined, BookOutlined, CalendarOutlined, DashboardOutlined, ExperimentOutlined,
  HeartFilled, HistoryOutlined, LogoutOutlined, MenuOutlined, NodeIndexOutlined,
  SettingOutlined, TeamOutlined, DesktopOutlined, ReloadOutlined,
} from '@ant-design/icons';
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router';
import { FamilyProvider, useFamily } from './context';
import { api, getToken, isMockMode, setToken, UNAUTHORIZED_EVENT } from './lib/api';
import Auth from './pages/Auth';
import PrintRoutes from './pages/Print';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Children = lazy(() => import('./pages/Children'));
const GrowthRoute = lazy(() => import('./pages/GrowthRoute'));
const Lessons = lazy(() => import('./pages/Lessons'));
const LessonEditor = lazy(() => import('./pages/LessonEditor'));
const Lexicon = lazy(() => import('./pages/Lexicon'));
const Milestones = lazy(() => import('./pages/Milestones'));
const Sessions = lazy(() => import('./pages/Sessions'));
const Packs = lazy(() => import('./pages/Packs'));
const Plugins = lazy(() => import('./pages/Plugins'));
const Devices = lazy(() => import('./pages/Devices'));
const Settings = lazy(() => import('./pages/Settings'));
const Evidence = lazy(() => import('./pages/Evidence'));

const navigation = [
  { key: '/', label: '今日概览', icon: <DashboardOutlined /> },
  { key: '/children', label: '孩子档案', icon: <TeamOutlined /> },
  { key: '/route', label: '成长路线', icon: <NodeIndexOutlined /> },
  { key: '/lessons', label: '课程库', icon: <BookOutlined /> },
  { key: '/lexicon', label: '词库', icon: <AppstoreOutlined /> },
  { key: '/milestones', label: '里程碑', icon: <CalendarOutlined /> },
  { key: '/sessions', label: '学习记录', icon: <HistoryOutlined /> },
  { key: '/packs', label: '内容包', icon: <AppstoreOutlined /> },
  { key: '/plugins', label: '活动插件', icon: <ExperimentOutlined /> },
  { key: '/devices', label: '播放设备', icon: <DesktopOutlined /> },
  { key: '/settings', label: '家庭设置', icon: <SettingOutlined /> },
];

function Workspace({ logout }: { logout: () => Promise<void> }) {
  const { children, childId, selectChild, loading } = useFamily();
  const { pathname, search, hash } = useLocation();
  const navigate = useNavigate();
  const screens = Grid.useBreakpoint();
  const [drawer, setDrawer] = useState(false);
  useEffect(() => {
    if (!isMockMode() || new URLSearchParams(search).get('mock') === '1') return;
    const query = new URLSearchParams(search);
    query.set('mock', '1');
    navigate({ pathname, search: query.toString(), hash }, { replace: true });
  }, [pathname, search, hash, navigate]);
  const selected = navigation.find((item) => item.key !== '/' && pathname.startsWith(item.key))?.key ?? '/';
  const menu = <Menu mode="inline" selectedKeys={[selected]} items={navigation} onClick={({ key }) => { navigate(key); setDrawer(false); }} />;
  const brand = <Link className="brand" to="/"><HeartFilled /><span>芽芽成长<small>SPROUT · 家长工作台</small></span></Link>;
  return <Layout className="app-shell">
    {screens.lg && <Layout.Sider theme="light" width={216} className="app-sidebar">
      {brand}<nav aria-label="主导航">{menu}</nav><div className="sidebar-footer"><span className="status-dot" />亲子共学，每天一点点</div>
    </Layout.Sider>}
    <Layout className="workspace">
      <Layout.Header className="app-header">
        <div className="header-left">
          {!screens.lg && <Tooltip title="打开导航"><Button aria-label="打开导航" type="text" icon={<MenuOutlined />} onClick={() => setDrawer(true)} /></Tooltip>}
          <span className="header-label">{screens.lg ? '家庭成长空间' : '芽芽成长'}</span>
          {isMockMode() && <Tag color="blue">开发演示</Tag>}
        </div>
        <div className="header-right">
          <Select aria-label="当前孩子" className="child-select" placeholder="选择孩子" loading={loading}
            value={children.some((child) => child.id === childId) ? childId : undefined}
            options={children.map((child) => ({ label: child.nickname || child.name, value: child.id }))}
            onChange={selectChild} notFoundContent={<Link to="/children">添加孩子档案</Link>} />
          <Popconfirm title="退出家长工作台？" onConfirm={logout} okText="退出" cancelText="取消">
            <Tooltip title="退出登录"><Button aria-label="退出登录" type="text" icon={<LogoutOutlined />} /></Tooltip>
          </Popconfirm>
        </div>
      </Layout.Header>
      <Layout.Content className="app-content">
        <Suspense fallback={<div className="route-loading"><Spin /><span>正在打开…</span></div>}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/children" element={<Children />} />
            <Route path="/route" element={<GrowthRoute />} />
            <Route path="/routes" element={<Navigate to="/route" replace />} />
            <Route path="/lessons" element={<Lessons />} />
            <Route path="/lessons/new" element={<LessonEditor />} />
            <Route path="/lessons/:id/edit" element={<LessonEditor />} />
            <Route path="/lexicon" element={<Lexicon />} />
            <Route path="/milestones" element={<Milestones />} />
            <Route path="/sessions" element={<Sessions />} />
            <Route path="/packs" element={<Packs />} />
            <Route path="/plugins" element={<Plugins />} />
            <Route path="/devices" element={<Devices />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/about/evidence" element={<Evidence />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </Layout.Content>
    </Layout>
    <Drawer title={brand} placement="left" open={drawer} size={260} onClose={() => setDrawer(false)} styles={{ body: { padding: 0 } }}>
      <nav aria-label="移动主导航">{menu}</nav>
    </Drawer>
  </Layout>;
}

export default function App() {
  const { message } = AntApp.useApp();
  const navigate = useNavigate();
  const { pathname, search, hash } = useLocation();
  useEffect(() => {
    if (!isMockMode() || new URLSearchParams(search).get('mock') === '1') return;
    const query = new URLSearchParams(search);
    query.set('mock', '1');
    navigate({ pathname, search: query.toString(), hash }, { replace: true });
  }, [pathname, search, hash, navigate]);
  const [status, setStatus] = useState<'loading' | 'authenticated' | 'anonymous'>(getToken() ? 'loading' : 'anonymous');
  const [error, setError] = useState<string>();
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!getToken()) { setStatus('anonymous'); return; }
    let active = true;
    api.get('/api/auth/me').then(() => {
      if (active) { setError(undefined); setStatus('authenticated'); }
    }).catch((err: unknown) => {
      if (!active) return;
      if (!getToken()) setStatus('anonymous');
      else setError(err instanceof Error ? err.message : '服务器连接失败');
    });
    return () => { active = false; };
  }, [revision]);
  useEffect(() => {
    const onUnauthorized = () => {
      setStatus('anonymous');
      navigate('/login', { replace: true });
      void message.warning('登录已过期，请重新登录');
    };
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, [navigate, message]);
  async function logout() {
    try { await api.post('/api/auth/logout'); }
    catch (err) { void message.error(err instanceof Error ? err.message : '注销未成功，请重试'); return; }
    setToken(null);
    setStatus('anonymous');
    navigate('/login', { replace: true });
  }
  if (status === 'loading') return <main className="connection-state">{error
    ? <Alert type="error" title={error} action={<Button icon={<ReloadOutlined />} onClick={() => { setError(undefined); setRevision((value) => value + 1); }}>重试</Button>} />
    : <Spin tip="正在连接家庭服务器" size="large"><div style={{ height: 100 }} /></Spin>}</main>;
  if (status === 'anonymous') return <Auth onAuthenticated={() => {
    setStatus('authenticated');
    if (!pathname.startsWith('/print/')) navigate('/', { replace: true });
  }} />;
  if (pathname.startsWith('/print/')) return <PrintRoutes />;
  return <FamilyProvider><Workspace logout={logout} /></FamilyProvider>;
}
