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
  | 'smite'      // 시작 장비 — 단일 대상 강한 일격. Lv9까지의 임시 무기다
  | 'whirlwind'  // 근접 — 광역
  | 'volley'     // 원거리 — 다중 사격
  | 'meteor'     // 마법 — 밀집 광역
  | 'decoy'      // 탱커 — 미끼
  | 'laser'      // 마법 — 관통 지속 빔
  | 'firearrow'  // 원거리 — 지형에 불바다(도트 장판)
  | 'icearrow'   // 원거리 — 지형에 빙판(감속 장판)
  | 'execution'  // 근접 — 마무리 일격 (처치 시 쿨 초기화)
  | 'chain';     // 원거리 — 튕기는 사격 (튕길수록 강해진다)

/**
 * 시작 스킬 — **'강한 일격'** (2026-07-20, 사용자 지시).
 *
 * 판마다 랜덤으로 뽑던 것을 되돌렸다. 시작 스킬은 이제 **약한 고정 장비**다:
 * 단일 대상 3배 한 방뿐이라 광역도, 유틸도, 성향도 없다.
 * 플레이어는 **Lv9에 처음으로 '제대로된 스킬'을 고른다**(SKILL_DRAFT_LEVEL).
 *
 * 이렇게 하면 초반이 조용해지는 대신 Lv9가 판의 분기점이 된다 — 그때쯤이면 보드에
 * 어떤 태그가 떴는지가 드러나 있어서, "판이 낸 문제에 답한다"가 정보를 갖고 성립한다.
 * (시작부터 랜덤이면 R1에 아무 정보 없이 답을 고르게 된다 — 옛 설계의 미해결 항목.)
 */
export const DEFAULT_SKILL: SkillId = 'smite';
export const STARTER_SKILL: SkillId = DEFAULT_SKILL;

/**
 * 스킬 성향 (2026-07-20). **운이 문제를 내고 플레이어가 답한다** —
 * 보드 태그가 파워 편중이면 잡몹을 놓치니 `mob`을, 스플래시 편중이면 보스가 안 녹으니
 * `boss`를 고르는 식이다. 리롤 결과가 성향까지 랜덤이라 "한 번 더 굴릴까"가 선택이 된다.
 */
export type SkillRole = 'boss' | 'mob' | 'utility';

/**
 * 시전 방식 — **쿨감의 값어치가 여기서 갈린다.**
 *
 * - `burst` 단발: 쿨이 짧아진 만큼 그대로 더 자주 터진다. 쿨감이 선형으로 이득이다.
 * - `channel` 채널링: 효과가 `channelSeconds` 동안 **지속**된다. 쿨이 그 밑으로 내려가도
 *   앞의 시전이 아직 안 끝나 겹칠 수 없다 — **그 이상의 쿨감은 버려진다.**
 *   대신 채널링은 지속 시간·틱 간격을 키우는 개조가 이득이다.
 *
 * 그래서 "냉각(쿨감)을 몇 장 집을 것인가"가 스킬마다 다른 답을 갖는다.
 */
export type CastType = 'burst' | 'channel';

/** 허수아비가 서 있는 시간 — SKILLS 정의보다 먼저 필요하다 (채널링 길이) */
export const DECOY_LIFETIME_SECONDS = 9;

export interface SkillDef {
  readonly id: SkillId;
  readonly name: string;
  readonly description: string;
  /** 어떤 판을 구제하는 스킬인가 — 보드 태그 편중에 대한 '답' */
  readonly role: SkillRole;
  /**
   * 시전에 필요한 마나 (TFT식). **쿨타임은 없다.**
   *
   * 마나는 평타를 칠 때와 맞을 때 찬다. 그래서 공격 속도가 곧 스킬 회전이고,
   * 탱커(맞는 역할)도 스킬을 자주 쓴다 — 스탯이 스킬과 직접 맞물린다.
   */
  readonly manaMax: number;
  /** 영웅 공격력 대비 피해 배수. 0이면 피해가 없는 스킬. */
  readonly damageMult: number;
  /** 효과 반경 (0이면 반경 개념 없음) */
  readonly radius: number;
  /** 몇 명을 때리는가 (volley 전용, 0이면 반경 안 전체) */
  readonly targets: number;
  /**
   * 레벨업마다 targets가 오른다 (volley 전용, 2026-07-18 사용자 지시: "레벨당
   * 3/4/5/6발"). 이 레벨마다 +1. 없으면 레벨과 무관하게 고정.
   */
  readonly targetsLevelStep?: number;
  /** 자동 시전 조건: 유효 사거리 안에 적이 이만큼 있어야 쏜다 */
  readonly autoCastMinTargets: number;
  /** 단발인가 채널링인가 — 쿨감의 값어치가 갈린다 */
  readonly castType: CastType;
  /** 채널링 지속 시간(초). 쿨타임이 이 밑으로 내려가도 이득이 없다 */
  readonly channelSeconds?: number;

  // ── 튕기는 사격 (chain) 전용
  /** 몇 번 튕기는가 */
  readonly bounces?: number;
  /** 튕길 때마다 피해 배수 (1.4면 튕길수록 40%씩 세진다) */
  readonly bounceGrowth?: number;
  /** 다음 대상을 찾는 거리 */
  readonly bounceRange?: number;

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
  /**
   * 강한 일격 — 시작 장비. **일부러 약하다.**
   *
   * 대상 3명 → **1기** (2026-07-20, 사용자 지시). 밀집도가 올라도 안 커지고,
   * 광역도 유틸도 없다. Lv9 스킬 드래프트가 "처음으로 제대로된 스킬"이 되려면
   * 그 전까지 손에 든 것이 확실히 초라해야 한다.
   */
  smite: {
    id: 'smite',
    role: 'boss',
    castType: 'burst',
    name: '강한 일격',
    description: '가장 가까운 적 1기에게 공격력 3배 피해',
    manaMax: 100,
    damageMult: 3,
    radius: 0, // 영웅 사거리를 쓴다
    targets: 1,
    autoCastMinTargets: 1,
  },
  whirlwind: {
    id: 'whirlwind',
    role: 'mob',
    castType: 'burst',
    name: '소용돌이',
    description: '주변의 적 전체에 공격력 3배 피해',
    manaMax: 100,
    damageMult: 3,
    radius: 70,
    targets: 0,
    autoCastMinTargets: 2, // 하나 때리자고 쓰기엔 아깝다
  },
  // 레벨 스케일링 (2026-07-18, 사용자 지시: "영웅 레벨당 3/4/5/6발"). Lv1 3발 →
  // 8레벨마다 +1(Lv9 4발 · Lv17 5발 · Lv25 6발 ...). 실버 등급 스킬이라 초반엔
  // 살짝 얌전하게 시작해 레벨을 타고 계속 자라는 빌드로 남는다.
  volley: {
    id: 'volley',
    role: 'mob',
    castType: 'burst',
    name: '일제 사격',
    description: '사거리 안 적에게 각각 공격력 2배 (레벨업마다 대상 +1, Lv1 3발)',
    manaMax: 90,
    damageMult: 2,
    radius: 0, // 영웅 사거리를 쓴다
    targets: 3,
    targetsLevelStep: 8,
    autoCastMinTargets: 1, // 단일에도 값어치가 있다
  },
  meteor: {
    id: 'meteor',
    role: 'mob',
    castType: 'burst',
    name: '유성',
    description: '적이 가장 많은 곳에 공격력 6배 광역 피해',
    manaMax: 160,
    damageMult: 6,
    radius: 85,
    targets: 0,
    autoCastMinTargets: 3, // 뭉쳤을 때만 값어치가 있다
  },
  decoy: {
    id: 'decoy',
    role: 'utility',
    castType: 'channel',
    channelSeconds: DECOY_LIFETIME_SECONDS, // 미끼가 살아 있는 동안은 다시 못 세운다
    name: '허수아비',
    description: '앞쪽에 미끼를 세워 몹을 붙잡는다 (영웅 체력의 60%로 버틴다)',
    manaMax: 220,
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
    role: 'boss',
    castType: 'channel',
    channelSeconds: 3, // 빔이 3초 나간다 — 쿨이 3초 밑으로 내려가도 이득이 없다
    name: '레이저',
    description: '앞쪽 직선을 관통해 지속 피해 (0.5초마다 공격력 0.55배)',
    manaMax: 160,
    damageMult: 0.55, // 틱당 배수 — 즉발이 아니라 도트다 (난사 빌드가 과했다 → 하향)
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
    role: 'boss',
    castType: 'burst',
    name: '불화살',
    description: '적이 뭉친 곳에 불바다를 깐다 — 초당 공격력 1.2배, 6초',
    manaMax: 150,
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
    role: 'utility',
    castType: 'burst',
    name: '얼음화살',
    description: '적이 뭉친 곳에 빙판을 깐다 — 55% 감속, 7초',
    manaMax: 175,
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
  // 8배 → 6배, 필요 마나 110 → 140 (2026-07-18, 사용자 지시) — 너프.
  // 140 → 420 (2026-07-19, 사용자 지시): 처치하면 마나를 안 쓰므로 몹 연쇄 처형
  // 정체성은 그대로 두고, **처치 못 하는 대상(보스)에게만** 3배 비싸진다 —
  // 초반 처형 빌드가 보스까지 무지성으로 녹이는 걸 막는다. 공속 비례 할인이
  // 실효 마나를 크게 깎으므로(고공속에서 ×0.3까지) 원가가 이만큼은 돼야 견제가 된다.
  execution: {
    id: 'execution',
    role: 'mob',
    castType: 'burst',
    name: '처형자의 일격',
    description: '체력이 가장 낮은 적에게 공격력 6배 — 처치하면 쿨타임 초기화',
    manaMax: 420,
    damageMult: 6,
    radius: 0,
    targets: 1,
    autoCastMinTargets: 1,
    targetsLowestHp: true,
    resetOnKill: true,
    cooldownScalesWithAttackSpeed: true,
  },
  /**
   * 튕기는 사격 — **튕길수록 강해진다.** 대상을 맞히고 가까운 다음 적으로 넘어가며,
   * 넘어갈 때마다 피해가 커진다.
   *
   * 그래서 이 스킬은 **몹이 많을 때만 값어치가 있다** — 한두 기밖에 없으면 첫 타격에서
   * 끝나 가장 약한 스킬이 된다. "언제 쏘는가"가 곧 실력인 스킬이다.
   */
  chain: {
    id: 'chain',
    role: 'mob',
    castType: 'burst',
    name: '튕기는 사격',
    description: '적을 맞히고 튕겨 나간다 — 튕길 때마다 피해 ×1.3 (기본 5회, 몹이 적으면 약하다)',
    manaMax: 165,
    damageMult: 1.3, // 첫 타는 약하다. 값어치는 튕김에서 나온다
    radius: 0,
    targets: 0,
    autoCastMinTargets: 3, // 뭉쳤을 때만 쏜다 — 혼자 있는 적에겐 낭비다
    bounces: 5,
    // 몹이 많으면 최강 — 5번 튕기면 마지막 타가 첫 타의 3.7배.
    // (1.7이었을 땐 24배가 되어 마나 난사와 곱해지며 기준 ×43까지 갔다 — 측정 후 하향)
    bounceGrowth: 1.3,
    bounceRange: 95,
  },
};

/**
 * **제대로된 스킬** 풀 — Lv9 드래프트와 리롤이 여기서만 뽑는다.
 * 시작 장비인 '강한 일격'(smite)은 들어 있지 않다 — 한 번 벗어나면 되돌아갈 수 없다.
 */
export const SKILL_IDS: readonly SkillId[] = [
  'whirlwind', 'volley', 'meteor', 'decoy', 'laser', 'firearrow', 'icearrow',
  'execution', 'chain',
];

/** 시작 장비를 포함한 전체 목록 — 시트·문서용 (뽑기에는 SKILL_IDS를 쓴다) */
export const ALL_SKILL_IDS: readonly SkillId[] = [STARTER_SKILL, ...SKILL_IDS];

/** 아직 시작 장비를 들고 있는가 — Lv9 전이면 참 */
export const isStarterSkill = (id: SkillId): boolean => id === STARTER_SKILL;

/** 난수 소스 — Game의 시드 주입 rand과 같은 모양 */
type Rand = () => number;

const pick = (pool: readonly SkillId[], rand: Rand): SkillId =>
  pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))];

/**
 * Lv9 스킬 드래프트의 후보 N종을 뽑는다 — **서로 겹치지 않게**.
 * 고를 게 3장인데 같은 게 두 번 뜨면 선택이 아니라 표시 버그로 읽힌다.
 */
export function rollSkillChoices(rand: Rand, count: number): SkillId[] {
  const pool = [...SKILL_IDS];
  const out: SkillId[] = [];
  while (out.length < count && pool.length > 0) {
    const i = Math.min(pool.length - 1, Math.floor(rand() * pool.length));
    out.push(pool[i]);
    pool.splice(i, 1);
  }
  return out;
}

/** 드래프트 카드 한 장만 교체 — 화면의 다른 카드와 겹치지 않게 */
export function rerollSkillChoice(shown: readonly SkillId[], rand: Rand): SkillId | null {
  const pool = SKILL_IDS.filter((id) => !shown.includes(id));
  if (pool.length === 0) return null;
  return pick(pool, rand);
}

/**
 * 스킬을 다시 뽑는다. `merge.ts`의 `rerollUnit`과 같은 원칙 —
 * **지금 든 것을 제외**해서 굴릴 때마다 반드시 달라진다. 돈을 냈는데 그대로면
 * 리롤이 선택이 아니라 도박이 된다.
 */
export function rerollSkillId(current: SkillId, rand: Rand): SkillId {
  return pick(SKILL_IDS.filter((id) => id !== current), rand);
}

// ── 허수아비 ──
/** 영웅 앞쪽 이 거리에 세운다 */
export const DECOY_AHEAD = 55;
export const DECOY_LIFETIME = DECOY_LIFETIME_SECONDS;
/** 영웅 최대 체력의 이 비율만큼 버틴다 */
export const DECOY_HP_RATIO = 0.6;
export const DECOY_RADIUS = 10;
/** 이 거리 안의 몹이 허수아비를 때린다 */
export const DECOY_AGGRO_RANGE = 62;
/** 허수아비를 세울 만한가 — 영웅 앞쪽 이 거리 안에 몹이 있으면 세운다 */
export const DECOY_AUTOCAST_RANGE = 170;

// ───────── 마나 ─────────
/** 평타 한 방이 채우는 마나 */
// 10 → 6 (2026-07-17 7차): 평타 몫을 줄인다. 평타 회복이 크면 공속 스탯 하나가
// 스킬 회전을 독점해 "때리면 알아서 도는" 수동적 순환이 된다.
export const MANA_PER_ATTACK = 6;
/** 맞을 때 차는 마나 — 탱커도 스킬을 쓴다 (TFT식) */
// 8 → 14 (2026-07-17 7차): 피격 몫을 키운다. 마나의 주 연료가 **어그로**가 되면서
// "몹을 어디서 얼마나 받아내는가"라는 위치 선택이 스킬 회전을 좌우한다 —
// 이동이 유일한 직접 조작인 게임에서 그게 곧 플레이어의 실력이다. 탱커 빌드의 축이기도 하다.
export const MANA_ON_DAMAGED = 14;
/**
 * 최대 마나 감소의 하한. 0.25 → 0.4 (측정 후 하향).
 * 0.25면 마나 증강을 모은 '난사' 빌드가 같은 장수의 강화 빌드를 10~40배로 압도했다.
 */
export const MANA_MAX_FLOOR = 0.4;

/**
 * 스킬을 개조하는 값들. 증강이 여기에 기여한다.
 * 곱셈형은 1에서, 덧셈형은 0에서 출발한다.
 */
export interface SkillMods {
  /** 최대 마나 배수 (낮을수록 자주 쓴다 — 옛 쿨감의 자리) */
  readonly manaMaxMult: number;
  readonly damageMult: number;
  readonly radiusAdd: number;
  readonly extraTargets: number;
  /**
   * 시전 시 이 확률로 마나를 소비하지 않는다 (2026-07-18, 오버클럭 리뉴얼).
   * 0~1. 가산으로 쌓인다 — 카드 여러 장이면 그만큼 자주 공짜.
   */
  readonly freeCastChance: number;
  /** 스킬에 맞은 적의 이동속도 배수 (1이면 감속 없음). **모든 스킬**에 걸린다 */
  readonly slowFactor: number;
  readonly slowSeconds: number;
  /** 스킬에 맞은 적의 방어력을 이만큼 깎는다 (중첩, '부식' — 2026-07-21 디버프 2×2) */
  readonly armorShredAdd: number;
  /**
   * 스킬 명중 후 남는 도트 — 초당 영웅 공격력의 이 배수 ('여파', 2026-07-21).
   * 갱신형(중첩 없음). 화상(burn 고정치·중첩·트루 피해)과 별개 채널로, 방어력을 적용받는다.
   */
  readonly dotDpsAdd: number;
  readonly dotSeconds: number;
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
  manaMaxMult: 1,
  damageMult: 1,
  radiusAdd: 0,
  extraTargets: 0,
  freeCastChance: 0,
  slowFactor: 1,
  slowSeconds: 0,
  armorShredAdd: 0,
  dotDpsAdd: 0,
  dotSeconds: 0,
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
  let manaBonus = 0;
  for (const p of patches) {
    if (p.manaMaxMult) manaBonus += p.manaMaxMult - 1;
    if (p.damageMult) damageBonus += p.damageMult - 1;
    if (p.radiusAdd) out.radiusAdd += p.radiusAdd;
    if (p.extraTargets) out.extraTargets += p.extraTargets;
    if (p.freeCastChance) out.freeCastChance += p.freeCastChance;
    if (p.slowFactor !== undefined) out.slowFactor = Math.min(out.slowFactor, p.slowFactor);
    if (p.slowSeconds) out.slowSeconds = Math.max(out.slowSeconds, p.slowSeconds);
    if (p.armorShredAdd) out.armorShredAdd += p.armorShredAdd;
    if (p.dotDpsAdd) out.dotDpsAdd += p.dotDpsAdd;
    if (p.dotSeconds) out.dotSeconds = Math.max(out.dotSeconds, p.dotSeconds);
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
  // 최대 마나 하한 — 모으면 **스킬 난사**가 성립해야 한다 (난사는 화염 빌드의 연료다)
  out.manaMaxMult = Math.max(MANA_MAX_FLOOR, 1 + manaBonus);
  // 무료 시전 확률 상한 — 완전 무료(마나 무의미화)는 막는다
  out.freeCastChance = Math.min(0.85, out.freeCastChance);
  return out;
}

/** 개조를 반영한 최종 스킬 수치 */
export interface ResolvedSkill {
  readonly def: SkillDef;
  /** 시전에 필요한 마나 (개조 반영) */
  readonly manaMax: number;
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

  // ── 튕기는 사격
  readonly bounces: number;
  readonly bounceGrowth: number;
  readonly bounceRange: number;

}

/** 도트 간격 하한 — 이 밑으로 내려가면 프레임마다 때리는 것과 같아진다 */
export const MIN_TICK_INTERVAL = 0.1;

/**
 * @param attackSpeedRatio 영웅 공격 속도 배수 (기본 1). 허수아비·처형처럼
 *   `cooldownScalesWithAttackSpeed`인 스킬은 손이 빠를수록 쿨이 짧아진다.
 * @param heroLevel 영웅 레벨 (기본 1). targetsLevelStep이 있는 스킬(일제 사격)의
 *   대상 수가 여기서 갈린다.
 */
export function resolveSkill(
  id: SkillId,
  mods: SkillMods,
  attackSpeedRatio = 1,
  heroLevel = 1,
): ResolvedSkill {
  const def = SKILLS[id];
  const asCut = def.cooldownScalesWithAttackSpeed ? Math.max(0.3, 1 / Math.max(0.01, attackSpeedRatio)) : 1;

  /**
   * 필요 마나. **채널링은 채널이 끝난 뒤부터 마나가 찬다** (Game이 그렇게 막는다) —
   * 빔이 나가는 동안은 마나가 안 차므로 가동률에 천장이 생긴다.
   * 단발은 마나가 차는 대로 계속 터진다.
   *
   * `cooldownScalesWithAttackSpeed`인 스킬(허수아비·처형)은 필요 마나가 더 낮다 —
   * 다만 평타 마나 자체가 공속을 따라가므로 이 보정은 덤이다.
   */
  const manaMax = Math.max(10, def.manaMax * mods.manaMaxMult * asCut);

  // 레벨로 자라는 대상 수 (일제 사격) — Lv1 기준치에서 targetsLevelStep마다 +1
  const levelTargets = def.targetsLevelStep
    ? def.targets + Math.floor((heroLevel - 1) / def.targetsLevelStep)
    : def.targets;

  return {
    def,
    manaMax,
    damageMult: def.damageMult * mods.damageMult,
    radius: def.radius + (def.radius > 0 ? mods.radiusAdd : 0),
    targets: levelTargets + (levelTargets > 0 ? mods.extraTargets : 0),
    mods,

    beamSeconds: (def.beamSeconds ?? 0) + (def.beamSeconds ? mods.beamSecondsAdd : 0),
    tickInterval: Math.max(MIN_TICK_INTERVAL, (def.tickInterval ?? 0) * mods.tickIntervalMult),
    beamLength: (def.beamLength ?? 0) + (def.beamLength ? mods.beamLengthAdd : 0),
    beamWidth: (def.beamWidth ?? 0) + (def.beamWidth ? mods.beamWidthAdd : 0),

    zoneSeconds: (def.zoneSeconds ?? 0) + (def.zoneSeconds ? mods.zoneSecondsAdd : 0),
    zoneRadius: (def.zoneRadius ?? 0) + (def.zoneRadius ? mods.zoneRadiusAdd : 0),
    zoneDps: (def.zoneDps ?? 0) + (def.zoneDps ? mods.zoneDpsAdd : 0),
    zoneSlow: def.zoneSlow ?? 1,

    bounces: (def.bounces ?? 0) + (def.bounces ? mods.extraTargets : 0),
    bounceGrowth: def.bounceGrowth ?? 1,
    bounceRange: def.bounceRange ?? 0,
  };
}
