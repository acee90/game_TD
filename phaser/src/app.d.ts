// SvelteKit 앱 전역 타입 — https://svelte.dev/docs/kit/types#app.d.ts
declare global {
  namespace App {
    // interface Error {}
    // interface Locals {}
    // interface PageData {}
    // interface PageState {}

    /** Cloudflare 바인딩 — +server.ts에서 platform.env.DB로 D1에 접근한다.
        vite dev/preview에서는 platformProxy가 wrangler.jsonc를 읽어 로컬 D1로 에뮬레이트한다. */
    interface Platform {
      env?: {
        DB: import('@cloudflare/workers-types').D1Database;
      };
    }
  }

  /** vite define 주입 — engine/src/vite-env.d.ts와 동일 계약 (런 로깅용) */
  const __GAME_BUILD_INFO__: import('@engine/game/logging').BuildInfo;
}

export {};
