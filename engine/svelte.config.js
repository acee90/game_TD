import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

export default {
  // Svelte 5 룬 모드 — 컴파일러가 TS를 벗겨준다
  preprocess: vitePreprocess(),
};
