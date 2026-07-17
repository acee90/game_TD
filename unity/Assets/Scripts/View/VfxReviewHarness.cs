#if UNITY_EDITOR
// Unity MCP용 전투 VFX 자동 검수 하네스.
// 실제 GameView와 GameViewFx를 사용하되 Core 판정/밸런스는 수정하지 않는다.

using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using GodTD.Core;
using UnityEngine;

namespace GodTD.View
{
    public enum VfxReviewMode
    {
        FullLegacy,
        CodeOnly,
    }

    public enum VfxReviewScenario
    {
        BasicHit,
        Splash,
        Merge,
        GodMerge,
        BossDeath,
        Crowd,
    }

    /// <summary>
    /// Play Mode에서 실제 보드를 결정적 검수 상태로 만들고 동일 카메라로 캡처한다.
    /// Unity MCP execute_code에서 StartBaselineBatch/Status를 호출하는 것이 기본 진입점이다.
    /// </summary>
    public sealed class VfxReviewHarness : MonoBehaviour
    {
        const float PREPARE_DELAY = 0.35f;
        const float CAPTURE_FLUSH_DELAY = 0.12f;

        static readonly VfxReviewMode[] BaselineModes =
        {
            VfxReviewMode.FullLegacy,
            VfxReviewMode.CodeOnly,
        };

        static readonly VfxReviewScenario[] BaselineScenarios =
        {
            VfxReviewScenario.BasicHit,
            VfxReviewScenario.Splash,
            VfxReviewScenario.Merge,
            VfxReviewScenario.GodMerge,
            VfxReviewScenario.BossDeath,
            VfxReviewScenario.Crowd,
        };

        GameView view;
        Coroutine running;
        string label = "VFX REVIEW READY";
        string outputDirectory;
        int captureIndex;
        int totalCaptures;

        public bool IsRunning => running != null;
        public string OutputDirectory => outputDirectory;

        public static VfxReviewHarness Ensure()
        {
            if (!Application.isPlaying)
                throw new InvalidOperationException("VFX review requires Play Mode.");

            var gameView = FindObjectOfType<GameView>();
            if (gameView == null)
                throw new InvalidOperationException("GameView is not ready. Wait for Bootstrap after entering Play Mode.");

            var harness = gameView.GetComponent<VfxReviewHarness>();
            if (harness == null) harness = gameView.gameObject.AddComponent<VfxReviewHarness>();
            harness.view = gameView;
            return harness;
        }

        public static string StartBaselineBatch(string runId = null)
        {
            var harness = Ensure();
            if (harness.running != null) return $"already running: {harness.outputDirectory}";

            string safeId = string.IsNullOrWhiteSpace(runId)
                ? DateTime.Now.ToString("yyyyMMdd-HHmmss")
                : Sanitize(runId);
            harness.outputDirectory = Path.Combine(
                Directory.GetParent(Application.dataPath).FullName,
                "Captures", "VfxReview", safeId);
            Directory.CreateDirectory(harness.outputDirectory);
            harness.captureIndex = 0;
            harness.totalCaptures = BaselineModes.Length * BaselineScenarios.Length * 3;
            harness.running = harness.StartCoroutine(harness.RunBaselineBatch());
            return harness.outputDirectory;
        }

        public static string Status()
        {
            var harness = FindObjectOfType<VfxReviewHarness>();
            if (harness == null) return "not attached";
            return harness.IsRunning
                ? $"running {harness.captureIndex}/{harness.totalCaptures}: {harness.label} -> {harness.outputDirectory}"
                : $"complete: {harness.outputDirectory}";
        }

        public static void StopBatch()
        {
            var harness = FindObjectOfType<VfxReviewHarness>();
            if (harness == null || harness.running == null) return;
            harness.StopCoroutine(harness.running);
            harness.running = null;
            harness.RestoreDefaults();
            harness.label = "VFX REVIEW STOPPED";
        }

        static string Sanitize(string value)
        {
            foreach (char invalid in Path.GetInvalidFileNameChars())
                value = value.Replace(invalid, '-');
            return value.Replace(' ', '-');
        }

        IEnumerator RunBaselineBatch()
        {
            Debug.Log($"[VFX Review] Baseline batch started: {outputDirectory}");
            yield return new WaitForSecondsRealtime(0.5f); // Bootstrap/카메라 첫 프레임 안정화

            foreach (var mode in BaselineModes)
            {
                foreach (var scenario in BaselineScenarios)
                {
                    Prepare(mode, scenario);
                    label = $"{mode} / {scenario} / PRE";
                    yield return new WaitForSecondsRealtime(PREPARE_DELAY);
                    yield return Capture(mode, scenario, "pre");

                    Trigger(scenario);
                    label = $"{mode} / {scenario} / PEAK";
                    yield return new WaitForSecondsRealtime(PeakDelay(scenario));
                    yield return Capture(mode, scenario, "peak");

                    label = $"{mode} / {scenario} / SETTLE";
                    yield return new WaitForSecondsRealtime(SettleDelay(scenario));
                    yield return Capture(mode, scenario, "settle");
                }
            }

            RestoreDefaults();
            label = $"VFX REVIEW COMPLETE ({totalCaptures} captures)";
            Debug.Log($"[VFX Review] Complete: {outputDirectory}");
            running = null;
        }

        void Prepare(VfxReviewMode mode, VfxReviewScenario scenario)
        {
            Time.timeScale = 1f;
            view.Restart();
            view.Fx.ImportedFxEnabled = mode == VfxReviewMode.FullLegacy;

            var game = view.Game;
            game.RoundTimer = 9999f;
            game.Mineral = 999999;
            game.Gas = 999999;
            game.Hero.AttackCooldown = 9999f;
            game.Message = $"VFX REVIEW · {mode} · {scenario}";

            switch (scenario)
            {
                case VfxReviewScenario.BasicHit:
                case VfxReviewScenario.Splash:
                    PlaceTower(18, 1, 2);
                    AddMob(ReviewDistance(18, 72f), false);
                    break;
                case VfxReviewScenario.Merge:
                    PlaceTower(18, 0, 0);
                    break;
                case VfxReviewScenario.GodMerge:
                    PlaceTower(18, 3, 3);
                    break;
                case VfxReviewScenario.BossDeath:
                    AddMob(MapData.ALTAR_PATH_DISTANCE + 80f, true);
                    break;
                case VfxReviewScenario.Crowd:
                    PrepareCrowd();
                    break;
            }
        }

        void Trigger(VfxReviewScenario scenario)
        {
            switch (scenario)
            {
                case VfxReviewScenario.BasicHit:
                    InjectShot(18, view.Game.Enemies[0].Distance, "#4ea3ff", 0f);
                    break;
                case VfxReviewScenario.Splash:
                {
                    var p = MapData.PathPos(view.Game.Enemies[0].Distance);
                    view.Game.Shots.Add(new Shot
                    {
                        X = p.X,
                        Y = p.Y,
                        Tx = p.X,
                        Ty = p.Y,
                        Life = 1f,
                        Color = "#ff8a3c",
                        SplashRadius = 65f,
                    });
                    break;
                }
                case VfxReviewScenario.Merge:
                    view.Game.Slots[18].Tower = new Tower(Units.TIER_POOLS[1][2], 1, 9999f);
                    break;
                case VfxReviewScenario.GodMerge:
                    view.Game.Slots[18].Tower = new Tower(Units.GOD_POOL_EARLY[2], Units.GOD_TIER, 9999f);
                    break;
                case VfxReviewScenario.BossDeath:
                {
                    var boss = view.Game.Enemies[0];
                    boss.Hp = 0f;
                    view.Game.Enemies.Remove(boss);
                    break;
                }
                case VfxReviewScenario.Crowd:
                    TriggerCrowd();
                    break;
            }
        }

        void PrepareCrowd()
        {
            int[] towerSlots = { 4, 8, 12, 16, 18, 22, 28, 34 };
            for (int i = 0; i < towerSlots.Length; i++)
                PlaceTower(towerSlots[i], i % 4, i);

            float start = Math.Max(0f, MapData.ALTAR_PATH_DISTANCE - 190f);
            for (int i = 0; i < 24; i++)
            {
                var enemy = AddMob(start + i * 15f, false);
                enemy.Lane = i % 2 == 0 ? -1 : 1;
            }
        }

        void TriggerCrowd()
        {
            int[] towerSlots = { 4, 8, 12, 16, 18, 22, 28, 34 };
            string[] colors = { "#4ea3ff", "#c065e0", "#ffd23f", "#6fdc8c" };
            for (int i = 0; i < 24; i++)
            {
                int towerSlot = towerSlots[i % towerSlots.Length];
                float splash = i % 5 == 0 ? 55f : 0f;
                InjectShot(towerSlot, view.Game.Enemies[i].Distance, colors[i % colors.Length], splash);
            }
        }

        void PlaceTower(int slotIndex, int tier, int defIndex)
        {
            tier = Mathf.Clamp(tier, 0, Units.GOD_TIER);
            UnitDef def;
            if (tier == Units.GOD_TIER)
                def = Units.GOD_POOL_EARLY[Math.Abs(defIndex) % Units.GOD_POOL_EARLY.Length];
            else
            {
                var pool = Units.TIER_POOLS[tier];
                def = pool[Math.Abs(defIndex) % pool.Length];
            }
            view.Game.Slots[slotIndex].Tower = new Tower(def, tier, 9999f);
        }

        Enemy AddMob(float distance, bool boss)
        {
            distance = Mathf.Clamp(distance, 0f, MapData.PATH_LENGTH - 1f);
            var spec = new EnemySpec(
                boss ? EnemyKind.Boss : EnemyKind.Mob,
                boss ? "VFX Review Boss" : "VFX Review Mob",
                maxHp: 1000000f,
                armor: 0f,
                speed: 0f,
                radius: boss ? 18f : 9f,
                bossLevel: boss ? 6 : 0);
            var enemy = new Enemy(spec) { Distance = distance };
            view.Game.Enemies.Add(enemy);
            return enemy;
        }

        float ReviewDistance(int slotIndex, float forwardOffset)
        {
            var slot = view.Game.Slots[slotIndex];
            float baseDistance = MapData.NearestPathDistance(slot.X, slot.Y);
            return Mathf.Clamp(baseDistance + forwardOffset, 0f, MapData.PATH_LENGTH - 1f);
        }

        void InjectShot(int slotIndex, float targetDistance, string color, float splashRadius)
        {
            var slot = view.Game.Slots[slotIndex];
            var target = MapData.PathPos(targetDistance);
            view.Game.Shots.Add(new Shot
            {
                X = slot.X,
                Y = slot.Y,
                Tx = target.X,
                Ty = target.Y,
                Life = 1f,
                Color = color,
                SplashRadius = splashRadius,
            });
        }

        IEnumerator Capture(VfxReviewMode mode, VfxReviewScenario scenario, string phase)
        {
            yield return new WaitForEndOfFrame();
            string file = $"{captureIndex + 1:00}-{mode.ToString().ToLowerInvariant()}-" +
                          $"{scenario.ToString().ToLowerInvariant()}-{phase}.png";
            string path = Path.Combine(outputDirectory, file);
            ScreenCapture.CaptureScreenshot(path, 1);
            captureIndex++;
            Debug.Log($"[VFX Review] {captureIndex}/{totalCaptures} {file}");
            yield return new WaitForSecondsRealtime(CAPTURE_FLUSH_DELAY);
        }

        static float PeakDelay(VfxReviewScenario scenario)
        {
            switch (scenario)
            {
                case VfxReviewScenario.BasicHit: return 0.22f;
                case VfxReviewScenario.Crowd: return 0.18f;
                default: return 0.06f;
            }
        }

        static float SettleDelay(VfxReviewScenario scenario)
        {
            switch (scenario)
            {
                case VfxReviewScenario.GodMerge:
                case VfxReviewScenario.BossDeath: return 0.4f;
                default: return 0.28f;
            }
        }

        void RestoreDefaults()
        {
            Time.timeScale = 1f;
            if (view != null && view.Fx != null) view.Fx.ImportedFxEnabled = true;
        }

        void OnDestroy()
        {
            RestoreDefaults();
        }

        void OnGUI()
        {
            var oldColor = GUI.color;
            GUI.color = new Color(0.02f, 0.03f, 0.05f, 0.92f);
            GUI.Box(new Rect(12f, 46f, 360f, 54f), GUIContent.none);
            GUI.color = Color.white;
            var style = new GUIStyle(GUI.skin.label)
            {
                fontSize = 14,
                fontStyle = FontStyle.Bold,
                alignment = TextAnchor.MiddleLeft,
                normal = { textColor = Color.white },
            };
            GUI.Label(new Rect(24f, 52f, 340f, 42f), label, style);
            GUI.color = oldColor;
        }
    }
}
#endif
