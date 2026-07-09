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
    public enum SkillId { Whirlwind, Volley, Meteor, Decoy }

    public sealed class SkillDef
    {
        public readonly SkillId Id;
        public readonly string Name;
        public readonly string Description;
        /// <summary>쿨타임(초)</summary>
        public readonly float Cooldown;
        /// <summary>영웅 공격력 대비 피해 배수. 0이면 피해가 없는 스킬.</summary>
        public readonly float DamageMult;
        /// <summary>효과 반경 (0이면 반경 개념 없음)</summary>
        public readonly float Radius;
        /// <summary>몇 명을 때리는가 (volley 전용, 0이면 반경 안 전체)</summary>
        public readonly int Targets;
        /// <summary>자동 시전 조건: 유효 사거리 안에 적이 이만큼 있어야 쏜다</summary>
        public readonly int AutoCastMinTargets;

        public SkillDef(SkillId id, string name, string description, float cooldown,
            float damageMult, float radius, int targets, int autoCastMinTargets)
        {
            Id = id;
            Name = name;
            Description = description;
            Cooldown = cooldown;
            DamageMult = damageMult;
            Radius = radius;
            Targets = targets;
            AutoCastMinTargets = autoCastMinTargets;
        }
    }

    /// <summary>
    /// 스킬을 개조하는 값들. 증강이 여기에 기여한다.
    /// 곱셈형은 1에서, 덧셈형은 0에서 출발한다.
    /// </summary>
    public struct SkillMods
    {
        public float CooldownMult;
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
            CooldownMult = 1f,
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
        public float? CooldownMult;
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
        public readonly float Cooldown;
        public readonly float DamageMult;
        public readonly float Radius;
        public readonly int Targets;
        public readonly SkillMods Mods;

        public ResolvedSkill(SkillDef def, float cooldown, float damageMult, float radius, int targets, SkillMods mods)
        {
            Def = def;
            Cooldown = cooldown;
            DamageMult = damageMult;
            Radius = radius;
            Targets = targets;
            Mods = mods;
        }
    }

    public static class Skills
    {
        public static readonly Dictionary<SkillId, SkillDef> SKILLS = new Dictionary<SkillId, SkillDef>
        {
            [SkillId.Whirlwind] = new SkillDef(SkillId.Whirlwind, "소용돌이",
                "주변의 적 전체에 공격력 3배 피해",
                cooldown: 8f, damageMult: 3f, radius: 70f, targets: 0,
                autoCastMinTargets: 2), // 하나 때리자고 쓰기엔 아깝다
            [SkillId.Volley] = new SkillDef(SkillId.Volley, "일제 사격",
                "사거리 안 적 4명에게 각각 공격력 2배 피해",
                cooldown: 7f, damageMult: 2f, radius: 0f, targets: 4, // 반경 0 = 영웅 사거리를 쓴다
                autoCastMinTargets: 1), // 단일에도 값어치가 있다
            [SkillId.Meteor] = new SkillDef(SkillId.Meteor, "유성",
                "적이 가장 많은 곳에 공격력 6배 광역 피해",
                cooldown: 13f, damageMult: 6f, radius: 85f, targets: 0,
                autoCastMinTargets: 3), // 뭉쳤을 때만 값어치가 있다
            [SkillId.Decoy] = new SkillDef(SkillId.Decoy, "허수아비",
                "앞쪽에 미끼를 세워 몹을 붙잡는다 (피해 없음)",
                cooldown: 18f, damageMult: 0f, radius: 0f, targets: 0,
                autoCastMinTargets: 2), // 막을 게 있어야 세운다
        };

        public static readonly SkillId[] SKILL_IDS =
            { SkillId.Whirlwind, SkillId.Volley, SkillId.Meteor, SkillId.Decoy };

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

        /// <summary>여러 조각을 접는다. 곱셈형은 곱하고, 덧셈형은 더하고, 감속은 가장 강한 것을 쓴다.</summary>
        public static SkillMods FoldMods(IReadOnlyList<SkillModPatch> patches)
        {
            var mods = SkillMods.None;
            foreach (var p in patches)
            {
                if (p.CooldownMult.HasValue) mods.CooldownMult *= p.CooldownMult.Value;
                if (p.DamageMult.HasValue) mods.DamageMult *= p.DamageMult.Value;
                if (p.RadiusAdd.HasValue) mods.RadiusAdd += p.RadiusAdd.Value;
                if (p.ExtraTargets.HasValue) mods.ExtraTargets += p.ExtraTargets.Value;
                if (p.ExplosiveRadius.HasValue) mods.ExplosiveRadius += p.ExplosiveRadius.Value;
                if (p.SlowFactor.HasValue) mods.SlowFactor = MathF.Min(mods.SlowFactor, p.SlowFactor.Value);
                if (p.SlowSeconds.HasValue) mods.SlowSeconds = MathF.Max(mods.SlowSeconds, p.SlowSeconds.Value);
                if (p.DecoyHpMult.HasValue) mods.DecoyHpMult *= p.DecoyHpMult.Value;
                if (p.DecoyTaunts == true) mods.DecoyTaunts = true;
            }
            return mods;
        }

        public static ResolvedSkill Resolve(SkillId id, SkillMods mods)
        {
            var def = SKILLS[id];
            return new ResolvedSkill(
                def,
                // 쿨타임은 1초 밑으로 내려가지 않는다
                cooldown: MathF.Max(1f, def.Cooldown * mods.CooldownMult),
                damageMult: def.DamageMult * mods.DamageMult,
                radius: def.Radius + (def.Radius > 0f ? mods.RadiusAdd : 0f),
                targets: def.Targets + (def.Targets > 0 ? mods.ExtraTargets : 0),
                mods: mods);
        }
    }
}
