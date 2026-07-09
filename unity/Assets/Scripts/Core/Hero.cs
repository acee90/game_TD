// 원본: web/src/game/hero.ts
// ───────── 영웅 ─────────
// 제단에서 부활하고, 경로 위에서만 움직이며, 처치 경험치로 레벨을 올리고,
// 일정 레벨마다 증강을 고른다.
//
// 웹 원본과 다른 점 하나: 영웅 타입은 시작 선택이 아니라 **Lv5 전직**이다.
// 전직 전에는 중립 스탯(HeroClasses.NEUTRAL, 배수 전부 1)으로 싸운다. [Unity 신규]

using System;
using System.Collections.Generic;

namespace GodTD.Core
{
    public sealed class HeroStats
    {
        public readonly float MaxHp;
        public readonly float Damage;
        public readonly float Range;
        public readonly float AttackInterval;
        public readonly float MoveSpeed;
        public readonly float Regen;
        public readonly float DamageReduction;
        /// <summary>0이면 단일 공격</summary>
        public readonly float SplashRadius;
        public readonly int MineralPerKill;
        public readonly float RespawnSeconds;
        public readonly float TowerDamageMult;

        public HeroStats(float maxHp, float damage, float range, float attackInterval,
            float moveSpeed, float regen, float damageReduction, float splashRadius,
            int mineralPerKill, float respawnSeconds, float towerDamageMult)
        {
            MaxHp = maxHp;
            Damage = damage;
            Range = range;
            AttackInterval = attackInterval;
            MoveSpeed = moveSpeed;
            Regen = regen;
            DamageReduction = damageReduction;
            SplashRadius = splashRadius;
            MineralPerKill = mineralPerKill;
            RespawnSeconds = respawnSeconds;
            TowerDamageMult = towerDamageMult;
        }
    }

    /// <summary>
    /// 영웅은 몹과 같은 경로 위에서만 움직인다. 타워 타일을 넘어 날아다닐 수 없다.
    /// 그래서 위치는 좌표가 아니라 경로 위 거리 하나로 표현된다.
    /// </summary>
    public sealed class Hero
    {
        /// <summary>경로 위 현재 거리</summary>
        public float Distance;
        /// <summary>경로 위 목적지</summary>
        public float TargetDistance;

        public float Hp;
        public int Level = 1;
        public int Xp;
        public bool Alive = true;
        public float RespawnTimer;
        public float AttackCooldown;
        /// <summary>액티브 스킬 재사용 대기</summary>
        public float SkillCooldown;
        /// <summary>미네랄로 산 강화 횟수</summary>
        public int GoldUpgrades;

        /// <summary>전직한 타입. null이면 아직 중립(견습). Lv5에 고른다. [Unity 신규]</summary>
        public HeroClassId? ClassId;
        /// <summary>Lv5에 도달해 전직 선택이 밀려 있는가</summary>
        public bool PendingClassPick;

        public readonly List<AugmentCard> AugmentCards = new List<AugmentCard>();
        /// <summary>아직 고르지 않은 증강 선택 횟수</summary>
        public int PendingAugmentPicks;

        public readonly float AltarDistance;

        public Hero(float? altarDistance = null)
        {
            AltarDistance = altarDistance ?? MapData.ALTAR_PATH_DISTANCE;
            Distance = AltarDistance;
            TargetDistance = AltarDistance;
            Hp = Stats.MaxHp;
        }

        /// <summary>현재 타입 정의. 전직 전에는 중립.</summary>
        public HeroClassDef Klass =>
            ClassId.HasValue ? HeroClasses.HERO_CLASSES[ClassId.Value] : HeroClasses.NEUTRAL;

        public float X => MapData.PathPos(Distance).X;
        public float Y => MapData.PathPos(Distance).Y;

        public HeroStats Stats => ComputeStats(Level, AugmentCards, GoldUpgrades, ClassId);

        /// <summary>다음 강화 비용</summary>
        public int NextUpgradeCost => HeroData.HeroUpgradeCost(GoldUpgrades);

        public int XpNeeded => HeroData.XpToNext(Level);

        /// <summary>증강을 몇 개 쌓았는지</summary>
        public int StacksOf(string id)
        {
            int count = 0;
            foreach (var c in AugmentCards) if (c.Augment.Id == id) count++;
            return count;
        }

        public bool HasSplash => Stats.SplashRadius > 0f;

        /// <summary>들고 있는 액티브 스킬. 스킬 증강을 안 골랐으면 null.</summary>
        public SkillId? SkillIdHeld
        {
            get
            {
                foreach (var c in AugmentCards)
                    if (c.Augment.GrantsSkill.HasValue) return c.Augment.GrantsSkill;
                return null;
            }
        }

        /// <summary>개조가 반영된 스킬 수치</summary>
        public ResolvedSkill Skill
        {
            get
            {
                var id = SkillIdHeld;
                if (!id.HasValue) return null;
                var patches = new List<SkillModPatch>();
                foreach (var c in AugmentCards)
                    if (c.Augment.SkillMod != null) patches.Add(c.Augment.SkillMod);
                return Skills.Resolve(id.Value, Skills.FoldMods(patches));
            }
        }

        public bool SkillReady => Alive && SkillIdHeld.HasValue && SkillCooldown <= 0f;

        /// <summary>클릭 좌표를 경로에 투영해서 목적지로 삼는다</summary>
        public void MoveTo(float x, float y)
        {
            TargetDistance = MapData.NearestPathDistance(x, y);
        }

        /// <summary>경로 위 거리를 직접 지정 (테스트·내부용)</summary>
        public void MoveToDistance(float distance)
        {
            TargetDistance = MathF.Min(MapData.PATH_LENGTH, MathF.Max(0f, distance));
        }

        /// <summary>경험치를 넣고, 레벨이 오르면 오른 레벨 수를 돌려준다</summary>
        public int GainXp(int amount)
        {
            if (!Alive) return 0;
            Xp += amount;
            int gained = 0;
            while (Xp >= XpNeeded)
            {
                Xp -= XpNeeded;
                Level++;
                gained++;
                if (HeroData.GrantsAugment(Level)) PendingAugmentPicks++;
                // Lv5 = 전직. 웹의 시작 선택 대신 여기서 타입이 갈린다. [Unity 신규]
                if (Level == HeroData.CLASS_CHANGE_LEVEL && !ClassId.HasValue) PendingClassPick = true;
            }
            if (gained > 0) Hp = Stats.MaxHp; // 레벨업 시 완전 회복
            return gained;
        }

        public void TakeDamage(float raw)
        {
            if (!Alive) return;
            Hp -= raw * (1f - Stats.DamageReduction);
            if (Hp <= 0f)
            {
                Hp = 0f;
                Alive = false;
                RespawnTimer = Stats.RespawnSeconds;
            }
        }

        public void AddAugment(AugmentCard card)
        {
            AugmentCards.Add(card);
            if (PendingAugmentPicks > 0) PendingAugmentPicks--;
            Hp = MathF.Min(Stats.MaxHp, Hp + (Stats.MaxHp - Hp) * 0.5f);
        }

        /// <summary>전직 확정. 스탯 배수가 바뀌므로 체력은 가득 채워 준다. [Unity 신규]</summary>
        public void ChooseClass(HeroClassId id)
        {
            ClassId = id;
            PendingClassPick = false;
            Hp = Stats.MaxHp;
        }

        /// <summary>이동 · 재생 · 부활. 전투는 Game이 처리한다.</summary>
        public void Step(float dt)
        {
            if (!Alive)
            {
                RespawnTimer -= dt;
                if (RespawnTimer <= 0f) Respawn();
                return;
            }

            AttackCooldown -= dt;
            if (SkillCooldown > 0f) SkillCooldown = MathF.Max(0f, SkillCooldown - dt);

            var stats = Stats;
            if (stats.Regen > 0f) Hp = MathF.Min(stats.MaxHp, Hp + stats.Regen * dt);

            float gap = TargetDistance - Distance;
            if (MathF.Abs(gap) <= HeroData.HERO_ARRIVE_EPSILON) return;

            float step = MathF.Min(MathF.Abs(gap), stats.MoveSpeed * dt);
            Distance += MathF.Sign(gap) * step;
        }

        void Respawn()
        {
            Alive = true;
            SkillCooldown = 0f;
            Hp = Stats.MaxHp;
            Distance = AltarDistance;
            TargetDistance = AltarDistance;
            RespawnTimer = 0f;
        }

        /// <summary>증강 카드를 접어서 최종 스탯을 만든다. 순수 함수 — 테스트하기 쉽다.</summary>
        public static HeroStats ComputeStats(
            int level,
            IReadOnlyList<AugmentCard> cards,
            int goldUpgrades = 0,
            HeroClassId? classId = null)
        {
            var klass = classId.HasValue ? HeroClasses.HERO_CLASSES[classId.Value] : HeroClasses.NEUTRAL;

            // 골드 강화는 퍼센트다 — 레벨이 쌓은 기본값에 곱해진다
            float maxHp =
                (HeroData.HERO_BASE_HP + HeroData.HERO_HP_PER_LEVEL * (level - 1)) *
                MathF.Pow(HeroData.HERO_UPGRADE_HP_MULT, goldUpgrades) *
                klass.HpMult;
            float damage =
                (HeroData.HERO_BASE_DAMAGE + HeroData.HERO_DAMAGE_PER_LEVEL * (level - 1)) *
                MathF.Pow(HeroData.HERO_UPGRADE_DAMAGE_MULT, goldUpgrades) *
                klass.DamageMult;
            float range = HeroData.HERO_BASE_RANGE * klass.RangeMult;
            float attackSpeed = klass.AttackSpeedMult;
            float moveSpeed = HeroData.HERO_SPEED;
            float regen = 0f;
            float splashRadius = 0f;
            int mineralPerKill = 0;
            float respawnCut = 0f;
            float towerDamageMult = 1f;

            // 피해 감소는 곱연산으로 쌓아 100%에 도달하지 않게 한다
            float damageTaken = 1f;

            var effects = new List<AugmentEffect>();
            foreach (var c in cards) effects.Add(c.Effect);
            foreach (var s in Augments.ActiveSynergies(cards)) effects.Add(s.Effect);

            foreach (var e in effects)
            {
                if (e.HpMult.HasValue) maxHp *= e.HpMult.Value;
                if (e.DamageMult.HasValue) damage *= e.DamageMult.Value;
                if (e.RangeMult.HasValue) range *= e.RangeMult.Value;
                if (e.AttackSpeedMult.HasValue) attackSpeed *= e.AttackSpeedMult.Value;
                if (e.MoveSpeedMult.HasValue) moveSpeed *= e.MoveSpeedMult.Value;
                if (e.Regen.HasValue) regen += e.Regen.Value;
                if (e.DamageReduction.HasValue) damageTaken *= 1f - e.DamageReduction.Value;
                if (e.SplashRadius.HasValue) splashRadius += e.SplashRadius.Value;
                if (e.MineralPerKill.HasValue) mineralPerKill += e.MineralPerKill.Value;
                if (e.RespawnCut.HasValue) respawnCut += e.RespawnCut.Value;
                if (e.TowerDamageMult.HasValue) towerDamageMult *= e.TowerDamageMult.Value;
            }

            return new HeroStats(
                maxHp: MathF.Round(maxHp),
                damage: MathF.Round(damage),
                range: range,
                attackInterval: HeroData.HERO_ATTACK_INTERVAL / attackSpeed,
                moveSpeed: moveSpeed,
                regen: regen,
                damageReduction: 1f - damageTaken,
                splashRadius: splashRadius,
                mineralPerKill: mineralPerKill,
                respawnSeconds: MathF.Max(3f, HeroData.HERO_RESPAWN_SECONDS - respawnCut),
                towerDamageMult: towerDamageMult);
        }

        /// <summary>이 영웅에게 뜰 수 있는 증강인가</summary>
        public static bool AugmentAllowed(Hero hero, Augment augment)
        {
            if (hero.StacksOf(augment.Id) >= augment.MaxStacks) return false;
            if (Augments.RequiresSplash(augment) && !hero.HasSplash) return false;
            if (!Augments.SkillGateAllows(augment, hero.SkillIdHeld)) return false;

            var klass = hero.Klass;
            // 타입이 못 배우는 스킬은 아예 안 뜬다
            if (augment.GrantsSkill.HasValue && !klass.CanLearn(augment.GrantsSkill.Value)) return false;
            // 가중치 0인 계열도 안 뜬다 — 단, 스킬 개조는 스킬을 든 이상 계열과 무관하게 허용한다
            if (augment.SkillMod == null && klass.KindWeights[augment.Kind] <= 0f) return false;
            return true;
        }

        /// <summary>가중치를 따라 하나를 뽑아 인덱스를 돌려준다</summary>
        static int WeightedIndex(IReadOnlyList<float> weights, Func<double> rand)
        {
            float total = 0f;
            foreach (var w in weights) total += w;
            double roll = rand() * total;
            for (int i = 0; i < weights.Count; i++)
            {
                roll -= weights[i];
                if (roll < 0) return i;
            }
            return weights.Count - 1;
        }

        /// <summary>
        /// 증강 카드 3장을 뽑는다. 카드마다 등급이 따로 굴려진다.
        ///
        /// 영웅 타입이 계열 가중치를 정하므로 뽑기가 빌드 방향으로 기운다.
        /// 스킬 개조 증강은 이미 그 스킬을 든 영웅에게만 뜨므로 가중치를 1로 둔다.
        /// </summary>
        public static List<AugmentCard> RollAugmentChoices(Hero hero, Func<double> rand)
        {
            var remaining = new List<Augment>();
            foreach (var augment in Augments.AUGMENTS)
                if (AugmentAllowed(hero, augment)) remaining.Add(augment);

            float WeightOf(Augment augment) =>
                augment.SkillMod != null ? 1f : hero.Klass.KindWeights[augment.Kind];

            var cards = new List<AugmentCard>();
            while (cards.Count < HeroData.AUGMENT_CHOICES && remaining.Count > 0)
            {
                var weights = new List<float>(remaining.Count);
                foreach (var a in remaining) weights.Add(WeightOf(a));
                int index = WeightedIndex(weights, rand);
                cards.Add(Augments.MakeCard(remaining[index], Augments.RollRarity(rand)));
                remaining.RemoveAt(index);
            }
            return cards;
        }
    }
}
