<script lang="ts">
  import type { Game } from '../game/game';
  import { missionView, bossRewardHtml } from './view';

  let { game, tick }: { game: Game; tick: number } = $props();

  let v = $derived.by(() => {
    tick;
    return { ...missionView(game), bossReward: bossRewardHtml(game) };
  });
</script>

<section id="missions" aria-label="보상 현황">
  <div class="mrow">
    <span class="mlabel">웨이브 보상</span>
    <span class="mbar"><i id="repeatBar" style="width:{v.repeatWidth}%"></i></span>
    <span class="mval" id="repeatVal">{v.repeatText}</span>
  </div>
  <div class="mrow">
    <span class="mlabel">마일스톤</span>
    <span class="mbar"><i id="milestoneBar" style="width:{v.milestoneWidth}%"></i></span>
    <span class="mval" id="milestoneVal">{v.milestoneText}</span>
  </div>
  <div class="mrow">
    <span class="mlabel">보스 처치</span>
    <span class="mnote" id="bossReward">{@html v.bossReward}</span>
  </div>
  <div class="mrow">
    <span class="mlabel">몹 돌파</span>
    <span class="mnote">라이프 -1 · 금화 +5</span>
  </div>
</section>
