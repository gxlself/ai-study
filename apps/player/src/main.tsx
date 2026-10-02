import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router';
import { Capacitor } from '@capacitor/core';
import '../../../packages/plugin-sdk/src/tokens.css';
import '@sprout/activities/styles.css';
import './styles.css';
import { App } from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(<HashRouter><App /></HashRouter>);

if (import.meta.env.PROD && /^https?:$/.test(location.protocol) && !Capacitor.isNativePlatform() && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('./sw.js').catch(() => undefined);
  });
}
