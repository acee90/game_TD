import { DEFAULT_SKILL, SKILLS, type SkillId, type SkillModPatch } from './skills';

// ───────── 영웅 · 제단 · 증강 ─────────
// 원본 갓타디에는 없는 신규 설계다. 근거 표기 대상이 아니다.
//
// 영웅은 몹과 같은 경로 위에서만 움직인다. 타워 타일을 넘어다닐 수 없다.
// 대신 몹은 영웅을 보면 진행을 멈추고 영웅부터 처치한 뒤 지나간다.
// 그래서 영웅은 딜러이자 **어그로 블로커**다 — 몹을 한곳에 모으고 시간을 번다.

/** 제단은 게임 시작과 함께 주어진다. 십자 중앙 타일을 차지한다. (core/map.ts SLOT_POS[0]) */
export const ALTAR_SLOT = 0;

// ── 파워 커브 (2026-07-13 3안 개편) ──
// 영웅 파워 = 스탯(레벨업 자동 균등 성장, XP는 골드 구매+킬) × 증강 배수(선택).
// 두 축뿐이다 — 레벨 배수는 폐지됐다. 초반 영웅은 Lv1 타워 몇 기 수준에서 시작한다.

export const HERO_BASE_RANGE = 130;
export const HERO_ATTACK_INTERVAL = 0.8;
export const HERO_SPEED = 88;
/** 이 거리 안이면 도착으로 본다 (경로 위 거리 기준) */
export const HERO_ARRIVE_EPSILON = 2;
export const HERO_RADIUS = 11;

// ───────── 스탯 — 레벨업마다 자동으로 골고루 오른다 ─────────
// 힘: 기본 공격력과 체력.  민첩: 공격 속도.  지능: 스킬 피해.
//
// 이전에는 골드로 스탯을 직접 사고 XP는 킬에서 공짜로 왔다 — 레벨 배수(×2.4/레벨)가
// 골드 없이 올라 영웅 파워커브가 과속했다(명세 §12 0.5, Lv17 DPS 985).
// 이제 골드 → XP → 레벨업 → 힘/민/지 자동 균등 성장 한 축이다. 레벨 배수는 폐지.
// 파워는 전부 골드 비용을 가지므로 income-curve.csv에서 타워와 같은 저울에 오른다.
export type StatId = 'str' | 'agi' | 'int';
export const STAT_IDS: readonly StatId[] = ['str', 'agi', 'int'];
export const STAT_LABEL: Record<StatId, string> = { str: '힘', agi: '민첩', int: '지능' };

export const HERO_BASE_STR = 2;
export const HERO_BASE_AGI = 8;
export const HERO_BASE_INT = 8;

// 6 → 5 (2026-07-18, 사용자 지시: "영웅 성장시 공격속도도 증가하도록 — 성장공격력
// 낮춰서 dps는 유지"). 아래 LEVEL_ATTACK_SPEED_RATE가 새로 생긴 만큼 힘의 순수 피해
// 성장을 낮춰 총 DPS 곡선을 원래에 가깝게 맞춘다 (game/hero.ts computeStats에서
// 레벨 공속과 곱연산으로 함께 적용).
/** 힘 1당 공격력 — 레벨 배수 폐지의 보상으로 1 → 6 재척도, 7차 6 → 5 [프로토] */
export const DMG_PER_STR = 5;
/** 힘 1당 최대 체력 — 같은 이유로 18 → 70 [프로토] */
export const HP_PER_STR = 70;
/**
 * 레벨과 무관한 기본 체력 (2026-07-14).
 *
 * 체력이 `힘 × 70`뿐이라 Lv1(힘 2) 영웅이 140이었다. 어그로 범위가 110이라 몹이 10기씩
 * 뭉쳐 붙는데, R1 몹 공격력이 기당 1.6/초 → **8.8초면 죽는다**(라운드가 22초인데).
 * 측정: 시드 12판 중 9판에서 영웅이 죽었고 첫 사망 중앙값이 R5, R1~R2 사망도 3판.
 *
 * 기본값을 주면 **초반만** 두꺼워진다 — 레벨이 오를수록 힘 몫이 커져 비중이 줄기 때문에
 * 후반 밸런스(탱커 빌드의 존재 이유)는 거의 그대로다.
 */
export const HERO_BASE_HP = 260;
/**
 * 비전투 재생 (2026-07-15).
 *
 * 그전까지 영웅의 회복 수단은 재생·흡혈 증강, 레벨업(완전 회복), 증강 획득(잃은 체력 50%)뿐이었다.
 * 회복 증강을 안 뽑으면 한 번 깎인 체력이 **영영 안 돌아온다** — 결국 죽어서 부활하는 게
 * 유일한 회복이 됐다. "죽는 게 회복"은 나쁜 루프다.
 *
 * 그래서 마지막 피격 후 HERO_OOC_REGEN_DELAY초가 지나면 저절로 찬다. 영웅은 경로 위에서만
 * 움직이므로 이건 곧 **"물러나면 회복한다"**가 된다 — 이동이 유일한 직접 조작인 게임에서
 * 후퇴·복귀가 전술이 된다. 회복률이 최대 체력 비례라 탱커 빌드일수록 절대량이 크다.
 *
 * 재생 증강은 여전히 값어치가 있다 — 그쪽은 **맞는 중에도** 찬다.
 */
export const HERO_OOC_REGEN_DELAY = 4;
/** 비전투 재생 — 초당 최대 체력의 이 비율 (풀피까지 ~17초, 라운드 간격이 22초다) */
export const HERO_OOC_REGEN_RATIO = 0.06;

/** 민첩 1당 공격 속도 +4% */
export const AS_PER_AGI = 0.04;
/**
 * 레벨업마다 오르는 **기본** 공격 속도 (2026-07-18, 사용자 지시) — 민첩 스탯과는
 * 별개 축이다. "기본 공격속도"라 증강의 attackSpeedMult와는 가산이 아니라
 * **곱연산**으로 붙는다 (사용자 지시: "증강이랑 곱연산") — game/hero.ts computeStats에서
 * `attackSpeed *= (1+bonus.attackSpeed)` 뒤에 다시 곱한다. 그만큼 DMG_PER_STR을
 * 낮춰 DPS 총량은 유지하고, 공격력 상승분 일부를 공속으로 옮긴다.
 *
 * **레벨에 선형**이다(지수 복리 아님) — 처음엔 복리로 짰다가 되돌렸다. 복리면
 * Lv50에 공속만 +87%가 붙어 DMG_PER_STR을 아무리 낮춰도 고레벨 DPS가 옛 곡선보다
 * +36% 부풀었다(공속에 상한이 없어서). 선형이면 Lv50에 +62%로 완만하고, 공격 간격
 * 하한(MIN_ATTACK_INTERVAL)에 걸리는 지점도 늦춰져 DPS 비율이 옛 곡선의 0.83~1.07배
 * 안에서 오간다 — 정확히 같지는 않지만(공속 하한이라는 비선형이 이미 있어 완전한
 * 상쇄가 불가능하다) 훨씬 가깝다.
 */
export const LEVEL_ATTACK_SPEED_RATE = 0.0125;
/** 공격 간격 하한 — 민첩을 아무리 골라도 이 밑으로는 안 내려간다 */
export const MIN_ATTACK_INTERVAL = 0.25;
/** 지능 1당 스킬 피해 +3.5% */
export const SKILL_PER_INT = 0.035;

/**
 * 레벨업이 세 스탯에 나눠 주는 총 포인트 — 후반 레벨일수록 굵게.
 *
 * 2 + L/10 → 1 + L/7 (2026-07-16, economy-power-rebalance 2차): 영웅 파워커브를
 * **뒤로** 민다(사용자 지시: "영웅이 타워보다 강해지는 건 R45 이후"). 중반 레벨(15~25)의
 * 포인트를 깎고 후반 레벨을 굵게.
 *
 * 1 + L/7 → 1 + L/6 (2026-07-17 4차): 후반이 너무 얇았다 — 플레이테스트
 * "Lv30 넘게 투자해도 골드 대비 파워가 약함". Lv30 이하는 거의 그대로 두고
 * (Lv30 스탯 +3%), Lv35+가 굵어진다(Lv38 +14%) — XP 지수 완화(1.12→1.10)와 세트.
 *
 * Lv19+ 구간에 추가 항 도입 (2026-07-18, 사용자 지시: "영웅 후반부에 좀 더 가파르게
 * 강해지도록"). Lv18까지는 이전 곡선과 완전히 같다 — 초·중반 밸런스는 건드리지 않고
 * 후반만 접는다. Lv30 누적 스탯 +19%(94→112), 그 뒤로도 계속 가팔라져 Lv40 +44% ·
 * Lv50 +64% — "후반부에 더" 라는 요청대로 한 지점만 튀지 않고 갈수록 벌어진다.
 */
export const HERO_LATE_GAME_FROM = 19;
export const HERO_LATE_GAME_DIVISOR = 3;
export const levelStatPoints = (level: number): number =>
  1 +
  Math.floor(level / 6) +
  Math.floor(Math.max(0, level - HERO_LATE_GAME_FROM) / HERO_LATE_GAME_DIVISOR);

/** 해당 레벨까지 각 스탯이 공통으로 받은 자연 성장치. 총 예산을 3등분해 기존 파워 총량을 보존한다. */
export function statBonusByLevel(level: number): number {
  let total = 0;
  for (let l = 2; l <= level; l++) total += levelStatPoints(l);
  return total / STAT_IDS.length;
}

export interface HeroAttributes {
  readonly str: number;
  readonly agi: number;
  readonly int: number;
}

/** UI와 전투 계산이 공유하는 레벨별 실제 능력치. */
export function attributesByLevel(level: number): HeroAttributes {
  const bonus = statBonusByLevel(level);
  return {
    str: HERO_BASE_STR + bonus,
    agi: HERO_BASE_AGI + bonus,
    int: HERO_BASE_INT + bonus,
  };
}

/** XP 골드 구매 (TFT식) — 1골드 = 1XP, 버튼 한 번에 20 */
export const XP_BUY_GOLD = 20;
export const XP_BUY_AMOUNT = 20;

/**
 * 다음 레벨까지 필요한 경험치. **지수**다.
 *
 * 선형(14 + 1.5×레벨)일 때는 영웅이 64레벨까지 올라갔다. 영웅 공격력이 레벨당 ×1.16이라
 * 레벨이 두 배면 파워가 수십 배가 되는데, 레벨 자체에 제동이 없으니 후반이 무의미하게
 * 부풀었다. 지수 비용은 고레벨을 실질적으로 봉인한다.
 *
 * 1.06 → 1.10 (2026-07-16, economy-power-rebalance D3 — B안 "필요 경험치 증가" 채택).
 * 플레이테스트: 타워 비용은 라운드가 갈수록 오르는데 XP는 20골드 고정이라 고레벨에서도
 * "버튼 몇 번에 확 레벨업"했다 — 최소 타워 + 영웅 몰빵이 지배 전략이 됐다.
 * 기준선 측정: 골드 70%를 영웅에 부으면 R25에 영웅 DPS가 필드 최강 타워의 ×15.7,
 * 생존은 타워몰빵과 동급. 1.10이면 골드 2배당 +7레벨(1.06은 +12)로 한계 효용이 더
 * 빨리 꺾인다.
 *
 * 1.10 → 1.12 (같은 날 2차): 교차(영웅이 최강 타워를 3라운드 연속 넘는 시점) 중앙이
 * 여전히 R10대였다. 영웅 개화를 R45+로 미는 두 노브 중 하나 — 다른 하나는
 * levelStatPoints 백로딩.
 *
 * 1.12 → 1.10 (2026-07-17 4차): 과했다 — 플레이테스트 "Lv32에 4천 골드를 넣어도
 * 타워가 월등". Lv32 누적이 4,256골드로 게임 수입의 대부분이었다. 1.10이면 2,750.
 * 후반 가치는 levelStatPoints 상향(1+L/7 → 1+L/6)과 세트로 회복한다.
 *
 * 1.10 → 1.08 (7차): "R30~40에 크는 재미가 없다" — Lv30 누적이 2,289골드로 그 시점
 * 총수입(~1,800)을 넘어 **레벨이 사실상 봉인**돼 있었다. 1.08이면 1,571 — 무겁지만
 * 손에 닿는다(수입의 87%). 성장 곡선을 푸는 대신 웨이브는 그대로 둔다(7차 판정 대기).
 */
export const XP_BASE_COST = 14;
export const XP_COST_GROWTH = 1.08;
export const xpToNext = (level: number): number =>
  Math.round(XP_BASE_COST * Math.pow(XP_COST_GROWTH, level));

/**
 * 킬 XP는 부축이다 (0.65 → 0.3, 2026-07-11 2안 개편) — 주 연료는 골드 구매(XP_BUY_GOLD).
 * 레벨 속도 목표: 수입 20% 투자 기준 R45에 Lv ~24 (2026-07-16 D3 재정의).
 */
export const XP_PER_MOB = 0.3;
export const HERO_LASTHIT_XP_MULT = 2;
export const xpPerBoss = (level: number): number => 8 * level;

/** 부활 대기시간. 죽으면 그동안 영웅 딜이 빠지는 것 자체가 패널티다. */
export const HERO_RESPAWN_SECONDS = 12;

/** 이 거리 안에 영웅이 보이면 몹이 멈춰서 영웅부터 친다 */
export const HERO_AGGRO_RANGE = 110;

/**
 * 어그로 수 상한 (2026-07-19, 사용자 지시: "모든 몬스터가 어그로 끌릴 수는 없다").
 *
 * 상한 = 어그로 범위 ÷ 이 값 — 범위 22px(= 접촉 사거리, 몸 하나 폭)당 1기.
 * 기본 110px → 5기. 도발 계열 증강이 범위를 넓히면 상한도 같이 오른다
 * (도발 오라 2스택 ×2 → 10기). 상한을 넘는 몹은 영웅을 무시하고 지나간다 —
 * 어그로 탱킹의 기대값이 "전부"에서 "범위에 비례한 만큼"으로 내려간다.
 * 허수아비(미끼)는 전담 탱킹 도구라 상한을 두지 않는다.
 */
export const AGGRO_RANGE_PER_TARGET = 22;
export const aggroCap = (aggroRange: number): number =>
  Math.max(1, Math.round(aggroRange / AGGRO_RANGE_PER_TARGET));
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
// 2026-07-12 대폭 하향(3/1.3 → 1/0.6): 영웅 위협은 기본 몹이 아니라 **사냥꾼 웨이브**가
// 전담한다(balance.ts waveTypeOf — 접촉 공격력 배수). 기본 몹은 어그로로 모아도 안전하고,
// 사냥꾼 라운드(R10+, 5의 배수)에만 탱킹이 시험대에 오른다.
export const ENEMY_DAMAGE_BASE = 1;
export const ENEMY_DAMAGE_PER_ROUND = 0.6;
export const enemyDamage = (round: number): number =>
  ENEMY_DAMAGE_BASE + ENEMY_DAMAGE_PER_ROUND * round;

/**
 * 보스 접촉 피해 — **전 레벨 무해** (2026-07-17 플레이테스트, 3→6).
 *
 * 2026-07-11에는 Lv4+가 영웅을 때렸지만("고레벨 소환의 대가"), 실제로는 보스의 위협이
 * 두 겹이 될 필요가 없었다 — 리스크는 누출 라이프 -1과 **기회비용**(못 잡으면 쿨타임
 * 동안 보상 없음)으로 충분하고, 영웅 위협은 사냥꾼 웨이브가 전담한다. 보스는 그냥 지나간다.
 */
export const BOSS_HARMLESS_MAX_LEVEL = 8; // Lv7 신설(5차)도 무해 — 전 레벨 불변. Lv8도 동행(2026-07-18)
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
// [9,16,...] → [5,10,...] (2026-07-17 5차): 첫 두 증강을 빠르게 — "증강을 보고
// 빌드 방향을 정할 수 있도록"(사용자). 3번째부터는 그대로 — 중반 파워 스파이크 방지.
export const AUGMENT_LEVELS: readonly number[] = [5, 10, 24, 30, 35, 42];
export const AUGMENT_TAIL_EVERY = 8;
export const AUGMENT_CHOICES = 3;

/** 이 레벨에 도달하면 증강을 받는가 */
export function grantsAugment(level: number): boolean {
  if (AUGMENT_LEVELS.includes(level)) return true;
  const last = AUGMENT_LEVELS[AUGMENT_LEVELS.length - 1];
  return level > last && (level - last) % AUGMENT_TAIL_EVERY === 0;
}

/** 다음 증강을 받는 레벨 — UI 예고용 ("다음 증강 Lv24") */
export function nextAugmentLevel(level: number): number {
  for (let l = level + 1; l <= level + AUGMENT_TAIL_EVERY + 1; l++) {
    if (grantsAugment(l)) return l;
  }
  return level + 1; // 도달 불가 — grantsAugment가 tail을 보장하므로 실제로는 안 온다
}

/** `level`까지 올렸을 때 받은 증강 개수 */
export function augmentsByLevel(level: number): number {
  let count = 0;
  for (let l = 2; l <= level; l++) if (grantsAugment(l)) count++;
  return count;
}

// ───────── 증강 계열 (2026-07-14 기능축 재편) ─────────
// 이전 계열은 빌드 원형(탱커/원거리/마법사)이었다. 그런데 증강 26종을 기능으로 분류해 보니
// 스탯 강화가 31%로 몰려 있었고(레퍼런스: augment-taxonomy-v1.0.md), 계열이 원형이라
// "무엇을 하는 증강인가"가 풀 구성에 드러나지 않았다.
//
// 계열을 **기능축**으로 갈아끼운다. 계열 = 그 증강이 게임에 무엇을 더하는가.
// 그러면 특화(3개)/대특화(5개)가 곧 플레이 스타일이 된다 —
// 성장에 몰면 눈덩이, 경제에 몰면 부자, 특수에 몰면 온갖 발동 효과가 터진다.
export type AugmentKind = 'stat' | 'defense' | 'combat' | 'skill' | 'growth' | 'econ' | 'util';

export const AUGMENT_KINDS: readonly AugmentKind[] = [
  'stat', 'defense', 'combat', 'skill', 'growth', 'econ', 'util',
];

export const AUGMENT_KIND_LABEL: Record<AugmentKind, string> = {
  stat: '강화',
  defense: '방어',
  combat: '특수',
  skill: '스킬',
  growth: '성장',
  econ: '경제',
  util: '유틸',
};

/** displayLabel이 붙은 카드(범용 "강화")의 칩 색 — kind는 그대로 skill이라 별도로 둔다 */
export const ENHANCE_DISPLAY_COLOR = '#e0995a';

/** 카드에 표시할 계열 라벨 — displayLabel이 있으면 그쪽, 없으면 kind 기본 라벨 */
export const displayKindLabel = (augment: Augment): string =>
  augment.displayLabel ?? AUGMENT_KIND_LABEL[augment.kind];

/** 카드에 표시할 계열 색 — displayLabel이 있으면 전용 색, 없으면 kind 기본 색 */
export const displayKindColor = (augment: Augment): string =>
  augment.displayLabel ? ENHANCE_DISPLAY_COLOR : AUGMENT_KIND_COLOR[augment.kind];

export const AUGMENT_KIND_COLOR: Record<AugmentKind, string> = {
  stat: '#ffd23f',
  defense: '#6fdc8c',
  combat: '#ff5a3c',
  skill: '#c065e0',
  growth: '#4ea3ff',
  econ: '#8fd6ff',
  util: '#ff8a3c',
};

// ───────── 발동 효과 상수 ─────────
/** 화상 지속 시간 — 공격할 때마다 새로 덧씌운다 */
export const BURN_SECONDS = 3;
/**
 * 화상 — **평타로는 안 붙는다. 스킬과 도트만 불을 붙인다** (2026-07-14 재설계).
 *
 * 그래서 화염은 평타 빌드의 부록이 아니라 **스킬·도트 빌드의 심장**이 된다:
 * 레이저는 틱마다, 불바다 장판은 초마다 중첩을 얹는다 — 도트 하나하나가 연료다.
 *
 * **중첩 상한이 없다.** 대신 중첩당 피해는 **공격력과 무관한 고정값**이다.
 * 화염의 성장축은 "얼마나 세게 때리나"가 아니라 **"얼마나 오래, 얼마나 여러 겹 지지나"**다.
 * 오래 사는 대상(보스)일수록 겹이 두꺼워진다.
 */
export const BURN_SECONDS_BASE = BURN_SECONDS;
/** 공격 감속 지속 시간 */
export const SLOW_ON_HIT_SECONDS = 1.5;
/** 이 비율 밑이면 '위기' — 위기 증강이 켜진다 */
export const LOW_HP_THRESHOLD = 0.35;
/** 치명타 기본 배수 (critMultAdd가 여기에 더해진다) */
export const CRIT_BASE_MULT = 2;

// 상한 — 곱연산 증강이 겹쳐도 게임이 깨지지 않게 막는다
export const LIFESTEAL_CAP = 0.12;
export const CRIT_CHANCE_CAP = 0.9;
/** 처형 임계 상한. 이 이상이면 보스도 순삭된다 */
export const EXECUTE_CAP = 0.25;
export const DAMAGE_REDUCTION_CAP = 0.75;

/** 증강이 영웅·게임에 곱하거나 더하는 값들 */
export interface AugmentEffect {
  // ── 배수형 (1을 넘는 부분만 등급이 키운다)
  readonly hpMult?: number;
  readonly damageMult?: number;
  readonly rangeMult?: number;
  readonly attackSpeedMult?: number;
  readonly moveSpeedMult?: number;
  /** 모든 타워 공격력 배수 */
  readonly towerDamageMult?: number;
  /** 모든 타워 사거리 배수 */
  readonly towerRangeMult?: number;
  /** 경험치 획득 배수 */
  readonly xpMult?: number;
  /** 어그로 범위 배수 — 넓을수록 더 많이 붙잡는다 */
  readonly aggroRangeMult?: number;
  /** 체력이 LOW_HP_THRESHOLD 밑일 때만 걸리는 공격력 배수 */
  readonly lowHpDamageMult?: number;
  /** 성장(누적) 증강의 적립치 배수 — 성장 특화가 키운다 */
  readonly growthMult?: number;
  /** 스킬 피해 배수 */
  readonly skillDamageMult?: number;
  /** 최대 마나 배수 (낮을수록 스킬을 자주 쓴다 — 옛 쿨감의 자리) */
  readonly manaMaxMult?: number;
  /** 마나 획득 배수 */
  readonly manaGainMult?: number;

  // ── 가산형 (값 자체를 등급이 키운다)
  /** 초당 체력 재생 */
  readonly regen?: number;
  /** 받는 피해 감소 비율 (0.15 = 15% 감소) */
  readonly damageReduction?: number;
  /** 광역 공격을 켠다 — 이 반경의 적 전체를 때린다 */
  readonly splashRadius?: number;
  /** 가한 피해의 이 비율만큼 회복 */
  readonly lifesteal?: number;
  /** 치명타 확률 */
  readonly critChance?: number;
  /** 치명타 배수 가산 (CRIT_BASE_MULT에 더해진다) */
  readonly critMultAdd?: number;
  /** 대상 최대 체력의 이 비율 밑이면 즉사시킨다 */
  readonly executeBelow?: number;
  /**
   * 화상 — **중첩 1겹당 초당 고정 피해**. 공격력 계수가 없다.
   *
   * 스킬 적중과 도트 틱(레이저·불바다)이 겹을 얹는다. 평타는 불을 붙이지 않는다.
   * 상한이 없으므로 화염의 스케일링은 **겹 수**에서 온다 — 도트가 빠를수록,
   * 화상이 오래 갈수록 두꺼워진다.
   */
  readonly burnDamage?: number;
  /** 화상 지속 시간 가산(초) — 겹이 더 오래 살아남는다 */
  readonly burnSecondsAdd?: number;
  /** 적의 방어력을 깎는다 (중첩되며, 0 밑으로는 안 내려간다) */
  readonly armorShred?: number;
  /**
   * 화염 피해 배수 — **화상 겹당 피해와 불바다 장판 피해에 곱해진다.**
   * (전역 공격력이 아니라 '불'에만 걸리는 곱이다 — 화염 빌드의 성장축.)
   */
  readonly fireDamageMult?: number;
  /**
   * 화상에 걸린 적이 **모든 영웅 피해**를 이만큼 더 받는다 (0.25 = +25%).
   * 평타·스킬·장판·레이저가 전부 이득을 본다 — 도트끼리 시너지가 나는 지점이다.
   */
  readonly burnAmp?: number;

  /** 공격에 감속을 붙인다 (0.25 = 25% 감속) */
  readonly slowOnHit?: number;
  /** 받은 피해의 이 배수를 때린 적에게 되돌린다 */
  readonly thorns?: number;
  /** 처치한 적이 터진다 — 영웅 공격력의 이 배수만큼 광역 피해 */
  readonly deathBlast?: number;
  /** 폭발 반경 */
  readonly deathBlastRadius?: number;
  /** 처치당 추가 금화 */
  readonly mineralPerKill?: number;
  /** 라운드마다 금화 (고정값) */
  readonly mineralPerWave?: number;
  /**
   * 라운드 보상 배수. 보상은 `10 + 3×라운드`라 라운드가 갈수록 커진다 —
   * 고정 가산(라운드마다 +6)은 R30에서 보상의 6%밖에 안 됐다. 경제는 배수여야 큰다.
   */
  readonly waveRewardMult?: number;
  /** 라운드마다 마정석 */
  readonly gasPerWave?: number;
  /** 부활 대기시간 감소(초). 음수면 늘어난다 */
  readonly respawnCut?: number;
  /**
   * 영웅이 막타를 칠 때마다 공격력 +이 값 (고정치, 상한 없음).
   * waveStackDamage(라운드 누적)처럼 상한 없이 그대로 쌓인다. 예전엔 %(killStackDamage,
   * 등급별 상한 포함)였으나 2026-07-18 사용자 지시로 전부 고정치로 옮겼다.
   */
  readonly killStackFlatDamage?: number;
  /** 라운드마다 공격력 +이 값 (영구 누적) */
  readonly waveStackDamage?: number;
  /** 라운드마다 최대 체력 +이 값 (영구 누적) */
  readonly waveStackHp?: number;

  /** 피격 시 추가로 차는 마나 */
  readonly manaOnDamaged?: number;
  /** 시전 후 남는 마나 (선충전) — 다음 시전이 그만큼 빨라진다 */
  readonly startingMana?: number;
  /** 영웅이 죽을 때 터진다 — 영웅 공격력의 이 배수만큼 광역 피해 */
  readonly deathNova?: number;
  /** 영웅이 부활할 때 제단에서 터진다 */
  readonly reviveNova?: number;
  /**
   * 사망·부활 폭발의 **최대 체력 계수**. 폭발 피해 = 공격력×deathNova + 최대체력×이 값.
   * 체력 쪽 계수가 더 크다 — 초신성은 딜러가 아니라 **탱커의 마지막 한 방**이다.
   */
  readonly novaHpMult?: number;
  /** 사망·부활 폭발의 반경 */
  readonly novaRadius?: number;

  /**
   * 타워 복제를 연다 — 라운드마다 타워 하나를 찍어두면 라운드 종료 시 복제된다.
   * 값은 **기본 티어 상한**이다 (1 = 티어 0까지). 실제 상한은 라운드·영웅 레벨이 더 밀어올린다.
   */
  readonly towerCopyTier?: number;

  /**
   * 폭발 반경 (2026-07-18, 사용자 지시: "폭발화살 -> 폭발") — 평타·스킬 가리지 않고
   * 모든 명중마다 이 반경 안의 다른 적에게도 같은 피해를 준다. 대신 penalty로
   * skillDamageMult를 깎는다(카드 정의 참고). 스킬 전용이던 옛 '폭발 화살'을 대체한다.
   */
  readonly explosionRadius?: number;
}

export interface Augment {
  readonly id: string;
  readonly kind: AugmentKind;
  readonly name: string;
  readonly description: string;
  /** 같은 증강을 몇 번까지 쌓을 수 있나 */
  readonly maxStacks: number;
  readonly effect: AugmentEffect;
  /**
   * 대가. 효과와 반대 방향으로 걸린다.
   *
   * **등급이 대가를 키우지 않는다** — 플래티넘 광전사는 이득만 커지고 체력 페널티는 그대로다.
   * 등급은 순수 뽑기 운이라는 원칙(명세 §7)을 지키려면 대가가 등급에 비례하면 안 된다.
   * 비례시키면 높은 등급이 뜬 게 오히려 손해인 경우가 생긴다.
   */
  readonly penalty?: AugmentEffect;
  /** 이 증강을 고르면 액티브 스킬을 얻는다 (스킬이 없을 때만 등장) */
  readonly grantsSkill?: SkillId;
  /** 스킬을 개조한다 */
  readonly skillMod?: SkillModPatch;
  /** 이 스킬을 든 영웅에게만 등장한다 */
  readonly requiresSkill?: SkillId | 'any';
  /** 장판을 까는 스킬(불화살·얼음화살)을 든 영웅에게만 등장한다 */
  readonly requiresZone?: boolean;
  /**
   * 등급을 고정한다 (2026-07-18, 사용자 지시) — 스킬 획득 카드는 `effect`가 비어 있어
   * 등급(실버/골드/플래티넘)으로 강화할 방법이 없다. 대신 **어떤 스킬이 뜨는지**를
   * 등급으로 가른다 — 강한 스킬일수록 높은 등급에서만 나온다. 설정하면 rollRarity를
   * 건너뛰고 항상 이 등급으로 나온다.
   */
  readonly fixedRarity?: Rarity;
  /**
   * 표시용 라벨 오버라이드 (2026-07-18, 사용자 지시: "kindLabel 스킬 세분화 ->
   * 스킬/강화로 분리"). `kind`는 그대로 'skill'이라 가중치·시너지(3장/5장 임계)는
   * 안 바뀐다 — 카드 위에 찍히는 글자만 "강화"로 보여서, 특정 스킬 전용이 아니라
   * 전투 전반(평타 포함)에 걸리는 카드라는 걸 한눈에 구분한다.
   */
  readonly displayLabel?: string;
}

/** 대가가 달린 증강인가 — UI가 경고색으로 칠한다 */
export const isRisky = (augment: Augment): boolean => augment.penalty !== undefined;

/**
 * 곱연산 증강 — **소수 정예다.**
 *
 * 기본값은 **가산**이다. `damageMult: 1.45`는 "기본 공격력의 45%를 더한다"는 뜻이고,
 * 세 장을 쌓으면 +135%(×2.35)지, 1.45³(×3.05)이 아니다.
 *
 * 왜: 전부 곱이면 스택형 증강이 복리로 터진다. 완력 3장 × 특화 1.4 = ×4.3이 되고,
 * 거기에 성장 누적까지 곱해지면 GOD 타워 15기가 나왔다(측정: 성장 3장 R40 = 14.7기).
 * 가산이면 증강 하나하나의 값어치가 예측 가능해지고, 후반 폭주가 사라진다.
 *
 * 그래서 **곱은 특별한 것**이 된다. 여기 있는 소수만 진짜 배수로 곱해지고,
 * 그 대신 배율은 작다 (×1.5 안팎). 이게 뜨면 판이 달라진다 — 그래야 곱이 사건이 된다.
 */
export const COMPOUNDING_IDS: readonly string[] = ['glasscannon', 'evolution', 'skill_overload'];
export const isCompounding = (augment: Augment): boolean =>
  COMPOUNDING_IDS.includes(augment.id);

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
 * 배수형(1.3 → 1.6)은 1을 넘는 부분만, 가산형(regen 6 → 12)은 값 자체를 키운다.
 * 상한이 있는 값은 여기서 자르지 않고 computeStats가 합산 후에 자른다.
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
    towerRangeMult: mult(effect.towerRangeMult),
    xpMult: mult(effect.xpMult),
    waveRewardMult: mult(effect.waveRewardMult),
    aggroRangeMult: mult(effect.aggroRangeMult),
    lowHpDamageMult: mult(effect.lowHpDamageMult),
    growthMult: mult(effect.growthMult),
    skillDamageMult: mult(effect.skillDamageMult),
    manaMaxMult: mult(effect.manaMaxMult),
    manaGainMult: mult(effect.manaGainMult),

    regen: add(effect.regen),
    // 증강 하나가 등급빨로 과보호되지 않게 자른다. 합산 상한은 computeStats가 따로 건다.
    damageReduction:
      effect.damageReduction === undefined
        ? undefined
        : Math.min(0.6, effect.damageReduction * power),
    splashRadius: add(effect.splashRadius),
    // 흡혈은 이미 가한 피해량을 따라 성장한다. 등급까지 곱하면 공격력 성장과 이중으로 커져
    // 생존이 무한에 가까워지므로 카드에 적힌 비율을 그대로 쓴다.
    lifesteal: effect.lifesteal,
    critChance: add(effect.critChance),
    critMultAdd: add(effect.critMultAdd),
    executeBelow: add(effect.executeBelow),
    burnDamage: add(effect.burnDamage),
    burnSecondsAdd: add(effect.burnSecondsAdd),
    armorShred: add(effect.armorShred),
    fireDamageMult: mult(effect.fireDamageMult),
    burnAmp: add(effect.burnAmp),
    slowOnHit: add(effect.slowOnHit),
    thorns: add(effect.thorns),
    deathBlast: add(effect.deathBlast),
    deathBlastRadius: add(effect.deathBlastRadius),
    manaOnDamaged: add(effect.manaOnDamaged),
    startingMana: add(effect.startingMana),
    deathNova: add(effect.deathNova),
    reviveNova: add(effect.reviveNova),
    novaHpMult: add(effect.novaHpMult),
    novaRadius: add(effect.novaRadius),
    // 등급으로 안 커진다 (2026-07-18, 롤백) — 티어는 백분율이 아니라 인덱스라
    // 등급 배율(×2, ×3.5)이 그대로 "몇 티어를 더 여는가"가 돼버려 플래티넘 한 장이
    // 즉시 GOD 근접 상한을 열었다. 복제 장치는 순수 뽑기 운의 영향을 안 받는다.
    towerCopyTier: effect.towerCopyTier,
    mineralPerKill:
      effect.mineralPerKill === undefined ? undefined : Math.round(add(effect.mineralPerKill)!),
    mineralPerWave:
      effect.mineralPerWave === undefined ? undefined : Math.round(add(effect.mineralPerWave)!),
    gasPerWave: effect.gasPerWave === undefined ? undefined : Math.round(add(effect.gasPerWave)!),
    respawnCut: add(effect.respawnCut),
    killStackFlatDamage: add(effect.killStackFlatDamage),
    waveStackDamage: add(effect.waveStackDamage),
    waveStackHp: add(effect.waveStackHp),
  };
}

// ───────── 효과 요약 — 등급이 반영된 **실제 수치**를 글로 만든다 (2026-07-17 7차) ─────────
// 카드 설명(description)은 손으로 쓴 **실버 기준** 문장이라 골드·플래티넘에서 실제 수치와
// 어긋난다("+60%인데 실제론 +120%") — 플레이테스트에서 혼란으로 확인됐다.
// 여기서 효과 객체를 그대로 읽어 문장을 만들면 설명이 데이터와 절대 어긋나지 않는다.

/** 1을 기준으로 하는 배수형 — 1.6 → "+60%", 0.85 → "-15%" */
const MULT_LABELS: readonly (readonly [keyof AugmentEffect, string])[] = [
  ['damageMult', '공격력'], ['hpMult', '최대 체력'], ['rangeMult', '사거리'],
  ['attackSpeedMult', '공격 속도'], ['moveSpeedMult', '이동 속도'],
  ['towerDamageMult', '타워 공격력'], ['towerRangeMult', '타워 사거리'],
  ['xpMult', '경험치'], ['aggroRangeMult', '어그로 범위'],
  ['lowHpDamageMult', '위기 시 공격력'], ['growthMult', '성장 누적'],
  ['skillDamageMult', '스킬 피해'], ['manaMaxMult', '필요 마나'],
  ['manaGainMult', '마나 획득'], ['waveRewardMult', '라운드 보상'],
  ['fireDamageMult', '화염 피해'],
];

/** 0~1 비율 가산형 — 0.2 → "20%" */
const RATIO_LABELS: readonly (readonly [keyof AugmentEffect, string])[] = [
  ['damageReduction', '받는 피해 감소'], ['lifesteal', '흡혈'], ['critChance', '치명타 확률'],
  ['executeBelow', '처형 임계'], ['slowOnHit', '공격 감속'], ['burnAmp', '화상 대상 피해'],
];

/** 값 자체가 오르는 가산형 — 6 → "6" */
const FLAT_LABELS: readonly (readonly [keyof AugmentEffect, string, string])[] = [
  ['regen', '초당 회복', ''], ['splashRadius', '광역 반경', ''],
  ['critMultAdd', '치명타 피해', '배'], ['burnDamage', '화상 겹당 피해', '/초'],
  ['burnSecondsAdd', '화상 지속', '초'], ['armorShred', '방어력 감소', ''],
  ['thorns', '가시 반사', '배'], ['deathBlast', '폭사 피해', '배'],
  ['deathBlastRadius', '폭사 반경', ''], ['mineralPerKill', '처치당 금화', ''],
  ['mineralPerWave', '라운드마다 금화', ''], ['gasPerWave', '라운드마다 마정석', ''],
  ['respawnCut', '부활 대기 감소', '초'], ['killStackFlatDamage', '막타당 공격력', ''],
  ['waveStackDamage', '라운드마다 공격력', ''],
  ['waveStackHp', '라운드마다 체력', ''], ['manaOnDamaged', '피격 마나', ''],
  ['startingMana', '시전 후 남는 마나', ''], ['deathNova', '사망 폭발', '배'],
  ['reviveNova', '부활 폭발', '배'], ['novaHpMult', '폭발 체력 계수', '배'],
  ['novaRadius', '폭발 반경', ''], ['towerCopyTier', '복제 티어 상한', ''],
  ['explosionRadius', '폭발 반경', ''],
];

const pct = (v: number): string => `${v > 0 ? '+' : ''}${Math.round(v * 100)}%`;
const num = (v: number): string => (Number.isInteger(v) ? String(v) : v.toFixed(1));

/**
 * 등급이 반영된 실제 수치를 사람이 읽는 문장으로. 카드·증강 기록이 함께 쓴다.
 * 값이 없으면 빈 문자열 — 스킬 개조 전용 증강(effect가 비어 있다)이 그렇다.
 */
export function effectSummary(effect: AugmentEffect): string {
  const parts: string[] = [];
  for (const [key, label] of MULT_LABELS) {
    const v = effect[key] as number | undefined;
    if (v !== undefined) parts.push(`${label} ${pct(v - 1)}`);
  }
  for (const [key, label] of RATIO_LABELS) {
    const v = effect[key] as number | undefined;
    if (v !== undefined) parts.push(`${label} ${Math.round(v * 100)}%`);
  }
  for (const [key, label, unit] of FLAT_LABELS) {
    const v = effect[key] as number | undefined;
    if (v !== undefined) parts.push(`${label} ${num(v)}${unit}`);
  }
  return parts.join(' · ');
}

/**
 * 이 증강이 등급의 영향을 받는가.
 *
 * **스킬 개조(skillMod)는 등급으로 커지지 않는다** — makeCard가 effect만 스케일한다.
 * 그래서 '증폭'·'집중 수련' 같은 개조 전용 증강에 "×2" 배지를 붙이면 거짓말이 된다.
 * (플레이테스트 2026-07-17에서 지적된 혼란.) UI는 이 함수로 배지를 가른다.
 */
export const rarityScales = (augment: Augment): boolean =>
  Object.keys(augment.effect).length > 0;

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
  // 대가(penalty)는 등급으로 키우지 않는다 — Augment.penalty 주석 참고
  effect: scaleEffect(augment.effect, RARITIES[rarity].power),
});

/**
 * 증강 풀 — 72종.
 *
 * 계열별로 최소 9종씩 둬서 한 판(증강 6~8개)에 같은 카드가 반복되지 않게 한다.
 * 설계 참고: LoL 아레나 226종 · TFT 세트17 275종을 기능 분류한
 * docs/reference/augment-taxonomy-v1.0.md. 그쪽에서 가져온 패턴은 주석에 적었다.
 */
export const AUGMENTS: readonly Augment[] = [
  // ══ 강화 (stat) — 순수 수치. 재편 전 31%에서 14%로 줄였다.
  { id: 'might', kind: 'stat', name: '완력', description: '공격력 +60%', maxStacks: 3,
    effect: { damageMult: 1.6 } },
  { id: 'marksman', kind: 'stat', name: '명사수', description: '공격력 +45%, 사거리 +10%', maxStacks: 3,
    effect: { damageMult: 1.45, rangeMult: 1.1 } },
  { id: 'rapid', kind: 'stat', name: '속사', description: '공격 속도 +45%', maxStacks: 3,
    effect: { attackSpeedMult: 1.45 } },
  { id: 'longbow', kind: 'stat', name: '장궁', description: '사거리 +35%', maxStacks: 3,
    effect: { rangeMult: 1.35 } },
  { id: 'vigor', kind: 'stat', name: '활력', description: '최대 체력 +30%, 공격력 +15%', maxStacks: 4,
    effect: { hpMult: 1.3, damageMult: 1.15 } },
  { id: 'arcane', kind: 'stat', name: '비전 집중', description: '공격력 +35%, 공격 속도 +20%', maxStacks: 3,
    effect: { damageMult: 1.35, attackSpeedMult: 1.2 } },
  { id: 'bulwark', kind: 'stat', name: '방벽', description: '최대 체력 +55%', maxStacks: 3,
    effect: { hpMult: 1.55 } },
  // 아레나 '거인(Goliath)' — 커지는 대신 느려진다
  { id: 'goliath', kind: 'stat', name: '거인', description: '최대 체력 +50%, 공격력 +20% · 이동 속도 -15%',
    maxStacks: 2, effect: { hpMult: 1.5, damageMult: 1.2 }, penalty: { moveSpeedMult: 0.85 } },
  // 아레나 '광전사' 계열 — 유리대포
  // [곱연산] 다른 모든 공격력 보너스에 통째로 곱해진다 — 그래서 배율은 낮고 1장뿐이다
  { id: 'glasscannon', kind: 'stat', name: '광전사', description: '[곱] 최종 공격력 ×1.5 · 최대 체력 -30%',
    maxStacks: 1, effect: { damageMult: 1.5 }, penalty: { hpMult: 0.7 } },
  { id: 'duelist', kind: 'stat', name: '결투가', description: '공격력 +35%, 공격 속도 +20% · 사거리 -20%',
    maxStacks: 2, effect: { damageMult: 1.35, attackSpeedMult: 1.2 }, penalty: { rangeMult: 0.8 } },

  // ══ 방어 (defense) — 생존
  { id: 'plating', kind: 'defense', name: '중장갑', description: '받는 피해 20% 감소', maxStacks: 2,
    effect: { damageReduction: 0.2 } },
  { id: 'regen', kind: 'defense', name: '재생', description: '초당 체력 6 회복', maxStacks: 3,
    effect: { regen: 6 } },
  { id: 'lifesteal', kind: 'defense', name: '흡혈', description: '가한 피해의 4% 회복', maxStacks: 3,
    effect: { lifesteal: 0.04 } },
  // 아레나 '가시 갑옷' — 맞으면서 되돌려준다. 가시는 허수아비에게도 걸린다.
  { id: 'thorns', kind: 'defense', name: '가시 갑옷', description: '받은 피해의 120%를 때린 적에게 되돌린다 (허수아비도 적용)',
    maxStacks: 2, effect: { thorns: 1.2 } },
  { id: 'thornaura', kind: 'defense', name: '가시오라',
    description: '받은 피해의 250%를 되돌리고, 받는 피해 15% 감소 (허수아비도 적용)', maxStacks: 2,
    effect: { thorns: 2.5, damageReduction: 0.15 } },
  { id: 'aegis', kind: 'defense', name: '이지스', description: '받는 피해 18% 감소, 초당 체력 3 회복',
    maxStacks: 2, effect: { damageReduction: 0.18, regen: 3 } },
  { id: 'fortress', kind: 'defense', name: '요새', description: '최대 체력 +25%, 받는 피해 12% 감소',
    maxStacks: 2, effect: { hpMult: 1.25, damageReduction: 0.12 } },
  { id: 'secondwind', kind: 'defense', name: '재기', description: '초당 체력 4 회복, 받는 피해 10% 감소',
    maxStacks: 2, effect: { regen: 4, damageReduction: 0.1 } },
  // 아레나 '최후의 저항' — 위기에서 세진다 (conditional)
  { id: 'laststand', kind: 'defense', name: '최후의 저항',
    description: '체력 35% 이하일 때 공격력 +60%', maxStacks: 2,
    effect: { lowHpDamageMult: 1.6 } },
  // TFT 'Blood Price' — 체력을 걸고 흡혈
  { id: 'bloodpact', kind: 'defense', name: '피의 계약', description: '가한 피해의 7% 회복 · 최대 체력 -20%',
    maxStacks: 1, effect: { lifesteal: 0.07 }, penalty: { hpMult: 0.8 } },
  { id: 'stoneskin', kind: 'defense', name: '석화 피부', description: '받는 피해 15% 감소 · 공격 속도 -10%',
    maxStacks: 2, effect: { damageReduction: 0.15 }, penalty: { attackSpeedMult: 0.9 } },

  // ══ 특수 (combat) — 새 발동 효과. 아레나 증강의 중심축(35%)이 여기다.
  { id: 'novasmall', kind: 'combat', name: '충격파', description: '공격이 반경 45의 광역이 된다', maxStacks: 1,
    effect: { splashRadius: 45 } },
  { id: 'novabig', kind: 'combat', name: '대폭발', description: '광역 반경 +40 (충격파 필요)', maxStacks: 2,
    effect: { splashRadius: 40 } },
  { id: 'crit', kind: 'combat', name: '급소 노리기', description: '치명타 확률 +35%', maxStacks: 3,
    effect: { critChance: 0.35 } },
  { id: 'deadeye', kind: 'combat', name: '정밀 사격', description: '치명타 확률 +18%, 치명타 피해 +100%',
    maxStacks: 2, effect: { critChance: 0.18, critMultAdd: 1 } },
  // 아레나 '처형' 계열 — 체력이 낮은 적을 즉사
  { id: 'execute', kind: 'combat', name: '처형', description: '체력 12% 이하의 적을 즉사시킨다', maxStacks: 2,
    effect: { executeBelow: 0.12 } },
  { id: 'ruthless', kind: 'combat', name: '무자비', description: '공격력 +35%, 체력 7% 이하의 적을 즉사시킨다',
    maxStacks: 2, effect: { damageMult: 1.35, executeBelow: 0.07 } },
  // 아레나 '개척자/고문자' — 무한 중첩 화상
  // ── 화염 계열 — **평타로는 안 붙는다. 스킬과 도트만 불을 붙인다.**
  // 중첩 상한이 없고 중첩당 피해는 고정값이다(공격력 계수 없음). 성장축은 '겹 수'다 —
  // 레이저 틱·불바다 장판이 겹을 얹으므로 도트가 빠를수록 두꺼워진다.
  // 화상은 **방어력을 무시한다(트루 피해).** 장갑이 라운드마다 계단식으로 오르므로
  // 후반에 유일하게 감산되지 않는 피해가 된다.
  { id: 'burn', kind: 'combat', name: '화염 부착',
    description: '스킬·도트가 화상을 중첩시킨다 — 겹당 초당 12 고정 피해(방어력 무시), 상한 없음',
    maxStacks: 3, effect: { burnDamage: 12 } },
  { id: 'kindling', kind: 'combat', name: '불쏘시개',
    description: '화상 지속 +3초 (겹이 오래 살아 더 두껍게 쌓인다), 화상 걸린 적이 받는 피해 +15%',
    maxStacks: 2, effect: { burnSecondsAdd: 3, burnAmp: 0.15 } },
  // 점화 — 폭발이 아니라 **불의 화력 자체**를 키운다. 화상 겹당 피해와 불바다 피해에 곱해진다.
  { id: 'ignite', kind: 'combat', name: '점화',
    description: '모든 화염 피해 +60% (화상 겹당 피해 · 불바다 장판)',
    maxStacks: 3, effect: { fireDamageMult: 1.6 } },
  // 도트끼리의 시너지 — 불바다 장판·레이저 틱도 화상을 쌓는다
  { id: 'pyromancy', kind: 'combat', name: '발화술',
    description: '화상 걸린 적이 받는 모든 피해 +30% (평타·스킬·장판·레이저 전부)', maxStacks: 2,
    effect: { burnAmp: 0.3 } },
  { id: 'frost', kind: 'combat', name: '서리 일격', description: '공격이 적을 35% 감속시킨다', maxStacks: 2,
    effect: { slowOnHit: 0.35 } },
  // 맹독 — 딜이 아니라 **약화**다. 느리게 만들고 갑옷을 녹인다.
  // 방깎은 타워에게도 이득이다(장갑은 모든 피해에서 감산되므로) — 영웅이 보드를 돕는 축.
  { id: 'venom', kind: 'combat', name: '맹독',
    description: '공격이 25% 감속시키고 방어력을 6 깎는다 (중첩)', maxStacks: 3,
    effect: { slowOnHit: 0.25, armorShred: 6 } },
  // 아레나 '연쇄 폭발' — 죽은 적이 터진다
  { id: 'deathblast', kind: 'combat', name: '폭사', description: '처치한 적이 반경 50에 공격력 3배로 폭발',
    maxStacks: 2, effect: { deathBlast: 3, deathBlastRadius: 50 } },
  { id: 'berserk', kind: 'combat', name: '광폭화', description: '공격 속도 +30%, 가한 피해의 3% 회복',
    maxStacks: 2, effect: { attackSpeedMult: 1.3, lifesteal: 0.03 } },
  // 사망도 자원으로 쓴다 — 죽는 순간과 돌아오는 순간이 둘 다 폭발이다
  // 초신성 — 딜러가 아니라 **탱커의 마지막 한 방**이다. 체력 계수가 공격력 계수보다 크다.
  { id: 'supernova', kind: 'combat', name: '초신성',
    description: '사망·부활 시 반경 90 폭발 — 공격력 2배 + 최대 체력 40%', maxStacks: 2,
    effect: { deathNova: 2, reviveNova: 1.2, novaHpMult: 0.4, novaRadius: 90 } },

  // ══ 스킬 (skill) — 획득과 개조. 영웅은 스킬을 하나만 든다.
  //
  // 등급 고정 (2026-07-18, 사용자 지시) — 스킬 획득 카드는 effect가 비어 있어 등급으로
  // 강화가 안 된다("같은 스킬을 골드·플래티넘으로 올려도 강화가 안 된다"). 대신
  // **어떤 스킬이 뜨는가**를 등급으로 가른다: 쉽고 무난한 스킬은 실버, 상황을 타는
  // 중간급은 골드, 판을 바꾸는 강한 스킬은 플래티넘.
  { id: 'skill_whirlwind', kind: 'skill', name: '소용돌이', maxStacks: 1,
    description: '[스킬·실버] 주변 적 전체에 공격력 3배 · 쿨 8초',
    effect: {}, grantsSkill: 'whirlwind', fixedRarity: 'silver' },
  { id: 'skill_volley', kind: 'skill', name: '일제 사격', maxStacks: 1,
    description: '[스킬·실버] 사거리 안 적에게 각각 공격력 2배 (레벨업마다 대상 +1, Lv1 3발) · 쿨 7초',
    effect: {}, grantsSkill: 'volley', fixedRarity: 'silver' },
  { id: 'skill_decoy', kind: 'skill', name: '허수아비', maxStacks: 1,
    description: '[스킬·실버] 앞쪽에 미끼를 세워 몹을 붙잡는다 · 쿨 18초',
    effect: {}, grantsSkill: 'decoy', fixedRarity: 'silver' },
  { id: 'skill_meteor', kind: 'skill', name: '유성', maxStacks: 1,
    description: '[스킬·골드] 적이 가장 많은 곳에 공격력 6배 광역 · 쿨 13초',
    effect: {}, grantsSkill: 'meteor', fixedRarity: 'gold' },
  { id: 'skill_firearrow', kind: 'skill', name: '불화살', maxStacks: 1,
    description: '[스킬·골드] 바닥에 불바다를 깐다 — 초당 공격력 1.2배, 6초 · 쿨 12초',
    effect: {}, grantsSkill: 'firearrow', fixedRarity: 'gold' },
  { id: 'skill_icearrow', kind: 'skill', name: '얼음화살', maxStacks: 1,
    description: '[스킬·골드] 바닥에 빙판을 깐다 — 55% 감속, 7초 · 쿨 14초',
    effect: {}, grantsSkill: 'icearrow', fixedRarity: 'gold' },
  { id: 'skill_chain', kind: 'skill', name: '튕기는 사격', maxStacks: 1,
    description: '[스킬·골드] 적을 맞히고 튕겨 나간다 — 튕길 때마다 피해 ×1.45 (몹이 적으면 약하다) · 쿨 10초',
    effect: {}, grantsSkill: 'chain', fixedRarity: 'gold' },
  // 8배 → 6배, 필요 마나 110 → 140 (2026-07-18, 사용자 지시) — 너프.
  { id: 'skill_execution', kind: 'skill', name: '처형자의 일격', maxStacks: 1,
    description: '[스킬·플래티넘] 체력이 가장 낮은 적에게 공격력 6배 — 처치 시 쿨 초기화 · 쿨 9초',
    effect: {}, grantsSkill: 'execution', fixedRarity: 'platinum' },
  { id: 'skill_laser', kind: 'skill', name: '레이저', maxStacks: 1,
    description: '[스킬·플래티넘] 몹이 더 많은 방향으로 관통해 0.5초마다 지속 피해 · 쿨 11초',
    effect: {}, grantsSkill: 'laser', fixedRarity: 'platinum' },

  // ── 범용 개조 (표시상 "강화") — 특정 스킬 전용이 아니라 전투 전반(평타 포함)에
  // 걸리는 카드들. kind는 그대로 'skill'이라 각성(3)/초월 시전(5) 시너지 임계치
  // 계산은 안 바뀐다 — displayLabel만 "강화"로 보여서 스킬 전용 카드와 구분된다
  // (2026-07-18, 사용자 지시: "kindLabel 스킬 세분화 -> 스킬/강화로 분리").
  { id: 'skill_cdr', kind: 'skill', displayLabel: '강화', name: '집중 수련', maxStacks: 3,
    description: '필요 마나 15% 감소',
    effect: {}, skillMod: { manaMaxMult: 0.85 }, requiresSkill: 'any' },
  { id: 'skill_amp', kind: 'skill', displayLabel: '강화', name: '증폭', maxStacks: 3,
    description: '스킬 피해 +45%',
    effect: {}, skillMod: { damageMult: 1.45 }, requiresSkill: 'any' },
  // 대가형 개조 — 세게 때리는 대신 자주 못 쓴다
  // [곱연산] 스킬 피해에 통째로 곱해진다 — 대신 쿨이 길어진다
  { id: 'skill_overload', kind: 'skill', displayLabel: '강화', name: '과부하', maxStacks: 1,
    description: '[곱] 스킬 피해 ×1.6 · 필요 마나 +25%',
    effect: { skillDamageMult: 1.6 }, skillMod: { manaMaxMult: 1.25 }, requiresSkill: 'any' },
  // ── 쿨감 트랙 — 모으면 **스킬 난사**가 된다. 난사는 화염(겹 쌓기)의 연료이기도 하다.
  // ── 마나 트랙 — 모으면 **스킬 난사**가 된다 (난사는 화염 겹 쌓기의 연료다)
  { id: 'skill_haste', kind: 'skill', displayLabel: '강화', name: '마나 순환', maxStacks: 3,
    description: '마나 획득 +18% (평타·피격 모두)',
    effect: { manaGainMult: 1.18 }, requiresSkill: 'any' },
  /**
   * 오버클럭 리뉴얼 (2026-07-18, 사용자 지시) — "스킬 피해 -12%" 대가형에서
   * "시전 시 30% 확률로 마나를 안 쓴다"로 갈아탄다. 마나 감소(쿨감의 자리)와
   * 확률 무료 시전이 같은 방향(더 자주 쏜다)이라 카드 정체성이 또렷해진다.
   * 2스택이면 60% — 평균적으로 시전 2.5회당 1회는 공짜.
   */
  { id: 'skill_overclock', kind: 'skill', displayLabel: '강화', name: '오버클럭', maxStacks: 2,
    description: '필요 마나 18% 감소 · 시전 시 30% 확률로 마나 소비 없음',
    effect: {}, skillMod: { manaMaxMult: 0.82, freeCastChance: 0.3 }, requiresSkill: 'any' },
  { id: 'skill_battery', kind: 'skill', displayLabel: '강화', name: '축전지', maxStacks: 3,
    description: '시전 후 마나 25가 남는다 (다음 스킬이 그만큼 빨라진다)',
    effect: { startingMana: 25 }, requiresSkill: 'any' },
  { id: 'skill_focus', kind: 'skill', displayLabel: '강화', name: '집중', maxStacks: 2,
    description: '스킬 피해 +25%, 필요 마나 10% 감소',
    effect: { skillDamageMult: 1.25, manaMaxMult: 0.9 }, requiresSkill: 'any' },
  /**
   * 폭발 (2026-07-18, 사용자 지시 — 옛 '폭발 화살'을 대체) — 일제 사격 전용이던
   * 폭발을 **모든 명중**(평타 포함)으로 넓힌다. 대신 스킬 피해 전체에 -30% 대가가
   * 붙는다 — 광역화의 값을 스킬 쪽에서 치른다. '참격'(광역+공격력, combat)이
   * 하던 역할을 사실상 흡수해 참격은 폐기했다. requiresSkill이 없다 — 스킬 없이도 뜬다.
   */
  { id: 'explosion', kind: 'skill', displayLabel: '강화', name: '폭발', maxStacks: 2,
    description: '모든 공격(평타·스킬)이 명중 시 반경 30에 같은 피해로 폭발 · 스킬 피해 -30%',
    effect: { explosionRadius: 30 }, penalty: { skillDamageMult: 0.7 } },
  { id: 'multishot', kind: 'skill', name: '연사', maxStacks: 3,
    description: '일제 사격의 화살 +2발',
    effect: {}, skillMod: { extraTargets: 2 }, requiresSkill: 'volley' },
  { id: 'cyclone', kind: 'skill', name: '회오리', maxStacks: 2,
    description: '소용돌이 반경 +25, 맞은 적을 2초간 40% 감속',
    effect: {}, skillMod: { radiusAdd: 25, slowFactor: 0.6, slowSeconds: 2 }, requiresSkill: 'whirlwind' },
  /**
   * 대재앙 (2026-07-15 재설계).
   *
   * 이전 값(반경 +35, 스킬 피해 +30%)은 **한 카드가 두 곱셈 축을 동시에 키웠다** —
   * 반경은 타격 수를(경로가 1차원이라 선형), damageMult는 한 방을 키운다. 둘이 곱해진다.
   * 측정(아레나·Lv24·더미 40기): 2스택 유성 한 방이 기준의 **×3.14**. 같은 두 장인
   * 증폭(×2.30)을 37% 웃돌았다. 곱연산은 소수 정예여야 한다는 COMPOUNDING_IDS 원칙과 충돌한다.
   *
   * 그래서 피해 배수를 깎는다 (1.3 → 1.15). 반경은 거의 그대로 둔다 — 광역이 넓어지는 건
   * 유성의 정체성이고, 대상 수는 몹이 뭉쳐 있을 때만 늘어나 자기 제동이 걸리기 때문이다.
   *
   * 폭발력은 **스킬 계열을 더 모아야** 나온다 (각성 3장 / 초월 시전 5장). 재측정:
   * 대재앙 2장만이면 완력 3장과 비슷한 수준(×0.92)이고, 스킬 5장을 채우면 크게 벌어진다.
   *
   * 화상 연계도 시도했다가 접었다 — 유성은 마나 160짜리 버스트라 8초에 한 번 나가는데
   * 화상은 3초면 꺼진다. 겹이 쌓이질 않아 화상 기여도가 총딜의 3~6%에 그쳤다.
   * 화염의 연료는 도트(레이저 틱·불바다 장판)여야 한다.
   */
  { id: 'cataclysm', kind: 'skill', name: '대재앙', maxStacks: 2,
    description: '유성 반경 +30, 스킬 피해 +15%',
    effect: {}, skillMod: { radiusAdd: 30, damageMult: 1.15 }, requiresSkill: 'meteor' },
  { id: 'taunt_dummy', kind: 'skill', name: '도발 인형', maxStacks: 1,
    description: '허수아비가 주변 몹을 강제로 끌어당기고 체력 2배',
    effect: {}, skillMod: { decoyHpMult: 2, decoyTaunts: true }, requiresSkill: 'decoy' },

  // ── 레이저 개조 — 사거리 / 도트 간격 (집속 렌즈는 폐기 — 2026-07-18, 사용자 지시)
  // 증폭 코일이 고속 조사의 틱 간격 효과를 흡수한다 — 길이 늘리는 김에 화력 밀도도 올린다.
  { id: 'laser_range', kind: 'skill', name: '증폭 코일', maxStacks: 2,
    description: '레이저 길이 +90, 지속 +1.5초, 도트 간격 0.25초로 감소(피해 두 배)',
    effect: {}, skillMod: { beamLengthAdd: 90, beamSecondsAdd: 1.5, tickIntervalMult: 0.5 },
    requiresSkill: 'laser' },
  { id: 'laser_rapid', kind: 'skill', name: '고속 조사', maxStacks: 1,
    description: '레이저 도트 간격 절반 (0.5초 → 0.25초 = 피해 두 배)',
    effect: {}, skillMod: { tickIntervalMult: 0.5 }, requiresSkill: 'laser' },

  // ── 장판 개조 (불화살·얼음화살 — 장판이 있는 스킬에만 뜬다)
  { id: 'zone_wide', kind: 'skill', name: '넓은 화선', maxStacks: 2,
    description: '장판 반경 +30, 지속 +3초',
    effect: {}, skillMod: { zoneRadiusAdd: 30, zoneSecondsAdd: 3 }, requiresZone: true },
  { id: 'zone_hot', kind: 'skill', name: '맹렬한 불길', maxStacks: 2,
    description: '장판 초당 피해 +공격력 0.8배 (빙판도 태우기 시작한다)',
    effect: {}, skillMod: { zoneDpsAdd: 0.8 }, requiresZone: true },

  // ── 모든 스킬 공용 개조 (표시상 "강화" — requiresSkill:'any')
  { id: 'skill_frostbite', kind: 'skill', displayLabel: '강화', name: '한파', maxStacks: 2,
    description: '스킬에 맞은 적을 3초간 45% 감속 (모든 스킬)',
    effect: {}, skillMod: { slowFactor: 0.55, slowSeconds: 3 }, requiresSkill: 'any' },
  { id: 'skill_barrage', kind: 'skill', displayLabel: '강화', name: '다중 투사', maxStacks: 2,
    description: '스킬 대상 +2 (일제 사격·처형) · 튕김 +2회 (튕기는 사격)',
    effect: {}, skillMod: { extraTargets: 2 }, requiresSkill: 'any' },
  // 맞으면 마나가 찬다 — 탱커가 스킬을 난사하는 축
  { id: 'skill_riposte', kind: 'skill', displayLabel: '강화', name: '반격 집중', maxStacks: 3,
    description: '피격 시 마나 +12 (기본 8에 더해)',
    effect: { manaOnDamaged: 12 }, requiresSkill: 'any' },

  // ══ 성장 (growth) — 누적. 아레나 9% / TFT 5%였고 우리는 0%였다.
  // 처치 스택은 **영웅이 막타를 친 몹**만 센다 (타워 막타는 안 센다).
  // %(killStackDamage) → 고정치(killStackFlatDamage) (2026-07-18, 사용자 지시: "막타마다
  // 성장하는거 전부 %대신 수치로"). 상한도 함께 폐지 — waveStackDamage처럼 그대로 쌓인다.
  { id: 'hunterinstinct', kind: 'growth', name: '사냥 본능',
    description: '막타마다 공격력 +2 (누적)', maxStacks: 2,
    effect: { killStackFlatDamage: 2 } },
  { id: 'bloodthirst', kind: 'growth', name: '피의 갈증',
    description: '막타마다 공격력 +1 (누적), 가한 피해의 2% 회복', maxStacks: 2,
    effect: { killStackFlatDamage: 1, lifesteal: 0.02 } },
  { id: 'veteran', kind: 'growth', name: '역전의 용사', description: '라운드마다 공격력 +3% (영구 누적)',
    maxStacks: 3, effect: { waveStackDamage: 0.03 } },
  { id: 'ironblood', kind: 'growth', name: '강철 혈통', description: '라운드마다 최대 체력 +5% (영구 누적)',
    maxStacks: 3, effect: { waveStackHp: 0.05 } },
  { id: 'momentum', kind: 'growth', name: '가속',
    description: '라운드마다 공격력 +2%, 최대 체력 +2% (영구 누적)', maxStacks: 2,
    effect: { waveStackDamage: 0.02, waveStackHp: 0.02 } },
  // TFT 'Soul Awakening' — 성장을 성장시킨다. 성장 특화의 핵심 카드.
  // [곱연산] 성장 누적치에 통째로 곱해진다
  { id: 'evolution', kind: 'growth', name: '진화', description: '[곱] 성장 누적치 ×1.4',
    maxStacks: 1, effect: { growthMult: 1.4 } },
  // %(killStackDamage) → 고정치(killStackFlatDamage) (2026-07-18, 사용자 지시).
  // waveStackDamage(라운드 누적)처럼 상한 없이 그대로 쌓인다 — 같은 카드의 두 축을 통일.
  { id: 'adaptive', kind: 'growth', name: '적응',
    description: '막타마다 공격력 +1 (누적), 라운드마다 공격력 +1.5%', maxStacks: 3,
    effect: { killStackFlatDamage: 1, waveStackDamage: 0.015 } },
  { id: 'relentless', kind: 'growth', name: '집념',
    description: '막타마다 공격력 +3 (누적) · 최대 체력 -15%', maxStacks: 1,
    effect: { killStackFlatDamage: 3 }, penalty: { hpMult: 0.85 } },
  { id: 'warmachine', kind: 'growth', name: '전쟁 기계',
    description: '라운드마다 공격력 +5% (영구 누적) · 이동 속도 -10%', maxStacks: 2,
    effect: { waveStackDamage: 0.05 }, penalty: { moveSpeedMult: 0.9 } },

  // ══ 경제 (econ) — 수입과 경험치. TFT 증강의 중심축(43%)이 여기다.
  { id: 'greed', kind: 'econ', name: '탐욕', description: '처치당 금화 +2', maxStacks: 3,
    effect: { mineralPerKill: 2 } },
  { id: 'harvest', kind: 'econ', name: '수확', description: '라운드 보상 +40%', maxStacks: 3,
    effect: { waveRewardMult: 1.4 } },
  { id: 'gasvein', kind: 'econ', name: '마정석 정맥', description: '라운드마다 마정석 +5', maxStacks: 3,
    effect: { gasPerWave: 5 } },
  { id: 'scholar', kind: 'econ', name: '학자', description: '경험치 획득 +40%', maxStacks: 3,
    effect: { xpMult: 1.4 } },
  { id: 'prospector', kind: 'econ', name: '시굴자', description: '처치당 금화 +1, 라운드 보상 +25%',
    maxStacks: 2, effect: { mineralPerKill: 1, waveRewardMult: 1.25 } },
  { id: 'apprentice', kind: 'econ', name: '수련', description: '경험치 획득 +20%, 처치당 금화 +1',
    maxStacks: 3, effect: { xpMult: 1.2, mineralPerKill: 1 } },
  // 아레나 'GoH 갈망' 계열 — 힘을 팔아 돈을 산다
  { id: 'tycoon', kind: 'econ', name: '재벌', description: '라운드 보상 +90% · 공격력 -15%',
    maxStacks: 2, effect: { waveRewardMult: 1.9 }, penalty: { damageMult: 0.85 } },
  { id: 'bounty', kind: 'econ', name: '현상금 사냥꾼', description: '처치당 금화 +4 · 최대 체력 -10%',
    maxStacks: 2, effect: { mineralPerKill: 4 }, penalty: { hpMult: 0.9 } },
  { id: 'investment', kind: 'econ', name: '투자', description: '라운드마다 마정석 +8 · 부활 대기 3초 증가',
    maxStacks: 2, effect: { gasPerWave: 8 }, penalty: { respawnCut: -3 } },

  // ══ 유틸 (util) — 기동 · 부활 · 타워 지휘 · 어그로
  // 타워 지휘 3종 상향 (2026-07-16 2차): "타워 증강 2장 이상이면 끝까지 타워가 영웅을
  // 앞선다"(사용자 지시)를 실버 대 실버 기준으로 보장 — hero-curve.test.ts 앵커가 지킨다.
  { id: 'warlord', kind: 'util', name: '전쟁군주', description: '모든 타워 공격력 +20%', maxStacks: 3,
    effect: { towerDamageMult: 1.2 } },
  { id: 'commander', kind: 'util', name: '지휘관', description: '모든 타워 공격력 +10%, 타워 사거리 +10%',
    maxStacks: 3, effect: { towerDamageMult: 1.1, towerRangeMult: 1.1 } },
  { id: 'rally', kind: 'util', name: '결집', description: '모든 타워 사거리 +15%', maxStacks: 2,
    effect: { towerRangeMult: 1.15 } },
  { id: 'swift', kind: 'util', name: '신속', description: '이동 속도 +25%', maxStacks: 2,
    effect: { moveSpeedMult: 1.25 } },
  { id: 'phoenix', kind: 'util', name: '불사조', description: '부활 대기 4초 감소', maxStacks: 2,
    effect: { respawnCut: 4 } },
  // 어그로를 넓힌다 — 영웅의 본업(몹 모으기)을 강화한다
  { id: 'provoke', kind: 'util', name: '도발', description: '어그로 범위 +50% (더 많이 붙잡는다)',
    maxStacks: 2, effect: { aggroRangeMult: 1.5 } },
  { id: 'vanguard', kind: 'util', name: '선봉', description: '어그로 범위 +35%, 받는 피해 10% 감소',
    maxStacks: 2, effect: { aggroRangeMult: 1.35, damageReduction: 0.1 } },
  { id: 'beacon', kind: 'util', name: '봉화', description: '모든 타워 공격력 +25% · 이동 속도 -15%',
    maxStacks: 2, effect: { towerDamageMult: 1.25 }, penalty: { moveSpeedMult: 0.85 } },
  { id: 'martyr', kind: 'util', name: '순교', description: '부활 대기 6초 감소 · 최대 체력 -10%',
    maxStacks: 1, effect: { respawnCut: 6 }, penalty: { hpMult: 0.9 } },
  /**
   * 복제 장치 — 라운드 중에 타워를 하나 찍어두면 라운드가 끝날 때 똑같은 게 하나 더 생긴다.
   * 복제는 생성 비용을 올리지 않는다(unitsSpawned를 안 건드린다) — 그게 값어치다.
   * 복제 가능 티어 상한은 라운드·영웅 레벨을 따라 오른다: 초반엔 싸구려만, 후반엔 GOD까지.
   */
  { id: 'replicator', kind: 'util', name: '복제 장치',
    description: '라운드마다 타워 하나를 복제한다 (복제 가능 등급은 라운드·레벨을 따라 오른다)',
    maxStacks: 3, effect: { towerCopyTier: 1 } },
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
  // 스킬 획득 증강은 기본 스킬(강타)을 들고 있을 때만 뜬다 — 교체 제안이다.
  // 증강으로 얻은 진짜 스킬이 있으면 더 안 나온다 (영웅은 스킬 하나).
  if (augment.grantsSkill) return currentSkill === null || currentSkill === DEFAULT_SKILL;
  // 장판 개조는 장판을 까는 스킬을 든 뒤에만 — 즉발 스킬엔 붙일 데가 없다
  if (augment.requiresZone) {
    return currentSkill !== null && (SKILLS[currentSkill].zoneSeconds ?? 0) > 0;
  }
  if (!augment.requiresSkill) return true;
  if (currentSkill === null) return false;
  return augment.requiresSkill === 'any' || augment.requiresSkill === currentSkill;
}

// ───────── 특화 시너지 ─────────
// 증강 하나하나는 곱연산이라 이미 복리로 붙는다. 여기에 "같은 계열을 모으면 더 준다"를
// 얹으면, 세 번째 증강을 고르는 순간 눈에 띄게 세지는 구간이 생긴다 — 파워 인플레의 체감.
//
// 계열이 기능축이 되면서 특화가 곧 플레이 스타일이 됐다.
// 성장 대특화는 눈덩이, 경제 대특화는 부자, 특수 대특화는 발동 효과의 축제다.

/**
 * 적응형 뽑기 가중치 — 이미 든 계열일수록 더 잘 뜬다.
 * weight = 1 + ADAPTIVE_KIND_WEIGHT × (그 계열 보유 수).
 */
export const ADAPTIVE_KIND_WEIGHT = 0.9;

// ───────── 증강 리롤 — 무료 (2026-07-18, 사용자 지시) ─────────
// 마정석 소비 폐지, 선택 하나당 무료 리롤 1회로 축소 (기존: 마정석 소비 · 최대 2회).
export const AUGMENT_REROLL_MAX = 1;

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
  stat: {
    specialist: { name: '완숙', description: '공격력 +40%, 최대 체력 +30%',
      effect: { damageMult: 1.4, hpMult: 1.3 } },
    master: { name: '초월', description: '공격력 +90%, 최대 체력 +60%, 이동 속도 +20%',
      effect: { damageMult: 1.9, hpMult: 1.6, moveSpeedMult: 1.2 } },
  },
  defense: {
    specialist: { name: '불굴', description: '받는 피해 20% 추가 감소, 초당 체력 8 회복',
      effect: { damageReduction: 0.2, regen: 8 } },
    master: { name: '불멸', description: '받는 피해 30% 추가 감소, 초당 체력 20 회복, 최대 체력 +40%',
      effect: { damageReduction: 0.3, regen: 20, hpMult: 1.4 } },
  },
  combat: {
    specialist: { name: '연쇄', description: '광역 반경 +25, 치명타 +25%, 화상 지속 +2초',
      effect: { splashRadius: 25, critChance: 0.25, burnSecondsAdd: 2 } },
    master: { name: '파멸', description: '광역 반경 +50, 체력 10% 이하 즉사, 공격력 +80%, 화상 대상 피해 +25%',
      effect: { splashRadius: 50, executeBelow: 0.1, damageMult: 1.8, burnAmp: 0.25 } },
  },
  skill: {
    specialist: { name: '각성', description: '스킬 피해 +40%, 마나 획득 +25%',
      effect: { skillDamageMult: 1.4, manaGainMult: 1.25 } },
    master: { name: '초월 시전', description: '스킬 피해 +100%, 필요 마나 30% 감소, 마나 획득 +40%',
      effect: { skillDamageMult: 2, manaMaxMult: 0.7, manaGainMult: 1.4 } },
  },
  growth: {
    specialist: { name: '폭주', description: '모든 성장 증강의 누적치 +50%',
      effect: { growthMult: 1.5 } },
    master: { name: '무한 성장', description: '모든 성장 증강의 누적치 +120%, 공격력 +40%',
      effect: { growthMult: 2.2, damageMult: 1.4 } },
  },
  econ: {
    specialist: { name: '축재', description: '처치당 금화 +2, 라운드 보상 +30%, 경험치 +25%',
      effect: { mineralPerKill: 2, waveRewardMult: 1.3, xpMult: 1.25 } },
    master: { name: '대부호', description: '라운드 보상 +80%, 라운드마다 마정석 +8, 경험치 +60%',
      effect: { waveRewardMult: 1.8, gasPerWave: 8, xpMult: 1.6 } },
  },
  util: {
    specialist: { name: '지휘', description: '모든 타워 공격력 +15%', effect: { towerDamageMult: 1.15 } },
    master: { name: '군주', description: '모든 타워 공격력 +35%·사거리 +15%, 부활 대기 4초 감소',
      effect: { towerDamageMult: 1.35, towerRangeMult: 1.15, respawnCut: 4 } },
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
