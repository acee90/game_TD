<script lang="ts">
  import { base } from '$app/paths';
</script>

<svelte:head>
  <title>대시보드 — G-타워디펜스</title>
  <meta name="description" content="내 최고 기록과 최근 플레이 요약." />
</svelte:head>

<h1>대시보드</h1>
<p class="page-lead">
  이 브라우저에 저장된 내 최고 기록과 최근 플레이를 요약해 보여줄 공간입니다.
  기록은 이 브라우저에만 저장됩니다.
</p>

<section aria-label="내 기록">
  <div class="empty-state">
    <b>아직 표시할 기록이 없습니다.</b><br />
    게임을 플레이하면 최고 기록과 최근 플레이 요약이 여기에 표시됩니다.
    <br />
    <a class="btn-primary" href="{base}/game" data-sveltekit-reload>게임 시작</a>
  </div>
</section>
