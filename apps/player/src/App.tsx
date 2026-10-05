import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router';
import { useEffect } from 'react';
import { AppProvider, useApp } from './state/AppContext';
import { DemoBadge, Loading, Page, Problem } from './ui/common';
import { Setup } from './pages/Setup';
import { Home } from './pages/Home';
import { LessonPlayer } from './pages/LessonPlayer';
import { Parent } from './pages/Parent';
import { Rest } from './pages/Rest';
import { Preview } from './pages/Preview';
import { isPreviewPath } from './security/preview';
import { IS_DEMO } from './demo';

function MainRoutes() {
  const app = useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const preview = isPreviewPath(location.pathname);
  useEffect(() => { if (location.pathname !== '/parent') app.setParentAccess(false); }, [location.pathname, app.setParentAccess]);
  if (!preview && location.pathname !== '/setup') {
    if (app.loading) return <Page><Loading /></Page>;
    if (!app.source) return <Navigate to="/setup" replace />;
    if (app.error && !app.bootstrap) return <Page><Problem message={app.error} retry={() => void app.refresh().catch(() => undefined)} /><button data-focusable onClick={() => navigate('/setup')}>连接设置</button></Page>;
    if (!app.bootstrap?.child) return <Navigate to={IS_DEMO ? '/setup?offline=1' : '/setup?children=1'} replace />;
  }
  return <Routes>
    <Route path="/setup" element={<Setup />} />
    <Route path="/" element={<Home />} />
    <Route path="/lesson/:id" element={<LessonPlayer />} />
    <Route path="/rest" element={<Rest />} />
    <Route path="/parent" element={<Parent />} />
    <Route path="/preview/:lessonId?" element={<Preview />} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>;
}

export function App() {
  return <AppProvider><DemoBadge /><MainRoutes /></AppProvider>;
}
