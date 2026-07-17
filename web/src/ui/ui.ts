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
  readonly bossGrid: HTMLElement;
  readonly bossState: HTMLElement;
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
    bossGrid: $('bossGrid'),
    bossState: $('bossState'),
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
  const total = damage(tower, game.upgrades);
  // 기본공과 강화(가스 업그레이드) 몫을 분리해 보여준다 (플레이테스트 2026-07-17 요청)
  const base = damage(tower, [0, 0, 0, 0]);
  const upLevel = game.upgrades[tower.def.race];
  const upText =
    upLevel > 0 ? ` <span class="chip">기본 ${base.toFixed(0)} + 강화Lv${upLevel} ${(total - base).toFixed(0)}</span>` : '';
  const dps = (total / attackInterval(tower)).toFixed(0);
  // F5 (unity-hud-playtest-v0.1) — 간격(초/회)이 아니라 초당 공격 횟수. 큰 값 = 빠른 공격.
  const rate = 1 / Math.max(0.01, attackInterval(tower));
  const rateText = rate >= 10 ? rate.toFixed(1) : rate.toFixed(2);
  return `
    <div class="name" style="color:${RACE_COLOR[tower.def.race]}">
      ${tower.def.name}
      <span class="chip">${TIER_LABEL[tower.tier]}</span>
      <span class="chip">【 ${tagLabel(tower.def)} 】</span>
    </div>
    <div class="dim">${RACES[tower.def.race]} · 공격력 ${total.toFixed(0)}${upText} · 공속 ${rateText}회/초
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
  el.buyXp.textContent = `[E] XP +${HD.XP_BUY_AMOUNT} (${HD.XP_BUY_GOLD}금화)`;
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

// F1 (unity-hud-playtest-v0.1) — 증강 오클릭 방지: 새 선택 화면마다 1초 입력 잠금.
// XP 연타 중 카드가 포인터 밑에 나타나 같은 클릭 흐름에 눌리는 사고를 막는다.
// 리롤(rerollsUsed 증가)로 바뀐 선택지는 의도된 클릭이라 잠그지 않는다.
const AUGMENT_LOCK_MS = 1000;
let augLockUntil = 0;
let lastAugChoices: unknown = null;
let lastRerollsUsed = 0;

/** 잠금 중인가 — 카드·리롤 클릭 핸들러가 재검사한다 */
export function augmentInputLocked(): boolean {
  return performance.now() < augLockUntil;
}

function refreshAugmentOverlay(el: Elements, game: Game): void {
  if (game.augmentChoices.length === 0) {
    el.augOverlay.style.display = 'none';
    return;
  }
  if (game.augmentChoices !== lastAugChoices) {
    const byReroll = game.rerollsUsed > lastRerollsUsed;
    if (!byReroll) augLockUntil = performance.now() + AUGMENT_LOCK_MS;
    lastAugChoices = game.augmentChoices;
  }
  lastRerollsUsed = game.rerollsUsed;
  const locked = augmentInputLocked();

  el.augOverlay.style.display = 'flex';
  el.augSub.textContent =
    `영웅 Lv${game.hero.level} — 하나를 고르세요`;
  const left = HD.AUGMENT_REROLL_MAX - game.rerollsUsed;
  el.reroll.textContent =
    left > 0 ? `리롤 ${game.rerollCost}마정석 · ${left}회 남음 (보유 ${Math.floor(game.gas)})` : '리롤 소진';
  el.reroll.disabled = !game.canReroll || locked;
  // 매 프레임 innerHTML 금지 — 노드 교체가 클릭을 유실시킨다 (보스 소환대와 같은 함정)
  const augHtml = game.augmentChoices
    .map((card, i) => {
      const kindColor = HD.AUGMENT_KIND_COLOR[card.augment.kind];
      const kindLabel = HD.AUGMENT_KIND_LABEL[card.augment.kind];
      const rarity = HD.RARITIES[card.rarity];
      // 대가가 달린 증강은 한눈에 보여야 한다 — 설명의 '·' 뒤가 대가다
      const risk = HD.isRisky(card.augment) ? `<span class="risk">⚠ 대가</span>` : '';
      // 설명 수치는 실버 기준이다 — 등급이 효과를 키우는 걸 배지로 알린다
      // (플레이테스트 2026-07-17: "실버·골드 속사의 공속 증가가 같아 보인다")
      const power = rarity.power > 1 ? ` <b>효과 ×${rarity.power}</b>` : '';
      const lockStyle = locked ? ';opacity:.45;pointer-events:none' : '';
      return `<button class="augcard" data-index="${i}" style="border-color:${rarity.color}${lockStyle}">
        <div class="k">
          <span style="color:${kindColor}">${kindLabel}</span>
          ${risk}
          <span class="rar" style="color:${rarity.color}">${rarity.label}${power}</span>
        </div>
        <div class="n">${card.augment.name}</div>
        <div class="d">${card.augment.description}</div>
      </button>`;
    })
    .join('');
  if (el.augCards.dataset.html !== augHtml) {
    el.augCards.innerHTML = augHtml;
    el.augCards.dataset.html = augHtml;
  }
}

export function refresh(el: Elements, game: Game): void {
  el.round.textContent = `R${Math.max(1, game.round)}`;
  el.timer.textContent = `${Math.ceil(game.roundTimer)}s`;
  el.mineral.textContent = String(Math.floor(game.mineral));
  el.gas.textContent = String(Math.floor(game.gas));
  el.lives.textContent = String(game.lives);
  el.kills.textContent = String(game.kills);

  // 보스 소환대 — 레벨별 버튼 (2026-07-17): 어느 단을 부를지가 리스크 선택이다.
  // 낮은 레벨은 안전한 파밍, 높은 레벨은 실패 시 쿨타임 동안 보상 없음.
  //
  // 주의: innerHTML을 매 프레임 갈면 press→release 사이에 버튼 노드가 교체되어
  // 클릭이 유실된다 (플레이테스트 "눌러도 소환 안 됨"의 원인). 내용이 바뀔 때만 간다.
  el.bossState.textContent = bossStateLabel(game);
  const cdText = game.bossCooldown > 0 ? `쿨 ${Math.ceil(game.bossCooldown)}s` : null;
  const bossHtml = Array.from({ length: B.BOSS_MAX_LEVEL }, (_, i) => i + 1)
    .map((level) => {
      const open = level <= game.maxBossLevel;
      const can = game.canSummonBossLevel(level);
      const cls = `bossbtn${can ? ' ready' : ''}${open && level === game.maxBossLevel ? ' top' : ''}`;
      const sub = !open ? '잠김' : cdText ?? `+${bossKillMineral(level)}`;
      return `<button class="${cls}" data-level="${level}" ${can ? '' : 'disabled'}
        title="${open ? `Lv${level} 적장 소환 · 처치 보상 +${bossKillMineral(level)} 금화` : `Lv${level - 1}을 처치하면 해금됩니다`}">Lv${level}\n${sub}</button>`;
    })
    .join('');
  if (el.bossGrid.dataset.html !== bossHtml) {
    el.bossGrid.innerHTML = bossHtml;
    el.bossGrid.dataset.html = bossHtml;
  }

  // 효과를 버튼에 직접 적는다 — "사면 뭐가 좋아지는가"가 가격 옆에 보여야 한다 (2026-07-17)
  el.probe.textContent =
    `[R] 광부 ${game.probeCost} — 초당 마정석 +${B.GAS_PER_PROBE_SECOND} (${game.probes}/${B.PROBE_MAX})`;
  el.probe.title =
    `광부 1기당 초당 마정석 +${B.GAS_PER_PROBE_SECOND}. 살수록 비싸진다 (현재 ${game.probes}기 = 초당 +${(game.probes * B.GAS_PER_PROBE_SECOND).toFixed(2)}).`;
  el.probe.disabled = game.probes >= B.PROBE_MAX || game.mineral < game.probeCost;

  el.spawn.textContent = `[P] 유닛 생성 ${game.spawnCost}`;
  el.spawn.disabled = game.mineral < game.spawnCost;

  el.sell.textContent = '[X] 유닛 처분';
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
    button.textContent = `[${race + 1}] ${RACES[race]} Lv${game.upgrades[race]} · ${cost}마정석`;
    button.title =
      `${RACES[race]} 계열 강화 Lv${game.upgrades[race] + 1} — 기본 공격력의 +${B.UPGRADE_DAMAGE_PER_LEVEL * 100}%p 가산.`;
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
