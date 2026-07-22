<script lang="ts">
  import { onMount } from 'svelte';
  import { base } from '$app/paths';
  import '$lib/labs/lab.css';

  let host: HTMLDivElement;

  onMount(() => {
    let game: import('phaser').Game | undefined;
    let disposed = false;
    // Phaser는 클라이언트에서만 동적 import한다 (§3.1)
    void import('$lib/labs/vfx-lab').then(({ createVfxLab }) => {
      if (!disposed) game = createVfxLab(host);
    });
    return () => {
      disposed = true;
      game?.destroy(true);
    };
  });
</script>

<svelte:head>
  <title>화살 VFX 비교실 — G-타워디펜스 DEV</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="lab-page">
  <main>
    <header>
      <p class="eyebrow">G-TD / EFFECT LAB</p>
      <h1>화살 궤적 비교</h1>
      <p>실제 게임과 같은 크기와 곡사 속도입니다. 마음에 드는 버전의 알파벳을 고르세요.</p>
    </header>
    <div class="lab-host" bind:this={host} aria-label="화살 투사체 여섯 가지 비교 애니메이션"></div>
    <nav aria-label="VFX 검수실 이동">
      <a href="{base}/dev/projectile-vfx-lab" data-sveltekit-reload>투사체 에셋 검수실</a>
      <a href="{base}/" data-sveltekit-reload>게임으로 돌아가기</a>
    </nav>
  </main>
</div>
