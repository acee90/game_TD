// ───────── 부트스트랩: Svelte 앱 마운트 ─────────
import { mount } from 'svelte';
import './app.css';

const isLogViewer = location.pathname === '/logs' || location.pathname === '/logs/';
const rootModule = isLogViewer ? import('./LogViewer.svelte') : import('./App.svelte');
const app = rootModule.then(({ default: Root }) => mount(Root, { target: document.body }));

export default app;
