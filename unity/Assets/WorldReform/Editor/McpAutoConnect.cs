// ───────── 임시: MCP 브리지 자동 시작 ─────────
// MCPForUnity의 AutoStartOnLoad가 이 세션에서 동작하지 않아, 도메인 리로드마다
// HTTP 브리지를 강제 기동한다. 월드 리폼 작업이 끝나면 삭제해도 된다.

using MCPForUnity.Editor.Services;
using MCPForUnity.Editor.Services.Transport;
using UnityEditor;
using UnityEngine;

namespace GodTD.WorldReform
{
    [InitializeOnLoad]
    static class McpAutoConnect
    {
        static McpAutoConnect()
        {
            EditorApplication.delayCall += TryStart;
        }

        static async void TryStart()
        {
            try
            {
                var tm = MCPServiceLocator.TransportManager;
                if (tm.IsRunning(TransportMode.Http))
                {
                    Debug.Log("[WorldReform] MCP HTTP bridge already running");
                    return;
                }
                bool ok = await tm.StartAsync(TransportMode.Http);
                Debug.Log($"[WorldReform] MCP HTTP bridge start → {ok}");
            }
            catch (System.Exception ex)
            {
                Debug.LogWarning($"[WorldReform] MCP bridge start failed: {ex.Message}");
            }
        }
    }
}
