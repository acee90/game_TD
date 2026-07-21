<script lang="ts">
  import { onMount } from 'svelte';
  import { TILE } from './core/map';
  import { Game } from './game/game';
  import { createSeededRand } from './game/random';
  import { createBrowserRunContext, createBrowserSeed } from './logging/browser-run';
  import { IndexedDbRunStore } from './logging/indexed-db-run-store';
  import { render } from './render/render';
  import Hud from './lib/Hud.svelte';
  import ActionsColumn from './lib/ActionsColumn.svelte';
  import HeroPanel from './lib/HeroPanel.svelte';
  import MissionsPanel from './lib/MissionsPanel.svelte';
  import AugmentOverlay from './lib/AugmentOverlay.svelte';
  import AugmentPanel from './lib/AugmentPanel.svelte';
  import ClearOverlay from './lib/ClearOverlay.svelte';
  import GameOverOverlay from './lib/GameOverOverlay.svelte';
  import MenuOverlay from './lib/MenuOverlay.svelte';
  import * as hallOfFame from './ui/hall-of-fame';

  // 게임 엔진은 plain 객체 — 반응성 프록시로 감싸지 않는다.
  // 매 프레임 tick을 올려 HUD 파생을 다시 돌린다 (엔진↔뷰 브리지).
  const runSeed = createBrowserSeed();
  const runStore = new IndexedDbRunStore();
  const game = new Game(createSeededRand(runSeed), {
    context: createBrowserRunContext(runSeed),
    sink: runStore,
  });
  let tick = $state(0);
  let started = $state(false);
  let menuOpen = $state(false);

  // 게임 속도 — 라운드 타이머·스폰·가스·전투 전부에 걸리는 dt 자체를 배속한다
  // 초반 전투 감속 없이 game.update 전체가 선택한 배율로 같이 빨라진다.
  const GAME_SPEEDS = [1, 1.25, 1.5, 2] as const;
  let gameSpeed = $state<(typeof GAME_SPEEDS)[number]>(1);

  // 게임오버 스냅샷 — game.over가 되는 순간 딱 한 번 계산한다 (기록 제출도 여기서 1회).
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

  let canvas: HTMLCanvasElement;

  // svelte-grab — Alt+클릭으로 컴포넌트 파일 위치·상태를 잡아 AI에 넘긴다 (dev 전용).
  // 동적 import라 프로덕션 번들에는 포함되지 않는다.
  let DevKit = $state<typeof import('svelte-grab').SvelteDevKit | null>(null);

  let message = $derived.by(() => {
    tick;
    return game.message;
  });

  // ── 캔버스 클릭 → 슬롯 선택 / 유닛 생성 / 영웅 이동 ──
  function onCanvasPointerDown(event: PointerEvent): void {
    const rect = canvas.getBoundingClientRect();
    const scale = canvas.width / rect.width;
    const x = (event.clientX - rect.left) * scale;
    const y = (event.clientY - rect.top) * scale;

    // 몹/보스를 찍으면 스탯을 본다 (타일보다 먼저 — 몹은 타일 위를 지나간다)
    const enemy = game.enemyAt(x, y);
    if (enemy) {
      game.selectedEnemy = enemy;
      game.selected = null;
      return;
    }
    game.selectedEnemy = null;

    const hit = game.slots.find(
      (slot) => Math.abs(slot.x - x) <= TILE / 2 && Math.abs(slot.y - y) <= TILE / 2,
    );
    if (!hit) {
      // 타일 밖을 찍으면 영웅이 그리로 걸어간다
      game.selected = null;
      game.moveHero(x, y);
      return;
    }
    if (hit === game.altarSlot) {
      game.moveHero(x, y);
      return;
    }
    if (hit.tower) game.selected = hit;
    else game.spawnUnit(hit);
  }

  function startGame(): void {
    started = true;
    last = performance.now(); // 게이트에 머문 시간이 첫 프레임 dt로 새지 않게
  }

  // 다시 시작 — 전체 리로드가 가장 확실한 리셋이다 (게임오버 '다시 도전'과 동일 경로)
  function restart(): void {
    if (window.confirm('처음부터 다시 시작할까요?')) {
      game.finishRun('restart');
      void runStore.flush();
      location.reload();
    }
  }

  const openMenu = (): void => { menuOpen = true; };
  const closeMenu = (): void => {
    menuOpen = false;
    last = performance.now(); // 메뉴에 머문 시간이 다음 프레임 dt로 새지 않게 (시작 게이트와 동일 패턴)
  };

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
    if (menuOpen) return; // 메뉴가 열려 있으면 단축키를 먹지 않는다
    KEYS[event.key.toLowerCase()]?.();
  }

  let last = performance.now();

  onMount(() => {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2d context unavailable');

    if (import.meta.env.DEV) {
      import('svelte-grab').then((m) => { DevKit = m.SvelteDevKit; });
    }

    window.addEventListener('keydown', onKeydown);
    const onPageHide = (): void => {
      game.finishRun('quit');
      void runStore.flush();
    };
    window.addEventListener('pagehide', onPageHide);

    let raf = 0;
    const frame = (now: number): void => {
      // 실제 경과시간을 먼저 캡(탭 백그라운드 복귀 등 큰 점프 방지)한 뒤 배속을 곱한다
      // — 배속은 프레임당 시뮬레이션 스텝을 키우는 것이지, 캡을 우회하지 않는다.
      const dt = Math.min((now - last) / 1000, 0.05) * gameSpeed;
      last = now;
      if (started && !menuOpen) game.update(dt);
      render(ctx, game);
      if (game.over && !gameOverData) captureGameOver();
      tick++; // HUD 반응성 트리거
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKeydown);
      window.removeEventListener('pagehide', onPageHide);
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

    <canvas
      bind:this={canvas}
      id="canvas"
      width="420"
      height="470"
      aria-label="십자 일주 맵"
      onpointerdown={onCanvasPointerDown}
    ></canvas>

    <p id="message">{message}</p>

    <!-- 시작 게이트 — 누르기 전에는 시간이 흐르지 않는다. 보드만 덮는다 -->
    {#if !started}
      <div id="startOverlay">
        <h1>G-타워디펜스</h1>
        <button id="startBtn" onclick={startGame}>게임 시작</button>
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

<!-- dev 전용 — Alt+클릭으로 요소 컨텍스트를 AI에 넘긴다 -->
{#if DevKit}
  <DevKit />
{/if}
