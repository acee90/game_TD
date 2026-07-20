// ───────── 순수 뷰 빌더 ─────────
// 게임 상태 → HTML/문자열. DOM을 만지지 않는다 (Svelte가 {@html}로 꽂는다).
// 원본 web/src/ui/ui.ts의 문자열 생성 로직을 그대로 이식 — 표시 규칙을 한곳에 모은다.
import * as B from '../data/balance';
import { GOD_TIER, RACES, RACE_COLOR, TIER_LABEL, tagLabel, type Race } from '../data/units';
import { attackInterval, damage, range } from '../game/combat';
import { bossKillMineral, nextMilestone } from '../game/economy';
import * as HD from '../data/hero';
import { SKILLS, isStarterSkill, type SkillRole } from '../data/skills';
import type { Game } from '../game/game';
import type * as hallOfFame from '../ui/hall-of-fame';

export function bossStateLabel(game: Game): string {
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

export function selectionInfoHtml(game: Game): string {
  if (game.selectedEnemy) return enemyInfo(game);

  const tower = game.selected?.tower;
  if (!tower) {
    return '<span class="dim">빈 타일 = 유닛 생성 · 유닛 타일 = 정보 · 몹/보스 클릭 = 스탯. 같은 유닛 2기가 모이면 자동 조합됩니다.</span>';
  }
  const total = damage(tower, game.upgrades);
  // 공격력은 합계가 주인공, 분해는 칩+호버로 (플레이테스트 2026-07-17 2차: 가독성)
  const base = damage(tower, [0, 0, 0, 0]);
  const upLevel = game.upgrades[tower.def.race];
  const upText =
    upLevel > 0
      ? ` <span class="chip" title="기본 ${base.toFixed(0)} + 강화 ${(total - base).toFixed(0)}">강화 Lv${upLevel}</span>`
      : '';
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
    <div class="dim">${RACES[tower.def.race]} · 공격력 <b>${total.toFixed(0)}</b>${upText} · 공속 ${rateText}회/초
      · DPS ${dps} · 사거리 ${range(tower).toFixed(0)}</div>`;
}

/** 보스 소환대 — 레벨별 버튼 HTML. 내용이 바뀔 때만 DOM에 반영하도록 Svelte가 관리한다. */
export function bossGridHtml(game: Game): string {
  const cdText = game.bossCooldown > 0 ? `쿨 ${Math.ceil(game.bossCooldown)}s` : null;
  return Array.from({ length: B.BOSS_MAX_LEVEL }, (_, i) => i + 1)
    .map((level) => {
      const open = level <= game.maxBossLevel;
      const can = game.canSummonBossLevel(level);
      const cls = `bossbtn${can ? ' ready' : ''}${open && level === game.maxBossLevel ? ' top' : ''}`;
      const sub = !open ? '잠김' : cdText ?? `+${bossKillMineral(level)}`;
      return `<button class="${cls}" data-level="${level}" ${can ? '' : 'disabled'}
        title="${open ? `Lv${level} 적장 소환 · 처치 보상 +${bossKillMineral(level)} 금화` : `Lv${level - 1}을 처치하면 해금됩니다`}">Lv${level}\n${sub}</button>`;
    })
    .join('');
}

/** 보스 처치 보상 라인 (미션 패널) */
export function bossRewardHtml(game: Game): string {
  const levels = Array.from({ length: B.BOSS_MAX_LEVEL }, (_, i) => i + 1);
  return levels
    .map((level) => {
      const open = level <= game.maxBossLevel;
      const text = `Lv${level} +${bossKillMineral(level)}`;
      return open ? `<b style="color:var(--gold)">${text}</b>` : `<span class="dim">${text}</span>`;
    })
    .join(' · ');
}

/** 미션 패널의 스칼라 값 — 바 너비와 텍스트 */
export interface MissionView {
  readonly repeatWidth: number;
  readonly repeatText: string;
  readonly milestoneWidth: number;
  readonly milestoneText: string;
}

export function missionView(game: Game): MissionView {
  const remaining = Math.max(0, game.roundTimer);
  const nextType = B.waveTypeOf(Math.max(1, game.round) + 1);
  const notice = nextType.id === 'normal' ? '' : ` · 다음: ${nextType.label}!`;
  const repeatText =
    `R${Math.max(1, game.round)} 클리어 → +${B.waveReward(Math.max(1, game.round))}${notice}`;

  const milestone = nextMilestone(game.kills);
  let milestoneWidth = 100;
  let milestoneText = '전부 달성';
  if (milestone) {
    const previous = milestone.kills - 200;
    const span = milestone.kills - Math.max(0, previous);
    const done = game.kills - Math.max(0, previous);
    milestoneWidth = Math.min(100, (done / span) * 100);
    milestoneText = `${game.kills}/${milestone.kills} → +${milestone.reward}`;
  }

  return {
    repeatWidth: (1 - remaining / B.ROUND_SECONDS) * 100,
    repeatText,
    milestoneWidth,
    milestoneText,
  };
}

/** 영웅 스탯 요약 텍스트 */
export function heroStatsText(game: Game): string {
  const hero = game.hero;
  const stats = hero.stats;
  const dps = (stats.damage / stats.attackInterval).toFixed(0);
  // 타워 선택 정보(selectionInfoHtml)와 동일한 표기 — 간격(초/회)이 아니라 초당 공격 횟수
  const rate = 1 / Math.max(0.01, stats.attackInterval);
  const rateText = rate >= 10 ? rate.toFixed(1) : rate.toFixed(2);
  const parts = [
    `공격력 ${stats.damage}`,
    `공속 ${rateText}회/초`,
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
  return parts.join(' · ');
}

/** 영웅 증강 칩 + 활성 시너지 HTML */
export function heroAugsHtml(game: Game): string {
  const hero = game.hero;
  let html = hero.augments
    .map((card) => {
      const color = HD.displayKindColor(card.augment);
      const rarity = HD.RARITIES[card.rarity];
      // 다시보기 (6차 편의성) — 호버하면 등급·설명이 뜬다
      const tip = `${rarity.label}${rarity.power > 1 ? ` ×${rarity.power}` : ''} — ${card.augment.description}`;
      return `<span class="aug" title="${tip.replace(/"/g, '&quot;')}" style="background:${color};box-shadow:0 0 0 1.5px ${rarity.color}">${card.augment.name}</span>`;
    })
    .join('');

  const synergies = HD.activeSynergies(hero.augments);
  if (synergies.length) {
    html += synergies.map((s) => `<span class="syn">★ ${s.name}</span>`).join('');
  }
  return html;
}

interface AugmentGroup {
  readonly key: string;
  readonly card: HD.AugmentCard;
  readonly count: number;
}

/** 같은 (증강, 등급)은 ×N으로 접는다 — 획득 순서는 첫 등장 기준 */
function augmentGroups(game: Game): AugmentGroup[] {
  const groups: { card: HD.AugmentCard; count: number }[] = [];
  for (const card of game.hero.augments) {
    const at = groups.findIndex(
      (g) => g.card.augment.id === card.augment.id && g.card.rarity === card.rarity,
    );
    if (at >= 0) groups[at].count++;
    else groups.push({ card, count: 1 });
  }
  return groups.map((g) => ({ key: `${g.card.augment.id}:${g.card.rarity}`, ...g }));
}

/**
 * 증강 기록 패널 (영웅 패널 아래 인라인, 2026-07-18) — 고른 증강을 언제든 다시 본다.
 * 이름 + 짧은 설명은 항상 보이고, 클릭하면 등급이 반영된 **실제 누적 수치**를 펼쳐 보여준다
 * ("실버 기준 설명"과 실제 효과가 등급·중첩에 따라 달라지는 혼란을 없앤다).
 */
export function augmentPanelHtml(game: Game, openKeys: ReadonlySet<string>): string {
  const hero = game.hero;
  if (hero.augments.length === 0) {
    return '<p class="dim">아직 획득한 증강이 없습니다.</p>';
  }
  const groups = augmentGroups(game);

  const synergies = HD.activeSynergies(hero.augments);
  const synLine = synergies.length
    ? `<div class="logsyn">${synergies
        .map((sy) => `<span class="syn" title="${sy.description}">★ ${sy.name}</span>`)
        .join(' ')}</div>`
    : '<p class="dim">활성 시너지 없음 — 같은 계열 3장이면 특화가 켜집니다.</p>';

  return (
    synLine +
    groups
      .map(({ key, card, count }) => {
        const rarity = HD.RARITIES[card.rarity];
        const kindColor = HD.displayKindColor(card.augment);
        const open = openKeys.has(key);
        const actual = HD.effectSummary(card.effect);
        const detail =
          open && actual
            ? `<div style="color:${rarity.color}">→ 실제: ${actual}${count > 1 ? ` (×${count}장 가산)` : ''}</div>`
            : '';
        const hint = actual ? `<span class="loghint dim">${open ? '▾ 접기' : '▸ 실제 수치'}</span>` : '';
        return `<div class="logrow" role="button" tabindex="0" data-key="${key}" style="border-left-color:${rarity.color}">
          <div class="logname">
            <span style="color:${kindColor}">${HD.displayKindLabel(card.augment)}</span>
            <b>${card.augment.name}</b>
            ${count > 1 ? `<span class="chip">×${count}</span>` : ''}
            <span class="rar" style="color:${rarity.color}">${rarity.label}</span>
          </div>
          <div class="dim">${card.augment.description}${hint}</div>
          ${detail}
        </div>`;
      })
      .join('')
  );
}

/** 증강 선택 카드 HTML (입력 잠금 상태 반영) */
export function augmentCardsHtml(game: Game, locked: boolean): string {
  return game.augmentChoices
    .map((card, i) => {
      const kindColor = HD.displayKindColor(card.augment);
      const kindLabel = HD.displayKindLabel(card.augment);
      const rarity = HD.RARITIES[card.rarity];
      // 대가가 달린 증강은 한눈에 보여야 한다 — 설명의 '·' 뒤가 대가다
      const risk = HD.isRisky(card.augment) ? `<span class="risk">⚠ 대가</span>` : '';
      // 설명 수치는 실버 기준이다 — 등급이 효과를 키우는 걸 배지로 알린다
      // 등급 배지는 **실제로 커지는 증강에만** 붙인다 — 스킬 개조는 등급을 안 탄다
      const scales = HD.rarityScales(card.augment);
      const power = scales && rarity.power > 1 ? ` <b>효과 ×${rarity.power}</b>` : '';
      const actual = scales && rarity.power > 1 ? HD.effectSummary(card.effect) : '';
      const actualLine = actual
        ? `<div class="d" style="color:${rarity.color}">→ 실제: ${actual}</div>`
        : '';
      const lockStyle = locked ? ';opacity:.45;pointer-events:none' : '';
      return `<button class="augcard" data-index="${i}" style="border-color:${rarity.color}${lockStyle}">
        <div class="k">
          <span style="color:${kindColor}">${kindLabel}</span>
          ${risk}
          <span class="rar" style="color:${rarity.color}">${rarity.label}${power}</span>
        </div>
        <div class="n">${card.augment.name}</div>
        <div class="d">${card.augment.description}</div>
        ${actualLine}
      </button>`;
    })
    .join('');
}

/**
 * Lv9 스킬 드래프트 카드 HTML — 증강이 아니라 **액티브 스킬**을 고르는 화면.
 *
 * 성향(role)을 앞세운다: 지금 보드가 잡몹을 놓치는지 보스를 못 녹이는지에 따라
 * 무엇을 골라야 하는지가 갈리기 때문이다. 카드마다 리롤 배지가 붙는데,
 * **버튼 안의 버튼은 무효 HTML**이라 span으로 두고 클릭은 오버레이가 가려낸다.
 */
export function skillChoiceCardsHtml(game: Game, locked: boolean): string {
  return game.skillChoices
    .map((id, i) => {
      const def = SKILLS[id];
      const role = SKILL_ROLE_LABEL[def.role];
      const used = !game.canRerollSkillChoice(i);
      const badgeStyle = locked || used ? 'opacity:.45' : 'cursor:pointer';
      const lockStyle = locked ? ';opacity:.45;pointer-events:none' : '';
      return `<button class="augcard" data-index="${i}" style="border-color:${role.color}${lockStyle}">
        <div class="k"><span style="color:${role.color}">${role.label}</span></div>
        <div class="n">${def.name}</div>
        <div class="d">${def.description}</div>
        <div class="d">필요 마나 ${def.manaMax}</div>
        <span class="cardReroll" data-reroll="${i}" style="${badgeStyle}">${
          used ? '⟳ 사용함' : '⟳ 이 카드만 다시'
        }</span>
      </button>`;
    })
    .join('');
}

/** 성향 표시 — 무엇을 구제하는 스킬인지 한눈에 */
export const SKILL_ROLE_LABEL: Record<SkillRole, { label: string; color: string }> = {
  mob: { label: '잡몹 처리', color: '#6fdc8c' },
  boss: { label: '보스 특화', color: '#ff8a3c' },
  utility: { label: '유틸', color: '#7ce7ff' },
};

/** 명예의 전당 목록 HTML */
export function hallOfFameHtml(records: readonly hallOfFame.Record[], myRank: number | null): string {
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
  return `<h3>명예의 전당${myRank ? ` — 이번 판 ${myRank}위` : ' — 순위권 밖'}</h3><ol>${rows}</ol>`;
}

/** GOD 리롤 버튼이 보일 조건 */
export function isGodSelected(game: Game): boolean {
  return game.selected?.tower?.tier === GOD_TIER;
}

/**
 * 스킬 리롤 툴팁 — 왜 지금 못 누르는지가 버튼에서 읽혀야 한다.
 * 스킬은 판이 낸 문제에 대한 답이라, 못 고르는 이유를 모르면 선택이 성립하지 않는다.
 */
export function skillRerollTitle(game: Game): string {
  const held = `지금 든 스킬: ${game.hero.skill.def.name}`;
  if (isStarterSkill(game.hero.skillId)) {
    return `${held} — 영웅 Lv${HD.SKILL_DRAFT_LEVEL}에 첫 스킬을 고른 뒤부터 다시 뽑을 수 있습니다.`;
  }
  if (game.skillRerollUsedThisRound) return `${held} — 스킬 리롤은 라운드당 한 번입니다.`;
  if (game.beam !== null) return `${held} — 레이저가 나가는 중에는 바꿀 수 없습니다.`;
  const cost = game.skillRerollCost;
  if (game.mineral < cost) return `${held} — 금화 ${cost} 필요.`;
  return `${held}. 지금과 다른 스킬로 반드시 바뀝니다 (라운드당 1회).`;
}

/** 업그레이드 버튼 라벨 · 툴팁 (병과별) */
export function upgradeLabel(game: Game, race: Race): { text: string; title: string; disabled: boolean } {
  const cost = game.upgradeCost(race);
  // 병과 이름 / 현재 레벨 / 필요 마정석을 줄바꿈으로 분리 — 한 줄로 밀어 넣으면
  // 좁은 c4 버튼에서 줄바꿈 위치가 들쭉날쭉해 가독성이 떨어졌다.
  return {
    text: `[${race + 1}] ${RACES[race]}\nLv${game.upgrades[race]}\n${cost}마정석`,
    title: `${RACES[race]} 계열 강화 Lv${game.upgrades[race] + 1} — 기본 공격력의 +${B.UPGRADE_DAMAGE_PER_LEVEL * 100}%p 가산.`,
    disabled: game.gas < cost,
  };
}
