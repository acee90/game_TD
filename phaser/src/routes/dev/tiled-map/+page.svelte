<script lang="ts">
  import { onMount } from 'svelte';
  import { base } from '$app/paths';
  import '$lib/labs/lab.css';

  let host: HTMLDivElement;
  let layerNames = $state<string[]>([]);
  let hidden = $state<Set<number>>(new Set());
  let overlayOn = $state(false);
  let lab: import('$lib/labs/tiled-map-lab').TiledMapLab | undefined;

  onMount(() => {
    let disposed = false;
    // Phaser는 클라이언트에서만 동적 import한다 (§3.1)
    void import('$lib/labs/tiled-map-lab').then(({ createTiledMapLab }) => {
      if (disposed) return;
      lab = createTiledMapLab(host, (names) => {
        layerNames = names;
      });
      lab.setOverlayVisible(overlayOn);
    });
    return () => {
      disposed = true;
      lab?.game.destroy(true);
    };
  });

  function toggleLayer(i: number) {
    const next = new Set(hidden);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    hidden = next;
    lab?.setLayerVisible(i, !next.has(i));
  }

  function toggleOverlay() {
    overlayOn = !overlayOn;
    lab?.setOverlayVisible(overlayOn);
  }
</script>

<svelte:head>
  <title>Tiled 맵 검수실 — G-타워디펜스 DEV</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="lab-page">
  <main>
    <header>
      <p class="eyebrow">G-TD / TILED MAP</p>
      <h1>gtd-map.tmx 로드</h1>
      <p>
        Tiled로 직접 그린 <code>resources/map/gtd-map.tmx</code>를 Phaser 타일맵으로 그대로 읽어
        띄웁니다. 절차적 생성(<b>map-lab</b>)과 달리 여기서는 <b>찍은 타일이 곧 화면</b>입니다.
        <b>겹쳐보기</b>를 켜면 엔진 지오메트리(십자·경로·슬롯·문)를 맵 좌표로 변환해 겹쳐
        그립니다 — 타일 아트와 게임 로직이 맞는지 확인하는 용도입니다.
        맵을 수정한 뒤엔 <code>python3 tools/map/tmx-to-phaser.py</code>로 다시 구우세요.
      </p>
    </header>

    <div class="toggles">
      <button class="toggle" class:on={overlayOn} onclick={toggleOverlay}>
        겹쳐보기 (O)
      </button>
      {#each layerNames as name, i}
        <button class="toggle" class:on={!hidden.has(i)} onclick={() => toggleLayer(i)}>
          {i + 1}. {name}
        </button>
      {/each}
    </div>

    <div class="lab-host" bind:this={host} aria-label="Tiled로 그린 gtd-map 타일맵 프리뷰"></div>

    <nav aria-label="검수실 이동">
      <a href="{base}/dev/map-lab" data-sveltekit-reload>절차적 맵 검수실</a>
      <a href="{base}/game" data-sveltekit-reload>게임으로</a>
      <a href="{base}/" data-sveltekit-reload>홈</a>
    </nav>
  </main>
</div>

<style>
  .toggles {
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
    margin-bottom: 12px;
  }

  .toggle {
    border: 1px solid rgba(220, 181, 105, 0.28);
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.03);
    color: #7d7466;
    cursor: pointer;
    font: 13px 'Gowun Dodum', sans-serif;
    padding: 5px 13px;
    transition: color 0.12s, border-color 0.12s, background 0.12s;
  }

  .toggle:hover {
    border-color: rgba(220, 181, 105, 0.5);
  }

  .toggle.on {
    background: rgba(200, 159, 85, 0.14);
    border-color: rgba(220, 181, 105, 0.65);
    color: #f0d392;
  }

  code {
    color: #c89f55;
    font-size: 0.92em;
  }
</style>
