<script lang="ts">
  import { TOWER_CATALOG } from '@engine/data/tower-catalog';
  import { buildRaceGroups } from '$lib/wiki/tower-lines';
  import TowerCatalog from '$lib/wiki/TowerCatalog.svelte';

  const raceGroups = buildRaceGroups();
</script>

<svelte:head>
  <title>타워 정보 — G-타워디펜스 Wiki</title>
  <meta
    name="description"
    content="G-타워디펜스 타워 {TOWER_CATALOG.length}종 — 병과·계열별로 묶어 티어에 따른 성장을 한눈에 봅니다."
  />
</svelte:head>

<h1>타워 정보</h1>
<p class="page-lead">
  네 병과(정규군·포병·마법대·소환대)의 타워 {TOWER_CATALOG.length}종을 병과별로 묶고,
  같은 계열은 Lv1→Lv4 순서로 나열했습니다. 수치는 게임 코드의 전투 계산을 그대로
  사용합니다 (병과 업그레이드 0 기준).
</p>

<TowerCatalog {raceGroups} />
