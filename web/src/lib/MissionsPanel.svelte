<script lang="ts">
  import type { Game } from '../game/game';
  import { missionView } from './view';

  let { game, tick }: { game: Game; tick: number } = $props();

  let v = $derived.by(() => {
    tick;
    return missionView(game);
  });
</script>

<section id="missions" aria-label="미션 현황">
  <div class="mrow">
    <span class="mlabel">{v.progressLabel}</span>
    <span class="mbar"><i style="width:{v.progressWidth}%"></i></span>
    <span class="mval">{v.progressText}</span>
  </div>

  <ul class="missionList" aria-label="미션 목록">
    {#each v.items as item}
      <li class:done={item.done}>
        <span>{item.label}</span>
        <span class="reward">{item.reward}</span>
      </li>
    {/each}
  </ul>
</section>
