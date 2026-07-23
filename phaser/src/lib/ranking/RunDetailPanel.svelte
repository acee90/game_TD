<script lang="ts">
  // 랭킹 상세 — 그 판의 빌드를 차트로 시각화한다.
  // 병과 분포(도넛)·티어 분포·골드 사용처(막대) + 선택 기록 타임라인.
  // 빌드 구성은 summary에 이미 들어 있어 이벤트를 훑을 필요가 없다 (계획 §3.1).
  import { RACES, RACE_COLOR, TIER_LABEL } from '@engine/data/units';
  import type { DetailEvent, RunDetail } from './ranking-api';
  import DonutChart, { type Slice } from './DonutChart.svelte';
  import BarChart, { type Bar } from './BarChart.svelte';

  let { detail }: { detail: RunDetail } = $props();

  const TYPE_LABEL: Record<string, string> = {
    tower_spawned: '타워 생성',
    tower_merged: '합성',
    tower_sold: '판매',
    augment_chosen: '증강 선택',
    augment_upgraded: '증강 강화',
    hero_xp_bought: '경험치 구매',
    probe_bought: '광부 고용',
    race_upgraded: '병과 강화',
    god_rerolled: 'GOD 리롤',
    skill_rerolled: '스킬 리롤',
    boss_summoned: '보스 소환',
    boss_killed: '보스 처치',
  };

  const num = (v: unknown): number | null => (typeof v === 'number' ? v : null);

  const towers = $derived(detail.summary?.towers ?? []);

  /** 병과 분포 — 도넛 (units.ts RACE_COLOR로 색 통일) */
  let raceSlices = $derived.by<Slice[]>(() =>
    RACES.map((label, race) => ({
      label,
      color: RACE_COLOR[race],
      value: towers.filter((t) => t.tower.race === race).reduce((n, t) => n + t.count, 0),
    })),
  );

  /** 티어 분포 — 막대 (Lv1→GOD, 금색이 진해지게) */
  const TIER_TINT = ['#7b6a4a', '#9a834f', '#c19a3e', '#e3b23e', '#f0d27a'];
  let tierBars = $derived.by<Bar[]>(() =>
    TIER_LABEL.map((label, tier) => ({
      label,
      color: TIER_TINT[tier],
      value: towers.filter((t) => t.tower.tier === tier).reduce((n, t) => n + t.count, 0),
    })).filter((b) => b.value > 0),
  );

  /** 골드 사용처 — 막대. cost가 있는 이벤트를 종류별로 합친다 */
  let goldBars = $derived.by<Bar[]>(() => {
    const totals = new Map<string, { gold: number; count: number }>();
    for (const event of detail.events) {
      const cost = num((event.data as Record<string, unknown>).cost);
      if (cost === null || cost <= 0) continue;
      const prev = totals.get(event.type) ?? { gold: 0, count: 0 };
      totals.set(event.type, { gold: prev.gold + cost, count: prev.count + 1 });
    }
    return [...totals.entries()]
      .map(([type, v]) => ({ label: TYPE_LABEL[type] ?? type, value: v.gold, note: `${v.count}회` }))
      .sort((a, b) => b.value - a.value);
  });

  const totalTowers = $derived(towers.reduce((n, t) => n + t.count, 0));
  const summary = $derived(detail.summary);

  /** 이벤트 한 줄 요약 */
  function describe(event: DetailEvent): string {
    const d = event.data as Record<string, unknown>;
    const tower = d.tower as { name?: string } | undefined;
    const produced = d.produced as { name?: string } | undefined;
    const augment = d.augment as { name?: string; rarity?: string } | undefined;
    switch (event.type) {
      case 'tower_spawned':
        return `${tower?.name ?? '?'} (슬롯 ${num(d.slotIndex) ?? '?'})`;
      case 'tower_merged':
        return `→ ${produced?.name ?? '?'}`;
      case 'tower_sold':
        return `${tower?.name ?? '?'} 판매`;
      case 'augment_chosen':
        return `${augment?.name ?? '?'} (${augment?.rarity ?? '?'})`;
      case 'augment_upgraded':
        return `${augment?.name ?? '?'} → ${String(d.toRarity ?? '?')}`;
      case 'race_upgraded':
        return `${String(d.raceName ?? '?')} Lv${num(d.toLevel) ?? '?'}`;
      case 'boss_summoned':
      case 'boss_killed':
        return `Lv${num(d.level) ?? '?'}`;
      default:
        return '';
    }
  }

  const gold = (v: number): string => v.toLocaleString('ko-KR');
  const time = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  };
</script>

<div class="detail">
  <!-- 요약 수치 — daisyUI stats -->
  <div class="stats stats-horizontal bg-base-200 border border-base-300 w-full overflow-x-auto">
    <div class="stat">
      <div class="stat-title">점수</div>
      <div class="stat-value text-primary text-2xl">{detail.score.toLocaleString('ko-KR')}</div>
    </div>
    <div class="stat">
      <div class="stat-title">라운드</div>
      <div class="stat-value text-2xl">R{detail.round}</div>
    </div>
    {#if summary?.kills != null}
      <div class="stat">
        <div class="stat-title">처치</div>
        <div class="stat-value text-2xl">{summary.kills.toLocaleString('ko-KR')}</div>
      </div>
    {/if}
    {#if summary?.heroLevel != null}
      <div class="stat">
        <div class="stat-title">영웅</div>
        <div class="stat-value text-2xl">Lv{summary.heroLevel}</div>
      </div>
    {/if}
    {#if summary?.elapsedSeconds != null}
      <div class="stat">
        <div class="stat-title">소요</div>
        <div class="stat-value text-2xl">{time(summary.elapsedSeconds)}</div>
      </div>
    {/if}
  </div>

  <!-- 빌드 시각화 -->
  {#if totalTowers > 0}
    <div class="charts">
      <section class="chart-card">
        <h3>병과 구성 <span class="dim">({totalTowers}기)</span></h3>
        <DonutChart slices={raceSlices} />
      </section>
      <section class="chart-card">
        <h3>티어 분포</h3>
        <BarChart bars={tierBars} />
      </section>
    </div>
  {/if}

  {#if goldBars.length > 0}
    <section class="chart-card">
      <h3>골드 사용처</h3>
      <BarChart bars={goldBars} format={gold} />
    </section>
  {/if}

  {#if summary?.augments && summary.augments.length > 0}
    <section>
      <h3>증강 선택</h3>
      <div class="chips">
        {#each summary.augments as entry, i (i)}
          <span class="badge badge-outline">{entry.augment.name} <span class="dim">R{entry.round}</span></span>
        {/each}
      </div>
    </section>
  {/if}

  <!-- 선택 기록 타임라인 -->
  <section>
    <h3>선택 기록 <span class="dim">({detail.events.length}건)</span></h3>
    {#if detail.events.length === 0}
      <p class="dim">기록된 선택이 없습니다.</p>
    {:else}
      <ol class="timeline">
        {#each detail.events as event (event.seq)}
          <li>
            <span class="t">R{event.round} · {time(event.elapsedSeconds)}</span>
            <span class="k">{TYPE_LABEL[event.type] ?? event.type}</span>
            <span class="v">{describe(event)}</span>
          </li>
        {/each}
      </ol>
    {/if}
  </section>
</div>

<style>
  .detail {
    display: grid;
    gap: 22px;
  }
  h3 {
    font-size: 14px;
    margin-bottom: 10px;
    color: var(--color-base-content, #ece2cb);
  }
  .dim {
    color: color-mix(in srgb, var(--color-base-content, #ece2cb) 55%, transparent);
    font-weight: 400;
  }
  .charts {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 16px;
  }
  .chart-card {
    padding: 16px;
    border: 1px solid var(--color-base-300, #31271a);
    border-radius: 10px;
    background: color-mix(in srgb, var(--color-base-200, #241d14) 60%, transparent);
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .timeline {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    gap: 2px;
    max-height: 420px;
    overflow-y: auto;
  }
  .timeline li {
    display: grid;
    grid-template-columns: 92px 88px 1fr;
    gap: 8px;
    font-size: 12.5px;
    padding: 4px 2px;
    border-bottom: 1px solid color-mix(in srgb, var(--color-base-300, #31271a) 60%, transparent);
  }
  .timeline .t {
    color: color-mix(in srgb, var(--color-base-content, #ece2cb) 55%, transparent);
    font-variant-numeric: tabular-nums;
  }
  .timeline .k {
    color: var(--color-primary, #e3b23e);
  }

  @media (max-width: 560px) {
    .timeline li {
      grid-template-columns: 80px 1fr;
    }
    .timeline .v {
      grid-column: 1 / -1;
      color: var(--color-base-content, #ece2cb);
    }
  }
</style>
