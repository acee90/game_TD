// ───────── 부트스트랩: Svelte 앱 마운트 ─────────
import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';

const app = mount(App, { target: document.body });

export default app;
