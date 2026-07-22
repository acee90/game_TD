// ───────── Wiki 타워 view-model ─────────
// Wiki가 표시하는 모든 수치·문자열은 여기서만 만든다 — 원본 상수나 계산식을
// Wiki 컴포넌트에 다시 적지 않는다 (exec-plans/website-shell-tower-wiki.md §4.2).
// 기준: 병과 업그레이드 [0,0,0,0]·영웅 보너스 없음 — 화면에 "업그레이드 0 기준"을 표기할 것.
// 반올림 규칙은 게임 내 선택 패널(view.ts towerInfoHtml)과 동일하다.

import {
  attackInterval,
  damage,
  isCreature,
  isSplash,
  range,
  slowFactor,
  splashRadius,
  type UpgradeLevels,
} from '../game/combat';
import { RACES, RACE_COLOR, TIER_LABEL, tagLabel, type Race, type Tag } from '../data/units';
import { towerById, type CatalogTower } from '../data/tower-catalog';
import type { Tower } from '../game/types';

/** Wiki 기준 업그레이드 — 항상 0 (표시 수치의 전제) */
export const WIKI_UPGRADES: UpgradeLevels = [0, 0, 0, 0];

export interface TowerWikiView {
  readonly id: string;
  readonly name: string;
  readonly race: Race;
  readonly raceLabel: string;
  readonly raceColor: string;
  readonly tier: number;
  readonly tierLabel: string;
  readonly godUnlock: 'early' | 'late' | null;
  readonly tags: readonly Tag[];
  /** 게임과 동일한 태그 표기 — 예: "파워", "소환대 파워 스피드" */
  readonly tagText: string;

  /** 원시 수치 — combat.ts 결과 그대로 (테스트가 일치를 강제한다) */
  readonly damage: number;
  readonly attackInterval: number;
  readonly attacksPerSecond: number;
  /** 단순 파생 비교값 — 방어력·스플래시 감쇠·실전 가동률 제외 (툴팁에 밝힐 것) */
  readonly dps: number;
  readonly range: number;
  readonly splashRadius: number | null;
  /** 크리쳐(소환대)만 — 사거리 안 몹의 이동속도 배수 */
  readonly slowFactor: number | null;

  /** 표시 문자열 — 게임 내 패널과 같은 반올림 */
  readonly text: {
    readonly damage: string;
    readonly attacksPerSecond: string;
    readonly dps: string;
    readonly range: string;
    readonly splashRadius: string | null;
    readonly slow: string | null;
  };
}

export function towerWikiView(entry: CatalogTower): TowerWikiView {
  const tower: Tower = { def: entry.def, tier: entry.tier, cooldown: 0 };
  const dmg = damage(tower, WIKI_UPGRADES);
  const interval = attackInterval(tower);
  // view.ts towerInfoHtml과 동일 — 간격(초/회)이 아니라 초당 공격 횟수, 큰 값 = 빠른 공격
  const rate = 1 / Math.max(0.01, interval);
  const reach = range(tower);
  const splash = isSplash(tower) ? splashRadius(tower, reach) : null;
  const slow = isCreature(tower) ? slowFactor(tower) : null;

  return {
    id: entry.id,
    name: entry.def.name,
    race: entry.def.race,
    raceLabel: RACES[entry.def.race],
    raceColor: RACE_COLOR[entry.def.race],
    tier: entry.tier,
    tierLabel: TIER_LABEL[entry.tier],
    godUnlock: entry.godUnlock,
    tags: entry.def.tags,
    tagText: tagLabel(entry.def),
    damage: dmg,
    attackInterval: interval,
    attacksPerSecond: rate,
    dps: dmg / interval,
    range: reach,
    splashRadius: splash,
    slowFactor: slow,
    text: {
      damage: dmg.toFixed(0),
      attacksPerSecond: rate >= 10 ? rate.toFixed(1) : rate.toFixed(2),
      dps: (dmg / interval).toFixed(0),
      range: reach.toFixed(0),
      splashRadius: splash === null ? null : splash.toFixed(0),
      slow: slow === null ? null : `이동속도 ${Math.round(slow * 100)}%로 감속`,
    },
  };
}

/** ID로 view-model을 만든다 — 없는 ID면 undefined (상세 페이지 404 처리용) */
export function towerWikiViewById(id: string): TowerWikiView | undefined {
  const entry = towerById(id);
  return entry ? towerWikiView(entry) : undefined;
}
