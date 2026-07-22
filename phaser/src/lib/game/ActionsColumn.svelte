<script lang="ts">
  import type { Game } from '@engine/game/game';
  import type { Race } from '@engine/data/units';
  import * as B from '@engine/data/balance';
  import {
    selectionInfoHtml,
    bossStateLabel,
    bossGridHtml,
    isGodSelected,
    upgradeLabel,
    skillRerollTitle,
    augmentUpgradeLabel,
  } from './view';

  let {
    game,
    tick,
  }: {
    game: Game;
    tick: number;
  } = $props();

  let v = $derived.by(() => {
    tick;
    const godSel = isGodSelected(game);
    return {
      info: selectionInfoHtml(game),
      bossState: bossStateLabel(game),
      bossGrid: bossGridHtml(game),

      probeText: `[R] 광부 ${game.probeCost} — 초당 마정석 +${B.GAS_PER_PROBE_SECOND} (${game.probes}/${B.PROBE_MAX})`,
      probeTitle: `광부 1기당 초당 마정석 +${B.GAS_PER_PROBE_SECOND}. 살수록 비싸진다 (현재 ${game.probes}기 = 초당 +${(game.probes * B.GAS_PER_PROBE_SECOND).toFixed(2)}).`,
      probeDisabled: game.probes >= B.PROBE_MAX || game.mineral < game.probeCost,

      spawnText: `[P] 타워 생성 ${game.spawnCost}`,
      spawnDisabled: game.mineral < game.spawnCost,

      sellDisabled: !game.selected?.tower,

      godSel,
      godText: `★ GOD 다시 뽑기 — ${game.godRerollCost}금화`,
      godDisabled: !game.canRerollGod(game.selected),

      skillName: game.hero.skill.def.name,
      skillText: game.skillRerollCost === 0
        ? '⟳ 스킬 다시 뽑기 — 무료'
        : `⟳ 스킬 다시 뽑기 — ${game.skillRerollCost}금화`,
      skillDisabled: !game.canRerollSkill,
      skillTitle: skillRerollTitle(game),

      upgradeBtn: augmentUpgradeLabel(game),

      canCopy: game.canCopyTower,
      copyText: game.copyTarget?.tower
        ? `복제 예약됨: ${game.copyTarget.tower.def.name} (취소)`
        : `복제 예약 (티어 ${game.copyTierCap}까지)`,
      copyDisabled: game.copyTarget?.tower
        ? false
        : !game.selected || !game.canMarkCopy(game.selected),

      upgrades: [0, 1, 2, 3].map((i) => upgradeLabel(game, i as Race)),
      upgradeRateText: `+${Math.round(B.UPGRADE_DAMAGE_PER_LEVEL * 100)}%/레벨`,
    };
  });

  function onBossGridClick(event: MouseEvent): void {
    const btn = (event.target as HTMLElement).closest<HTMLElement>('.bossbtn');
    if (btn?.dataset.level) game.summonBoss(Number(btn.dataset.level));
  }

  function onCopyClick(): void {
    // 예약돼 있으면 취소, 아니면 선택한 타워를 예약한다
    const target = game.copyTarget ?? game.selected;
    if (target) game.markCopyTarget(target);
  }
</script>

<div class="actions">
  <div id="info">{@html v.info}</div>

  <!-- 보스 소환대 — 레벨별 버튼 -->
  <div id="bossPanel">
    <div id="bossTitle">⚔️ 보스 소환 <small class="dim">[B]=최고 레벨</small><span class="sub" id="bossState">{v.bossState}</span></div>
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
    <div class="bossgrid" id="bossGrid" role="group" onclick={onBossGridClick}>{@html v.bossGrid}</div>
  </div>

  <div class="row c2">
    <button id="spawn" disabled={v.spawnDisabled} onclick={() => game.spawnUnitAnywhere()}>{v.spawnText}</button>
    <button id="probe" title={v.probeTitle} disabled={v.probeDisabled} onclick={() => game.buyProbe()}>{v.probeText}</button>
  </div>
  <button id="sell" disabled={v.sellDisabled} onclick={() => game.sellSelected()}>[X] 유닛 처분</button>
  {#if v.godSel}
    <button id="rerollGod" title="이 GOD 타워의 종류를 다시 뽑습니다 (지금과 다른 것으로). 보스를 6기 이상 잡았으면 확장 풀에서 나옵니다." disabled={v.godDisabled} onclick={() => game.rerollGod()}>{v.godText}</button>
  {/if}
  <button id="rerollSkill" title={v.skillTitle} disabled={v.skillDisabled} onclick={() => game.rerollSkill()}>{v.skillText}</button>
  <button id="upgradeAugment" title={v.upgradeBtn.title} disabled={v.upgradeBtn.disabled} onclick={() => game.offerAugmentUpgrade()}>{v.upgradeBtn.text}</button>
  {#if v.canCopy}
    <button id="copyTower" disabled={v.copyDisabled} onclick={onCopyClick}>{v.copyText}</button>
  {/if}

  <p class="note">파일런 업그레이드 (마정석) — 병과별 공격력 {v.upgradeRateText} (기본공 가산)</p>
  <div class="row c4">
    {#each v.upgrades as up, i (i)}
      <button id="up{i}" class="upbtn" title={up.title} disabled={up.disabled} onclick={() => game.upgrade(i as Race)}>{up.text}</button>
    {/each}
  </div>
</div>
