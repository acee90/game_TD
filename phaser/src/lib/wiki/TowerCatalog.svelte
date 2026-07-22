<script lang="ts">
  // 타워 카탈로그 — 병과별로 묶고, 같은 계열은 Lv1→Lv4 순서로 나열해 진화형을 보여준다.
  // 계열 그룹핑은 tower-lines.ts의 명칭 기준 참고 구성 — 실제 합성은 무작위다(주석 참조).
  import { base } from '$app/paths';
  import type { RaceGroupView } from './tower-lines';

  let { raceGroups }: { raceGroups: readonly RaceGroupView[] } = $props();
</script>

<nav class="race-jump" aria-label="병과 바로가기">
  {#each raceGroups as group (group.race)}
    <a href="#race-{group.race}" style="color: {group.raceColor}">{group.raceLabel}</a>
  {/each}
</nav>

<p class="lines-note">
  같은 계열(예: 궁병 계열)은 <b>명칭을 기준으로 묶은 참고용 구성</b>입니다. 실제 합성은
  같은 이름 타워 2기가 모이면 다음 티어 <b>전체 풀에서 무작위로</b> 나옵니다 — 병과·계열은
  결과를 보장하지 않습니다.
</p>

{#each raceGroups as group (group.race)}
  <section id="race-{group.race}" class="race-group">
    <h2 style="color: {group.raceColor}">{group.raceLabel}</h2>

    <div class="lines">
      {#each group.lines as line (line.id)}
        <div class="line">
          <h3 class="line-label">{line.label}</h3>
          <div class="line-row">
            {#each line.steps as tower, index (tower.id)}
              {#if index > 0}<span class="line-arrow" aria-hidden="true">→</span>{/if}
              <a class="tower-card" href="{base}/wiki/towers/{tower.id}">
                <span class="tower-card-tier">{tower.tierLabel}</span>
                <b style="color: {tower.raceColor}">{tower.name}</b>
                <span class="tower-card-stats">
                  DPS {tower.text.dps} · 사거리 {tower.text.range}
                </span>
              </a>
            {/each}
          </div>
        </div>
      {/each}
    </div>

    {#if group.godTowers.length > 0}
      <div class="line god-line">
        <h3 class="line-label">GOD 등급 <span class="god-note">— 라인의 연장이 아닌 별도 풀</span></h3>
        <div class="line-row">
          {#each group.godTowers as tower (tower.id)}
            <a class="tower-card god-card" href="{base}/wiki/towers/{tower.id}">
              <span class="tower-card-tier god-badge">
                {tower.godUnlock === 'early' ? '기본' : '보스 6처치'}
              </span>
              <b style="color: {tower.raceColor}">{tower.name}</b>
              <span class="tower-card-stats">
                DPS {tower.text.dps} · 사거리 {tower.text.range}
              </span>
            </a>
          {/each}
        </div>
      </div>
    {/if}
  </section>
{/each}

<style>
  .race-jump {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 14px;
    margin-top: 14px;
  }

  .race-jump a {
    font-size: 13.5px;
    font-weight: 700;
    padding: 4px 2px;
    border-bottom: 2px solid transparent;
  }

  .race-jump a:hover {
    border-bottom-color: currentColor;
  }

  .lines-note {
    margin-top: 14px;
    padding: 12px 14px;
    border: 1px solid var(--line, #4d3d28);
    border-radius: 8px;
    background: var(--panel, #241d14);
    color: var(--dim, #9d8c6f);
    font-size: 12.5px;
    line-height: 1.7;
    max-width: 720px;
  }

  .lines-note b {
    color: var(--text, #ece2cb);
  }

  .race-group {
    margin-top: 40px;
    scroll-margin-top: 70px;
  }

  .race-group h2 {
    font-size: 21px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--line, #4d3d28);
  }

  .lines {
    display: grid;
    gap: 20px;
    margin-top: 18px;
  }

  .line-label {
    font-size: 13px;
    font-weight: 700;
    color: var(--text, #ece2cb);
    margin-bottom: 8px;
  }

  .god-note {
    font-weight: 400;
    color: var(--dim, #9d8c6f);
    font-size: 11.5px;
  }

  .line-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }

  .line-arrow {
    color: var(--line2, #6b5638);
    font-size: 16px;
    flex: 0 0 auto;
  }

  .tower-card {
    display: grid;
    gap: 4px;
    flex: 1 1 150px;
    min-width: 150px;
    max-width: 220px;
    padding: 10px 13px;
    background: var(--panel, #241d14);
    border: 1px solid var(--line, #4d3d28);
    border-radius: 9px;
    text-decoration: none;
    color: inherit;
  }

  .tower-card:hover {
    border-color: var(--line2, #6b5638);
    background: var(--panel2, #31271a);
  }

  .tower-card-tier {
    justify-self: start;
    font-size: 10.5px;
    color: var(--gold, #e3b23e);
    border: 1px solid var(--line2, #6b5638);
    border-radius: 4px;
    padding: 1px 6px;
  }

  .tower-card b {
    font-size: 14px;
  }

  .tower-card-stats {
    font-size: 11.5px;
    color: var(--dim, #9d8c6f);
    font-variant-numeric: tabular-nums;
  }

  .god-line {
    margin-top: 20px;
    padding-top: 16px;
    border-top: 1px dashed var(--line, #4d3d28);
  }

  .god-badge {
    color: var(--dim, #9d8c6f);
  }

  /* 좁은 화면 — 계열이 세로로 흐르게, 화살표는 아래 방향으로 */
  @media (max-width: 560px) {
    .line-row {
      flex-direction: column;
      align-items: stretch;
    }

    .tower-card {
      max-width: none;
    }

    .line-arrow {
      align-self: center;
      transform: rotate(90deg);
    }
  }
</style>
