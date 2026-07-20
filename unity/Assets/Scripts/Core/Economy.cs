// 원본: web/src/game/economy.ts
// ───────── 소득 ─────────
// 출처: docs/reference/god-td-x-vz056-map-analysis-v1.0.md §8.2
//
// 원본에서 플레이어 자원을 **차감하는 트리거는 0건**이다(§8.3). 소득은 전부 Add이고
// 세 계열뿐이다: 보스 처치 · 킬 마일스톤 · 반복 20킬. 이 장르의 재미가 자원 관리가 아니라
// 킬 스코어 누적에 있다는 뜻이다.

using System.Collections.Generic;

namespace GodTD.Core
{
    public readonly struct KillIncome
    {
        public readonly int Mineral;
        public readonly IReadOnlyList<string> Notes;

        public KillIncome(int mineral, IReadOnlyList<string> notes)
        {
            Mineral = mineral;
            Notes = notes;
        }
    }

    public static class Economy
    {
        static readonly string[] NoNotes = new string[0];

        /// <summary>
        /// 누적 킬이 `before` → `after`로 올랐을 때 지급할 미네랄.
        /// 20킬마다 +20 반복 미션 (2026-07-19) — 200킬 마일스톤 표를 대체했다. ← web
        /// </summary>
        public static KillIncome KillIncomeOf(int before, int after)
        {
            if (after <= before) return new KillIncome(0, NoNotes);

            int crossings = after / Balance.KILL_MISSION_EVERY - before / Balance.KILL_MISSION_EVERY;
            if (crossings <= 0) return new KillIncome(0, NoNotes);

            int mineral = crossings * Balance.KILL_MISSION_REWARD;
            return new KillIncome(mineral, new[] { $"[{Balance.KILL_MISSION_EVERY}킬 미션] +{mineral}" });
        }

        /// <summary>보스 처치 보상. trigger #601~#606</summary>
        public static int BossKillMineral(int level)
        {
            int index = System.Math.Min(level, Balance.BOSS_MAX_LEVEL) - 1;
            return index >= 0 && index < Balance.BOSS_KILL_MINERAL.Length
                ? Balance.BOSS_KILL_MINERAL[index]
                : 0;
        }

        /// <summary>아직 지나지 않은 다음 킬 마일스톤. 전부 지났으면 null</summary>
        /// <summary>다음 킬 미션 문턱 — 20킬 미션은 무한 반복이라 항상 존재한다 ← web</summary>
        public static (int kills, int reward)? NextMilestone(int kills) =>
            ((kills / Balance.KILL_MISSION_EVERY + 1) * Balance.KILL_MISSION_EVERY,
             Balance.KILL_MISSION_REWARD);
    }
}
