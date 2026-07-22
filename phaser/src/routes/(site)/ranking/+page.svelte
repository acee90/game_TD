<script lang="ts">
  // 랭킹 — 서버(D1) 기록을 보여준다 (M3).
  // 노출 대상은 **정상 종료(게임오버·클리어)** 판뿐이다 — 중간에 그만둔 판은 저장은 되지만
  // 랭킹에 오르지 않는다 (계획 §5.2). 가짜 데이터는 넣지 않는다.
  import { onMount } from 'svelte';
  import { base } from '$app/paths';
  import { fetchRanking, fetchRunDetail, type RankingRow, type RunDetail } from '$lib/ranking/ranking-api';
  import RunDetailPanel from '$lib/ranking/RunDetailPanel.svelte';

  let listState = $state<'loading' | 'ready' | 'error'>('loading');
  let rows = $state<RankingRow[]>([]);

  let openRunId = $state<string | null>(null);
  let detail = $state<RunDetail | null>(null);
  let detailState = $state<'idle' | 'loading' | 'error'>('idle');

  onMount(async () => {
    try {
      rows = await fetchRanking(20);
      listState = 'ready';
    } catch {
      listState = 'error';
    }
  });

  async function toggle(runId: string): Promise<void> {
    if (openRunId === runId) {
      openRunId = null;
      detail = null;
      return;
    }
    openRunId = runId;
    detail = null;
    detailState = 'loading';
    try {
      detail = await fetchRunDetail(runId);
      detailState = 'idle';
    } catch {
      detailState = 'error';
    }
  }

  const dateText = (iso: string): string =>
    new Date(iso).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' });
  const durationText = (seconds: number | null): string => {
    if (seconds === null) return '-';
    const m = Math.floor(seconds / 60);
    return m > 0 ? `${m}분` : `${Math.round(seconds)}초`;
  };
</script>

<svelte:head>
  <title>랭킹 — G-타워디펜스</title>
  <meta name="description" content="G-타워디펜스 랭킹 — 정상적으로 끝난 판의 최고 기록." />
</svelte:head>

<h1>랭킹</h1>
<p class="page-lead">
  끝까지 진행한 판(게임오버·클리어)의 기록입니다. 중간에 그만둔 판은 오르지 않습니다.
  기록을 눌러 그 판의 빌드와 선택을 볼 수 있습니다.
</p>

{#if listState === 'loading'}
  <p class="loading">랭킹을 불러오는 중…</p>
{:else if listState === 'error'}
  <div class="empty-state">
    <b>랭킹을 불러오지 못했습니다.</b><br />
    잠시 후 새로고침해 주세요.
  </div>
{:else if rows.length === 0}
  <div class="empty-state">
    <b>아직 기록이 없습니다.</b><br />
    끝까지 플레이한 첫 기록의 주인이 되어보세요.
    <br />
    <a class="btn-primary" href="{base}/game" data-sveltekit-reload>게임 시작</a>
  </div>
{:else}
  <section aria-label="랭킹">
    <ol class="board">
      {#each rows as row (row.runId)}
        <li class:mine={row.mine}>
          <button class="rowBtn" onclick={() => toggle(row.runId)} aria-expanded={openRunId === row.runId}>
            <span class="rank">{row.rank}</span>
            <span class="who">
              {row.displayName ?? '익명'}
              {#if row.mine}<span class="badge">내 기록</span>{/if}
              {#if row.cleared}<span class="badge clear">클리어</span>{/if}
            </span>
            <span class="score">{row.score.toLocaleString('ko-KR')}</span>
            <span class="meta">R{row.round} · {row.kills ?? '-'}킬 · {durationText(row.elapsedSeconds)}</span>
            <span class="date">{dateText(row.startedAt)}</span>
            <span class="caret" aria-hidden="true">{openRunId === row.runId ? '▾' : '▸'}</span>
          </button>

          {#if openRunId === row.runId}
            <div class="detailWrap">
              {#if detailState === 'loading'}
                <p class="dim">기록을 불러오는 중…</p>
              {:else if detailState === 'error'}
                <p class="dim">상세를 불러오지 못했습니다.</p>
              {:else if detail}
                <RunDetailPanel {detail} />
              {:else}
                <p class="dim">공개된 상세 기록이 없습니다.</p>
              {/if}
            </div>
          {/if}
        </li>
      {/each}
    </ol>
    <p class="note">
      기록은 클라이언트가 보낸 값을 서버가 형식 검사만 거쳐 표시합니다 — 점수 재현 검증은 하지 않습니다.
      표시명은 자기 신고값이며 계정 인증이 없습니다.
    </p>
  </section>
{/if}

<style>
  .board {
    list-style: none;
    padding: 0;
    margin: 18px 0 0;
    display: grid;
    gap: 8px;
  }

  .board li {
    border: 1px solid var(--line, #4d3d28);
    border-radius: 10px;
    background: var(--panel, #241d14);
    overflow: hidden;
  }

  .board li.mine {
    border-color: var(--gold, #e3b23e);
  }

  .rowBtn {
    width: 100%;
    display: grid;
    grid-template-columns: 40px minmax(0, 1fr) auto auto auto 20px;
    align-items: center;
    gap: 12px;
    padding: 12px 14px;
    background: none;
    border: 0;
    color: inherit;
    text-align: left;
    cursor: pointer;
    font-variant-numeric: tabular-nums;
  }

  .rowBtn:hover {
    background: var(--panel2, #31271a);
  }

  .rank {
    font-weight: 700;
    color: var(--gold, #e3b23e);
    font-size: 15px;
  }

  .who {
    font-size: 14px;
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }

  .badge {
    font-size: 10.5px;
    padding: 1px 7px;
    border-radius: 999px;
    border: 1px solid var(--gold, #e3b23e);
    color: var(--gold, #e3b23e);
    white-space: nowrap;
  }

  .badge.clear {
    border-color: var(--moss, #8a9a5b);
    color: var(--moss, #8a9a5b);
  }

  .score {
    font-weight: 700;
    font-size: 15px;
  }

  .meta,
  .date {
    font-size: 12px;
    color: var(--dim, #9d8c6f);
    white-space: nowrap;
  }

  .caret {
    color: var(--dim, #9d8c6f);
  }

  .detailWrap {
    padding: 14px;
    border-top: 1px solid var(--line, #4d3d28);
  }

  .dim {
    color: var(--dim, #9d8c6f);
    font-size: 13px;
  }

  .note {
    margin-top: 16px;
    font-size: 12px;
    color: var(--dim, #9d8c6f);
    line-height: 1.7;
    max-width: 640px;
  }

  .loading {
    margin-top: 30px;
    color: var(--dim, #9d8c6f);
  }

  @media (max-width: 700px) {
    .rowBtn {
      grid-template-columns: 32px minmax(0, 1fr) auto 16px;
      row-gap: 4px;
    }
    .meta {
      grid-column: 2 / 4;
    }
    .date {
      display: none;
    }
  }
</style>
