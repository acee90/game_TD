<script lang="ts">
  import { base } from '$app/paths';
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

<section aria-label="명예의 전당">
  <div class="empty-state">
    <b>아직 기록이 없습니다.</b><br />
    게임을 끝까지 플레이하면 명예의 전당 기록이 여기에 표시됩니다.
    <br />
    <a class="btn-primary" href="{base}/game" data-sveltekit-reload>게임 시작</a>
  </div>
</section>
