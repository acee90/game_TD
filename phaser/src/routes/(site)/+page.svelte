<script lang="ts">
  import { base } from '$app/paths';
</script>

<svelte:head>
  <title>G-타워디펜스 — 브라우저 타워 디펜스</title>
  <meta
    name="description"
    content="타워와 영웅으로 몬스터가 출구에 닿기 전에 막아내는 브라우저 타워 디펜스. 설치 없이 바로 플레이."
  />
</svelte:head>

<h1>타워와 영웅으로<br />몬스터의 길을 막아내세요</h1>
<p class="page-lead">
  십자 일주 맵을 도는 몬스터를 네 병과의 타워와 성장하는 영웅으로 막아내는
  브라우저 타워 디펜스입니다. 설치 없이 바로 시작할 수 있습니다.
</p>
<a class="btn-primary" href="{base}/game" data-sveltekit-reload>게임 시작</a>
<a class="btn-ghost" href="{base}/wiki">Wiki 보기</a>

<section aria-label="핵심 특징">
  <h2>핵심 특징</h2>
  <div class="card-grid">
    <div class="card">
      <h3>타워 배치와 자동 합성</h3>
      <p>빈 타일에 랜덤 타워를 배치하고, 같은 이름 2기를 모으면 자동으로 합성됩니다. 마정석으로 병과를 강화하세요.</p>
    </div>
    <div class="card">
      <h3>성장하는 영웅</h3>
      <p>영웅을 원하는 곳으로 이동시키며 레벨과 증강으로 키웁니다. 스킬은 자동으로 시전됩니다.</p>
    </div>
    <div class="card">
      <h3>보스 소환은 나의 선택</h3>
      <p>준비가 되면 보스를 직접 소환해 보상을 얻습니다. 라이프가 0이 되기 전까지 판은 계속됩니다.</p>
    </div>
  </div>
</section>

<section aria-label="최근 업데이트">
  <h2>최근 업데이트</h2>
  <div class="empty-state">
    업데이트 소식이 준비되면 여기에 표시됩니다.
  </div>
</section>
