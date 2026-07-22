<script lang="ts">
  import { base } from '$app/paths';
</script>

<svelte:head>
  <title>타워 정보 — G-타워디펜스 Wiki</title>
  <meta name="description" content="G-타워디펜스 타워 목록 — 병과·티어별 타워와 전투 수치." />
</svelte:head>

<h1>타워 정보</h1>
<p class="page-lead">
  네 병과(정규군·포병·마법대·소환대)의 타워를 병과·티어로 살펴봅니다.
  수치는 게임 코드의 전투 계산을 그대로 사용합니다.
</p>

<div class="empty-state">
  <b>타워 목록을 준비하고 있습니다.</b><br />
  병과·티어 필터가 있는 타워 카드 목록과 상세 페이지가 이곳에 표시됩니다.
</div>

<p style="margin-top: 24px;">
  <a class="btn-ghost" style="margin-left: 0;" href="{base}/wiki">← Wiki로 돌아가기</a>
</p>
