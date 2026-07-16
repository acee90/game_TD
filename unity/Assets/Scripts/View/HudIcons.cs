// ───────── HUD 아이콘 — 코드로 굽는 벡터 글리프 ─────────
// 진단(2026-07-12): 프로토타입처럼 보이는 가장 큰 단일 원인은 '아이콘 부재'였다.
// 자원을 ◆●♥ 유니코드로 때우고 커맨드 카드 9칸이 텍스트 버튼이면, 아무리 색을 골라도
// 미완성으로 읽힌다. 아이콘 없는 HUD는 그냥 폼(form)이다.
//
// 그림 파일을 커밋하는 대신 부호거리장(SDF)으로 런타임에 굽는다:
//   - 해상도 독립적 — 64px로 구워 어떤 크기로 줄여도 안티에일리어싱이 깨끗하다.
//   - 팔레트 독립적 — 흰색으로 굽고 Image.color로 물들인다 (같은 아이콘, 다른 계열색).
//   - 에셋 파이프라인이 없다 — UiTheme의 판·테두리와 같은 방식이라 시각 언어가 어긋나지 않는다.
//
// 새 아이콘은 Draw()의 switch에 SDF 조합 한 줄을 더하면 된다.

using System.Collections.Generic;
using UnityEngine;

namespace GodTD.View
{
    public enum HudIcon
    {
        None = 0,
        // 자원 · 상태
        Mineral, Gas, Probe, Life, Kill, Score,
        // 커맨드
        Spawn, Boss, Xp, SkillDamage, Cooldown, Sell,
        // 종족 업그레이드 — 4칸이 가장 자주 눌린다. 같은 글리프 4개면 구분이 안 된다.
        RaceTerran, RaceZerg, RaceProtoss, RaceCreature,
        // 상태 표식 — 잠금(색 없이도 구분되는 형태 게이트)
        Lock,
    }

    public static class HudIcons
    {
        const int SIZE = 64; // 표시 크기(18~24px)보다 크게 구워 축소 시 선명하게

        static readonly Dictionary<HudIcon, Sprite> cache = new Dictionary<HudIcon, Sprite>();

        public static Sprite Get(HudIcon id)
        {
            if (id == HudIcon.None) return null;
            if (cache.TryGetValue(id, out var cached)) return cached;

            var tex = new Texture2D(SIZE, SIZE, TextureFormat.RGBA32, false)
            {
                wrapMode = TextureWrapMode.Clamp,
                filterMode = FilterMode.Bilinear,
            };

            for (int y = 0; y < SIZE; y++)
            for (int x = 0; x < SIZE; x++)
            {
                // 픽셀 중심을 [-1,1] 정규 좌표로 (y는 위가 +)
                var p = new Vector2(
                    (x + 0.5f) / SIZE * 2f - 1f,
                    (y + 0.5f) / SIZE * 2f - 1f);

                float d = Draw(id, p);                 // 부호거리 (정규 단위, 안쪽 음수)
                float dPix = d * (SIZE * 0.5f);        // 픽셀 단위로 환산
                float a = Mathf.Clamp01(0.5f - dPix);  // 경계에서 1px 안티에일리어싱
                tex.SetPixel(x, y, new Color(1f, 1f, 1f, a));
            }

            tex.Apply();
            var sprite = Sprite.Create(tex, new UnityEngine.Rect(0, 0, SIZE, SIZE),
                new Vector2(0.5f, 0.5f), 100f);
            cache[id] = sprite;
            return sprite;
        }

        // ───────── 아이콘 정의 — 전부 SDF 조합 ─────────

        static float Draw(HudIcon id, Vector2 p)
        {
            switch (id)
            {
                // 금화 — 세로로 깎인 결정. 가운데 면(facet)을 파내 입체로 읽힌다.
                case HudIcon.Mineral:
                    return Sub(
                        Poly(p, Crystal),
                        Seg(p, new Vector2(0f, 0.95f), new Vector2(0f, -0.95f), 0.055f));

                // 마정석 — 띠 두른 구체
                case HudIcon.Gas:
                    return Sub(Sub(
                            Circle(p, 0.82f),
                            Box(p - new Vector2(0f, 0.18f), new Vector2(1f, 0.055f))),
                        Box(p - new Vector2(0f, -0.28f), new Vector2(1f, 0.055f)));

                // 광부 — 육각 링 + 코어
                case HudIcon.Probe:
                    return Union(
                        Ring(Poly(p, Hexagon), 0.11f),
                        Circle(p, 0.24f));

                case HudIcon.Life:
                    return Poly(p, Shield);

                // 킬 — ×
                case HudIcon.Kill:
                    return Union(
                        Seg(p, new Vector2(-0.6f, -0.6f), new Vector2(0.6f, 0.6f), 0.14f),
                        Seg(p, new Vector2(-0.6f, 0.6f), new Vector2(0.6f, -0.6f), 0.14f));

                case HudIcon.Score:
                    return Poly(p, Star);

                // 유닛 생성 — +
                case HudIcon.Spawn:
                    return Union(
                        Box(p, new Vector2(0.66f, 0.16f)),
                        Box(p, new Vector2(0.16f, 0.66f)));

                case HudIcon.Boss:
                    return Poly(p, Crown);

                // XP 구매 — 위로 솟는 화살
                case HudIcon.Xp:
                    return Union(
                        Box(p - new Vector2(0f, -0.35f), new Vector2(0.16f, 0.45f)),
                        Poly(p, ArrowHead));

                case HudIcon.SkillDamage:
                    return Poly(p, Bolt);

                // 쿨타임 — 시계
                case HudIcon.Cooldown:
                    return Union(Union(
                            Ring(Circle(p, 0.82f), 0.12f),
                            Seg(p, Vector2.zero, new Vector2(0f, 0.48f), 0.10f)),
                        Seg(p, Vector2.zero, new Vector2(0.38f, 0f), 0.10f));

                // 판매 — 동전에서 빠져나오는 환급 화살
                case HudIcon.Sell:
                    return Union(Union(
                            Ring(Circle(p, 0.85f), 0.12f),
                            Box(p - new Vector2(0f, 0.2f), new Vector2(0.13f, 0.32f))),
                        Poly(p, ArrowDown));

                // ── 종족 — 네 칸이 한눈에 갈라져야 한다 ──
                case HudIcon.RaceTerran:  // 각진 프레임 + 코어
                    return Union(
                        Ring(Box(p, new Vector2(0.78f, 0.78f)), 0.12f),
                        Circle(p, 0.22f));

                case HudIcon.RaceZerg:    // 세 갈래 발톱
                    return Union(Union(
                            Poly(p, ClawL), Poly(p, ClawM)), Poly(p, ClawR));

                case HudIcon.RaceProtoss: // 마름모 링 + 코어
                    return Union(
                        Ring(Poly(p, Diamond), 0.12f),
                        Circle(p, 0.2f));

                case HudIcon.RaceCreature: // 세포 — 핵 + 위성
                    return Union(Union(Union(
                            Circle(p, 0.34f),
                            Circle(p - new Vector2(0f, 0.68f), 0.2f)),
                            Circle(p - new Vector2(-0.6f, -0.4f), 0.2f)),
                        Circle(p - new Vector2(0.6f, -0.4f), 0.2f));

                // 잠금 — 자물쇠(몸통 박스 + 위 고리 반원 근사)
                case HudIcon.Lock:
                    return Union(
                        Box(p - new Vector2(0f, -0.28f), new Vector2(0.5f, 0.34f)),   // 몸통
                        Ring(Circle(p - new Vector2(0f, 0.28f), 0.30f), 0.09f));      // 고리(위)

                default:
                    return 1f;
            }
        }

        // ───────── SDF 프리미티브 ─────────
        // 안쪽이 음수. 합집합=min, 차집합=max(-a, b), 링=|d|-t.

        static float Union(float a, float b) => Mathf.Min(a, b);
        static float Sub(float shape, float hole) => Mathf.Max(shape, -hole);
        static float Ring(float d, float t) => Mathf.Abs(d) - t;

        static float Circle(Vector2 p, float r) => p.magnitude - r;

        static float Box(Vector2 p, Vector2 half)
        {
            var q = new Vector2(Mathf.Abs(p.x) - half.x, Mathf.Abs(p.y) - half.y);
            return new Vector2(Mathf.Max(q.x, 0f), Mathf.Max(q.y, 0f)).magnitude
                   + Mathf.Min(Mathf.Max(q.x, q.y), 0f);
        }

        /// <summary>선분에서 t만큼 부푼 캡슐 — 획(stroke)을 만든다</summary>
        static float Seg(Vector2 p, Vector2 a, Vector2 b, float t)
        {
            Vector2 pa = p - a, ba = b - a;
            float h = Mathf.Clamp01(Vector2.Dot(pa, ba) / Vector2.Dot(ba, ba));
            return (pa - ba * h).magnitude - t;
        }

        /// <summary>임의의 단순 다각형의 정확한 부호거리 (오목해도 된다)</summary>
        static float Poly(Vector2 p, Vector2[] v)
        {
            float d = Vector2.Dot(p - v[0], p - v[0]);
            float sign = 1f;

            for (int i = 0, j = v.Length - 1; i < v.Length; j = i, i++)
            {
                Vector2 e = v[j] - v[i];
                Vector2 w = p - v[i];
                Vector2 b = w - e * Mathf.Clamp01(Vector2.Dot(w, e) / Vector2.Dot(e, e));
                d = Mathf.Min(d, Vector2.Dot(b, b));

                // 반직선 교차 홀짝으로 내부 판정 (winding)
                bool c1 = p.y >= v[i].y, c2 = p.y < v[j].y, c3 = e.x * w.y > e.y * w.x;
                if ((c1 && c2 && c3) || (!c1 && !c2 && !c3)) sign = -sign;
            }
            return sign * Mathf.Sqrt(d);
        }

        // ───────── 다각형 데이터 ─────────

        static readonly Vector2[] Crystal =
        {
            new Vector2(0f, 0.95f), new Vector2(0.42f, 0.42f), new Vector2(0.34f, -0.5f),
            new Vector2(0f, -0.95f), new Vector2(-0.34f, -0.5f), new Vector2(-0.42f, 0.42f),
        };

        static readonly Vector2[] Hexagon = Regular(6, 0.9f, 90f);
        static readonly Vector2[] Diamond = Regular(4, 0.92f, 90f);
        static readonly Vector2[] Star = StarPoly(5, 0.95f, 0.42f);

        static readonly Vector2[] Shield =
        {
            new Vector2(0f, 0.9f), new Vector2(0.64f, 0.55f), new Vector2(0.64f, -0.12f),
            new Vector2(0f, -0.92f), new Vector2(-0.64f, -0.12f), new Vector2(-0.64f, 0.55f),
        };

        static readonly Vector2[] Crown =
        {
            new Vector2(-0.82f, -0.5f), new Vector2(0.82f, -0.5f), new Vector2(0.82f, 0.32f),
            new Vector2(0.4f, -0.08f), new Vector2(0f, 0.62f), new Vector2(-0.4f, -0.08f),
            new Vector2(-0.82f, 0.32f),
        };

        static readonly Vector2[] ArrowHead =
        {
            new Vector2(0f, 0.92f), new Vector2(0.56f, 0.18f), new Vector2(-0.56f, 0.18f),
        };

        static readonly Vector2[] ArrowDown =
        {
            new Vector2(0f, -0.62f), new Vector2(0.36f, -0.12f), new Vector2(-0.36f, -0.12f),
        };

        static readonly Vector2[] Bolt =
        {
            new Vector2(0.3f, 0.95f), new Vector2(-0.52f, 0.05f), new Vector2(-0.06f, 0.05f),
            new Vector2(-0.3f, -0.95f), new Vector2(0.52f, -0.05f), new Vector2(0.06f, -0.05f),
        };

        static readonly Vector2[] ClawL = Claw(-0.58f, 0.62f, -18f);
        static readonly Vector2[] ClawM = Claw(0f, 0.95f, 0f);
        static readonly Vector2[] ClawR = Claw(0.58f, 0.62f, 18f);

        /// <summary>발톱 하나 — 밑동에서 tipY까지 뾰족하게 솟은 삼각형</summary>
        static Vector2[] Claw(float x, float tipY, float leanDeg)
        {
            float lean = Mathf.Tan(leanDeg * Mathf.Deg2Rad) * (tipY + 0.85f);
            return new[]
            {
                new Vector2(x + lean, tipY),
                new Vector2(x + 0.26f, -0.85f),
                new Vector2(x - 0.26f, -0.85f),
            };
        }

        static Vector2[] Regular(int n, float r, float startDeg)
        {
            var v = new Vector2[n];
            for (int i = 0; i < n; i++)
            {
                float a = (startDeg + 360f / n * i) * Mathf.Deg2Rad;
                v[i] = new Vector2(Mathf.Cos(a), Mathf.Sin(a)) * r;
            }
            return v;
        }

        static Vector2[] StarPoly(int points, float outer, float inner)
        {
            var v = new Vector2[points * 2];
            for (int i = 0; i < points * 2; i++)
            {
                float a = (90f + 180f / points * i) * Mathf.Deg2Rad;
                float r = i % 2 == 0 ? outer : inner;
                v[i] = new Vector2(Mathf.Cos(a), Mathf.Sin(a)) * r;
            }
            return v;
        }
    }
}
