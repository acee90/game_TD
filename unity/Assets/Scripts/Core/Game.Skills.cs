// 원본: web/src/game/game.ts (액티브 스킬 시전 부분)
// ───────── 스킬 자동 시전 · 시전 로직 ─────────
// Game의 partial — 스킬은 자동 시전이고, 발동 조건은 SkillDef.AutoCastMinTargets가 정한다.

using System;
using System.Collections.Generic;

namespace GodTD.Core
{
    public sealed partial class Game
    {
        // ── 액티브 스킬 (자동 시전) ──
        public bool CanUseSkill => !Over && !Paused && Hero.SkillReady;

        /// <summary>
        /// 지금 스킬을 쓸 만한가. 쿨타임이 찼다고 아무 때나 쏘면 뭉친 순간을 놓친다.
        /// 스킬마다 다른 조건을 데이터(AutoCastMinTargets)로 둔다.
        /// </summary>
        public bool ShouldAutoCastSkill
        {
            get
            {
                var skill = Hero.Skill;
                if (!CanUseSkill || skill == null) return false;
                return AutoCastTargetCount(skill) >= skill.Def.AutoCastMinTargets;
            }
        }

        /// <summary>지금 시전하면 몇 기가 영향을 받는가</summary>
        int AutoCastTargetCount(ResolvedSkill skill)
        {
            var hero = Hero;
            switch (skill.Def.Id)
            {
                case SkillId.Smite:
                {
                    // 기본 스킬 — 사거리 안에 하나라도 있으면 값어치가 있다
                    int count = 0;
                    foreach (var e in Enemies)
                        if (!e.Dead && MathF.Abs(e.Distance - hero.Distance) <= hero.Stats.Range) count++;
                    return count;
                }
                case SkillId.Whirlwind:
                {
                    int count = 0;
                    foreach (var e in Enemies)
                        if (!e.Dead && MathF.Abs(e.Distance - hero.Distance) <= skill.Radius) count++;
                    return count;
                }
                case SkillId.Volley:
                {
                    int count = 0;
                    foreach (var e in Enemies)
                        if (!e.Dead && MathF.Abs(e.Distance - hero.Distance) <= hero.Stats.Range) count++;
                    return count;
                }
                case SkillId.Meteor:
                {
                    int best = 0;
                    foreach (var candidate in Enemies)
                    {
                        if (candidate.Dead) continue;
                        int count = 0;
                        foreach (var e in Enemies)
                            if (!e.Dead && MathF.Abs(e.Distance - candidate.Distance) <= skill.Radius) count++;
                        best = Math.Max(best, count);
                    }
                    return best;
                }
                case SkillId.Decoy:
                {
                    // 이미 세워져 있으면 다시 안 세운다
                    if (Decoy != null) return 0;
                    int count = 0;
                    foreach (var e in Enemies)
                    {
                        if (e.Dead) continue;
                        float gap = hero.Distance - e.Distance;
                        if (gap >= 0f && gap <= Skills.DECOY_AUTOCAST_RANGE) count++;
                    }
                    return count;
                }
                default:
                    return 0;
            }
        }

        /// <summary>스킬을 쓴다. 못 쓰면 false.</summary>
        public bool UseSkill()
        {
            var hero = Hero;
            var skill = hero.Skill;
            if (!CanUseSkill || skill == null) return false;

            switch (skill.Def.Id)
            {
                case SkillId.Smite: CastSmite(skill); break;
                case SkillId.Whirlwind: CastWhirlwind(skill); break;
                case SkillId.Volley: CastVolley(skill); break;
                case SkillId.Meteor: CastMeteor(skill); break;
                case SkillId.Decoy: CastDecoy(skill); break;
            }
            hero.SpendMana(); // 쿨타임 없음 — 마나를 비우고 다시 채운다
            return true;
        }

        /// <summary>스킬 피해 한 방 — 지능(skillPower)이 곱해진다</summary>
        void SkillHit(Enemy enemy, ResolvedSkill skill)
        {
            float raw = Hero.Stats.Damage * skill.DamageMult * Hero.Stats.SkillPower;
            float dealt = Balance.EffectiveDamage(raw, enemy.Armor);
            enemy.Hp -= dealt;
            HeroDamageDealt += dealt;
            enemy.LastHitByHero = true;
            if (skill.Mods.SlowFactor < 1f)
            {
                enemy.SlowFactor = skill.Mods.SlowFactor;
                enemy.SlowTimer = skill.Mods.SlowSeconds;
            }
        }

        /// <summary>강타 (기본 스킬, 6차) — 사거리 안 최근접 적 주변 좁은 범위를 때린다 ← web</summary>
        void CastSmite(ResolvedSkill skill)
        {
            var hero = Hero;
            var target = NearestEnemy(hero.X, hero.Y, hero.Stats.Range);
            if (target == null) return;
            foreach (var enemy in Enemies)
                if (MathF.Abs(enemy.Distance - target.Distance) <= skill.Radius) SkillHit(enemy, skill);
            var t = MapData.PathPos(target.Distance);
            Float(t.X, t.Y, "강타!", "#e3b23e");
            Shots.Add(new Shot
            {
                X = hero.X, Y = hero.Y, Tx = t.X, Ty = t.Y, Life = 0.18f,
                Color = "#e3b23e", SplashRadius = skill.Radius,
            });
        }

        void CastWhirlwind(ResolvedSkill skill)
        {
            var hero = Hero;
            foreach (var enemy in Enemies)
                if (MathF.Abs(enemy.Distance - hero.Distance) <= skill.Radius) SkillHit(enemy, skill);
            Float(hero.X, hero.Y, "소용돌이!", "#6fdc8c");
            Shots.Add(new Shot
            {
                X = hero.X, Y = hero.Y, Tx = hero.X, Ty = hero.Y, Life = 0.22f,
                Color = "#6fdc8c", SplashRadius = skill.Radius,
            });
        }

        void CastVolley(ResolvedSkill skill)
        {
            var hero = Hero;
            float reach = hero.Stats.Range;
            var inReach = new List<Enemy>();
            foreach (var e in Enemies)
                if (!e.Dead && MathF.Abs(e.Distance - hero.Distance) <= reach) inReach.Add(e);
            inReach.Sort((a, b) => b.Distance.CompareTo(a.Distance)); // 출구에 가까운 적부터
            if (inReach.Count > skill.Targets) inReach.RemoveRange(skill.Targets, inReach.Count - skill.Targets);

            foreach (var target in inReach)
            {
                SkillHit(target, skill);
                var t = MapData.PathPos(target.Distance);
                Shots.Add(new Shot { X = hero.X, Y = hero.Y, Tx = t.X, Ty = t.Y, Life = 0.14f, Color = "#4ea3ff" });

                // 폭발 화살 — 화살마다 주변으로 번진다
                if (skill.Mods.ExplosiveRadius > 0f)
                {
                    foreach (var splash in Enemies)
                    {
                        if (splash == target || splash.Dead) continue;
                        if (MathF.Abs(splash.Distance - target.Distance) <= skill.Mods.ExplosiveRadius)
                            SkillHit(splash, skill);
                    }
                    Shots.Add(new Shot
                    {
                        X = t.X, Y = t.Y, Tx = t.X, Ty = t.Y, Life = 0.18f,
                        Color = "#ff8a3c", SplashRadius = skill.Mods.ExplosiveRadius,
                    });
                }
            }
            Float(hero.X, hero.Y, $"일제 사격 x{skill.Targets}", "#4ea3ff");
        }

        /// <summary>적이 가장 많이 몰린 경로 지점을 찾아 떨어뜨린다</summary>
        void CastMeteor(ResolvedSkill skill)
        {
            if (Enemies.Count == 0) return;
            float bestDistance = Enemies[0].Distance;
            int bestCount = 0;
            foreach (var candidate in Enemies)
            {
                int count = 0;
                foreach (var e in Enemies)
                    if (MathF.Abs(e.Distance - candidate.Distance) <= skill.Radius) count++;
                if (count > bestCount)
                {
                    bestCount = count;
                    bestDistance = candidate.Distance;
                }
            }
            foreach (var enemy in Enemies)
                if (MathF.Abs(enemy.Distance - bestDistance) <= skill.Radius) SkillHit(enemy, skill);
            var p = MapData.PathPos(bestDistance);
            Float(p.X, p.Y, $"유성! {bestCount}기", "#c065e0");
            Shots.Add(new Shot
            {
                X = p.X, Y = p.Y, Tx = p.X, Ty = p.Y, Life = 0.3f,
                Color = "#c065e0", SplashRadius = skill.Radius,
            });
        }

        void CastDecoy(ResolvedSkill skill)
        {
            var hero = Hero;
            float maxHp = MathF.Round(hero.Stats.MaxHp * Skills.DECOY_HP_RATIO * skill.Mods.DecoyHpMult);
            Decoy = new Decoy
            {
                Distance = MathF.Max(0f, hero.Distance - Skills.DECOY_AHEAD), // 몹이 오는 쪽
                Hp = maxHp,
                MaxHp = maxHp,
                Life = Skills.DECOY_LIFETIME,
                Taunts = skill.Mods.DecoyTaunts,
            };
            Float(hero.X, hero.Y, "허수아비!", "#ff8a3c");
        }

    }
}
