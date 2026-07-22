// ───────── Wiki 타워 계열(라인) 그룹핑 ─────────
// 병과별로 정렬하고, 같은 계열끼리 티어 순서(Lv1→Lv4)로 묶어 "진화형"을 보여준다.
//
// 중요: 이 계열은 실제 합성 결과가 아니라 **명칭 기준의 Wiki 전용 참고 구성**이다.
// 실제 합성(engine/src/game/merge.ts findMerge)은 같은 이름 타워 2기가 모이면 다음
// 티어 풀 전체에서 무작위로 1기를 뽑는다 — 병과·계열과 무관하다. 각 UnitDef의 이름은
// 플레이버라 밸런스와 무관하지만(units.ts 주석), 병과별로 뚜렷한 명칭 계보
// (견습 궁병→궁병→장궁병→신궁 등)를 그대로 살려 "이 계열이 강해지면 이렇게 된다"를
// 보여주는 것이 이 파일의 목적이다. 밸런스·게임 로직에는 관여하지 않는다.
//
// GOD 등급은 이 계열의 연장이 아니다 — 보스 처치로 열리는 별도 엔드게임 풀이라
// (units.ts GOD_POOL 주석) 특정 라인의 "다음 단계"로 단정하지 않고 병과별로 따로 묶는다.

import { TOWER_CATALOG } from '@engine/data/tower-catalog';
import { GOD_TIER, RACES, RACE_COLOR, type Race } from '@engine/data/units';
import { towerWikiView, type TowerWikiView } from './tower-wiki';

export interface TowerLine {
  readonly id: string;
  readonly race: Race;
  readonly label: string;
  /** Lv1..Lv4 타워 id 순서 — 소환대처럼 라인이 하나뿐이면 길이 4 그대로 채운다 */
  readonly steps: readonly string[];
}

export const TOWER_LINES: readonly TowerLine[] = [
  {
    id: 'army-archer-line',
    race: 0,
    label: '궁병 계열',
    steps: ['army-apprentice-archer', 'army-archer', 'army-longbowman', 'army-master-archer'],
  },
  {
    id: 'army-knight-line',
    race: 0,
    label: '기사 계열',
    steps: ['army-squire', 'army-knight', 'army-sword-expert', 'army-sword-master'],
  },
  {
    id: 'artillery-catapult-line',
    race: 1,
    label: '투석기 계열',
    steps: [
      'artillery-small-catapult',
      'artillery-mangonel',
      'artillery-trebuchet',
      'artillery-megalith-catapult',
    ],
  },
  {
    id: 'artillery-ballista-line',
    race: 1,
    label: '노포 계열',
    steps: [
      'artillery-small-ballista',
      'artillery-ballista',
      'artillery-heavy-ballista',
      'artillery-repeating-ballista',
    ],
  },
  {
    id: 'magic-mage-line',
    race: 2,
    label: '마법사 계열',
    steps: ['magic-apprentice-mage', 'magic-mage', 'magic-sorcerer', 'magic-archmage'],
  },
  {
    id: 'magic-elementalist-line',
    race: 2,
    label: '정령술사 계열',
    steps: [
      'magic-apprentice-elementalist',
      'magic-elementalist',
      'magic-elemental-sorcerer',
      'magic-grand-elementalist',
    ],
  },
  {
    id: 'summon-golem-line',
    race: 3,
    label: '골렘 계열',
    steps: ['summon-mini-golem', 'summon-gargoyle', 'summon-magma-golem', 'summon-rune-golem'],
  },
];

export interface TowerLineView {
  readonly id: string;
  readonly label: string;
  readonly steps: readonly TowerWikiView[];
}

export interface RaceGroupView {
  readonly race: Race;
  readonly raceLabel: string;
  readonly raceColor: string;
  readonly lines: readonly TowerLineView[];
  /** GOD 등급 — 라인의 연장이 아닌 별도 풀이라 병과로만 묶는다 (early → late 순서 보존) */
  readonly godTowers: readonly TowerWikiView[];
}

/** id → { line, tier(=steps 인덱스) } — 상세 페이지 이전/다음 내비게이션이 쓴다 */
const LINE_STEP_BY_ID = new Map<string, { line: TowerLine; index: number }>();
for (const line of TOWER_LINES) {
  line.steps.forEach((id, index) => LINE_STEP_BY_ID.set(id, { line, index }));
}

export function lineStepFor(id: string): { line: TowerLine; index: number } | undefined {
  return LINE_STEP_BY_ID.get(id);
}

/** 병과별로 정렬하고, 같은 계열을 Lv1→Lv4로 묶은 뒤 GOD은 별도로 붙인다 */
export function buildRaceGroups(): readonly RaceGroupView[] {
  return RACES.map((raceLabel, race) => {
    const lines = TOWER_LINES.filter((line) => line.race === race).map((line) => ({
      id: line.id,
      label: line.label,
      steps: line.steps.map((id) => towerWikiView(TOWER_CATALOG.find((e) => e.id === id)!)),
    }));
    // GOD_TIER 항목은 buildCatalog()가 early → late 순서로 채워 두어 그대로 보존된다
    const godTowers = TOWER_CATALOG.filter((e) => e.tier === GOD_TIER && e.def.race === race).map(
      towerWikiView,
    );
    return {
      race: race as Race,
      raceLabel,
      raceColor: RACE_COLOR[race],
      lines,
      godTowers,
    };
  });
}
