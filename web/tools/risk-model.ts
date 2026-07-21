// ───────── 라운드별 통과 확률 모델 (2026-07-19, 사용자 제안) ─────────
//
//   골드 획득 범위 → 타워 전환 시 파워(DPS) 분포 → 정규분포로 통과 확률
//   → 보스 처치 확률 → 다음 라운드 골드에 누적 → 반복
//
// 시뮬레이션(게임 루프 실행)이 아니라 **분포 전파 모델**이다. 실행이 1초 미만이라
// 상수를 바꿔가며 즉시 되먹임을 볼 수 있다 — 밸런스 손잡이를 돌리는 도구다.
//
//   cd web && npx vite-node tools/risk-model.ts [--band=p10|p50|p90] [--csv]
//
// ── 모델 구조 ──
// 1. 골드: 웨이브 보상 + 킬 미션 + 보스 처치 + 누출 위로금 (전부 balance.ts에서 읽는다)
// 2. 배분: 광부 PROBE_TARGET기까지 우선, 나머지는 전부 타워 (가스는 전부 병과 업그레이드)
// 3. 파워: 누적 유닛 수 → 보드 DPS. **운(z)이 곱으로 붙는다** — 아래 DPS_TABLE은
//    실제 조합 로직 몬테카를로(시드 600판) 실측이고, CV가 유닛 수에 따라 줄어든다
//    (조합 운이 평균으로 수렴). z는 판 전체에 **지속**된다 — 좋은 보드는 계속 좋다.
// 4. 판정: 필요 DPS = 웨이브 총체력 ÷ 유효 노출시간. 모자란 만큼 누출 → 라이프 감소.
//
// ── 가정(교정 대상) ──
// - **유효 노출시간은 실측 역산 표**(EXPOSURE_TABLE)다. 1차 모델은 18초 고정으로 뒀다가
//   실제 게임의 무누출 임계와 2배 이상 어긋났다(R40 실측 42기 vs 모델 91기로도 실패).
//   원인: 명목 DPS는 스플래시가 여러 마리를 동시에 때리는 이득·크리쳐 감속·웨이브가
//   경로에 머무는 시간을 전부 빼먹는다. 이 효과들이 **몹 밀도에 비례해 커지므로**
//   유효 노출은 라운드를 따라 30초(R10) → 149초(R40)로 자란다.
//   → 표 밖(R45+)은 외삽이라 신뢰도가 급격히 떨어진다. 재측정 필요.
// - 보스 노출은 웨이브와 달리 단일 대상이라 한 바퀴(56.2초)의 절반으로 둔다.
// - 영웅은 **무증강 기본 성장만** 더한다 (2026-07-19 캐리 차단 이후 보조 딜러).
//   레벨은 킬 XP만으로 오른다고 보고 라운드당 +0.7렙으로 근사.
// - 초반 HP 완화로 R1~4는 몹 체력이 ×0.6~0.9로 낮게 스폰된다 — 반영.
// - 장갑 감산·스플래시 광역 이득·크리쳐 감속은 미반영 — 대략 상쇄로 본다.
// - 보스는 **잡을 수 있는 최고 레벨만** 부르는 안전 운영을 가정한다(실패 = 라이프 -1).

import * as B from '../src/data/balance';

/** 누적 유닛 수 → [평균 DPS, 변동계수] — 실제 조합 로직 MC 실측 (업그레이드 0 기준) */
const DPS_TABLE: readonly (readonly [units: number, mean: number, cv: number])[] = [
  [0, 0, 0.30], [5, 29, 0.281], [10, 68, 0.250], [20, 176, 0.282], [30, 319, 0.278],
  [40, 497, 0.250], [52, 738, 0.220], [70, 1159, 0.198], [90, 1667, 0.181],
  [120, 2425, 0.154], [150, 3216, 0.133], [200, 4496, 0.112],
];

/** 무증강 영웅 레벨 → DPS (game/hero.ts computeStats 실측) */
const HERO_DPS: readonly (readonly [level: number, dps: number])[] = [
  [1, 17], [5, 30], [10, 63], [15, 119], [20, 197], [25, 325], [30, 525], [40, 1183],
];
function heroDps(level: number): number {
  const t = HERO_DPS;
  if (level <= t[0][0]) return t[0][1];
  for (let i = 1; i < t.length; i++) {
    if (level <= t[i][0]) {
      const f = (level - t[i - 1][0]) / (t[i][0] - t[i - 1][0]);
      return t[i - 1][1] + f * (t[i][1] - t[i - 1][1]);
    }
  }
  return t[t.length - 1][1];
}
/** 킬 XP만으로 크는 영웅 레벨 근사 */
const heroLevelAt = (round: number): number => 1 + 0.7 * round;

/** 표 사이는 선형 보간, 표 밖은 마지막 기울기로 외삽 */
function dpsStats(units: number): { mean: number; cv: number } {
  if (units <= 0) return { mean: 0, cv: 0.3 };
  const t = DPS_TABLE;
  for (let i = 1; i < t.length; i++) {
    if (units <= t[i][0]) {
      const f = (units - t[i - 1][0]) / (t[i][0] - t[i - 1][0]);
      return {
        mean: t[i - 1][1] + f * (t[i][1] - t[i - 1][1]),
        cv: t[i - 1][2] + f * (t[i][2] - t[i - 1][2]),
      };
    }
  }
  const last = t[t.length - 1];
  const prev = t[t.length - 2];
  const slope = (last[1] - prev[1]) / (last[0] - prev[0]); // 포화 구간 ≈ 22.5 DPS/유닛
  // CV는 √n로 줄어든다 (조합 운의 평균 회귀)
  return { mean: last[1] + slope * (units - last[0]), cv: last[2] * Math.sqrt(last[0] / units) };
}

// ── 유효 노출시간 — 실제 엔진의 무누출 임계에서 역산 (2026-07-19 측정) ──
// 각 라운드에서 "누출 0이 되는 최소 유닛 수"를 이분 탐색으로 찾고,
// 그 보드의 명목 DPS로 웨이브 총체력을 나눈 값. 스플래시·감속·체류시간이 전부 녹아 있다.
const EXPOSURE_TABLE: readonly (readonly [round: number, seconds: number])[] = [
  [10, 30.4], [15, 32.9], [20, 40.5], [25, 55.8], [30, 56.6], [35, 78.9], [40, 149.1],
];
export function exposureSeconds(round: number): number {
  const t = EXPOSURE_TABLE;
  if (round <= t[0][0]) return t[0][1];
  for (let i = 1; i < t.length; i++) {
    if (round <= t[i][0]) {
      const f = (round - t[i - 1][0]) / (t[i][0] - t[i - 1][0]);
      return t[i - 1][1] + f * (t[i][1] - t[i - 1][1]);
    }
  }
  // 표 밖은 마지막 구간의 복리 성장률로 외삽 — **신뢰도 낮음**
  const [r0, s0] = t[t.length - 2];
  const [r1, s1] = t[t.length - 1];
  const rate = Math.pow(s1 / s0, 1 / (r1 - r0));
  return s1 * Math.pow(rate, round - r1);
}
const BOSS_EXPOSURE = B.BOSS_LAP_SECONDS * 0.5;

// ── 배분 정책 ──
const PROBE_TARGET = 8; // 광부 목표 대수
const PROBE_FROM_ROUND = 3; // 초반 전력이 먼저다 — 이 라운드부터 광부를 산다
// 광부는 **예산을 남겨야 산다** — 매 라운드 골드를 타워로 다 쓰면 60~300짜리 광부를
// 영영 못 산다(1차 모델의 정책 결함: R40에 업그레이드 L9에서 멈췄다).
const PROBE_SAVE_RATIO = 0.35; // 광부를 다 살 때까지 수입의 이만큼은 타워에 안 쓴다
const UPGRADE_RACES = 4; // 가스는 4병과에 고르게

/** 병과 업그레이드를 전 병과 L레벨까지 올리는 누적 가스 */
const gasForLevel = (L: number): number => {
  let sum = 0;
  for (let k = 0; k < L; k++) sum += B.upgradeGasCost(k) * UPGRADE_RACES;
  return sum;
};
/** 누적 가스로 도달 가능한 균등 업그레이드 레벨 */
function upgradeLevelFor(gas: number): number {
  let L = 0;
  while (gasForLevel(L + 1) <= gas) L++;
  return L;
}

export interface RoundRow {
  round: number;
  gold: number;        // 그 라운드까지 누적 획득 골드
  units: number;       // 누적 구매 유닛
  probes: number;
  upgradeLv: number;
  dps: number;         // 운(z) 반영 보드 DPS (업그레이드 포함)
  required: number;    // 웨이브를 정확히 막는 데 필요한 DPS
  margin: number;      // dps / required
  leakedMobs: number;
  lives: number;
  bossLevel: number;   // 이번 라운드에 소환한 보스 레벨 (0 = 안 부름)
  bossKilled: boolean;
  cleared: boolean;
  dead: boolean;
}

/** 운 z(표준정규 분위)를 고정하고 R1~maxRound를 돌린다 */
export function runBand(z: number, maxRound = 70): RoundRow[] {
  let gold = B.START_MINERAL;
  let gas = B.START_GAS;
  let units = 0;
  let probes = 0;
  let lives = B.START_LIVES;
  let bossCleared = 0;
  let spentOnUnits = 0;
  let nextBossRound = 1;
  let reserve = 0;
  const rows: RoundRow[] = [];

  for (let r = 1; r <= maxRound; r++) {
    // ── 수입 ──
    const income =
      B.waveReward(r) + B.enemyCount(r) * (B.KILL_MISSION_REWARD / B.KILL_MISSION_EVERY);
    gold += income;
    gas += probes * B.GAS_PER_PROBE_SECOND * B.roundCountdownSeconds(r);

    // ── 지출: 초반은 타워, R3부터 광부에 예산을 떼어 둔다 ──
    const saving = probes < PROBE_TARGET && r >= PROBE_FROM_ROUND;
    if (saving) reserve += income * PROBE_SAVE_RATIO;
    while (probes < PROBE_TARGET && reserve >= B.probeCost(probes)) {
      reserve -= B.probeCost(probes);
      probes++;
    }
    if (!saving) { gold += reserve; reserve = 0; }
    while (gold - (saving ? 0 : 0) >= B.spawnUnitCost(units)) {
      gold -= B.spawnUnitCost(units);
      spentOnUnits += B.spawnUnitCost(units);
      units++;
    }
    const upgradeLv = upgradeLevelFor(gas);

    // ── 파워 (운 z가 곱으로, 판 내내 지속) ──
    const { mean, cv } = dpsStats(units);
    const towerDps =
      mean * Math.max(0.05, 1 + cv * z) * (1 + B.UPGRADE_DAMAGE_PER_LEVEL * upgradeLv);
    const dps = towerDps + heroDps(heroLevelAt(r));

    // ── 웨이브 판정 — 초반 템포는 몹 체력을 낮춰서 스폰한다 ──
    const required = (B.waveTotalHp(r) * B.earlyEnemyHpMultiplier(r)) / exposureSeconds(r);
    const margin = required > 0 ? dps / required : Infinity;
    const leakFraction = Math.max(0, 1 - margin);
    const leakedMobs = Math.round(leakFraction * B.enemyCount(r));
    lives -= leakedMobs;
    gold += leakedMobs * B.LEAK_MINERAL;

    // ── 보스: 쿨타임마다, **잡을 수 있는 최고 레벨**을 부른다(안전 운영) ──
    let bossLevel = 0;
    let bossKilled = false;
    if (r >= nextBossRound) {
      nextBossRound = r + B.BOSS_COOLDOWN_SECONDS / B.roundCountdownSeconds(r);
      const open = Math.min(bossCleared + 1, B.BOSS_MAX_LEVEL);
      // 화력이 닿는 최고 레벨을 고른다. 하나도 못 잡으면 그래도 Lv1은 시도한다.
      let pick = 0;
      for (let L = open; L >= 1; L--) {
        if (dps * BOSS_EXPOSURE >= B.bossHP(L)) { pick = L; break; }
      }
      bossLevel = pick || 1;
      bossKilled = dps * BOSS_EXPOSURE >= B.bossHP(bossLevel);
      if (bossKilled) {
        gold += B.BOSS_KILL_MINERAL[bossLevel - 1];
        bossCleared = Math.max(bossCleared, bossLevel);
      } else {
        lives -= 1;
      }
    }

    const dead = lives <= 0;
    rows.push({
      round: r, gold: Math.round(gold + spentOnUnits), units, probes, upgradeLv,
      dps: Math.round(dps), required: Math.round(required),
      margin: Math.round(margin * 100) / 100,
      leakedMobs, lives: Math.max(0, lives), bossLevel, bossKilled,
      cleared: r >= B.CLEAR_ROUND && !dead, dead,
    });
    if (dead) break;
  }
  return rows;
}

/** 표준정규 CDF (Abramowitz-Stegun 7.1.26) */
export function normalCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}

/** 그 라운드를 **무손실로** 넘길 확률 — 지속 운 z에 대한 정규 분포 */
export function passProbability(round: number, band: RoundRow[]): number {
  const row = band.find((x) => x.round === round);
  if (!row) return 0;
  const { mean, cv } = dpsStats(row.units);
  const boost = 1 + B.UPGRADE_DAMAGE_PER_LEVEL * row.upgradeLv;
  const required = (B.waveTotalHp(round) * B.earlyEnemyHpMultiplier(round)) / exposureSeconds(round);
  const hero = heroDps(heroLevelAt(round));
  // required = mean×boost×(1+cv·z) + hero 를 만족하는 z
  const zNeeded = ((required - hero) / (mean * boost) - 1) / cv;
  return 1 - normalCdf(zNeeded);
}

// ───────── 리포트 ─────────

/** 그 판이 도달한 최고 라운드 (클리어면 CLEAR_ROUND 이상) */
const reachedRound = (z: number): number => {
  const rows = runBand(z);
  return rows[rows.length - 1].round;
};

/** R60 클리어에 필요한 최소 운 z* — 이분 탐색. 확률 = 1 − Φ(z*) */
function clearThresholdZ(): number | null {
  if (reachedRound(-4) >= B.CLEAR_ROUND) return -4; // 운 없이도 클리어
  if (reachedRound(4) < B.CLEAR_ROUND) return null; // 최고 운으로도 불가
  let lo = -4;
  let hi = 4;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (reachedRound(mid) >= B.CLEAR_ROUND) hi = mid;
    else lo = mid;
  }
  return hi;
}

const BANDS: [string, number][] = [
  ['p10 (불운)', -1.2816], ['p25', -0.6745], ['p50 (평균)', 0],
  ['p75', 0.6745], ['p90 (행운)', 1.2816],
];

console.log('=== 운 밴드별 결말 (z는 판 내내 지속) ===');
for (const [label, z] of BANDS) {
  const rows = runBand(z);
  const last = rows[rows.length - 1];
  const bestBoss = Math.max(0, ...rows.filter((r) => r.bossKilled).map((r) => r.bossLevel));
  const r30 = rows.find((x) => x.round === 30);
  console.log(
    `${label.padEnd(12)} ${last.cleared ? `R${B.CLEAR_ROUND} 클리어 ✔` : `R${last.round} 사망`}` +
      ` · 최고 보스 Lv${bestBoss} · R30 여유배수 ${r30 ? r30.margin.toFixed(2) : '-'}`,
  );
}

const zStar = clearThresholdZ();
console.log(
  `\n=== R${B.CLEAR_ROUND} 클리어 확률 ===\n` +
    (zStar === null
      ? '  0% — 최고 운(z=+4σ)으로도 도달 불가'
      : zStar <= -4
        ? '  100% — 어떤 운에서도 클리어'
        : `  필요 운 z* = ${zStar.toFixed(2)}σ → 클리어 확률 ${((1 - normalCdf(zStar)) * 100).toFixed(1)}%`),
);

const mid = runBand(0);
console.log('\n=== 평균(p50) 라운드별 상세 ===');
console.log('  R | 누적골드 | 유닛 | 업글 | 보드DPS | 필요DPS | 여유 | 누출 | 라이프 | 보스 | 무손실통과');
for (const row of mid) {
  if (row.round % 5 !== 0 && row.round > 3 && row.round < B.CLEAR_ROUND - 2) continue;
  const p = passProbability(row.round, mid);
  const boss = row.bossLevel === 0 ? '  —' : `Lv${row.bossLevel}${row.bossKilled ? '✔' : '✗'}`;
  console.log(
    `  R${String(row.round).padStart(2)} | ${String(row.gold).padStart(8)} | ${String(row.units).padStart(4)} |` +
      ` L${String(row.upgradeLv).padStart(2)} | ${String(row.dps).padStart(7)} | ${String(row.required).padStart(7)} |` +
      ` ${row.margin.toFixed(2).padStart(5)} | ${String(row.leakedMobs).padStart(4)} | ${String(row.lives).padStart(6)} |` +
      ` ${boss} | ${(p * 100).toFixed(0).padStart(3)}%`,
  );
}

// ── 시트 출력 ──
if (process.argv.includes('--csv')) {
  const { mkdirSync, writeFileSync } = await import('node:fs');
  const { dirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const outDir = `${dirname(fileURLToPath(import.meta.url))}/../../docs/balance`;
  const header = [
    'round', 'waveTotalHp', 'requiredDps', 'units', 'upgradeLv',
    'dpsP10', 'dpsP50', 'dpsP90', 'marginP10', 'marginP50', 'marginP90',
    'passProbPct', 'livesP50', 'bossLevel', 'bossKilledP50',
  ];
  const p10 = runBand(-1.2816);
  const p90 = runBand(1.2816);
  const rows = [header.join(',')];
  for (let r = 1; r <= 70; r++) {
    const a = p10.find((x) => x.round === r);
    const b = mid.find((x) => x.round === r);
    const c = p90.find((x) => x.round === r);
    if (!b) break;
    rows.push([
      r, Math.round(B.waveTotalHp(r)), b.required, b.units, b.upgradeLv,
      a?.dps ?? '', b.dps, c?.dps ?? '',
      a?.margin ?? '', b.margin, c?.margin ?? '',
      Math.round(passProbability(r, mid) * 100), b.lives, b.bossLevel, b.bossKilled ? 1 : 0,
    ].join(','));
  }
  mkdirSync(outDir, { recursive: true });
  writeFileSync(`${outDir}/round-risk-model.csv`, rows.join('\n') + '\n');
  console.log('\ndocs/balance/round-risk-model.csv 생성');
}
