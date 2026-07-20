// 증강 테이블을 src/data/hero.ts에서 CSV로 뽑는다.
// 손으로 옮겨 적으면 코드와 어긋난다. 밸런스를 고쳤으면 이걸 다시 돌린다.
//
//   cd web && npm run gen:balance
//
// 산출물: docs/balance/*.csv

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as B from '../src/data/balance';
import * as H from '../src/data/hero';
import * as K from '../src/data/skills';
import { computeStats } from '../src/game/hero';
import { attackInterval, damage } from '../src/game/combat';
import { TIER_POOLS } from '../src/data/units';

const here = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = `${here}/../../docs/balance`;

/** 쉼표·따옴표·줄바꿈이 있으면 감싼다 */
const cell = (value: string | number): string => {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};

const toCsv = (header: readonly string[], rows: readonly (string | number)[][]): string =>
  [header, ...rows].map((row) => row.map(cell).join(',')).join('\n') + '\n';

const written: string[] = [];
const write = (name: string, content: string): void => {
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(`${OUT_DIR}/${name}`, content);
  written.push(name);
};

/** GOD 타워 한 기의 DPS — 영웅 파워의 기준선 */
const GOD_TOWER_DPS = (() => {
  const def = TIER_POOLS[3][0];
  const tower = { def, tier: 4, cooldown: 0 };
  return damage(tower, [0, 0, 0, 0]) / attackInterval(tower);
})();

const card = (id: string, rarity: H.Rarity = 'silver') =>
  H.makeCard(H.AUGMENTS.find((a) => a.id === id)!, rarity);

const heroDps = (level: number, ids: string[], rarity: H.Rarity = 'silver'): number => {
  const stats = computeStats(level, ids.map((id) => card(id, rarity)));
  return stats.damage / stats.attackInterval;
};

/** AugmentEffect를 CSV 열로 펼친다. 비어 있으면 빈 칸. */
const EFFECT_COLUMNS = [
  'hpMult',
  'damageMult',
  'rangeMult',
  'attackSpeedMult',
  'moveSpeedMult',
  'towerDamageMult',
  'damageReduction',
  'regen',
  'splashRadius',
  'mineralPerKill',
  'respawnCut',
] as const;

const effectCells = (effect: H.AugmentEffect): (string | number)[] =>
  EFFECT_COLUMNS.map((key) => effect[key] ?? '');

// ── 증강 (패시브 + 스킬 개조) — 스킬 획득 카드는 2026-07-20에 삭제됐다
write(
  'augments.csv',
  toCsv(
    [
      'id', 'kind', 'kindLabel', 'name', 'description', 'maxStacks',
      'requiresSplash', 'requiresSkill', 'skillMod',
      ...EFFECT_COLUMNS,
    ],
    H.AUGMENTS.map((a) => [
      a.id,
      a.kind,
      H.AUGMENT_KIND_LABEL[a.kind],
      a.name,
      a.description,
      a.maxStacks,
      H.requiresSplash(a) ? 'TRUE' : 'FALSE',
      a.requiresSkill ?? '',
      a.skillMod ? JSON.stringify(a.skillMod) : '',
      ...effectCells(a.effect),
    ]),
  ),
);

// ── 등급
const totalWeight = H.RARITY_ORDER.reduce((sum, r) => sum + H.RARITIES[r].weight, 0);
write(
  'rarities.csv',
  toCsv(
    ['rarity', 'label', 'powerMult', 'weight', 'probability'],
    H.RARITY_ORDER.map((r) => {
      const d = H.RARITIES[r];
      return [r, d.label, d.power, d.weight, (d.weight / totalWeight).toFixed(3)];
    }),
  ),
);

// ── 특화 시너지
const synergyRows: (string | number)[][] = [];
for (const kind of Object.keys(H.SYNERGIES) as H.AugmentKind[]) {
  const { specialist, master } = H.SYNERGIES[kind];
  synergyRows.push([
    kind, H.AUGMENT_KIND_LABEL[kind], 'specialist', H.SYNERGY_THRESHOLD,
    specialist.name, specialist.description, ...effectCells(specialist.effect),
  ]);
  synergyRows.push([
    kind, H.AUGMENT_KIND_LABEL[kind], 'master', H.MASTERY_THRESHOLD,
    master.name, master.description, ...effectCells(master.effect),
  ]);
}
write(
  'synergies.csv',
  toCsv(['kind', 'kindLabel', 'tier', 'threshold', 'name', 'description', ...EFFECT_COLUMNS], synergyRows),
);

// ── 증강 획득 라운드 (2026-07-20: 레벨 → 라운드 기준)
write(
  'augment-schedule.csv',
  toCsv(
    ['index', 'round', 'note'],
    [
      ...H.AUGMENT_ROUNDS.map((round, i) => [i + 1, round, '증강']),
      [H.AUGMENT_ROUNDS.length + 1, H.SKILL_DRAFT_ROUND, '스킬 드래프트'],
    ],
  ),
);

// ── 액티브 스킬
write(
  'skills.csv',
  toCsv(
    ['id', 'name', 'role', 'description', 'manaMax', 'damageMult', 'radius', 'targets', 'autoCastMinTargets'],
    K.ALL_SKILL_IDS.map((id) => {
      const s = K.SKILLS[id];
      return [s.id, s.name, s.role, s.description, s.manaMax, s.damageMult, s.radius, s.targets, s.autoCastMinTargets];
    }),
  ),
);


// ── 파워 커브 — 빌드 × 레벨
const builds: [string, string[]][] = [
  ['증강 없음', []],
  ['분산 (방벽·신속·탐욕)', ['bulwark', 'swift', 'greed']],
  ['완력x3 (특화: 완숙)', ['might', 'might', 'might']],
  ['명사수x3 (특화: 저격 태세)', ['marksman', 'marksman', 'marksman']],
  ['방벽x2+중장갑 (특화: 불굴)', ['bulwark', 'bulwark', 'plating']],
  ['완력x3+활력x2 (완숙+초월)', ['might', 'might', 'might', 'vigor', 'vigor']],
];
const levels = [1, 10, 20, 30, 40, 50];
const curveRows: (string | number)[][] = [];
for (const [name, ids] of builds) {
  for (const rarity of ['silver', 'platinum'] as H.Rarity[]) {
    // 증강이 없으면 등급이 무의미하니 실버만 낸다
    if (ids.length === 0 && rarity !== 'silver') continue;
    for (const level of levels) {
      const stats = computeStats(level, ids.map((id) => card(id, rarity)));
      curveRows.push([
        name,
        H.RARITIES[rarity].label,
        level,
        Math.round(heroDps(level, ids, rarity)),
        (heroDps(level, ids, rarity) / GOD_TOWER_DPS).toFixed(2),
        stats.maxHp,
        Math.round(stats.maxHp / (1 - stats.damageReduction)),
        stats.splashRadius,
      ]);
    }
  }
}
write(
  'hero-power-curve.csv',
  toCsv(
    ['build', 'rarity', 'heroLevel', 'heroDps', 'vsGodTower', 'maxHp', 'effectiveHp', 'splashRadius'],
    curveRows,
  ),
);

// ── 기준선 상수
write(
  'hero-constants.csv',
  toCsv(
    ['key', 'value', 'note'],
    [
      ['GOD_TOWER_DPS', Math.round(GOD_TOWER_DPS), '영웅 파워의 기준선 (업그레이드 없음)'],
      ['HERO_BASE_STR', H.HERO_BASE_STR, '기본 힘'],
      ['HERO_BASE_AGI', H.HERO_BASE_AGI, '기본 민첩'],
      ['HERO_BASE_INT', H.HERO_BASE_INT, '기본 지능'],
      ['DMG_PER_STR', H.DMG_PER_STR, '힘 1당 공격력'],
      ['HP_PER_STR', H.HP_PER_STR, '힘 1당 체력'],
      ['AS_PER_AGI', H.AS_PER_AGI, '민첩 1당 공속 (포화식 분자)'],
      ['AS_AGI_SOFT_CAP', H.AS_AGI_SOFT_CAP, '민첩 공속 소프트캡 — 기여 상한 AS_PER_AGI×CAP'],
      ['SKILL_PER_INT', H.SKILL_PER_INT, '지능 1당 스킬 피해'],
      ['XP_BUY_GOLD', H.XP_BUY_GOLD, 'XP 골드 구매 — 1골드=1XP, 버튼당 20 (3안 유지)'],
      ['levelStatPoints(1)', H.levelStatPoints(1), '레벨업당 세 스탯 총 포인트 (2+floor(L/10), 3등분)'],
      ['HERO_ATTACK_INTERVAL', H.HERO_ATTACK_INTERVAL, '초'],
      ['HERO_BASE_RANGE', H.HERO_BASE_RANGE, ''],
      ['XP_BASE_COST', H.XP_BASE_COST, ''],
      ['XP_COST_GROWTH', H.XP_COST_GROWTH, '지수 — 고레벨을 봉인한다'],
      ['XP_PER_MOB', H.XP_PER_MOB, ''],
      ['HERO_LASTHIT_XP_MULT', H.HERO_LASTHIT_XP_MULT, '영웅 막타 보너스'],
      ['SYNERGY_THRESHOLD', H.SYNERGY_THRESHOLD, '같은 계열 N개 → 특화'],
      ['MASTERY_THRESHOLD', H.MASTERY_THRESHOLD, '같은 계열 N개 → 대특화'],
      ['AUGMENT_CHOICES', H.AUGMENT_CHOICES, '한 번에 보여주는 카드 수'],
    ],
  ),
);


// ── 난이도 모델 시트 (2026-07-19 재설계) — 수입 → 전투력 → 웨이브를 잇는 수학 기준
//
// 모든 열이 src/data/balance.ts의 모델 함수를 **그대로** 읽는다 — 시트에 자체 수식이
// 없으므로 상수를 바꾸면 시트가 즉시 따라온다. 시뮬레이션은 검산용이지 기준이 아니다.
// growthPct가 난이도 체감의 핵심 열: R13~50은 수입 성장률을 따라 한 자릿수로 내려가고
// (선형 체감), R50부터 벽 램프가 라운드당 ~1.4%p씩 올려 R58+ ~17.5%로 고정된다.
const incomeRows: (string | number)[][] = [];
{
  for (let r = 1; r <= 70; r++) {
    const total = B.enemyHP(r) * B.enemyCount(r);
    const growth =
      r > 1 ? Math.round((B.waveTotalHp(r) / B.waveTotalHp(r - 1) - 1) * 1000) / 10 : 0;
    // 함의된 clear(초) = 총체력 ÷ 보드 DPS 모델 — R15+는 성장률 지정이라 역산으로 보여준다
    const impliedClear = B.waveTotalHp(r) / B.expectedBoardDps(r);
    incomeRows.push([
      r,
      B.waveReward(r),
      B.enemyCount(r),
      Math.round(B.cumulativeIncomeMid(r)),
      Math.round(B.bossSummonsBy(r) * 10) / 10,
      Math.round(B.expectedBoardDps(r)),
      Math.round(impliedClear * 10) / 10,
      B.enemyHP(r),
      B.enemyArmor(r),
      total,
      growth,
      r === B.CLEAR_ROUND ? 'CLEAR' : '',
    ]);
  }
}
write(
  'income-curve.csv',
  toCsv(
    [
      'round', 'waveReward', 'mobs', 'cumIncomeMid', 'bossSummons',
      'boardDpsModel', 'impliedClearSec', 'enemyHp', 'enemyArmor', 'waveTotalHp',
      'growthPct', 'note',
    ],
    incomeRows,
  ),
);

// eslint-disable-next-line no-console
console.log(`docs/balance/ 에 ${written.length}개 파일 생성:\n  ${written.join('\n  ')}`);
