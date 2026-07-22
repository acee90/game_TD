<script lang="ts">
  import { TOWER_CATALOG } from '@engine/data/tower-catalog';
  import { towerWikiView } from '@engine/lib/tower-wiki';
  import TowerCatalog from '$lib/wiki/TowerCatalog.svelte';

  const towers = TOWER_CATALOG.map(towerWikiView);
</script>

<svelte:head>
  <title>타워 정보 — G-타워디펜스 Wiki</title>
  <meta name="description" content="G-타워디펜스 타워 {towers.length}종 — 병과·티어별 전투 수치와 투사체 프리뷰." />
</svelte:head>

<h1>타워 정보</h1>
<p class="page-lead">
  네 병과(정규군·포병·마법대·소환대)의 타워 {towers.length}종입니다.
  수치는 게임 코드의 전투 계산을 그대로 사용합니다 (병과 업그레이드 0 기준).
</p>

<TowerCatalog {towers} />
