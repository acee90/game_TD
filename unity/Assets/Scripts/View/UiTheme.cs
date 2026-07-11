// ───────── HUD 디자인 토큰 + 런타임 에셋 팩토리 ─────────
// uGUI 이관(HUD 재설계 §3)의 기반층. 스프라이트(둥근 사각 9-slice)와 TMP 폰트를
// 전부 코드에서 생성한다 — 커밋 에셋은 폰트 .ttf 하나뿐이다.
//
// 시각 언어: 월드와 같은 딥네이비 + 계열색 액센트. 패널은 스트로크가 있는
// 반투명 카드, 버튼은 hover/press 상태색을 가진다.

using System.Collections.Generic;
using TMPro;
using UnityEngine;

namespace GodTD.View
{
    public static class UiTheme
    {
        // ── 색 토큰 ──
        public static readonly Color PanelBg = Hex("#0D1322", 0.94f);
        public static readonly Color PanelStroke = Hex("#2A3554");
        public static readonly Color CardBg = Hex("#16203A");
        public static readonly Color CardHover = Hex("#1F2D50");
        public static readonly Color CardPress = Hex("#0F1728");
        public static readonly Color CardDisabled = Hex("#101627", 0.85f);

        public static readonly Color TextMain = Hex("#E8ECF6");
        public static readonly Color TextDim = Hex("#8A93AD");
        public static readonly Color TextFaint = Hex("#5A6480");

        // 계열색 — 게임 전역과 동일한 의미론
        public static readonly Color Gold = Hex("#FFD23F");
        public static readonly Color Mineral = Hex("#8FD6FF");
        public static readonly Color Gas = Hex("#6FDC8C");
        public static readonly Color HeroCol = Hex("#B08CFF");
        public static readonly Color Danger = Hex("#FF5A3C");
        public static readonly Color Build = Hex("#4EA3FF");

        // ── 타입 스케일 ──
        public const float FontTitle = 24f;
        public const float FontLabel = 15f;
        public const float FontSmall = 12.5f;
        public const float FontCaption = 10.5f;

        // ── 리듬 ──
        public const float Pad = 10f;
        public const float Gap = 6f;
        public const float RadiusPanel = 10f;
        public const float RadiusButton = 8f;

        public static Color Hex(string hex, float alpha = 1f)
        {
            if (!ColorUtility.TryParseHtmlString(hex, out var c)) c = Color.magenta;
            c.a = alpha;
            return c;
        }

        // ── TMP 폰트 — 커밋된 Pretendard를 동적 아틀라스로 ──
        static TMP_FontAsset font;

        public static TMP_FontAsset Font
        {
            get
            {
                if (font != null) return font;
                var ttf = Resources.Load<Font>("Fonts/PretendardKR");
                if (ttf != null) font = TMP_FontAsset.CreateFontAsset(ttf);
                if (font == null) font = TMP_Settings.defaultFontAsset; // 폴백 — 한글은 깨진다
                return font;
            }
        }

        // ── 스프라이트 팩토리 — 둥근 사각 9-slice를 코드로 굽는다 ──
        static readonly Dictionary<(int radius, int stroke), Sprite> rounded =
            new Dictionary<(int, int), Sprite>();

        /// <summary>radius(px) 모서리의 흰색 둥근 사각. stroke>0이면 테두리만 불투명, 안은 살짝 옅게.</summary>
        public static Sprite Rounded(int radius, int stroke = 0)
        {
            var key = (radius, stroke);
            if (rounded.TryGetValue(key, out var cached)) return cached;

            int size = radius * 2 + 8; // 중앙 4px가 늘어나는 영역
            var tex = new Texture2D(size, size, TextureFormat.RGBA32, false);
            tex.wrapMode = TextureWrapMode.Clamp;
            float r = radius;

            for (int y = 0; y < size; y++)
            for (int x = 0; x < size; x++)
            {
                // 모서리 원 중심까지의 거리로 안/밖 판정 (1px 안티에일리어싱)
                float dx = Mathf.Max(0, Mathf.Max(r - x, x - (size - 1 - r)));
                float dy = Mathf.Max(0, Mathf.Max(r - y, y - (size - 1 - r)));
                float dist = Mathf.Sqrt(dx * dx + dy * dy);
                float alpha = Mathf.Clamp01(r - dist + 0.5f);

                if (stroke > 0)
                {
                    // 테두리 대역은 1, 내부는 0.55 — 스트로크 카드 느낌
                    float inner = Mathf.Clamp01(r - stroke - dist + 0.5f);
                    alpha = Mathf.Max(alpha - inner * 0.45f, 0f);
                }
                tex.SetPixel(x, y, new Color(1f, 1f, 1f, alpha));
            }
            tex.Apply();

            var border = new Vector4(radius + 2, radius + 2, radius + 2, radius + 2);
            var sprite = Sprite.Create(tex, new Rect(0, 0, size, size),
                new Vector2(0.5f, 0.5f), 100f, 0, SpriteMeshType.FullRect, border);
            rounded[key] = sprite;
            return sprite;
        }
    }
}
