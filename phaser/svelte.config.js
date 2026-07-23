import adapter from '@sveltejs/adapter-cloudflare';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    // Cloudflare Workers 어댑터 — 사이트와 API(+server.ts)를 한 Worker로 배포한다.
    // 정적 페이지는 prerender로 그대로 정적 서빙되고(홈·Wiki·랭킹 셸), /api/* 라우트만
    // Worker에서 실행된다. platform.env로 D1 바인딩(DB)에 접근한다.
    // vite dev/preview에서 platformProxy가 wrangler.jsonc의 바인딩을 로컬 D1로 에뮬레이트하므로
    // `vite dev` 하나로 HMR + API + 로컬 D1이 함께 돈다 (별도 wrangler 불필요).
    adapter: adapter(),
    // 기존 Phaser 에셋 경로(public/assets/…)를 그대로 쓴다
    files: { assets: 'public' },
    // 게임 규칙·데이터는 engine/src 단일 원본, Svelte UI는 phaser/src가 소유한다.
    alias: { '@engine': '../engine/src' },
    // 배포 대상 미확정 — 루트 경로가 기본, 서브패스 배포가 결정되면 BASE_PATH로 전환
    paths: { base: process.env.BASE_PATH ?? '' },
  },
};

export default config;
