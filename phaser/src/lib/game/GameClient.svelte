<script lang="ts">
  // ───────── 프로덕션 셸 — Phaser 보드 + Svelte HUD ─────────
  // 레이아웃·컴포넌트·클릭 규칙·단축키는 은퇴한 웹 프로토(App.svelte)에서 이어받았다 —
  // HUD는 프로덕션 앱인 phaser/가 소유하고, 게임 규칙은 @engine에서 가져온다.
  import { onMount } from 'svelte';
  import Phaser from 'phaser';
  import './game.css';
  import { Game } from '@engine/game/game';
  import { createSeededRand } from '@engine/game/random';
  import { createBrowserRunContext, createBrowserSeed } from '@engine/logging/browser-run';
  import { IndexedDbRunStore } from '@engine/logging/indexed-db-run-store';
  import Hud from './Hud.svelte';
  import ActionsColumn from './ActionsColumn.svelte';
  import HeroPanel from './HeroPanel.svelte';
  import MissionsPanel from './MissionsPanel.svelte';
  import AugmentOverlay from './AugmentOverlay.svelte';
  import AugmentPanel from './AugmentPanel.svelte';
  import ClearOverlay from './ClearOverlay.svelte';
  import GameOverOverlay from './GameOverOverlay.svelte';
  import MenuOverlay from './MenuOverlay.svelte';
  import * as hallOfFame from './hall-of-fame';
  import { displayName, setDisplayName, syncPendingRuns, uploadRun } from './run-upload';
  import { BattleScene } from '../../BattleScene';

  // 시드·런 로깅 — web과 동일 배선 (기록 다운로드·명예의 전당까지 같은 경로)
  const runSeed = createBrowserSeed();
  const runStore = new IndexedDbRunStore();
  const runContext = createBrowserRunContext(runSeed);
  const game = new Game(createSeededRand(runSeed), {
    context: runContext,
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
  /** 서버 업로드 진행 표시 — 실패해도 게임오버 화면을 막지 않는다 */
  let uploadStatus = $state<'idle' | 'sending' | 'done' | 'failed'>('idle');
  let playerName = $state(displayName() ?? '');

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
    // 정상 종료 판이므로 지금 올린다 — 문서가 살아 있는 유일하게 안전한 시점이다.
    // 실패해도 상태만 남기고 넘어간다(다음 방문에 재시도).
    void sendRun();
  }

  async function sendRun(): Promise<void> {
    uploadStatus = 'sending';
    // run_finished가 IndexedDB에 실제로 들어간 뒤에 읽어야 완전한 로그가 올라간다
    await runStore.flush();
    const result = await uploadRun(runContext.runId, playerName.trim() || null);
    uploadStatus = result.ok ? 'done' : 'failed';
  }

  function saveNameAndResend(): void {
    setDisplayName(playerName);
    void sendRun();
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
    // 지난 방문에서 못 올린 판(중단·오프라인)을 여기서 올린다 — 이탈 시점 쓰기는
    // 유실되므로 이게 유일하게 신뢰할 수 있는 동기화 지점이다.
    // 진행 중인 이 판은 제외하고, 실패해도 게임 시작을 막지 않는다.
    void syncPendingRuns(runContext.runId);

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
      // 도트 고도화 — 캔버스 2배 해상도, BattleScene이 카메라 zoom 2로 본다.
      // 월드 좌표계는 여전히 420×470 (엔진·클릭 규칙 무영향).
      width: 840,
      height: 940,
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
      // SPA 언마운트로 나가는 경로에서도 런을 마감한다 — 전체 로드로 나가면
      // pagehide가 먼저 처리하고, 이 정리는 실행되지 않는다.
      game.finishRun('quit');
      void runStore.flush();
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
        <h1>G-타워디펜스</h1>
        <p class="startGoal">타워와 영웅으로 몬스터가 출구에 닿기 전에 막아내세요.</p>
        <ol class="startGuide" aria-label="게임 방법">
          <li>
            <b>타워를 배치하세요</b>
            <span>빈 타일을 누르거나 <kbd>P</kbd>로 랜덤 타워를 생성합니다.</span>
          </li>
          <li>
            <b>같은 타워를 모으세요</b>
            <span>같은 이름 2기는 자동 합성됩니다. 마정석으로 병과도 강화하세요.</span>
          </li>
          <li>
            <b>영웅과 보스를 활용하세요</b>
            <span>빈 곳을 눌러 영웅을 이동하고, 준비되면 보스를 소환해 보상을 얻으세요.</span>
          </li>
        </ol>
        <p class="startTip"><b>라이프가 0이 되면 패배</b> · 스킬은 자동으로 시전됩니다.</p>
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
    bind:playerName
    {uploadStatus}
    onSaveName={saveNameAndResend}
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
