<script lang="ts">
  import { base } from '$app/paths';
</script>

<svelte:head>
  <title>Wiki — G-타워디펜스</title>
  <meta name="description" content="G-타워디펜스 게임 정보 Wiki — 타워, 영웅, 몬스터 정보." />
</svelte:head>

<h1>Wiki</h1>
<p class="page-lead">
  게임 정보 모음입니다. 모든 수치는 실제 게임 코드에서 그대로 가져옵니다.
</p>

<section aria-label="Wiki 카테고리">
  <div class="card-grid">
    <a class="card" href="{base}/wiki/towers">
      <h3>타워 정보</h3>
      <p>네 병과의 타워 목록과 상세 수치, 투사체·착탄 프리뷰.</p>
    </a>
    <div class="card card-disabled">
      <span class="card-badge">예정</span>
      <h3>영웅</h3>
      <p>영웅 성장과 증강 정보. 타워 정보가 완성된 뒤 같은 구조로 확장합니다.</p>
    </div>
    <div class="card card-disabled">
      <span class="card-badge">예정</span>
      <h3>몬스터 · 보스</h3>
      <p>라운드별 몬스터와 보스 도감. 타워 정보가 완성된 뒤 같은 구조로 확장합니다.</p>
    </div>
  </div>
</section>
