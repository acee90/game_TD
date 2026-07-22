<script lang="ts">
  // 랭킹 상세 — 그 판의 "선택 기록"을 보여준다 (증강 선택·골드 소비·타워 배치).
  // 빌드 구성은 summary에 이미 들어 있어 이벤트를 훑을 필요가 없다 (계획 §3.1).
  import type { DetailEvent, RunDetail } from './ranking-api';

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

  /** 이벤트 한 줄 요약 — 각 타입에서 사람이 읽을 부분만 뽑는다 */
  function describe(event: DetailEvent): string {
    const d = event.data as Record<string, unknown>;
    const tower = d.tower as { name?: string; tier?: number } | undefined;
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

  /** 골드를 어디에 썼나 — cost가 있는 이벤트를 종류별로 합친다 */
  let goldByPurpose = $derived.by(() => {
    const totals = new Map<string, { label: string; gold: number; count: number }>();
    for (const event of detail.events) {
      const cost = num((event.data as Record<string, unknown>).cost);
      if (cost === null || cost <= 0) continue;
      const label = TYPE_LABEL[event.type] ?? event.type;
      const prev = totals.get(event.type) ?? { label, gold: 0, count: 0 };
      totals.set(event.type, { label, gold: prev.gold + cost, count: prev.count + 1 });
    }
    return [...totals.values()].sort((a, b) => b.gold - a.gold);
  });

  const time = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  };
</script>

<div class="detail">
  {#if detail.summary?.towers && detail.summary.towers.length > 0}
    <section>
      <h3>최종 보드</h3>
      <ul class="chips">
        {#each detail.summary.towers as entry (entry.tower.name)}
          <li>{entry.tower.name} <span class="dim">×{entry.count}</span></li>
        {/each}
      </ul>
    </section>
  {/if}

  {#if detail.summary?.augments && detail.summary.augments.length > 0}
    <section>
      <h3>증강 선택</h3>
      <ul class="chips">
        {#each detail.summary.augments as entry, i (i)}
          <li>{entry.augment.name} <span class="dim">R{entry.round}</span></li>
        {/each}
      </ul>
    </section>
  {/if}

  {#if goldByPurpose.length > 0}
    <section>
      <h3>골드 사용처</h3>
      <ul class="gold">
        {#each goldByPurpose as row (row.label)}
          <li><span>{row.label}</span><b>{row.gold.toLocaleString('ko-KR')}</b><span class="dim">{row.count}회</span></li>
        {/each}
      </ul>
    </section>
  {/if}

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
    gap: 20px;
  }
  h3 {
    font-size: 14px;
    margin-bottom: 8px;
    color: var(--text, #ece2cb);
  }
  .dim {
    color: var(--dim, #9d8c6f);
    font-weight: 400;
  }
  .chips {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .chips li {
    font-size: 12.5px;
    padding: 4px 10px;
    border: 1px solid var(--line, #4d3d28);
    border-radius: 999px;
    background: var(--panel, #241d14);
  }
  .gold {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    gap: 4px;
    max-width: 360px;
  }
  .gold li {
    display: grid;
    grid-template-columns: 1fr auto auto;
    gap: 10px;
    font-size: 13px;
    padding: 5px 0;
    border-bottom: 1px solid var(--line, #4d3d28);
    font-variant-numeric: tabular-nums;
  }
  .gold b {
    color: var(--gold, #e3b23e);
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
    border-bottom: 1px solid rgba(77, 61, 40, 0.5);
  }
  .timeline .t {
    color: var(--dim, #9d8c6f);
    font-variant-numeric: tabular-nums;
  }
  .timeline .k {
    color: var(--gold, #e3b23e);
  }

  @media (max-width: 560px) {
    .timeline li {
      grid-template-columns: 80px 1fr;
    }
    .timeline .v {
      grid-column: 1 / -1;
      color: var(--dim, #9d8c6f);
    }
  }
</style>
