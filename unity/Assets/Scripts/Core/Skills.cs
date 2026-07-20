// 원본: web/src/data/skills.ts
// ───────── 영웅 액티브 스킬 ─────────
// 원본 갓타디에는 없는 신규 설계다.
//
// 증강은 원래 패시브 수치뿐이었다. 스킬을 넣으면 두 가지가 생긴다.
// 하나는 **누를 것**이 생기고, 다른 하나는 증강끼리 **질적으로** 맞물린다 —
// 일제 사격을 쥔 다음에야 '폭발 화살'이 의미를 갖고, 허수아비를 쥔 다음에야 '도발 인형'이 의미를 갖는다.
//
// 영웅은 스킬을 하나만 든다. 스킬을 주는 증강은 최대 1스택이고, 이미 스킬이 있으면 나오지 않는다.
//
// **스킬은 자동 시전이다.** 플레이어는 어떤 스킬을 들고 어떻게 개조할지만 정한다.
// 대신 스킬마다 "언제 쓰는 게 맞는지"가 다르므로 발동 조건을 데이터로 둔다.

using System;
using System.Collections.Generic;

namespace GodTD.Core
{
    public enum SkillId { Smite, Whirlwind, Volley, Meteor, Decoy }

    /// <summary>가스 스킬 개조 트랙 — 웹의 'damage' | 'cdr'</summary>
    public enum GasSkillTrack { Damage, Cdr }

    public sealed class SkillDef
    {
        public readonly SkillId Id;
        public readonly string Name;
        public readonly string Description;
        /// <summary>
        /// 시전에 필요한 마나 (TFT식). **쿨타임은 없다** (2026-07-17 웹 동기화).
        /// 마나는 평타(+10)와 피격(+8)으로 찬다 — 공속이 곧 스킬 회전이고 탱커도 자주 쓴다.
        /// </summary>
        public readonly float ManaMax;
        /// <summary>영웅 공격력 대비 피해 배수. 0이면 피해가 없는 스킬.</summary>
        public readonly float DamageMult;
        /// <summary>효과 반경 (0이면 반경 개념 없음)</summary>
        public readonly float Radius;
        /// <summary>몇 명을 때리는가 (volley 전용, 0이면 반경 안 전체)</summary>
        public readonly int Targets;
        /// <summary>자동 시전 조건: 유효 사거리 안에 적이 이만큼 있어야 쏜다</summary>
        public readonly int AutoCastMinTargets;
        /// <summary>필요 마나가 영웅 공격 속도를 따라 줄어드는가 — 허수아비처럼 '손이 빠르면 자주'</summary>
        public readonly bool ScalesWithAttackSpeed;

        public SkillDef(SkillId id, string name, string description, float manaMax,
            float damageMult, float radius, int targets, int autoCastMinTargets,
            bool scalesWithAttackSpeed = false)
        {
            Id = id;
            Name = name;
            Description = description;
            ManaMax = manaMax;
            DamageMult = damageMult;
            Radius = radius;
            Targets = targets;
            AutoCastMinTargets = autoCastMinTargets;
            ScalesWithAttackSpeed = scalesWithAttackSpeed;
        }
    }

    /// <summary>
    /// 스킬을 개조하는 값들. 증강이 여기에 기여한다.
    /// 곱셈형은 1에서, 덧셈형은 0에서 출발한다.
    /// </summary>
    public struct SkillMods
    {
        /// <summary>필요 마나 배수 (옛 쿨감의 자리) — 가산 폴드, 하한 MANA_MAX_FLOOR</summary>
        public float ManaMaxMult;
        public float DamageMult;
        public float RadiusAdd;
        public int ExtraTargets;
        /// <summary>일제 사격의 화살 하나가 터지는 반경 (0이면 단일)</summary>
        public float ExplosiveRadius;
        /// <summary>스킬에 맞은 적의 이동속도 배수 (1이면 감속 없음)</summary>
        public float SlowFactor;
        public float SlowSeconds;
        /// <summary>허수아비 체력 배수</summary>
        public float DecoyHpMult;
        /// <summary>허수아비가 주변 몹을 강제로 끌어당기는가</summary>
        public bool DecoyTaunts;

        public static SkillMods None => new SkillMods
        {
            ManaMaxMult = 1f,
            DamageMult = 1f,
            RadiusAdd = 0f,
            ExtraTargets = 0,
            ExplosiveRadius = 0f,
            SlowFactor = 1f,
            SlowSeconds = 0f,
            DecoyHpMult = 1f,
            DecoyTaunts = false,
        };
    }

    /// <summary>증강이 기여하는 스킬 개조 조각 — TS의 Partial&lt;SkillMods&gt;에 해당</summary>
    public sealed class SkillModPatch
    {
        public float? ManaMaxMult;
        public float? DamageMult;
        public float? RadiusAdd;
        public int? ExtraTargets;
        public float? ExplosiveRadius;
        public float? SlowFactor;
        public float? SlowSeconds;
        public float? DecoyHpMult;
        public bool? DecoyTaunts;
    }

    /// <summary>개조를 반영한 최종 스킬 수치</summary>
    public sealed class ResolvedSkill
    {
        public readonly SkillDef Def;
        /// <summary>시전에 필요한 마나 — 개조·공속 반영 후</summary>
        public readonly float ManaMax;
        public readonly float DamageMult;
        public readonly float Radius;
        public readonly int Targets;
        public readonly SkillMods Mods;

        public ResolvedSkill(SkillDef def, float manaMax, float damageMult, float radius, int targets, SkillMods mods)
        {
            Def = def;
            ManaMax = manaMax;
            DamageMult = damageMult;
            Radius = radius;
            Targets = targets;
            Mods = mods;
        }
    }

    public static class Skills
    {
        /// <summary>시작 스킬 (6차) — 스킬 증강이 이걸 교체한다. 가스 스킬 강화가 시작부터 유효. ← web</summary>
        public const SkillId DEFAULT_SKILL = SkillId.Smite;

        public static readonly Dictionary<SkillId, SkillDef> SKILLS = new Dictionary<SkillId, SkillDef>
        {
            [SkillId.Smite] = new SkillDef(SkillId.Smite, "강타",
                "가장 가까운 적 3명에게 각각 공격력 3배 피해",
                manaMax: 100f, damageMult: 3f, radius: 0f, targets: 3,
                autoCastMinTargets: 1), // 7차: 대상 수 상한형 — 밀집도가 올라도 안 커진다 ← web

            [SkillId.Whirlwind] = new SkillDef(SkillId.Whirlwind, "소용돌이",
                "주변의 적 전체에 공격력 3배 피해",
                manaMax: 100f, damageMult: 3f, radius: 70f, targets: 0,
                autoCastMinTargets: 2), // 하나 때리자고 쓰기엔 아깝다
            [SkillId.Volley] = new SkillDef(SkillId.Volley, "일제 사격",
                "사거리 안 적 4명에게 각각 공격력 2배 피해",
                manaMax: 90f, damageMult: 2f, radius: 0f, targets: 4, // 반경 0 = 영웅 사거리를 쓴다
                autoCastMinTargets: 1), // 단일에도 값어치가 있다
            [SkillId.Meteor] = new SkillDef(SkillId.Meteor, "유성",
                "적이 가장 많은 곳에 공격력 6배 광역 피해",
                manaMax: 160f, damageMult: 6f, radius: 85f, targets: 0,
                autoCastMinTargets: 3), // 뭉쳤을 때만 값어치가 있다
            [SkillId.Decoy] = new SkillDef(SkillId.Decoy, "허수아비",
                "앞쪽에 미끼를 세워 몹을 붙잡는다 (피해 없음)",
                manaMax: 220f, damageMult: 0f, radius: 0f, targets: 0,
                autoCastMinTargets: 2, // 막을 게 있어야 세운다
                scalesWithAttackSpeed: true), // 손이 빠르면 미끼도 자주 — 탱커가 민첩에 투자할 이유
        };

        public static readonly SkillId[] SKILL_IDS =
            { SkillId.Smite, SkillId.Whirlwind, SkillId.Volley, SkillId.Meteor, SkillId.Decoy };

        // ── 허수아비 ──
        /// <summary>영웅 앞쪽 이 거리에 세운다</summary>
        public const float DECOY_AHEAD = 55f;
        public const float DECOY_LIFETIME = 9f;
        /// <summary>영웅 최대 체력의 이 비율만큼 버틴다</summary>
        public const float DECOY_HP_RATIO = 0.6f;
        public const float DECOY_RADIUS = 10f;
        /// <summary>이 거리 안의 몹이 허수아비를 때린다</summary>
        public const float DECOY_AGGRO_RANGE = 62f;
        /// <summary>허수아비를 세울 만한가 — 영웅 앞쪽 이 거리 안에 몹이 있으면 세운다</summary>
        public const float DECOY_AUTOCAST_RANGE = 170f;

        // ───────── 마나 (TFT식, 2026-07-17 웹 동기화) ─────────
        // 평타를 칠 때와 맞을 때 찬다. 가득 차면 자동 시전 후 0으로.
        public const float MANA_PER_ATTACK = 6f;
        public const float MANA_ON_DAMAGED = 14f;
        /// <summary>필요 마나 배수의 가산 폴드 하한 — 이보다 싸질 수 없다 (난사 폭주 방지)</summary>
        public const float MANA_MAX_FLOOR = 0.4f;

        // ───────── 가스 스킬 개조 트랙 ─────────
        // 가스의 두 번째 소비처 — "타워 업그레이드냐 영웅 스킬이냐"가 선택이 되도록.
        // 트랙은 둘: 스킬 피해 +8%/구매(곱), 필요 마나 -6%/구매(곱, 하한은 Resolve가 지킨다).
        public const float GAS_SKILL_DAMAGE_MULT = 1.08f;
        public const float GAS_SKILL_CDR_MULT = 0.94f;
        public const int GAS_SKILL_BASE_COST = 30;
        public const float GAS_SKILL_COST_GROWTH = 1.35f;
        public static int GasSkillCost(int bought) =>
            (int)MathF.Round(GAS_SKILL_BASE_COST * MathF.Pow(GAS_SKILL_COST_GROWTH, bought));

        /// <summary>
        /// 여러 조각을 접는다. 마나 배수는 **가산** 폴드(하한 MANA_MAX_FLOOR — 웹과 동일),
        /// 덧셈형은 더하고, 감속은 가장 강한 것을 쓴다.
        /// </summary>
        public static SkillMods FoldMods(IReadOnlyList<SkillModPatch> patches)
        {
            var mods = SkillMods.None;
            float manaBonus = 0f;
            foreach (var p in patches)
            {
                if (p.ManaMaxMult.HasValue) manaBonus += p.ManaMaxMult.Value - 1f;
                if (p.DamageMult.HasValue) mods.DamageMult *= p.DamageMult.Value;
                if (p.RadiusAdd.HasValue) mods.RadiusAdd += p.RadiusAdd.Value;
                if (p.ExtraTargets.HasValue) mods.ExtraTargets += p.ExtraTargets.Value;
                if (p.ExplosiveRadius.HasValue) mods.ExplosiveRadius += p.ExplosiveRadius.Value;
                if (p.SlowFactor.HasValue) mods.SlowFactor = MathF.Min(mods.SlowFactor, p.SlowFactor.Value);
                if (p.SlowSeconds.HasValue) mods.SlowSeconds = MathF.Max(mods.SlowSeconds, p.SlowSeconds.Value);
                if (p.DecoyHpMult.HasValue) mods.DecoyHpMult *= p.DecoyHpMult.Value;
                if (p.DecoyTaunts == true) mods.DecoyTaunts = true;
            }
            mods.ManaMaxMult = MathF.Max(MANA_MAX_FLOOR, 1f + manaBonus);
            return mods;
        }

        /// <summary>attackSpeedRatio = 기본 공격 간격 / 실제 공격 간격 (공속이 빠를수록 > 1)</summary>
        public static ResolvedSkill Resolve(SkillId id, SkillMods mods, float attackSpeedRatio = 1f)
        {
            var def = SKILLS[id];
            // 허수아비류 — 공속이 필요 마나를 깎는다 (하한 30%, 웹과 동일)
            float asCut = def.ScalesWithAttackSpeed
                ? MathF.Max(0.3f, 1f / MathF.Max(0.01f, attackSpeedRatio))
                : 1f;
            return new ResolvedSkill(
                def,
                manaMax: MathF.Max(10f, def.ManaMax * mods.ManaMaxMult * asCut),
                damageMult: def.DamageMult * mods.DamageMult,
                radius: def.Radius + (def.Radius > 0f ? mods.RadiusAdd : 0f),
                targets: def.Targets + (def.Targets > 0 ? mods.ExtraTargets : 0),
                mods: mods);
        }
    }
}
