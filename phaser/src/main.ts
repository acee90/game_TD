import { mount } from 'svelte';
import '@engine/app.css'; // HUD 스타일도 단일 원본 — 픽셀 재단장은 나중에 덮어쓴다
import App from './App.svelte';

mount(App, { target: document.getElementById('app')! });
