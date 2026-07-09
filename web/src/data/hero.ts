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
// 타워는 티어 상한(GOD)이 있어 후반에 평평해지지만, 영웅은 레벨이 계속 오르고 증강이
// 곱연산으로 쌓이므로 후반에 역전한다. 증강을 한 계열로 몰면 배수가 폭발한다 — 그게 먼치킨이다.

export const HERO_BASE_HP = 200;
export const HERO_BASE_DAMAGE = 9;
export const HERO_BASE_RANGE = 95;
export const HERO_ATTACK_INTERVAL = 0.8;
export const HERO_SPEED = 88;
/** 이 거리 안이면 도착으로 본다 (경로 위 거리 기준) */
export const HERO_ARRIVE_EPSILON = 2;
export const HERO_RADIUS = 11;

/**
 * 레벨당 성장 — 덧셈이 아니라 곱셈이다. 이게 후반 역전의 근거다.
 *
 * 기준: 30레벨 영웅은 증강이 없으면 GOD 타워 한 기에 못 미치지만,
 * 공격 계열 증강 3개를 몰면 GOD 타워의 2배를 넘는다.
 * tests/hero.test.ts가 이 두 관계를 동시에 지킨다.
 */
export const HERO_DAMAGE_GROWTH = 1.16;
export const HERO_HP_GROWTH = 1.13;

/**
 * 다음 레벨까지 필요한 경험치.
 *
 * 30레벨이 R30~35에 오도록 맞췄다(막타 30%, 보스 2라운드마다 기준). 초반이 너무 빠르지
 * 않게 기본값을 크게 잡았다 — R2에 Lv3, R5에 Lv7, R10에 Lv12쯤 된다.
 * tests/hero-curve.test.ts가 이 창을 지킨다.
 */
export const xpToNext = (level: number): number => Math.round(14 + 1.5 * level);

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
 * 몹 공격력. 선형이 아니라 지수다.
 *
 * 영웅 유효 체력은 레벨당 ×1.13으로 지수 성장하는데 몹 공격력이 선형이면, 후반의 영웅은
 * 사실상 무적 블로커가 된다(선형 4+1.6r 기준 R50에 84초를 버틴다).
 * 1.12로 잡으면 영웅 성장과 거의 나란히 달려서 "몹 10기를 막을 수 있는 시간"이
 * 라운드 내내 일정하게 유지된다 — 무증강 약 5.6초, 탱커 약 13.7초.
 *
 * 이 균형이 빌드 선택을 만든다. 탱커는 2.4배 오래 버티고, 원거리는 그만큼 빨리 죽는 대신
 * 죽기 전까지 3배의 피해를 넣는다. 1.14까지 올리면 후반에 어떤 빌드로도 못 막는다.
 */
export const ENEMY_DAMAGE_BASE = 4;
export const ENEMY_DAMAGE_GROWTH = 1.12;
export const enemyDamage = (round: number): number =>
  ENEMY_DAMAGE_BASE * Math.pow(ENEMY_DAMAGE_GROWTH, round);

/** 보스는 같은 라운드 잡몹 여러 기 몫으로 때린다 */
export const bossDamage = (level: number, round: number): number =>
  enemyDamage(round) * (1.5 + 0.5 * level);

/**
 * 이 레벨마다 증강을 고른다. 10레벨 간격이면 30레벨에 정확히 3개를 쥔다.
 * 증강 하나하나가 무거워야 조합 시너지가 도파민이 된다.
 */
export const AUGMENT_EVERY = 10;
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
