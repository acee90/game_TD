// ───────── 운영 정책 유전알고리즘 ─────────
// 실제 Game 클래스를 그대로 돌려서 "어떻게 운영하는 게 오래 사는가"를 찾는다.
//
// 목적은 최강 봇이 아니라 **설계 의도 검증**이다.
//   - 안정형(실버만)이 탐욕형(플래티넘 도박)보다 평균 라운드가 높은가?
//   - 골드는 어디에 쓰는 게 효율적인가 — 유닛/영웅 강화/프로브(가스 경제)?
//   - 보스는 최고 레벨을 바로 부르는 게 맞는가, 한 단계 낮춰 안전하게 가는가?
//
// 실행: npx vite-node tools/ga-sim.ts
//       npx vite-node tools/ga-sim.ts -- --quick   (탐색 축소판)

import { Game } from '../src/game/game';
import * as B from '../src/data/balance';
import type { AugmentCard } from '../src/data/hero';
import type { Race } from '../src/game/types';

// ── 유전자 ──
// 연속값은 [0,1]로 정규화해 두고 쓰는 곳에서 스케일한다.
interface Genome {
  /** 프로브(가스 채취) 목표 기수 0~8. 0이면 가스 경제를 버린다 */
  probeTarget: number;
  /** 영웅 강화 전에 남겨둘 미네랄 (0~400). 낮을수록 영웅 몰빵 */
  heroReserve: number;
  /** 증강 계열 몰기 성향 0~1. 높을수록 이미 든 계열을 또 고른다 */
  focus: number;
  /** 등급 탐욕 0~1. 높을수록 몹 체력 대가를 무릅쓰고 골드/플래티넘을 고른다 */
  rarityGreed: number;
  /** 보스를 최고 해금 레벨에서 몇 단계 낮춰 부르는가 0~2 (안정 운영) */
  bossBack: number;
  /** 필드의 일반 몹이 이 수 이하일 때만 보스를 부른다 0~30 */
  bossSafety: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// ── 시드 난수 (게임 주입용과 GA 자체용을 분리) ──
const lcg = (seed: number) => {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
};

// ── 정책 실행 ──
const RARITY_RANK: Record<string, number> = { silver: 0, gold: 1, platinum: 2 };

function scoreCard(g: Genome, game: Game, card: AugmentCard): number {
  const sameKind = game.hero.augments.filter((c) => c.augment.kind === card.augment.kind).length;
  // 대가 메커니즘이 삭제돼 등급은 순수 상방이다. 탐욕 유전자는
  // "등급을 얼마나 우선하는가"로 남는다 — 계열 몰기와 충돌할 때 갈린다.
  return 1 + g.focus * 3 * sameKind + g.rarityGreed * 2 * RARITY_RANK[card.rarity];
}

function pickAugment(g: Genome, game: Game): void {
  let best = 0;
  let bestScore = -Infinity;
  game.augmentChoices.forEach((card, i) => {
    const s = scoreCard(g, game, card);
    if (s > bestScore) {
      bestScore = s;
      best = i;
    }
  });
  game.chooseAugment(best);
}

/** 가스는 타워가 가장 많은 종족부터 올린다 (고정 휴리스틱) */
function spendGas(game: Game): void {
  const byRace = [0, 0, 0, 0];
  for (const s of game.slots) if (s.tower) byRace[s.tower.def.race]++;
  const race = byRace.indexOf(Math.max(...byRace)) as Race;
  for (let i = 0; i < 8 && game.gas >= game.upgradeCost(race); i++) game.upgrade(race);
}

interface RunResult {
  round: number;
  score: number;
  heroLevel: number;
  statPoints: number;
  augments: number;
  probes: number;
  heroShare: number;
  tankAssist: number;
}

const MAX_TICKS = 60 * 60 * 45; // 45분 상한 (≈ R122)
const DECIDE_EVERY = 30; // 0.5초마다 의사결정

function runGame(g: Genome, seed: number): RunResult {
  const game = new Game(lcg(seed));
  let lastRound = 0;

  for (let t = 0; t < MAX_TICKS && !game.over; t++) {
    if (game.paused) {
      // 레벨업 스탯 카드가 먼저 뜬다 — 가장 덜 가진 스탯에 배분 (균형 봇)
      if (game.pendingStatPoints > 0) {
        const stat = (['str', 'agi', 'int'] as const).reduce((a, b) =>
          game.hero.bought[a] <= game.hero.bought[b] ? a : b);
        game.chooseStat(stat);
      } else {
        pickAugment(g, game);
      }
    }

    if (t % DECIDE_EVERY === 0) {
      // 보스: 안전 조건을 만족하면 부른다
      const normals = game.enemies.filter((e) => e.kind !== 'boss').length;
      if (game.canSummonBoss && normals <= g.bossSafety) {
        const level = clamp(game.maxBossLevel - g.bossBack, 1, game.maxBossLevel);
        game.summonBoss(level);
      }
      // 프로브: 목표 기수까지, 유닛 2기 값은 남기고 산다
      while (
        game.probes < g.probeTarget &&
        game.mineral >= B.PROBE_MINERAL + 2 * B.SPAWN_UNIT_MINERAL
      ) {
        if (!game.buyProbe()) break;
      }
      // 유닛: 빈 타일이 있는 한 채운다 (조합의 재료)
      while (game.mineral >= B.SPAWN_UNIT_MINERAL && game.spawnUnitAnywhere()) {}
      // 스탯 구매: 예비금 위로만, 가장 덜 산 스탯부터 (균형 구매)
      for (let guard = 0; guard < 64; guard++) {
        const stat = (['str', 'agi', 'int'] as const).reduce((a, b) =>
          game.hero.bought[a] <= game.hero.bought[b] ? a : b,
        );
        if (!(game.canBuyStat(stat) && game.mineral >= game.statCost(stat) + g.heroReserve)) break;
        if (!game.buyStat(stat)) break;
      }
      spendGas(game);
    }

    game.update(1 / 60);
    lastRound = game.round;
  }

  return {
    round: lastRound,
    score: game.score,
    heroLevel: game.hero.level,
    statPoints: game.hero.bought.str + game.hero.bought.agi + game.hero.bought.int,
    augments: game.hero.augments.length,
    probes: game.probes,
    heroShare: game.heroDamageDealt / Math.max(1, game.heroDamageDealt + game.towerDamageDealt),
    tankAssist: game.tankAssistDamage / Math.max(1, game.towerDamageDealt),
  };
}

// ── 적합도: 같은 시드 묶음으로 전원 평가 (공정 비교) ──
function fitness(g: Genome, seeds: number[]): number {
  let sum = 0;
  for (const s of seeds) sum += runGame(g, s).round;
  return sum / seeds.length;
}

// ── GA 연산 ──
function randomGenome(r: () => number): Genome {
  return {
    probeTarget: Math.floor(r() * (B.PROBE_MAX + 1)),
    heroReserve: Math.floor(r() * 400),
    focus: r(),
    rarityGreed: r(),
    bossBack: Math.floor(r() * 3),
    bossSafety: Math.floor(r() * 31),
  };
}

function crossover(a: Genome, b: Genome, r: () => number): Genome {
  const pick = <K extends keyof Genome>(k: K): Genome[K] => (r() < 0.5 ? a[k] : b[k]);
  return {
    probeTarget: pick('probeTarget'),
    heroReserve: pick('heroReserve'),
    focus: pick('focus'),
    rarityGreed: pick('rarityGreed'),
    bossBack: pick('bossBack'),
    bossSafety: pick('bossSafety'),
  };
}

function mutate(g: Genome, r: () => number): Genome {
  const m = { ...g };
  const gauss = () => (r() + r() + r() - 1.5) * 0.4; // 대략 N(0, 0.35)
  if (r() < 0.25) m.probeTarget = clamp(m.probeTarget + Math.round(gauss() * 8), 0, B.PROBE_MAX);
  if (r() < 0.25) m.heroReserve = clamp(Math.round(m.heroReserve + gauss() * 400), 0, 400);
  if (r() < 0.25) m.focus = clamp(m.focus + gauss(), 0, 1);
  if (r() < 0.25) m.rarityGreed = clamp(m.rarityGreed + gauss(), 0, 1);
  if (r() < 0.25) m.bossBack = clamp(m.bossBack + (r() < 0.5 ? -1 : 1), 0, 2);
  if (r() < 0.25) m.bossSafety = clamp(Math.round(m.bossSafety + gauss() * 30), 0, 30);
  return m;
}

function tournament(pop: Genome[], fits: number[], r: () => number): Genome {
  let best = Math.floor(r() * pop.length);
  for (let i = 0; i < 2; i++) {
    const c = Math.floor(r() * pop.length);
    if (fits[c] > fits[best]) best = c;
  }
  return pop[best];
}

// ── 아키타입: 손으로 짠 비교 기준 ──
const ARCHETYPES: Record<string, Genome> = {
  // 축 하나씩만 다르게 — 프로브를 4로 고정해 가스 경제 교란을 없앤다
  '안정형(실버만)': {
    probeTarget: 4, heroReserve: 150,
    focus: 1, rarityGreed: 0, bossBack: 1, bossSafety: 10,
  },
  '탐욕형(플래티넘 우선)': {
    probeTarget: 4, heroReserve: 150,
    focus: 1, rarityGreed: 1, bossBack: 1, bossSafety: 10,
  },
  '타워몰빵(영웅 강화 없음)': {
    probeTarget: 4, heroReserve: 400,
    focus: 1, rarityGreed: 0.5, bossBack: 1, bossSafety: 10,
  },
  '영웅몰빵(예비금 0)': {
    probeTarget: 4, heroReserve: 0,
    focus: 1, rarityGreed: 0.5, bossBack: 1, bossSafety: 10,
  },
  '분산증강(계열 안 몰기)': {
    probeTarget: 4, heroReserve: 150,
    focus: 0, rarityGreed: 0.5, bossBack: 1, bossSafety: 10,
  },
};

// ── 실행 ──
const quick = process.argv.includes('--quick');
const POP = quick ? 10 : 20;
const GENS = quick ? 4 : 12;
const SEEDS_PER_GEN = quick ? 3 : 5;
const FINAL_SEEDS = quick ? 8 : 20;

const gaRand = lcg(777);

function fmt(g: Genome): string {
  return (
    `프로브${g.probeTarget} 예비금${g.heroReserve} ` +
    `몰기${g.focus.toFixed(2)} 탐욕${g.rarityGreed.toFixed(2)} ` +
    `보스-${g.bossBack} 안전${g.bossSafety}`
  );
}

function evaluate(name: string, g: Genome, seeds: number[]): void {
  const rs = seeds.map((s) => runGame(g, s));
  const rounds = rs.map((x) => x.round).sort((a, b) => a - b);
  const med = <T,>(a: T[]) => a[a.length >> 1];
  const scores = rs.map((x) => x.score).sort((a, b) => a - b);
  console.log(
    `${name}\n  ${fmt(g)}\n` +
      `  사망R p10/p50/p90 = ${rounds[Math.floor(rounds.length * 0.1)]}/${med(rounds)}/${rounds[Math.floor(rounds.length * 0.9)]}` +
      `  점수(중앙) ${Math.round(med(scores) / 1000)}k` +
      `  영웅Lv ${med(rs.map((x) => x.heroLevel).sort((a, b) => a - b))}` +
      `  증강 ${med(rs.map((x) => x.augments).sort((a, b) => a - b))}` +
      `  스탯 ${med(rs.map((x) => x.statPoints).sort((a, b) => a - b))}` +
      `  영웅몫 ${(med(rs.map((x) => x.heroShare).sort((a, b) => a - b)) * 100).toFixed(0)}%` +
      `  탱킹어시스트 ${(med(rs.map((x) => x.tankAssist).sort((a, b) => a - b)) * 100).toFixed(0)}%`,
  );
}

const t0 = Date.now();

// 세대마다 시드를 바꿔 과적합을 피하고, 같은 세대 안에서는 전원 같은 시드로 공정 비교
let pop: Genome[] = Array.from({ length: POP }, () => randomGenome(gaRand));
for (let gen = 0; gen < GENS; gen++) {
  const seeds = Array.from({ length: SEEDS_PER_GEN }, (_, i) => 10_000 + gen * 100 + i);
  const fits = pop.map((g) => fitness(g, seeds));
  const order = fits.map((f, i) => [f, i] as const).sort((a, b) => b[0] - a[0]);
  const best = pop[order[0][1]];
  console.log(
    `세대 ${String(gen + 1).padStart(2)}: 최고 ${order[0][0].toFixed(1)}R  평균 ${(fits.reduce((a, b) => a + b) / fits.length).toFixed(1)}R  | ${fmt(best)}  (${((Date.now() - t0) / 1000).toFixed(0)}s)`,
  );

  const next: Genome[] = [pop[order[0][1]], pop[order[1][1]]]; // 엘리트 2
  while (next.length < POP) {
    next.push(mutate(crossover(tournament(pop, fits, gaRand), tournament(pop, fits, gaRand), gaRand), gaRand));
  }
  pop = next;
}

// 최종 검증: 새 시드 20개로 최고 개체와 아키타입을 나란히
console.log('\n── 최종 검증 (새 시드 ' + FINAL_SEEDS + '개) ──');
const finalSeeds = Array.from({ length: FINAL_SEEDS }, (_, i) => 99_000 + i);
const lastFits = pop.map((g) => fitness(g, finalSeeds.slice(0, 5)));
const champion = pop[lastFits.indexOf(Math.max(...lastFits))];
evaluate('GA 챔피언', champion, finalSeeds);
for (const [name, g] of Object.entries(ARCHETYPES)) evaluate(name, g, finalSeeds);

console.log(`\n총 ${((Date.now() - t0) / 1000).toFixed(0)}초`);
