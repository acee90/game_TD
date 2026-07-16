// 원본: web/src/game/combat.ts
// ───────── 타워 전투 수치 ─────────
// 태그(파워/스플래시/스피드)는 원본에서 유닛마다 고정이고 서로 전환되지 않는다(§6.1).
// 복합 태그(예: 카카루 = 크리쳐 파워스피드)는 각 태그 효과를 곱해서 합친다.

using System;

namespace GodTD.Core
{
    /// <summary>종족별 업그레이드 레벨. 인덱스 = Race (테란/저그/플토/크리쳐)</summary>
    public sealed class UpgradeLevels
    {
        readonly int[] levels = { 0, 0, 0, 0 };
        public int this[Race race]
        {
            get => levels[(int)race];
            set => levels[(int)race] = value;
        }
        public int this[int race]
        {
            get => levels[race];
            set => levels[race] = value;
        }
    }

    public static class Combat
    {
        enum TagKey { Damage, Interval, Range }

        static float Combine(Tag[] tags, TagKey key)
        {
            float acc = 1f;
            foreach (var tag in tags)
            {
                var (damage, interval, range) = Balance.TagEffect(tag);
                acc *= key == TagKey.Damage ? damage : key == TagKey.Interval ? interval : range;
            }
            return acc;
        }

        /// <summary>종족 업그레이드는 곱연산 복리. 크리쳐도 자체 업그레이드 라인이 있다(strings:664 '크리업').</summary>
        // 가산 — 레벨당 기본공의 40%씩 (2026-07-16, 복리 폐지). 선형 비용과 짝지어
        // 레벨이 오를수록 가스 효율이 떨어진다 — 몰빵 폭주 방지. ← web/src/game/combat.ts
        public static float UpgradeMultiplier(UpgradeLevels levels, Race race) =>
            1f + Balance.UPGRADE_DAMAGE_PER_LEVEL * levels[race];

        public static float Damage(Tower tower, UpgradeLevels levels) =>
            Balance.BASE_DAMAGE *
            Balance.TIER_DAMAGE[tower.Tier] *
            Combine(tower.Def.Tags, TagKey.Damage) *
            UpgradeMultiplier(levels, tower.Def.Race) *
            (IsCreature(tower) ? Balance.CREATURE_DAMAGE_MULT : 1f);

        /// <summary>크리쳐 타워가 사거리 안 몹에게 거는 이동속도 배수. 크리쳐가 아니면 1.</summary>
        public static float SlowFactor(Tower tower) =>
            IsCreature(tower) ? Balance.CREATURE_SLOW[tower.Tier] : 1f;

        public static float AttackInterval(Tower tower) =>
            Balance.BASE_ATTACK_INTERVAL * Combine(tower.Def.Tags, TagKey.Interval);

        public static float Range(Tower tower) =>
            Balance.TIER_RANGE[tower.Tier] * Combine(tower.Def.Tags, TagKey.Range);

        public static bool IsSplash(Tower tower) => tower.Def.HasTag(Tag.Splash);
        public static bool IsCreature(Tower tower) => tower.Def.Race == Race.Creature;
    }
}
