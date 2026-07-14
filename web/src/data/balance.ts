// ───────── 밸런스 테이블 ─────────
// 출처: docs/reference/god-td-x-vz056-map-analysis-v1.0.md
//
// [원본확정] 맵파일에서 직접 읽은 수치. 바꾸면 원작 재현이 깨진다.
// [프로토]   원본이 EUD로 가려져 읽을 수 없어 플레이 가능하게 정한 수치.

import type { Tag } from './units';

// ── 시작 자원 — trigger #349 SetResources(SetTo, 55, ore) / (SetTo, 6, gas) [원본확정]
// 제단은 공짜로 주어지므로 원본 값을 그대로 쓴다.
export const START_MINERAL = 55;
export const START_GAS = 6;

/** 원본 trigger #266의 SetCountdownTimer(57). [원본확정] */
export const ORIGINAL_ROUND_SECONDS = 57;

/**
 * 라운드 간격. 원본과 똑같이 **고정 간격**이다 — 웨이브를 빨리 정리해도 다음 라운드가
 * 앞당겨지지 않는다.
 *
 * 웨이브를 다 잡으면 곧장 넘기는 방식은 쓰지 않는다. 그러면 천천히 잡을수록 라운드가
 * 느려지고, 쉬운 웨이브에 머물면서 쿨타임(45초)만 도는 보스를 계속 소환하는 게 이득이 된다.
 * 고정 간격이면 시간당 보스 소환 횟수가 라운드 진행과 무관하게 일정하다.
 *
 * 원본 57초는 연출과 조합 시간이 있을 때의 값이라 프로토에서는 짧게 잡았다. [프로토]
 */
export const ROUND_SECONDS = 22;
/**
 * 첫 라운드까지의 대기. 원본은 trigger #344에서 20초지만(그동안 명예의 전당 연출이 돈다)
 * 연출이 없는 프로토에서는 그냥 기다리는 시간이라 짧게 줄였다. [프로토]
 */
export const OPENING_SECONDS = 5;

// ───────── 소득 (§8.2) — 전부 Add, 플레이어 자원 차감은 원본에 0건(§8.3) ─────────

/**
 * 보스 처치 보상 Lv1..Lv6.
 *
 * 원본은 [5, 8, 13, 20, 29, 39] (trigger #601~#606 [원본확정]).
 * 2026-07-11 [프로토]로 대체 — 보스 HP를 레벨당 ×2.5로 세우면서(아래 bossHP)
 * 리스크에 보상이 따라가도록 상위 레벨을 가파르게 올렸다. 플레이테스트 근거:
 * "난이도 고민 없이 항상 최고 레벨만 부르면 된다 → 재미없다".
 */
export const BOSS_KILL_MINERAL = [5, 10, 18, 32, 55, 90] as const;

/** 킬 마일스톤 보상. trigger #546~#566. 200킬 간격 [원본확정] */
export const KILL_MILESTONES: readonly (readonly [kills: number, mineral: number])[] = [
  [200, 5], [400, 5], [600, 10], [800, 5], [1000, 10],
  [1200, 6], [1400, 10], [1600, 6], [1800, 6], [2000, 15],
  [2200, 6], [2400, 6], [2600, 15], [2800, 6], [3000, 15],
  [3200, 6], [3400, 6], [3600, 15], [3800, 6], [4000, 15],
];

/**
 * 웨이브 클리어 보상.
 *
 * 원본에는 없다. 원본은 반복 20킬 보상(trigger #544/#545, +10/+12)으로 소득을 줬지만,
 * 그러면 유닛 1기당 20킬을 모아야 해서 초반이 굶는다. 라운드마다 목돈이 들어오는 편이
 * 타워를 세우는 리듬과 맞는다. [프로토]
 */
export const waveReward = (round: number): number => 10 + 3 * round;

/** 누출 시 라이프 -1 · 미네랄 +5. strings:358 'Life -1 ! ! ! ! !미네랄 +5' [원본확정] */
export const LEAK_MINERAL = 5;
/** 시작 라이프. 원본 미확인(EUD 메모리) [프로토] */
export const START_LIVES = 20;

// ───────── 지출 — 원본에는 트리거상 자원 차감이 없다(§8.3). 아래는 전부 [프로토] ─────────
// 원본에서는 SC 네이티브 빌드 코스트로 처리되었을 것으로 보이나 수치를 읽을 수 없다.
export const SPAWN_UNIT_MINERAL = 12; // 소용돌이 클릭 → Lv1 생성 (strings:412)

/**
 * 유닛 생성 비용 — **누적 생성 횟수에 선형으로 오른다.**
 *
 * 고정 12일 때 측정 결과([생존곡선 진단](../../../docs/reports/survival-curve-diagnosis-v0.1.md)):
 * 중반에 미네랄의 94%가 유닛 생성으로 흘렀고, R51엔 라운드당 13.2기를 지었다.
 * 그 결과 GOD 타워가 R51에 20기(필드의 60%), 타일 40칸은 R61에 포화됐다.
 * 티어 시스템이 무의미해지고, 포화 순간 타워 DPS 성장이 멈춰 절벽이 생겼다.
 *
 * n번째 유닛을 비싸게 만들면 세 가지가 동시에 잡힌다 —
 * GOD 총량, 타일 포화 시점, 후반 미네랄 잉여.
 *
 * **머리는 싸게, 꼬리만 조인다.** 처음 SPAWN_FREE_COUNT기는 12 그대로다 —
 * 그러지 않으면 초반 전력이 깎여 Lv1 보스를 못 잡는다(`tests/boss-balance.test.ts`가
 * 75미네랄 = 6기를 요구한다. 오프셋 없이 0.45를 걸면 5기밖에 못 사서 처치율이
 * 0.95 → 0.80으로 떨어졌다).
 *
 * 조합으로 타워가 줄어도 비용은 내려가지 않는다 — 누적 생성 횟수 기준이라
 * "채웠다 합쳤다"로 비용을 리셋할 수 없다.
 *
 * GOD 1기 R26 · 5기 R54 · R51 시점 4.3기, 타일은 R81에도 23기로 여유가 남는다.
 * (고정 12일 때: GOD 1기 R20 · 5기 R32 · R51에 20기 · R61 포화) [프로토]
 */
export const SPAWN_FREE_COUNT = 8;
export const SPAWN_COST_GROWTH = 0.45;
export const spawnUnitCost = (spawned: number): number =>
  Math.round(SPAWN_UNIT_MINERAL + SPAWN_COST_GROWTH * Math.max(0, spawned - SPAWN_FREE_COUNT));
export const PROBE_MINERAL = 100;

// ── 타워 복제 ('복제 장치' 증강) ──
// 복제 가능 티어 상한은 라운드와 영웅 레벨 중 **더 빠른 쪽**을 따라 오른다.
// 초반엔 싸구려만 복제되고, 후반에 GOD가 열린다 — 복제가 계속 살아 있는 카드가 된다.
export const COPY_TIER_ROUNDS = 12;
export const COPY_TIER_LEVELS = 9;
/**
 * [프로토] 프로브 비용은 지수로 오른다 — "지금 전력이냐 미래 경제냐"의 일꾼 딜레마.
 * 8기 고정 상한이던 시절에는 GA가 전 세대 7~8로 수렴하는 무뇌 투자였다.
 */
export const PROBE_COST_GROWTH = 1.5;
export const probeCost = (owned: number): number =>
  Math.round(PROBE_MINERAL * Math.pow(PROBE_COST_GROWTH, owned));
export const PROBE_MAX = 16;
export const GAS_PER_PROBE_SECOND = 0.25;

/** 파일런 종족 업그레이드. 가스 소비. 원본은 SC 네이티브라 비용 미확인(§8.4~8.5) [프로토] */
export const UPGRADE_MULT = 1.1;
export const upgradeGasCost = (level: number): number => 8 + 4 * level + level * level;

// ───────── 보스 소환 ─────────
// 소환은 라운드 진행과 무관한 상시 액션이고 쿨타임만 있다. 비용 없음.
// Lv N은 Lv N-1을 처치해야 열린다. (원본 감지 로직·쿨타임은 EUD로 미확인 — §11.1)
export const BOSS_MAX_LEVEL = 6;
export const BOSS_COOLDOWN_SECONDS = 45; // [프로토]

/**
 * 보스 HP·장갑. 원본 UNIx는 Lv1~Lv6 전부 hp=100000이라 밸런스 근거로 못 쓴다(§4.6). [프로토]
 *
 * Lv1은 "시작 미네랄로 산 유닛만으로 잡을 수 있어야 한다"를 기준으로 맞췄다.
 * tests/boss-balance.test.ts가 이 기준을 지킨다 — 유닛 6기면 확실히, 4기면 아슬아슬하게 잡힌다.
 * 장갑은 타격당 감산이라 저티어 유닛에게 특히 아프다. Lv1 장갑을 3보다 올리면
 * Lv1 유닛의 유효 피해가 10% 바닥값으로 깔려서 초반이 막힌다.
 *
 * 레벨 성장 2.15 → 2.5 (2026-07-11): "항상 최고 해금 보스"를 부르는 봇으로 측정한
 * 처치율이 2.15에서 Lv2·3 100%, Lv6 96%(142소환) — 사다리가 R14에 소진되고 최고 보스가
 * 영구 현금인출기였다. 2.8은 Lv6 처치율 0%로 과잉. 2.5에서 Lv4 59% · Lv5 67% ·
 * Lv6 84%로 레벨이 오를수록 리스크가 생긴다. 웨이브 재설계 후 재측정 대상.
 */
export const bossHP = (level: number): number => 1150 * Math.pow(2.5, level - 1);
export const bossArmor = (level: number): number => 3 * level;
export const BOSS_SPEED = 26;
/** 보스가 일주를 끝내면 라이프 손실이 크다 [프로토] */
export const bossLeakLives = (level: number): number => 2 + level;

// ───────── 적 웨이브 (§9) ─────────
// 원본은 특정 라운드에 이름 붙은 GOD 적이 나오지만(trigger #268~#286), 그 사이 라운드의
// 몹 구성·수·HP 곡선이 전부 EUD라 웨이브를 재현할 근거가 없다. 이 프로토는 모든 웨이브를
// 같은 잡몹으로 두고, 특별한 적은 플레이어가 부르는 보스로만 등장시킨다.
/**
 * 웨이브 총 체력 = 목표 clear(초) × 기대 유효 DPS.
 *
 * ── 2026-07-11 재설계: 재화→전투력 모델 기반 ──
 * 이전의 "5라운드 사이클마다 HP ×2 점프"는 사이클 안에서 평평해, 라운드당 ×1.23으로
 * 크는 초반 플레이어 DPS가 그 사이 앞질러 버렸다 — R30까지 난이도 상승이 체감되지 않고
 * (플레이테스트), 위험률이 R1~60에 0%였다(생존곡선 진단).
 *
 * 새 곡선은 시뮬레이션(정책 6 × 시드 8 = 48판)에서 측정한 **기대 유효 DPS**(그 라운드
 * 장갑 감산 반영, P50)를 구분지수로 근사하고, 거기에 목표 clear를 곱해 역산한다.
 * 발견: 유효 DPS ≈ 누적수입 × 1.5 로 거의 상수 — 재화가 곧 전투력이다.
 * 운(조합·증강)의 스프레드는 P10 ≈ P50×0.65, P90 ≈ P50×1.8.
 *
 * 목표 clear는 R1부터 14초(라운드 22초 대비 여유 36% — 초반부터 긴장), R50에 25초
 * (P50 보드가 임계에 닿는다), R51+ 라운드당 +1.5초(종반 벽 — P90 보드도 R60에 턱걸이).
 * 결과: 현행 대비 R13~21에서 2.4~3.1배 (플레이테스트 "R30까지 3~4배" 요청 구간). [프로토]
 */
export const CYCLE_ROUNDS = 5;
export const cycleOf = (round: number): number => Math.floor((round - 1) / CYCLE_ROUNDS);
export const posInCycle = (round: number): number => (round - 1) % CYCLE_ROUNDS;

/**
 * 기대 유효 DPS (P50) — scratch-model.ts 측정의 구분지수 근사.
 *
 * 주의: 이 곡선은 웨이브 난이도에 **되먹임**된다 — 웨이브가 세지면 몹이 오래 살고,
 * 영웅 막타 XP가 늘어 증강이 빨라져 DPS/수입 비율이 1.5 → 2.0~2.5로 오른다.
 * (압박이 성장을 가속하는 자기 균형 고리.) 그래서 새 웨이브 아래에서 재측정해 갱신했다.
 */
export const expectedBoardDps = (round: number): number => {
  if (round <= 13) return 58 * Math.pow(1.22, round - 1);
  if (round <= 31) return 632 * Math.pow(1.105, round - 13);
  return 3830 * Math.pow(1.035, round - 31);
};

/**
 * 목표 clear(초) — 웨이브를 녹이는 데 걸려야 하는 시간. R51+는 종반 벽.
 *
 * 보정 이력:
 * - 1차 (14 + 0.22r, 벽 +1.5/r): 봇이 R140까지 살았다. 사망 임계를 clear 25초로 가정했지만
 *   라이프 20 버퍼 + 누출당 +5 미네랄 + 몹 경로 노출 ~28초(1460px/52, 감속 타워가 최대 2배로
 *   늘림) 탓에 실제 절벽 임계는 clear ≈ 노출시간의 1.5~2배다.
 * - 2차: **선형 벽(+3초/라운드)은 상대 성장률이 감소해** 지수로 크는 보드(~4%/라운드)가
 *   결국 이긴다 — 봇이 R138까지 살았다. 벽은 지수여야 보드를 항상 앞선다.
 * - 3차: 벽 ×1.10은 사망을 R72~88에 놓았다(설계보다 20라운드 늦음) — 압박→성장 되먹임이
 *   벽을 미는 동안 보드가 계속 자라기 때문. ×1.18은 R58~75(중앙 R68)로 당겼다.
 * - 4차: 기울기 0.45, 벽 R44부터 ×1.20 — 사망 중앙값을 R50대로. 유한 종결(R60 최종 보스)이
 *   구현되면 마지막 1%는 보스가 가른다. 봇 기준 정밀 보정은 여기까지 — 이후는 사람 플레이테스트.
 */
export const targetClearSeconds = (round: number): number =>
  round <= 44 ? 18 + 0.45 * (round - 1) : 37.4 * Math.pow(1.2, round - 44);

/** 웨이브 총 체력 → 몹 1기 체력. "새 몹이 사이클마다 굵어지는" 리듬은 count 리셋이 만든다 */
export const enemyHP = (round: number): number =>
  Math.max(1, Math.round((expectedBoardDps(round) * targetClearSeconds(round)) / enemyCount(round)));
/**
 * 적 장갑은 계단식이다. 선형으로 매 라운드 오르면 저티어 유닛이 매 라운드 조금씩
 * 무력해져서 언제 갈아엎어야 하는지 감이 안 온다. 5라운드마다 한 칸씩 오르면
 * "다음 계단 전에 티어를 올려야 한다"는 목표가 분명해진다. [프로토]
 */
export const ENEMY_ARMOR_STEP_ROUNDS = 5;
export const ENEMY_ARMOR_PER_STEP = 3;
export const enemyArmor = (round: number): number =>
  Math.floor(round / ENEMY_ARMOR_STEP_ROUNDS) * ENEMY_ARMOR_PER_STEP;

/**
 * 웨이브당 잡몹 수. 사이클 안에서 라운드마다 COUNT_STEP만큼 늘어난다.
 * 원본은 스폰 로직이 EUD라 몹 수를 읽을 수 없다(§9.2, §11.1).
 *
 * 2026-07-11: 12~24 → 20~36 (플레이테스트 "몹 수를 더 늘리자").
 * 총 체력은 enemyHP가 총량÷count로 역산하므로 count는 난이도가 아니라 **밀도**다.
 * 사이클이 넘어가면 count가 리셋되면서 개당 체력이 뛴다 — "새 몹은 적지만 굵다". [프로토]
 */
export const ENEMY_BASE_COUNT = 20;
export const ENEMY_COUNT_STEP = 4;
export const enemyCount = (round: number): number =>
  ENEMY_BASE_COUNT + ENEMY_COUNT_STEP * posInCycle(round);

/** 웨이브 내 스폰 간격(초). 36기 × 0.18 = 6.5초 스폰 창 [프로토] */
export const SPAWN_INTERVAL = 0.18;
// 52 → 42 (2026-07-14): 초반 체감 템포를 늦춘다. 경로 통과 시간이 24% 늘어 타워가 더 많이
// 쏘고, 영웅이 몹 무리를 정리할 시간도 늘어난다. 난이도는 쉬워지는 방향이다. [프로토]
export const ENEMY_SPEED = 42;

/** 몹 2열 레인 — 경로 중심선에서 좌우로 비끼는 표시 오프셋(px). 판정은 1D 그대로. [프로토] */
export const MOB_LANE_OFFSET = 8;

// ───────── 웨이브 타입 (2026-07-12 골격 — 타입 2개로 시작) ─────────
// 5R 사이클에 질적 정체성을 준다. 총체력 예산(enemyHP 모델)은 건드리지 않고
// **접촉 공격력 배수만** 다르다 — 밸런스 모델과 정합. 이후 돌격·중장갑·비행은 행 추가.
export type WaveTypeId = 'normal' | 'hunter';

export interface WaveType {
  readonly id: WaveTypeId;
  readonly label: string;
  /** 영웅·허수아비 접촉 공격력 배수 */
  readonly contactDamageMult: number;
  /** 렌더 구분색 (웹 캔버스·Unity 공용 hex) */
  readonly color: string;
}

export const WAVE_TYPES: Record<WaveTypeId, WaveType> = {
  normal: { id: 'normal', label: '일반', contactDamageMult: 1, color: '#9aa2c0' },
  // 사냥꾼: 영웅 위협 전담. 기본 공격력을 1+0.6r로 낮춘 만큼 여기에 위임 —
  // ×6이면 R10 접촉 42/기, R30 접촉 114/기. 탱킹 빌드가 시험대에 오른다. [프로토]
  hunter: { id: 'hunter', label: '사냥꾼', contactDamageMult: 6, color: '#ff5a3c' },
};

/** R10부터 5의 배수 라운드는 사냥꾼 웨이브 */
export const waveTypeOf = (round: number): WaveType =>
  round >= 10 && round % 5 === 0 ? WAVE_TYPES.hunter : WAVE_TYPES.normal;

// ───────── 전투 (전부 [프로토]) ─────────
// 원본은 무기슬롯→유닛 바인딩 정보가 없어 실제 공격력을 읽을 수 없다(§11.3).
// 태그 3종의 전투 의미도 원본이 정의하지 않는다. 아래는 태그 이름에서 유도한 설계다.
export const BASE_DAMAGE = 7;
export const TIER_DAMAGE = [1, 3, 9, 28, 95] as const;
export const TIER_RANGE = [120, 140, 160, 185, 225] as const;
export const BASE_ATTACK_INTERVAL = 0.9;

/**
 * 크리쳐는 보조 타워다. 딜은 40% 깎이는 대신 사거리 안 몹을 늦춘다.
 *
 * 감속은 곱연산으로 쌓지 않고 **가장 강한 것 하나만** 적용한다. 안 그러면 크리쳐를 도배해서
 * 몹을 멈춰 세울 수 있다. 티어가 오를수록 배수가 낮아진다(= 더 느려진다).
 *
 * 이 타워가 있으면 몹이 타워 사거리에 오래 머물러, 영웅이 탱킹하지 않아도 딜 시간이 나온다.
 * 그래서 크리쳐를 많이 뽑은 판은 원거리 영웅이, 딜 타워만 뜬 판은 탱커 영웅이 유리해진다. [프로토]
 */
export const CREATURE_DAMAGE_MULT = 0.6;
export const CREATURE_SLOW = [0.9, 0.84, 0.76, 0.66, 0.5] as const;

export const TAG_EFFECT: Record<Tag, { damage: number; interval: number; range: number }> = {
  power: { damage: 1.6, interval: 1.0, range: 1.15 },
  splash: { damage: 0.7, interval: 1.0, range: 1.0 },
  speed: { damage: 1.0, interval: 0.5, range: 0.9 },
};

/** 유효 피해 — 장갑을 뺀다. 최소 10%는 관통 */
export const effectiveDamage = (raw: number, armor: number): number =>
  Math.max(raw - armor, raw * 0.1);

/** 조합 요구 수량. trigger #207/#209/#258/#260 전부 AtLeast 2 [원본확정] */
export const MERGE_REQUIRED = 2;
