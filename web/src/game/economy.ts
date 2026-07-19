// ───────── 소득 ─────────
// 출처: docs/reference/god-td-x-vz056-map-analysis-v1.0.md §8.2
//
// 원본에서 플레이어 자원을 **차감하는 트리거는 0건**이다(§8.3). 소득은 전부 Add이고
// 세 계열뿐이다: 보스 처치 · 킬 마일스톤 · 반복 20킬. 이 장르의 재미가 자원 관리가 아니라
// 킬 스코어 누적에 있다는 뜻이다.

import * as B from '../data/balance';

export interface KillIncome {
  readonly mineral: number;
  readonly notes: readonly string[];
}

/**
 * 누적 킬이 `before` → `after`로 올랐을 때 지급할 금화.
 * 반복 킬 미션 (2026-07-19, 사용자 지시): 20킬마다 +20골드 — 200킬 간격 마일스톤 표를
 * 대체한다. 원본의 반복 20킬 보상(trigger #544/#545)과 같은 리듬이다.
 */
export function killIncome(before: number, after: number): KillIncome {
  if (after <= before) return { mineral: 0, notes: [] };

  const crossings =
    Math.floor(after / B.KILL_MISSION_EVERY) - Math.floor(before / B.KILL_MISSION_EVERY);
  if (crossings <= 0) return { mineral: 0, notes: [] };
  const mineral = crossings * B.KILL_MISSION_REWARD;
  return {
    mineral,
    notes: [`[${B.KILL_MISSION_EVERY}킬 미션] +${mineral}`],
  };
}

/** 보스 처치 보상. trigger #601~#606 */
export const bossKillMineral = (level: number): number =>
  B.BOSS_KILL_MINERAL[Math.min(level, B.BOSS_MAX_LEVEL) - 1] ?? 0;

/** 다음 킬 미션 문턱 — 20킬 미션은 무한 반복이라 항상 존재한다 */
export function nextMilestone(kills: number): { kills: number; reward: number } | null {
  return {
    kills: (Math.floor(kills / B.KILL_MISSION_EVERY) + 1) * B.KILL_MISSION_EVERY,
    reward: B.KILL_MISSION_REWARD,
  };
}
