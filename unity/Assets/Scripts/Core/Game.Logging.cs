using System;
using System.Collections.Generic;

namespace GodTD.Core
{
    public sealed partial class Game
    {
        public double ElapsedSeconds;
        public double RoundTime;

        IGameEventSink eventSink;
        RunContext runContext;
        int eventSeq;
        bool runFinished;
        int mergeCount;
        int towersSoldCount;
        int heroXpPurchases;
        int heroXpSpent;
        int offerCounter;
        int currentOfferId;
        readonly List<ChosenAugmentSummary> chosenAugments = new List<ChosenAugmentSummary>();

        void InitializeLogging(GameLoggingSession logging)
        {
            if (logging == null) return;
            runContext = logging.Context;
            eventSink = logging.Sink;
            Record("run_started", new RunStartedData
            {
                StartedAt = runContext.StartedAt,
                Build = runContext.Build,
                Seed = runContext.Seed,
                RngAlgorithm = runContext.RngAlgorithm,
                Initial = new InitialState { Mineral = Mineral, Gas = Gas, Lives = Lives },
            });
        }

        void Record(string type, object data)
        {
            if (eventSink == null || runContext == null || runFinished) return;
            var gameEvent = new GameRunEvent
            {
                RunId = runContext.RunId,
                Seq = ++eventSeq,
                ElapsedSeconds = ElapsedSeconds,
                Round = Round,
                RoundTime = RoundTime,
                Score = ScoreValue,
                Type = type,
                Data = data,
            };
            try { eventSink.Record(gameEvent); }
            catch { eventSink = null; }
        }

        TowerLogRef TowerRef(Tower tower) => new TowerLogRef
        {
            Name = tower.Def.Name,
            Tier = tower.Tier,
            Race = (int)tower.Def.Race,
            RaceName = Units.RACES[(int)tower.Def.Race],
        };

        AugmentLogRef AugmentRef(AugmentCard card) => new AugmentLogRef
        {
            Id = card.Augment.Id,
            Name = card.Augment.Name,
            Rarity = card.Rarity == Rarity.Silver ? "silver" :
                card.Rarity == Rarity.Gold ? "gold" : "platinum",
        };

        int SlotIndex(Slot slot) => Slots.IndexOf(slot);

        RunSummary BuildRunSummary(string reason, bool complete, int lastSeq)
        {
            if (runContext == null) return null;
            var byTower = new Dictionary<string, TowerCount>();
            foreach (var slot in Slots)
            {
                if (slot.Tower == null) continue;
                var tower = TowerRef(slot.Tower);
                string key = tower.Tier + "\u0000" + tower.Race + "\u0000" + tower.Name;
                if (byTower.TryGetValue(key, out var count)) count.Count++;
                else byTower[key] = new TowerCount { Tower = tower, Count = 1 };
            }
            var towers = new List<TowerCount>(byTower.Values);
            towers.Sort((a, b) =>
            {
                int tier = b.Tower.Tier.CompareTo(a.Tower.Tier);
                return tier != 0 ? tier : string.CompareOrdinal(a.Tower.Name, b.Tower.Name);
            });
            return new RunSummary
            {
                RunId = runContext.RunId,
                StartedAt = runContext.StartedAt,
                Complete = complete,
                FinishReason = reason,
                Build = runContext.Build,
                Seed = runContext.Seed,
                RngAlgorithm = runContext.RngAlgorithm,
                Score = ScoreValue,
                Round = Round,
                ElapsedSeconds = ElapsedSeconds,
                Kills = Kills,
                BossCleared = BossCleared,
                BossesKilled = BossesKilled,
                HeroLevel = Hero.Level,
                HeroXpPurchases = heroXpPurchases,
                HeroXpSpent = heroXpSpent,
                Mineral = Mineral,
                Gas = Gas,
                Probes = Probes,
                Upgrades = new List<int> { Upgrades[0], Upgrades[1], Upgrades[2], Upgrades[3] },
                Towers = towers,
                Augments = new List<ChosenAugmentSummary>(chosenAugments),
                UnitsSpawned = UnitsSpawned,
                Merges = mergeCount,
                TowersSold = towersSoldCount,
                GodRerolls = GodRerolls,
                LastSeq = lastSeq,
            };
        }

        public RunSummary FinishRun(string reason, bool complete = true)
        {
            if (runFinished || eventSink == null || runContext == null) return null;
            var sink = eventSink;
            var summary = BuildRunSummary(reason, complete, eventSeq + 1);
            Record("run_finished", new RunFinishedData
            {
                Reason = reason,
                Complete = complete,
                Summary = summary,
            });
            runFinished = true;
            try { sink.Finish(summary); }
            catch { }
            return summary;
        }
    }
}
