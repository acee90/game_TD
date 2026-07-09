// 원본: web/src/data/hero-class.ts
// ───────── 영웅 타입 ─────────
// 웹 원본은 게임 시작에 하나를 골랐지만, 이 Unity 프로토는 **영웅 Lv5에 "전직"으로 고른다**
// (HeroData.CLASS_CHANGE_LEVEL). 전직 전에는 중립 스탯(배수 전부 1)이다.
//
// 타입은 두 가지를 한다.
//
// 하나는 기본 스탯을 비튼다 — 전사는 단단하고 느리게 때리고, 궁수는 멀리서 빠르게 때린다.
//
// 다른 하나가 더 중요하다. **증강 풀의 가중치와 금지 목록**을 정한다. 궁수에게 소용돌이가
// 뜨지 않고, 전사에게 유성이 뜨지 않는다. 그래서 첫 증강부터 빌드의 방향이 잡히고,
// 3개쯤 모이면 특화 시너지가 저절로 터진다 — 무작위 풀에서는 계열을 몰기가 운이었다.
//
// 가중치 0은 "안 뜬다"이고, 1이 기준이다.

using System.Collections.Generic;

namespace GodTD.Core
{
    public enum HeroClassId { Warrior, Archer, Mage }

    public sealed class HeroClassDef
    {
        public readonly HeroClassId Id;
        public readonly string Name;
        public readonly string Blurb;
        /// <summary>기본 스탯 배수</summary>
        public readonly float HpMult;
        public readonly float DamageMult;
        public readonly float RangeMult;
        public readonly float AttackSpeedMult;
        /// <summary>증강 계열별 뽑기 가중치. 0이면 안 뜬다.</summary>
        public readonly IReadOnlyDictionary<AugmentKind, float> KindWeights;
        /// <summary>이 타입이 배울 수 있는 액티브 스킬</summary>
        public readonly SkillId[] Skills;

        public HeroClassDef(HeroClassId id, string name, string blurb,
            float hpMult, float damageMult, float rangeMult, float attackSpeedMult,
            Dictionary<AugmentKind, float> kindWeights, SkillId[] skills)
        {
            Id = id;
            Name = name;
            Blurb = blurb;
            HpMult = hpMult;
            DamageMult = damageMult;
            RangeMult = rangeMult;
            AttackSpeedMult = attackSpeedMult;
            KindWeights = kindWeights;
            Skills = skills;
        }

        public bool CanLearn(SkillId skill) => System.Array.IndexOf(Skills, skill) >= 0;
    }

    public static class HeroClasses
    {
        public static readonly Dictionary<HeroClassId, HeroClassDef> HERO_CLASSES =
            new Dictionary<HeroClassId, HeroClassDef>
            {
                [HeroClassId.Warrior] = new HeroClassDef(HeroClassId.Warrior, "전사",
                    "단단하고 가까이서 싸운다. 몹을 붙잡아 시간을 번다.",
                    hpMult: 1.35f, damageMult: 0.9f, rangeMult: 0.75f, attackSpeedMult: 0.9f,
                    new Dictionary<AugmentKind, float>
                    {
                        [AugmentKind.Tank] = 3f, [AugmentKind.Stat] = 1.6f, [AugmentKind.Utility] = 1f,
                        [AugmentKind.Ranged] = 0.25f, [AugmentKind.Mage] = 0f,
                    },
                    new[] { SkillId.Whirlwind, SkillId.Decoy }),
                [HeroClassId.Archer] = new HeroClassDef(HeroClassId.Archer, "궁수",
                    "멀리서 빠르게 때린다. 맞으면 약하니 붙잡히면 안 된다.",
                    hpMult: 0.8f, damageMult: 1f, rangeMult: 1.35f, attackSpeedMult: 1.1f,
                    new Dictionary<AugmentKind, float>
                    {
                        [AugmentKind.Ranged] = 3f, [AugmentKind.Stat] = 1.6f, [AugmentKind.Utility] = 1f,
                        [AugmentKind.Tank] = 0.4f, [AugmentKind.Mage] = 0f,
                    },
                    new[] { SkillId.Volley, SkillId.Decoy }),
                [HeroClassId.Mage] = new HeroClassDef(HeroClassId.Mage, "마법사",
                    "광역으로 쓸어담는다. 뭉친 몹에게 강하다.",
                    hpMult: 0.85f, damageMult: 1f, rangeMult: 1.15f, attackSpeedMult: 0.85f,
                    new Dictionary<AugmentKind, float>
                    {
                        [AugmentKind.Mage] = 3f, [AugmentKind.Stat] = 1.6f, [AugmentKind.Utility] = 1f,
                        [AugmentKind.Ranged] = 0.5f, [AugmentKind.Tank] = 0.3f,
                    },
                    new[] { SkillId.Meteor, SkillId.Decoy }),
            };

        public static readonly HeroClassId[] HERO_CLASS_IDS =
            { HeroClassId.Warrior, HeroClassId.Archer, HeroClassId.Mage };

        /// <summary>
        /// 전직 전의 중립 타입 — 배수 전부 1. [Unity 신규]
        /// 증강은 Lv9부터, 전직은 Lv5라 실전에서 중립 가중치가 쓰일 일은 없지만
        /// 방어적으로 전 계열 1(마법사 계열 포함)·스킬 없음으로 둔다.
        /// </summary>
        public static readonly HeroClassDef NEUTRAL = new HeroClassDef(HeroClassId.Warrior, "견습",
            "아직 전직하지 않았다. Lv5에 전직을 고른다.",
            hpMult: 1f, damageMult: 1f, rangeMult: 1f, attackSpeedMult: 1f,
            new Dictionary<AugmentKind, float>
            {
                [AugmentKind.Tank] = 1f, [AugmentKind.Ranged] = 1f, [AugmentKind.Mage] = 1f,
                [AugmentKind.Stat] = 1f, [AugmentKind.Utility] = 1f,
            },
            new SkillId[0]);
    }
}
