<script lang="ts">
  // 랭킹 — 명예의 전당(localStorage)을 읽기 전용으로 보여준다 (M6).
  // 온라인 랭킹이 아니다 — 서버 랭킹처럼 보이는 가짜 사용자명·점수를 넣지 않는다 (§3.2).
  import { onMount } from 'svelte';
  import { base } from '$app/paths';
  import * as hallOfFame from '$lib/game/hall-of-fame';

  let loaded = $state(false);
  let records = $state<hallOfFame.Record[]>([]);

  onMount(() => {
    records = hallOfFame.load();
    loaded = true;
  });

  const dateText = (ms: number): string =>
    new Date(ms).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' });
</script>

<svelte:head>
  <title>랭킹 — G-타워디펜스</title>
  <meta name="description" content="명예의 전당 — 내 브라우저에 저장된 최고 기록." />
</svelte:head>

<h1>랭킹</h1>
<p class="page-lead">
  명예의 전당입니다. 온라인 랭킹이 아니라 <b>내 브라우저에 저장된 기록</b>만
  표시합니다 — 다른 기기·브라우저의 기록은 보이지 않습니다.
</p>

{#if loaded}
  <section aria-label="명예의 전당">
    {#if records.length > 0}
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">순위</th>
              <th scope="col">점수</th>
              <th scope="col">라운드</th>
              <th scope="col">킬</th>
              <th scope="col">영웅</th>
              <th scope="col">날짜</th>
            </tr>
          </thead>
          <tbody>
            {#each records as record, index (record.at + '-' + record.score)}
              <tr>
                <td class="rank">{index + 1}</td>
                <td class="score">{record.score.toLocaleString('ko-KR')}</td>
                <td>{record.round}R</td>
                <td>{record.kills}</td>
                <td>Lv{record.heroLevel}</td>
                <td class="date">{dateText(record.at)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {:else}
      <div class="empty-state">
        <b>아직 기록이 없습니다.</b><br />
        게임을 끝까지 플레이하면 명예의 전당 기록이 여기에 표시됩니다.
        <br />
        <a class="btn-primary" href="{base}/game" data-sveltekit-reload>게임 시작</a>
      </div>
    {/if}
  </section>
{:else}
  <p class="loading">기록을 읽는 중…</p>
{/if}

<style>
  .table-wrap {
    margin-top: 18px;
    overflow-x: auto;
    border: 1px solid var(--line, #4d3d28);
    border-radius: 10px;
    max-width: 720px;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-variant-numeric: tabular-nums;
    font-size: 14px;
  }

  th,
  td {
    text-align: left;
    padding: 11px 14px;
    white-space: nowrap;
  }

  thead th {
    font-size: 12px;
    font-weight: 400;
    color: var(--dim, #9d8c6f);
    border-bottom: 1px solid var(--line, #4d3d28);
    background: var(--panel, #241d14);
  }

  tbody tr + tr td {
    border-top: 1px solid var(--line, #4d3d28);
  }

  .rank {
    color: var(--gold, #e3b23e);
    font-weight: 700;
  }

  .score {
    font-weight: 700;
  }

  .date {
    color: var(--dim, #9d8c6f);
  }

  .loading {
    margin-top: 30px;
    color: var(--dim, #9d8c6f);
  }
</style>
