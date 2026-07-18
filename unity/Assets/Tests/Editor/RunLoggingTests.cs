using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using GodTD.Core;
using GodTD.View;
using Newtonsoft.Json.Linq;
using NUnit.Framework;

namespace GodTD.Tests
{
    public sealed class RunLoggingTests
    {
        static readonly BuildInfo TestBuild = new BuildInfo
        {
            GitSha = "test-sha",
            Branch = "test",
            BuiltAt = "2026-07-18T00:00:00Z",
            Target = "unity",
            AppVersion = "test",
            EngineVersion = "test",
            Dirty = false,
        };

        [Test]
        public void Mulberry32MatchesWebReferenceSequence()
        {
            var random = SeededRandom.Create(123456789u);
            double[] expected =
            {
                0.25779074383899570,
                0.97077211155556142,
                0.78532801428809762,
                0.20616457983851433,
                0.30307188746519387,
            };

            foreach (double value in expected)
                Assert.That(random(), Is.EqualTo(value).Within(1e-15));
        }

        [Test]
        public void CoreEmitsOrderedEventsAndFinishesOnlyOnce()
        {
            var sink = new MemoryGameEventSink();
            var context = TestContext("core-test", 7u);
            var game = new Game(SeededRandom.Create(context.Seed), new GameLoggingSession(context, sink));

            game.Mineral = 100000;
            Assert.That(game.SpawnUnitAnywhere(), Is.True);
            Assert.That(game.BuyXp(), Is.True);
            var summary = game.FinishRun(FinishReasons.Test);

            Assert.That(sink.Events.Select(gameEvent => gameEvent.Type), Is.EqualTo(new[]
            {
                "run_started", "tower_spawned", "hero_xp_bought", "hero_leveled", "run_finished",
            }));
            Assert.That(sink.Events.Select(gameEvent => gameEvent.Seq), Is.EqualTo(new[] { 1, 2, 3, 4, 5 }));
            Assert.That(summary.LastSeq, Is.EqualTo(5));
            Assert.That(summary.UnitsSpawned, Is.EqualTo(1));
            Assert.That(summary.HeroXpPurchases, Is.EqualTo(1));
            Assert.That(sink.Summary, Is.SameAs(summary));

            Assert.That(game.FinishRun(FinishReasons.Quit), Is.Null);
            Assert.That(sink.Events.Count, Is.EqualTo(5));
        }

        [Test]
        public void FileStoreWritesCamelCaseJsonlAndSummary()
        {
            string root = Path.Combine(Path.GetTempPath(), "game-td-run-log-tests", Guid.NewGuid().ToString("N"));
            var context = TestContext("file-test", uint.MaxValue);
            try
            {
                using (var store = new UnityRunFileStore(root, context.RunId))
                {
                    var game = new Game(SeededRandom.Create(context.Seed), new GameLoggingSession(context, store));
                    game.Update(0.5f);
                    game.FinishRun(FinishReasons.Test);

                    string[] lines = File.ReadAllLines(store.EventsPath);
                    Assert.That(lines.Length, Is.EqualTo(2));
                    var started = JObject.Parse(lines[0]);
                    var finished = JObject.Parse(lines[1]);
                    Assert.That((int)started["v"], Is.EqualTo(1));
                    Assert.That((string)started["runId"], Is.EqualTo(context.RunId));
                    Assert.That((string)started["type"], Is.EqualTo("run_started"));
                    Assert.That(started["elapsedSeconds"], Is.Not.Null);
                    Assert.That(started["ElapsedSeconds"], Is.Null);
                    Assert.That((string)finished["type"], Is.EqualTo("run_finished"));

                    var summary = JObject.Parse(File.ReadAllText(store.SummaryPath));
                    Assert.That((string)summary["finishReason"], Is.EqualTo("test"));
                    Assert.That((int)summary["lastSeq"], Is.EqualTo(2));
                    Assert.That((string)summary["build"]["target"], Is.EqualTo("unity"));
                }
            }
            finally
            {
                if (Directory.Exists(root)) Directory.Delete(root, true);
            }
        }

        static RunContext TestContext(string runId, uint seed) => new RunContext
        {
            RunId = runId,
            StartedAt = "2026-07-18T00:00:00Z",
            Build = TestBuild,
            Seed = seed,
        };
    }
}
