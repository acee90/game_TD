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

  let mineral = 0;
  const notes: string[] = [];

  // 반복 미션 — 20킬마다
  const crossings =
    Math.floor(after / B.KILL_MISSION_EVERY) - Math.floor(before / B.KILL_MISSION_EVERY);
  if (crossings > 0) {
    const repeat = crossings * B.KILL_MISSION_REWARD;
    mineral += repeat;
    notes.push(`[${B.KILL_MISSION_EVERY}킬 미션] +${repeat}`);
  }

  // 일회성 마일스톤 (2026-07-20) — 문턱을 **처음** 넘을 때만.
  // before < 문턱 <= after 조건이라 누적 킬로 자연히 한 번만 걸린다.
  for (const [kills, reward] of B.KILL_MILESTONES) {
    if (before < kills && after >= kills) {
      mineral += reward;
      notes.push(`[누적 ${kills}킬 달성] +${reward}`);
    }
  }

  return { mineral, notes };
}

/** 보스 처치 보상. trigger #601~#606 */
export const bossKillMineral = (level: number): number =>
  B.BOSS_KILL_MINERAL[Math.min(level, B.BOSS_MAX_LEVEL) - 1] ?? 0;

/**
 * 다음 킬 미션 문턱 — 반복 미션과 일회성 마일스톤 중 **먼저 오는 쪽**을 보여준다.
 * 20킬 미션은 무한 반복이라 항상 존재하므로 null이 나오지 않는다.
 */
export function nextMilestone(kills: number): { kills: number; reward: number } | null {
  const repeat = {
    kills: (Math.floor(kills / B.KILL_MISSION_EVERY) + 1) * B.KILL_MISSION_EVERY,
    reward: B.KILL_MISSION_REWARD,
  };
  const pending = B.KILL_MILESTONES.filter(([k]) => k > kills);
  if (pending.length === 0) return repeat;
  const [k, reward] = pending[0];
  return k <= repeat.kills ? { kills: k, reward } : repeat;
}
