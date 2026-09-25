import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import 'katex/dist/katex.min.css';

declare global {
  interface Window {
    __luminaHideStartupSplash?: (reason?: string) => void;
    __luminaSetStartupSplashStatus?: (message: string) => void;
    __luminaSplashStartedAt?: number;
    __luminaMinStartupSplashMs?: number;
  }
}

const hideStartupSplash = (reason = 'react-mounted') => {
  if (typeof window.__luminaHideStartupSplash === 'function') {
    window.__luminaHideStartupSplash(reason);
    return;
  }

  const splash = document.getElementById('lumina-startup-splash');
  if (!splash) return;

  splash.classList.add('lumina-splash-hide');
  splash.setAttribute('aria-hidden', 'true');
  window.setTimeout(() => splash.remove(), 360);
};

const updateStartupSplashStatus = (message: string) => {
  if (typeof window.__luminaSetStartupSplashStatus === 'function') {
    window.__luminaSetStartupSplashStatus(message);
    return;
  }

  const subtitle = document.querySelector<HTMLElement>('.lumina-splash-subtitle');
  if (subtitle) subtitle.textContent = message;
};

const rootElement = document.getElementById('root');

if (!rootElement) {
  updateStartupSplashStatus('启动失败：未找到应用挂载节点');
  hideStartupSplash('missing-root');
  throw new Error('Lumina Edit Pro failed to start: #root element is missing.');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

updateStartupSplashStatus('正在进入编辑器…');

window.requestAnimationFrame(() => {
  window.requestAnimationFrame(() => {
    hideStartupSplash('react-first-paint');
  });
});

window.setTimeout(() => {
  hideStartupSplash('startup-watchdog');
}, 5000);
