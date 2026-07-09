// ───────── 영웅 · 제단 · 증강 ─────────
// 원본 갓타디에는 없는 신규 설계다. 근거 표기 대상이 아니다.

export const ALTAR_MINERAL = 40;
/** 제단이 놓이는 타일 인덱스 — 십자 중앙 (core/map.ts SLOT_POS[0]) */
export const ALTAR_SLOT = 0;

// ── 파워 커브 ──
// 초반에는 타워가 주력이고 영웅은 거들 뿐이다. 영웅 1레벨 DPS는 Lv1 타워 한 기 수준이다.
// 타워는 티어 상한(GOD)이 있어 후반에 평평해지지만, 영웅은 레벨이 계속 오르고 증강이
// 곱연산으로 쌓이므로 후반에 역전한다. 증강을 한 계열로 몰면 배수가 폭발한다 — 그게 먼치킨이다.

export const HERO_BASE_HP = 200;
export const HERO_BASE_DAMAGE = 9;
export const HERO_BASE_RANGE = 95;
export const HERO_ATTACK_INTERVAL = 0.8;
export const HERO_SPEED = 88;
/** 이 거리 안이면 도착으로 본다 */
export const HERO_ARRIVE_EPSILON = 2;
export const HERO_RADIUS = 11;

/**
 * 레벨당 성장 — 덧셈이 아니라 곱셈이다. 이게 후반 역전의 근거다.
 * 1.20이면 30레벨 영웅 한 기가 GOD 타워 한 기를 넘어선다. tests/hero.test.ts가 이 관계를 지킨다.
 */
export const HERO_DAMAGE_GROWTH = 1.2;
export const HERO_HP_GROWTH = 1.13;

/** 다음 레벨까지 필요한 경험치 */
export const xpToNext = (level: number): number => 6 + 4 * level;

/** 경험치 — 영웅이 아니라 모든 처치에서 들어온다 */
export const XP_PER_MOB = 1;
export const xpPerBoss = (level: number): number => 8 * level;

/** 부활 대기시간. 죽으면 그동안 영웅 딜이 빠지는 것 자체가 패널티다. */
export const HERO_RESPAWN_SECONDS = 12;

/** 적이 영웅을 때린다 */
export const ENEMY_TOUCH_RANGE = 20;
export const ENEMY_ATTACK_INTERVAL = 1;
export const enemyDamage = (round: number): number => 4 + round * 1.6;
export const bossDamage = (level: number): number => 18 * level;

/** 이 레벨마다 증강을 고른다 */
export const AUGMENT_EVERY = 3;
export const AUGMENT_CHOICES = 3;

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
