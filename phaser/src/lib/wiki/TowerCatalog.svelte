<script lang="ts">
  // 타워 카탈로그 — 병과·티어 필터와 상세 링크 (§3.3 TowerCatalog)
  import { browser } from '$app/environment';
  import { base } from '$app/paths';
  import { page } from '$app/state';
  import { RACES, TIER_LABEL } from '@engine/data/units';
  import type { TowerWikiView } from '@engine/lib/tower-wiki';

  let { towers }: { towers: readonly TowerWikiView[] } = $props();

  // 상세의 "같은 병과 목록" 링크가 ?race=N으로 들어온다 (프리렌더 HTML은 전체 → 하이드레이션 후 적용)
  const raceParam = browser ? page.url.searchParams.get('race') : null;
  const initialRace = raceParam === null ? NaN : Number(raceParam);
  let raceFilter = $state<number | null>(
    Number.isInteger(initialRace) && initialRace >= 0 && initialRace <= 3 ? initialRace : null,
  );
  let tierFilter = $state<number | null>(null);

  const tiers = TIER_LABEL.map((label, tier) => ({ tier, label }));

  let filtered = $derived(
    towers.filter(
      (t) =>
        (raceFilter === null || t.race === raceFilter) &&
        (tierFilter === null || t.tier === tierFilter),
    ),
  );
</script>

<div class="filters" role="group" aria-label="병과 필터">
  <button class:active={raceFilter === null} onclick={() => (raceFilter = null)}>전체</button>
  {#each RACES as race, index (race)}
    <button class:active={raceFilter === index} onclick={() => (raceFilter = index)}>{race}</button>
  {/each}
</div>
<div class="filters" role="group" aria-label="티어 필터">
  <button class:active={tierFilter === null} onclick={() => (tierFilter = null)}>전체</button>
  {#each tiers as { tier, label } (tier)}
    <button class:active={tierFilter === tier} onclick={() => (tierFilter = tier)}>{label}</button>
  {/each}
</div>

<p class="count" aria-live="polite">{filtered.length}종</p>

<ul class="cards">
  {#each filtered as tower (tower.id)}
    <li>
      <a href="{base}/wiki/towers/{tower.id}">
        <span class="card-head">
          <b style="color: {tower.raceColor}">{tower.name}</b>
          <span class="tier">{tower.tierLabel}</span>
        </span>
        <span class="card-tags">{tower.raceLabel} · 【 {tower.tagText} 】</span>
        <span class="card-stats">
          공격력 {tower.text.damage} · 공속 {tower.text.attacksPerSecond}/초 · 사거리 {tower.text.range}
        </span>
      </a>
    </li>
  {/each}
</ul>
{#if filtered.length === 0}
  <p class="empty">이 조건에 맞는 타워가 없습니다.</p>
{/if}

<style>
  .filters {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 12px;
  }

  .filters button {
    padding: 6px 13px;
    border-radius: 999px;
    border: 1px solid var(--line2, #6b5638);
    background: transparent;
    color: var(--dim, #9d8c6f);
    font-size: 13px;
    cursor: pointer;
  }

  .filters button:hover {
    color: var(--text, #ece2cb);
  }

  .filters button.active {
    background: var(--gold, #e3b23e);
    border-color: var(--gold, #e3b23e);
    color: #1c1508;
    font-weight: 700;
  }

  .count {
    margin: 14px 0 0;
    font-size: 12px;
    color: var(--dim, #9d8c6f);
  }

  .cards {
    list-style: none;
    padding: 0;
    margin: 10px 0 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
    gap: 12px;
  }

  .cards a {
    display: grid;
    gap: 7px;
    padding: 14px 16px;
    background: var(--panel, #241d14);
    border: 1px solid var(--line, #4d3d28);
    border-radius: 10px;
    text-decoration: none;
    color: inherit;
  }

  .cards a:hover {
    border-color: var(--line2, #6b5638);
    background: var(--panel2, #31271a);
  }

  .card-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
  }

  .card-head b {
    font-size: 15px;
  }

  .tier {
    font-size: 11px;
    color: var(--gold, #e3b23e);
    border: 1px solid var(--line2, #6b5638);
    border-radius: 4px;
    padding: 1px 6px;
    white-space: nowrap;
  }

  .card-tags {
    font-size: 12px;
    color: var(--dim, #9d8c6f);
  }

  .card-stats {
    font-size: 12px;
    color: var(--dim, #9d8c6f);
    font-variant-numeric: tabular-nums;
  }

  .empty {
    margin-top: 20px;
    color: var(--dim, #9d8c6f);
    font-size: 14px;
  }
</style>
