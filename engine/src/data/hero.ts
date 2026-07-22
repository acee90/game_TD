import { SKILLS, type SkillId, type SkillModPatch } from './skills';

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
// 0.8 → 1.0 → **1.9034** (2026-07-20, 사용자 지시: "20% 낮추기" → "1레벨 기준 0.7/초").
// 간격이 기준값이라 **모든 레벨이 균일하게** 내려간다 — 곡선 모양은 그대로고 높이만 낮아진다.
// Lv1 공속 배수 1.3324를 0.7/초로 만드는 값이 1.3324/0.7 = 1.9034다.
// 무증강 실측: Lv1 1.67 → **0.70**/초 · Lv40 3.02 → **1.27**/초 (원래의 42%).
// 공속은 평타 DPS이자 **마나 회전**이라 스킬 시전 빈도도 같은 비율로 느려진다 —
// 영웅 평타 축을 사실상 접고 타워를 주축으로 되돌리는 조정이다.
export const HERO_ATTACK_INTERVAL = 1.9034;
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
// 5 → 6 (2026-07-20, 사용자 지시: "기본 영웅 공격력 20% 올려줘").
// 같은 날 공속을 0.7/초로 크게 내린 뒤라, 한 방을 키워 평타 DPS 손실을 일부 되돌린다
// (Lv1 DPS 7 → 8.4). 공속이 아니라 피해로 돌려주므로 **마나 회전은 안 빨라진다** —
// 스킬 남발이 아니라 평타 자체만 회복된다.
export const DMG_PER_STR = 6;
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

/**
 * 민첩 공속 — 포화식 (2026-07-19, 사용자 지시: "레벨당 공속 증가율 감소, Lv40 기준 3.0/초").
 *
 * 민첩은 자동 균등 성장으로 레벨에 초선형으로 자라서(Lv40 민첩 84) 선형 공속으로는
 * 무증강도 Lv20~30에 하한(0.25s)에 박혔다 — 이후 민첩·레벨 공속이 전부 낭비되고,
 * 영웅 몰빵 평타 DPS가 서고점을 만든다. 포화식(AS_PER_AGI×agi/(1+agi/CAP))으로 눌러
 * 기여 상한을 +AS_PER_AGI×CAP(= +129%)로 둔다.
 *
 * 상수(0.056/23)는 두 앵커의 재적합 해다 — **Lv1 1.67/초(기존 그대로 — 저레벨을
 * 건드리면 Lv1 보스 앵커 boss-balance.test.ts가 깨진다) · Lv40 3.0/초(사용자 지시)**.
 * 무증강 기준: Lv1 1.67 · Lv10 1.9 · Lv20 2.3 · Lv30 2.7 · **Lv40 3.0** · Lv56 3.4.
 */
export const AS_PER_AGI = 0.056;
export const AS_AGI_SOFT_CAP = 23;
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
// 0.0125 → 0.005 (2026-07-19, 사용자 지시): 민첩 소프트캡과 세트 — 레벨 축 공속도
// 완만하게. Lv40 무증강 3.0/초 앵커의 나머지 절반을 이 축이 만든다.
// 0.005 → 0.045 (2026-07-21, 사용자 지시: "만렙 20 기준 공속 1.9~2.0"): Lv20 하드캡
// 체제의 새 앵커. 민첩 지수 성장은 포화식에 먹혀 공속을 거의 못 올리므로(만렙 +97%가
// 상한) 레벨 축이 나머지를 만든다 — Lv1 0.73/초는 거의 그대로 두고(보스 앵커 보존)
// 만렙 1.96/초에 맞춘 재적합 해다. 무증강: Lv1 0.73 · Lv10 1.24 · Lv15 1.59 · Lv20 1.96.
export const LEVEL_ATTACK_SPEED_RATE = 0.045;
/** 공격 간격 하한 — 민첩을 아무리 골라도 이 밑으로는 안 내려간다 */
export const MIN_ATTACK_INTERVAL = 0.25;
/**
 * 지능 1당 스킬 피해. 0.035 → 0.012 (2026-07-21, 스탯 지수 성장과 세트) —
 * 지능 종점이 23 → 69로 커진 비율만큼 낮춰 **만렙 스킬 피해(+83%)를 보존**한다.
 * 곡선 모양만 지수가 되고 만렙 앵커는 그대로다.
 */
export const SKILL_PER_INT = 0.012;

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
/**
 * **만렙** (2026-07-20, 사용자 지시). 여기까지는 지수로 크고, 넘어서면 선형으로만 큰다.
 *
 * 만렙을 두는 이유는 두 가지다.
 * ① **"영웅만 강해지는 빌드"를 구조적으로 막는다** — 상한이 있으면 후반은 반드시 타워가
 *    주축이 된다. 타워는 골드로 계속 크지만 영웅은 여기서 멈춘다.
 * ② **XP 구매가 '격차'가 아니라 '타이밍'을 사는 것이 된다** — 어차피 모두가 만렙에
 *    닿으므로, 골드를 넣는 값어치는 *언제 닿느냐*뿐이다. 그래서 "타워를 더 지을까,
 *    만렙을 앞당길까"가 배타적 선택이 아니라 템포 선택이 된다.
 *
 * 20으로 잡은 근거: 실측에서 XP를 안 사면 R40에 Lv15~16에서 멈췄다(R59까지 그대로).
 * 20은 자연 성장으로 **닿을락 말락 한 지점**이라, 구매가 의미를 갖되 필수는 아니다.
 *
 * **하드캡이다** (2026-07-21, 사용자 지시 — 소프트캡에서 변경). Lv20에서 레벨업이
 * 완전히 멈추고 초과 경험치는 버려지며 XP 구매도 잠긴다. 만렙 이후 영웅이 강해지는
 * 길은 **증강 강화뿐**이다 — 레벨은 바닥을 깔고, 골드는 강화(등급)로 들어간다.
 * (예전의 만렙 후 선형 성장 POST_MAX_STAT_POINTS는 이 결정으로 폐지.)
 */
export const HERO_MAX_LEVEL = 20;

/**
 * 스탯 성장 — **지수 곡선** (2026-07-21, 사용자 지시: "영웅 스탯 지수그래프로 증가").
 *
 * 전에는 레벨당 포인트(1 + floor(L/6) + 후반 가산)를 누적해 3등분하는 계단식 가산이었다.
 * 만렙이 Lv20 하드캡이 되면서 지수의 위험(무한 폭주)이 사라졌으므로, 곡선을
 * `기본값 × 1.12^(레벨-1)`로 단순화한다 — 레벨 하나하나가 뒤로 갈수록 확 커지고,
 * 만렙 직전 구간이 성장의 절정이 된다.
 *
 * 1.12의 근거: 힘 종점이 2 → 17.2로 **옛 계단식 곡선의 만렙 종점(17.3)과 일치**한다 —
 * 힘이 정하는 공격력·체력의 만렙 앵커는 그대로 두고 곡선 모양만 지수로 바꾼다.
 * 민첩·지능은 기본값(8)이 커서 종점이 23 → 69로 크게 오른다: 민첩은 포화식이
 * 흡수하고(공속 앵커는 LEVEL_ATTACK_SPEED_RATE로 잡는다), 지능은 SKILL_PER_INT를
 * 같은 비율로 낮춰 만렙 스킬 피해를 보존한다.
 */
export const HERO_STAT_GROWTH = 1.12;

export interface HeroAttributes {
  readonly str: number;
  readonly agi: number;
  readonly int: number;
}

/** UI와 전투 계산이 공유하는 레벨별 실제 능력치. 만렙(하드캡) 값으로 잘라둔다. */
export function attributesByLevel(level: number): HeroAttributes {
  const mult = Math.pow(HERO_STAT_GROWTH, Math.min(level, HERO_MAX_LEVEL) - 1);
  return {
    str: HERO_BASE_STR * mult,
    agi: HERO_BASE_AGI * mult,
    int: HERO_BASE_INT * mult,
  };
}

/**
 * XP 골드 구매 (TFT식). **1골드 = 1XP → 3골드 = 1XP** (2026-07-20, 사용자 지시:
 * "XP 구매로 레벨업하는데 골드 많이 들도록").
 *
 * 만렙이 생기면서 구매의 성격이 바뀌었다. 어차피 모두가 만렙에 닿으므로 구매는
 * **도달 시점만 앞당긴다** — 그런데 앞당기면 보스 사냥·증강이 다 빨라져 복리로 돌아온다.
 * 그래서 **골드 효율은 나쁘게** 두는 것이 맞다: 값이 싸면 "무조건 사는" 정답 수순이 된다.
 *
 * 만렙까지 순수 구매 시 2,073골드 — R45 수입 저점(5,458)의 38%다. 큰 결심이되 불가능하진 않다.
 */
export const XP_BUY_GOLD = 60;
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
 * 킬 XP — **주 연료로 되돌린다** (0.3 → 0.5, 2026-07-20, 사용자 지시).
 *
 * 만렙 20(HERO_MAX_LEVEL) 도입으로 성장의 의미가 바뀌었다. 그전에는 골드 구매가
 * 주 연료라 "돈을 안 쓰면 영영 안 큰다"였고, 실측에서 XP를 안 사면 **Lv15~16에서
 * 멈췄다**(R40 이후 정지). 이제는 **자연 성장만으로 R45쯤 만렙에 닿는 것**이 기준선이고,
 * 골드 구매는 그 시점을 **앞당기는** 수단이다 — 격차가 아니라 타이밍을 산다.
 *
 * 목표 레벨 속도: 킬+보스 XP만으로 R45 전후 Lv20.
 */
export const XP_PER_MOB = 0.5;
export const HERO_LASTHIT_XP_MULT = 2;
export const xpPerBoss = (level: number): number => 8 * level;

/** 부활 대기시간. 죽으면 그동안 영웅 딜이 빠지는 것 자체가 패널티다. */
export const HERO_RESPAWN_SECONDS = 12;

/**
 * 이 거리 안에 영웅이 보이면 몹이 멈춰서 영웅부터 친다.
 *
 * **기본값 0** (2026-07-20, 사용자 지시: "영웅 기본 어그로 기능 제거 — 증강 얻어야만
 * 어그로 끌도록"). 어그로 탱킹은 이제 **선택한 빌드**지 영웅이 그냥 갖는 기능이 아니다.
 * 아무것도 안 든 영웅 옆으로 몹이 그냥 지나간다.
 *
 * 도발 계열 증강은 배수(aggroRangeMult)라 0에 곱하면 영영 0이다 — 그래서 그 증강들이
 * **기저값(AGGRO_RANGE_BASE)을 켜는** 방식으로 바뀌었다. computeStats 참고.
 */
export const HERO_AGGRO_RANGE = 0;

/**
 * 어그로 증강이 켜주는 기저 범위 — 옛 기본값이 여기로 옮겨왔다.
 * 도발 1장이면 이 범위(× 그 증강의 배수)부터 시작한다.
 */
export const AGGRO_RANGE_BASE = 110;

/**
 * **어그로 수 상한 — 범위에서 분리한다** (2026-07-20, 사용자 지시).
 *
 * 그전에는 `범위 ÷ 22`라 범위를 넓히는 증강이 수까지 같이 올렸다. 도발 2스택이면
 * **10기**가 되는데 웨이브가 15기니까 **67%를 무한 정지**시킨다 — 이건 슬로우를
 * 압도하는 정도가 아니라 게임을 지운다.
 *
 * **어그로는 무한 슬로우다.** 슬로우는 아무리 세도 체류 시간 ×2.2가 천장이지만
 * (속도를 0으로 못 만든다) 어그로는 시간 축을 무한대로 보낸다 — 같은 종류의 효과가
 * 아니라 다른 등급이다. 그래서 **수를 아주 작게** 묶는 것이 유일한 안전판이다.
 *
 * 킹덤러쉬가 같은 문제를 푸는 방식을 참고했다: 병사 1명당 적 1기, 병영당 3명.
 * 시간 제한 없이 **점유 수**로만 총량을 묶고, 병사가 죽으면 풀린다. 우리는 영웅
 * 사망(12초 부활)이 그 자리를 대신하되, 회복 증강으로 안 죽을 수 있으므로 수 상한이
 * 더 중요하다.
 *
 * 범위는 **어디서 끌어오나**(위치 선택), 스택은 **몇 기를 붙잡나**로 완전히 갈랐다.
 * 15기 웨이브 기준 2기=13% · 3기=20% · 5기=33%라, 5가 슬로우와 비교 가능한 상한이다.
 */
export const AGGRO_CAP_BY_STACKS: readonly number[] = [0, 2, 3, 5];

/** 어그로 증강 스택 수 → 동시에 붙잡는 몹 수 */
export const aggroCap = (stacks: number): number =>
  AGGRO_CAP_BY_STACKS[Math.min(Math.max(0, Math.round(stacks)), AGGRO_CAP_BY_STACKS.length - 1)];
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
// 2026-07-21 사용자 지시: 몬스터 공격력 1/2. 체력 상향과 역할을 분리해 타워 화력은
// 단단한 몹으로 시험하되, 영웅·허수아비가 받는 접촉 압력은 절반으로 낮춘다.
export const ENEMY_DAMAGE_BASE = 0.5;
export const ENEMY_DAMAGE_PER_ROUND = 0.3;
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
 * 증강을 받는 **라운드** (2026-07-20, 사용자 지시: "r5,10,25,35에 증강 받도록").
 *
 * 레벨 기준(`[5,10,24,30,35,42]` + 8레벨마다)이었다. 그런데 실측에서 **XP를 안 사면
 * 영웅이 Lv15~16에서 멈춘다**(R40 이후 성장 정지) — 3번째 증강(Lv24)부터 끝까지가
 * **구조적으로 도달 불가능한 죽은 콘텐츠**였다. 40여 종 풀에서 실제로 뽑는 건 2장뿐이고,
 * 특화 시너지(3장 각성 / 5장 초월)는 영영 못 봤다.
 *
 * 라운드 기준으로 옮기면 **누구나 네 장을 전부 받는다.** 대신 장수를 6+α → 4장으로 줄여
 * 한 장의 무게를 키웠다 — 이제 영웅 파워는 "몇 장 모았나"가 아니라
 * **"가진 것을 얼마나 강화했나"**로 간다(증강 강화 시스템).
 */
export const AUGMENT_ROUNDS: readonly number[] = [5, 10, 25, 35];

/**
 * **스킬 드래프트 레벨** (2026-07-20, 사용자 지시: "처음으로 제대로된 스킬을 얻는다").
 *
 * 여기서 고르는 것은 증강이 아니라 **액티브 스킬 그 자체**다. 그 전까지 영웅은
 * 시작 장비 '강한 일격'(단일 대상 3배)만 들고 있다 — 일부러 초라하게 두어
 * 이 순간이 판의 분기점이 되게 한다.
 *
 * Lv9 → Lv12 → **R15** (2026-07-20). 레벨 기준이었다가 증강이 라운드 기준으로
 * 옮겨가면서(AUGMENT_ROUNDS) 같이 옮겼다 — 두 축이 다른 단위를 쓰면 순서가 판마다
 * 뒤바뀐다.
 *
 * R15는 **증강 두 장(R5·R10)을 받은 직후**다. 빌드 방향이 드러난 뒤에 스킬로 답한다는
 * 순서를 유지한다. ("스킬을 먼저 정해야 증강이 그에 답한다"는 반대 논리는 실측으로
 * 기각했다 — 46종 증강 중 스킬에 잠긴 것은 3장뿐이라 순서를 뒤집어도 잃는 게 없다.)
 */
export const SKILL_DRAFT_ROUND = 15;

/** 이 라운드에 스킬 드래프트를 받는가 */
export const grantsSkillDraft = (round: number): boolean => round === SKILL_DRAFT_ROUND;

/** 한 번에 보여주는 스킬 후보 수 */
export const SKILL_DRAFT_CHOICES = 3;

/**
 * 스킬 드래프트는 **카드마다 리롤 1회씩** (사용자 지시). 증강 카드별 리롤과 같은 원리지만,
 * 스킬은 "무엇을 지킬지"가 더 직접적이다 — 마음에 드는 한 장은 두고 나머지만 바꾸므로
 * "무엇을 지킬지"가 선택이 된다.
 */
export const SKILL_DRAFT_CARD_REROLLS = 1;
export const AUGMENT_TAIL_EVERY = 8;
export const AUGMENT_CHOICES = 3;

/** 이 라운드에 진입하면 증강을 받는가 */
export const grantsAugment = (round: number): boolean => AUGMENT_ROUNDS.includes(round);

/** 다음 증강 라운드 — UI 예고용 ("다음 증강 R25"). 다 받았으면 null */
export function nextAugmentRound(round: number): number | null {
  return AUGMENT_ROUNDS.find((r) => r > round) ?? null;
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
  /**
   * 어그로 스택 — 이 값이 쌓여 **동시에 붙잡는 몹 수**를 정한다(AGGRO_CAP_BY_STACKS).
   * 범위(aggroRangeMult)와 별개다: 범위는 어디서 끌어오나, 스택은 몇 기를 붙잡나.
   */
  readonly aggroStack?: number;
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
  /** 획득 즉시 주는 금화 (일회성). 라운드마다가 아니라 고를 때 한 번 (2026-07-21) */
  readonly instantMineral?: number;
  /** 획득 즉시 주는 마정석 (일회성, 2026-07-21 일시불 계열) */
  readonly instantGas?: number;
  /** 획득 즉시 주는 영웅 경험치 (일회성, 2026-07-21). 카드가 예상 레벨을 미리 보여준다 */
  readonly instantXp?: number;
  /**
   * 획득 즉시 랜덤 타워를 준다 (일회성, 2026-07-21 — 복제 장치 대체).
   * 값은 켜짐 플래그(1)일 뿐이고, 등급별 지급량은 TOWER_ROLL_BY_RARITY가 정한다 —
   * 티어는 인덱스라 선형 등급 배수(scaleEffect)로 키우면 안 된다(towerCopyTier와 같은 이유).
   */
  readonly towerRoll?: number;
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
   * 몹이 죽을 때마다 공격력 +이 값 (고정치, 상한 없음).
   * **누가 잡았든 센다** (2026-07-21, 사용자 지시: "막타마다 → 몬스터 처치시마다") —
   * 전에는 영웅 막타만 세서 컨트롤에 따라 고점이 크게 출렁였다. 타워 처치까지 세면
   * 라운드당 이벤트 수가 몹 수로 수렴해 성장 속도가 예측 가능해진다. 대신 값은
   * 막타 시절의 1/4로 내렸다(라운드당 막타 ~4기 vs 전체 처치 ~15기+ 환산).
   * 예전엔 %(killStackDamage, 등급별 상한 포함)였으나 2026-07-18 전부 고정치로 옮겼다.
   */
  readonly killStackFlatDamage?: number;
  // waveStackDamage(라운드마다 공격력 영구 누적)는 2026-07-21 폐지 — 아무 행동 없이
  // 시간만으로 크는 축이라 제거했다(사용자 지시). 체력 쪽(waveStackHp)은 탱킹축이라 남긴다.
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
export const COMPOUNDING_IDS: readonly string[] = ['glasscannon', 'evolution'];
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

/**
 * 드래프트가 주는 기본 등급 — **언제나 실버** (2026-07-20, 사용자 지시:
 * "증강 강화 기능을 넣었으므로 골드·플래티넘 등급은 삭제").
 *
 * 전에는 뽑을 때 등급이 랜덤으로 붙었다(실버 55% · 골드 33% · 플래티넘 12%).
 * 그런데 **증강 강화**가 등급을 올리는 시스템이 되면서 등급의 출처가 둘이 됐다 —
 * 같은 것을 두 곳에서 굴리면 어느 쪽이 내 빌드를 만들었는지 읽히지 않는다.
 *
 * 이제 등급은 **강화로만** 오른다. 뽑기 운은 "어떤 증강이 뜨는가"만 정하고,
 * "얼마나 센가"는 플레이어가 골드로 정한다.
 */
export const DRAFT_RARITY: Rarity = 'silver';

/** 가중치에 따라 등급 하나를 뽑는다 (지금은 시트·테스트 전용 — 드래프트는 안 쓴다) */
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
    // 스택은 개수라 등급으로 안 키운다 — 등급이 붙잡는 수를 늘리면 상한이 무너진다
    aggroStack: effect.aggroStack,
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
    // 티어 인덱스라 등급 배수로 안 키운다 — 지급량은 TOWER_ROLL_BY_RARITY가 등급별로 정한다
    towerRoll: effect.towerRoll,
    // 일시금은 등급 배수를 안 탄다 — 획득 시 실버 몫을 받고, 강화 일시금은 그 시점의
    // **강화 구매 비용** 기준으로 game이 따로 지급한다 (instantUpgradeGrant, 2026-07-21)
    instantMineral: effect.instantMineral,
    instantGas: effect.instantGas,
    instantXp: effect.instantXp,
    mineralPerKill:
      effect.mineralPerKill === undefined ? undefined : Math.round(add(effect.mineralPerKill)!),
    mineralPerWave:
      effect.mineralPerWave === undefined ? undefined : Math.round(add(effect.mineralPerWave)!),
    gasPerWave: effect.gasPerWave === undefined ? undefined : Math.round(add(effect.gasPerWave)!),
    respawnCut: add(effect.respawnCut),
    killStackFlatDamage: add(effect.killStackFlatDamage),
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
  ['xpMult', '경험치'], ['aggroRangeMult', '어그로 범위'], ['aggroStack', '어그로 대상'],
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
  ['respawnCut', '부활 대기 감소', '초'], ['killStackFlatDamage', '처치당 공격력', ''],
  ['waveStackHp', '라운드마다 체력', ''], ['manaOnDamaged', '피격 마나', ''],
  ['instantMineral', '즉시 금화', ''], ['instantGas', '즉시 마정석', ''],
  ['instantXp', '즉시 경험치', ''],
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
 * 증강 풀 — 데이터 56종, 실제 드래프트 33종 (2026-07-21 대정리).
 *
 * 정리 원칙 (사용자 지시): 모든 카드는 실버로 뽑히고 **증강 강화**가 등급을 올린다.
 * 그러므로 같은 축의 변형 카드(A+B 조합·대가형·상위판)는 중복이다 — 축마다 한 장만 남긴다.
 * 삭제된 변형: 가시오라·요새·피의 계약·석화 피부(방어), 역전의 용사·가속·적응·전쟁
 * 기계(라운드 성장), 과부하·집중·마나 순환·오버클럭·축전지·반격 집중(스킬 마나/피해 변형),
 * 연사·회오리·대재앙·도발 인형·증폭 코일·고속 조사·넓은 화선·맹렬한 불길(특정 스킬 전용),
 * 지휘관·결집·봉화(타워 지휘 변형), 선봉(어그로 변형), 순교(부활 변형), 투자(경제 대가형),
 * 복제 장치(→ 긴급 증원으로 교체).
 * 설계 참고: LoL 아레나 226종 · TFT 세트17 275종을 기능 분류한
 * docs/reference/augment-taxonomy-v1.0.md.
 */
/**
 * 영웅 직접 캐리 빌드 **임시 차단** (2026-07-19, 사용자 지시).
 *
 * "처형자의 일격·막타 공격력 스택 같은 직접 캐리 빌드는 고점 예측이 어려워 밸런스를
 * 잡기 어렵다 — 영웅 역할을 **탱커·타워 보조**로 한정하자." 여기 든 id는 드래프트에서
 * 제외된다(rollAugmentChoices). **데이터는 지우지 않는다** — 임시 조치라 명단만 걷어내면
 * 복구되고, 효과 로직·분류 테스트는 그대로 산다.
 *
 * 남는 축: 방어·가시·어그로(탱킹) / 감속·방깎·화상 고정딜(군중 제어) / 경제 /
 * 타워 강화 / 체력 성장. 허용된 보조 딜: 체력 비례(초신성)·잃은 체력 조건(최후의 저항)·
 * 화염 고정 피해(중첩) — 전부 공격력 스탯과 무관하거나 상한이 읽히는 축이다.
 */
export const HERO_CARRY_BLOCKLIST: ReadonlySet<string> = new Set([
  // 공격 스탯 — 평타 캐리의 연료
  'might', 'marksman', 'rapid', 'longbow', 'vigor', 'arcane', 'goliath', 'glasscannon', 'duelist',
  // 평타 확장·치명·즉사·폭발 — 예측 불가 고점의 주범 (즉사는 사용자가 직접 지목)
  'novasmall', 'novabig', 'crit', 'deadeye', 'execute', 'ruthless', 'deathblast', 'berserk',
  // 평타 광역화 — 스킬 대가가 붙어도 평타 캐리 축이다
  'explosion',
  // 2026-07-21 증강 정리로 풀린 것: skill_amp·skill_barrage(범용 강화 5축으로 복귀),
  // hunterinstinct·bloodthirst·relentless(처치 스택으로 재설계 후 복귀 — 사용자 지시)
]);

/**
 * 드래프트 비활성 (2026-07-21, 사용자 지시: "이지스, 재기, 최후의저항, 재생, 방벽 비활성화").
 * 회복·생존 겹치기 카드들이다 — 데이터는 남기고 풀에서만 뺀다(임시 조치 패턴).
 */
export const AUGMENT_DISABLED: ReadonlySet<string> = new Set([
  'aegis', 'secondwind', 'laststand', 'regen', 'bulwark',
]);

/**
 * '긴급 증원'(towerRoll)의 등급별 지급량 — 획득·강화 순간 랜덤 타워를 준다.
 * tier는 0부터다 (0 = 최하 티어). 등급 배수(scaleEffect)를 안 타는 대신 이 표가
 * 사다리를 정한다: 실버 = 티어1 ×1 / 골드 = 티어1 ×2 / 플래티넘 = 티어2 ×1 (사용자 지시).
 * 강화 시에는 **차액**만 준다(TOWER_ROLL_UPGRADE_GRANT) — 이미 받은 몫은 회수할 수 없으므로.
 */
export const TOWER_ROLL_BY_RARITY: Record<Rarity, { readonly tier: number; readonly count: number }> = {
  silver: { tier: 0, count: 1 },
  gold: { tier: 0, count: 2 },
  platinum: { tier: 1, count: 1 },
};

/** 강화로 등급이 올랐을 때 추가 지급분 — 실버→골드 = 티어1 ×1 더, 골드→플래티넘 = 티어2 ×1 더 */
export const TOWER_ROLL_UPGRADE_GRANT: Record<Rarity, { readonly tier: number; readonly count: number } | null> = {
  silver: null,
  gold: { tier: 0, count: 1 },
  platinum: { tier: 1, count: 1 },
};

// ───────── 일시불 증강의 강화 일시금 (2026-07-21, 사용자 지시) ─────────
// 강화도 카드 성격대로 **일시금**을 주되, 지급액을 그 시점의 강화 **구매 비용**에 묶어
// 차익을 제한한다: "비용 120이면 180을 받고(×1.5), 다음 강(골드→플래티넘)은 비용과
// 같은 금액(×1.0 = 본전)". 비용이 구매 횟수를 따라 1.7배씩 오르므로 지급액도 따라 오르되,
// 강화를 돈 버는 버튼으로 쓰는 루프는 성립하지 않는다.

/** 오르는 등급별 지급 배수 — 명목 강화 비용에 곱한다 */
export const INSTANT_UPGRADE_MULT: Partial<Record<Rarity, number>> = { gold: 1.5, platinum: 1 };
/** 골드 → 경험치 환산 — XP 구매 환율 그대로 (60금화 = 20XP) */
export const GOLD_TO_XP = XP_BUY_AMOUNT / XP_BUY_GOLD;
/** 골드 → 마정석 환산 [프로토] — 노다지 실버 몫의 비율(마정석 40 / 금화 250)로 잡았다 */
export const GOLD_TO_GAS = 40 / 250;

/**
 * 일시불 카드를 `toRarity`로 강화할 때 즉시 지급할 일시금.
 * `nominalCost`는 그 시점의 명목 강화 비용 — 무료 강화(R45)도 명목가 기준으로 준다.
 * 일시불 카드가 아니면 null.
 */
export function instantUpgradeGrant(
  effect: AugmentEffect,
  toRarity: Rarity,
  nominalCost: number,
): { mineral?: number; gas?: number; xp?: number } | null {
  const mult = INSTANT_UPGRADE_MULT[toRarity];
  if (!mult) return null;
  if (effect.instantMineral) return { mineral: Math.round(nominalCost * mult) };
  if (effect.instantGas) return { gas: Math.round(nominalCost * mult * GOLD_TO_GAS) };
  if (effect.instantXp) return { xp: Math.round(nominalCost * mult * GOLD_TO_XP) };
  return null;
}

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
  // (가시오라는 가시+피해감소 조합 중복이라 삭제 — 2026-07-21 증강 정리)
  { id: 'thorns', kind: 'defense', name: '가시 갑옷', description: '받은 피해의 120%를 때린 적에게 되돌린다 (허수아비도 적용)',
    maxStacks: 2, effect: { thorns: 1.2 } },
  // ── 아래 3장은 AUGMENT_DISABLED (2026-07-21) — 데이터만 남긴다.
  // 조합 중복(요새·피의 계약·석화 피부·가시오라)은 아예 삭제했다: 실버 단일축 + 증강 강화
  // 체제에서 "A+B 묶음 카드"는 A·B 단일 카드의 중복일 뿐이다.
  { id: 'aegis', kind: 'defense', name: '이지스', description: '받는 피해 18% 감소, 초당 체력 3 회복',
    maxStacks: 2, effect: { damageReduction: 0.18, regen: 3 } },
  { id: 'secondwind', kind: 'defense', name: '재기', description: '초당 체력 4 회복, 받는 피해 10% 감소',
    maxStacks: 2, effect: { regen: 4, damageReduction: 0.1 } },
  { id: 'laststand', kind: 'defense', name: '최후의 저항',
    description: '체력 35% 이하일 때 공격력 +60%', maxStacks: 2,
    effect: { lowHpDamageMult: 1.6 } },

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
  // 맹독 — 딜이 아니라 **약화**다. 갑옷을 녹인다.
  // 방깎은 타워에게도 이득이다(장갑은 모든 피해에서 감산되므로) — 영웅이 보드를 돕는 축.
  // 디버프 2×2 정리 (2026-07-21, 사용자 지시): 평타 슬로우=서리 일격 / 평타 방깎=맹독 /
  // 스킬 슬로우=한파 / 스킬 방깎=부식. 맹독의 감속을 떼어 축을 하나로 만들었다.
  { id: 'venom', kind: 'combat', name: '맹독',
    description: '공격이 방어력을 8 깎는다 (중첩)', maxStacks: 3,
    effect: { armorShred: 8 } },
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

  // ══ 스킬 (skill) — **개조만 남았다.** 획득 카드 9종은 2026-07-20에 삭제됐다:
  // 스킬은 판 시작 랜덤 + 리롤로 얻는 독립 시스템이 됐다(data/skills.ts). 증강은
  // "어떤 스킬을 뽑았는가"에 답하는 보조 층이다.

  // ── 강화 5축 (2026-07-21 재정리, 사용자 지시: "특정 스킬에 관계없이 유저가 알아서
  // 선택하도록 — 스킬데미지 / 쿨감 / 투사체 / 범위 / 도트딜").
  // 특정 스킬 전용 개조(연사·회오리·대재앙·레이저·장판·도발 인형)와 마나 변형
  // 4종(마나 순환·오버클럭·축전지·집중)·과부하는 삭제 — 전부 이 5축의 중복이었다.
  // kind는 그대로 'skill'이라 각성(3)/초월 시전(5) 시너지 임계치는 안 바뀐다.
  { id: 'skill_amp', kind: 'skill', displayLabel: '강화', name: '증폭', maxStacks: 3,
    description: '스킬 피해 +45%',
    effect: {}, skillMod: { damageMult: 1.45 }, requiresSkill: 'any' },
  // 쿨감의 자리 — 마나가 쿨이다. 모으면 스킬 난사(화염 겹 쌓기의 연료)가 된다.
  { id: 'skill_cdr', kind: 'skill', displayLabel: '강화', name: '집중 수련', maxStacks: 3,
    description: '필요 마나 15% 감소',
    effect: {}, skillMod: { manaMaxMult: 0.85 }, requiresSkill: 'any' },
  /**
   * 폭발 (2026-07-18, 사용자 지시 — 옛 '폭발 화살'을 대체) — 일제 사격 전용이던
   * 폭발을 **모든 명중**(평타 포함)으로 넓힌다. 대신 스킬 피해 전체에 -30% 대가가
   * 붙는다 — 광역화의 값을 스킬 쪽에서 치른다. '참격'(광역+공격력, combat)이
   * 하던 역할을 사실상 흡수해 참격은 폐기했다. requiresSkill이 없다 — 스킬 없이도 뜬다.
   */
  { id: 'explosion', kind: 'skill', displayLabel: '강화', name: '폭발', maxStacks: 2,
    description: '모든 공격(평타·스킬)이 명중 시 반경 30에 같은 피해로 폭발 · 스킬 피해 -30%',
    effect: { explosionRadius: 30 }, penalty: { skillDamageMult: 0.7 } },
  // 투사체 축 — 대상 수가 있는 스킬은 대상이, 튕기는 사격은 튕김이 는다
  { id: 'skill_barrage', kind: 'skill', displayLabel: '강화', name: '다중 투사', maxStacks: 2,
    description: '스킬 대상 +2 (일제 사격·강타 등) · 튕김 +2회 (튕기는 사격)',
    effect: {}, skillMod: { extraTargets: 2 }, requiresSkill: 'any' },
  // 범위 축 — 반경형(유성·소용돌이)은 반경, 레이저는 길이, 장판은 넓이로 먹힌다.
  // 옛 전용 개조(회오리·대재앙·증폭 코일·넓은 화선)의 범위 몫을 한 장에 통합했다.
  { id: 'skill_radius', kind: 'skill', displayLabel: '강화', name: '파장', maxStacks: 2,
    description: '스킬 범위 확장 — 반경 +25 · 레이저 길이 +60 · 장판 반경 +20',
    effect: {}, skillMod: { radiusAdd: 25, beamLengthAdd: 60, zoneRadiusAdd: 20 },
    requiresSkill: 'any' },
  // 도트딜 축 — 어떤 스킬이든 명중 후 잔여 피해를 남긴다 (갱신형, 중첩 없음).
  // 화상(burn 계열, 고정치·중첩·트루 피해)과 다른 채널이다 — 이쪽은 공격력 계수를 탄다.
  { id: 'skill_dot', kind: 'skill', displayLabel: '강화', name: '여파', maxStacks: 2,
    description: '스킬에 맞은 적이 3초간 초당 공격력 50%의 지속 피해를 받는다',
    effect: {}, skillMod: { dotDpsAdd: 0.5, dotSeconds: 3 }, requiresSkill: 'any' },

  // ── 스킬 디버프 (2026-07-21 디버프 2×2 — 평타 쪽은 combat의 서리 일격·맹독)
  { id: 'skill_frostbite', kind: 'skill', displayLabel: '강화', name: '한파', maxStacks: 2,
    description: '스킬에 맞은 적을 3초간 45% 감속 (모든 스킬)',
    effect: {}, skillMod: { slowFactor: 0.55, slowSeconds: 3 }, requiresSkill: 'any' },
  { id: 'skill_shred', kind: 'skill', displayLabel: '강화', name: '부식', maxStacks: 2,
    description: '스킬에 맞은 적의 방어력을 4 깎는다 (중첩)',
    effect: {}, skillMod: { armorShredAdd: 4 }, requiresSkill: 'any' },

  // ══ 성장 (growth) — 누적.
  // 2026-07-21 재설계 (사용자 지시): 처치 스택은 이제 **누가 잡았든** 모든 몹 처치를
  // 센다(타워 포함 — killStackFlatDamage 주석 참고). 값은 막타 시절의 1/4.
  // '라운드마다 공격력'(waveStackDamage) 계열(역전의 용사·가속·적응·전쟁 기계)은 폐지 —
  // 아무 행동 없이 시간만으로 크는 축이었다. 체력 성장(강철 혈통)만 탱킹축으로 남는다.
  { id: 'hunterinstinct', kind: 'growth', name: '사냥 본능',
    description: '몹 처치 2기마다 공격력 +1 (누구든 잡으면 누적)', maxStacks: 2,
    effect: { killStackFlatDamage: 0.5 } },
  { id: 'bloodthirst', kind: 'growth', name: '피의 갈증',
    description: '몹 처치 4기마다 공격력 +1 (누적), 가한 피해의 2% 회복', maxStacks: 2,
    effect: { killStackFlatDamage: 0.25, lifesteal: 0.02 } },
  { id: 'ironblood', kind: 'growth', name: '강철 혈통', description: '라운드마다 최대 체력 +5% (영구 누적)',
    maxStacks: 3, effect: { waveStackHp: 0.05 } },
  // TFT 'Soul Awakening' — 성장을 성장시킨다. 성장 특화의 핵심 카드.
  // [곱연산] 성장 누적치에 통째로 곱해진다
  { id: 'evolution', kind: 'growth', name: '진화', description: '[곱] 성장 누적치 ×1.4',
    maxStacks: 1, effect: { growthMult: 1.4 } },
  { id: 'relentless', kind: 'growth', name: '집념',
    description: '몹 처치 4기마다 공격력 +3 (누적) · 최대 체력 -15%', maxStacks: 1,
    effect: { killStackFlatDamage: 0.75 }, penalty: { hpMult: 0.85 } },

  // ══ 경제 (econ) — 수입과 경험치. TFT 증강의 중심축(43%)이 여기다.
  // ── 처치당 금화 계열 — **대폭 너프** (2026-07-21, 사용자 지시: "골드수급이 말도안된다")
  // 측정: 몹 15기 기준 기본 수입(킬 미션)이 라운드당 15골드인데, 탐욕 1스택이 30,
  // 3스택이 90, 플래티넘 강화 3스택이 **315**였다 — 증강 한 장이 게임 전체 수입의
  // 배수로 들어왔다. 웨이브 보상을 폐지(2026-07-20)해 기본 수입을 깎아둔 터라 격차가
  // 더 벌어졌고, 증강 강화로 등급이 오르면서 상한도 사라졌다.
  //
  // 처치당 금화는 **골드 → 타워 → 킬 → 골드**로 복리가 도는 자리라 특히 위험하다.
  // 골드 증강은 **딱 둘** — 즉시 골드(일확천금)와 처치 골드(탐욕) (2026-07-21, 사용자 지시).
  // 그전에는 처치금화 4종·라운드보상 3종이 겹쳐 9종이었는데, 라운드보상 계열은
  // waveReward 폐지(2026-07-20)로 **0에 곱해지는 죽은 카드**였다. 축을 둘로 압축한다:
  //   · 일확천금 = 지금 당장 목돈 (초반일수록 강함)
  //   · 탐욕     = 잡을수록 버는 지속 수입
  { id: 'greed', kind: 'econ', name: '탐욕', description: '10킬당 금화 +4', maxStacks: 2,
    effect: { mineralPerKill: 0.4 } },
  { id: 'gasvein', kind: 'econ', name: '마정석 정맥', description: '라운드마다 마정석 +5', maxStacks: 3,
    effect: { gasPerWave: 5 } },
  { id: 'scholar', kind: 'econ', name: '학자', description: '경험치 획득 +40%', maxStacks: 3,
    effect: { xpMult: 1.4 } },
  // ── 일시불 계열 (2026-07-21, 사용자 지시: "골드 / 마정석 / 영웅 경험치 일시불") —
  // 고르는 순간 목돈. 일회성이라 **초반에 뽑을수록** 값어치가 크다 — 그것도 운이다
  // (사용자 지시: "일찍 뜨면 좋은 거지, 그것도 운으로 넣자").
  //
  // 값 앵커 [프로토]: 일확천금 250금화 (150 → 250, 2026-07-21 사용자 지시 "너무 적다" —
  // 증강 라운드 R25·R35의 라운드당 수입이 ~170이라 150은 한 라운드치도 안 됐다.
  // income-curve.csv 기준 250 ≈ 중후반 1.5라운드치). 경험치는 금화 환산
  // (XP_BUY_GOLD 60금화=20XP → 80XP ≈ 240금화)으로 재조정. 마정석은 정맥 ~8라운드치.
  //
  // **강화도 일시금이다** (2026-07-21, 사용자 지시 — "성격에 맞춰서") — 단, 지급액이
  // 강화 **구매 비용**에 묶여 차익이 제한된다 (INSTANT_UPGRADE_MULT: 실버→골드는
  // 비용×1.5, 골드→플래티넘은 비용×1.0 = 본전). 강화 후보가 보유 증강 중 랜덤이라
  // 일확천금이 걸리는 것 자체가 운이다 — 그 운은 수용한다(사용자 결정).
  { id: 'windfall', kind: 'econ', name: '일확천금',
    description: '획득 즉시 금화 +250 · 강화하면 강화 비용에 준하는 금화를 즉시 받는다',
    maxStacks: 2, effect: { instantMineral: 250 } },
  { id: 'gasrush', kind: 'econ', name: '마정석 노다지',
    description: '획득 즉시 마정석 +40 · 강화하면 마정석 일시금을 즉시 받는다',
    maxStacks: 2, effect: { instantGas: 40 } },
  { id: 'enlighten', kind: 'econ', name: '깨달음',
    description: '획득 즉시 영웅 경험치 +80 (예상 레벨 표시) · 강화하면 경험치 일시금을 즉시 받는다',
    maxStacks: 2, effect: { instantXp: 80 } },
  // (투자(라운드마다 마정석+대가)는 삭제 — 마정석 정맥의 대가형 중복이었다, 2026-07-21)

  // ══ 유틸 (util) — 기동 · 부활 · 타워 지휘 · 어그로
  // 2026-07-21 중복 정리 (사용자 지시): 타워 지휘는 전쟁군주 한 장으로 통합
  // (지휘관·결집·봉화 삭제 — 전부 타워 버프의 변형이었다). 어그로도 도발 한 장으로
  // (선봉 삭제). 부활도 불사조 한 장으로 (순교 삭제). 실버 단일축 + 증강 강화 체제에서
  // 변형 카드는 강화 등급이 대신한다.
  { id: 'warlord', kind: 'util', name: '전쟁군주', description: '모든 타워 공격력 +20%', maxStacks: 3,
    effect: { towerDamageMult: 1.2 } },
  { id: 'swift', kind: 'util', name: '신속', description: '이동 속도 +25%', maxStacks: 2,
    effect: { moveSpeedMult: 1.25 } },
  { id: 'phoenix', kind: 'util', name: '불사조', description: '부활 대기 4초 감소', maxStacks: 2,
    effect: { respawnCut: 4 } },
  // 어그로를 넓힌다 — 영웅의 본업(몹 모으기)을 강화한다.
  // 스택이 붙잡는 수를 정한다 (1장 2기 · 2장 3기). 맞는 양이 커지므로 방어를 함께 붙였다.
  { id: 'provoke', kind: 'util', name: '도발', description: '몹을 붙잡는다 (누적 2·3기) · 받는 피해 8% 감소',
    maxStacks: 2, effect: { aggroStack: 1, aggroRangeMult: 1.5, damageReduction: 0.08 } },
  /**
   * 긴급 증원 — 획득 즉시 랜덤 타워를 준다 (2026-07-21, 복제 장치 대체 — 사용자 결정).
   * 복제 장치는 매 라운드 도는 복리 엔진이라 라운드마다 가치가 달라 밸런스를 못 잡았다.
   * 일시불이면 가치가 타워 생성비로 바로 환산된다. 생성 비용(unitsSpawned)은 안 올린다.
   * 등급별 지급: TOWER_ROLL_BY_RARITY (실버 티어1×1 / 골드 티어1×2 / 플래티넘 티어2×1).
   */
  { id: 'reinforce', kind: 'util', name: '긴급 증원',
    description: '획득 즉시 랜덤 타워 지급 (강화하면 더 많이·더 높은 티어)',
    maxStacks: 2, effect: { towerRoll: 1 } },
];

/** 광역 증강은 '충격파'를 먼저 잡아야 의미가 있다 */
export const requiresSplash = (augment: Augment): boolean => augment.id === 'novabig';

/**
 * 지금 든 스킬로 이 증강을 뽑을 수 있는가.
 *
 * 개조 증강은 그 스킬을 든 뒤에만 나온다. '폭발 화살'은 일제 사격을 쥔 다음에야 의미가 있다 —
 * 이게 수치가 아니라 **관계**로 맺어지는 시너지다.
 *
 * 영웅은 항상 스킬을 하나 든다(2026-07-20) — 스킬 획득 분기는 사라졌다.
 */
export function skillGateAllows(augment: Augment, currentSkill: SkillId): boolean {
  // 장판 개조는 장판을 까는 스킬을 든 뒤에만 — 즉발 스킬엔 붙일 데가 없다
  if (augment.requiresZone) return (SKILLS[currentSkill].zoneSeconds ?? 0) > 0;
  if (!augment.requiresSkill) return true;
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

// ───────── 증강 리롤 — 카드마다 무료 1회 (2026-07-20, 사용자 지시) ─────────
// 전체 3장을 갈아엎지 않고, 마음에 든 카드는 남긴 채 각 카드만 한 번씩 바꾼다.
export const AUGMENT_CARD_REROLLS = 1;

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
