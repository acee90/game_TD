<script lang="ts">
  // 루트 레이아웃은 비워 둔다 — 사이트 크롬은 (site) 그룹 레이아웃이 담당한다.
  // /game·/dev/*는 자기 전역 CSS(app.css·랩 스타일)를 갖는 별도 세계라 셸을 씌우지 않는다.
  import { onMount } from 'svelte';
  import { dev } from '$app/environment';
  import type { Component, Snippet } from 'svelte';

  let { children }: { children: Snippet } = $props();

  // svelte-grab — Alt+Click으로 컴포넌트 파일:줄을 집는 개발 도구.
  // dev에서만 동적 import — 프로덕션 번들에는 들어가지 않는다.
  let DevKit = $state<Component<{ enableMcp?: boolean }> | null>(null);

  onMount(() => {
    if (dev) {
      void import('svelte-grab').then((m) => {
        DevKit = m.SvelteDevKit as Component<{ enableMcp?: boolean }>;
      });
    }
  });
</script>

{@render children()}

{#if DevKit}
  <DevKit enableMcp />
{/if}
