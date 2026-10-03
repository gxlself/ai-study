import React from 'react';
import { createRoot } from 'react-dom/client';
import { App as AntApp, ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { BrowserRouter } from 'react-router';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import './styles.css';

dayjs.locale('zh-cn');

async function main() {
  if (import.meta.env.DEV && new URLSearchParams(location.search).get('mock') === '1') {
    const { installMock } = await import('./mocks');
    installMock();
  }
  createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <ConfigProvider locale={zhCN} theme={{
        token: {
          motion: !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
          colorPrimary: '#F08A5D', colorInfo: '#438DC3', colorSuccess: '#42947A',
          colorWarning: '#BF8C25', borderRadius: 8, colorText: '#283A38',
          colorBgLayout: '#F5F7F7',
          fontFamily: '"PingFang SC", "Microsoft YaHei", system-ui, sans-serif',
        },
        components: {
          Layout: { headerBg: '#ffffff', siderBg: '#ffffff' },
          Menu: { itemSelectedBg: '#FFF1E9', itemSelectedColor: '#A74923', itemHeight: 44 },
          Button: { primaryColor: '#342118' },
        },
      }}>
        <AntApp><ErrorBoundary><BrowserRouter basename="/admin"><App /></BrowserRouter></ErrorBoundary></AntApp>
      </ConfigProvider>
    </React.StrictMode>,
  );
}

void main();
