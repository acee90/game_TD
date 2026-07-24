<script lang="ts">
  import { onMount } from 'svelte';
  import { base } from '$app/paths';
  import '$lib/labs/lab.css';

  let host: HTMLDivElement;

  onMount(() => {
    let game: import('phaser').Game | undefined;
    let disposed = false;
    void import('$lib/labs/map-lab2').then(({ createMapLab2 }) => {
      if (!disposed) game = createMapLab2(host);
    });
    return () => {
      disposed = true;
      game?.destroy(true);
    };
  });
</script>

<svelte:head>
  <title>맵 타일셋 미리보기 2 — G-타워디펜스 DEV</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="lab-page">
  <main>
    <header>
      <p class="eyebrow">G-TD / MAP LAB 2</p>
      <h1>Pixel Art Top Down 타일 맵</h1>
      <p>
        `Pixel Art Top Down - Basic v1.2.3`의 잔디·돌길·벽 타일을 현재 게임의 십자 경로와 타워 슬롯에 맞춰 배치한 미리보기입니다.
        <b>G</b> 키로 논리 격자를 켜고 끌 수 있습니다.
      </p>
    </header>
    <div class="lab-host" bind:this={host} aria-label="Pixel Art Top Down 타일셋을 적용한 맵 프리뷰"></div>
    <nav aria-label="검수실 이동">
      <a href="{base}/dev/map-lab" data-sveltekit-reload>기존 맵 정렬 검수실</a>
      <a href="{base}/game" data-sveltekit-reload>게임으로</a>
      <a href="{base}/" data-sveltekit-reload>홈</a>
    </nav>
  </main>
</div>
