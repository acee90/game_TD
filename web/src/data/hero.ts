import type { SkillId, SkillModPatch } from './skills';

// ───────── 영웅 · 제단 · 증강 ─────────
// 원본 갓타디에는 없는 신규 설계다. 근거 표기 대상이 아니다.
//
// 영웅은 몹과 같은 경로 위에서만 움직인다. 타워 타일을 넘어다닐 수 없다.
// 대신 몹은 영웅을 보면 진행을 멈추고 영웅부터 처치한 뒤 지나간다.
// 그래서 영웅은 딜러이자 **어그로 블로커**다 — 몹을 한곳에 모으고 시간을 번다.

/** 제단은 게임 시작과 함께 주어진다. 십자 중앙 타일을 차지한다. (core/map.ts SLOT_POS[0]) */
export const ALTAR_SLOT = 0;

// ── 파워 커브 (2026-07-11 2안 개편) ──
// 영웅 파워 = 스탯(레벨업 택1이 적립, XP는 골드 구매+킬) × 증강 배수(선택).
// 두 축뿐이다 — 레벨 배수는 폐지됐다. 초반 영웅은 Lv1 타워 몇 기 수준에서 시작한다.

export const HERO_BASE_RANGE = 130;
export const HERO_ATTACK_INTERVAL = 0.8;
export const HERO_SPEED = 88;
/** 이 거리 안이면 도착으로 본다 (경로 위 거리 기준) */
export const HERO_ARRIVE_EPSILON = 2;
export const HERO_RADIUS = 11;

// ───────── 스탯 — 레벨업마다 고른다 (2026-07-11 2안 개편) ─────────
// 힘: 기본 공격력과 체력.  민첩: 공격 속도.  지능: 스킬 피해.
//
// 이전에는 골드로 스탯을 직접 사고 XP는 킬에서 공짜로 왔다 — 레벨 배수(×2.4/레벨)가
// 골드 없이 올라 영웅 파워커브가 과속했다(명세 §12 0.5, Lv17 DPS 985).
// 이제 골드 → XP → 레벨업 → 힘/민/지 택1(focus) 한 축이다. 레벨 배수는 폐지.
// 파워는 전부 골드 비용을 가지므로 income-curve.csv에서 타워와 같은 저울에 오른다.
export type StatId = 'str' | 'agi' | 'int';
export const STAT_IDS: readonly StatId[] = ['str', 'agi', 'int'];
export const STAT_LABEL: Record<StatId, string> = { str: '힘', agi: '민첩', int: '지능' };

export const HERO_BASE_STR = 2;
export const HERO_BASE_AGI = 8;
export const HERO_BASE_INT = 8;

/** 힘 1당 공격력 — 레벨 배수 폐지의 보상으로 1 → 6 재척도 [프로토] */
export const DMG_PER_STR = 6;
/** 힘 1당 최대 체력 — 같은 이유로 18 → 70 [프로토] */
export const HP_PER_STR = 70;
/** 민첩 1당 공격 속도 +4% */
export const AS_PER_AGI = 0.04;
/** 공격 간격 하한 — 민첩을 아무리 골라도 이 밑으로는 안 내려간다 */
export const MIN_ATTACK_INTERVAL = 0.25;
/** 지능 1당 스킬 피해 +3.5% */
export const SKILL_PER_INT = 0.035;

/** 레벨업이 focus 스탯에 주는 포인트 — 후반 레벨일수록 굵게 */
export const levelStatPoints = (level: number): number => 2 + Math.floor(level / 10);

/** XP 골드 구매 (TFT식) — 1골드 = 1XP, 버튼 한 번에 20 */
export const XP_BUY_GOLD = 20;
export const XP_BUY_AMOUNT = 20;

/**
 * 다음 레벨까지 필요한 경험치. **지수**다.
 *
 * 선형(14 + 1.5×레벨)일 때는 영웅이 64레벨까지 올라갔다. 영웅 공격력이 레벨당 ×1.16이라
 * 레벨이 두 배면 파워가 수십 배가 되는데, 레벨 자체에 제동이 없으니 후반이 무의미하게
 * 부풀었다. 지수 비용은 고레벨을 실질적으로 봉인한다 — 50레벨 비용이 선형의 세 배다.
 *
 * 1.06이면 30레벨이 R30~35에 오는 창을 지키면서(막타 30%, 보스 2라운드마다) 최고 레벨이
 * R86에 47쯤에서 멎는다. tests/hero-curve.test.ts가 이 창을 지킨다.
 */
export const XP_BASE_COST = 14;
export const XP_COST_GROWTH = 1.06;
export const xpToNext = (level: number): number =>
  Math.round(XP_BASE_COST * Math.pow(XP_COST_GROWTH, level));

/**
 * 킬 XP는 부축이다 (0.65 → 0.3, 2026-07-11 2안 개편) — 주 연료는 골드 구매(XP_BUY_GOLD).
 * 레벨 속도 목표: R45(성장 정지)에 Lv 25~30, 라운드당 ~0.6레벨.
 */
export const XP_PER_MOB = 0.3;
export const HERO_LASTHIT_XP_MULT = 2;
export const xpPerBoss = (level: number): number => 8 * level;

/** 부활 대기시간. 죽으면 그동안 영웅 딜이 빠지는 것 자체가 패널티다. */
export const HERO_RESPAWN_SECONDS = 12;

/** 이 거리 안에 영웅이 보이면 몹이 멈춰서 영웅부터 친다 */
export const HERO_AGGRO_RANGE = 110;
/** 이만큼 붙으면 실제로 때린다 */
export const ENEMY_TOUCH_RANGE = 22;
export const ENEMY_ATTACK_INTERVAL = 1;

/**
 * 몹 공격력. 영웅 체력이 선형이므로 이쪽도 선형이다.
 *
 * 지수로 두면(4 × 1.12^r) 선형 체력의 영웅이 후반에 즉사한다. 둘을 나란히 선형으로 두면
 * "몹 10기를 막을 수 있는 시간"이 라운드 내내 완만하게만 줄어들고, 그 시간을 늘리는 건
 * 오직 탱커 증강이다 — 그래서 탱킹이 빌드 선택이 된다.
 */
export const ENEMY_DAMAGE_BASE = 4;
export const ENEMY_DAMAGE_PER_ROUND = 1.6;
export const enemyDamage = (round: number): number =>
  ENEMY_DAMAGE_BASE + ENEMY_DAMAGE_PER_ROUND * round;

/**
 * 보스 접촉 피해.
 *
 * **Lv3까지는 영웅·허수아비를 공격하지 않고 그냥 지나간다** (플레이테스트 2026-07-11:
 * 저레벨 보스는 "소환하면 얻는 소득"이고, 위협은 못 잡았을 때의 누출 라이프(2+L)만으로
 * 충분하다). Lv4부터는 잡몹 여러 기 몫으로 때린다 — 고레벨 소환의 대가.
 */
export const BOSS_HARMLESS_MAX_LEVEL = 3;
export const bossDamage = (level: number, round: number): number =>
  level <= BOSS_HARMLESS_MAX_LEVEL ? 0 : enemyDamage(round) * (1.5 + 0.5 * level);

/**
 * 증강을 받는 영웅 레벨.
 *
 * 10레벨 고정 간격이면 증강이 게임 앞쪽에 몰린다. 측정해 보니 3번째 증강이 진행률 47%,
 * 4번째가 61%에 왔고 median 4개에서 멈췄다. 뒤쪽 40%가 아무 선택 없는 구간이 됐다.
 *
 * 그래서 레벨 간격을 벌려가며 게임 전체에 고르게 뿌린다. 80/20 기준으로,
 * **앞의 네 개는 80% 이상의 판이 받고**(핵심 빌드가 완성된다), 뒤의 두 개는 오래 버틴
 * 판만 받는 보상이다. 소진 후에는 AUGMENT_TAIL_EVERY 레벨마다 계속 준다.
 */
export const AUGMENT_LEVELS: readonly number[] = [9, 16, 24, 30, 35, 42];
export const AUGMENT_TAIL_EVERY = 8;
export const AUGMENT_CHOICES = 3;

/** 이 레벨에 도달하면 증강을 받는가 */
export function grantsAugment(level: number): boolean {
  if (AUGMENT_LEVELS.includes(level)) return true;
  const last = AUGMENT_LEVELS[AUGMENT_LEVELS.length - 1];
  return level > last && (level - last) % AUGMENT_TAIL_EVERY === 0;
}

/** `level`까지 올렸을 때 받은 증강 개수 */
export function augmentsByLevel(level: number): number {
  let count = 0;
  for (let l = 2; l <= level; l++) if (grantsAugment(l)) count++;
  return count;
}

export type AugmentKind = 'tank' | 'ranged' | 'mage' | 'stat' | 'utility';

export const AUGMENT_KIND_LABEL: Record<AugmentKind, string> = {
  tank: '탱커',
  ranged: '원거리',
  mage: '마법사',
  stat: '스탯',
  utility: '그 외',
};

export const AUGMENT_KIND_COLOR: Record<AugmentKind, string> = {
  tank: '#6fdc8c',
  ranged: '#4ea3ff',
  mage: '#c065e0',
  stat: '#ffd23f',
  utility: '#ff8a3c',
};

/** 증강이 영웅·게임에 곱하거나 더하는 값들 */
export interface AugmentEffect {
  readonly hpMult?: number;
  readonly damageMult?: number;
  readonly rangeMult?: number;
  readonly attackSpeedMult?: number;
  readonly moveSpeedMult?: number;
  /** 초당 체력 재생 */
  readonly regen?: number;
  /** 받는 피해 감소 비율 (0.15 = 15% 감소) */
  readonly damageReduction?: number;
  /** 광역 스킬을 켠다 — 이 반경의 적 전체를 때린다 */
  readonly splashRadius?: number;
  /** 처치당 추가 미네랄 */
  readonly mineralPerKill?: number;
  /** 부활 대기시간 감소(초) */
  readonly respawnCut?: number;
  /** 모든 타워 공격력 배수 */
  readonly towerDamageMult?: number;
}

export interface Augment {
  readonly id: string;
  readonly kind: AugmentKind;
  readonly name: string;
  readonly description: string;
  /** 같은 증강을 몇 번까지 쌓을 수 있나 */
  readonly maxStacks: number;
  readonly effect: AugmentEffect;
  /** 이 증강을 고르면 액티브 스킬을 얻는다 (스킬이 없을 때만 등장) */
  readonly grantsSkill?: SkillId;
  /** 스킬을 개조한다 */
  readonly skillMod?: SkillModPatch;
  /** 이 스킬을 든 영웅에게만 등장한다 */
  readonly requiresSkill?: SkillId | 'any';
}

// ───────── 등급 ─────────
// 증강 카드마다 등급이 무작위로 붙는다. 등급이 높으면 효과가 커지는 대신
// 등급은 뽑기 운이다 — 대가는 없다. 높은 등급이 뜬 순간이 그 판의 도파민이다.

export type Rarity = 'silver' | 'gold' | 'platinum';

export interface RarityDef {
  readonly label: string;
  readonly color: string;
  /** 증강 효과의 배수. 1보다 큰 부분만 증폭한다(예: 1.3배 → 1.6배). */
  readonly power: number;
  /** 뽑기 가중치 */
  readonly weight: number;
}

export const RARITIES: Record<Rarity, RarityDef> = {
  silver: { label: '실버', color: '#9aa2c0', power: 1, weight: 55 },
  gold: { label: '골드', color: '#ffd23f', power: 2, weight: 33 },
  platinum: { label: '플래티넘', color: '#7ce7ff', power: 3.5, weight: 12 },
};

export const RARITY_ORDER: readonly Rarity[] = ['silver', 'gold', 'platinum'];

/** 가중치에 따라 등급 하나를 뽑는다 */
export function rollRarity(rand: () => number): Rarity {
  const total = RARITY_ORDER.reduce((sum, r) => sum + RARITIES[r].weight, 0);
  let roll = rand() * total;
  for (const rarity of RARITY_ORDER) {
    roll -= RARITIES[rarity].weight;
    if (roll < 0) return rarity;
  }
  return 'silver';
}

/**
 * 등급에 따라 효과를 키운다.
 * 배수형(1.3 → 1.51)은 1을 넘는 부분만, 가산형(regen 6 → 10)은 값 자체를 키운다.
 * 피해 감소는 100%에 닿지 않게 상한을 둔다.
 */
export function scaleEffect(effect: AugmentEffect, power: number): AugmentEffect {
  if (power === 1) return effect;
  const mult = (v: number | undefined) => (v === undefined ? undefined : 1 + (v - 1) * power);
  const add = (v: number | undefined) => (v === undefined ? undefined : v * power);
  return {
    hpMult: mult(effect.hpMult),
    damageMult: mult(effect.damageMult),
    rangeMult: mult(effect.rangeMult),
    attackSpeedMult: mult(effect.attackSpeedMult),
    moveSpeedMult: mult(effect.moveSpeedMult),
    towerDamageMult: mult(effect.towerDamageMult),
    regen: add(effect.regen),
    splashRadius: add(effect.splashRadius),
    mineralPerKill: effect.mineralPerKill === undefined ? undefined : Math.round(add(effect.mineralPerKill)!),
    respawnCut: add(effect.respawnCut),
    damageReduction:
      effect.damageReduction === undefined
        ? undefined
        : Math.min(0.6, effect.damageReduction * power),
  };
}

/** 등급이 매겨진 증강 카드 */
export interface AugmentCard {
  readonly augment: Augment;
  readonly rarity: Rarity;
  /** 등급이 반영된 최종 효과 */
  readonly effect: AugmentEffect;
}

export const makeCard = (augment: Augment, rarity: Rarity): AugmentCard => ({
  augment,
  rarity,
  effect: scaleEffect(augment.effect, RARITIES[rarity].power),
});

export const AUGMENTS: readonly Augment[] = [
  // ── 탱커
  { id: 'bulwark', kind: 'tank', name: '방벽', description: '최대 체력 +40%', maxStacks: 3,
    effect: { hpMult: 1.4 } },
  { id: 'plating', kind: 'tank', name: '중장갑', description: '받는 피해 20% 감소', maxStacks: 2,
    effect: { damageReduction: 0.2 } },
  { id: 'regen', kind: 'tank', name: '재생', description: '초당 체력 6 회복', maxStacks: 3,
    effect: { regen: 6 } },

  // ── 원거리
  { id: 'longbow', kind: 'ranged', name: '장궁', description: '사거리 +35%', maxStacks: 3,
    effect: { rangeMult: 1.35 } },
  { id: 'rapid', kind: 'ranged', name: '속사', description: '공격 속도 +35%', maxStacks: 3,
    effect: { attackSpeedMult: 1.35 } },
  { id: 'marksman', kind: 'ranged', name: '명사수', description: '공격력 +30%, 사거리 +10%', maxStacks: 3,
    effect: { damageMult: 1.3, rangeMult: 1.1 } },

  // ── 마법사 (범위 스킬)
  { id: 'novasmall', kind: 'mage', name: '충격파', description: '공격이 반경 45의 광역이 된다', maxStacks: 1,
    effect: { splashRadius: 45 } },
  { id: 'novabig', kind: 'mage', name: '대폭발', description: '광역 반경 +40 (충격파 필요)', maxStacks: 2,
    effect: { splashRadius: 40 } },
  { id: 'arcane', kind: 'mage', name: '비전 집중', description: '공격력 +25%, 공격 속도 +15%', maxStacks: 3,
    effect: { damageMult: 1.25, attackSpeedMult: 1.15 } },

  // ── 스탯
  { id: 'vigor', kind: 'stat', name: '활력', description: '최대 체력 +20%, 공격력 +10%', maxStacks: 4,
    effect: { hpMult: 1.2, damageMult: 1.1 } },
  { id: 'swift', kind: 'stat', name: '신속', description: '이동 속도 +25%', maxStacks: 2,
    effect: { moveSpeedMult: 1.25 } },
  { id: 'might', kind: 'stat', name: '완력', description: '공격력 +45%', maxStacks: 3,
    effect: { damageMult: 1.45 } },

  // ── 그 외
  { id: 'greed', kind: 'utility', name: '탐욕', description: '영웅 처치당 미네랄 +1', maxStacks: 3,
    effect: { mineralPerKill: 1 } },
  { id: 'phoenix', kind: 'utility', name: '불사조', description: '부활 대기 4초 감소', maxStacks: 2,
    effect: { respawnCut: 4 } },
  { id: 'warlord', kind: 'utility', name: '전쟁군주', description: '모든 타워 공격력 +12%', maxStacks: 3,
    effect: { towerDamageMult: 1.12 } },

  // ── 액티브 스킬 획득 (영웅은 하나만 든다)
  { id: 'skill_whirlwind', kind: 'tank', name: '소용돌이', maxStacks: 1,
    description: '[스킬] 주변 적 전체에 공격력 3배 · 쿨 8초',
    effect: {}, grantsSkill: 'whirlwind' },
  { id: 'skill_volley', kind: 'ranged', name: '일제 사격', maxStacks: 1,
    description: '[스킬] 사거리 안 4명에게 각각 공격력 2배 · 쿨 7초',
    effect: {}, grantsSkill: 'volley' },
  { id: 'skill_meteor', kind: 'mage', name: '유성', maxStacks: 1,
    description: '[스킬] 적이 가장 많은 곳에 공격력 6배 광역 · 쿨 13초',
    effect: {}, grantsSkill: 'meteor' },
  { id: 'skill_decoy', kind: 'utility', name: '허수아비', maxStacks: 1,
    description: '[스킬] 앞쪽에 미끼를 세워 몹을 붙잡는다 · 쿨 18초',
    effect: {}, grantsSkill: 'decoy' },

  // ── 스킬 공용 강화 (스킬을 든 뒤에만 등장)
  { id: 'skill_cdr', kind: 'utility', name: '냉각', maxStacks: 3,
    description: '스킬 쿨타임 20% 감소',
    effect: {}, skillMod: { cooldownMult: 0.8 }, requiresSkill: 'any' },
  { id: 'skill_amp', kind: 'stat', name: '증폭', maxStacks: 3,
    description: '스킬 피해 +45%',
    effect: {}, skillMod: { damageMult: 1.45 }, requiresSkill: 'any' },

  // ── 스킬 개조 (그 스킬을 든 뒤에만 등장) — 질적 시너지
  { id: 'explosive_arrow', kind: 'ranged', name: '폭발 화살', maxStacks: 2,
    description: '일제 사격의 화살마다 반경 32의 폭발',
    effect: {}, skillMod: { explosiveRadius: 32 }, requiresSkill: 'volley' },
  { id: 'multishot', kind: 'ranged', name: '연사', maxStacks: 3,
    description: '일제 사격의 화살 +2발',
    effect: {}, skillMod: { extraTargets: 2 }, requiresSkill: 'volley' },
  { id: 'cyclone', kind: 'tank', name: '회오리', maxStacks: 2,
    description: '소용돌이 반경 +25, 맞은 적을 2초간 40% 감속',
    effect: {}, skillMod: { radiusAdd: 25, slowFactor: 0.6, slowSeconds: 2 }, requiresSkill: 'whirlwind' },
  { id: 'cataclysm', kind: 'mage', name: '대재앙', maxStacks: 2,
    description: '유성 반경 +35, 스킬 피해 +30%',
    effect: {}, skillMod: { radiusAdd: 35, damageMult: 1.3 }, requiresSkill: 'meteor' },
  { id: 'taunt_dummy', kind: 'utility', name: '도발 인형', maxStacks: 1,
    description: '허수아비가 주변 몹을 강제로 끌어당기고 체력 2배',
    effect: {}, skillMod: { decoyHpMult: 2, decoyTaunts: true }, requiresSkill: 'decoy' },
];

/** 광역 증강은 '충격파'를 먼저 잡아야 의미가 있다 */
export const requiresSplash = (augment: Augment): boolean => augment.id === 'novabig';

/**
 * 지금 든 스킬(없으면 null)로 이 증강을 뽑을 수 있는가.
 *
 * - 스킬 획득 증강은 스킬이 없을 때만 나온다 — 영웅은 스킬을 하나만 든다.
 * - 개조 증강은 그 스킬을 든 뒤에만 나온다. '폭발 화살'은 일제 사격을 쥔 다음에야 의미가 있다.
 *   이게 수치가 아니라 **관계**로 맺어지는 시너지다.
 */
export function skillGateAllows(augment: Augment, currentSkill: SkillId | null): boolean {
  if (augment.grantsSkill) return currentSkill === null;
  if (!augment.requiresSkill) return true;
  if (currentSkill === null) return false;
  return augment.requiresSkill === 'any' || augment.requiresSkill === currentSkill;
}

// ───────── 특화 시너지 ─────────
// 증강 하나하나는 곱연산이라 이미 복리로 붙는다. 여기에 "같은 계열을 모으면 더 준다"를
// 얹으면, 세 번째 증강을 고르는 순간 눈에 띄게 세지는 구간이 생긴다 — 파워 인플레의 체감.
//
// 다섯 개를 받는 판에서 3+2로 나누면 주특화 하나와 부특화 하나가 나오고,
// 5를 한 계열에 몰면 대특화가 터진다. 그게 도박의 이유가 된다.

/** 같은 계열 증강이 이만큼 모이면 특화가 발동한다 */
/**
 * 적응형 뽑기 가중치 — 이미 든 계열일수록 더 잘 뜬다.
 * weight = 1 + ADAPTIVE_KIND_WEIGHT × (그 계열 보유 수).
 * 타입 선택 없이도 드래프트가 방향을 만든다: 첫 증강에 특화를 시작해도 되고,
 * 범용을 집은 뒤 2번째부터 몰아도 된다. 강제가 아니라 관성이다.
 */
export const ADAPTIVE_KIND_WEIGHT = 0.9;

// ───────── 증강 리롤 (가스) ─────────
// 마음에 안 드는 선택지 3장을 가스로 다시 뽑는다. 한 선택당 최대 2회 —
// 무제한이면 플래티넘이 뜰 때까지 굴리는 단순 노동이 된다.
export const AUGMENT_REROLL_MAX = 2;
export const AUGMENT_REROLL_BASE_GAS = 12;
/** n번째 리롤(0부터)의 가스 값 — 같은 선택 안에서 두 번째가 더 비싸다 */
export const augmentRerollCost = (used: number): number => AUGMENT_REROLL_BASE_GAS * (used + 1);

export const SYNERGY_THRESHOLD = 3;
/** 이만큼 모이면 대특화 */
export const MASTERY_THRESHOLD = 5;

export interface SynergyBonus {
  readonly name: string;
  readonly description: string;
  readonly effect: AugmentEffect;
}

/** 계열별 특화(3개) / 대특화(5개) 보너스 */
export const SYNERGIES: Record<AugmentKind, { readonly specialist: SynergyBonus; readonly master: SynergyBonus }> = {
  tank: {
    specialist: { name: '불굴', description: '최대 체력 +50%, 공격력 +25%',
      effect: { hpMult: 1.5, damageMult: 1.25 } },
    master: { name: '불멸', description: '받는 피해 30% 추가 감소, 초당 체력 20 회복, 공격력 +60%',
      effect: { damageReduction: 0.3, regen: 20, damageMult: 1.6 } },
  },
  ranged: {
    specialist: { name: '저격 태세', description: '공격력 +50%, 사거리 +20%',
      effect: { damageMult: 1.5, rangeMult: 1.2 } },
    master: { name: '일점사', description: '공격력 +100%, 공격 속도 +30%',
      effect: { damageMult: 2, attackSpeedMult: 1.3 } },
  },
  mage: {
    specialist: { name: '연쇄 폭발', description: '광역 반경 +30, 공격력 +40%',
      effect: { splashRadius: 30, damageMult: 1.4 } },
    master: { name: '대마법', description: '광역 반경 +70, 공격력 +120%',
      effect: { splashRadius: 70, damageMult: 2.2 } },
  },
  stat: {
    specialist: { name: '완숙', description: '공격력 +40%, 최대 체력 +30%',
      effect: { damageMult: 1.4, hpMult: 1.3 } },
    master: { name: '초월', description: '공격력 +90%, 최대 체력 +60%, 이동 속도 +20%',
      effect: { damageMult: 1.9, hpMult: 1.6, moveSpeedMult: 1.2 } },
  },
  utility: {
    specialist: { name: '지휘', description: '모든 타워 공격력 +15%', effect: { towerDamageMult: 1.15 } },
    master: { name: '군주', description: '모든 타워 공격력 +35%, 부활 대기 4초 감소',
      effect: { towerDamageMult: 1.35, respawnCut: 4 } },
  },
};

/** 보유 증강에서 발동한 시너지들 */
export function activeSynergies(cards: readonly AugmentCard[]): SynergyBonus[] {
  const counts = new Map<AugmentKind, number>();
  for (const c of cards) counts.set(c.augment.kind, (counts.get(c.augment.kind) ?? 0) + 1);

  const active: SynergyBonus[] = [];
  for (const [kind, count] of counts) {
    if (count >= SYNERGY_THRESHOLD) active.push(SYNERGIES[kind].specialist);
    if (count >= MASTERY_THRESHOLD) active.push(SYNERGIES[kind].master);
  }
  return active;
}
