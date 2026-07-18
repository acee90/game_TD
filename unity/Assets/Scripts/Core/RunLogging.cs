// 원본 계약: schemas/game-run-log/v1.schema.json
// UnityEngine과 파일 I/O가 없는 Web/Unity 공통 런 로그 DTO.

using System;
using System.Collections.Generic;

namespace GodTD.Core
{
    public static class RunLog
    {
        public const int VERSION = 1;
        public const string RNG_ALGORITHM = "mulberry32-v1";
    }

    public static class FinishReasons
    {
        public const string GameOver = "game_over";
        public const string Restart = "restart";
        public const string Quit = "quit";
        public const string Abandoned = "abandoned";
        public const string Test = "test";
    }

    public sealed class BuildInfo
    {
        public string GitSha;
        public string Branch;
        public string BuiltAt;
        public string Target;
        public string AppVersion;
        public string EngineVersion;
        public bool Dirty;
    }

    public sealed class RunContext
    {
        public string RunId;
        public string StartedAt;
        public BuildInfo Build;
        public uint Seed;
        public string RngAlgorithm = RunLog.RNG_ALGORITHM;
    }

    public sealed class TowerLogRef
    {
        public string Name;
        public int Tier;
        public int Race;
        public string RaceName;
    }

    public sealed class AugmentLogRef
    {
        public string Id;
        public string Name;
        public string Rarity;
    }

    public sealed class ChosenAugmentSummary
    {
        public AugmentLogRef Augment;
        public double ElapsedSeconds;
        public int Round;
        public double RoundTime;
    }

    public sealed class TowerCount
    {
        public TowerLogRef Tower;
        public int Count;
    }

    public sealed class RunSummary
    {
        public int V = RunLog.VERSION;
        public string RunId;
        public string StartedAt;
        public bool Complete;
        public string FinishReason;
        public BuildInfo Build;
        public uint Seed;
        public string RngAlgorithm;
        public long Score;
        public int Round;
        public double ElapsedSeconds;
        public int Kills;
        public int BossCleared;
        public int BossesKilled;
        public int HeroLevel;
        public int HeroXpPurchases;
        public int HeroXpSpent;
        public int Mineral;
        public int Gas;
        public int Probes;
        public List<int> Upgrades;
        public List<TowerCount> Towers;
        public List<ChosenAugmentSummary> Augments;
        public int UnitsSpawned;
        public int Merges;
        public int TowersSold;
        public int GodRerolls;
        public int FirstSeq = 1;
        public int LastSeq;
    }

    public sealed class GameRunEvent
    {
        public int V = RunLog.VERSION;
        public string RunId;
        public int Seq;
        public double ElapsedSeconds;
        public int Round;
        public double RoundTime;
        public long Score;
        public string Type;
        public object Data;
    }

    public interface IGameEventSink
    {
        void Record(GameRunEvent gameEvent);
        void Finish(RunSummary summary);
    }

    public sealed class GameLoggingSession
    {
        public readonly RunContext Context;
        public readonly IGameEventSink Sink;

        public GameLoggingSession(RunContext context, IGameEventSink sink)
        {
            Context = context ?? throw new ArgumentNullException(nameof(context));
            Sink = sink ?? throw new ArgumentNullException(nameof(sink));
        }
    }

    public sealed class MemoryGameEventSink : IGameEventSink
    {
        public readonly List<GameRunEvent> Events = new List<GameRunEvent>();
        public RunSummary Summary;
        public void Record(GameRunEvent gameEvent) => Events.Add(gameEvent);
        public void Finish(RunSummary summary) => Summary = summary;
    }

    public static class SeededRandom
    {
        public static Func<double> Create(uint seed)
        {
            uint state = seed;
            return () =>
            {
                unchecked
                {
                    state += 0x6D2B79F5u;
                    uint value = state;
                    value = (value ^ (value >> 15)) * (value | 1u);
                    value ^= value + (value ^ (value >> 7)) * (value | 61u);
                    return (value ^ (value >> 14)) / 4294967296.0;
                }
            };
        }
    }

    public sealed class RunStartedData
    {
        public string StartedAt;
        public BuildInfo Build;
        public uint Seed;
        public string RngAlgorithm;
        public InitialState Initial;
    }

    public sealed class InitialState { public int Mineral; public int Gas; public int Lives; }
    public sealed class RoundStartedData { public int Round; public int EnemyCount; public string WaveType; }
    public sealed class RoundClearedData
    {
        public int Round;
        public int MineralReward;
        public int GasReward;
        public string Semantic = "timer_elapsed";
    }
    public sealed class TowerSpawnedData
    {
        public string Source;
        public int SlotIndex;
        public TowerLogRef Tower;
        public int Cost;
    }
    public sealed class TowerMergedData
    {
        public TowerLogRef Consumed;
        public int ConsumedCount;
        public TowerLogRef Produced;
        public int SlotIndex;
        public bool IsGod;
    }
    public sealed class TowerSoldData { public int SlotIndex; public TowerLogRef Tower; }
    public sealed class BossSummonedData { public int Level; public float Cooldown; }
    public sealed class BossKilledData
    {
        public int Level;
        public int Reward;
        public bool Unlocked;
        public int MaxBossLevel;
    }
    public sealed class AugmentOfferedData
    {
        public int OfferId;
        public int HeroLevel;
        public List<AugmentLogRef> Choices;
    }
    public sealed class AugmentRerolledData
    {
        public int OfferId;
        public int RerollCount;
        public int Cost;
        public List<AugmentLogRef> Choices;
    }
    public sealed class AugmentChosenData
    {
        public int OfferId;
        public int ChoiceIndex;
        public AugmentLogRef Augment;
    }
    public sealed class HeroXpBoughtData
    {
        public int Cost;
        public float Xp;
        public int LevelBefore;
        public int LevelAfter;
        public float XpBefore;
        public float XpAfter;
    }
    public sealed class HeroLeveledData
    {
        public int FromLevel;
        public int ToLevel;
        public float Xp;
        public string Source;
    }
    public sealed class ProbeBoughtData { public int Cost; public int Count; }
    public sealed class RaceUpgradedData
    {
        public int Race;
        public string RaceName;
        public int FromLevel;
        public int ToLevel;
        public int Cost;
    }
    public sealed class GodRerolledData
    {
        public int SlotIndex;
        public int Cost;
        public TowerLogRef Before;
        public TowerLogRef After;
        public int RerollCount;
    }
    public sealed class GasSkillUpgradedData
    {
        public string Track;
        public int FromLevel;
        public int ToLevel;
        public int Cost;
    }
    public sealed class GameOverData
    {
        public string Cause = "leak";
        public string EnemyKind;
        public int? BossLevel;
        public int Lives;
    }
    public sealed class RunFinishedData
    {
        public string Reason;
        public bool Complete;
        public RunSummary Summary;
    }
}
