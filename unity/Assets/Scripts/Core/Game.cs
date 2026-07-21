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

        public Game(Func<double> rand = null, GameLoggingSession logging = null)
        {
            var rng = new Random();
            this.rand = rand ?? (() => rng.NextDouble());
            Hero = new Hero();
            Slots = new List<Slot>(MapData.SLOT_POS.Length);
            foreach (var p in MapData.SLOT_POS) Slots.Add(new Slot(p.X, p.Y));
            InitializeLogging(logging);
        }

        /// <summary>증강 선택 중에는 시간이 흐르지 않는다.</summary>
        public bool Paused => AugmentChoices.Count > 0;

        // ── 제단 · 영웅 ──
        /// <summary>제단은 게임 시작과 함께 십자 중앙 타일에 주어진다. 그 자리에는 타워를 놓을 수 없다.</summary>
        public Slot AltarSlot => Slots[HeroData.ALTAR_SLOT];

        /// <summary>우클릭 이동 — 보정된 실제 목적지를 돌려준다 (View가 목적지 마커에 쓴다)</summary>
        public MapData.PathProjection MoveHero(float x, float y) => Hero.MoveTo(x, y);

        /// <summary>증강 하나를 고른다. 남은 선택이 있으면 다음 선택지를 띄운다.</summary>
        public bool ChooseAugment(int index)
        {
            if (index < 0 || index >= AugmentChoices.Count) return false;
            var card = AugmentChoices[index];

            var rarity = Augments.RARITIES[card.Rarity];
            int offerId = currentOfferId;
            var augment = AugmentRef(card);
            Hero.AddAugment(card);
            AugmentChoices.Clear();
            Record("augment_chosen", new AugmentChosenData
            {
                OfferId = offerId,
                ChoiceIndex = index,
                Augment = augment,
            });
            chosenAugments.Add(new ChosenAugmentSummary
            {
                Augment = augment,
                ElapsedSeconds = ElapsedSeconds,
                Round = Round,
                RoundTime = RoundTime,
            });

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
            if (AugmentChoices.Count == 0)
            {
                hero.PendingAugmentPicks = 0;
                return;
            }
            currentOfferId = ++offerCounter;
            var choices = new List<AugmentLogRef>();
            foreach (var choice in AugmentChoices) choices.Add(AugmentRef(choice));
            Record("augment_offered", new AugmentOfferedData
            {
                OfferId = currentOfferId,
                HeroLevel = hero.Level,
                Choices = choices,
            });
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
            var choices = new List<AugmentLogRef>();
            foreach (var choice in AugmentChoices) choices.Add(AugmentRef(choice));
            Record("augment_rerolled", new AugmentRerolledData
            {
                OfferId = currentOfferId,
                RerollCount = RerollsUsed,
                Cost = cost,
                Choices = choices,
            });
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
            int fromLevel = track == GasSkillTrack.Damage ? Hero.GasSkillDamage : Hero.GasSkillCdr;
            if (track == GasSkillTrack.Damage) Hero.GasSkillDamage++;
            else Hero.GasSkillCdr++;
            Record("gas_skill_upgraded", new GasSkillUpgradedData
            {
                Track = track == GasSkillTrack.Damage ? "damage" : "cdr",
                FromLevel = fromLevel,
                ToLevel = fromLevel + 1,
                Cost = cost,
            });
            Message = track == GasSkillTrack.Damage
                ? $"스킬 피해 개조 +{Hero.GasSkillDamage} · 다음 {GasSkillCost(GasSkillTrack.Damage)}"
                : $"필요 마나 개조 +{Hero.GasSkillCdr} · 다음 {GasSkillCost(GasSkillTrack.Cdr)}";
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
            Record("boss_summoned", new BossSummonedData
            {
                Level = level,
                Cooldown = Balance.BOSS_COOLDOWN_SECONDS,
            });
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
            Record("tower_spawned", new TowerSpawnedData
            {
                Source = "purchase",
                SlotIndex = SlotIndex(slot),
                Tower = TowerRef(slot.Tower),
                Cost = cost,
            });
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

                TowerLogRef consumed = null;
                foreach (var candidate in Slots)
                {
                    if (candidate.Tower != null && candidate.Tower.Def.Name == result.Consumed &&
                        candidate.Tower.Tier == result.Tier - 1)
                    {
                        consumed = TowerRef(candidate.Tower);
                        break;
                    }
                }
                if (consumed == null) return;

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
                mergeCount++;
                Record("tower_merged", new TowerMergedData
                {
                    Consumed = consumed,
                    ConsumedCount = removed,
                    Produced = TowerRef(result.Slot.Tower),
                    SlotIndex = SlotIndex(result.Slot),
                    IsGod = isGod,
                });
                Float(result.Slot.X, result.Slot.Y,
                    isGod ? $"★ {result.Produced.Name}" : result.Produced.Name,
                    isGod ? "#ffd23f" : "#ffffff");
                Message = $"{result.Produced.Name} 【 {Units.TagLabel(result.Produced)} 】를 조합하였습니다.";
            }
        }

        // ── GOD 리롤 (7차) — 조합의 끝을 운에만 맡기지 않는다 ← web ──
        /// <summary>지금까지 GOD를 몇 번 다시 뽑았나 — 비용이 지수로 오른다</summary>
        public int GodRerolls;

        public int GodRerollCost => Balance.GodRerollCost(GodRerolls);

        /// <summary>이 타워를 다시 뽑을 수 있는가 — GOD만, 금화가 있어야</summary>
        public bool CanRerollGod(Slot slot) =>
            !Over && slot?.Tower != null && slot.Tower.Tier == Units.GOD_TIER &&
            Mineral >= GodRerollCost;

        /// <summary>선택한 GOD 타워의 종류를 다시 뽑는다. 보스 6기 이상이면 확장 풀에서 나온다.</summary>
        public bool RerollGod()
        {
            var slot = Selected;
            if (slot?.Tower == null) return false;
            if (slot.Tower.Tier != Units.GOD_TIER)
            {
                Message = "GOD 타워만 다시 뽑을 수 있습니다.";
                return false;
            }
            int cost = GodRerollCost;
            if (Mineral < cost)
            {
                Message = $"금화 부족 — GOD 리롤 {cost} 필요.";
                return false;
            }
            Mineral -= cost;
            GodRerolls++;
            var before = slot.Tower.Def;
            var beforeTower = TowerRef(slot.Tower);
            var next = Merge.RerollUnit(Units.GOD_TIER, before, rand, BossesKilled);
            // GOD는 최고 티어라 이 교체가 조합을 부르지 않는다
            slot.Tower = new Tower(next, Units.GOD_TIER);
            Record("god_rerolled", new GodRerolledData
            {
                SlotIndex = SlotIndex(slot),
                Cost = cost,
                Before = beforeTower,
                After = TowerRef(slot.Tower),
                RerollCount = GodRerolls,
            });
            Float(slot.X, slot.Y, $"★ {next.Name}", "#ffd23f");
            Message = $"{before.Name} → {next.Name} 【 {Units.TagLabel(next)} 】 · 다음 리롤 {GodRerollCost}.";
            return true;
        }

        public bool SellSelected()
        {
            var slot = Selected;
            if (slot?.Tower == null) return false;
            var tower = TowerRef(slot.Tower);
            int slotIndex = SlotIndex(slot);
            slot.Tower = null;
            Selected = null;
            towersSoldCount++;
            Record("tower_sold", new TowerSoldData { SlotIndex = slotIndex, Tower = tower });
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
            Record("probe_bought", new ProbeBoughtData { Cost = cost, Count = Probes });
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
            int fromLevel = Upgrades[race];
            Upgrades[race] += 1;
            Record("race_upgraded", new RaceUpgradedData
            {
                Race = (int)race,
                RaceName = Units.RACES[(int)race],
                FromLevel = fromLevel,
                ToLevel = Upgrades[race],
                Cost = cost,
            });
            Message = $"파일런 업그레이드 → Lv{Upgrades[race]}";
            return true;
        }

        public int UpgradeCost(Race race) => Balance.UpgradeGasCost(Upgrades[race]);

        // ── 영웅 성장 (3안): 골드 → XP → 레벨업 자동 균등 스탯 성장 ──
        public bool CanBuyXp => !Over && Hero.Alive && Mineral >= HeroData.XP_BUY_GOLD;

        /// <summary>골드로 XP 구매 (TFT식) — 영웅 성장의 주 연료</summary>
        public bool BuyXp()
        {
            if (!CanBuyXp)
            {
                Message = $"미네랄 부족 — XP 구매 {HeroData.XP_BUY_GOLD} 필요.";
                return false;
            }
            Mineral -= HeroData.XP_BUY_GOLD;
            heroXpPurchases++;
            heroXpSpent += HeroData.XP_BUY_GOLD;
            GrantXp(HeroData.XP_BUY_AMOUNT, "purchase", result =>
            {
                Record("hero_xp_bought", new HeroXpBoughtData
                {
                    Cost = HeroData.XP_BUY_GOLD,
                    Xp = HeroData.XP_BUY_AMOUNT,
                    LevelBefore = result.LevelBefore,
                    LevelAfter = result.LevelAfter,
                    XpBefore = result.XpBefore,
                    XpAfter = result.XpAfter,
                });
            });
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
                Record("round_cleared", new RoundClearedData
                {
                    Round = Round,
                    MineralReward = reward,
                    GasReward = 0,
                });
            }

            Round++;
            RoundTime = 0;
            // 초반 난이도 완화는 몹 HP에만 적용한다. 이동·공격 시간은 전 라운드 정속이다.
            float hp = MathF.Round(Balance.EnemyHP(Round) * Balance.EarlyEnemyHpMultiplier(Round));
            float armor = Balance.EnemyArmor(Round);

            for (int i = 0; i < Balance.EnemyCount(Round); i++)
            {
                var waveType = Balance.WaveTypeOf(Round);
                spawnQueue.Enqueue(new EnemySpec(EnemyKind.Mob, $"R{Round}", hp, armor,
                    Balance.ENEMY_SPEED, radius: 9f,
                    contactDamageMult: waveType.ContactDamageMult,
                    typeColor: waveType.Id == Balance.WaveTypeId.Normal ? null : waveType.Color));
            }
            {
                var waveType = Balance.WaveTypeOf(Round);
                Message = waveType.Id == Balance.WaveTypeId.Normal
                    ? $"Round Start — {Round}라운드"
                    : $"Round Start — {Round}라운드 · {waveType.Label} 웨이브! (접촉 피해 ×{waveType.ContactDamageMult:0})";
                Record("round_started", new RoundStartedData
                {
                    Round = Round,
                    EnemyCount = Balance.EnemyCount(Round),
                    WaveType = waveType.Id == Balance.WaveTypeId.Normal ? "normal" : "hunter",
                });
            }
        }

        /// <summary>모든 적은 북측 왼쪽 문 하나에서 나온다</summary>
        void Spawn(EnemySpec spec)
        {
            var e = new Enemy(spec);
            // 2열 레인 — 잡몹 좌/우 교대, 보스 중앙. 표시 전용 ← web
            e.Lane = spec.Kind == EnemyKind.Boss ? 0 : Enemies.Count % 2 == 0 ? -1 : 1;
            Enemies.Add(e);
        }

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
                Record("game_over", new GameOverData
                {
                    EnemyKind = enemy.Kind == EnemyKind.Boss ? "boss" : "mob",
                    BossLevel = enemy.Kind == EnemyKind.Boss ? (int?)(enemy.BossLevel == 0 ? 1 : enemy.BossLevel) : null,
                    Lives = 0,
                });
                FinishRun(FinishReasons.GameOver);
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
                Record("boss_killed", new BossKilledData
                {
                    Level = level,
                    Reward = reward,
                    Unlocked = unlocked,
                    MaxBossLevel = MaxBossLevel,
                });
                GrantXp(HeroData.XpPerBoss(level), "boss_kill");

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
                : HeroData.XP_PER_MOB, "mob_kill");
        }

        /// <summary>경험치는 타워가 잡든 영웅이 잡든 들어온다. 레벨업 시 증강 선택을 띄운다.</summary>
        sealed class XpGrantResult
        {
            public int LevelBefore;
            public int LevelAfter;
            public float XpBefore;
            public float XpAfter;
        }

        void GrantXp(float amount, string source, Action<XpGrantResult> beforeLevelEvent = null)
        {
            var hero = Hero;
            int levelBefore = hero.Level;
            float xpBefore = hero.Xp;
            int levels = hero.GainXp(amount);
            if (levels > 0)
            {
                ScoreValue += Score.HERO_LEVEL_SCORE * levels;
                Float(hero.X, hero.Y, $"Lv{hero.Level}!", "#ffd23f");
            }
            beforeLevelEvent?.Invoke(new XpGrantResult
            {
                LevelBefore = levelBefore,
                LevelAfter = hero.Level,
                XpBefore = xpBefore,
                XpAfter = hero.Xp,
            });
            if (levels > 0)
            {
                Record("hero_leveled", new HeroLeveledData
                {
                    FromLevel = levelBefore,
                    ToLevel = hero.Level,
                    Xp = amount,
                    Source = source,
                });
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

            ElapsedSeconds += dt;
            RoundTime += dt;

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
                BeginRound();
                RoundTimer = Balance.RoundCountdownSeconds(Round);
            }

            if (spawnQueue.Count > 0)
            {
                spawnTimer -= dt;
                if (spawnTimer <= 0f)
                {
                    // 동시 몹 상한 (6차) — 상한이면 스폰을 미룬다 (총 체력 불변) ← web
                    int normals = 0;
                    foreach (var e in Enemies) if (e.Kind != EnemyKind.Boss && !e.Dead) normals++;
                    if (normals < Balance.MAX_ALIVE_MOBS) Spawn(spawnQueue.Dequeue());
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
                        : HeroData.EnemyDamage(Round) * enemy.Spec.ContactDamageMult;
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
                        // 영웅 스플래시도 계단 감쇠 (2026-07-19) — 주표적 100%, 멀수록 준다.
                        // 반경은 영웅 스탯 그대로다 (타워의 SPLASH_RADIUS_MULT는 안 걸린다).
                        foreach (var enemy in Enemies)
                        {
                            var e = MapData.PathPos(enemy.Distance);
                            float dist = MapData.Hypot(e.X - t.X, e.Y - t.Y);
                            if (dist <= stats.SplashRadius)
                            {
                                float dealt = Balance.EffectiveDamage(
                                    stats.Damage * Balance.SplashFalloff(dist, stats.SplashRadius), enemy.Armor);
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
                    // 평타가 마나를 채운다 (TFT식) — 공속이 곧 스킬 회전
                    hero.GainMana(Skills.MANA_PER_ATTACK);
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
                        : HeroData.EnemyDamage(Round) * enemy.Spec.ContactDamageMult;
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
                    // 폭발 반경은 사거리 전체가 아니라 그 일부다 (SPLASH_RADIUS_MULT, 2026-07-19).
                    float blast = reach * Balance.SPLASH_RADIUS_MULT;
                    var pos = new Pt[inReach.Count];
                    for (int i = 0; i < inReach.Count; i++) pos[i] = MapData.PathPos(inReach[i].Distance);
                    // 폭심 = 반경 안에 몹이 가장 많이 들어오는 지점. 반경이 좁아진 만큼
                    // 아무 몹이나 잡으면 1~2기밖에 못 때린다 — 밀집을 노려야 제값을 한다.
                    int best = 0;
                    int bestHits = -1;
                    for (int i = 0; i < pos.Length; i++)
                    {
                        int hits = 0;
                        foreach (var q in pos) if (MapData.Hypot(q.X - pos[i].X, q.Y - pos[i].Y) <= blast) hits++;
                        if (hits > bestHits)
                        {
                            bestHits = hits;
                            best = i;
                        }
                    }
                    var c = pos[best];
                    // 감쇠 — 폭심에서 멀수록 계단식으로 줄고, 반경 밖은 아예 안 맞는다.
                    for (int i = 0; i < inReach.Count; i++)
                    {
                        float dist = MapData.Hypot(pos[i].X - c.X, pos[i].Y - c.Y);
                        if (dist > blast) continue;
                        var e = inReach[i];
                        float dealt = Balance.EffectiveDamage(raw * Balance.SplashFalloff(dist, blast), e.Armor);
                        e.Hp -= dealt;
                        TowerDamageDealt += dealt;
                        if (e.Held) TankAssistDamage += dealt;
                        e.LastHitByHero = false;
                    }
                    Shots.Add(new Shot
                    {
                        X = slot.X, Y = slot.Y, Tx = c.X, Ty = c.Y, Life = 0.08f,
                        Color = color, SplashRadius = blast,
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
