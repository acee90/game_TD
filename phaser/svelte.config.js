import adapter from '@sveltejs/adapter-cloudflare';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  // HUD의 이벤트 위임 컨테이너(AugmentPanel·AugmentOverlay·ActionsColumn)에서 나는
  // a11y 오탐을 억제한다. 이들은 {@html}로 렌더된 내부 요소의 클릭을 event.target으로
  // 위임받는 컨테이너라 자신은 인터랙티브가 아니다. svelte-ignore 주석이 이 규칙엔
  // 안 먹어(svelte 5.56) 여기서 파일 범위를 좁혀 억제한다 — 그 외 a11y 경고는 그대로 둔다.
  onwarn: (warning, handler) => {
    const delegationWarning =
      warning.code === 'a11y_no_noninteractive_element_interactions' ||
      warning.code === 'a11y_no_static_element_interactions';
    if (delegationWarning && warning.filename?.includes('/lib/game/')) return;
    handler(warning);
  },
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
