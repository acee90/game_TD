// ───────── HUD / 패널 바인딩 ─────────
import * as B from '../data/balance';
import { RACES, RACE_COLOR, TIER_LABEL, tagLabel, type Race } from '../data/units';
import { attackInterval, damage, range } from '../game/combat';
import { bossKillMineral, nextMilestone } from '../game/economy';
import * as HD from '../data/hero';
import * as S from '../data/score';
import * as hallOfFame from './hall-of-fame';
import type { Game } from '../game/game';

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing element #${id}`);
  return el as T;
};

export interface Elements {
  readonly round: HTMLElement;
  readonly timer: HTMLElement;
  readonly mineral: HTMLElement;
  readonly gas: HTMLElement;
  readonly lives: HTMLElement;
  readonly kills: HTMLElement;
  readonly info: HTMLElement;
  readonly message: HTMLElement;
  readonly repeatBar: HTMLElement;
  readonly repeatVal: HTMLElement;
  readonly milestoneBar: HTMLElement;
  readonly milestoneVal: HTMLElement;
  readonly bossReward: HTMLElement;
  readonly heroPanel: HTMLElement;
  readonly heroLevel: HTMLElement;
  readonly heroHpBar: HTMLElement;
  readonly heroHp: HTMLElement;
  readonly heroXpBar: HTMLElement;
  readonly heroXp: HTMLElement;
  readonly heroStats: HTMLElement;
  readonly statButtons: Record<HD.StatId, HTMLButtonElement>;
  readonly buyXp: HTMLButtonElement;
  readonly heroAugs: HTMLElement;
  readonly skill: HTMLElement;
  readonly skillCd: HTMLElement;
  readonly skillText: HTMLElement;
  readonly augOverlay: HTMLElement;
  readonly augSub: HTMLElement;
  readonly augCards: HTMLElement;
  readonly bossOpen: HTMLButtonElement;
  readonly bossOpenSub: HTMLElement;
  readonly probe: HTMLButtonElement;
  readonly reroll: HTMLButtonElement;
  readonly gasSkillRow: HTMLElement;
  readonly gasSkillDmg: HTMLButtonElement;
  readonly gasSkillCdr: HTMLButtonElement;
  readonly spawn: HTMLButtonElement;
  readonly sell: HTMLButtonElement;
  readonly copyTower: HTMLButtonElement;
  readonly upgrades: readonly HTMLButtonElement[];
  readonly overlay: HTMLElement;
  readonly overlayTitle: HTMLElement;
  readonly overlayBody: HTMLElement;
  readonly score: HTMLElement;
  readonly scoreNext: HTMLElement;
  readonly hallOfFame: HTMLElement;
}

export function bindElements(): Elements {
  return {
    round: $('round'),
    timer: $('timer'),
    mineral: $('mineral'),
    gas: $('gas'),
    lives: $('lives'),
    kills: $('kills'),
    info: $('info'),
    message: $('message'),
    repeatBar: $('repeatBar'),
    repeatVal: $('repeatVal'),
    milestoneBar: $('milestoneBar'),
    milestoneVal: $('milestoneVal'),
    bossReward: $('bossReward'),
    heroPanel: $('heroPanel'),
    heroLevel: $('heroLevel'),
    heroHpBar: $('heroHpBar'),
    heroHp: $('heroHp'),
    heroXpBar: $('heroXpBar'),
    heroXp: $('heroXp'),
    heroStats: $('heroStats'),
    statButtons: {
      str: $('statStr') as HTMLButtonElement,
      agi: $('statAgi') as HTMLButtonElement,
      int: $('statInt') as HTMLButtonElement,
    },
    buyXp: $<HTMLButtonElement>('buyXp'),
    heroAugs: $('heroAugs'),
    skill: $('skill'),
    skillCd: $('skillCd'),
    skillText: $('skillText'),
    augOverlay: $('augOverlay'),
    augSub: $('augSub'),
    augCards: $('augCards'),
    bossOpen: $<HTMLButtonElement>('bossOpen'),
    bossOpenSub: $('bossOpen').querySelector('.sub') as HTMLElement,
    probe: $<HTMLButtonElement>('probe'),
    reroll: $<HTMLButtonElement>('reroll'),
    gasSkillRow: $('gasSkillRow'),
    gasSkillDmg: $<HTMLButtonElement>('gasSkillDmg'),
    gasSkillCdr: $<HTMLButtonElement>('gasSkillCdr'),
    spawn: $<HTMLButtonElement>('spawn'),
    sell: $<HTMLButtonElement>('sell'),
    copyTower: $<HTMLButtonElement>('copyTower'),
    upgrades: [0, 1, 2, 3].map((i) => $<HTMLButtonElement>(`up${i}`)),
    overlay: $('overlay'),
    overlayTitle: $('overlayTitle'),
    overlayBody: $('overlayBody'),
    score: $('score'),
    scoreNext: $('scoreNext'),
    hallOfFame: $('hallOfFame'),
  };
}

function bossStateLabel(game: Game): string {
  const live = game.liveBossLevels;
  const fighting = live.length ? `교전 중 ${live.map((l) => `Lv${l}`).join(' ')} · ` : '';
  const gate =
    game.bossCooldown > 0
      ? `쿨타임 ${Math.ceil(game.bossCooldown)}s`
      : `Lv${game.maxBossLevel} 소환`;
  return fighting + gate;
}

/** 몹·보스를 클릭했을 때 — 무엇이 얼마나 아픈지, 지금 무슨 상태인지 */
function enemyInfo(game: Game): string {
  const enemy = game.selectedEnemy;
  if (!enemy) return '';

  const boss = enemy.kind === 'boss';
  const level = enemy.bossLevel ?? 1;
  const contact = boss
    ? HD.bossDamage(level, game.round)
    : HD.enemyDamage(game.round) * (enemy.contactDamageMult ?? 1);

  // 영웅이 이 몹에게 실제로 넣는 한 방 (장갑 감산 반영)
  const heroHit = B.effectiveDamage(game.hero.attackDamage, enemy.armor);
  const toKill = heroHit > 0 ? Math.ceil(enemy.hp / heroHit) : Infinity;
  // 이 몹만 붙었을 때 영웅이 버티는 시간
  const survive = contact > 0 ? (game.hero.hp / contact).toFixed(0) : '∞';

  const states: string[] = [];
  if (enemy.burnTimer && enemy.burnTimer > 0) {
    states.push(`<span style="color:#ff8a3c">화상 ${enemy.burnStacks ?? 1}중첩</span>`);
  }
  if (enemy.slowFactor !== undefined && enemy.slowFactor < 1) {
    states.push(`<span style="color:#7ce7ff">감속 ${Math.round((1 - enemy.slowFactor) * 100)}%</span>`);
  }
  if (enemy.held) states.push('<span style="color:#6fdc8c">붙잡힘</span>');

  const speed = enemy.speed * (enemy.slowFactor ?? 1);
  const hpPct = Math.max(0, (enemy.hp / enemy.maxHp) * 100);

  return `
    <div class="name" style="color:${boss ? '#ff5a3c' : (enemy.typeColor ?? '#9aa2c0')}">
      ${boss ? `BOSS Lv${level}` : enemy.name}
      <span class="chip">${boss ? '보스' : '몹'}</span>
      ${states.length ? `<span class="chip">${states.join(' · ')}</span>` : ''}
    </div>
    <div class="dim">
      체력 ${Math.ceil(enemy.hp)}/${enemy.maxHp} (${hpPct.toFixed(0)}%) ·
      장갑 ${enemy.armor} · 이동속도 ${speed.toFixed(0)}<br>
      접촉 공격력 ${contact.toFixed(1)}/초 —
      ${contact > 0 ? `영웅이 <b>${survive}초</b> 버팀` : '<b>영웅을 때리지 않는다</b>'} ·
      영웅 한 방 ${heroHit.toFixed(0)} (약 <b>${toKill}대</b>)
      ${boss ? '<br><b>보스는 영웅에게 저지되지 않는다</b> — 도발 인형만 붙잡는다.' : ''}
    </div>`;
}

function selectionInfo(game: Game): string {
  if (game.selectedEnemy) return enemyInfo(game);

  const tower = game.selected?.tower;
  if (!tower) {
    return '<span class="dim">빈 타일 = 유닛 생성 · 유닛 타일 = 정보 · 몹/보스 클릭 = 스탯. 같은 유닛 2기가 모이면 자동 조합됩니다.</span>';
  }
  const dmg = damage(tower, game.upgrades).toFixed(0);
  const dps = (damage(tower, game.upgrades) / attackInterval(tower)).toFixed(0);
  return `
    <div class="name" style="color:${RACE_COLOR[tower.def.race]}">
      ${tower.def.name}
      <span class="chip">${TIER_LABEL[tower.tier]}</span>
      <span class="chip">【 ${tagLabel(tower.def)} 】</span>
    </div>
    <div class="dim">${RACES[tower.def.race]} · 공격력 ${dmg} · 간격 ${attackInterval(tower).toFixed(2)}s
      · DPS ${dps} · 사거리 ${range(tower).toFixed(0)}</div>`;
}

/** 항상 보이는 보상 현황 — 원본 §8.2의 세 소득 계열 */
function refreshMissions(el: Elements, game: Game): void {
  const remaining = Math.max(0, game.roundTimer);
  el.repeatBar.style.width = `${(1 - remaining / B.ROUND_SECONDS) * 100}%`;
  const nextType = B.waveTypeOf(Math.max(1, game.round) + 1);
  const notice = nextType.id === 'normal' ? '' : ` · 다음: ${nextType.label}!`;
  el.repeatVal.textContent =
    `R${Math.max(1, game.round)} 클리어 → +${B.waveReward(Math.max(1, game.round))}${notice}`;

  const milestone = nextMilestone(game.kills);
  if (milestone) {
    const previous = milestone.kills - 200;
    const span = milestone.kills - Math.max(0, previous);
    const done = game.kills - Math.max(0, previous);
    el.milestoneBar.style.width = `${Math.min(100, (done / span) * 100)}%`;
    el.milestoneVal.textContent = `${game.kills}/${milestone.kills} → +${milestone.reward}`;
  } else {
    el.milestoneBar.style.width = '100%';
    el.milestoneVal.textContent = '전부 달성';
  }

  const levels = Array.from({ length: B.BOSS_MAX_LEVEL }, (_, i) => i + 1);
  el.bossReward.innerHTML = levels
    .map((level) => {
      const open = level <= game.maxBossLevel;
      const text = `Lv${level} +${bossKillMineral(level)}`;
      return open ? `<b style="color:var(--gold)">${text}</b>` : `<span class="dim">${text}</span>`;
    })
    .join(' · ');
}

function refreshHero(el: Elements, game: Game): void {
  const hero = game.hero;
  const stats = hero.stats;
  el.heroLevel.textContent = `Lv${hero.level}`;

  const hpRatio = hero.alive ? hero.hp / stats.maxHp : 0;
  el.heroHpBar.style.width = `${hpRatio * 100}%`;
  el.heroHp.textContent = hero.alive
    ? `${Math.ceil(hero.hp)}/${stats.maxHp}`
    : `부활 ${Math.ceil(hero.respawnTimer)}s`;

  el.heroXpBar.style.width = `${(hero.xp / hero.xpNeeded) * 100}%`;
  el.heroXp.textContent = `${Math.floor(hero.xp)}/${hero.xpNeeded}`;

  const dps = (stats.damage / stats.attackInterval).toFixed(0);
  const parts = [
    `공격력 ${stats.damage}`,
    `DPS ${dps}`,
    `사거리 ${stats.range.toFixed(0)}`,
    stats.splashRadius > 0 ? `광역 ${stats.splashRadius.toFixed(0)}` : null,
    stats.damageReduction > 0 ? `피해감소 ${(stats.damageReduction * 100).toFixed(0)}%` : null,
    stats.regen > 0 ? `재생 ${stats.regen}/s` : null,
    // 물러나 있으면 저절로 찬다 — 회복 중일 때만 알린다
    hero.alive && hero.secondsSinceDamaged >= HD.HERO_OOC_REGEN_DELAY && hero.hp < stats.maxHp
      ? `회복중 +${stats.outOfCombatRegen.toFixed(0)}/s`
      : null,
  ].filter(Boolean);
  el.heroStats.textContent = parts.join(' · ');

  const attributes = HD.attributesByLevel(hero.level);
  for (const stat of HD.STAT_IDS) {
    const button = el.statButtons[stat];
    button.textContent = `${HD.STAT_LABEL[stat]} ${attributes[stat].toFixed(1)}`;
    button.disabled = true;
  }
  el.buyXp.textContent = `XP +${HD.XP_BUY_AMOUNT} (${HD.XP_BUY_GOLD})`;
  el.buyXp.disabled = !game.canBuyXp;

  el.heroAugs.innerHTML = hero.augments
    .map((card) => {
      const color = HD.AUGMENT_KIND_COLOR[card.augment.kind];
      const border = HD.RARITIES[card.rarity].color;
      return `<span class="aug" style="background:${color};box-shadow:0 0 0 1.5px ${border}">${card.augment.name}</span>`;
    })
    .join('');

  const skill = hero.skill;
  el.skill.hidden = skill === null;
  if (skill === null) el.gasSkillRow.hidden = true;
  if (skill) {
    // 마나 게이지 (TFT식) — 평타·피격으로 찬다
    const charged = Math.min(1, hero.mana / skill.manaMax);
    el.skill.classList.toggle('ready', game.canUseSkill);
    el.skillCd.style.transform = `scaleX(${charged.toFixed(3)})`;

    const damage = skill.damageMult > 0
      ? ` · 피해 ${Math.round(hero.stats.damage * skill.damageMult)}`
      : '';
    const targets = skill.targets > 0 ? ` · ${skill.targets}발` : '';
    const state = game.canUseSkill
      ? game.shouldAutoCastSkill ? '시전!' : '대기 중'
      : `마나 ${Math.floor(hero.mana)}/${Math.round(skill.manaMax)}`;
    el.skillText.textContent = `${skill.def.name}${damage}${targets} · ${state}`;

    el.gasSkillRow.hidden = false;
    el.gasSkillDmg.textContent = `스킬 피해 +8% · ${game.gasSkillCost('damage')}마정석 (${hero.gasSkillDamage})`;
    el.gasSkillDmg.disabled = !game.canBuyGasSkill('damage');
    el.gasSkillCdr.textContent = `필요 마나 -6% · ${game.gasSkillCost('cdr')}마정석 (${hero.gasSkillCdr})`;
    el.gasSkillCdr.disabled = !game.canBuyGasSkill('cdr');
  }

  const synergies = HD.activeSynergies(hero.augments);
  if (synergies.length) {
    el.heroAugs.innerHTML += synergies
      .map((s) => `<span class="syn">★ ${s.name}</span>`)
      .join('');
  }
}

function refreshAugmentOverlay(el: Elements, game: Game): void {
  if (game.augmentChoices.length === 0) {
    el.augOverlay.style.display = 'none';
    return;
  }
  el.augOverlay.style.display = 'flex';
  el.augSub.textContent =
    `영웅 Lv${game.hero.level} — 하나를 고르세요`;
  const left = HD.AUGMENT_REROLL_MAX - game.rerollsUsed;
  el.reroll.textContent =
    left > 0 ? `리롤 ${game.rerollCost}마정석 · ${left}회 남음 (보유 ${Math.floor(game.gas)})` : '리롤 소진';
  el.reroll.disabled = !game.canReroll;
  el.augCards.innerHTML = game.augmentChoices
    .map((card, i) => {
      const kindColor = HD.AUGMENT_KIND_COLOR[card.augment.kind];
      const kindLabel = HD.AUGMENT_KIND_LABEL[card.augment.kind];
      const rarity = HD.RARITIES[card.rarity];
      // 대가가 달린 증강은 한눈에 보여야 한다 — 설명의 '·' 뒤가 대가다
      const risk = HD.isRisky(card.augment) ? `<span class="risk">⚠ 대가</span>` : '';
      return `<button class="augcard" data-index="${i}" style="border-color:${rarity.color}">
        <div class="k">
          <span style="color:${kindColor}">${kindLabel}</span>
          ${risk}
          <span class="rar" style="color:${rarity.color}">${rarity.label}</span>
        </div>
        <div class="n">${card.augment.name}</div>
        <div class="d">${card.augment.description}</div>
      </button>`;
    })
    .join('');
}

export function refresh(el: Elements, game: Game): void {
  el.round.textContent = `R${Math.max(1, game.round)}`;
  el.timer.textContent = `${Math.ceil(game.roundTimer)}s`;
  el.mineral.textContent = String(Math.floor(game.mineral));
  el.gas.textContent = String(Math.floor(game.gas));
  el.lives.textContent = String(game.lives);
  el.kills.textContent = String(game.kills);

  const bossLabel = bossStateLabel(game);
  el.bossOpenSub.textContent = bossLabel;
  el.bossOpen.classList.toggle('ready', game.bossCooldown <= 0);
  el.bossOpen.disabled = !game.canSummonBossLevel(game.maxBossLevel);

  el.probe.textContent = `광부 ${game.probeCost} (${game.probes}/${B.PROBE_MAX})`;
  el.probe.disabled = game.probes >= B.PROBE_MAX || game.mineral < game.probeCost;

  el.spawn.textContent = `유닛 생성 ${game.spawnCost}`;
  el.spawn.disabled = game.mineral < game.spawnCost;

  el.sell.disabled = !game.selected?.tower;

  // 복제 장치 — 증강을 들었을 때만 보인다
  el.copyTower.hidden = !game.canCopyTower;
  if (game.canCopyTower) {
    const target = game.copyTarget;
    const selected = game.selected;
    if (target?.tower) {
      el.copyTower.textContent = `복제 예약됨: ${target.tower.def.name} (취소)`;
      el.copyTower.disabled = false;
    } else {
      el.copyTower.textContent = `복제 예약 (티어 ${game.copyTierCap}까지)`;
      el.copyTower.disabled = !selected || !game.canMarkCopy(selected);
    }
  }

  el.upgrades.forEach((button, i) => {
    const race = i as Race;
    const cost = game.upgradeCost(race);
    button.textContent = `${RACES[race]} +${game.upgrades[race]} · ${cost}마정석`;
    button.disabled = game.gas < cost;
  });

  refreshHero(el, game);
  refreshAugmentOverlay(el, game);
  refreshMissions(el, game);
  el.info.innerHTML = selectionInfo(game);
  el.message.textContent = game.message;

  el.score.textContent = game.score.toLocaleString('ko-KR');
  const nextRound = Math.max(1, game.round);
  el.scoreNext.textContent = `R${nextRound} 클리어 +${S.roundScore(nextRound).toLocaleString('ko-KR')}`;

  if (game.over && !submitted) {
    submitted = true;
    showHallOfFame(el, game);
  }
}

let submitted = false;

function showHallOfFame(el: Elements, game: Game): void {
  el.overlay.style.display = 'flex';
  el.overlayTitle.textContent = `${game.score.toLocaleString('ko-KR')}점`;
  el.overlayBody.textContent =
    `${game.round}라운드 · ${game.kills}킬 · 보스 Lv${game.bossCleared} · 영웅 Lv${game.hero.level}`;

  const mine: hallOfFame.Record = {
    score: game.score,
    round: game.round,
    kills: game.kills,
    heroLevel: game.hero.level,
    at: Date.now(),
  };
  const records = hallOfFame.submit(mine);
  const myRank = hallOfFame.rankOf(records, mine);

  const rows = records
    .map((r, i) => {
      const me = i + 1 === myRank ? ' class="me"' : '';
      return `<li${me}>
        <span class="rank">${i + 1}</span>
        <span>R${r.round} · ${r.kills}킬 · 영웅 Lv${r.heroLevel}</span>
        <span class="pts">${r.score.toLocaleString('ko-KR')}</span>
      </li>`;
    })
    .join('');

  el.hallOfFame.innerHTML = `<h3>명예의 전당${myRank ? ` — 이번 판 ${myRank}위` : ' — 순위권 밖'}</h3><ol>${rows}</ol>`;
}
