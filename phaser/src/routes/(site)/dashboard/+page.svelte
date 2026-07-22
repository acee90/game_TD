<script lang="ts">
  // 대시보드 — 이 브라우저 저장소만 읽는다 (M6). 가짜 데이터 없음:
  // 명예의 전당(localStorage, 동기 저장)과 완주 런 summary(IndexedDB)만 신뢰한다.
  import { onMount } from 'svelte';
  import { base } from '$app/paths';
  import * as hallOfFame from '@engine/ui/hall-of-fame';
  import { listRunSummaries } from '@engine/logging/indexed-db-run-store';
  import type { RunSummary } from '@engine/game/logging';

  let loaded = $state(false);
  let best = $state<hallOfFame.Record | null>(null);
  let recent = $state<RunSummary[]>([]);

  onMount(async () => {
    const records = hallOfFame.load();
    best = records[0] ?? null;
    try {
      recent = (await listRunSummaries()).slice(0, 5);
    } catch {
      recent = []; // IndexedDB를 못 여는 환경 — 빈 상태로 둔다
    }
    loaded = true;
  });

  const dateText = (ms: number): string =>
    new Date(ms).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' });
  const timeText = (iso: string): string =>
    new Date(iso).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const durationText = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    return m > 0 ? `${m}분 ${Math.round(seconds % 60)}초` : `${Math.round(seconds)}초`;
  };
</script>

<svelte:head>
  <title>대시보드 — G-타워디펜스</title>
  <meta name="description" content="내 최고 기록과 최근 플레이 요약." />
</svelte:head>

<h1>대시보드</h1>
<p class="page-lead">
  이 브라우저에 저장된 내 최고 기록과 최근 플레이 요약입니다. 기록은 이 브라우저에만
  저장되며 다른 기기·브라우저에서는 보이지 않습니다.
</p>

{#if loaded}
  <section aria-label="최고 기록">
    <h2>최고 기록</h2>
    {#if best}
      <div class="best card">
        <p class="best-score">{best.score.toLocaleString('ko-KR')}점</p>
        <p class="best-detail">
          {best.round}라운드 · {best.kills}킬 · 영웅 Lv{best.heroLevel} · {dateText(best.at)}
        </p>
      </div>
    {:else}
      <div class="empty-state">
        <b>아직 표시할 기록이 없습니다.</b><br />
        게임을 끝까지 플레이하면 최고 기록이 여기에 표시됩니다.
        <br />
        <a class="btn-primary" href="{base}/game" data-sveltekit-reload>게임 시작</a>
      </div>
    {/if}
  </section>

  <section aria-label="최근 플레이">
    <h2>최근 플레이</h2>
    {#if recent.length > 0}
      <ul class="runs">
        {#each recent as run (run.runId)}
          <li class="card">
            <span class="run-main">
              <b>{run.score.toLocaleString('ko-KR')}점</b> · {run.round}라운드 · {run.kills}킬
            </span>
            <span class="run-sub">
              {timeText(run.startedAt)} · {durationText(run.elapsedSeconds)}
              {#if run.finishReason === 'game_over'} · 게임오버{/if}
            </span>
          </li>
        {/each}
      </ul>
      <p class="note">완료된 판만 기록됩니다.</p>
    {:else}
      <div class="empty-state">
        아직 완료된 플레이 기록이 없습니다. 판을 끝까지 진행하면 여기에 쌓입니다.
      </div>
    {/if}
  </section>
{:else}
  <p class="loading">기록을 읽는 중…</p>
{/if}

<style>
  .best {
    max-width: 420px;
  }

  .best-score {
    font-size: 34px;
    font-weight: 700;
    color: var(--gold, #e3b23e);
    font-family: var(--serif);
  }

  .best-detail {
    margin-top: 6px;
    color: var(--dim, #9d8c6f);
    font-size: 13.5px;
  }

  .runs {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    gap: 10px;
    max-width: 560px;
  }

  .runs .card {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    flex-wrap: wrap;
    padding: 13px 16px;
  }

  .run-main {
    font-size: 14px;
  }

  .run-main b {
    color: var(--gold, #e3b23e);
  }

  .run-sub {
    font-size: 12.5px;
    color: var(--dim, #9d8c6f);
  }

  .note {
    margin-top: 10px;
    font-size: 12px;
    color: var(--dim, #9d8c6f);
  }

  .loading {
    margin-top: 30px;
    color: var(--dim, #9d8c6f);
  }
</style>
