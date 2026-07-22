<script lang="ts">
  // 타워 상세 — 데스크톱: 프리뷰 왼쪽·정보 오른쪽 / 모바일: 프리뷰 위·정보 아래 (§5)
  import { base } from '$app/paths';
  import TowerPreview from '$lib/wiki/TowerPreview.svelte';
  import TowerInfoPanel from '$lib/wiki/TowerInfoPanel.svelte';

  let { data } = $props();
</script>

<svelte:head>
  <title>{data.view.name} — 타워 정보 — G-타워디펜스 Wiki</title>
  <meta
    name="description"
    content="{data.view.raceLabel} {data.view.tierLabel} 타워 {data.view.name}의 전투 수치와 투사체 프리뷰."
  />
</svelte:head>

<nav class="crumbs" aria-label="위치">
  <a href="{base}/wiki">Wiki</a>
  <span aria-hidden="true">›</span>
  <a href="{base}/wiki/towers">타워 정보</a>
  <span aria-hidden="true">›</span>
  <span aria-current="page">{data.view.name}</span>
</nav>

<div class="detail">
  <div class="detail-preview">
    {#key data.view.id}
      <TowerPreview view={data.view} />
    {/key}
    <p class="preview-note">실제 게임과 같은 투사체·착탄 효과입니다. 발사 주기는 보기 좋게 제한됩니다.</p>
  </div>
  <TowerInfoPanel view={data.view} />
</div>

<nav class="pager" aria-label="타워 이동">
  {#if data.prev}
    <a class="pager-link" href="{base}/wiki/towers/{data.prev.id}">
      ← {data.prev.name} ({data.prev.tierLabel})
    </a>
  {:else}
    <span></span>
  {/if}
  <a class="pager-link" href="{base}/wiki/towers#race-{data.view.race}">같은 병과 목록</a>
  {#if data.next}
    <a class="pager-link" href="{base}/wiki/towers/{data.next.id}">
      {data.next.name} ({data.next.tierLabel}) →
    </a>
  {:else}
    <span></span>
  {/if}
</nav>

<style>
  .crumbs {
    display: flex;
    gap: 8px;
    font-size: 13px;
    color: var(--dim, #9d8c6f);
    margin-bottom: 22px;
  }

  .crumbs a {
    color: var(--dim, #9d8c6f);
  }

  .crumbs a:hover {
    color: var(--text, #ece2cb);
  }

  .crumbs [aria-current] {
    color: var(--text, #ece2cb);
  }

  .detail {
    display: grid;
    grid-template-columns: minmax(0, 7fr) minmax(0, 5fr);
    gap: 32px;
    align-items: start;
  }

  .preview-note {
    margin-top: 10px;
    font-size: 12px;
    color: var(--dim, #9d8c6f);
  }

  .pager {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    margin-top: 36px;
    padding-top: 18px;
    border-top: 1px solid var(--line, #4d3d28);
    flex-wrap: wrap;
  }

  .pager-link {
    color: var(--gold, #e3b23e);
    font-size: 14px;
  }

  .pager-link:hover {
    text-decoration: underline;
  }

  @media (max-width: 760px) {
    .detail {
      grid-template-columns: 1fr;
      gap: 24px;
    }
  }
</style>
