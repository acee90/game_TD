import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    // 정적 사이트 — 모든 알려진 경로를 prerender한다 (exec-plans/website-shell-tower-wiki.md
    // §3.1, M1 게이트). fallback은 그 뒤에 추가로만 생성되는 파일이라 이 전제를 안 바꾼다 —
    // 존재하지 않는 URL(오타·삭제된 타워 ID)에서 Cloudflare 기본 404 대신 우리 +error.svelte를
    // 보여주기 위한 SPA 쉘이다. Cloudflare Pages가 build/404.html을 커스텀 404로 인식한다.
    adapter: adapter({ fallback: '404.html' }),
    // 기존 Phaser 에셋 경로(public/assets/…)를 그대로 쓴다
    files: { assets: 'public' },
    // 게임 규칙·데이터는 engine/src 단일 원본, Svelte UI는 phaser/src가 소유한다.
    alias: { '@engine': '../engine/src' },
    // 배포 대상 미확정 — 루트 경로가 기본, 서브패스 배포가 결정되면 BASE_PATH로 전환
    paths: { base: process.env.BASE_PATH ?? '' },
  },
};

export default config;
