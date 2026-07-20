// ───────── 생존률 수학 모델 ─────────
//
// **시뮬레이션이 아니다.** 게임 루프를 돌리지 않고, 밸런스 상수만으로
// "라운드 r을 넘길 확률"을 분포로 계산한다. 시뮬(`sim:ga`)이 수십 초 걸리는 자리를
// 1~2초로 대체해, 상수를 바꿀 때마다 곡선이 어떻게 움직이는지 즉시 본다.
//
// 랜덤은 **뽑기와 조합에만** 있다 — 어떤 유닛이 뜨고 무엇이 합쳐지는지가 보드 파워를
// 가른다. 그 부분만 몬테카를로로 돌리고 나머지(수입·체력·사거리)는 결정론이다.
//
//   골드(r) → 살 수 있는 유닛 → [뽑기·조합 샘플] → 보드 DPS 분포
//        ↑                                              ↓
//        └────── 보스 처치 보상 ←── 보스 성패 판정 ←──────┘
//                                                        ↓
//                        웨이브 총체력 vs 보드 처리량 → 통과 여부
//
// 한계는 `MODEL_CAVEATS`에 적어뒀다. 판정에 쓰기 전에 반드시 읽을 것.

import * as B from '../src/data/balance';
import { PATH_LENGTH, SLOT_POS, pathPos } from '../src/core/map';
import { attackInterval, damage, isSplash, range } from '../src/game/combat';
import { findMerge, unitFor } from '../src/game/merge';
import type { Slot, Tower } from '../src/game/types';

export const MODEL_CAVEATS = [
  '영웅·스킬·증강 기여 제외 — 순수 타워 보드만 본다',
  '광역 감쇠는 평균 배수로 근사한다 (실제는 몹 밀집도에 따라 다르다)',
  '보스 수입은 보드와 물리지 않는다 — 최선/최악 밴드로만 넣는다',
  '판정은 누출→라이프다: 라운드 내 전멸이 아니라 라이프가 0이 되면 사망',
  '누출 미네랄 제외 — 라이프를 잃는 대가라 수입으로 세지 않는다',
] as const;

// ───────── 지오메트리 — 타일이 경로를 얼마나 덮는가 ─────────
// 사거리가 경로에 비해 길면 타워는 웨이브 내내 쏜다. 이 비율이 곧 듀티비다.
const COVER_STEP = 4;
const coverCache = new Map<string, number>();

export function coverRatio(slotIndex: number, reach: number): number {
  const key = `${slotIndex}:${reach}`;
  const hit = coverCache.get(key);
  if (hit !== undefined) return hit;
  const [sx, sy] = SLOT_POS[slotIndex];
  let covered = 0;
  for (let d = 0; d < PATH_LENGTH; d += COVER_STEP) {
    const [x, y] = pathPos(d);
    if (Math.hypot(x - sx, y - sy) <= reach) covered += COVER_STEP;
  }
  const ratio = covered / PATH_LENGTH;
  coverCache.set(key, ratio);
  return ratio;
}

/**
 * 듀티비 — 한 라운드 중 이 타워가 실제로 쏘는 시간 비율.
 *
 * 몹이 줄지어 지나가므로 "커버 구간에 몹이 있는 시간"은 커버 비율보다 길다.
 * 웨이브 길이를 반영한 보정 1.6을 곱하되 1을 넘지 않는다 — 근사값이라
 * 과대평가를 피하려고 상한을 둔다.
 */
const DUTY_STRETCH = 1.6;
const dutyCycle = (slotIndex: number, reach: number): number =>
  Math.min(1, coverRatio(slotIndex, reach) * DUTY_STRETCH);

/** 광역 타워가 한 발에 때리는 실효 대상 수 (감쇠 100/55/25% 반영) */
const SPLASH_TARGETS = 1 + 0.55 + 0.25;

// ───────── 보드 ─────────
interface ModelSlot extends Pick<Slot, 'x' | 'y'> {
  tower: Tower | null;
  index: number;
}

const emptyBoard = (): ModelSlot[] =>
  SLOT_POS.map(([x, y], index) => ({ x, y, tower: null, index }));

/** 유닛 한 기를 빈 타일에 놓고 연쇄 조합까지 해소한다 (Game.resolveMerges와 같은 규칙) */
function placeUnit(board: ModelSlot[], rand: () => number): void {
  const open = board.filter((s) => !s.tower);
  if (open.length === 0) return;
  const slot = open[Math.floor(rand() * open.length)];
  slot.tower = { def: unitFor(0, rand, 0), tier: 0, cooldown: 0 };

  for (let guard = 0; guard < 64; guard++) {
    const merge = findMerge(board as unknown as Slot[], rand, 0);
    if (!merge) break;
    let removed = 0;
    for (const s of board) {
      if (removed >= B.MERGE_REQUIRED) break;
      if (s.tower?.def.name === merge.consumed && s.tower.tier === merge.tier - 1) {
        s.tower = null;
        removed++;
      }
    }
    (merge.slot as unknown as ModelSlot).tower = {
      def: merge.produced,
      tier: merge.tier,
      cooldown: 0,
    };
  }
}

/**
 * 웨이브를 상대로 한 보드의 **실효 DPS**.
 *
 * 오버킬 손실을 반영한다 (2026-07-20 추가) — 한 방 피해가 몹 체력을 넘으면 초과분은
 * 그냥 버려진다. 초중반에는 GOD 한 방이 몹 체력의 7~30배라 이 손실이 지배적이다.
 */
function boardDpsVsWave(board: readonly ModelSlot[], upgrades: number, round: number): number {
  const hp = B.enemyHP(round);
  const armor = B.enemyArmor(round);
  const levels: [number, number, number, number] = [upgrades, upgrades, upgrades, upgrades];

  let total = 0;
  for (const slot of board) {
    if (!slot.tower) continue;
    const hit = B.effectiveDamage(damage(slot.tower, levels), armor);
    const shots = 1 / attackInterval(slot.tower);
    const targets = isSplash(slot.tower) ? SPLASH_TARGETS : 1;
    // 오버킬 — 한 방이 몹 하나를 넘겨 죽여도 초과분은 이월되지 않는다
    const useful = Math.min(hit, hp);
    total += useful * targets * shots * dutyCycle(slot.index, range(slot.tower));
  }
  return total;
}

// ───────── 수입 ─────────
/** 라운드 r을 마쳤을 때 누적 킬 (몹을 전부 잡았다고 본다) */
function cumulativeKills(round: number): number {
  let kills = 0;
  for (let r = 1; r <= round; r++) kills += B.enemyCount(r);
  return kills;
}

/** 그 라운드에 새로 들어온 킬 수입 (반복 미션 + 일회성 마일스톤) */
function killIncomeAt(round: number): number {
  const before = cumulativeKills(round - 1);
  const after = cumulativeKills(round);
  const repeat =
    (Math.floor(after / B.KILL_MISSION_EVERY) - Math.floor(before / B.KILL_MISSION_EVERY)) *
    B.KILL_MISSION_REWARD;
  const milestones = B.KILL_MILESTONES.filter(([k]) => before < k && after >= k).reduce(
    (sum, [, reward]) => sum + reward,
    0,
  );
  return repeat + milestones;
}

// ───────── 보스 수입 — 상·하한 밴드 ─────────
//
// 골드 → 타워 → 보스 → 골드로 물리는 구조를 **끊는다**. 보스로 얼마를 벌 수 있는지를
// 보드와 무관하게 "가장 운 좋을 때 / 가장 나쁠 때"의 두 값으로 두고, 그 사이를 밴드로
// 본다. 설계를 먼저 정하고 보스 체력·보상을 거기 맞추는 **역방향 작업**이 가능해진다.

/** 한 라운드에 시도할 수 있는 소환 횟수 (쿨타임이 정한다) */
export const bossAttemptsPerRound = (): number => B.ROUND_SECONDS / B.BOSS_COOLDOWN_SECONDS;

export type BossLuck = 'best' | 'typical' | 'worst' | 'mixed';

/**
 * '보통' 밴드가 몇 번 시도해야 한 칸 오르는가. 사다리 봇 실측(2026-07-20)에서
 * "2번 벌고 도전"이 사망 시점(R42)까지 평균 Lv4.3에 도달한 것에 맞췄다.
 */
export const TYPICAL_ATTEMPTS_PER_RUNG = 4;

/**
 * 라운드 r까지 보스로 번 누적 골드.
 *
 * - `best` — 시도할 때마다 한 칸씩 올라간다. Lv8을 찍은 뒤에는 Lv8을 반복 처치.
 *   보드가 항상 충분히 셌다는 뜻이라 **도달 불가능한 상한**이다.
 * - `worst` — Lv1을 영영 못 벗어난다. 첫 돌파 보너스 한 번 + Lv1 반복 처치.
 *   보스를 부르되 한 칸도 못 오르는 최악이다.
 */
export function bossGoldBound(round: number, luck: BossLuck, attemptsPerRung = TYPICAL_ATTEMPTS_PER_RUNG): number {
  const attempts = Math.floor(bossAttemptsPerRound() * round);
  const reward = (level: number): number =>
    B.BOSS_KILL_MINERAL[Math.min(level, B.BOSS_MAX_LEVEL) - 1] ?? 0;

  let gold = 0;
  if (luck === 'typical' || luck === 'mixed') {
    let cleared = 0;
    for (let i = 0; i < attempts; i++) {
      const canClimb = i > 0 && i % attemptsPerRung === 0 && cleared < B.BOSS_MAX_LEVEL;
      if (canClimb) {
        cleared++;
        gold += reward(cleared) * (B.BOSS_FIRST_CLEAR_BONUS ? 2 : 1);
      } else {
        gold += reward(Math.max(1, cleared));
      }
    }
    return gold;
  }
  if (luck === 'worst') {
    if (attempts >= 1) gold += reward(1) * (B.BOSS_FIRST_CLEAR_BONUS ? 2 : 1);
    gold += Math.max(0, attempts - 1) * reward(1);
    return gold;
  }
  // best — 매 시도마다 새 레벨을 연다
  let cleared = 0;
  for (let i = 0; i < attempts; i++) {
    if (cleared < B.BOSS_MAX_LEVEL) {
      cleared++;
      gold += reward(cleared) * (B.BOSS_FIRST_CLEAR_BONUS ? 2 : 1);
    } else {
      gold += reward(B.BOSS_MAX_LEVEL);
    }
  }
  return gold;
}

// ───────── 한 판 샘플 ─────────
export interface RunSample {
  /** 처음으로 웨이브를 못 막은 라운드 (끝까지 갔으면 maxRound + 1) */
  readonly deathRound: number;
  readonly perRound: readonly {
    round: number;
    gold: number;
    units: number;
    topTier: number;
    waveDps: number;
    needDps: number;
    passed: boolean;
    lives: number;
    leaked: number;
  }[];
}

export interface ModelOptions {
  /** 보스 수입을 어느 쪽 끝으로 넣는가. null이면 보스 수입 없음 */
  readonly bossLuck?: BossLuck | null;
  readonly maxRound?: number;
  /**
   * 웨이브 총체력에 곱할 배수 (역방향 탐색용). 상수를 안 고치고 후보 곡선을 시험한다.
   * `height` = 전 구간 일괄 배수, `slope` = 라운드마다 누적되는 기울기 보정.
   */
  readonly waveScale?: { height: number; slope: number };
}

const scaledWaveHp = (round: number, scale?: ModelOptions['waveScale']): number =>
  B.waveTotalHp(round) * (scale ? scale.height * Math.pow(scale.slope, round - 1) : 1);

export function sampleRun(rand: () => number, options: ModelOptions = {}): RunSample {
  const { bossLuck = null, maxRound = B.CLEAR_ROUND, waveScale } = options;

  const board = emptyBoard();
  /**
   * `mixed` — **보스 운을 판마다 뽑는다.** 밴드를 따로 계산하면 그 분산이 곡선에
   * 안 들어가서 통과율이 2~3라운드 만에 100%→0%로 떨어진다(측정 2026-07-20).
   * 실제 플레이어 집단은 밴드에 흩어져 있으므로, 사다리 운이 곧 판별 분산의 주 원천이다.
   * 1(매 시도 등반) ~ 14(거의 못 오름)를 균등하게 뽑는다.
   */
  const attemptsPerRung = bossLuck === 'mixed' ? 1 + Math.floor(rand() * 14) : TYPICAL_ATTEMPTS_PER_RUNG;
  let unitsBuilt = 0;
  let spent = 0;
  let lives = B.START_LIVES;
  let deathRound = maxRound + 1;
  const perRound: RunSample['perRound'][number][] = [];

  for (let round = 1; round <= maxRound; round++) {
    // 누적 수입 — 킬 수입 + (보스 밴드의 한쪽 끝). 보스는 보드와 물리지 않는다.
    let earned = B.START_MINERAL;
    for (let r = 1; r <= round; r++) earned += killIncomeAt(r);
    if (bossLuck) earned += bossGoldBound(round, bossLuck, attemptsPerRung);

    while (earned - spent >= B.spawnUnitCost(unitsBuilt) && board.some((s) => !s.tower)) {
      spent += B.spawnUnitCost(unitsBuilt);
      unitsBuilt++;
      placeUnit(board, rand);
    }

    const upgrades = Math.floor(round / 8); // 가스 업그레이드 대략치
    const dps = boardDpsVsWave(board, upgrades, round);

    /**
     * **판정 — 전멸이 아니라 누출이다.**
     *
     * 라운드 안에 다 못 잡아도 바로 죽지 않는다. 못 잡은 만큼 새어나가 라이프를
     * 깎을 뿐이고, 라이프가 0이 되는 순간이 사망이다. 이걸 "라운드 내 전멸"로 잡으면
     * 초반이 전부 실패로 나온다(R1은 원래 못 다 잡는다).
     *
     * 처리 가능량 = 보드 실효 DPS × 몹이 경로에 머무는 시간(스폰창 + 완주).
     */
    const window = B.ROUND_SECONDS + PATH_LENGTH / B.ENEMY_SPEED;
    const capacity = dps * window;
    const waveHp = scaledWaveHp(round, waveScale);
    const killedFraction = Math.min(1, capacity / waveHp);
    const leaked = Math.round(B.enemyCount(round) * (1 - killedFraction));
    lives -= leaked;

    perRound.push({
      round,
      gold: Math.round(earned - spent),
      units: unitsBuilt,
      topTier: Math.max(0, ...board.filter((s) => s.tower).map((s) => s.tower!.tier)),
      waveDps: Math.round(dps),
      needDps: Math.round(waveHp / window),
      passed: lives > 0,
      lives,
      leaked,
    });

    if (lives <= 0) {
      deathRound = round;
      break;
    }
  }

  return { deathRound, perRound };
}

// ───────── 리포트 ─────────
const lcg = (seed: number): (() => number) => {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
};

const percentile = (values: readonly number[], p: number): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
};

export function survivalCurve(samples: number, options: ModelOptions = {}) {
  const runs = Array.from({ length: samples }, (_, i) => sampleRun(lcg(i * 7919 + 13), options));
  const maxRound = options.maxRound ?? B.CLEAR_ROUND;
  const rows = [];
  for (let round = 1; round <= maxRound; round++) {
    const alive = runs.filter((r) => r.deathRound > round).length;
    const at = runs.map((r) => r.perRound.find((p) => p.round === round)).filter(Boolean);
    if (at.length === 0) break;
    rows.push({
      round,
      survival: alive / runs.length,
      goldMid: percentile(at.map((p) => p!.gold), 0.5),
      unitsMid: percentile(at.map((p) => p!.units), 0.5),
      topTierMid: percentile(at.map((p) => p!.topTier), 0.5),
      dpsP10: percentile(at.map((p) => p!.waveDps), 0.1),
      dpsMid: percentile(at.map((p) => p!.waveDps), 0.5),
      dpsP90: percentile(at.map((p) => p!.waveDps), 0.9),
      needDps: at[0]!.needDps,
      livesMid: percentile(at.map((p) => p!.lives), 0.5),
      leakedMid: percentile(at.map((p) => p!.leaked), 0.5),
    });
  }
  return { rows, deathRounds: runs.map((r) => r.deathRound) };
}

function printCurve(label: string, options: ModelOptions): void {
  const { rows, deathRounds } = survivalCurve(300, options);
  console.log(`\n═══ ${label} ═══`);
  console.log('R    생존률   골드   유닛 최고티어  보드DPS(p10/p50/p90)      필요DPS  누출  라이프');
  const TIER = ['Lv1', 'Lv2', 'Lv3', 'Lv4', 'GOD'];
  for (const r of rows) {
    if (r.round % 5 !== 0 && r.round !== 1) continue;
    console.log(
      `R${r.round}`.padEnd(5),
      `${(r.survival * 100).toFixed(0)}%`.padStart(6),
      String(r.goldMid).padStart(6),
      String(r.unitsMid).padStart(5),
      TIER[r.topTierMid].padStart(7),
      `${r.dpsP10} / ${r.dpsMid} / ${r.dpsP90}`.padStart(23),
      String(r.needDps).padStart(9),
      String(r.leakedMid).padStart(5),
      String(r.livesMid).padStart(7),
    );
  }
  const sorted = [...deathRounds].sort((a, b) => a - b);
  console.log(
    `사망 라운드 — p10 R${percentile(sorted, 0.1)} · 중앙 R${percentile(sorted, 0.5)} · p90 R${percentile(sorted, 0.9)}`,
  );
}

if (process.argv[1]?.includes('survival-model')) {
  console.log('생존률 수학 모델 — 게임 루프 없이 상수만으로 계산 (표본 300)');
  console.log('주의:');
  for (const c of MODEL_CAVEATS) console.log('  ·', c);
  console.log('\n보스 수입 밴드 (누적, 보드와 무관하게 상·하한만):');
  console.log('  R    최악(Lv1만)   최선(매번 한 칸씩)');
  for (const r of [10, 20, 30, 40, 50, 60]) {
    console.log(
      `  R${r}`.padEnd(7),
      String(bossGoldBound(r, 'worst')).padStart(10),
      String(bossGoldBound(r, 'best')).padStart(18),
    );
  }
  printCurve('보스 수입 없음', { bossLuck: null });
  printCurve('보스 최악 (Lv1만 반복)', { bossLuck: 'worst' });
  printCurve('보스 최선 (매 시도 한 칸씩)', { bossLuck: 'best' });
}

// ───────── 역방향 설계 — 목표 곡선에 맞는 웨이브 체력을 찾는다 ─────────
//
// 상수를 고치고 재는 대신, 후보 곡선(높이 × 기울기)을 훑어 목표 통과율에 가장 가까운
// 조합을 찾는다. 찾은 배수를 WAVE_HP_R1과 성장률로 되돌리는 건 사람이 판단한다.

export const TARGET_CURVE: readonly (readonly [round: number, survival: number])[] = [
  [25, 0.80],
  [30, 0.75],
  [40, 0.50],
  [50, 0.20],
  [60, 0.08],
];

export function fitWaveCurve(bossLuck: BossLuck, samples = 120) {
  let best: { height: number; slope: number; err: number; got: number[] } | null = null;
  // 기울기는 1 미만도 본다 — 초중반을 올리면서 후반이 과도해지지 않게 눕혀야 한다
  for (let height = 1; height <= 10; height += 0.5) {
    for (let slope = 0.96; slope <= 1.03; slope += 0.005) {
      const { rows } = survivalCurve(samples, { bossLuck, waveScale: { height, slope } });
      const got: number[] = [];
      let err = 0;
      for (const [round, want] of TARGET_CURVE) {
        const row = rows.find((r) => r.round === round);
        const have = row ? row.survival : 0;
        got.push(have);
        err += (have - want) ** 2;
      }
      if (!best || err < best.err) best = { height, slope, err, got };
    }
  }
  return best!;
}
