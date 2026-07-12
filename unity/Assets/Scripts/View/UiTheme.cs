// ───────── HUD 디자인 토큰 + 런타임 에셋 팩토리 ─────────
// uGUI 이관(HUD 재설계 §3)의 기반층. 스프라이트와 TMP 폰트를 전부 코드에서 생성한다 —
// 커밋 에셋은 폰트 .ttf 하나뿐이다.
//
// 시각 언어(2026-07-12 개정): '모던 다크 + 테크 액센트'.
// 웹 카드 UI의 흔적(둥근 사각형·플랫 필·1px 헤어라인)을 걷어내고 게임 HUD의 어휘로 바꾼다.
//   - 형태: 라운드 사각형이 아니라 모서리를 45°로 깎은(chamfer) 판.
//   - 재질: 불투명 필이 아니라 월드가 비치는 반투명 유리 + 가장자리 내부 발광 + 스캔라인.
//   - 색: 청록 시그니처 하나가 HUD 크롬(테두리·발광·핫키)을 지배한다.
//         계열색(미네랄·가스·영웅·금)은 크롬이 아니라 '의미'에만 쓴다.

using System.Collections.Generic;
using TMPro;
using UnityEngine;

namespace GodTD.View
{
    public static class UiTheme
    {
        // ── 시그니처 — HUD 크롬 전용. 게임 의미론에는 쓰지 않는다 ──
        public static readonly Color Accent = Hex("#42E8D5");
        public static readonly Color AccentLine = Hex("#42E8D5", 0.45f);
        public static readonly Color AccentGlow = Hex("#42E8D5", 0.13f);

        // ── 유리 재질 ──
        // 알파를 0.8 언저리로 낮춰 보드가 비친다 — '떠 있는 div'가 아니라 '유리판'이 된다.
        public static readonly Color PanelBg = Hex("#060D19", 0.82f);
        public static readonly Color PanelStroke = Hex("#42E8D5", 0.22f);
        public static readonly Color SocketBg = Hex("#0A1424", 0.45f);

        // 슬롯 테두리 — 커맨드 버튼 9칸까지 청록으로 두르면 네온이 과해진다.
        // 쉴 때는 중립 남색, hover에서만 액센트로 타오른다.
        public static readonly Color SlotStroke = Hex("#31435F", 0.60f);

        public static readonly Color CardBg = Hex("#0E1B2F", 0.78f);
        public static readonly Color CardHover = Hex("#1A3D57", 0.92f);
        public static readonly Color CardPress = Hex("#061019", 0.95f);
        public static readonly Color CardDisabled = Hex("#080F1B", 0.55f);

        public static readonly Color TextMain = Hex("#EAF2FA");
        public static readonly Color TextDim = Hex("#8FA3BE");
        public static readonly Color TextFaint = Hex("#556687");

        // 계열색 — 게임 전역과 동일한 의미론
        public static readonly Color Gold = Hex("#FFD23F");
        public static readonly Color Mineral = Hex("#8FD6FF");
        public static readonly Color Gas = Hex("#6FDC8C");
        public static readonly Color HeroCol = Hex("#B08CFF");
        public static readonly Color Danger = Hex("#FF5A3C");
        public static readonly Color Build = Hex("#4EA3FF");

        // ── 타입 스케일 ── (게임 스케일: 웹보다 한 단계 크고 굵다)
        public const float FontTitle = 28f;
        public const float FontLabel = 16f;
        public const float FontSmall = 14f;
        public const float FontCaption = 11.5f;

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
        // Rajdhani(OFL)가 주 폰트다 — 좁고 각진 테크 디스플레이체. 숫자가 HUD의 주인공인데
        // 웹 본문 산세리프로 찍으면 대시보드로 읽힌다. 한글 글리프는 없으므로
        // Pretendard를 폴백으로 달아 자동으로 넘긴다 (숫자·영문=Rajdhani, 한글=Pretendard).
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
