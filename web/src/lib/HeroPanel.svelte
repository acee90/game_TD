<script lang="ts">
  import type { Game } from '../game/game';
  import * as HD from '../data/hero';
  import { heroStatsText, heroAugsHtml } from './view';

  let { game, tick }: { game: Game; tick: number } = $props();

  let v = $derived.by(() => {
    tick;
    const hero = game.hero;
    const stats = hero.stats;
    const attributes = HD.attributesByLevel(hero.level);
    const skill = hero.skill;

    const skillView = skill
      ? {
          ready: game.canUseSkill,
          charged: Math.min(1, hero.mana / skill.manaMax),
          text: (() => {
            const dmg = skill.damageMult > 0 ? ` · 피해 ${Math.round(stats.damage * skill.damageMult)}` : '';
            const targets = skill.targets > 0 ? ` · ${skill.targets}발` : '';
            const state = game.canUseSkill
              ? game.shouldAutoCastSkill ? '시전!' : '대기 중'
              : `마나 ${Math.floor(hero.mana)}/${Math.round(skill.manaMax)}`;
            return `${skill.def.name}${dmg}${targets} · ${state}`;
          })(),
        }
      : null;

    return {
      level: `Lv${hero.level}`,
      hpWidth: (hero.alive ? hero.hp / stats.maxHp : 0) * 100,
      hpText: hero.alive ? `${Math.ceil(hero.hp)}/${stats.maxHp}` : `부활 ${Math.ceil(hero.respawnTimer)}s`,
      xpWidth: (hero.xp / hero.xpNeeded) * 100,
      xpText: `${Math.floor(hero.xp)}/${hero.xpNeeded}${HD.nextAugmentRound(game.round) ? ` · 다음 증강 R${HD.nextAugmentRound(game.round)}` : ''}`,
      stats: heroStatsText(game),
      statButtons: HD.STAT_IDS.map((stat) => ({
        label: `${HD.STAT_LABEL[stat]} ${attributes[stat].toFixed(1)}`,
      })),
      buyXpText: `[E] XP +${HD.XP_BUY_AMOUNT} (${HD.XP_BUY_GOLD}금화)`,
      buyXpDisabled: !game.canBuyXp,
      augs: heroAugsHtml(game),
      skill: skillView,
    };
  });
</script>

<section id="heroPanel" aria-label="영웅">
  <div class="hrow">
    <span class="hname">영웅 <b id="heroLevel">{v.level}</b></span>
    <span class="hbar"><i id="heroHpBar" style="width:{v.hpWidth}%"></i></span>
    <span class="hval" id="heroHp">{v.hpText}</span>
  </div>
  <div class="hrow">
    <span class="hname dim">경험치</span>
    <span class="hbar"><i id="heroXpBar" style="width:{v.xpWidth}%"></i></span>
    <span class="hval dim" id="heroXp">{v.xpText}</span>
  </div>
  <div class="hstats" id="heroStats">{v.stats}</div>
  <div class="row c4" id="statRow">
    <button id="statStr" disabled>{v.statButtons[0].label}</button>
    <button id="statAgi" disabled>{v.statButtons[1].label}</button>
    <button id="statInt" disabled>{v.statButtons[2].label}</button>
    <button id="buyXp" disabled={v.buyXpDisabled} onclick={() => game.buyXp()}>{v.buyXpText}</button>
  </div>
  <div class="haugs" id="heroAugs">{@html v.augs}</div>
  {#if v.skill}
    <div id="skill" class:ready={v.skill.ready}>
      <i id="skillCd" style="transform:scaleX({v.skill.charged.toFixed(3)})"></i>
      <span id="skillText">{v.skill.text}</span>
    </div>
  {/if}
</section>
