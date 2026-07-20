<script lang="ts">
  import type { Game } from '../game/game';
  import * as HD from '../data/hero';
  import { augmentCardsHtml, heroAugsHtml, skillChoiceCardsHtml } from './view';

  let { game, tick }: { game: Game; tick: number } = $props();

  // 보유 증강 접기/펼치기 (2026-07-18, 사용자 지시) — 선택 화면에서도 지금까지 고른 증강을 볼 수 있게.
  let showCurrent = $state(false);

  // F1 — 증강 오클릭 방지: 새 선택 화면마다 1초 입력 잠금.
  // XP 연타 중 카드가 포인터 밑에 나타나 같은 클릭 흐름에 눌리는 사고를 막는다.
  // 카드별 리롤(rerollsUsed 증가)로 바뀐 선택지는 의도된 클릭이라 잠그지 않는다.
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
    const skillDraft = game.skillChoices.length > 0;
    const open = game.augmentChoices.length > 0 || skillDraft;
    const locked = performance.now() < lockUntil;
    return {
      open,
      locked,
      skillDraft,
      title: skillDraft ? '스킬 선택' : '증강 선택',
      sub: skillDraft
        ? `영웅 Lv${game.hero.level} — 첫 스킬을 고르세요 · 카드마다 ${HD.SKILL_DRAFT_CARD_REROLLS}번 다시 뽑을 수 있습니다`
        : `영웅 Lv${game.hero.level} — 하나를 고르세요 · 카드마다 ${HD.AUGMENT_CARD_REROLLS}번 다시 뽑을 수 있습니다`,
      cards: skillDraft
        ? skillChoiceCardsHtml(game, locked)
        : open
          ? augmentCardsHtml(game, locked)
          : '',
      augCount: game.hero.augments.length,
      currentAugs: heroAugsHtml(game),
    };
  });

  function onCardsClick(event: MouseEvent): void {
    if (v.locked) return; // F1 — pointer-events만 믿지 않고 재검사
    // 카드별 리롤 배지가 먼저다 — 카드 안에 있으므로 선택보다 앞서 가려낸다
    const rerollBadge = (event.target as HTMLElement).closest<HTMLElement>('.cardReroll');
    if (rerollBadge?.dataset.reroll) {
      const index = Number(rerollBadge.dataset.reroll);
      if (v.skillDraft) game.rerollSkillChoice(index);
      else game.rerollAugmentChoice(index);
      return;
    }
    const card = (event.target as HTMLElement).closest<HTMLElement>('.augcard');
    if (!card?.dataset.index) return;
    const index = Number(card.dataset.index);
    if (v.skillDraft) game.chooseSkill(index);
    else game.chooseAugment(index);
  }
</script>

{#if v.open}
  <div id="augOverlay">
    <h2>{v.title}</h2>
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
  </div>
{/if}
