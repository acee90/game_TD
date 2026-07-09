// ───────── 영웅 · 제단 · 증강 ─────────
// 원본 갓타디에는 없는 신규 설계다. 근거 표기 대상이 아니다.
//
// 영웅은 몹과 같은 경로 위에서만 움직인다. 타워 타일을 넘어다닐 수 없다.
// 대신 몹은 영웅을 보면 진행을 멈추고 영웅부터 처치한 뒤 지나간다.
// 그래서 영웅은 딜러이자 **어그로 블로커**다 — 몹을 한곳에 모으고 시간을 번다.

/** 제단은 게임 시작과 함께 주어진다. 십자 중앙 타일을 차지한다. (core/map.ts SLOT_POS[0]) */
export const ALTAR_SLOT = 0;

// ── 파워 커브 ──
// 초반에는 타워가 주력이고 영웅은 거들 뿐이다. 영웅 1레벨 DPS는 Lv1 타워 한 기 수준이다.
//
// **레벨 성장은 선형이다.** 후반 역전은 레벨이 아니라 **증강 시너지**가 만든다.
// 레벨을 지수로 두면 아무 증강이나 골라도 저절로 세져서, 증강 선택이 결과를 못 바꾼다.
// 선형으로 두면 증강 없는 영웅은 끝까지 GOD 타워 아래에 머물고, 계열을 몰아 특화·대특화를
// 터뜨린 영웅만 넘어선다. 그 격차가 곧 빌드의 값어치다.

export const HERO_BASE_HP = 200;
export const HERO_BASE_DAMAGE = 9;
export const HERO_BASE_RANGE = 95;
export const HERO_ATTACK_INTERVAL = 0.8;
export const HERO_SPEED = 88;
/** 이 거리 안이면 도착으로 본다 (경로 위 거리 기준) */
export const HERO_ARRIVE_EPSILON = 2;
export const HERO_RADIUS = 11;

/**
 * 레벨당 성장 — 곱셈이 아니라 덧셈이다.
 *
 * 기준: 30레벨 영웅은 증강이 없으면 GOD 타워 한 기의 절반쯤이고, 공격 계열 3개를 몰아
 * 특화를 터뜨리면 GOD 타워의 2배를 넘는다. tests/hero-curve.test.ts가 이 관계를 지킨다.
 */
export const HERO_DAMAGE_PER_LEVEL = 18;
export const HERO_HP_PER_LEVEL = 90;

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
 * 경험치. 타워가 잡아도 들어오지만, 영웅이 막타를 치면 더 많이 들어온다.
 * 배수를 크게 두면 영웅을 최전선에 던지는 게 항상 정답이 되고 판마다 편차가 커진다.
 * 2배 정도면 "영웅을 굴리면 조금 빨리 큰다" 수준에서 멈춘다.
 */
export const XP_PER_MOB = 1;
export const HERO_LASTHIT_XP_MULT = 2;
export const xpPerBoss = (level: number): number => 8 * level;

/** 부활 대기시간. 죽으면 그동안 영웅 딜이 빠지는 것 자체가 패널티다. */
export const HERO_RESPAWN_SECONDS = 12;

/** 이 거리 안에 영웅이 보이면 몹이 멈춰서 영웅부터 친다 */
export const HERO_AGGRO_RANGE = 62;
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

/** 보스는 같은 라운드 잡몹 여러 기 몫으로 때린다 */
export const bossDamage = (level: number, round: number): number =>
  enemyDamage(round) * (1.5 + 0.5 * level);

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
export const AUGMENT_LEVELS: readonly number[] = [9, 16, 24, 32, 41, 51];
export const AUGMENT_TAIL_EVERY = 12;
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
}

// ───────── 등급 ─────────
// 증강 카드마다 등급이 무작위로 붙는다. 등급이 높으면 효과가 커지는 대신
// **몹이 영구히 강해진다.** 지금 세지느냐, 나중을 지키느냐 — 매 선택이 도박이 된다.

export type Rarity = 'silver' | 'gold' | 'platinum';

export interface RarityDef {
  readonly label: string;
  readonly color: string;
  /** 증강 효과의 배수. 1보다 큰 부분만 증폭한다(예: 1.3배 → 1.6배). */
  readonly power: number;
  /** 이 등급을 고르면 몹 체력이 영구히 이만큼 곱해진다 */
  readonly enemyHpMult: number;
  /** 뽑기 가중치 */
  readonly weight: number;
}

export const RARITIES: Record<Rarity, RarityDef> = {
  silver: { label: '실버', color: '#9aa2c0', power: 1, enemyHpMult: 1, weight: 55 },
  gold: { label: '골드', color: '#ffd23f', power: 1.7, enemyHpMult: 1.07, weight: 33 },
  platinum: { label: '플래티넘', color: '#7ce7ff', power: 2.6, enemyHpMult: 1.16, weight: 12 },
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
];

/** 광역 증강은 '충격파'를 먼저 잡아야 의미가 있다 */
export const requiresSplash = (augment: Augment): boolean => augment.id === 'novabig';

// ───────── 특화 시너지 ─────────
// 증강 하나하나는 곱연산이라 이미 복리로 붙는다. 여기에 "같은 계열을 모으면 더 준다"를
// 얹으면, 세 번째 증강을 고르는 순간 눈에 띄게 세지는 구간이 생긴다 — 파워 인플레의 체감.
//
// 다섯 개를 받는 판에서 3+2로 나누면 주특화 하나와 부특화 하나가 나오고,
// 5를 한 계열에 몰면 대특화가 터진다. 그게 도박의 이유가 된다.

/** 같은 계열 증강이 이만큼 모이면 특화가 발동한다 */
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
    specialist: { name: '불굴', description: '최대 체력 +30%', effect: { hpMult: 1.3 } },
    master: { name: '불멸', description: '받는 피해 25% 추가 감소, 초당 체력 12 회복',
      effect: { damageReduction: 0.25, regen: 12 } },
  },
  ranged: {
    specialist: { name: '저격 태세', description: '공격력 +30%, 사거리 +15%',
      effect: { damageMult: 1.3, rangeMult: 1.15 } },
    master: { name: '일점사', description: '공격력 +60%, 공격 속도 +25%',
      effect: { damageMult: 1.6, attackSpeedMult: 1.25 } },
  },
  mage: {
    specialist: { name: '연쇄 폭발', description: '광역 반경 +30, 공격력 +20%',
      effect: { splashRadius: 30, damageMult: 1.2 } },
    master: { name: '대마법', description: '광역 반경 +60, 공격력 +60%',
      effect: { splashRadius: 60, damageMult: 1.6 } },
  },
  stat: {
    specialist: { name: '완숙', description: '공격력 +20%, 최대 체력 +20%',
      effect: { damageMult: 1.2, hpMult: 1.2 } },
    master: { name: '초월', description: '공격력 +50%, 최대 체력 +50%, 이동 속도 +20%',
      effect: { damageMult: 1.5, hpMult: 1.5, moveSpeedMult: 1.2 } },
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
