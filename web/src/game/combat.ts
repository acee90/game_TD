// ───────── 타워 전투 수치 ─────────
// 태그(파워/스플래시/스피드)는 원본에서 유닛마다 고정이고 서로 전환되지 않는다(§6.1).
// 복합 태그(예: 카카루 = 크리쳐 파워스피드)는 각 태그 효과를 곱해서 합친다.

import * as B from '../data/balance';
import { CREATURE, type Race, type Tag, type UnitDef } from '../data/units';
import type { Tower } from './types';

/** 병과별 업그레이드 레벨. 인덱스 = Race (정규군/포병/마법대/소환대) */
export type UpgradeLevels = [number, number, number, number];

const combine = (tags: readonly Tag[], key: 'damage' | 'interval' | 'range'): number =>
  tags.reduce((acc, tag) => acc * B.TAG_EFFECT[tag][key], 1);

export const hasTag = (def: UnitDef, tag: Tag): boolean => def.tags.includes(tag);

/**
 * 종족 업그레이드는 **가산**이다 — 레벨당 기본공의 40%씩 붙는다 (2026-07-16, 복리 폐지).
 * 선형 비용과 짝지어 레벨이 오를수록 가스 효율이 떨어진다 — 몰빵 폭주 방지.
 * 크리쳐도 자체 업그레이드 라인이 있다(strings:664 '크리업').
 */
export const upgradeMultiplier = (levels: UpgradeLevels, race: Race): number =>
  1 + B.UPGRADE_DAMAGE_PER_LEVEL * levels[race];

export function damage(tower: Tower, levels: UpgradeLevels): number {
  return (
    B.BASE_DAMAGE *
    B.TIER_DAMAGE[tower.tier] *
    combine(tower.def.tags, 'damage') *
    upgradeMultiplier(levels, tower.def.race) *
    (isCreature(tower) ? B.CREATURE_DAMAGE_MULT : 1)
  );
}

/** 크리쳐 타워가 사거리 안 몹에게 거는 이동속도 배수. 크리쳐가 아니면 1. */
export const slowFactor = (tower: Tower): number =>
  isCreature(tower) ? B.CREATURE_SLOW[tower.tier] : 1;

export function attackInterval(tower: Tower): number {
  return (
    B.BASE_ATTACK_INTERVAL *
    B.TIER_ATTACK_INTERVAL_MULT[tower.tier] *
    combine(tower.def.tags, 'interval')
  );
}

export function range(tower: Tower): number {
  return B.TIER_RANGE[tower.tier] * combine(tower.def.tags, 'range');
}

export const isSplash = (tower: Tower): boolean => hasTag(tower.def, 'splash');
export const isCreature = (tower: Tower): boolean => tower.def.race === CREATURE;
