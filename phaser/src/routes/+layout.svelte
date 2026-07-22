<script lang="ts">
  // 루트 레이아웃은 비워 둔다 — 사이트 크롬은 (site) 그룹 레이아웃이 담당한다.
  // /game·/dev/*는 자기 전역 CSS(app.css·랩 스타일)를 갖는 별도 세계라 셸을 씌우지 않는다.
  import type { Snippet } from 'svelte';

  let { children }: { children: Snippet } = $props();
</script>

{@render children()}
