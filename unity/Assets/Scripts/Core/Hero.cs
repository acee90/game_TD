// 원본: web/src/game/hero.ts
// ───────── 영웅 ─────────
// 제단에서 부활하고, 경로 위에서만 움직이며, 처치 경험치로 레벨을 올리고,
// 일정 레벨마다 증강을 고른다. 타입/전직은 없다 — 빌드 방향은 적응형 드래프트가 만든다.

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
        /// <summary>스킬 피해 배수 — 지능이 키운다</summary>
        public readonly float SkillPower;

        public HeroStats(float maxHp, float damage, float range, float attackInterval,
            float moveSpeed, float regen, float damageReduction, float splashRadius,
            int mineralPerKill, float respawnSeconds, float towerDamageMult, float skillPower)
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
            SkillPower = skillPower;
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
        /// <summary>
        /// 횡방향 오프셋 (hero-point-movement.md) — 경로 중심선에서 좌측 법선 방향으로
        /// 비낀 거리(px). 길 보행 폭 안에서 실제 클릭 지점까지 간다. 몹 판정은 1D 그대로. ← web
        /// </summary>
        public float Lateral;
        public float TargetLateral;

        public float Hp;
        public int Level = 1;
        public float Xp; // XP_PER_MOB이 0.65라 소수 — 표시는 내림
        public bool Alive = true;
        public float RespawnTimer;
        public float AttackCooldown;
        /// <summary>액티브 스킬 재사용 대기</summary>
        public float SkillCooldown;
        /// <summary>가스로 산 스킬 개조 횟수</summary>
        public int GasSkillDamage;
        public int GasSkillCdr;

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

        public float X => MapData.PathPosLateral(Distance, Lateral).X;
        public float Y => MapData.PathPosLateral(Distance, Lateral).Y;

        public HeroStats Stats => ComputeStats(Level, AugmentCards);

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

        /// <summary>개조가 반영된 스킬 수치 — 증강 개조와 가스 개조가 함께 접힌다</summary>
        public ResolvedSkill Skill
        {
            get
            {
                var id = SkillIdHeld;
                if (!id.HasValue) return null;
                var patches = new List<SkillModPatch>();
                foreach (var c in AugmentCards)
                    if (c.Augment.SkillMod != null) patches.Add(c.Augment.SkillMod);
                if (GasSkillDamage > 0)
                    patches.Add(new SkillModPatch
                        { DamageMult = MathF.Pow(Skills.GAS_SKILL_DAMAGE_MULT, GasSkillDamage) });
                if (GasSkillCdr > 0)
                    patches.Add(new SkillModPatch
                        { CooldownMult = MathF.Pow(Skills.GAS_SKILL_CDR_MULT, GasSkillCdr) });
                return Skills.Resolve(id.Value, Skills.FoldMods(patches));
            }
        }

        public bool SkillReady => Alive && SkillIdHeld.HasValue && SkillCooldown <= 0f;

        /// <summary>클릭 좌표를 (진행도, 횡오프셋)으로 분해해 목적지로 삼는다. 보정된 실제 목적지를 돌려준다.</summary>
        public MapData.PathProjection MoveTo(float x, float y)
        {
            var p = MapData.ProjectToPath(x, y);
            TargetDistance = p.Distance;
            TargetLateral = p.Lateral;
            return p;
        }

        /// <summary>경로 위 거리를 직접 지정 (테스트·내부용) — 중앙선으로 간다</summary>
        public void MoveToDistance(float distance)
        {
            TargetDistance = MathF.Min(MapData.PATH_LENGTH, MathF.Max(0f, distance));
            TargetLateral = 0f;
        }

        /// <summary>경험치를 넣고, 레벨이 오르면 오른 레벨 수를 돌려준다</summary>
        public int GainXp(float amount)
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

            // 2D 이동 예산 — 진행도·횡오프셋 벡터 길이로 속도를 나눠 대각 이동 가속을 막는다 ← web
            float dAlong = TargetDistance - Distance;
            float dLat = TargetLateral - Lateral;
            float gap = MapData.Hypot(dAlong, dLat);
            if (gap <= HeroData.HERO_ARRIVE_EPSILON) return;

            float step = MathF.Min(gap, stats.MoveSpeed * dt);
            Distance += dAlong / gap * step;
            Lateral += dLat / gap * step;
        }

        void Respawn()
        {
            Alive = true;
            SkillCooldown = 0f;
            Hp = Stats.MaxHp;
            Distance = AltarDistance;
            TargetDistance = AltarDistance;
            Lateral = 0f;
            TargetLateral = 0f;
            RespawnTimer = 0f;
        }

        /// <summary>
        /// 증강 카드를 접어서 최종 스탯을 만든다. 순수 함수 — 테스트하기 쉽다.
        /// </summary>
        public static HeroStats ComputeStats(
            int level,
            IReadOnlyList<AugmentCard> cards)
        {
            // 파워 = 스탯(레벨업 자동 균등 성장) × 증강 배수 — 레벨 배수는 없다 (3안)
            float str = HeroData.StatValue(level, StatId.Str);
            float agi = HeroData.StatValue(level, StatId.Agi);
            float intel = HeroData.StatValue(level, StatId.Int);

            float maxHp = HeroData.HP_PER_STR * str;
            float damage = HeroData.DMG_PER_STR * str;
            float range = HeroData.HERO_BASE_RANGE;
            float attackSpeed = 1f + HeroData.AS_PER_AGI * agi;
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
                attackInterval: MathF.Max(HeroData.MIN_ATTACK_INTERVAL,
                    HeroData.HERO_ATTACK_INTERVAL / attackSpeed),
                moveSpeed: moveSpeed,
                regen: regen,
                damageReduction: 1f - damageTaken,
                splashRadius: splashRadius,
                mineralPerKill: mineralPerKill,
                respawnSeconds: MathF.Max(3f, HeroData.HERO_RESPAWN_SECONDS - respawnCut),
                towerDamageMult: towerDamageMult,
                skillPower: 1f + HeroData.SKILL_PER_INT * intel);
        }

        /// <summary>이 영웅에게 뜰 수 있는 증강인가 — 타입 제한은 없다, 스킬은 하나만</summary>
        public static bool AugmentAllowed(Hero hero, Augment augment)
        {
            if (hero.StacksOf(augment.Id) >= augment.MaxStacks) return false;
            if (Augments.RequiresSplash(augment) && !hero.HasSplash) return false;
            if (!Augments.SkillGateAllows(augment, hero.SkillIdHeld)) return false;
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
        /// 가중치는 적응형이다 — 이미 든 계열일수록 더 잘 뜬다(ADAPTIVE_KIND_WEIGHT).
        /// 그래서 특화는 강제가 아니라 드래프트의 관성으로 만들어진다.
        /// 스킬 개조 증강은 이미 그 스킬을 든 영웅에게만 뜨므로 보유 스킬 계열만큼 기운다.
        /// </summary>
        public static List<AugmentCard> RollAugmentChoices(Hero hero, Func<double> rand)
        {
            var remaining = new List<Augment>();
            foreach (var augment in Augments.AUGMENTS)
                if (AugmentAllowed(hero, augment)) remaining.Add(augment);

            var heldByKind = new Dictionary<AugmentKind, int>();
            foreach (var c in hero.AugmentCards)
                heldByKind[c.Augment.Kind] = heldByKind.TryGetValue(c.Augment.Kind, out int n) ? n + 1 : 1;

            float WeightOf(Augment augment) =>
                1f + Augments.ADAPTIVE_KIND_WEIGHT *
                (heldByKind.TryGetValue(augment.Kind, out int held) ? held : 0);

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
