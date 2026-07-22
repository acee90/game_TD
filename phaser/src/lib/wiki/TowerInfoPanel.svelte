<script lang="ts">
  // 타워 정보 패널 — 수치·문자열은 전부 view-model(tower-wiki)에서 온다.
  // 여기서 계산·반올림을 다시 하지 않는다 (§4.2).
  import type { TowerWikiView } from '@engine/lib/tower-wiki';

  let { view }: { view: TowerWikiView } = $props();

  // 태그의 방향성 설명 — 정성 설명만, 수치는 적지 않는다 (원본은 balance.ts TAG_EFFECT)
  const TAG_NOTE: Record<string, string> = {
    power: '강한 한 방 — 공격력이 높은 대신 공격 간격이 길다',
    splash: '범위 피해 — 착탄 지점 주변의 밀집한 적을 함께 때린다',
    speed: '빠른 연사 — 짧은 간격으로 화살을 쏜다',
  };
  const TAG_KO: Record<string, string> = { power: '파워', splash: '스플래시', speed: '스피드' };
</script>

<div class="info">
  <header>
    <h1 style="color: {view.raceColor}">{view.name}</h1>
    <p class="chips">
      <span class="chip">{view.raceLabel}</span>
      <span class="chip">{view.tierLabel}</span>
      <span class="chip">【 {view.tagText} 】</span>
      {#if view.godUnlock === 'late'}
        <span class="chip chip-late">확장 풀 — 보스 6처치 해금</span>
      {/if}
    </p>
  </header>

  <table aria-label="{view.name} 전투 수치">
    <tbody>
      <tr><th scope="row">공격력</th><td>{view.text.damage}</td></tr>
      <tr><th scope="row">공속</th><td>{view.text.attacksPerSecond}회/초</td></tr>
      <tr>
        <th scope="row">
          <abbr title="공격력 ÷ 공격 간격의 단순 비교값 — 방어력, 스플래시 감쇠, 실전 가동률은 반영하지 않습니다">표시 DPS</abbr>
        </th>
        <td>{view.text.dps}</td>
      </tr>
      <tr><th scope="row">사거리</th><td>{view.text.range}</td></tr>
      {#if view.text.splashRadius !== null}
        <tr><th scope="row">스플래시 범위</th><td>{view.text.splashRadius}</td></tr>
      {/if}
      {#if view.text.slow !== null}
        <tr><th scope="row">감속</th><td>{view.text.slow}</td></tr>
      {/if}
    </tbody>
  </table>
  <p class="baseline">병과 업그레이드 0 기준 · 영웅 보너스 제외</p>

  <section aria-label="태그 효과">
    <h2>태그 효과</h2>
    <ul>
      {#each view.tags as tag (tag)}
        <li><b>{TAG_KO[tag]}</b> — {TAG_NOTE[tag]}</li>
      {/each}
      {#if view.slowFactor !== null}
        <li><b>소환대</b> — 사거리 안 몬스터를 느리게 만든다</li>
      {/if}
    </ul>
  </section>
</div>

<style>
  .info h1 {
    font-size: clamp(24px, 4vw, 32px);
    margin: 0;
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 10px;
  }

  .chip {
    padding: 3px 10px;
    border: 1px solid var(--line2, #6b5638);
    border-radius: 999px;
    font-size: 12px;
    color: var(--dim, #9d8c6f);
  }

  .chip-late {
    color: var(--gold, #e3b23e);
    border-color: var(--gold, #e3b23e);
  }

  table {
    width: 100%;
    margin-top: 18px;
    border-collapse: collapse;
    font-variant-numeric: tabular-nums;
  }

  th,
  td {
    text-align: left;
    padding: 9px 10px;
    border-bottom: 1px solid var(--line, #4d3d28);
    font-size: 14px;
  }

  th {
    color: var(--dim, #9d8c6f);
    font-weight: 400;
    width: 40%;
  }

  td {
    color: var(--text, #ece2cb);
    font-weight: 700;
  }

  abbr {
    text-decoration: underline dotted;
    cursor: help;
  }

  .baseline {
    margin-top: 8px;
    font-size: 12px;
    color: var(--dim, #9d8c6f);
  }

  section {
    margin-top: 22px;
  }

  h2 {
    font-size: 15px;
    margin: 0 0 8px;
  }

  ul {
    margin: 0;
    padding-left: 18px;
    display: grid;
    gap: 6px;
    font-size: 13.5px;
    color: var(--dim, #9d8c6f);
    line-height: 1.6;
  }

  li b {
    color: var(--text, #ece2cb);
  }
</style>
