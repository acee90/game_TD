<script lang="ts">
  import { onMount } from 'svelte';
  import { base } from '$app/paths';
  import '$lib/labs/lab.css';

  let host: HTMLDivElement;

  onMount(() => {
    let game: import('phaser').Game | undefined;
    let disposed = false;
    // Phaser는 클라이언트에서만 동적 import한다 (§3.1)
    void import('$lib/labs/projectile-vfx-lab').then(({ createProjectileVfxLab }) => {
      if (!disposed) game = createProjectileVfxLab(host);
    });
    return () => {
      disposed = true;
      game?.destroy(true);
    };
  });
</script>

<svelte:head>
  <title>투사체 VFX 에셋 검수실 — G-타워디펜스 DEV</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="lab-page">
  <main>
    <header>
      <p class="eyebrow">G-TD / ASSET REVIEW LAB</p>
      <h1>포병 폭발 후보 검수</h1>
      <p>프리뷰 전용 후보입니다. 사용자 승인 전에는 전투 씬에 연결하지 않습니다.</p>
    </header>
    <div class="lab-host" bind:this={host} aria-label="포병 폭발 후보의 프레임, 배경, 재생 속도 및 중심축 비교"></div>
    <nav aria-label="VFX 검수실 이동">
      <a href="{base}/dev/vfx-lab" data-sveltekit-reload>화살 궤적 비교</a>
      <a href="{base}/" data-sveltekit-reload>게임으로 돌아가기</a>
    </nav>
  </main>
</div>
