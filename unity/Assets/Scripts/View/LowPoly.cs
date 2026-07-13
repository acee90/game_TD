// ───────── 절차적 로우폴리 메시 — 초한지 ─────────
// 세계관: docs/design/worldbuilding.md (2026-07-13 확정)
//
// 이 파일이 지키는 규약은 셋이다. 셋 다 세계관 문서의 결정이고, 어기면 화면이 무너진다.
//
//   ① 색은 몸이 아니라 기(旗)에 싣는다 (§8).
//      몸체는 목재·철·가죽·삼베의 물성색이고, 병과 식별색이 들어가는 곳은 군기·술띠뿐이다.
//      그런데 §8을 곧이곧대로 적용하면 유닛이 보드에 묻힌다 — 실측(2026-07-12)으로
//      타일 휘도 61, 유닛 184다. 그래서 부감이 보는 <b>윗면</b>에는 밝은 물성(삼베 178·철 151)을
//      쓰고, 어두운 물성(가죽·흙)은 그늘의 단차로만 쓴다. 어두운 물성으로 유닛을 덮으면
//      한 번 그랬듯 또 묻힌다.
//
//   ② 발광은 마법이 아니라 불이다 (§8).
//      정점 알파 = 발광 마스크(LowPolyLit.shader)인데, 여기에 걸리는 건 화로·횃불뿐이다.
//      네온 코어·발광 눈은 폐기했다 — 적은 요괴가 아니라 사람이다.
//
//   ③ 티어는 스케일이 아니라 <b>장비</b>로 표현한다 (§8: "상위 등급일수록 부대 규모,
//      기치, 병기 크기가 늘어난다"). Tower()는 tier를 받아 갑옷·병기 크기·기치 수를 바꾼다.
//      호출부는 <b>균등 스케일</b>만 건다 — 비균등 스케일은 사선 부품(포신)을 왜곡시킨다.
//
// 조형 언어의 기준은 <b>55° 부감 카메라</b>다. 부감에서 유닛이 읽히는 단서는 셋뿐이다
// (2026-07-12 측정으로 확인된 것 — 옆에서 본 실루엣으로 조각하면 위에서는 상자 덩어리가 된다):
//   ① 위에서 본 발자국 모양  ② 수직 높이  ③ 바닥과의 명암 대비.
//
// 타워를 SD(2.5등신)로 잡은 것이 이 셋과 맞물린다: 등신을 낮추면 <b>머리가 커지고</b>,
// 부감에서 화면을 차지하는 게 정확히 머리와 어깨다. 그래서 투구 형태가 병과 식별의 1순위가 된다.
//
// 그리고 <b>타워는 카메라를 향해 세운다</b>(BuildTowerBody가 Y 180° 회전). 메시 정면은 +Z인데
// 게임 카메라도 +Z를 보므로, 회전을 빼면 판 위의 모든 병사가 등을 돌리고 병기가 안 보인다.
// 한 번 그렇게 만들었다가 캡처에서 잡았다. 적은 반대로 진행 방향(+Z)을 봐야 하므로 회전이 없다.
//
// 색은 메시 정점에 굽는다 — 유닛 하나가 드로우콜 하나로 끝난다 (LowPolyLit.shader).

using System.Collections.Generic;
using UnityEngine;

namespace GodTD.View
{
    /// <summary>
    /// 플랫 셰이딩 메시 빌더. 면마다 정점을 끊어 만들기 때문에 노멀이 공유되지 않는다 —
    /// 그래서 각 면의 밝기가 뚜렷이 갈린다. 부드럽게 이으면 로우폴리가 죽는다.
    /// </summary>
    public sealed class LowPolyBuilder
    {
        readonly List<Vector3> verts = new List<Vector3>();
        readonly List<Vector3> normals = new List<Vector3>();
        readonly List<Color> colors = new List<Color>();
        readonly List<int> tris = new List<int>();

        /// <summary>사각 면 하나 (a→b→c→d 반시계). 정점 4개를 새로 만든다 — 공유하지 않는다.</summary>
        public void Quad(Vector3 a, Vector3 b, Vector3 c, Vector3 d, Color col)
        {
            var n = Vector3.Cross(b - a, c - a).normalized;
            int i = verts.Count;
            verts.Add(a); verts.Add(b); verts.Add(c); verts.Add(d);
            for (int k = 0; k < 4; k++) { normals.Add(n); colors.Add(col); }
            tris.Add(i); tris.Add(i + 1); tris.Add(i + 2);
            tris.Add(i); tris.Add(i + 2); tris.Add(i + 3);
        }

        public void Tri(Vector3 a, Vector3 b, Vector3 c, Color col)
        {
            var n = Vector3.Cross(b - a, c - a).normalized;
            int i = verts.Count;
            verts.Add(a); verts.Add(b); verts.Add(c);
            for (int k = 0; k < 3; k++) { normals.Add(n); colors.Add(col); }
            tris.Add(i); tris.Add(i + 1); tris.Add(i + 2);
        }

        /// <summary>상자 — 회전은 오일러각(도). 몸통·다리·병기의 기본 부품.</summary>
        public void Box(Vector3 center, Vector3 size, Color col, Vector3 euler = default)
        {
            var rot = Quaternion.Euler(euler);
            Vector3 h = size * 0.5f;
            Vector3 P(float x, float y, float z) => center + rot * new Vector3(x * h.x, y * h.y, z * h.z);

            var a = P(-1, -1, -1); var b = P(1, -1, -1); var c = P(1, 1, -1); var d = P(-1, 1, -1);
            var e = P(-1, -1, 1); var f = P(1, -1, 1); var g = P(1, 1, 1); var i = P(-1, 1, 1);

            Quad(b, a, d, c, col); // -Z
            Quad(e, f, g, i, col); // +Z
            Quad(a, e, i, d, col); // -X
            Quad(f, b, c, g, col); // +X
            Quad(d, i, g, c, col); // +Y
            Quad(a, b, f, e, col); // -Y
        }

        /// <summary>사각뿔 — 창끝·투구 관·천막 지붕. 실루엣을 만드는 부품이다.</summary>
        public void Pyramid(Vector3 baseCenter, Vector2 baseSize, float height, Color col,
            Vector3 euler = default)
        {
            var rot = Quaternion.Euler(euler);
            float hx = baseSize.x * 0.5f, hz = baseSize.y * 0.5f;
            Vector3 P(float x, float y, float z) => baseCenter + rot * new Vector3(x, y, z);

            var a = P(-hx, 0, -hz); var b = P(hx, 0, -hz);
            var c = P(hx, 0, hz); var d = P(-hx, 0, hz);
            var apex = P(0, height, 0);

            Quad(b, a, d, c, col); // 밑면
            Tri(a, b, apex, col);
            Tri(b, c, apex, col);
            Tri(c, d, apex, col);
            Tri(d, a, apex, col);
        }

        public Mesh Build(string name)
        {
            var m = new Mesh { name = name };
            m.SetVertices(verts);
            m.SetNormals(normals);
            m.SetColors(colors);
            m.SetTriangles(tris, 0);
            m.RecalculateBounds();
            return m;
        }
    }

    public static class LowPoly
    {
        // ───────── 물성 팔레트 (세계관 §8) ─────────
        // 알파는 투명도가 아니라 <b>발광 마스크</b>다 (LowPolyLit.shader). 물성은 전부 알파 0 —
        // 안 누르면 Color의 기본 알파 1 때문에 유닛 전체가 발광해 하얗게 날아간다.
        // 알파 1은 오직 불(FIRE)에만 준다.
        //
        // 괄호 안은 휘도(0.299R+0.587G+0.114B). 보드 타일이 61이므로, 카메라를 향하는 윗면에는
        // 140 이상을 써야 유닛이 판에서 떨어져 나온다.
        static Color M(uint hex) => new Color(
            ((hex >> 16) & 0xff) / 255f, ((hex >> 8) & 0xff) / 255f, (hex & 0xff) / 255f, 0f);
        static Color E(uint hex) => new Color(
            ((hex >> 16) & 0xff) / 255f, ((hex >> 8) & 0xff) / 255f, (hex & 0xff) / 255f, 1f);

        static readonly Color HEMP = M(0xc2b28c);     // 삼베 (178) — 천막 지붕·투석 주머니. 가장 밝다.
        static readonly Color IRON = M(0x8f98a6);     // 철   (151) — 갑주·날붙이
        static readonly Color WOOD = M(0x8a6a43);     // 목재 (111) — 병기 몸체
        static readonly Color IRON_D = M(0x4a515c);   // 철 그늘
        static readonly Color WOOD_D = M(0x4e3b28);   // 목재 그늘
        static readonly Color LEATHER = M(0x7a5c3e);  // 가죽 — 적의 갑옷
        static readonly Color EARTH = M(0x5f4e3a);    // 흙 — 토단·주춧돌
        static readonly Color LACQUER = M(0x8c2f28);  // 칠기 암적 — 북·망토·테두리
        static readonly Color SKIN = M(0xa9825c);     // 살
        static readonly Color FIRE = E(0xff8a3c);     // 불 — 이 파일에서 유일하게 발광하는 것

        static Color Opaque(Color c) => new Color(c.r, c.g, c.b, 0f);
        static Color Dark(Color c, float t = 0.55f) => Opaque(Color.Lerp(c, Color.black, t));
        static Color Light(Color c, float t = 0.45f) => Opaque(Color.Lerp(c, Color.white, t));

        static readonly Dictionary<(string, int), Mesh> cache = new Dictionary<(string, int), Mesh>();

        static Mesh Cached(string recipe, Color key, System.Func<Color, Mesh> make)
        {
            var k = (recipe, key.GetHashCode());
            if (cache.TryGetValue(k, out var m) && m != null) return m;
            m = make(key);
            cache[k] = m;
            return m;
        }

        // ───────── 공용 부품 ─────────

        /// <summary>
        /// 군기 — <b>병과·세력 식별색이 실리는 유일한 곳</b>이다 (세계관 §8).
        /// 몸을 색칠하는 대신 여기 거는 이유: 부감에서 깃발은 수직 실루엣이라 오히려 더 잘 읽히고,
        /// 몸은 물성색으로 남길 수 있어 세계관과 가독성이 동시에 선다.
        /// </summary>
        static void Flag(LowPolyBuilder b, Vector3 at, float height, Color flag, float w = 0.26f)
        {
            b.Box(at + new Vector3(0f, height * 0.5f, 0f),
                new Vector3(0.035f, height, 0.035f), WOOD_D);                       // 깃대
            // 기폭 — 한쪽으로 쏠려 정면성이 생긴다. 크기는 절제한다: 처음엔 몸보다 커서
            // 깃발이 병사를 덮어버렸다. 식별색은 작아도 채도로 읽힌다.
            b.Box(at + new Vector3(w * 0.5f, height * 0.80f, 0f),
                new Vector3(w, height * 0.28f, 0.02f), flag);
            b.Box(at + new Vector3(w * 0.5f, height * 0.64f, 0f),
                new Vector3(w * 0.72f, height * 0.04f, 0.02f), Dark(flag, 0.38f));  // 술
            b.Pyramid(at + new Vector3(0f, height, 0f), new Vector2(0.05f, 0.05f), 0.10f, IRON);
        }

        /// <summary>
        /// 화로 — 세계관이 허용하는 유일한 광원이다 (§8: "발광은 물리 광원만").
        /// 네온 코어를 대체한다. 어두운 보드 위의 작은 밝은 점이라는 부감 단서는 그대로 살린다.
        /// </summary>
        static void Brazier(LowPolyBuilder b, Vector3 at, float s = 1f)
        {
            b.Box(at + new Vector3(0f, 0.05f * s, 0f),
                new Vector3(0.11f * s, 0.10f * s, 0.11f * s), IRON_D);
            b.Pyramid(at + new Vector3(0f, 0.10f * s, 0f),
                new Vector2(0.11f * s, 0.11f * s), 0.15f * s, FIRE);
        }

        /// <summary>창 — 창대 + 철 날. euler로 기울인다 (수직=+0, 앞으로 눕힘=+X 회전).</summary>
        static void Spear(LowPolyBuilder b, Vector3 at, float len, Vector3 euler, Color shaft)
        {
            var rot = Quaternion.Euler(euler);
            b.Box(at + rot * new Vector3(0f, len * 0.5f, 0f),
                new Vector3(0.04f, len, 0.04f), shaft, euler);
            b.Pyramid(at + rot * new Vector3(0f, len, 0f),
                new Vector2(0.07f, 0.07f), 0.16f, IRON, euler);
        }

        // ───────── 타워 = 병과별 대표 병사 1기 (SD) ─────────
        //
        // 조형 방침 (2026-07-13, 사용자 결정): 진지·병기 덩어리를 버리고 <b>병과마다 대표 병사 1기</b>를
        // SD(2.5등신) 로우폴리로 세운다. 진지 버전은 부감에서 '나무 상자 더미'로 읽혔다.
        //
        // SD가 부감에 유리한 이유는 우연이 아니다. 55°에서 화면을 차지하는 건 <b>머리와 어깨</b>다.
        // 등신을 낮추면 머리가 커지고, 커진 머리(투구)가 곧 식별 면적이 된다.
        // 그래서 병과를 가르는 1순위 단서를 <b>투구 형태</b>로 잡았다:
        //   궁노=낮은 챙+깃 · 보창=뿔 투구 · 공성=넓은 삿갓 · 군략=문관 관(冠).
        // 2순위는 병기의 뻗는 방향(궁노=옆, 보창=위, 공성=사선, 군략=로브 실루엣), 3순위가 군기색이다.
        //
        // <b>메시 밑면이 y=0</b>이다 — 적·영웅의 ±0.5 중심 규약과 다르다. 호출부는 균등 스케일을 건다.
        // tier(0~3)는 크기가 아니라 장비 등급(갑옷·병기)과 기치 수를 바꾼다.

        /// <summary>병과별 대표 병사. isGod이면 명장(§5).</summary>
        public static Mesh Tower(int race, int tier, bool isGod, Color flag) =>
            Cached($"t{race}_{tier}{(isGod ? "G" : "")}", flag, f =>
        {
            var b = new LowPolyBuilder();
            if (isGod) { Myeongjang(b, f); return b.Build("Myeongjang"); }

            Footing(b, tier, f);
            switch (race)
            {
                case 0: Archer(b, tier, f); break;    // 궁노 — 연사·지속 화력
                case 1: Lancer(b, tier, f); break;    // 보창 — 단일 일격
                case 2: Bombard(b, tier, f); break;   // 공성 — 범위 피해
                default: Strategist(b, tier, f); break; // 군략 — 진군 방해
            }
            return b.Build("Tower");
        });

        // SD 비율 — 네 병과의 <b>공통 골격</b>. 값이 갈리면 조형 언어가 갈라진다.
        //
        // SD의 정의는 "작다"가 아니라 <b>머리가 몸통보다 넓다</b>이다. 첫 시도는 머리 0.30 ·
        // 몸통 0.36으로 머리가 더 좁았고, 그 결과 캐릭터가 아니라 <b>상자 기둥</b>으로 읽혔다.
        // 지금은 머리 0.44 · 몸통 0.30 — 머리가 확실히 더 넓다. 부감에서 화면을 차지하는 것도
        // 정확히 그 머리라, 투구가 병과 식별의 1순위가 될 수 있다.
        const float GROUND = 0.10f;   // 발판 윗면
        const float HIP = 0.32f;      // 골반 — 다리는 짧고 굵다
        const float CHEST = 0.60f;    // 어깨선
        const float NECK = 0.62f;     // 머리 밑면
        const float CROWN = 0.96f;    // 머리 윗면 — 투구는 여기 얹는다
        const float HEAD_W = 0.44f;   // 머리 폭 — 몸통(0.30)보다 넓어야 SD다

        /// <summary>발판 — 병사가 왜 타일에 붙박여 있는지의 최소 설명. 명장의 토단보다 훨씬 낮다.</summary>
        static void Footing(LowPolyBuilder b, int tier, Color flag)
        {
            b.Box(new Vector3(0f, 0.05f, 0f), new Vector3(0.86f, 0.10f, 0.86f), EARTH);
            // 윗면은 밝게 — 카메라를 향하는 면이 어두우면 병사째로 타일에 묻힌다.
            b.Box(new Vector3(0f, 0.10f, 0f), new Vector3(0.74f, 0.04f, 0.74f), Light(EARTH, 0.22f));

            // 기치 — 티어가 오를수록 늘어난다. 병사 <b>뒤</b>(-Z)에 세워 몸을 가리지 않는다.
            int flags = tier >= 3 ? 2 : 1;
            for (int i = 0; i < flags; i++)
            {
                float x = flags == 1 ? -0.31f : (i == 0 ? -0.31f : 0.31f);
                Flag(b, new Vector3(x, GROUND, -0.30f), 0.60f + 0.05f * tier, flag, 0.17f);
            }
        }

        /// <summary>SD 몸통 — 짧은 다리 + 좁은 통 몸통 + 팔 2. 네 병과가 공유한다.</summary>
        static void Body(LowPolyBuilder b, int tier, Color coat)
        {
            Color boot = Dark(coat, 0.42f);
            Color sleeve = Dark(coat, 0.18f);
            foreach (int sx in new[] { -1, 1 })
                b.Box(new Vector3(sx * 0.09f, (GROUND + HIP) * 0.5f, 0f),
                    new Vector3(0.14f, HIP - GROUND, 0.16f), boot);          // 다리 — 짧고 굵게

            b.Box(new Vector3(0f, (HIP + CHEST) * 0.5f, 0f),
                new Vector3(0.30f, CHEST - HIP, 0.22f), coat);               // 몸통 — 머리보다 좁다

            // 팔 — 없으면 캐릭터가 아니라 상자로 읽힌다. 병기를 쥔 손이 여기 붙는다.
            foreach (int sx in new[] { -1, 1 })
                b.Box(new Vector3(sx * 0.20f, CHEST - 0.14f, 0.01f),
                    new Vector3(0.10f, 0.24f, 0.13f), sleeve, new Vector3(0f, 0f, sx * -5f));

            // 편갑 — 어깨 윗면. 부감이 가장 많이 보는 면이라 여기를 밝게 잡는다.
            Color pauldron = Light(IRON, 0.20f + 0.07f * tier);              // 티어↑ = 갑옷이 좋아진다
            b.Box(new Vector3(0f, CHEST - 0.01f, 0f), new Vector3(0.46f, 0.08f, 0.26f), pauldron);
        }

        /// <summary>
        /// 머리 — SD의 핵심. 몸통보다 넓게 잡는다. helm은 투구 색.
        /// 눈은 <b>발광하지 않는다</b> — 적이 요괴가 아니듯 아군도 마법 생물이 아니다 (세계관 §8).
        /// 어두운 상자 두 개면 부감에서도 얼굴로 읽힌다.
        /// </summary>
        static void Head(LowPolyBuilder b, Color helm)
        {
            b.Box(new Vector3(0f, (NECK + CROWN) * 0.5f, 0.01f),
                new Vector3(HEAD_W, CROWN - NECK, 0.40f), SKIN);                          // 얼굴 — 크다
            b.Box(new Vector3(0f, NECK + 0.12f, 0.21f),
                new Vector3(HEAD_W * 0.62f, 0.05f, 0.03f), Dark(SKIN, 0.62f));            // 눈 — 어두운 띠
            b.Box(new Vector3(0f, CROWN + 0.04f, 0f),
                new Vector3(HEAD_W + 0.04f, 0.09f, 0.42f), helm);                         // 투구 몸
        }

        /// <summary>궁노 — 쇠뇌. 활대가 <b>옆으로</b> 뻗어 부감 발자국을 넓힌다. 투구는 낮은 챙 + 깃.</summary>
        static void Archer(LowPolyBuilder b, int tier, Color flag)
        {
            Body(b, tier, LEATHER);
            Color helm = IRON_D;
            Head(b, helm);
            b.Box(new Vector3(0f, CROWN + 0.01f, 0.20f),
                new Vector3(HEAD_W + 0.10f, 0.04f, 0.12f), helm);                          // 챙 — 낮고 앞으로
            b.Box(new Vector3(0f, CROWN + 0.14f, -0.03f), new Vector3(0.05f, 0.14f, 0.05f), flag); // 깃 — 병과색

            // 쇠뇌 — 두 손으로 들고 +Z를 겨눈다
            float wing = 0.36f + 0.05f * tier;                                             // 티어↑ = 병기가 커진다
            float y = CHEST - 0.16f;
            b.Box(new Vector3(0f, y, 0.22f), new Vector3(0.10f, 0.07f, 0.36f), WOOD);      // 노대
            foreach (int sx in new[] { -1, 1 })
                b.Box(new Vector3(sx * (wing * 0.5f + 0.04f), y + 0.01f, 0.28f),
                    new Vector3(wing, 0.05f, 0.07f), IRON, new Vector3(0f, 0f, sx * -7f)); // 활대
            b.Box(new Vector3(0f, y + 0.05f, 0.34f), new Vector3(0.03f, 0.03f, 0.22f), HEMP);
            b.Pyramid(new Vector3(0f, y + 0.05f, 0.45f), new Vector2(0.05f, 0.05f), 0.10f,
                IRON, new Vector3(90f, 0f, 0f));                                           // 살촉

            if (tier >= 2)                                                                  // 등에 진 전통
                b.Box(new Vector3(-0.17f, CHEST - 0.10f, -0.15f), new Vector3(0.11f, 0.28f, 0.11f),
                    LACQUER, new Vector3(14f, 0f, 8f));
        }

        /// <summary>보창 — 대방패 + 장창. 창이 <b>위로</b> 솟아 수직 높이를 만든다. 투구는 뿔.</summary>
        static void Lancer(LowPolyBuilder b, int tier, Color flag)
        {
            Body(b, tier, Dark(IRON, 0.20f));                                              // 중갑 — 가장 무겁다
            Color helm = Light(IRON_D, 0.20f);
            Head(b, helm);
            foreach (int sx in new[] { -1, 1 })                                            // 뿔 투구 — 발자국을 옆으로
                b.Pyramid(new Vector3(sx * 0.20f, CROWN + 0.06f, 0f), new Vector2(0.09f, 0.11f), 0.22f,
                    flag, new Vector3(0f, 0f, sx * 36f));                                  // 뿔에 병과색
            b.Pyramid(new Vector3(0f, CROWN + 0.08f, 0f), new Vector2(0.16f, 0.16f), 0.10f, helm);

            // 대방패 — 왼팔. 정면 발자국을 넓힌다.
            b.Box(new Vector3(-0.30f, CHEST - 0.18f, 0.14f), new Vector3(0.09f, 0.44f, 0.32f), WOOD);
            b.Box(new Vector3(-0.35f, CHEST - 0.18f, 0.14f), new Vector3(0.03f, 0.15f, 0.15f), IRON);
            b.Box(new Vector3(-0.30f, CHEST + 0.04f, 0.14f), new Vector3(0.10f, 0.05f, 0.34f), LACQUER);

            // 장창 — 오른손. 위로 길게. 티어↑ = 창이 길어진다.
            Spear(b, new Vector3(0.28f, HIP + 0.02f, 0.08f), 0.76f + 0.05f * tier,
                new Vector3(6f, 0f, -6f), WOOD_D);
        }

        /// <summary>공성 — 어깨에 얹은 화포. <b>유일한 사선 실루엣</b>. 투구는 넓은 삿갓.</summary>
        static void Bombard(LowPolyBuilder b, int tier, Color flag)
        {
            Body(b, tier, Dark(LEATHER, 0.12f));
            Head(b, WOOD_D);
            // 삿갓 — 넓다. 위에서 본 발자국이 네 병과 중 가장 크고 둥글게 읽힌다.
            b.Pyramid(new Vector3(0f, CROWN + 0.03f, 0f), new Vector2(0.62f, 0.62f), 0.18f, HEMP);
            b.Box(new Vector3(0f, CROWN + 0.02f, 0f), new Vector3(0.60f, 0.03f, 0.60f), Dark(HEMP, 0.32f));
            b.Box(new Vector3(0f, CROWN + 0.20f, 0f), new Vector3(0.07f, 0.06f, 0.07f), flag); // 갓끈 매듭 — 병과색

            // 포신 — 어깨에 사선으로 얹는다. 이 대각선이 공성의 정체다.
            float len = 0.66f + 0.07f * tier;                                              // 티어↑ = 병기가 커진다
            var euler = new Vector3(-30f, 0f, 0f);
            var rot = Quaternion.Euler(euler);
            var seat = new Vector3(0.15f, CHEST + 0.03f, 0.02f);
            b.Box(seat + rot * new Vector3(0f, 0f, len * 0.5f - 0.20f),
                new Vector3(0.15f, 0.15f, len), WOOD, euler);                              // 포신
            b.Box(seat + rot * new Vector3(0f, 0f, len - 0.18f),
                new Vector3(0.18f, 0.18f, 0.07f), IRON, euler);                            // 포구 테
            b.Box(seat + rot * new Vector3(0f, 0f, -0.16f),
                new Vector3(0.17f, 0.17f, 0.10f), IRON_D, euler);                          // 약실

            // 화로 — 점화용 불. 세계관이 허용하는 유일한 발광이고, 공성에 가장 자연스럽다.
            Brazier(b, new Vector3(-0.30f, GROUND, 0.26f), 0.85f);
            if (tier >= 2)
                b.Box(new Vector3(-0.31f, GROUND + 0.16f, -0.08f), new Vector3(0.16f, 0.18f, 0.16f), LACQUER);
        }

        /// <summary>군략 — 책사. 로브라 하반신이 <b>넓은 사다리꼴</b>이다 — 다리 2개인 셋과 갈린다.</summary>
        static void Strategist(LowPolyBuilder b, int tier, Color flag)
        {
            // 로브 — 다리를 덮는다. 아래가 넓고 위가 좁은 사다리꼴을 상자 두 단으로 흉내낸다.
            b.Box(new Vector3(0f, GROUND + 0.08f, 0f), new Vector3(0.48f, 0.16f, 0.42f), HEMP);
            b.Box(new Vector3(0f, GROUND + 0.21f, 0f), new Vector3(0.38f, 0.14f, 0.33f), HEMP);
            b.Box(new Vector3(0f, (HIP + CHEST) * 0.5f + 0.02f, 0f),
                new Vector3(0.31f, CHEST - HIP, 0.24f), Light(HEMP, 0.12f));               // 상의
            b.Box(new Vector3(0f, CHEST - 0.16f, 0.13f), new Vector3(0.11f, 0.28f, 0.03f), LACQUER); // 옷깃
            foreach (int sx in new[] { -1, 1 })                                            // 넓은 소매
                b.Box(new Vector3(sx * 0.22f, CHEST - 0.16f, 0.01f),
                    new Vector3(0.14f, 0.26f, 0.16f), HEMP, new Vector3(0f, 0f, sx * -7f));

            Color cap = Dark(LACQUER, 0.34f);
            Head(b, cap);
            // 문관 관(冠) — 위로 솟은 각진 관. 투구가 아니라 관이라는 게 병과의 성격이다.
            b.Box(new Vector3(0f, CROWN + 0.16f, -0.02f), new Vector3(0.22f, 0.16f, 0.18f), cap);
            b.Box(new Vector3(0f, CROWN + 0.26f, -0.02f), new Vector3(0.30f, 0.04f, 0.22f), flag); // 관 띠 — 병과색

            // 부채 — 오른손. '싸우지 않고 방해한다'가 실루엣으로 읽힌다.
            b.Box(new Vector3(0.30f, CHEST - 0.02f, 0.12f), new Vector3(0.04f, 0.24f, 0.18f),
                Light(HEMP, 0.28f), new Vector3(0f, 0f, -16f));

            // 북 — 발치. 군략의 '진군 방해'는 북과 기치에서 온다. 티어↑ = 커진다.
            float d = 0.20f + 0.03f * tier;
            b.Box(new Vector3(-0.32f, GROUND + d * 0.5f, 0.24f), new Vector3(d, d, d),
                LACQUER, new Vector3(0f, 0f, 9f));
            b.Box(new Vector3(-0.32f, GROUND + d * 0.5f, 0.24f), new Vector3(d + 0.02f, d * 0.28f, d + 0.02f),
                IRON, new Vector3(0f, 0f, 9f));
        }

        /// <summary>
        /// 명장 — 세계관 §5. 단, 근거가 바뀌었다(2026-07-13).
        ///
        /// 원래 명장의 차별화는 "다른 타워는 전부 무생물 병기인데 명장만 사람"이라는 대비였다.
        /// 타워를 SD 병사로 바꾸면서 <b>그 근거가 사라졌다</b> — 이제 판 위가 전부 사람이다.
        /// 그래서 차별화 축을 넷으로 옮긴다:
        ///   ① 크기 (호출부 스케일 2.60 vs 일반 2.15~2.42)
        ///   ② <b>토단</b> — 일반 병사는 낮은 발판 하나, 명장은 2단 토단 위에 선다
        ///   ③ <b>등에 진 큰 군기</b> — 일반 병사의 기치는 발판 뒤에 꽂혀 있고, 명장은 몸에 지고 있다
        ///   ④ <b>화로 2기</b> — 판 위에서 불을 두 개 지고 있는 것은 명장뿐이다
        /// 영웅(맨몸·이동·군기 없음)과도 여전히 갈린다.
        /// </summary>
        static void Myeongjang(LowPolyBuilder b, Color flag)
        {
            // 토단(壇) 2단 — 일반 병사의 낮은 발판과 높이로 갈린다
            b.Box(new Vector3(0f, 0.05f, 0f), new Vector3(1.00f, 0.10f, 1.00f), EARTH);
            b.Box(new Vector3(0f, 0.14f, 0f), new Vector3(0.80f, 0.09f, 0.80f), Light(EARTH, 0.24f));
            const float g = 0.09f; // 토단이 발판(0.10)보다 높은 만큼 골격 전체를 올린다

            Color armor = Light(IRON, 0.30f); // 판 위에서 가장 밝은 갑주
            Color helm = Light(IRON, 0.46f);

            // 일반 병사와 <b>같은 SD 골격</b>을 쓴다 — 머리가 몸통보다 넓다. 명장만 등신이 달라지면
            // 병과 병사들과 다른 종류의 존재로 보인다. 명장은 '더 큰 병사'여야 한다.
            foreach (int sx in new[] { -1, 1 })
                b.Box(new Vector3(sx * 0.10f, g + (GROUND + HIP) * 0.5f, 0f),
                    new Vector3(0.15f, HIP - GROUND, 0.17f), Dark(IRON, 0.50f));          // 다리
            b.Box(new Vector3(0f, g + (HIP + CHEST) * 0.5f, 0f),
                new Vector3(0.32f, CHEST - HIP, 0.24f), armor);                            // 갑주
            b.Box(new Vector3(0f, g + CHEST - 0.18f, -0.15f),
                new Vector3(0.40f, 0.44f, 0.04f), LACQUER);                                // 망토
            foreach (int sx in new[] { -1, 1 })
                b.Box(new Vector3(sx * 0.21f, g + CHEST - 0.14f, 0.01f),
                    new Vector3(0.11f, 0.24f, 0.14f), Dark(IRON, 0.30f), new Vector3(0f, 0f, sx * -5f)); // 팔
            b.Box(new Vector3(0f, g + CHEST - 0.01f, 0f), new Vector3(0.50f, 0.09f, 0.28f), helm); // 어깨 갑

            b.Box(new Vector3(0f, g + (NECK + CROWN) * 0.5f, 0.01f),
                new Vector3(HEAD_W, CROWN - NECK, 0.40f), SKIN);                           // 머리 — 병사와 같은 크기
            b.Box(new Vector3(0f, g + NECK + 0.12f, 0.21f),
                new Vector3(HEAD_W * 0.62f, 0.05f, 0.03f), Dark(SKIN, 0.62f));             // 눈
            b.Box(new Vector3(0f, g + CROWN + 0.05f, 0f),
                new Vector3(HEAD_W + 0.06f, 0.10f, 0.44f), helm);                          // 투구
            b.Pyramid(new Vector3(0f, g + CROWN + 0.10f, 0f),
                new Vector2(0.24f, 0.24f), 0.22f, flag);                                   // 투구 관 — 병과색

            Spear(b, new Vector3(0.31f, g + HIP, 0.07f), 0.86f, new Vector3(5f, 0f, -6f), WOOD);

            // 등에 진 대장기 — 일반 병사는 발판에 꽂고, 명장은 <b>몸에 진다</b>. 부감 최강의 수직 실루엣.
            Flag(b, new Vector3(-0.20f, g + HIP, -0.21f), 0.92f, flag, 0.26f);

            // 화로 2기 — 판 위에서 불을 둘 지고 있는 것은 명장뿐이다
            Brazier(b, new Vector3(0.39f, 0.185f, 0.37f));
            Brazier(b, new Vector3(-0.39f, 0.185f, 0.37f));
        }

        // ───────── 적 = 군세 (세계관 §7) ─────────
        // 괴수가 아니다. 그래서 발광 눈·등뿔·갑각을 전부 걷어냈다.
        // 셋을 가르는 것은 <b>부감 발자국</b>이다 — 보병(작은 정사각) · 기병(세로로 긴) ·
        // 적장(전차: 가장 크고 가장 세로로 긴). 색이 아니라 형태로 갈려야 무리 속에서 읽힌다.
        // 전진 방향은 +Z (경로 접선을 바라본다).

        /// <summary>보병 — 일반 웨이브. 창·방패·가죽 갑옷. 무리로 밀려온다.</summary>
        public static Mesh Foot(Color banner) => Cached("foot", banner, c =>
        {
            var b = new LowPolyBuilder();
            Color hide = Light(LEATHER, 0.16f);  // 몸통 — 보드(61)보다 밝아야 읽힌다
            Color plate = Light(IRON_D, 0.34f);  // 편갑 — 어깨 윗면. 카메라를 향하는 면.
            Color band = Opaque(c);              // 술띠·투구 깃·방패 문양 — 세력색이 실리는 유일한 곳

            foreach (int sx in new[] { -1, 1 })
                b.Box(new Vector3(sx * 0.08f, -0.34f, 0f), new Vector3(0.10f, 0.28f, 0.12f),
                    Dark(LEATHER, 0.32f)); // 다리

            b.Box(new Vector3(0f, -0.10f, 0f), new Vector3(0.30f, 0.34f, 0.20f), hide);   // 몸통
            b.Box(new Vector3(0f, 0.05f, 0f), new Vector3(0.34f, 0.07f, 0.24f), plate);   // 편갑 (윗면)
            b.Box(new Vector3(0f, -0.18f, 0f), new Vector3(0.32f, 0.05f, 0.22f), band);   // 허리 술띠
            b.Box(new Vector3(0f, 0.16f, 0.01f), new Vector3(0.15f, 0.13f, 0.15f), SKIN); // 머리
            b.Box(new Vector3(0f, 0.23f, 0f), new Vector3(0.17f, 0.06f, 0.17f), IRON_D);  // 투구
            b.Box(new Vector3(0f, 0.29f, -0.02f), new Vector3(0.05f, 0.10f, 0.05f), band); // 투구 깃 — 수직 단서

            // 방패 — 전면. 부감 발자국을 앞으로 넓힌다.
            b.Box(new Vector3(-0.17f, -0.07f, 0.19f), new Vector3(0.24f, 0.34f, 0.05f),
                Light(LEATHER, 0.04f), new Vector3(0f, -12f, 0f));
            b.Box(new Vector3(-0.17f, -0.07f, 0.22f), new Vector3(0.10f, 0.10f, 0.03f),
                band, new Vector3(0f, -12f, 0f)); // 방패 문양

            Spear(b, new Vector3(0.20f, -0.06f, 0.02f), 0.44f, new Vector3(10f, 0f, -6f), WOOD_D);
            return b.Build("Foot");
        });

        /// <summary>
        /// 기병 — 사냥꾼 웨이브. 이건 연출이 아니라 <b>사양의 직역</b>이다:
        /// 사냥꾼은 접촉 피해가 ×6이고 영웅을 노리도록 설계됐다(balance.ts). 성주에게 창을 겨누고
        /// 달려드는 기병이 그 사양 그대로다.
        /// 말 때문에 발자국이 <b>세로로 길어</b> 보병 무리 속에서 즉시 갈린다.
        /// </summary>
        public static Mesh Rider(Color banner) => Cached("rider", banner, c =>
        {
            var b = new LowPolyBuilder();
            Color horse = Dark(LEATHER, 0.22f);
            Color back = Light(LEATHER, 0.14f);  // 말 등 — 윗면. 부감이 보는 면.
            Color armor = Light(IRON_D, 0.36f);
            Color band = Opaque(c);

            foreach (int sx in new[] { -1, 1 })  // 말 다리 4
                foreach (int sz in new[] { -1, 1 })
                    b.Box(new Vector3(sx * 0.11f, -0.36f, -0.04f + sz * 0.21f),
                        new Vector3(0.09f, 0.26f, 0.09f), Dark(LEATHER, 0.44f));

            b.Box(new Vector3(0f, -0.17f, -0.03f), new Vector3(0.26f, 0.24f, 0.60f), horse); // 말 몸통 — 길다
            b.Box(new Vector3(0f, -0.04f, -0.03f), new Vector3(0.22f, 0.05f, 0.54f), back);  // 등 (윗면)
            b.Box(new Vector3(0f, -0.05f, 0.26f), new Vector3(0.13f, 0.22f, 0.14f), horse,
                new Vector3(-26f, 0f, 0f));                                                   // 목
            b.Box(new Vector3(0f, 0.04f, 0.36f), new Vector3(0.11f, 0.11f, 0.20f), back);     // 머리
            b.Box(new Vector3(0f, -0.12f, -0.34f), new Vector3(0.07f, 0.16f, 0.09f), horse,
                new Vector3(24f, 0f, 0f));                                                    // 꼬리

            b.Box(new Vector3(0f, -0.01f, -0.06f), new Vector3(0.30f, 0.04f, 0.24f), band);   // 안장깔개 — 세력색

            // 기수 — 수직 높이를 만든다
            b.Box(new Vector3(0f, 0.15f, -0.06f), new Vector3(0.22f, 0.26f, 0.16f), armor);
            b.Box(new Vector3(0f, 0.33f, -0.05f), new Vector3(0.14f, 0.12f, 0.14f), SKIN);
            b.Box(new Vector3(0f, 0.40f, -0.06f), new Vector3(0.16f, 0.05f, 0.16f), IRON_D);
            b.Box(new Vector3(0f, 0.46f, -0.08f), new Vector3(0.05f, 0.11f, 0.05f), band);    // 투구 깃

            // 기창 — 거의 수평으로 앞을 겨눈다. "너를 노린다"가 실루엣으로 읽혀야 한다.
            Spear(b, new Vector3(0.17f, 0.13f, 0.08f), 0.62f, new Vector3(74f, 0f, 0f), WOOD_D);
            return b.Build("Rider");
        });

        /// <summary>
        /// 적장 — 보스. 전차(戰車)다. 말 2필 + 차체 + 큰 군기.
        /// 보병·기병과 발자국이 겹치지 않도록 <b>가장 크고 가장 세로로 길게</b> 잡았다.
        /// </summary>
        public static Mesh Warlord(Color banner) => Cached("warlord", banner, c =>
        {
            var b = new LowPolyBuilder();
            Color horse = Dark(LEATHER, 0.26f);
            Color back = Light(LEATHER, 0.12f);
            Color armor = Light(IRON, 0.20f);   // 적장의 갑주 — 병졸보다 밝다
            Color band = Opaque(c);

            foreach (int sx in new[] { -1, 1 }) // 말 2필 — 병렬
            {
                float hx = sx * 0.17f;
                foreach (int sz in new[] { -1, 1 })
                    b.Box(new Vector3(hx, -0.36f, 0.20f + sz * 0.14f),
                        new Vector3(0.08f, 0.26f, 0.08f), Dark(LEATHER, 0.46f));
                b.Box(new Vector3(hx, -0.18f, 0.21f), new Vector3(0.20f, 0.22f, 0.46f), horse);
                b.Box(new Vector3(hx, -0.06f, 0.21f), new Vector3(0.17f, 0.05f, 0.42f), back);
                b.Box(new Vector3(hx, 0.00f, 0.46f), new Vector3(0.10f, 0.16f, 0.14f), horse,
                    new Vector3(-24f, 0f, 0f)); // 목·머리
            }

            b.Box(new Vector3(0f, -0.20f, 0.02f), new Vector3(0.10f, 0.05f, 0.44f), WOOD); // 멍에채

            // 차체 + 바퀴 — 바퀴가 옆으로 커서 발자국이 넓다
            b.Box(new Vector3(0f, -0.16f, -0.28f), new Vector3(0.44f, 0.22f, 0.38f), WOOD);
            b.Box(new Vector3(0f, -0.04f, -0.28f), new Vector3(0.40f, 0.04f, 0.34f), Light(WOOD, 0.28f));
            b.Box(new Vector3(0f, -0.04f, -0.45f), new Vector3(0.44f, 0.20f, 0.05f), LACQUER); // 뒤 난간 — 칠기
            foreach (int sx in new[] { -1, 1 })
                b.Box(new Vector3(sx * 0.28f, -0.20f, -0.28f), new Vector3(0.05f, 0.36f, 0.36f), WOOD_D);

            // 적장 — 차 위에 선다
            b.Box(new Vector3(0.06f, 0.13f, -0.26f), new Vector3(0.26f, 0.30f, 0.18f), armor);
            b.Box(new Vector3(0.06f, 0.09f, -0.36f), new Vector3(0.30f, 0.38f, 0.04f), LACQUER); // 망토
            b.Box(new Vector3(0.06f, 0.31f, -0.25f), new Vector3(0.15f, 0.13f, 0.15f), SKIN);
            b.Box(new Vector3(0.06f, 0.38f, -0.26f), new Vector3(0.18f, 0.06f, 0.18f), Light(IRON, 0.34f));
            b.Pyramid(new Vector3(0.06f, 0.41f, -0.26f), new Vector2(0.15f, 0.15f), 0.16f, band); // 관 — 세력색

            Spear(b, new Vector3(0.26f, 0.14f, -0.20f), 0.66f, new Vector3(8f, 0f, -10f), WOOD);

            // 대장기 — 크다. 멀리서도 "적장이 온다"가 읽혀야 한다.
            Flag(b, new Vector3(-0.20f, 0.00f, -0.42f), 0.94f, c, 0.34f);
            return b.Build("Warlord");
        });

        // ───────── 영웅 = 성주 (세계관 §2) ─────────

        /// <summary>
        /// 성주 — 플레이어의 대장. 판 위에서 <b>유일하게 움직이는 사람</b>이다.
        ///
        /// 예전에는 "유일한 2족 보행"이 구분 단서였지만, 적이 군세가 되면서 그 단서가 사라졌다.
        /// 새 단서는 셋이다: ①밝은 강철 갑주 — 적(어두운 가죽)보다 훨씬 밝다.
        /// ②청색 망토 — 적의 회청·주홍과 색상이 갈린다. ③군기가 없다 — 명장(등에 군기 + 토단 위 정지)과
        /// 갈리는 지점이다. 영웅은 맨몸으로 움직인다.
        /// </summary>
        public static Mesh Hero(Color cloak) => Cached("hero", cloak, c =>
        {
            var b = new LowPolyBuilder();
            Color armor = Light(IRON, 0.42f);  // 가장 밝은 갑주 — 판 위에서 즉시 눈에 띄어야 한다
            Color trim = M(0xd8a63c);          // 금 장식 — 성주의 권위
            Color robe = Opaque(c);

            foreach (int sx in new[] { -1, 1 })
                b.Box(new Vector3(sx * 0.10f, -0.34f, 0f), new Vector3(0.12f, 0.30f, 0.14f),
                    Dark(IRON, 0.52f)); // 다리 (경갑)

            b.Box(new Vector3(0f, -0.06f, 0f), new Vector3(0.31f, 0.36f, 0.22f), armor);   // 갑주
            b.Box(new Vector3(0f, -0.10f, -0.13f), new Vector3(0.35f, 0.46f, 0.04f), robe); // 망토 — 청
            b.Box(new Vector3(0f, 0.04f, 0.11f), new Vector3(0.13f, 0.11f, 0.03f), trim);   // 흉갑 금장
            foreach (int sx in new[] { -1, 1 })                                             // 어깨 갑 — 발자국을 넓힌다
                b.Box(new Vector3(sx * 0.22f, 0.08f, 0f), new Vector3(0.15f, 0.13f, 0.22f),
                    armor, new Vector3(0f, 0f, sx * -13f));

            b.Box(new Vector3(0f, 0.20f, 0.01f), new Vector3(0.16f, 0.14f, 0.16f), SKIN);   // 얼굴
            b.Box(new Vector3(0f, 0.28f, 0f), new Vector3(0.19f, 0.06f, 0.19f), armor);     // 투구
            b.Pyramid(new Vector3(0f, 0.31f, 0f), new Vector2(0.15f, 0.15f), 0.17f, trim);  // 투구 금관 — 수직 단서

            Spear(b, new Vector3(0.25f, 0.00f, 0.04f), 0.58f, new Vector3(6f, 0f, -9f), WOOD);
            return b.Build("Hero");
        });

        // ───────── 머티리얼 ─────────

        static Shader shader;
        static Shader Lit => shader != null ? shader : (shader = Shader.Find("GodTD/LowPolyLit"));

        static readonly Dictionary<float, Material> mats = new Dictionary<float, Material>();

        /// <summary>
        /// 정점 색을 읽는 머티리얼. 발광 세기로 캐시한다 — 적마다 새로 만들면 유닛 수만큼 샌다.
        ///
        /// glow는 <b>0이 기본</b>이다 (세계관 §8: 재질 자체는 빛나지 않는다).
        /// 빛나는 것은 정점 알파가 1인 부분 — 화로의 불꽃뿐이다.
        /// </summary>
        public static Material Mat(float glow = 0f)
        {
            if (mats.TryGetValue(glow, out var m) && m != null) return m;
            m = new Material(Lit);
            m.SetFloat("_Glow", glow);
            // 림 라이트는 어두운 보드에서 실루엣을 뜯어내는 값싼 수단이라 유지한다.
            // 다만 색을 푸른 네온에서 <b>달빛</b> 쪽으로 낮춘다 — 세계관이 네온을 배제한다.
            m.SetColor("_RimColor", new Color(0.52f, 0.56f, 0.66f));
            m.SetFloat("_RimPower", 0.75f);
            mats[glow] = m;
            return m;
        }
    }
}
