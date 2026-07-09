// ───────── 소득 ─────────
// 출처: docs/갓타워디펜스X_VZ056_맵파일분석_v1.0.md §8.2
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
 * 누적 킬이 `before` → `after`로 올랐을 때 지급할 미네랄.
 * 마일스톤(200킬 간격 1회성)과 반복 20킬 보상을 함께 계산한다.
 */
export function killIncome(before: number, after: number): KillIncome {
  if (after <= before) return { mineral: 0, notes: [] };

  const notes: string[] = [];
  let mineral = 0;

  for (const [threshold, reward] of B.KILL_MILESTONES) {
    if (before < threshold && after >= threshold) {
      mineral += reward;
      notes.push(`[${threshold}Kills 보상] +${reward}`);
    }
  }

  const steps = Math.floor(after / B.REPEAT_KILL_STEP) - Math.floor(before / B.REPEAT_KILL_STEP);
  for (let i = 1; i <= steps; i++) {
    const killsAtStep = (Math.floor(before / B.REPEAT_KILL_STEP) + i) * B.REPEAT_KILL_STEP;
    const tier = killsAtStep > B.REPEAT_KILL_THRESHOLD ? 1 : 0;
    mineral += B.REPEAT_KILL_MINERAL[tier];
  }
  if (steps > 0) notes.push(`[ ${B.REPEAT_KILL_STEP}Kills 보상 ] x${steps}`);

  return { mineral, notes };
}

/** 보스 처치 보상. trigger #601~#606 */
export const bossKillMineral = (level: number): number =>
  B.BOSS_KILL_MINERAL[Math.min(level, B.BOSS_MAX_LEVEL) - 1] ?? 0;

/** 반복 20킬 보상까지 남은 킬 수와 그때 받을 금액 */
export function repeatKillProgress(kills: number): { done: number; reward: number } {
  const done = kills % B.REPEAT_KILL_STEP;
  const next = kills - done + B.REPEAT_KILL_STEP;
  const tier = next > B.REPEAT_KILL_THRESHOLD ? 1 : 0;
  return { done, reward: B.REPEAT_KILL_MINERAL[tier] };
}

/** 아직 지나지 않은 다음 킬 마일스톤. 전부 지났으면 null */
export function nextMilestone(kills: number): { kills: number; reward: number } | null {
  const found = B.KILL_MILESTONES.find(([threshold]) => threshold > kills);
  return found ? { kills: found[0], reward: found[1] } : null;
}
