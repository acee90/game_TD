<script lang="ts">
  import type { Game } from '../game/game';
  import * as HD from '../data/hero';
  import { augmentCardsHtml, heroAugsHtml } from './view';

  let { game, tick }: { game: Game; tick: number } = $props();

  // 보유 증강 접기/펼치기 (2026-07-18, 사용자 지시) — 선택 화면에서도 지금까지 고른 증강을 볼 수 있게.
  let showCurrent = $state(false);

  // F1 — 증강 오클릭 방지: 새 선택 화면마다 1초 입력 잠금.
  // XP 연타 중 카드가 포인터 밑에 나타나 같은 클릭 흐름에 눌리는 사고를 막는다.
  // 리롤(rerollsUsed 증가)로 바뀐 선택지는 의도된 클릭이라 잠그지 않는다.
  const AUGMENT_LOCK_MS = 1000;
  let lockUntil = $state(0);
  let lastChoices: unknown = null;
  let lastRerolls = 0;

  // 선택지 교체 감지 — plain 배열이라 tick으로 관찰한다
  $effect(() => {
    tick;
    const choices = game.augmentChoices;
    if (choices !== lastChoices) {
      const byReroll = game.rerollsUsed > lastRerolls;
      if (!byReroll && choices.length > 0) lockUntil = performance.now() + AUGMENT_LOCK_MS;
      lastChoices = choices;
    }
    lastRerolls = game.rerollsUsed;
  });

  let v = $derived.by(() => {
    tick;
    const open = game.augmentChoices.length > 0;
    const locked = performance.now() < lockUntil;
    const left = HD.AUGMENT_REROLL_MAX - game.rerollsUsed;
    return {
      open,
      locked,
      sub: `영웅 Lv${game.hero.level} — 하나를 고르세요`,
      cards: open ? augmentCardsHtml(game, locked) : '',
      rerollText: left > 0 ? `무료 리롤 · ${left}회 남음` : '리롤 소진',
      rerollDisabled: !game.canReroll || locked,
      augCount: game.hero.augments.length,
      currentAugs: heroAugsHtml(game),
    };
  });

  function onCardsClick(event: MouseEvent): void {
    if (v.locked) return; // F1 — pointer-events만 믿지 않고 재검사
    const card = (event.target as HTMLElement).closest<HTMLElement>('.augcard');
    if (card?.dataset.index) game.chooseAugment(Number(card.dataset.index));
  }

  function onReroll(): void {
    if (v.locked) return; // 등장 직후 1초 오클릭 방지
    game.rerollAugments();
  }
</script>

{#if v.open}
  <div id="augOverlay">
    <h2>증강 선택</h2>
    <p class="sub" id="augSub">{v.sub}</p>
    {#if v.augCount > 0}
      <button class="augCurrentToggle" onclick={() => (showCurrent = !showCurrent)}>
        {showCurrent ? '▾' : '▸'} 보유 증강 ({v.augCount})
      </button>
      {#if showCurrent}
        <div class="haugs augCurrentList">{@html v.currentAugs}</div>
      {/if}
    {/if}
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
    <div class="augcards" id="augCards" role="group" onclick={onCardsClick}>{@html v.cards}</div>
    <button id="reroll" disabled={v.rerollDisabled} onclick={onReroll}>{v.rerollText}</button>
  </div>
{/if}
