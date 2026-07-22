import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    // 정적 사이트 — fallback 없이 모든 알려진 경로를 prerender한다
    // (exec-plans/website-shell-tower-wiki.md §3.1, M1 게이트)
    adapter: adapter(),
    // 기존 Phaser 에셋 경로(public/assets/…)를 그대로 쓴다
    files: { assets: 'public' },
    // 엔진 단일 원본 — 게임 로직·데이터·HUD는 engine/src를 그대로 import (이중화 없음)
    alias: { '@engine': '../engine/src' },
    // 배포 대상 미확정 — 루트 경로가 기본, 서브패스 배포가 결정되면 BASE_PATH로 전환
    paths: { base: process.env.BASE_PATH ?? '' },
  },
};

export default config;
