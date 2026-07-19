using System;
using System.Globalization;
using System.IO;
using System.Security.Cryptography;
using GodTD.Core;
using UnityEngine;

namespace GodTD.View
{
    /// <summary>
    /// 런타임 로그 세션의 테스트·개발용 재정의 값. null 필드는 환경 변수/기본값을 따른다.
    /// </summary>
    public sealed class UnityRunSessionOptions
    {
        public bool? LoggingEnabled;
        public uint? Seed;
        public string RootDirectory;
        public string ValidationScenario;
    }

    public static class UnityRunSession
    {
        public const string LoggingEnabledKey = "godtd.runLogging.enabled";
        public const string LoggingEnvironmentVariable = "GAME_RUN_LOGGING";
        public const string SeedEnvironmentVariable = "GAME_RUN_SEED";
        public const string RootEnvironmentVariable = "GAME_RUN_LOG_ROOT";
        public const string ScenarioEnvironmentVariable = "GAME_RUN_SCENARIO";

        /// <summary>
        /// 개발용 저장 토글. 기본값은 켜짐이며 GAME_RUN_LOGGING 환경 변수가 있으면 그 값이 우선한다.
        /// </summary>
        public static bool LoggingEnabled
        {
            get => PlayerPrefs.GetInt(LoggingEnabledKey, 1) != 0;
            set
            {
                PlayerPrefs.SetInt(LoggingEnabledKey, value ? 1 : 0);
                PlayerPrefs.Save();
            }
        }

        public static Game Create(out UnityRunFileStore store, UnityRunSessionOptions options = null)
        {
            uint seed = ResolveSeed(options?.Seed);
            if (!ResolveLoggingEnabled(options?.LoggingEnabled))
            {
                store = null;
                Debug.Log($"Game run log disabled (seed {seed}).");
                return new Game(SeededRandom.Create(seed));
            }

            var context = CreateContext(seed);
            try
            {
                string root = FirstNonEmpty(
                    options?.RootDirectory,
                    Environment.GetEnvironmentVariable(RootEnvironmentVariable),
                    Path.Combine(Application.persistentDataPath, "GameLogs"));
                store = new UnityRunFileStore(root, context.RunId);
                var game = new Game(
                    SeededRandom.Create(seed),
                    new GameLoggingSession(context, store));
                RunValidationScenario(game, FirstNonEmptyOrNull(
                    options?.ValidationScenario,
                    Environment.GetEnvironmentVariable(ScenarioEnvironmentVariable)));
                Debug.Log($"Game run log: {store.RunDirectory}");
                return game;
            }
            catch (Exception exception)
            {
                store?.Dispose();
                store = null;
                Debug.LogWarning($"Game run log could not start: {exception.Message}");
                return new Game(SeededRandom.Create(seed));
            }
        }

        /// <summary>
        /// 재시작·종료가 연달아 호출돼도 run_finished와 writer dispose를 한 번만 수행한다.
        /// </summary>
        public static void FinishAndDispose(Game game, ref UnityRunFileStore store, string reason)
        {
            game?.FinishRun(reason);
            store?.Dispose();
            store = null;
        }

        static RunContext CreateContext(uint seed)
        {
            string gitSha = FirstNonEmpty(
                Environment.GetEnvironmentVariable("GITHUB_SHA"),
                ReadGit("rev-parse HEAD"),
                "unknown");
            string branch = FirstNonEmpty(
                Environment.GetEnvironmentVariable("GITHUB_REF_NAME"),
                ReadGit("branch --show-current"),
                "unknown");

            return new RunContext
            {
                RunId = Guid.NewGuid().ToString("D"),
                StartedAt = DateTime.UtcNow.ToString("O", CultureInfo.InvariantCulture),
                Seed = seed,
                Build = new BuildInfo
                {
                    GitSha = gitSha,
                    Branch = branch,
                    BuiltAt = FirstNonEmpty(
                        Environment.GetEnvironmentVariable("BUILD_TIMESTAMP"),
                        DateTime.UtcNow.ToString("O", CultureInfo.InvariantCulture)),
                    Target = "unity",
                    AppVersion = FirstNonEmpty(Application.version, "unknown"),
                    EngineVersion = FirstNonEmpty(Application.unityVersion, "unknown"),
                    Dirty = ReadGit("status --porcelain").Length > 0,
                },
            };
        }

        static uint CreateSeed()
        {
            var bytes = new byte[sizeof(uint)];
            using (var random = RandomNumberGenerator.Create()) random.GetBytes(bytes);
            return BitConverter.ToUInt32(bytes, 0);
        }

        static uint ResolveSeed(uint? requested)
        {
            if (requested.HasValue) return requested.Value;
            string configured = Environment.GetEnvironmentVariable(SeedEnvironmentVariable);
            if (uint.TryParse(configured, NumberStyles.Integer, CultureInfo.InvariantCulture, out uint seed))
                return seed;
            return CreateSeed();
        }

        static bool ResolveLoggingEnabled(bool? requested)
        {
            if (requested.HasValue) return requested.Value;
            string configured = Environment.GetEnvironmentVariable(LoggingEnvironmentVariable);
            if (!string.IsNullOrWhiteSpace(configured))
            {
                switch (configured.Trim().ToLowerInvariant())
                {
                    case "1":
                    case "true":
                    case "on":
                        return true;
                    case "0":
                    case "false":
                    case "off":
                        return false;
                }
                Debug.LogWarning($"Ignoring invalid {LoggingEnvironmentVariable} value: {configured}");
            }
            return LoggingEnabled;
        }

        /// <summary>
        /// 빌드 검증 전용 결정 시나리오. GAME_RUN_SCENARIO=smoke일 때만 실행되며 일반 플레이에는
        /// 영향을 주지 않는다. 생성·조합·보스 소환·XP 구매·증강 선택 로그를 한 번에 만든다.
        /// </summary>
        static void RunValidationScenario(Game game, string scenario)
        {
            if (scenario == null) return;
            if (!string.Equals(scenario, "smoke", StringComparison.OrdinalIgnoreCase))
            {
                Debug.LogWarning($"Ignoring unknown {ScenarioEnvironmentVariable} value: {scenario}");
                return;
            }

            game.Mineral = 100000;
            game.Gas = 100000;
            for (int i = 0; i < 12; i++) game.SpawnUnitAnywhere();
            game.SummonBoss(1);
            for (int i = 0; i < 100 && game.Hero.Level < 6; i++)
            {
                if (game.Paused) game.ChooseAugment(0);
                game.BuyXp();
            }
            if (game.Paused) game.ChooseAugment(0);
            Debug.Log($"Game run validation scenario 'smoke' completed (seeded session).");
        }

        static string FirstNonEmptyOrNull(params string[] values)
        {
            foreach (string value in values)
                if (!string.IsNullOrWhiteSpace(value)) return value.Trim();
            return null;
        }

        static string FirstNonEmpty(params string[] values)
        {
            foreach (string value in values)
                if (!string.IsNullOrWhiteSpace(value)) return value.Trim();
            return "unknown";
        }

        static string ReadGit(string arguments)
        {
#if UNITY_EDITOR
            try
            {
                var startInfo = new System.Diagnostics.ProcessStartInfo("git", arguments)
                {
                    WorkingDirectory = Directory.GetParent(Application.dataPath)?.Parent?.FullName ?? Application.dataPath,
                    CreateNoWindow = true,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    UseShellExecute = false,
                };
                using (var process = System.Diagnostics.Process.Start(startInfo))
                {
                    if (process == null) return "";
                    string output = process.StandardOutput.ReadToEnd().Trim();
                    process.WaitForExit(1000);
                    return process.ExitCode == 0 ? output : "";
                }
            }
            catch { return ""; }
#else
            return "";
#endif
        }
    }
}
