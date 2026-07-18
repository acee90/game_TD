// 원본: web/src/data/hero.ts (증강·등급·시너지 부분. 상수·커브는 HeroData.cs)
// ───────── 증강 · 등급 · 특화 시너지 ─────────
// 원본 갓타디에는 없는 신규 설계다.

using System;
using System.Collections.Generic;

namespace GodTD.Core
{
    public enum AugmentKind { Tank, Ranged, Mage, Stat, Utility }

    /// <summary>증강이 영웅·게임에 곱하거나 더하는 값들. null = 효과 없음 (TS의 optional 필드)</summary>
    public sealed class AugmentEffect
    {
        public float? HpMult;
        public float? DamageMult;
        public float? RangeMult;
        public float? AttackSpeedMult;
        public float? MoveSpeedMult;
        /// <summary>초당 체력 재생</summary>
        public float? Regen;
        /// <summary>받는 피해 감소 비율 (0.15 = 15% 감소)</summary>
        public float? DamageReduction;
        /// <summary>광역 스킬을 켠다 — 이 반경의 적 전체를 때린다</summary>
        public float? SplashRadius;
        /// <summary>처치당 추가 미네랄</summary>
        public int? MineralPerKill;
        /// <summary>부활 대기시간 감소(초)</summary>
        public float? RespawnCut;
        /// <summary>모든 타워 공격력 배수</summary>
        public float? TowerDamageMult;
    }

    public sealed class Augment
    {
        public readonly string Id;
        public readonly AugmentKind Kind;
        public readonly string Name;
        public readonly string Description;
        /// <summary>같은 증강을 몇 번까지 쌓을 수 있나</summary>
        public readonly int MaxStacks;
        public readonly AugmentEffect Effect;
        /// <summary>이 증강을 고르면 액티브 스킬을 얻는다 (스킬이 없을 때만 등장)</summary>
        public readonly SkillId? GrantsSkill;
        /// <summary>스킬을 개조한다</summary>
        public readonly SkillModPatch SkillMod;
        /// <summary>이 스킬을 든 영웅에게만 등장한다. RequiresAnySkill이면 스킬 종류 무관.</summary>
        public readonly SkillId? RequiresSkill;
        public readonly bool RequiresAnySkill;

        public Augment(string id, AugmentKind kind, string name, string description, int maxStacks,
            AugmentEffect effect, SkillId? grantsSkill = null, SkillModPatch skillMod = null,
            SkillId? requiresSkill = null, bool requiresAnySkill = false)
        {
            Id = id;
            Kind = kind;
            Name = name;
            Description = description;
            MaxStacks = maxStacks;
            Effect = effect;
            GrantsSkill = grantsSkill;
            SkillMod = skillMod;
            RequiresSkill = requiresSkill;
            RequiresAnySkill = requiresAnySkill;
        }
    }

    // ───────── 등급 ─────────
    // 증강 카드마다 등급이 무작위로 붙는다. 등급이 높으면 효과가 커지는 대신
    // 등급은 뽑기 운이다 — 대가는 없다. 높은 등급이 뜬 순간이 그 판의 도파민이다.

    public enum Rarity { Silver, Gold, Platinum }

    public sealed class RarityDef
    {
        public readonly string Label;
        public readonly string Color;
        /// <summary>증강 효과의 배수. 1보다 큰 부분만 증폭한다(예: 1.3배 → 1.6배).</summary>
        public readonly float Power;
        /// <summary>뽑기 가중치</summary>
        public readonly float Weight;

        public RarityDef(string label, string color, float power, float weight)
        {
            Label = label;
            Color = color;
            Power = power;
            Weight = weight;
        }
    }

    /// <summary>등급이 매겨진 증강 카드</summary>
    public sealed class AugmentCard
    {
        public readonly Augment Augment;
        public readonly Rarity Rarity;
        /// <summary>등급이 반영된 최종 효과</summary>
        public readonly AugmentEffect Effect;

        public AugmentCard(Augment augment, Rarity rarity, AugmentEffect effect)
        {
            Augment = augment;
            Rarity = rarity;
            Effect = effect;
        }
    }

    public sealed class SynergyBonus
    {
        public readonly string Name;
        public readonly string Description;
        public readonly AugmentEffect Effect;

        public SynergyBonus(string name, string description, AugmentEffect effect)
        {
            Name = name;
            Description = description;
            Effect = effect;
        }
    }

    public static class Augments
    {
        public static string KindLabel(AugmentKind kind)
        {
            switch (kind)
            {
                case AugmentKind.Tank: return "탱커";
                case AugmentKind.Ranged: return "원거리";
                case AugmentKind.Mage: return "마법사";
                case AugmentKind.Stat: return "스탯";
                default: return "그 외";
            }
        }

        public static string KindColor(AugmentKind kind)
        {
            switch (kind)
            {
                case AugmentKind.Tank: return "#6fdc8c";
                case AugmentKind.Ranged: return "#4ea3ff";
                case AugmentKind.Mage: return "#c065e0";
                case AugmentKind.Stat: return "#ffd23f";
                default: return "#ff8a3c";
            }
        }

        public static readonly Dictionary<Rarity, RarityDef> RARITIES = new Dictionary<Rarity, RarityDef>
        {
            [Rarity.Silver] = new RarityDef("실버", "#9aa2c0", power: 1f, weight: 55f),
            [Rarity.Gold] = new RarityDef("골드", "#ffd23f", power: 2f, weight: 33f),
            [Rarity.Platinum] = new RarityDef("플래티넘", "#7ce7ff", power: 3.5f, weight: 12f),
        };

        public static readonly Rarity[] RARITY_ORDER = { Rarity.Silver, Rarity.Gold, Rarity.Platinum };

        /// <summary>가중치에 따라 등급 하나를 뽑는다</summary>
        public static Rarity RollRarity(Func<double> rand)
        {
            float total = 0f;
            foreach (var r in RARITY_ORDER) total += RARITIES[r].Weight;
            double roll = rand() * total;
            foreach (var rarity in RARITY_ORDER)
            {
                roll -= RARITIES[rarity].Weight;
                if (roll < 0) return rarity;
            }
            return Rarity.Silver;
        }

        /// <summary>
        /// 등급에 따라 효과를 키운다.
        /// 배수형(1.3 → 1.51)은 1을 넘는 부분만, 가산형(regen 6 → 10)은 값 자체를 키운다.
        /// 피해 감소는 100%에 닿지 않게 상한을 둔다.
        /// </summary>
        public static AugmentEffect ScaleEffect(AugmentEffect effect, float power)
        {
            if (power == 1f) return effect;
            float? Mult(float? v) => v.HasValue ? 1f + (v.Value - 1f) * power : (float?)null;
            float? Add(float? v) => v.HasValue ? v.Value * power : (float?)null;
            return new AugmentEffect
            {
                HpMult = Mult(effect.HpMult),
                DamageMult = Mult(effect.DamageMult),
                RangeMult = Mult(effect.RangeMult),
                AttackSpeedMult = Mult(effect.AttackSpeedMult),
                MoveSpeedMult = Mult(effect.MoveSpeedMult),
                TowerDamageMult = Mult(effect.TowerDamageMult),
                Regen = Add(effect.Regen),
                SplashRadius = Add(effect.SplashRadius),
                MineralPerKill = effect.MineralPerKill.HasValue
                    ? (int?)MathF.Round(effect.MineralPerKill.Value * power)
                    : null,
                RespawnCut = Add(effect.RespawnCut),
                DamageReduction = effect.DamageReduction.HasValue
                    ? (float?)MathF.Min(0.6f, effect.DamageReduction.Value * power)
                    : null,
            };
        }

        public static AugmentCard MakeCard(Augment augment, Rarity rarity) =>
            new AugmentCard(augment, rarity, ScaleEffect(augment.Effect, RARITIES[rarity].Power));

        public static readonly Augment[] AUGMENTS =
        {
            // ── 탱커
            new Augment("bulwark", AugmentKind.Tank, "방벽", "최대 체력 +40%", 3,
                new AugmentEffect { HpMult = 1.4f }),
            new Augment("plating", AugmentKind.Tank, "중장갑", "받는 피해 20% 감소", 2,
                new AugmentEffect { DamageReduction = 0.2f }),
            new Augment("regen", AugmentKind.Tank, "재생", "초당 체력 6 회복", 3,
                new AugmentEffect { Regen = 6f }),

            // ── 원거리
            new Augment("longbow", AugmentKind.Ranged, "장궁", "사거리 +35%", 3,
                new AugmentEffect { RangeMult = 1.35f }),
            new Augment("rapid", AugmentKind.Ranged, "속사", "공격 속도 +35%", 3,
                new AugmentEffect { AttackSpeedMult = 1.35f }),
            new Augment("marksman", AugmentKind.Ranged, "명사수", "공격력 +30%, 사거리 +10%", 3,
                new AugmentEffect { DamageMult = 1.3f, RangeMult = 1.1f }),

            // ── 마법사 (범위 스킬)
            new Augment("novasmall", AugmentKind.Mage, "충격파", "공격이 반경 45의 광역이 된다", 1,
                new AugmentEffect { SplashRadius = 45f }),
            new Augment("novabig", AugmentKind.Mage, "대폭발", "광역 반경 +40 (충격파 필요)", 2,
                new AugmentEffect { SplashRadius = 40f }),
            new Augment("arcane", AugmentKind.Mage, "비전 집중", "공격력 +25%, 공격 속도 +15%", 3,
                new AugmentEffect { DamageMult = 1.25f, AttackSpeedMult = 1.15f }),

            // ── 스탯
            new Augment("vigor", AugmentKind.Stat, "활력", "최대 체력 +20%, 공격력 +10%", 4,
                new AugmentEffect { HpMult = 1.2f, DamageMult = 1.1f }),
            new Augment("swift", AugmentKind.Stat, "신속", "이동 속도 +25%", 2,
                new AugmentEffect { MoveSpeedMult = 1.25f }),
            new Augment("might", AugmentKind.Stat, "완력", "공격력 +45%", 3,
                new AugmentEffect { DamageMult = 1.45f }),

            // ── 그 외
            new Augment("greed", AugmentKind.Utility, "탐욕", "영웅 처치당 미네랄 +1", 3,
                new AugmentEffect { MineralPerKill = 1 }),
            new Augment("phoenix", AugmentKind.Utility, "불사조", "부활 대기 4초 감소", 2,
                new AugmentEffect { RespawnCut = 4f }),
            new Augment("warlord", AugmentKind.Utility, "전쟁군주", "모든 타워 공격력 +20%", 3,
                new AugmentEffect { TowerDamageMult = 1.2f }), // 1.12 → 1.2 (2026-07-16 2차: 타워증강 2장이면 끝까지 타워 우위) ← web

            // ── 액티브 스킬 획득 (영웅은 하나만 든다)
            new Augment("skill_whirlwind", AugmentKind.Tank, "소용돌이",
                "[스킬] 주변 적 전체에 공격력 3배 · 쿨 8초", 1,
                new AugmentEffect(), grantsSkill: SkillId.Whirlwind),
            new Augment("skill_volley", AugmentKind.Ranged, "일제 사격",
                "[스킬] 사거리 안 4명에게 각각 공격력 2배 · 쿨 7초", 1,
                new AugmentEffect(), grantsSkill: SkillId.Volley),
            new Augment("skill_meteor", AugmentKind.Mage, "유성",
                "[스킬] 적이 가장 많은 곳에 공격력 6배 광역 · 쿨 13초", 1,
                new AugmentEffect(), grantsSkill: SkillId.Meteor),
            new Augment("skill_decoy", AugmentKind.Utility, "허수아비",
                "[스킬] 앞쪽에 미끼를 세워 몹을 붙잡는다 · 쿨 18초", 1,
                new AugmentEffect(), grantsSkill: SkillId.Decoy),

            // ── 스킬 공용 강화 (스킬을 든 뒤에만 등장)
            // 쿨타임 폐지 → 마나 (2026-07-17 웹 동기화): 웹의 '집중 수련'(필요 마나 -15%)에 대응
            new Augment("skill_cdr", AugmentKind.Utility, "집중 수련", "필요 마나 15% 감소", 3,
                new AugmentEffect(), skillMod: new SkillModPatch { ManaMaxMult = 0.85f }, requiresAnySkill: true),
            new Augment("skill_amp", AugmentKind.Stat, "증폭", "스킬 피해 +45%", 3,
                new AugmentEffect(), skillMod: new SkillModPatch { DamageMult = 1.45f }, requiresAnySkill: true),

            // ── 스킬 개조 (그 스킬을 든 뒤에만 등장) — 질적 시너지
            new Augment("explosive_arrow", AugmentKind.Ranged, "폭발 화살",
                "일제 사격의 화살마다 반경 32의 폭발", 2,
                new AugmentEffect(), skillMod: new SkillModPatch { ExplosiveRadius = 32f },
                requiresSkill: SkillId.Volley),
            new Augment("multishot", AugmentKind.Ranged, "연사", "일제 사격의 화살 +2발", 3,
                new AugmentEffect(), skillMod: new SkillModPatch { ExtraTargets = 2 },
                requiresSkill: SkillId.Volley),
            new Augment("cyclone", AugmentKind.Tank, "회오리", "소용돌이 반경 +25, 맞은 적을 2초간 40% 감속", 2,
                new AugmentEffect(), skillMod: new SkillModPatch { RadiusAdd = 25f, SlowFactor = 0.6f, SlowSeconds = 2f },
                requiresSkill: SkillId.Whirlwind),
            new Augment("cataclysm", AugmentKind.Mage, "대재앙", "유성 반경 +35, 스킬 피해 +30%", 2,
                new AugmentEffect(), skillMod: new SkillModPatch { RadiusAdd = 35f, DamageMult = 1.3f },
                requiresSkill: SkillId.Meteor),
            new Augment("taunt_dummy", AugmentKind.Utility, "도발 인형",
                "허수아비가 주변 몹을 강제로 끌어당기고 체력 2배", 1,
                new AugmentEffect(), skillMod: new SkillModPatch { DecoyHpMult = 2f, DecoyTaunts = true },
                requiresSkill: SkillId.Decoy),
        };

        /// <summary>광역 증강은 '충격파'를 먼저 잡아야 의미가 있다</summary>
        public static bool RequiresSplash(Augment augment) => augment.Id == "novabig";

        /// <summary>
        /// 지금 든 스킬(없으면 null)로 이 증강을 뽑을 수 있는가.
        ///
        /// - 스킬 획득 증강은 스킬이 없을 때만 나온다 — 영웅은 스킬을 하나만 든다.
        /// - 개조 증강은 그 스킬을 든 뒤에만 나온다. '폭발 화살'은 일제 사격을 쥔 다음에야 의미가 있다.
        ///   이게 수치가 아니라 **관계**로 맺어지는 시너지다.
        /// </summary>
        public static bool SkillGateAllows(Augment augment, SkillId? currentSkill)
        {
            // 스킬 획득 증강은 기본 스킬(강타)일 때만 뜬다 — 교체 제안 (6차) ← web
            if (augment.GrantsSkill.HasValue)
                return currentSkill == null || currentSkill == Skills.DEFAULT_SKILL;
            if (!augment.RequiresAnySkill && !augment.RequiresSkill.HasValue) return true;
            if (currentSkill == null) return false;
            return augment.RequiresAnySkill || augment.RequiresSkill == currentSkill;
        }

        // ───────── 특화 시너지 ─────────
        // 증강 하나하나는 곱연산이라 이미 복리로 붙는다. 여기에 "같은 계열을 모으면 더 준다"를
        // 얹으면, 세 번째 증강을 고르는 순간 눈에 띄게 세지는 구간이 생긴다 — 파워 인플레의 체감.
        //
        // 다섯 개를 받는 판에서 3+2로 나누면 주특화 하나와 부특화 하나가 나오고,
        // 5를 한 계열에 몰면 대특화가 터진다. 그게 도박의 이유가 된다.

        /// <summary>
        /// 적응형 뽑기 가중치 — 이미 든 계열일수록 더 잘 뜬다.
        /// weight = 1 + ADAPTIVE_KIND_WEIGHT × (그 계열 보유 수).
        /// 타입 선택 없이도 드래프트가 방향을 만든다: 첫 증강에 특화를 시작해도 되고,
        /// 범용을 집은 뒤 2번째부터 몰아도 된다. 강제가 아니라 관성이다.
        /// </summary>
        public const float ADAPTIVE_KIND_WEIGHT = 0.9f;

        // ───────── 증강 리롤 (가스) ─────────
        // 마음에 안 드는 선택지 3장을 가스로 다시 뽑는다. 한 선택당 최대 2회 —
        // 무제한이면 플래티넘이 뜰 때까지 굴리는 단순 노동이 된다.
        public const int AUGMENT_REROLL_MAX = 2;
        public const int AUGMENT_REROLL_BASE_GAS = 12;
        /// <summary>n번째 리롤(0부터)의 가스 값 — 같은 선택 안에서 두 번째가 더 비싸다</summary>
        public static int AugmentRerollCost(int used) => AUGMENT_REROLL_BASE_GAS * (used + 1);

        /// <summary>같은 계열 증강이 이만큼 모이면 특화가 발동한다</summary>
        public const int SYNERGY_THRESHOLD = 3;
        /// <summary>이만큼 모이면 대특화</summary>
        public const int MASTERY_THRESHOLD = 5;

        /// <summary>계열별 특화(3개) / 대특화(5개) 보너스</summary>
        public static readonly Dictionary<AugmentKind, (SynergyBonus specialist, SynergyBonus master)> SYNERGIES =
            new Dictionary<AugmentKind, (SynergyBonus, SynergyBonus)>
            {
                [AugmentKind.Tank] = (
                    new SynergyBonus("불굴", "최대 체력 +50%, 공격력 +25%",
                        new AugmentEffect { HpMult = 1.5f, DamageMult = 1.25f }),
                    new SynergyBonus("불멸", "받는 피해 30% 추가 감소, 초당 체력 20 회복, 공격력 +60%",
                        new AugmentEffect { DamageReduction = 0.3f, Regen = 20f, DamageMult = 1.6f })),
                [AugmentKind.Ranged] = (
                    new SynergyBonus("저격 태세", "공격력 +50%, 사거리 +20%",
                        new AugmentEffect { DamageMult = 1.5f, RangeMult = 1.2f }),
                    new SynergyBonus("일점사", "공격력 +100%, 공격 속도 +30%",
                        new AugmentEffect { DamageMult = 2f, AttackSpeedMult = 1.3f })),
                [AugmentKind.Mage] = (
                    new SynergyBonus("연쇄 폭발", "광역 반경 +30, 공격력 +40%",
                        new AugmentEffect { SplashRadius = 30f, DamageMult = 1.4f }),
                    new SynergyBonus("대마법", "광역 반경 +70, 공격력 +120%",
                        new AugmentEffect { SplashRadius = 70f, DamageMult = 2.2f })),
                [AugmentKind.Stat] = (
                    new SynergyBonus("완숙", "공격력 +40%, 최대 체력 +30%",
                        new AugmentEffect { DamageMult = 1.4f, HpMult = 1.3f }),
                    new SynergyBonus("초월", "공격력 +90%, 최대 체력 +60%, 이동 속도 +20%",
                        new AugmentEffect { DamageMult = 1.9f, HpMult = 1.6f, MoveSpeedMult = 1.2f })),
                [AugmentKind.Utility] = (
                    new SynergyBonus("지휘", "모든 타워 공격력 +15%",
                        new AugmentEffect { TowerDamageMult = 1.15f }),
                    new SynergyBonus("군주", "모든 타워 공격력 +35%, 부활 대기 4초 감소",
                        new AugmentEffect { TowerDamageMult = 1.35f, RespawnCut = 4f })),
            };

        /// <summary>보유 증강에서 발동한 시너지들</summary>
        public static List<SynergyBonus> ActiveSynergies(IReadOnlyList<AugmentCard> cards)
        {
            var counts = new Dictionary<AugmentKind, int>();
            foreach (var c in cards)
                counts[c.Augment.Kind] = counts.TryGetValue(c.Augment.Kind, out int n) ? n + 1 : 1;

            var active = new List<SynergyBonus>();
            foreach (var pair in counts)
            {
                if (pair.Value >= SYNERGY_THRESHOLD) active.Add(SYNERGIES[pair.Key].specialist);
                if (pair.Value >= MASTERY_THRESHOLD) active.Add(SYNERGIES[pair.Key].master);
            }
            return active;
        }
    }
}
