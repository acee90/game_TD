<script lang="ts">
  import { onMount } from 'svelte';
  import { base } from '$app/paths';
  import '$lib/labs/lab.css';

  let host: HTMLDivElement;

  onMount(() => {
    let game: import('phaser').Game | undefined;
    let disposed = false;
    // Phaser는 클라이언트에서만 동적 import한다 (§3.1)
    void import('$lib/labs/map-lab').then(({ createMapLab }) => {
      if (!disposed) game = createMapLab(host);
    });
    return () => {
      disposed = true;
      game?.destroy(true);
    };
  });
</script>

<svelte:head>
  <title>맵 타일셋 검수실 — G-타워디펜스 DEV</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="lab-page">
  <main>
    <header>
      <p class="eyebrow">G-TD / MAP LAB</p>
      <h1>2층 구조 맵 적용</h1>
      <p>
        같은 지오메트리(@engine/core/map)를 2.5D 층으로 재구성했습니다.
        <b>2층 plateau</b>(십자 + 모서리) = 타워 자리, <b>1층 돌길</b>(바깥 일주) = 몬스터 길.
        plateau 남쪽 가장자리에 벽돌 옹벽 + 낙차 그림자로 높이를 줍니다.
        숫자키 <b>1·2·3·4·5</b> 또는 하단 범례 클릭으로 레이어를 껐다 켤 수 있습니다.
      </p>
    </header>
    <div class="lab-host" bind:this={host} aria-label="Cainos 타일셋을 적용한 게임 맵 프리뷰"></div>
    <nav aria-label="검수실 이동">
      <a href="{base}/dev/vfx-lab" data-sveltekit-reload>화살 VFX 비교실</a>
      <a href="{base}/game" data-sveltekit-reload>게임으로</a>
      <a href="{base}/" data-sveltekit-reload>홈</a>
    </nav>
  </main>
</div>
