// ───────── HUD 디자인 토큰 + 런타임 에셋 팩토리 ─────────
// uGUI 이관(HUD 재설계 §3)의 기반층. 스프라이트와 TMP 폰트를 전부 코드에서 생성한다 —
// 커밋 에셋은 폰트 .ttf 하나뿐이다.
//
// 시각 언어(2026-07-16 개정): '중세 전장 장비'.
// 검게 그을린 철판, 짙은 목재, 황동 테두리와 양피지색 문자를 기본 재질로 쓴다.
// 모서리는 방패·금속판처럼 45°로 깎고, 네온·유리·스캔라인 표현은 사용하지 않는다.

using System.Collections.Generic;
using TMPro;
using UnityEngine;

namespace GodTD.View
{
    public static class UiTheme
    {
        // ── 황동 크롬 — HUD 프레임 전용 ──
        public static readonly Color Accent = Hex("#C6A15B");
        public static readonly Color AccentLine = Hex("#C6A15B", 0.62f);
        public static readonly Color AccentGlow = Hex("#D6B56E", 0.09f);

        // ── 그을린 철판·목재 소켓 ──
        public static readonly Color PanelBg = Hex("#17140F", 0.94f);
        public static readonly Color PanelStroke = Hex("#B58B4A", 0.62f);
        public static readonly Color SocketBg = Hex("#241B12", 0.78f);

        public static readonly Color SlotStroke = Hex("#68543A", 0.78f);

        public static readonly Color CardBg = Hex("#2A2117", 0.96f);
        public static readonly Color CardHover = Hex("#493820", 0.98f);
        public static readonly Color CardPress = Hex("#120F0B", 1f);
        public static readonly Color CardDisabled = Hex("#17130F", 0.82f);

        public static readonly Color TextMain = Hex("#F2E4C4");
        public static readonly Color TextDim = Hex("#B9A98B");
        public static readonly Color TextFaint = Hex("#756A58");

        // 계열색 — 게임 전역과 동일한 의미론
        public static readonly Color Gold = Hex("#D9B55F");
        public static readonly Color Mineral = Hex("#B7D1D8");
        public static readonly Color Gas = Hex("#85A875");
        public static readonly Color HeroCol = Hex("#6F8DA8");
        public static readonly Color Danger = Hex("#A94832");
        public static readonly Color Build = Hex("#8A7655");

        // ── 타입 스케일 ── (게임 스케일: 웹보다 한 단계 크고 굵다)
        public const float FontTitle = 28f;
        public const float FontLabel = 16f;
        public const float FontSmall = 14f;
        public const float FontCaption = 11.5f;
        public const float FontStatBig   = 21f; // 1순위(생명·금화·마정석·다음공세)
        public const float FontStatSmall = 12f; // 3순위(점수·킬·프로브)
        public const float FontEyebrow   = 10.5f;

        // ── 리듬 ──
        public const float Pad = 11f;
        public const float Gap = 6f;

        // ── 형태 — 모서리 절단량(px). 라운드 반경이 아니다 ──
        public const int CutPanel = 13;
        public const int CutButton = 7;

        // 하위 호환 별칭 (기존 호출부가 반경으로 넘기던 값)
        public const float RadiusPanel = CutPanel;
        public const float RadiusButton = CutButton;

        public static Color Hex(string hex, float alpha = 1f)
        {
            if (!ColorUtility.TryParseHtmlString(hex, out var c)) c = Color.magenta;
            c.a = alpha;
            return c;
        }

        // ── TMP 폰트 ──
        // 숫자는 좁고 굵은 Rajdhani, 한글은 Pretendard로 읽기 쉬운 전장 계기판을 만든다.
        static TMP_FontAsset font;

        public static TMP_FontAsset Font
        {
            get
            {
                if (font != null) return font;

                var display = Resources.Load<Font>("Fonts/Rajdhani-SemiBold");
                if (display != null) font = TMP_FontAsset.CreateFontAsset(display);

                var korean = Resources.Load<Font>("Fonts/PretendardKR");
                var koreanAsset = korean != null ? TMP_FontAsset.CreateFontAsset(korean) : null;

                if (font == null) font = koreanAsset;                 // Rajdhani가 없으면 한글체만으로
                else if (koreanAsset != null)
                    font.fallbackFontAssetTable = new List<TMP_FontAsset> { koreanAsset };

                if (font == null) font = TMP_Settings.defaultFontAsset; // 최후 폴백 — 한글은 깨진다
                return font;
            }
        }

        // ───────── 스프라이트 팩토리 ─────────
        // 모든 판은 '모서리 깎인 사각형'의 부호 거리장(d)에서 파생된다.
        //   d = 경계까지의 거리(px). 안쪽이 양수.
        // 같은 d로 실루엣·테두리·내부발광을 전부 굽기 때문에 셋이 정확히 겹친다.

        /// <summary>모서리 깎인 사각형의 경계까지 거리. cut=0이면 그냥 사각형.</summary>
        static float ChamferDist(int x, int y, int size, float cut)
        {
            float lx = Mathf.Min(x, size - 1 - x); // 좌/우 중 가까운 변까지
            float ly = Mathf.Min(y, size - 1 - y); // 상/하 중 가까운 변까지
            float diag = (lx + ly - cut) * 0.70710678f; // 45° 절단면까지의 수직 거리
            return Mathf.Min(Mathf.Min(lx, ly), diag);
        }

        static Sprite Bake(Texture2D tex, int border)
        {
            tex.wrapMode = TextureWrapMode.Clamp;
            tex.filterMode = FilterMode.Bilinear;
            tex.Apply();
            int size = tex.width;
            return Sprite.Create(tex, new Rect(0, 0, size, size), new Vector2(0.5f, 0.5f), 100f, 0,
                SpriteMeshType.FullRect, new Vector4(border, border, border, border));
        }

        static readonly Dictionary<(int cut, int stroke), Sprite> chamfers =
            new Dictionary<(int, int), Sprite>();

        /// <summary>
        /// 모서리 깎인 흰 사각형 9-slice. stroke&gt;0이면 실루엣이 아니라 그 굵기의 테두리 링만 남는다
        /// (같은 cut의 채움과 픽셀 단위로 정렬된다).
        /// </summary>
        public static Sprite Chamfer(int cut, int stroke = 0)
        {
            var key = (cut, stroke);
            if (chamfers.TryGetValue(key, out var cached)) return cached;

            int pad = cut + 4;
            int size = pad * 2 + 4; // 중앙 4px가 늘어나는 영역
            var tex = new Texture2D(size, size, TextureFormat.RGBA32, false);

            for (int y = 0; y < size; y++)
            for (int x = 0; x < size; x++)
            {
                float d = ChamferDist(x, y, size, cut);
                float a = Mathf.Clamp01(d + 0.5f);
                if (stroke > 0) a -= Mathf.Clamp01(d - stroke + 0.5f); // 안쪽을 파내 링만 남김
                tex.SetPixel(x, y, new Color(1f, 1f, 1f, Mathf.Clamp01(a)));
            }

            var sprite = Bake(tex, pad);
            chamfers[key] = sprite;
            return sprite;
        }

        static readonly Dictionary<(int cut, int depth), Sprite> glows =
            new Dictionary<(int, int), Sprite>();

        /// <summary>
        /// 내부 발광 — 가장자리에서 depth px 안쪽으로 사그라드는 빛. 유리판에 두께감을 준다.
        /// (CSS box-shadow가 바깥으로 번지는 것과 정반대. 게임 HUD는 안쪽이 빛난다.)
        /// </summary>
        public static Sprite InnerGlow(int cut, int depth)
        {
            var key = (cut, depth);
            if (glows.TryGetValue(key, out var cached)) return cached;

            int pad = cut + depth + 4;
            int size = pad * 2 + 4;
            var tex = new Texture2D(size, size, TextureFormat.RGBA32, false);

            for (int y = 0; y < size; y++)
            for (int x = 0; x < size; x++)
            {
                float d = ChamferDist(x, y, size, cut);
                float inside = Mathf.Clamp01(d + 0.5f);            // 실루엣 밖은 0
                float t = Mathf.Clamp01(1f - d / depth);           // 가장자리 1 → 안쪽 0
                tex.SetPixel(x, y, new Color(1f, 1f, 1f, inside * t * t));
            }

            var sprite = Bake(tex, pad);
            glows[key] = sprite;
            return sprite;
        }

        static Sprite scanlines;

        /// <summary>
        /// 스캔라인 — 3px 주기 가로줄. 패널 위에 아주 옅게 깔아 '유리 표면' 질감을 만든다.
        /// 64px 타일이라 Image.Type.Tiled로 깔아도 쿼드가 몇 장 안 나온다.
        /// </summary>
        public static Sprite Scanlines()
        {
            if (scanlines != null) return scanlines;
            const int size = 64; // 3의 배수가 아니라 이음매가 생기지만 알파 0.03에선 안 읽힌다
            var tex = new Texture2D(size, size, TextureFormat.RGBA32, false);
            for (int y = 0; y < size; y++)
            for (int x = 0; x < size; x++)
                tex.SetPixel(x, y, new Color(1f, 1f, 1f, y % 3 == 0 ? 1f : 0f));
            tex.wrapMode = TextureWrapMode.Repeat; // 타일링 — Bake()의 Clamp를 쓰면 안 된다
            tex.filterMode = FilterMode.Point;
            tex.Apply();
            scanlines = Sprite.Create(tex, new Rect(0, 0, size, size), new Vector2(0.5f, 0.5f), 100f, 0,
                SpriteMeshType.FullRect);
            return scanlines;
        }

        // ── 둥근 사각 — 게이지·핫키 칩처럼 작아서 절단이 안 읽히는 요소에만 남긴다 ──
        static readonly Dictionary<int, Sprite> rounded = new Dictionary<int, Sprite>();

        public static Sprite Rounded(int radius, int stroke = 0)
        {
            if (stroke > 0) return Chamfer(radius, stroke); // 옛 호출부 흡수
            if (rounded.TryGetValue(radius, out var cached)) return cached;

            int size = radius * 2 + 8;
            var tex = new Texture2D(size, size, TextureFormat.RGBA32, false);
            float r = radius;
            for (int y = 0; y < size; y++)
            for (int x = 0; x < size; x++)
            {
                float dx = Mathf.Max(0, Mathf.Max(r - x, x - (size - 1 - r)));
                float dy = Mathf.Max(0, Mathf.Max(r - y, y - (size - 1 - r)));
                float dist = Mathf.Sqrt(dx * dx + dy * dy);
                tex.SetPixel(x, y, new Color(1f, 1f, 1f, Mathf.Clamp01(r - dist + 0.5f)));
            }
            var sprite = Bake(tex, radius + 2);
            rounded[radius] = sprite;
            return sprite;
        }

        /// <summary>패널 뒤에 까는 부드러운 검은 그림자 — 보드에서 판을 떼어놓는다.</summary>
        static Sprite shadowSprite;

        public static Sprite Shadow()
        {
            if (shadowSprite != null) return shadowSprite;
            const int R = 18;
            int size = R * 2 + 8;
            var tex = new Texture2D(size, size, TextureFormat.RGBA32, false);
            for (int y = 0; y < size; y++)
            for (int x = 0; x < size; x++)
            {
                float dx = Mathf.Max(0, Mathf.Max(R - x, x - (size - 1 - R)));
                float dy = Mathf.Max(0, Mathf.Max(R - y, y - (size - 1 - R)));
                float dist = Mathf.Sqrt(dx * dx + dy * dy);
                float a = Mathf.Clamp01(1f - dist / R);
                tex.SetPixel(x, y, new Color(0f, 0f, 0f, a * a * 0.85f));
            }
            shadowSprite = Bake(tex, R + 2);
            return shadowSprite;
        }
    }
}
