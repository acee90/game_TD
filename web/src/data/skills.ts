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

export type SkillId = 'whirlwind' | 'volley' | 'meteor' | 'decoy';

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
    description: '앞쪽에 미끼를 세워 몹을 붙잡는다 (피해 없음)',
    cooldown: 18,
    damageMult: 0,
    radius: 0,
    targets: 0,
    autoCastMinTargets: 2, // 막을 게 있어야 세운다
  },
};

export const SKILL_IDS: readonly SkillId[] = ['whirlwind', 'volley', 'meteor', 'decoy'];

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
  /** 스킬에 맞은 적의 이동속도 배수 (1이면 감속 없음) */
  readonly slowFactor: number;
  readonly slowSeconds: number;
  /** 허수아비 체력 배수 */
  readonly decoyHpMult: number;
  /** 허수아비가 주변 몹을 강제로 끌어당기는가 */
  readonly decoyTaunts: boolean;
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
};

/** 증강이 기여하는 스킬 개조 조각 */
export type SkillModPatch = Partial<SkillMods>;

/** 여러 조각을 접는다. 곱셈형은 곱하고, 덧셈형은 더하고, 감속은 가장 강한 것을 쓴다. */
export function foldMods(patches: readonly SkillModPatch[]): SkillMods {
  const out = { ...NO_MODS } as { -readonly [K in keyof SkillMods]: SkillMods[K] };
  for (const p of patches) {
    if (p.cooldownMult) out.cooldownMult *= p.cooldownMult;
    if (p.damageMult) out.damageMult *= p.damageMult;
    if (p.radiusAdd) out.radiusAdd += p.radiusAdd;
    if (p.extraTargets) out.extraTargets += p.extraTargets;
    if (p.explosiveRadius) out.explosiveRadius += p.explosiveRadius;
    if (p.slowFactor !== undefined) out.slowFactor = Math.min(out.slowFactor, p.slowFactor);
    if (p.slowSeconds) out.slowSeconds = Math.max(out.slowSeconds, p.slowSeconds);
    if (p.decoyHpMult) out.decoyHpMult *= p.decoyHpMult;
    if (p.decoyTaunts) out.decoyTaunts = true;
  }
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
}

export function resolveSkill(id: SkillId, mods: SkillMods): ResolvedSkill {
  const def = SKILLS[id];
  return {
    def,
    // 쿨타임은 1초 밑으로 내려가지 않는다
    cooldown: Math.max(1, def.cooldown * mods.cooldownMult),
    damageMult: def.damageMult * mods.damageMult,
    radius: def.radius + (def.radius > 0 ? mods.radiusAdd : 0),
    targets: def.targets + (def.targets > 0 ? mods.extraTargets : 0),
    mods,
  };
}
