// ───────── 월드 리폼 프리뷰 — 에디터 전용 ─────────
// WorldPreview.unity 씬을 만들고 IslandBuilder로 섬을 생성해 저장한다.
// 플레이 없이 씬 뷰에서 확인 가능. 기존 게임 씬·코드에는 손대지 않는다.
// 메뉴: Tools/WorldReform/Rebuild Preview Island

using GodTD.Core;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace GodTD.WorldReform
{
    public static class WorldPreviewBuilder
    {
        const string SCENE_PATH = "Assets/WorldReform/WorldPreview.unity";
        const string KIT_ROOT = "Assets/AssetHunts!/GameDev Starter Kit - Platformer/Asset/";

        // 프리뷰 카메라 — 하이앵글 탑뷰 (사용자 확정: 75~80°)
        const float CAM_PITCH = 70f; // 78은 체감 수직에 가까워 70으로 (2026-07-19 피드백)
        const float CAM_YAW = 0f;    // 입/출구(북측)가 화면 12시에 수직으로 오도록
        const float CAM_FOV = 40f;
        const float CAM_DIST = 68f;  // 85에서 20% 근접

        static readonly Color SKY = new Color(0.427f, 0.702f, 0.910f); // #6db3e8 — 하늘

        static GameObject LoadKitPrefab(string key)
        {
            var go = AssetDatabase.LoadAssetAtPath<GameObject>(KIT_ROOT + key + ".prefab");
            if (go == null) Debug.LogWarning($"[WorldReform] 프리팹 없음: {key}");
            return go;
        }

        [MenuItem("Tools/WorldReform/Rebuild Preview Island")]
        public static void Rebuild()
        {
            var scene = SceneManager.GetActiveScene();
            bool isPreview = scene.path == SCENE_PATH;
            if (!isPreview)
            {
                if (!EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo()) return;
                scene = System.IO.File.Exists(SCENE_PATH)
                    ? EditorSceneManager.OpenScene(SCENE_PATH)
                    : EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            }

            // 이전 생성물 제거 (전부 코드 생성이므로 루트째 지우고 다시)
            foreach (var root in scene.GetRootGameObjects()) Object.DestroyImmediate(root);

            BuildEnvironment();
            var islandRoot = new GameObject("Island").transform;
            IslandBuilder.Build(islandRoot, LoadKitPrefab);

            EditorSceneManager.SaveScene(scene, SCENE_PATH);
            Debug.Log($"[WorldReform] 프리뷰 재생성 완료 → {SCENE_PATH}");
        }

        static void BuildEnvironment()
        {
            var focus = IslandBuilder.W(MapData.CENTER.X, MapData.CENTER.Y);

            var camGo = new GameObject("Preview Camera");
            var cam = camGo.AddComponent<Camera>();
            cam.tag = "MainCamera";
            cam.fieldOfView = CAM_FOV;
            cam.nearClipPlane = 1f;
            cam.farClipPlane = 300f;
            cam.clearFlags = CameraClearFlags.SolidColor;
            cam.backgroundColor = SKY;
            var rot = Quaternion.Euler(CAM_PITCH, CAM_YAW, 0f);
            camGo.transform.SetPositionAndRotation(focus - rot * Vector3.forward * CAM_DIST, rot);

            var sun = new GameObject("Sun").AddComponent<Light>();
            sun.type = LightType.Directional;
            sun.transform.rotation = Quaternion.Euler(45f, -40f, 0f);
            sun.intensity = 0.95f;
            sun.shadows = LightShadows.Soft;
            sun.shadowStrength = 0.45f;

            var fill = new GameObject("Fill").AddComponent<Light>();
            fill.type = LightType.Directional;
            fill.transform.rotation = Quaternion.Euler(340f, 140f, 0f);
            fill.intensity = 0.15f;
            fill.shadows = LightShadows.None;

            RenderSettings.ambientMode = UnityEngine.Rendering.AmbientMode.Flat;
            RenderSettings.ambientLight = new Color(0.48f, 0.50f, 0.54f); // 팔레트가 밝아 앰비언트는 절제 (과노출 방지)
        }
    }
}
