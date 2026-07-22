// SvelteKit 앱 전역 타입 — https://svelte.dev/docs/kit/types#app.d.ts
declare global {
  namespace App {
    // interface Error {}
    // interface Locals {}
    // interface PageData {}
    // interface PageState {}
    // interface Platform {}
  }

  /** vite define 주입 — engine/src/vite-env.d.ts와 동일 계약 (런 로깅용) */
  const __GAME_BUILD_INFO__: import('@engine/game/logging').BuildInfo;
}

export {};
