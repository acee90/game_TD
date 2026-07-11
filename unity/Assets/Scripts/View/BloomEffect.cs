// ───────── 빌트인 RP Bloom (아트 계획 P3 — 의도된 임시방편) ─────────
// emissive가 '밝은 알베도'가 아니라 진짜 빛으로 보이게 한다. 감사가 지목한
// "싸구려 느낌"의 최대 원인 처방. URP 전환(P5) 시 Volume Bloom으로 대체되며,
// OnRenderImage는 SRP에서 호출되지 않으므로 이 파일은 그때 삭제된다.

using UnityEngine;

namespace GodTD.View
{
    [RequireComponent(typeof(Camera))]
    public sealed class BloomEffect : MonoBehaviour
    {
        [Range(0f, 2f)] public float Threshold = 0.85f;
        [Range(0f, 3f)] public float Intensity = 0.9f;

        Material mat;

        void OnRenderImage(RenderTexture source, RenderTexture destination)
        {
            if (mat == null)
            {
                var shader = Shader.Find("Hidden/GodTD/Bloom");
                if (shader == null)
                {
                    Graphics.Blit(source, destination);
                    return;
                }
                mat = new Material(shader);
            }

            mat.SetFloat("_Threshold", Threshold);
            mat.SetFloat("_Intensity", Intensity);

            // 1/4 해상도에서 추출·블러 — 저비용, 부드러운 번짐
            int w = source.width / 4, h = source.height / 4;
            var bright = RenderTexture.GetTemporary(w, h, 0, source.format);
            var blur = RenderTexture.GetTemporary(w, h, 0, source.format);

            Graphics.Blit(source, bright, mat, 0);   // 임계 추출
            Graphics.Blit(bright, blur, mat, 1);     // 가로 블러
            Graphics.Blit(blur, bright, mat, 2);     // 세로 블러
            Graphics.Blit(bright, blur, mat, 1);     // 2회전 — 더 넓은 번짐
            Graphics.Blit(blur, bright, mat, 2);

            mat.SetTexture("_BloomTex", bright);
            Graphics.Blit(source, destination, mat, 3); // 가산 합성

            RenderTexture.ReleaseTemporary(bright);
            RenderTexture.ReleaseTemporary(blur);
        }
    }
}
