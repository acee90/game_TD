// ───────── 영웅 액티브 스킬 ─────────
// 원본 갓타디에는 없는 신규 설계다.
//
// 증강은 원래 패시브 수치뿐이었다. 스킬을 넣으면 두 가지가 생긴다.
// 하나는 **누를 것**이 생기고, 다른 하나는 증강끼리 **질적으로** 맞물린다 —
// 일제 사격을 쥔 다음에야 '폭발 화살'이 의미를 갖고, 허수아비를 쥔 다음에야 '도발 인형'이 의미를 갖는다.
//
// 영웅은 스킬을 하나만 든다. 스킬을 주는 증강은 최대 1스택이고, 이미 스킬이 있으면 나오지 않는다.
//
// **스킬은 자동 시전이다.** 플레이어는 어떤 스킬을 들고 어떻게 개조할지만 정한다.
// 대신 스킬마다 "언제 쓰는 게 맞는지"가 다르므로 발동 조건을 데이터로 둔다.

export type SkillId =
  | 'whirlwind'  // 근접 — 광역
  | 'volley'     // 원거리 — 다중 사격
  | 'meteor'     // 마법 — 밀집 광역
  | 'decoy'      // 탱커 — 미끼
  | 'laser'      // 마법 — 관통 지속 빔
  | 'firearrow'  // 원거리 — 지형에 불바다(도트 장판)
  | 'icearrow'   // 원거리 — 지형에 빙판(감속 장판)
  | 'execution'; // 근접 — 마무리 일격 (처치 시 쿨 초기화)

export interface SkillDef {
  readonly id: SkillId;
  readonly name: string;
  readonly description: string;
  /** 쿨타임(초) */
  readonly cooldown: number;
  /** 영웅 공격력 대비 피해 배수. 0이면 피해가 없는 스킬. */
  readonly damageMult: number;
  /** 효과 반경 (0이면 반경 개념 없음) */
  readonly radius: number;
  /** 몇 명을 때리는가 (volley 전용, 0이면 반경 안 전체) */
  readonly targets: number;
  /** 자동 시전 조건: 유효 사거리 안에 적이 이만큼 있어야 쏜다 */
  readonly autoCastMinTargets: number;

  // ── 지속 빔(레이저) 전용. 없으면 즉발 스킬이다.
  /** 빔 지속 시간(초). 0/미설정이면 즉발 */
  readonly beamSeconds?: number;
  /** 몇 초마다 피해를 넣는가 (도트 간격) */
  readonly tickInterval?: number;
  /** 영웅 앞쪽으로 뻗는 길이 (경로 위 거리) */
  readonly beamLength?: number;
  /** 빔의 두께 — 경로에서 이 거리 안의 적이 맞는다 */
  readonly beamWidth?: number;

  // ── 지형 장판(불화살·얼음화살) 전용
  /** 장판을 깐다 — 지속 시간(초) */
  readonly zoneSeconds?: number;
  /** 장판 반경 */
  readonly zoneRadius?: number;
  /** 장판 안 적에게 초당 넣는 피해 (영웅 공격력 배수). 0이면 피해 없는 장판 */
  readonly zoneDps?: number;
  /** 장판 안 적의 이동속도 배수 (1이면 감속 없음) */
  readonly zoneSlow?: number;

  /** 이 스킬이 대상을 처치하면 쿨타임이 즉시 초기화된다 */
  readonly resetOnKill?: boolean;
  /** 대상 선택이 '체력이 가장 낮은 적'인가 (기본은 가장 가까운 적) */
  readonly targetsLowestHp?: boolean;
  /** 쿨타임이 영웅 공격 속도를 따라 줄어드는가 — 허수아비·근접처럼 '손이 빠르면 자주' */
  readonly cooldownScalesWithAttackSpeed?: boolean;
}

export const SKILLS: Record<SkillId, SkillDef> = {
  whirlwind: {
    id: 'whirlwind',
    name: '소용돌이',
    description: '주변의 적 전체에 공격력 3배 피해',
    cooldown: 8,
    damageMult: 3,
    radius: 70,
    targets: 0,
    autoCastMinTargets: 2, // 하나 때리자고 쓰기엔 아깝다
  },
  volley: {
    id: 'volley',
    name: '일제 사격',
    description: '사거리 안 적 4명에게 각각 공격력 2배 피해',
    cooldown: 7,
    damageMult: 2,
    radius: 0, // 영웅 사거리를 쓴다
    targets: 4,
    autoCastMinTargets: 1, // 단일에도 값어치가 있다
  },
  meteor: {
    id: 'meteor',
    name: '유성',
    description: '적이 가장 많은 곳에 공격력 6배 광역 피해',
    cooldown: 13,
    damageMult: 6,
    radius: 85,
    targets: 0,
    autoCastMinTargets: 3, // 뭉쳤을 때만 값어치가 있다
  },
  decoy: {
    id: 'decoy',
    name: '허수아비',
    description: '앞쪽에 미끼를 세워 몹을 붙잡는다 (영웅 체력의 60%로 버틴다)',
    cooldown: 18,
    damageMult: 0,
    radius: 0,
    targets: 0,
    autoCastMinTargets: 2, // 막을 게 있어야 세운다
    // 공속이 오르면 허수아비도 자주 세운다 — 탱커가 민첩에 투자할 이유
    cooldownScalesWithAttackSpeed: true,
  },
  /**
   * 레이저 — 다른 스킬과 달리 **지속**이다. 앞쪽 직선을 태우는 동안 영웅은 계속 싸운다.
   * 경로가 1차원이므로 빔은 "영웅 앞 beamLength 구간"이고, beamWidth는 경로에서 벗어난
   * 레인(2열)까지 닿는 두께다. 관통이라 뭉친 줄을 통째로 지진다.
   */
  laser: {
    id: 'laser',
    name: '레이저',
    description: '앞쪽 직선을 관통해 지속 피해 (0.5초마다 공격력 0.8배)',
    cooldown: 11,
    damageMult: 0.8, // 틱당 배수 — 즉발이 아니라 도트다
    radius: 0,
    targets: 0,
    autoCastMinTargets: 2,
    beamSeconds: 3,
    tickInterval: 0.5,
    beamLength: 190,
    beamWidth: 26,
  },
  /**
   * 불화살 — 맞은 자리를 태운다. 피해는 착탄이 아니라 **바닥**에 있다.
   * 몹이 경로를 따라 지나가야만 하므로 장판은 "길목에 놓는 지속 피해"가 된다.
   */
  firearrow: {
    id: 'firearrow',
    name: '불화살',
    description: '적이 뭉친 곳에 불바다를 깐다 — 초당 공격력 1.2배, 6초',
    cooldown: 12,
    damageMult: 1.5, // 착탄 즉발 피해
    radius: 45,
    targets: 0,
    autoCastMinTargets: 2,
    zoneSeconds: 6,
    zoneRadius: 55,
    zoneDps: 1.2,
  },
  /**
   * 얼음화살 — 피해는 거의 없고 **길목을 얼린다**. 타워에게 시간을 벌어주는 스킬.
   * 감속 장판은 딜이 아니라 '보드 전체의 DPS를 늘리는' 효과다.
   */
  icearrow: {
    id: 'icearrow',
    name: '얼음화살',
    description: '적이 뭉친 곳에 빙판을 깐다 — 55% 감속, 7초',
    cooldown: 14,
    damageMult: 0.5,
    radius: 45,
    targets: 0,
    autoCastMinTargets: 3,
    zoneSeconds: 7,
    zoneRadius: 60,
    zoneDps: 0,
    zoneSlow: 0.45, // 이동속도 45% (= 55% 감속)
  },
  /**
   * 처형자의 일격 — 근접의 마무리. 체력이 가장 낮은 적을 강타하고,
   * 그 일격으로 죽으면 **쿨타임이 즉시 초기화된다**. 잘 고르면 연쇄 처형이 된다.
   */
  execution: {
    id: 'execution',
    name: '처형자의 일격',
    description: '체력이 가장 낮은 적에게 공격력 8배 — 처치하면 쿨타임 초기화',
    cooldown: 9,
    damageMult: 8,
    radius: 0,
    targets: 1,
    autoCastMinTargets: 1,
    targetsLowestHp: true,
    resetOnKill: true,
    cooldownScalesWithAttackSpeed: true,
  },
};

export const SKILL_IDS: readonly SkillId[] = [
  'whirlwind', 'volley', 'meteor', 'decoy', 'laser', 'firearrow', 'icearrow', 'execution',
];

// ── 허수아비 ──
/** 영웅 앞쪽 이 거리에 세운다 */
export const DECOY_AHEAD = 55;
export const DECOY_LIFETIME = 9;
/** 영웅 최대 체력의 이 비율만큼 버틴다 */
export const DECOY_HP_RATIO = 0.6;
export const DECOY_RADIUS = 10;
/** 이 거리 안의 몹이 허수아비를 때린다 */
export const DECOY_AGGRO_RANGE = 62;
/** 허수아비를 세울 만한가 — 영웅 앞쪽 이 거리 안에 몹이 있으면 세운다 */
export const DECOY_AUTOCAST_RANGE = 170;

// ───────── 가스 스킬 개조 트랙 ─────────
// 가스의 두 번째 소비처 — "타워 업그레이드냐 영웅 스킬이냐"가 선택이 되도록.
// 트랙은 둘: 스킬 피해 +8%/구매(곱), 쿨타임 -6%/구매(곱, 하한은 resolveSkill의 1초).
export const GAS_SKILL_DAMAGE_MULT = 1.08;
export const GAS_SKILL_CDR_MULT = 0.94;
export const GAS_SKILL_BASE_COST = 30;
export const GAS_SKILL_COST_GROWTH = 1.35;
export const gasSkillCost = (bought: number): number =>
  Math.round(GAS_SKILL_BASE_COST * Math.pow(GAS_SKILL_COST_GROWTH, bought));

/**
 * 스킬을 개조하는 값들. 증강이 여기에 기여한다.
 * 곱셈형은 1에서, 덧셈형은 0에서 출발한다.
 */
export interface SkillMods {
  readonly cooldownMult: number;
  readonly damageMult: number;
  readonly radiusAdd: number;
  readonly extraTargets: number;
  /** 일제 사격의 화살 하나가 터지는 반경 (0이면 단일) */
  readonly explosiveRadius: number;
  /** 스킬에 맞은 적의 이동속도 배수 (1이면 감속 없음). **모든 스킬**에 걸린다 */
  readonly slowFactor: number;
  readonly slowSeconds: number;
  /** 허수아비 체력 배수 */
  readonly decoyHpMult: number;
  /** 허수아비가 주변 몹을 강제로 끌어당기는가 */
  readonly decoyTaunts: boolean;

  // ── 레이저 전용
  /** 빔 길이 가산 */
  readonly beamLengthAdd: number;
  /** 빔 두께 가산 */
  readonly beamWidthAdd: number;
  /** 도트 간격 배수 (0.5면 0.5초 → 0.25초로 두 배 빨라진다) */
  readonly tickIntervalMult: number;
  /** 빔 지속 시간 가산(초) */
  readonly beamSecondsAdd: number;

  // ── 지형 장판 전용
  /** 장판 반경 가산 */
  readonly zoneRadiusAdd: number;
  /** 장판 지속 시간 가산(초) */
  readonly zoneSecondsAdd: number;
  /** 장판 초당 피해 가산 (영웅 공격력 배수) */
  readonly zoneDpsAdd: number;
}

export const NO_MODS: SkillMods = {
  cooldownMult: 1,
  damageMult: 1,
  radiusAdd: 0,
  extraTargets: 0,
  explosiveRadius: 0,
  slowFactor: 1,
  slowSeconds: 0,
  decoyHpMult: 1,
  decoyTaunts: false,
  beamLengthAdd: 0,
  beamWidthAdd: 0,
  tickIntervalMult: 1,
  beamSecondsAdd: 0,
  zoneRadiusAdd: 0,
  zoneSecondsAdd: 0,
  zoneDpsAdd: 0,
};

/** 증강이 기여하는 스킬 개조 조각 */
export type SkillModPatch = Partial<SkillMods>;

/**
 * 여러 조각을 접는다.
 *
 * **피해·쿨감은 가산이다** (증강 스택이 복리로 터지지 않게 — data/hero.ts의 COMPOUNDING_IDS 주석).
 * `damageMult: 1.45` 세 장이면 ×3.05가 아니라 +135%(×2.35)다.
 * 나머지 덧셈형은 더하고, 감속은 가장 강한 것을 쓴다.
 */
export function foldMods(patches: readonly SkillModPatch[]): SkillMods {
  const out = { ...NO_MODS } as { -readonly [K in keyof SkillMods]: SkillMods[K] };
  let damageBonus = 0;
  let cooldownBonus = 0;
  for (const p of patches) {
    if (p.cooldownMult) cooldownBonus += p.cooldownMult - 1;
    if (p.damageMult) damageBonus += p.damageMult - 1;
    if (p.radiusAdd) out.radiusAdd += p.radiusAdd;
    if (p.extraTargets) out.extraTargets += p.extraTargets;
    if (p.explosiveRadius) out.explosiveRadius += p.explosiveRadius;
    if (p.slowFactor !== undefined) out.slowFactor = Math.min(out.slowFactor, p.slowFactor);
    if (p.slowSeconds) out.slowSeconds = Math.max(out.slowSeconds, p.slowSeconds);
    if (p.decoyHpMult) out.decoyHpMult *= p.decoyHpMult;
    if (p.decoyTaunts) out.decoyTaunts = true;
    if (p.beamLengthAdd) out.beamLengthAdd += p.beamLengthAdd;
    if (p.beamWidthAdd) out.beamWidthAdd += p.beamWidthAdd;
    if (p.tickIntervalMult) out.tickIntervalMult *= p.tickIntervalMult;
    if (p.beamSecondsAdd) out.beamSecondsAdd += p.beamSecondsAdd;
    if (p.zoneRadiusAdd) out.zoneRadiusAdd += p.zoneRadiusAdd;
    if (p.zoneSecondsAdd) out.zoneSecondsAdd += p.zoneSecondsAdd;
    if (p.zoneDpsAdd) out.zoneDpsAdd += p.zoneDpsAdd;
  }
  out.damageMult = Math.max(0.1, 1 + damageBonus);
  // 쿨감 바닥 — 0에 닿으면 스킬이 상시 발동이 된다
  out.cooldownMult = Math.max(0.35, 1 + cooldownBonus);
  return out;
}

/** 개조를 반영한 최종 스킬 수치 */
export interface ResolvedSkill {
  readonly def: SkillDef;
  readonly cooldown: number;
  readonly damageMult: number;
  readonly radius: number;
  readonly targets: number;
  readonly mods: SkillMods;

  // ── 레이저
  readonly beamSeconds: number;
  readonly tickInterval: number;
  readonly beamLength: number;
  readonly beamWidth: number;

  // ── 장판
  readonly zoneSeconds: number;
  readonly zoneRadius: number;
  readonly zoneDps: number;
  readonly zoneSlow: number;
}

/** 도트 간격 하한 — 이 밑으로 내려가면 프레임마다 때리는 것과 같아진다 */
export const MIN_TICK_INTERVAL = 0.1;

/**
 * @param attackSpeedRatio 영웅 공격 속도 배수 (기본 1). 허수아비·처형처럼
 *   `cooldownScalesWithAttackSpeed`인 스킬은 손이 빠를수록 쿨이 짧아진다.
 */
export function resolveSkill(id: SkillId, mods: SkillMods, attackSpeedRatio = 1): ResolvedSkill {
  const def = SKILLS[id];
  const asCut = def.cooldownScalesWithAttackSpeed ? Math.max(0.35, 1 / Math.max(0.01, attackSpeedRatio)) : 1;
  return {
    def,
    // 쿨타임은 1초 밑으로 내려가지 않는다
    cooldown: Math.max(1, def.cooldown * mods.cooldownMult * asCut),
    damageMult: def.damageMult * mods.damageMult,
    radius: def.radius + (def.radius > 0 ? mods.radiusAdd : 0),
    targets: def.targets + (def.targets > 0 ? mods.extraTargets : 0),
    mods,

    beamSeconds: (def.beamSeconds ?? 0) + (def.beamSeconds ? mods.beamSecondsAdd : 0),
    tickInterval: Math.max(MIN_TICK_INTERVAL, (def.tickInterval ?? 0) * mods.tickIntervalMult),
    beamLength: (def.beamLength ?? 0) + (def.beamLength ? mods.beamLengthAdd : 0),
    beamWidth: (def.beamWidth ?? 0) + (def.beamWidth ? mods.beamWidthAdd : 0),

    zoneSeconds: (def.zoneSeconds ?? 0) + (def.zoneSeconds ? mods.zoneSecondsAdd : 0),
    zoneRadius: (def.zoneRadius ?? 0) + (def.zoneRadius ? mods.zoneRadiusAdd : 0),
    zoneDps: (def.zoneDps ?? 0) + (def.zoneDps ? mods.zoneDpsAdd : 0),
    zoneSlow: def.zoneSlow ?? 1,
  };
}
