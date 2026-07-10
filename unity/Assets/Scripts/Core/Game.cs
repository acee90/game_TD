// 원본: web/src/game/game.ts
// ───────── 게임 로직 (UnityEngine 없음 — 순수 C#, 테스트 가능) ─────────
// 출처: docs/reference/god-td-x-vz056-map-analysis-v1.0.md

using System;
using System.Collections.Generic;

namespace GodTD.Core
{
    public sealed partial class Game
    {
        public int Mineral = Balance.START_MINERAL;
        public int Gas = Balance.START_GAS;
        public int Lives = Balance.START_LIVES;
        /// <summary>진행 중인 라운드. 첫 웨이브가 시작되기 전에는 0이다.</summary>
        public int Round;
        public float RoundTimer = Balance.OPENING_SECONDS;
        public int Kills;
        public int Probes;
        public bool Over;

        /// <summary>누적 유닛 생성 횟수. 조합으로 타워가 줄어도 내려가지 않는다.</summary>
        public int UnitsSpawned;
        /// <summary>다음 유닛의 가격 — 누적 생성 횟수를 따라 오른다</summary>
        public int SpawnCost => Balance.SpawnUnitCost(UnitsSpawned);

        /// <summary>누적 점수. 승리 조건이 없으므로 이게 유일한 성적표다.</summary>
        public long ScoreValue;
        /// <summary>GOD 타워 보너스를 이미 받은 유닛 이름</summary>
        readonly HashSet<string> scoredGods = new HashSet<string>();
        public string Message = "타일을 클릭해 유닛을 생성하세요. 같은 유닛 2기가 모이면 조합됩니다.";

        /// <summary>처치한 최고 보스 레벨. Lv N+1 소환은 Lv N을 잡아야 열린다.</summary>
        public int BossCleared;
        public int BossesKilled;
        public float BossCooldown;
        /// <summary>피해 기여 집계 — 영웅(평타+스킬) 대 타워. 밸런스 계측과 UI용</summary>
        public float HeroDamageDealt;
        public float TowerDamageDealt;
        /// <summary>영웅/허수아비가 붙잡아둔 몹에게 타워가 넣은 피해 — 탱킹이 벌어준 딜</summary>
        public float TankAssistDamage;

        public readonly UpgradeLevels Upgrades = new UpgradeLevels();

        /// <summary>제단과 영웅은 시작부터 있다</summary>
        public readonly Hero Hero;
        /// <summary>증강 선택지가 떠 있으면 게임이 멈춘다</summary>
        public List<AugmentCard> AugmentChoices = new List<AugmentCard>();
        /// <summary>이번 증강 선택에서 쓴 리롤 수 — 새 선택지가 뜰 때 0으로 돌아간다</summary>
        public int RerollsUsed;

        public readonly List<Slot> Slots;
        public Slot Selected;

        public List<Enemy> Enemies = new List<Enemy>();
        public List<Shot> Shots = new List<Shot>();
        public List<FloatText> Floats = new List<FloatText>();
        /// <summary>영웅이 세운 미끼 (허수아비 스킬)</summary>
        public Decoy Decoy;

        readonly Queue<EnemySpec> spawnQueue = new Queue<EnemySpec>();
        float spawnTimer;
        float gasFraction;
        float heroHitTimer;
        float decoyHitTimer;

        /// <summary>유닛 추첨용 난수([0,1)). 테스트에서 결정적 함수를 주입한다.</summary>
        readonly Func<double> rand;

        public Game(Func<double> rand = null)
        {
            var rng = new Random();
            this.rand = rand ?? (() => rng.NextDouble());
            Hero = new Hero();
            Slots = new List<Slot>(MapData.SLOT_POS.Length);
            foreach (var p in MapData.SLOT_POS) Slots.Add(new Slot(p.X, p.Y));
        }

        /// <summary>증강 선택 중에는 시간이 흐르지 않는다</summary>
        public bool Paused => AugmentChoices.Count > 0;

        // ── 제단 · 영웅 ──
        /// <summary>제단은 게임 시작과 함께 십자 중앙 타일에 주어진다. 그 자리에는 타워를 놓을 수 없다.</summary>
        public Slot AltarSlot => Slots[HeroData.ALTAR_SLOT];

        public void MoveHero(float x, float y) => Hero.MoveTo(x, y);

        /// <summary>증강 하나를 고른다. 남은 선택이 있으면 다음 선택지를 띄운다.</summary>
        public bool ChooseAugment(int index)
        {
            if (index < 0 || index >= AugmentChoices.Count) return false;
            var card = AugmentChoices[index];

            var rarity = Augments.RARITIES[card.Rarity];
            Hero.AddAugment(card);
            AugmentChoices.Clear();

            Message = $"[{rarity.Label}] {card.Augment.Name}: {card.Augment.Description}";
            OfferAugmentIfPending();
            return true;
        }

        void OfferAugmentIfPending()
        {
            var hero = Hero;
            if (hero.PendingAugmentPicks <= 0) return;
            AugmentChoices = Hero.RollAugmentChoices(hero, rand);
            RerollsUsed = 0;
            if (AugmentChoices.Count == 0) hero.PendingAugmentPicks = 0;
        }

        // ── 증강 리롤 (가스) ──
        public int RerollCost => Augments.AugmentRerollCost(RerollsUsed);

        public bool CanReroll =>
            AugmentChoices.Count > 0 &&
            RerollsUsed < Augments.AUGMENT_REROLL_MAX &&
            Gas >= RerollCost;

        /// <summary>선택지 3장을 가스로 다시 뽑는다 — 한 선택당 최대 2회</summary>
        public bool RerollAugments()
        {
            if (AugmentChoices.Count == 0) return false;
            if (RerollsUsed >= Augments.AUGMENT_REROLL_MAX)
            {
                Message = $"리롤은 선택당 {Augments.AUGMENT_REROLL_MAX}회까지입니다.";
                return false;
            }
            int cost = RerollCost;
            if (Gas < cost)
            {
                Message = $"가스 부족 — 리롤 {cost} 필요.";
                return false;
            }
            Gas -= cost;
            RerollsUsed++;
            AugmentChoices = Hero.RollAugmentChoices(Hero, rand);
            return true;
        }

        // ── 가스 스킬 개조 ──
        public int GasSkillCost(GasSkillTrack track) =>
            Skills.GasSkillCost(track == GasSkillTrack.Damage ? Hero.GasSkillDamage : Hero.GasSkillCdr);

        public bool CanBuyGasSkill(GasSkillTrack track) =>
            !Over && Hero.SkillIdHeld.HasValue && Gas >= GasSkillCost(track);

        /// <summary>가스로 스킬을 개조한다 — 종족 업그레이드와 같은 지갑을 두고 경쟁한다</summary>
        public bool BuyGasSkill(GasSkillTrack track)
        {
            if (!Hero.SkillIdHeld.HasValue)
            {
                Message = "개조할 스킬이 없습니다 — 스킬 증강을 먼저 얻으세요.";
                return false;
            }
            int cost = GasSkillCost(track);
            if (Gas < cost)
            {
                Message = $"가스 부족 — 개조 {cost} 필요.";
                return false;
            }
            Gas -= cost;
            if (track == GasSkillTrack.Damage) Hero.GasSkillDamage++;
            else Hero.GasSkillCdr++;
            Message = track == GasSkillTrack.Damage
                ? $"스킬 피해 개조 +{Hero.GasSkillDamage} · 다음 {GasSkillCost(GasSkillTrack.Damage)}"
                : $"스킬 쿨타임 개조 +{Hero.GasSkillCdr} · 다음 {GasSkillCost(GasSkillTrack.Cdr)}";
            return true;
        }

        /// <summary>필드에 살아있는 보스들의 레벨</summary>
        public List<int> LiveBossLevels
        {
            get
            {
                var levels = new List<int>();
                foreach (var e in Enemies)
                    if (e.Kind == EnemyKind.Boss) levels.Add(e.BossLevel == 0 ? 1 : e.BossLevel);
                return levels;
            }
        }

        // ── 소환 가능한 보스 레벨 ──
        /// <summary>아직 열리지 않은 가장 높은 레벨. Lv N을 잡아야 Lv N+1이 열린다.</summary>
        public int MaxBossLevel => Math.Min(BossCleared + 1, Balance.BOSS_MAX_LEVEL);

        /// <summary>열린 레벨은 언제든 다시 고를 수 있다. 낮은 레벨은 안전하지만 보상이 적다.</summary>
        public bool CanSummonBossLevel(int level) => CanSummonBoss && level >= 1 && level <= MaxBossLevel;

        /// <summary>쿨타임만이 소환을 막는다. 앞선 보스와 교전 중이어도 쿨타임이 차면 또 부를 수 있다.</summary>
        public bool CanSummonBoss => !Over && BossCooldown <= 0f;

        /// <summary>
        /// 보스 소환 — 라운드 진행과 무관한 상시 액션. 비용 없음, 쿨타임만.
        /// 레벨을 생략(0)하면 열려 있는 가장 높은 레벨을 부른다.
        /// </summary>
        public bool SummonBoss(int level = 0)
        {
            if (level == 0) level = MaxBossLevel;
            if (!CanSummonBossLevel(level))
            {
                Message = BossCooldown > 0f
                    ? $"쿨타임 {MathF.Ceiling(BossCooldown)}초 남았습니다."
                    : $"Lv{level} 보스는 아직 열리지 않았습니다 — Lv{MaxBossLevel}까지 소환할 수 있습니다.";
                return false;
            }
            BossCooldown = Balance.BOSS_COOLDOWN_SECONDS;
            Spawn(new EnemySpec(EnemyKind.Boss, $"Lv{level} BOSS",
                Balance.BossHP(level), Balance.BossArmor(level), Balance.BOSS_SPEED,
                radius: 18f, bossLevel: level));
            string unlocks = level == MaxBossLevel && level < Balance.BOSS_MAX_LEVEL
                ? $" 처치하면 Lv{level + 1} 소환이 열립니다."
                : "";
            Message = $"Lv{level} BOSS를 소환합니다. 보상 +{Economy.BossKillMineral(level)}.{unlocks}";
            return true;
        }

        // ── 유닛 생성 / 조합 / 판매 ──
        public bool SpawnUnit(Slot slot)
        {
            if (slot == AltarSlot)
            {
                Message = "제단 타일에는 유닛을 놓을 수 없습니다.";
                return false;
            }
            if (slot.Tower != null)
            {
                Message = "빈 타일을 선택하세요.";
                return false;
            }
            int cost = SpawnCost;
            if (Mineral < cost)
            {
                Message = $"미네랄 부족 — {cost} 필요.";
                return false;
            }
            Mineral -= cost;
            UnitsSpawned++;
            var def = Merge.UnitFor(0, rand, BossesKilled);
            slot.Tower = new Tower(def, 0);
            Float(slot.X, slot.Y, def.Name, Units.RACE_COLOR[(int)def.Race]);
            Selected = slot;
            ResolveMerges();
            if (slot.Tower == null) Selected = null;
            return true;
        }

        public bool SpawnUnitAnywhere()
        {
            foreach (var slot in Slots)
            {
                if (slot.Tower == null && slot != AltarSlot) return SpawnUnit(slot);
            }
            Message = "빈 타일이 없습니다 — 조합하거나 판매하세요.";
            return false;
        }

        /// <summary>연쇄 조합까지 전부 해소한다</summary>
        public void ResolveMerges()
        {
            for (int guard = 0; guard < 64; guard++)
            {
                var result = Merge.FindMerge(Slots, rand, BossesKilled);
                if (result == null) return;

                int removed = 0;
                foreach (var slot in Slots)
                {
                    if (removed >= Balance.MERGE_REQUIRED) break;
                    if (slot.Tower != null && slot.Tower.Def.Name == result.Consumed &&
                        slot.Tower.Tier == result.Tier - 1)
                    {
                        slot.Tower = null;
                        removed++;
                    }
                }
                result.Slot.Tower = new Tower(result.Produced, result.Tier);
                bool isGod = result.Tier == Units.GOD_TIER;
                if (isGod && !scoredGods.Contains(result.Produced.Name))
                {
                    scoredGods.Add(result.Produced.Name);
                    ScoreValue += Score.GOD_TOWER_SCORE;
                }
                Float(result.Slot.X, result.Slot.Y,
                    isGod ? $"★ {result.Produced.Name}" : result.Produced.Name,
                    isGod ? "#ffd23f" : "#ffffff");
                Message = $"{result.Produced.Name} 【 {Units.TagLabel(result.Produced)} 】를 조합하였습니다.";
            }
        }

        public bool SellSelected()
        {
            var slot = Selected;
            if (slot?.Tower == null) return false;
            slot.Tower = null;
            Selected = null;
            Message = "유닛을 처분하였습니다.";
            return true;
        }

        // ── 프로브 / 업그레이드 ──
        public int ProbeCost => Balance.ProbeCost(Probes);

        public bool BuyProbe()
        {
            if (Probes >= Balance.PROBE_MAX)
            {
                Message = $"프로브는 최대 {Balance.PROBE_MAX}기입니다.";
                return false;
            }
            int cost = ProbeCost;
            if (Mineral < cost)
            {
                Message = $"미네랄 부족 — 프로브 {cost} 필요.";
                return false;
            }
            Mineral -= cost;
            Probes++;
            Message = $"프로브 {Probes}기 — 가스를 채취합니다. 다음 {ProbeCost}.";
            return true;
        }

        public bool Upgrade(Race race)
        {
            int cost = Balance.UpgradeGasCost(Upgrades[race]);
            if (Gas < cost)
            {
                Message = $"가스 부족 — 업그레이드 {cost} 필요.";
                return false;
            }
            Gas -= cost;
            Upgrades[race] += 1;
            Message = $"파일런 업그레이드 → Lv{Upgrades[race]}";
            return true;
        }

        public int UpgradeCost(Race race) => Balance.UpgradeGasCost(Upgrades[race]);

        // ── 골드 스탯 구매 ──
        public int StatCost(StatId stat) => Hero.StatCostOf(stat);

        public bool CanBuyStat(StatId stat) => !Over && Mineral >= StatCost(stat);

        /// <summary>미네랄로 스탯 1포인트를 산다 — 힘(공격·체력) / 민첩(공속) / 지능(스킬)</summary>
        public bool BuyStat(StatId stat)
        {
            int cost = StatCost(stat);
            if (Mineral < cost)
            {
                Message = $"미네랄 부족 — {HeroData.StatLabel(stat)} {cost} 필요.";
                return false;
            }
            Mineral -= cost;
            Hero.BuyStat(stat);
            Message =
                $"{HeroData.StatLabel(stat)} +1 ({Hero.Bought.Of(stat)}) · 다음 {StatCost(stat)}";
            return true;
        }

        // ── 라운드 ──
        void BeginRound()
        {
            // 직전 라운드를 넘긴 대가 — 첫 라운드에는 없다
            if (Round >= 1)
            {
                int reward = Balance.WaveReward(Round);
                Mineral += reward;
                ScoreValue += Score.RoundScore(Round);
                Float(Slots[0].X, Slots[0].Y, $"웨이브 +{reward}", "#ffd23f");
            }

            Round++;
            float hp = Balance.EnemyHP(Round);
            float armor = Balance.EnemyArmor(Round);

            for (int i = 0; i < Balance.EnemyCount(Round); i++)
            {
                spawnQueue.Enqueue(new EnemySpec(EnemyKind.Mob, $"R{Round}", hp, armor,
                    Balance.ENEMY_SPEED, radius: 9f));
            }
            Message = $"Round Start — {Round}라운드";
        }

        /// <summary>모든 적은 북측 왼쪽 문 하나에서 나온다</summary>
        void Spawn(EnemySpec spec) => Enemies.Add(new Enemy(spec));

        // ── 누출 / 처치 ──
        void Breakthrough(Enemy enemy)
        {
            int cost = enemy.Kind == EnemyKind.Boss
                ? Balance.BossLeakLives(enemy.BossLevel == 0 ? 1 : enemy.BossLevel)
                : 1;
            Lives -= cost;
            Mineral += Balance.LEAK_MINERAL;
            ScoreValue = Math.Max(0, ScoreValue - (long)Score.LeakPenalty(Round) * cost);
            var p = MapData.PathPos(enemy.Distance);
            Float(p.X, p.Y, $"Life -{cost} · 미네랄 +{Balance.LEAK_MINERAL}", "#ff5a3c");
            if (enemy.Kind == EnemyKind.Boss)
                Message = $"{enemy.Name} 돌파! 다음 레벨은 열리지 않습니다.";
            if (Lives <= 0)
            {
                Lives = 0;
                Over = true;
                Message = "패배";
            }
        }

        void OnKilled(Enemy enemy)
        {
            var p = MapData.PathPos(enemy.Distance);

            if (enemy.Kind == EnemyKind.Boss)
            {
                int level = enemy.BossLevel == 0 ? 1 : enemy.BossLevel;
                int reward = Economy.BossKillMineral(level);
                bool unlocked = level > BossCleared;
                Mineral += reward;
                BossesKilled++;
                BossCleared = Math.Max(BossCleared, level);
                Float(p.X, p.Y, $"[ Lv{level} BOSS KILL ] +{reward}", "#ffd23f");
                ScoreValue += Score.BossScore(level);
                GrantXp(HeroData.XpPerBoss(level));

                string suffix = !unlocked
                    ? ""
                    : BossCleared >= Balance.BOSS_MAX_LEVEL
                        ? " · 모든 보스를 잡았습니다."
                        : $" · Lv{level + 1} 소환이 열렸습니다.";
                Message = $"Lv{level} BOSS 처치! +{reward} 미네랄{suffix}";
                return;
            }

            int before = Kills;
            Kills++;
            ScoreValue += Score.KILL_SCORE;
            var income = Economy.KillIncomeOf(before, Kills);
            if (income.Mineral > 0)
            {
                Mineral += income.Mineral;
                Float(p.X, p.Y, $"+{income.Mineral}", "#8fd6ff");
                if (income.Notes.Count > 0) Message = string.Join(" · ", income.Notes);
            }
            Mineral += Hero.Stats.MineralPerKill;
            GrantXp(enemy.LastHitByHero
                ? HeroData.XP_PER_MOB * HeroData.HERO_LASTHIT_XP_MULT
                : HeroData.XP_PER_MOB);
        }

        /// <summary>경험치는 타워가 잡든 영웅이 잡든 들어온다. 레벨업 시 증강 선택을 띄운다.</summary>
        void GrantXp(int amount)
        {
            var hero = Hero;
            int levels = hero.GainXp(amount);
            if (levels > 0)
            {
                ScoreValue += Score.HERO_LEVEL_SCORE * levels;
                Float(hero.X, hero.Y, $"Lv{hero.Level}!", "#ffd23f");
            }
            if (AugmentChoices.Count == 0) OfferAugmentIfPending();
        }

        public void Float(float x, float y, string text, string color)
        {
            Floats.Add(new FloatText { X = x, Y = y, Text = text, Color = color, Life = 0.9f });
        }

        // ── 프레임 ──
        public void Update(float dt)
        {
            // 밀린 증강 선택이 있으면 먼저 띄운다 — 그래야 아래에서 일시정지된다
            if (AugmentChoices.Count == 0) OfferAugmentIfPending();
            if (Over || Paused) return;

            if (BossCooldown > 0f) BossCooldown = MathF.Max(0f, BossCooldown - dt);

            gasFraction += Probes * Balance.GAS_PER_PROBE_SECOND * dt;
            if (gasFraction >= 1f)
            {
                int whole = (int)MathF.Floor(gasFraction);
                Gas += whole;
                gasFraction -= whole;
            }

            RoundTimer -= dt;
            if (RoundTimer <= 0f)
            {
                RoundTimer = Balance.ROUND_SECONDS;
                BeginRound();
            }

            if (spawnQueue.Count > 0)
            {
                spawnTimer -= dt;
                if (spawnTimer <= 0f)
                {
                    Spawn(spawnQueue.Dequeue());
                    spawnTimer = Balance.SPAWN_INTERVAL;
                }
            }

            AdvanceEnemies(dt);

            FireTowers(dt);
            StepHero(dt);
            if (ShouldAutoCastSkill) UseSkill();
            StepDecoy(dt);

            foreach (var enemy in Enemies)
            {
                if (enemy.Hp <= 0f && !enemy.Dead)
                {
                    enemy.Dead = true;
                    OnKilled(enemy);
                }
            }
            Enemies.RemoveAll(e => e.Dead);

            foreach (var shot in Shots) shot.Life -= dt;
            Shots.RemoveAll(s => s.Life <= 0f);
            foreach (var f in Floats)
            {
                f.Life -= dt;
                f.Y -= 18f * dt;
            }
            Floats.RemoveAll(f => f.Life <= 0f);
        }

        /// <summary>
        /// 몹 전진. 영웅이 앞쪽 시야 안에 있으면 멈춰서 영웅부터 친다.
        /// 이미 영웅을 지나쳐버린 몹은 되돌아오지 않는다 — 그래야 교착이 안 생긴다.
        /// </summary>
        void AdvanceEnemies(float dt)
        {
            var hero = Hero;
            bool heroBlocks = hero.Alive;
            var decoy = Decoy;

            foreach (var enemy in Enemies)
            {
                // 스킬 감속 디버프
                if (enemy.SlowTimer > 0f)
                {
                    enemy.SlowTimer -= dt;
                    if (enemy.SlowTimer <= 0f) enemy.SlowFactor = 1f;
                }
                float debuff = enemy.SlowFactor;
                float speed = enemy.Speed * SlowAt(enemy.Distance) * debuff;

                // 허수아비가 먼저 붙잡는다 — 보스는 도발 인형만 잡는다
                if (decoy != null && IsDecoyAggroed(enemy, decoy) &&
                    (enemy.Kind != EnemyKind.Boss || decoy.Taunts))
                {
                    enemy.Held = true;
                    float gap = decoy.Distance - enemy.Distance;
                    if (gap > HeroData.ENEMY_TOUCH_RANGE)
                        enemy.Distance += MathF.Min(speed * dt, gap - HeroData.ENEMY_TOUCH_RANGE);
                    continue;
                }

                // 보스는 영웅에게 멈추지 않는다 — 지나가며 칠 뿐이다. 저지 불가라
                // 소환한 보스를 화력으로 못 잡으면 걸어나가 목숨을 문다.
                if (heroBlocks && enemy.Kind != EnemyKind.Boss && IsAggroed(enemy, hero))
                {
                    enemy.Held = true;
                    float gap = hero.Distance - enemy.Distance;
                    // 영웅에게 다가가되 지나치지 않는다
                    if (gap > HeroData.ENEMY_TOUCH_RANGE)
                        enemy.Distance += MathF.Min(speed * dt, gap - HeroData.ENEMY_TOUCH_RANGE);
                    continue;
                }
                enemy.Held = false;
                enemy.Distance += speed * dt;
                if (enemy.Distance >= MapData.PATH_LENGTH)
                {
                    enemy.Dead = true;
                    Breakthrough(enemy);
                }
            }
        }

        /// <summary>
        /// 허수아비가 이 몹을 붙잡는가.
        /// 도발 인형은 이미 지나친 몹도 끌어당긴다 — 원거리 영웅에게 탱킹을 대신 해준다.
        /// </summary>
        bool IsDecoyAggroed(Enemy enemy, Decoy decoy)
        {
            float gap = decoy.Distance - enemy.Distance;
            if (gap < -HeroData.ENEMY_TOUCH_RANGE && !decoy.Taunts) return false;
            return MathF.Abs(gap) <= Skills.DECOY_AGGRO_RANGE;
        }

        /// <summary>허수아비를 때리고, 수명이나 체력이 다하면 치운다</summary>
        void StepDecoy(float dt)
        {
            var decoy = Decoy;
            if (decoy == null) return;

            decoy.Life -= dt;
            decoyHitTimer -= dt;

            if (decoyHitTimer <= 0f)
            {
                float incoming = 0f;
                foreach (var enemy in Enemies)
                {
                    if (MathF.Abs(enemy.Distance - decoy.Distance) > HeroData.ENEMY_TOUCH_RANGE + enemy.Radius)
                        continue;
                    incoming += enemy.Kind == EnemyKind.Boss
                        ? HeroData.BossDamage(enemy.BossLevel == 0 ? 1 : enemy.BossLevel, Round)
                        : HeroData.EnemyDamage(Round);
                }
                decoy.Hp -= incoming;
                decoyHitTimer = HeroData.ENEMY_ATTACK_INTERVAL;
            }

            if (decoy.Hp <= 0f || decoy.Life <= 0f)
            {
                var p = MapData.PathPos(decoy.Distance);
                Float(p.X, p.Y, "허수아비 파괴", "#8a8fa8");
                Decoy = null;
            }
        }

        /// <summary>
        /// 경로 위 한 지점에 걸린 이동속도 배수.
        /// 크리쳐 타워 여러 기가 겹쳐도 가장 강한 감속 하나만 적용한다.
        /// </summary>
        public float SlowAt(float distance)
        {
            var p = MapData.PathPos(distance);
            float slowest = 1f;
            foreach (var slot in Slots)
            {
                var tower = slot.Tower;
                if (tower == null) continue;
                float factor = Combat.SlowFactor(tower);
                if (factor >= slowest) continue;
                if (MapData.Hypot(slot.X - p.X, slot.Y - p.Y) <= Combat.Range(tower)) slowest = factor;
            }
            return slowest;
        }

        /// <summary>몹 앞쪽 시야 안에 살아있는 영웅이 있는가</summary>
        bool IsAggroed(Enemy enemy, Hero hero)
        {
            float gap = hero.Distance - enemy.Distance;
            if (gap < -HeroData.ENEMY_TOUCH_RANGE) return false; // 이미 지나쳤다
            return gap <= HeroData.HERO_AGGRO_RANGE;
        }

        /// <summary>영웅 이동 · 공격, 그리고 적의 반격</summary>
        void StepHero(float dt)
        {
            var hero = Hero;
            hero.Step(dt);
            if (!hero.Alive) return;

            var stats = hero.Stats;

            // 영웅 공격 — 사거리 안에서 가장 가까운 적
            if (hero.AttackCooldown <= 0f)
            {
                var target = NearestEnemy(hero.X, hero.Y, stats.Range);
                if (target != null)
                {
                    var t = MapData.PathPos(target.Distance);
                    if (stats.SplashRadius > 0f)
                    {
                        foreach (var enemy in Enemies)
                        {
                            var e = MapData.PathPos(enemy.Distance);
                            if (MapData.Hypot(e.X - t.X, e.Y - t.Y) <= stats.SplashRadius)
                            {
                                float dealt = Balance.EffectiveDamage(stats.Damage, enemy.Armor);
                                enemy.Hp -= dealt;
                                HeroDamageDealt += dealt;
                                enemy.LastHitByHero = true;
                            }
                        }
                        Shots.Add(new Shot
                        {
                            X = hero.X, Y = hero.Y, Tx = t.X, Ty = t.Y, Life = 0.1f,
                            Color = "#c065e0", SplashRadius = stats.SplashRadius,
                        });
                    }
                    else
                    {
                        float dealt = Balance.EffectiveDamage(stats.Damage, target.Armor);
                        target.Hp -= dealt;
                        HeroDamageDealt += dealt;
                        target.LastHitByHero = true;
                        Shots.Add(new Shot
                        {
                            X = hero.X, Y = hero.Y, Tx = t.X, Ty = t.Y, Life = 0.1f, Color = "#ffffff",
                        });
                    }
                    hero.AttackCooldown = stats.AttackInterval;
                }
            }

            // 적의 반격 — 영웅에 닿은 적이 때린다
            heroHitTimer -= dt;
            if (heroHitTimer <= 0f)
            {
                var decoy = Decoy;
                float incoming = 0f;
                foreach (var enemy in Enemies)
                {
                    // 허수아비에 붙어 있는 몹은 영웅을 때리지 않는다
                    if (decoy != null &&
                        MathF.Abs(enemy.Distance - decoy.Distance) <= HeroData.ENEMY_TOUCH_RANGE + enemy.Radius)
                        continue;
                    float gap = MathF.Abs(enemy.Distance - hero.Distance);
                    if (gap > HeroData.ENEMY_TOUCH_RANGE + enemy.Radius) continue;
                    incoming += enemy.Kind == EnemyKind.Boss
                        ? HeroData.BossDamage(enemy.BossLevel == 0 ? 1 : enemy.BossLevel, Round)
                        : HeroData.EnemyDamage(Round);
                }
                if (incoming > 0f)
                {
                    hero.TakeDamage(incoming);
                    Float(hero.X, hero.Y, $"-{MathF.Round(incoming)}", "#ff5a3c");
                    if (!hero.Alive)
                        Message = $"영웅 사망 — {MathF.Ceiling(hero.RespawnTimer)}초 뒤 제단에서 부활합니다.";
                }
                heroHitTimer = HeroData.ENEMY_ATTACK_INTERVAL;
            }
        }

        Enemy NearestEnemy(float x, float y, float reach)
        {
            Enemy best = null;
            float bestDistance = reach;
            foreach (var enemy in Enemies)
            {
                if (enemy.Dead) continue;
                var e = MapData.PathPos(enemy.Distance);
                float distance = MapData.Hypot(e.X - x, e.Y - y);
                if (distance <= bestDistance)
                {
                    bestDistance = distance;
                    best = enemy;
                }
            }
            return best;
        }

        void FireTowers(float dt)
        {
            foreach (var slot in Slots)
            {
                var tower = slot.Tower;
                if (tower == null) continue;
                tower.Cooldown -= dt;
                if (tower.Cooldown > 0f) continue;

                float reach = Combat.Range(tower);
                var inReach = new List<Enemy>();
                foreach (var e in Enemies)
                {
                    if (e.Dead) continue;
                    var p = MapData.PathPos(e.Distance);
                    if (MapData.Hypot(p.X - slot.X, p.Y - slot.Y) <= reach) inReach.Add(e);
                }
                if (inReach.Count == 0) continue;

                float raw = Combat.Damage(tower, Upgrades) * Hero.Stats.TowerDamageMult;
                string color = Units.RACE_COLOR[(int)tower.Def.Race];

                if (Combat.IsSplash(tower))
                {
                    foreach (var e in inReach)
                    {
                        float dealt = Balance.EffectiveDamage(raw, e.Armor);
                        e.Hp -= dealt;
                        TowerDamageDealt += dealt;
                        if (e.Held) TankAssistDamage += dealt;
                        e.LastHitByHero = false;
                    }
                    var p = MapData.PathPos(inReach[0].Distance);
                    Shots.Add(new Shot
                    {
                        X = slot.X, Y = slot.Y, Tx = p.X, Ty = p.Y, Life = 0.08f,
                        Color = color, SplashRadius = reach,
                    });
                }
                else
                {
                    // 파워는 체력 최대(보스) 우선, 그 외에는 출구에 가장 가까운 적(돌파 임박) 우선
                    bool power = tower.Def.HasTag(Tag.Power);
                    var target = inReach[0];
                    foreach (var e in inReach)
                    {
                        if (power ? e.Hp > target.Hp : e.Distance > target.Distance) target = e;
                    }
                    float dealt = Balance.EffectiveDamage(raw, target.Armor);
                    target.Hp -= dealt;
                    TowerDamageDealt += dealt;
                    if (target.Held) TankAssistDamage += dealt;
                    target.LastHitByHero = false;
                    var p = MapData.PathPos(target.Distance);
                    Shots.Add(new Shot
                    {
                        X = slot.X, Y = slot.Y, Tx = p.X, Ty = p.Y, Life = 0.08f, Color = color,
                    });
                }
                tower.Cooldown = Combat.AttackInterval(tower);
            }
        }
    }
}
