<script lang="ts">
  // /game — 현행 Phaser 게임 + HUD. Phaser를 import하는 모듈(GameClient)은
  // onMount 안에서 동적 import한다 (§3.1) — 다른 페이지 번들에 Phaser가 섞이지 않는다.
  import { onMount } from 'svelte';
  import { base } from '$app/paths';
  import type { Component } from 'svelte';

  let GameClient = $state<Component | null>(null);

  onMount(async () => {
    GameClient = (await import('$lib/game/GameClient.svelte')).default;
  });
</script>

<svelte:head>
  <title>플레이 — G-타워디펜스</title>
  <meta name="description" content="G-타워디펜스 플레이 — 타워와 영웅으로 몬스터를 막아내세요." />
</svelte:head>

<!-- 사이트로 돌아가는 좁은 바 — /game은 app.css 전역 스타일 세계라 전체 로드로 나간다 -->
<nav class="game-topbar" aria-label="사이트로 이동">
  <a href="{base}/" data-sveltekit-reload>← G-타워디펜스</a>
  <a href="{base}/wiki" data-sveltekit-reload>Wiki</a>
  <a href="{base}/ranking" data-sveltekit-reload>랭킹</a>
</nav>

{#if GameClient}
  <GameClient />
{:else}
  <p class="game-loading" aria-live="polite">게임을 불러오는 중…</p>
{/if}

<style>
  /* 상단 바 높이를 HUD 레이아웃(app.css)에 알린다 — 한 화면 맞춤 계산에 들어간다 */
  :global(:root) {
    --game-chrome-top: 30px;
  }

  .game-topbar {
    display: flex;
    gap: 16px;
    width: 100%;
    padding: 2px 2px 6px;
    font-size: 12px;
  }

  .game-topbar a {
    color: #9d8c6f;
    text-decoration: none;
  }

  .game-topbar a:hover {
    color: #ece2cb;
  }

  .game-topbar a:first-child {
    margin-right: auto;
    color: #e3b23e;
  }

  .game-loading {
    color: #9d8c6f;
    font-size: 13px;
    padding: 40px 0;
    text-align: center;
  }
</style>
