// 원본: web/src/main.ts (부트스트랩 부분)
// ───────── 진입점 ─────────
// 씬에 아무것도 없어도 Play만 누르면 게임이 뜬다.
// RuntimeInitializeOnLoadMethod가 빈 씬 로드 직후 뷰를 조립한다 — 에셋·프리팹 없음.

using UnityEngine;

namespace GodTD.View
{
    public static class Bootstrap
    {
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void Boot()
        {
            if (Object.FindObjectOfType<GameView>() != null) return;

            var root = new GameObject("GodTD");
            root.AddComponent<GameView>();
            root.AddComponent<GameHud>();
        }
    }
}
