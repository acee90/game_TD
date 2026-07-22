<script lang="ts">
  import type { Game } from '@engine/game/game';
  import * as S from '@engine/data/score';

  let { game, tick }: { game: Game; tick: number } = $props();

  // tick을 읽어 매 프레임 재파생 — 게임 상태는 plain 객체라 tick이 반응성 트리거다
  let v = $derived.by(() => {
    tick;
    const nextRound = Math.max(1, game.round);
    return {
      round: `R${nextRound}`,
      timer: `${Math.ceil(game.roundTimer)}s`,
      mineral: String(Math.floor(game.mineral)),
      gas: String(Math.floor(game.gas)),
      lives: String(game.lives),
      kills: String(game.kills),
      score: game.score.toLocaleString('ko-KR'),
      scoreNext: `R${nextRound} 클리어 +${S.roundScore(nextRound).toLocaleString('ko-KR')}`,
    };
  });
</script>

<section id="hud" aria-label="상태">
  <div>라운드<b id="round">{v.round}</b></div>
  <div>다음<b id="timer">{v.timer}</b></div>
  <div class="m">금화<b id="mineral">{v.mineral}</b></div>
  <div class="g">마정석<b id="gas">{v.gas}</b></div>
  <div class="l">라이프<b id="lives">{v.lives}</b></div>
  <div>누적 킬<b id="kills">{v.kills}</b></div>
</section>
<section id="scorebar" aria-label="점수">
  <span class="dim">점수</span><b id="score">{v.score}</b>
  <span class="dim" id="scoreNext">{v.scoreNext}</span>
</section>
