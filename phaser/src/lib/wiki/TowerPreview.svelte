<script lang="ts">
  // 타워 프리뷰 — Phaser 미니 캔버스의 생성·일시정지·정리 (§3.3 TowerPreview).
  // Phaser는 onMount 안에서만 동적 import한다. 탭 백그라운드·뷰포트 밖·
  // reduced-motion이면 멈춘다 (§5).
  import { onMount } from 'svelte';
  import type { TowerWikiView } from './tower-wiki';
  import type { PreviewMotion, TowerPreviewScene } from '../../scenes/TowerPreviewScene';

  const MOTIONS: readonly { id: PreviewMotion; label: string }[] = [
    { id: 'idle', label: '대기' },
    { id: 'attack1', label: '공격 1' },
    { id: 'attack2', label: '공격 2' },
  ];

  let { view }: { view: TowerWikiView } = $props();

  let host: HTMLDivElement;
  let phaserGame: import('phaser').Game | null = null;
  let scene = $state<TowerPreviewScene | null>(null);
  let started = $state(false);
  let reducedMotion = $state(false);
  let userPaused = $state(false);
  let speed = $state(1);
  let motion = $state<PreviewMotion>('attack1');
  /** 가시성·탭 상태에 따른 자동 정지 — 사용자 일시정지와 별개로 합산 */
  let autoPaused = false;

  function applyPause(): void {
    scene?.setPaused(userPaused || autoPaused);
  }

  async function start(): Promise<void> {
    if (started) return;
    started = true;
    const { createTowerPreview } = await import('../../scenes/TowerPreviewScene');
    if (!host || !host.isConnected) return;
    const created = createTowerPreview(host, {
      race: view.race,
      tags: view.tags,
      tier: view.tier,
      attackInterval: view.attackInterval,
      splashRadius: view.splashRadius,
      characterAsset: view.characterAsset,
    });
    phaserGame = created.game;
    scene = created.scene;
    scene.setSpeed(speed);
    scene.setMotion(motion);
    applyPause();
  }

  onMount(() => {
    reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // reduced-motion에서는 자동 재생하지 않는다 — 사용자가 재생을 눌러야 시작 (§5)
    if (!reducedMotion) void start();

    const observer = new IntersectionObserver(([entry]) => {
      autoPaused = !entry.isIntersecting || document.hidden;
      applyPause();
    });
    observer.observe(host);
    const onVisibility = (): void => {
      autoPaused = document.hidden;
      applyPause();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      phaserGame?.destroy(true);
      phaserGame = null;
      scene = null;
    };
  });

  function togglePause(): void {
    userPaused = !userPaused;
    applyPause();
  }

  function setSpeed(mult: number): void {
    speed = mult;
    scene?.setSpeed(mult);
  }

  function replay(): void {
    userPaused = false;
    if (!started) {
      void start();
      return;
    }
    scene?.replay();
  }

  function changeMotion(next: PreviewMotion): void {
    motion = next;
    scene?.setMotion(next);
  }
</script>

<div class="preview">
  {#if view.characterAsset}
    <div class="direction-controls" role="group" aria-label="캐릭터 동작 선택">
      <span>동작</span>
      {#each MOTIONS as item}
        <button class:active={motion === item.id} onclick={() => changeMotion(item.id)}>{item.label}</button>
      {/each}
    </div>
  {/if}
  <div class="preview-canvas" bind:this={host} role="img" aria-label="{view.name}의 투사체 비행과 착탄 반복 재생">
    {#if !started}
      <button class="preview-start" onclick={() => void start()}>▶ 프리뷰 재생</button>
    {/if}
  </div>
  <div class="preview-controls" role="group" aria-label="프리뷰 조작">
    <button onclick={replay}>다시 보기</button>
    <button onclick={togglePause} disabled={!started}>{userPaused ? '재생' : '일시정지'}</button>
    <span class="speed">
      <button class:active={speed === 0.5} onclick={() => setSpeed(0.5)}>0.5×</button>
      <button class:active={speed === 1} onclick={() => setSpeed(1)}>1×</button>
    </span>
  </div>
</div>

<style>
  .preview-canvas {
    position: relative;
    aspect-ratio: 16 / 9;
    border: 1px solid var(--line, #4d3d28);
    border-radius: 10px;
    overflow: hidden;
    background: #0d0a06;
    display: grid;
    place-items: center;
  }

  .preview-canvas :global(canvas) {
    display: block;
    width: 100%;
    height: 100%;
    image-rendering: pixelated;
  }

  .preview-start {
    position: absolute;
    inset: 0;
    background: rgba(13, 10, 6, 0.7);
    color: #ece2cb;
    border: 0;
    font-size: 15px;
    cursor: pointer;
  }

  .preview-controls {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 10px;
  }

  .direction-controls {
    display: flex;
    align-items: center;
    gap: 5px;
    margin-bottom: 8px;
    color: var(--dim, #9d8c6f);
    font-size: 12px;
  }

  .direction-controls button {
    min-width: 30px;
    padding: 4px 7px;
    border-radius: 5px;
    border: 1px solid var(--line2, #6b5638);
    background: var(--panel, #241d14);
    color: var(--text, #ece2cb);
    cursor: pointer;
  }

  .direction-controls button.active {
    background: var(--gold, #e3b23e);
    color: #1c1508;
    font-weight: 700;
  }

  .preview-controls button {
    padding: 6px 12px;
    border-radius: 6px;
    border: 1px solid var(--line2, #6b5638);
    background: var(--panel, #241d14);
    color: var(--text, #ece2cb);
    font-size: 12.5px;
    cursor: pointer;
  }

  .preview-controls button:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .preview-controls button.active {
    background: var(--gold, #e3b23e);
    color: #1c1508;
    font-weight: 700;
  }

  .speed {
    margin-left: auto;
    display: inline-flex;
    gap: 4px;
  }
</style>
