<script lang="ts">
  // ───────── 프로덕션 셸 — Phaser 보드 + 기존 Svelte HUD (단일 원본 이식) ─────────
  // 레이아웃·컴포넌트·클릭 규칙·단축키는 web/src(App.svelte)의 것을 그대로 가져온다 —
  // HUD 로직 이중화 없음. 픽셀 스타일 재단장은 나중에 CSS 교체로 한다 (issue #23과 별개).
  import { onMount } from 'svelte';
  import Phaser from 'phaser';
  import { Game } from '@engine/game/game';
  import { createSeededRand } from '@engine/game/random';
  import { createBrowserRunContext, createBrowserSeed } from '@engine/logging/browser-run';
  import { IndexedDbRunStore } from '@engine/logging/indexed-db-run-store';
  import Hud from '@engine/lib/Hud.svelte';
  import ActionsColumn from '@engine/lib/ActionsColumn.svelte';
  import HeroPanel from '@engine/lib/HeroPanel.svelte';
  import MissionsPanel from '@engine/lib/MissionsPanel.svelte';
  import AugmentOverlay from '@engine/lib/AugmentOverlay.svelte';
  import AugmentPanel from '@engine/lib/AugmentPanel.svelte';
  import ClearOverlay from '@engine/lib/ClearOverlay.svelte';
  import GameOverOverlay from '@engine/lib/GameOverOverlay.svelte';
  import MenuOverlay from '@engine/lib/MenuOverlay.svelte';
  import * as hallOfFame from '@engine/ui/hall-of-fame';
  import { BattleScene } from './BattleScene';

  // 시드·런 로깅 — web과 동일 배선 (기록 다운로드·명예의 전당까지 같은 경로)
  const runSeed = createBrowserSeed();
  const runStore = new IndexedDbRunStore();
  const game = new Game(createSeededRand(runSeed), {
    context: createBrowserRunContext(runSeed),
    sink: runStore,
  });

  let tick = $state(0);
  let started = $state(false);
  let menuOpen = $state(false);

  const GAME_SPEEDS = [1, 1.25, 1.5, 2] as const;
  let gameSpeed = $state<number>(1);
  /** ?bot — 데모 모드: 봇이 판을 굴리고 캔버스 안 HUD를 띄운다. 시작 게이트도 건너뛴다 */
  const botMode = new URLSearchParams(location.search).has('bot');
  if (botMode) started = true;

  let message = $derived.by(() => {
    tick;
    return game.message;
  });

  // 게임오버 스냅샷 — game.over 순간 한 번만 (web App.svelte와 같은 패턴)
  interface GameOverData {
    title: string;
    body: string;
    records: readonly hallOfFame.Record[];
    myRank: number | null;
  }
  let gameOverData = $state<GameOverData | null>(null);
  function captureGameOver(): void {
    const mine: hallOfFame.Record = {
      score: game.score,
      round: game.round,
      kills: game.kills,
      heroLevel: game.hero.level,
      at: Date.now(),
    };
    const records = hallOfFame.submit(mine);
    gameOverData = {
      title: `${game.score.toLocaleString('ko-KR')}점`,
      body: `${game.round}라운드 · ${game.kills}킬 · 보스 Lv${game.bossCleared} · 영웅 Lv${game.hero.level}`,
      records,
      myRank: hallOfFame.rankOf(records, mine),
    };
  }

  function restart(): void {
    if (window.confirm('처음부터 다시 시작할까요?')) {
      game.finishRun('restart');
      void runStore.flush();
      location.reload();
    }
  }
  const openMenu = (): void => { menuOpen = true; };
  const closeMenu = (): void => { menuOpen = false; };

  // 단축키 — web과 동일한 키맵
  const KEYS: Record<string, () => void> = {
    p: () => game.spawnUnitAnywhere(),
    b: () => game.summonBoss(),
    r: () => game.buyProbe(),
    x: () => game.sellSelected(),
    e: () => game.buyXp(),
    '1': () => game.upgrade(0),
    '2': () => game.upgrade(1),
    '3': () => game.upgrade(2),
    '4': () => game.upgrade(3),
  };
  function onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      if (menuOpen) closeMenu();
      return;
    }
    if (menuOpen || !started) return; // 메뉴·시작 게이트 중에는 단축키를 먹지 않는다
    KEYS[event.key.toLowerCase()]?.();
  }

  let host: HTMLDivElement;

  onMount(() => {
    const scene = new BattleScene({
      game,
      speed: () => gameSpeed,
      bot: botMode,
      running: () => started && !menuOpen,
      onTick: () => {
        tick++;
        if (game.over && !gameOverData) captureGameOver();
      },
    });
    const phaser = new Phaser.Game({
      type: Phaser.AUTO,
      parent: host,
      width: 420,
      height: 470,
      pixelArt: true,
      roundPixels: true,
      backgroundColor: '#0d0a06',
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      scene: [scene],
    });

    window.addEventListener('keydown', onKeydown);
    const onPageHide = (): void => {
      game.finishRun('quit');
      void runStore.flush();
    };
    window.addEventListener('pagehide', onPageHide);

    return () => {
      window.removeEventListener('keydown', onKeydown);
      window.removeEventListener('pagehide', onPageHide);
      phaser.destroy(true);
    };
  });
</script>

<main id="wrap">
  <!-- 가운데: 게임 보드 + 상단 상태 -->
  <div class="boardcol">
    <Hud {game} {tick} />

    <div id="boardTools">
      <div id="speedTools" role="group" aria-label="게임 속도">
        {#each GAME_SPEEDS as speed (speed)}
          <button
            class="speedBtn"
            class:active={gameSpeed === speed}
            onclick={() => (gameSpeed = speed)}
          >{speed}×</button>
        {/each}
      </div>
      <button id="menuBtn" onclick={openMenu}>☰ 메뉴</button>
    </div>

    <!-- Phaser가 이 안에 캔버스를 만든다 (FIT 스케일) -->
    <div bind:this={host} id="phaserHost" aria-label="십자 일주 맵"></div>

    <p id="message">{message}</p>

    <!-- 시작 게이트 — 누르기 전에는 시간이 흐르지 않는다 (?bot이면 건너뛴다) -->
    {#if !started}
      <div id="startOverlay">
        <h1>갓 타워 디펜스</h1>
        <button id="startBtn" onclick={() => (started = true)}>게임 시작</button>
      </div>
    {/if}
  </div>

  <!-- 왼쪽 여백: 선택 정보 + 액션 버튼 -->
  <ActionsColumn {game} {tick} />

  <!-- 오른쪽 여백: 영웅 · 증강 기록 · 보상 패널 -->
  <div class="panels">
    <HeroPanel {game} {tick} />
    <AugmentPanel {game} {tick} />
    <MissionsPanel {game} {tick} />
  </div>
</main>

<AugmentOverlay {game} {tick} />
<ClearOverlay {game} {tick} />

{#if menuOpen}
  <MenuOverlay onClose={closeMenu} onRestart={restart} />
{/if}

{#if gameOverData}
  <GameOverOverlay
    title={gameOverData.title}
    body={gameOverData.body}
    records={gameOverData.records}
    myRank={gameOverData.myRank}
    onDownloadLog={() => runStore.downloadJsonl()}
    onDownloadSummary={() => runStore.downloadSummary()}
  />
{/if}

<style>
  #phaserHost {
    width: 100%;
    aspect-ratio: 420 / 470;
  }
  #phaserHost :global(canvas) {
    image-rendering: pixelated;
  }
</style>
