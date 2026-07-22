<script lang="ts">
  import type { Game } from '@engine/game/game';
  import { CLEAR_ROUND } from '@engine/data/balance';

  // R60 클리어 오버레이 (2026-07-19) — clearPending 동안 게임이 멈춘다.
  // 게임오버와 달리 런은 계속된다: 버튼 하나로 무한 모드에 들어간다.
  let { game, tick }: { game: Game; tick: number } = $props();

  let visible = $derived.by(() => {
    tick;
    return game.clearPending;
  });
</script>

{#if visible}
  <div id="overlay">
    <h1 id="overlayTitle">R{CLEAR_ROUND} 클리어!</h1>
    <p id="overlayBody" class="dim">
      라이프 {game.lives} · 점수 {game.score.toLocaleString()}<br />
      여기서부터는 무한 모드 — 웨이브는 계속 거세지고, 명예의 전당 점수 경쟁만 남습니다.
    </p>
    <button onclick={() => game.continueAfterClear()}>무한 모드 계속</button>
  </div>
{/if}
