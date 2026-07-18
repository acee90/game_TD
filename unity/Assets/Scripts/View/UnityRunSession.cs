using System;
using System.Globalization;
using System.IO;
using System.Security.Cryptography;
using GodTD.Core;
using UnityEngine;

namespace GodTD.View
{
    public static class UnityRunSession
    {
        public static Game Create(out UnityRunFileStore store)
        {
            uint seed = CreateSeed();
            var context = CreateContext(seed);
            try
            {
                string root = Path.Combine(Application.persistentDataPath, "GameLogs");
                store = new UnityRunFileStore(root, context.RunId);
                var game = new Game(
                    SeededRandom.Create(seed),
                    new GameLoggingSession(context, store));
                Debug.Log($"Game run log: {store.RunDirectory}");
                return game;
            }
            catch (Exception exception)
            {
                store = null;
                Debug.LogWarning($"Game run log could not start: {exception.Message}");
                return new Game(SeededRandom.Create(seed));
            }
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
