// ───────── 월드 리폼: 플로팅 아일랜드 생성기 ─────────
// GameDev Starter Kit - Platformer(AssetHunts!) 블록으로 보드를 공중 섬으로 짓는다.
// GameView와 무관한 순수 생성 로직 — MapData(기하)만 참조한다.
// 프리팹 로드는 델리게이트 주입: 프리뷰(에디터)는 AssetDatabase, 본 게임 통합 시 Resources.
//
// 좌표계·높이 규약 (GameView와 동일 — 통합 시 유닛/타워 높이 상수 무수정):
//   웹 px → 월드: x = px·SCALE, z = -py·SCALE. 셀 피치 = TILE·SCALE = 3.6유닛.
//   TILE_TOP = 0.36 = 잔디 캡 윗면 = 유닛이 서는 높이.
//   키트 규격: 블록 2×2×2m(피벗 바닥), Top 캡 2×2×0.5m(피벗 윗면) → KIT_SCALE 1.8.

using System.Collections.Generic;
using GodTD.Core;
using UnityEngine;

namespace GodTD.WorldReform
{
    public static class IslandBuilder
    {
        /// <summary>키트 프리팹 로더 — key는 "하위폴더/프리팹명" (예: "3D Tile/3D_Tile_Top_01")</summary>
        public delegate GameObject PrefabLoader(string key);

        // ── 규약 상수 (GameView 복사값 — 통합 시 일치 확인) ──
        public const float SCALE = 0.1f;
        public const float TILE_TOP = 0.36f;
        const float CELL = MapData.TILE * SCALE;   // 3.6
        const float KIT_SCALE = CELL / 2f;         // 1.8 — 키트 블록 2m 기준
        const float CAP_THICK = 0.5f * KIT_SCALE;  // 0.9 — Top 캡 두께
        const float BLOCK_H = 2f * KIT_SCALE;      // 3.6 — Ground 블록 높이
        const float CAP_BOTTOM = TILE_TOP - CAP_THICK; // -0.54
        const int BOARD_R = 7;

        // ── 길 캡 회전 보정 — 2026-07-19 캘리브레이션 렌더 실측 확정 ──
        // 임포트 기본(rot0): 직선=W-E, 코너=S-E, T=N-S-E(W 빠짐), 십자=무방향.
        // RoadPiece의 기준 규약(코너 W-N, T는 E 빠짐)에 맞추기 위한 오프셋.
        const float ROT_STRAIGHT = 0f;
        const float ROT_CORNER = 180f;
        const float ROT_T = 180f;
        const float ROT_CROSS = 0f;

        // ── 틴트 — 팔레트가 완성 색이라 흰색 근방에서 시작 (스크린샷 튜닝 노브) ──
        static readonly Color GRASS_TINT = Color.white;
        static readonly Color ROAD_TINT = Color.white;
        static readonly Color SLOT_TINT = new Color(1.10f, 1.10f, 1.02f);   // 빈 슬롯 — 살짝 밝게(빌드 가능)
        static readonly Color ALTAR_TINT = new Color(1.2f, 1.0f, 0.5f);     // 제단 — 금빛

        // ── 프리팹 키 ──
        const string TILE_DIR = "3D Tile/";
        static readonly string[] CAP_GRASS = { TILE_DIR + "3D_Tile_Top_01", TILE_DIR + "3D_Tile_Top_02" };
        const string CAP_STRAIGHT = TILE_DIR + "3D_Tile_Top_Path_01";
        const string CAP_CORNER = TILE_DIR + "3D_Tile_Top_Path_02";
        const string CAP_T = TILE_DIR + "3D_Tile_Top_Path_03";
        const string CAP_CROSS = TILE_DIR + "3D_Tile_Top_Path_04";
        static readonly string[] BLOCKS =
        {
            TILE_DIR + "3D_Tile_Ground_01", TILE_DIR + "3D_Tile_Ground_01A",
            TILE_DIR + "3D_Tile_Ground_02", TILE_DIR + "3D_Tile_Ground_02A",
            TILE_DIR + "3D_Tile_Ground_03", TILE_DIR + "3D_Tile_Ground_04",
        };
        const string SLOPE = TILE_DIR + "3D_Tile_Ground_Slope_01";
        const string ALTAR_BLOCK = TILE_DIR + "3D_Tile_Ice_01";
        static readonly string[] TREES = { "Plant/Plant_Tree_01", "Plant/Plant_Tree_01A" };
        static readonly string[] ROCKS =
        {
            "Rock/Rock_A_01", "Rock/Rock_A_02", "Rock/Rock_A_03", "Rock/Rock_A_04", "Rock/Rock_A_05",
        };
        static readonly string[] PROPS = { "Prop/Prop_Crate_01", "Prop/Prop_Wooden_Barrel_01" };
        static readonly string[] FENCES = { "Prop/Prop_Fence_A_01", "Prop/Prop_Fence_A_02" };
        static readonly string[] CLOUDS = { "Cloud/Cloud_01", "Cloud/Cloud_02", "Cloud/Cloud_03" };

        /// <summary>슬롯 캡 정보 — 통합 시 GameView가 콜라이더/TileMarker를 붙일 대상</summary>
        public readonly struct SlotCap
        {
            public readonly int Index;
            public readonly GameObject Go;
            public SlotCap(int index, GameObject go) { Index = index; Go = go; }
        }

        /// <summary>섬 전체를 root 아래에 생성하고 슬롯 캡 목록을 돌려준다.</summary>
        public static List<SlotCap> Build(Transform root, PrefabLoader load)
        {
            var mats = new Dictionary<int, Material>(); // 양자화 틴트 → 클론 머티리얼 (SRP Batcher 유지)
            var slots = new List<SlotCap>();

            // ── 1. 격자 캡 + 블록 스택 ──
            for (int gx = -BOARD_R; gx <= BOARD_R; gx++)
            for (int gy = -BOARD_R; gy <= BOARD_R; gy++)
            {
                if (!InIsland(gx, gy)) continue;
                float px = MapData.CENTER.X + gx * MapData.TILE;
                float py = MapData.CENTER.Y + gy * MapData.TILE;
                int hh = Hash(gx, gy);
                float v = 0.96f + (hh / 255f) * 0.08f; // 셀별 미세 명암 (체커보드 방지)

                // 캡 — 길이면 오토타일, 슬롯 자리면 스킵(슬롯 캡이 따로 덮는다), 아니면 잔디
                bool road = IsRoadCell(gx, gy);
                if (road)
                {
                    bool n = IsRoadCell(gx, gy - 1), s = IsRoadCell(gx, gy + 1);
                    bool e = IsRoadCell(gx + 1, gy), w = IsRoadCell(gx - 1, gy);
                    var (key, rot) = RoadPiece(n, e, s, w);
                    var cap = SpawnCap(load(key), root, px, py, rot, "Road");
                    Tint(cap, ROAD_TINT * v, mats);
                }
                else if (!IsNearSlot(px, py))
                {
                    // Top_02는 크림색 톱이라 길과 혼동 — 잔디는 Top_01만 쓴다
                    var cap = SpawnCap(load(CAP_GRASS[0]), root, px, py, (hh & 3) * 90f, "Grass");
                    Tint(cap, GRASS_TINT * v, mats);

                    // 장식 — 결정적 해시 배치. 경로·슬롯에서 먼 셀만 짙게 (시야 방해 최소)
                    bool far = PerpDistToPath(px, py) > MapData.TILE * 2.2f && !IsNearSlot2(px, py, 1.6f);
                    SpawnDecor(load, root, px, py, hh, far, mats);
                }

                // 블록 스택 — 림에서 안쪽으로 갈수록 깊게 (아래로 좁아지는 테이퍼)
                int rim = RimDistance(gx, gy);
                int depth = rim <= 0 ? 1 : rim == 1 ? 2 : 2 + (hh & 1);
                for (int k = 0; k < depth; k++)
                {
                    var block = Spawn(load(BLOCKS[(hh + k * 7) % BLOCKS.Length]), root,
                        W(px, py, CAP_BOTTOM - BLOCK_H * (k + 1)), ((hh >> k) & 3) * 90f, KIT_SCALE, "Block");
                    Tint(block, Color.white * (0.92f + ((hh >> (k + 2)) & 7) / 100f), mats);
                }
            }

            // ── 2. 슬롯 캡 (제단=얼음 블록, 나머지=잔디 캡. 격자와 flush — 색으로만 구분) ──
            // 비주얼은 격자에 스냅한다: 모서리 슬롯의 논리 좌표가 격자에서 4px(0.11타일) 어긋나
            // 있어(원본 맵의 경로 여백 30px ≠ 타일 배수) 그대로 두면 캡 사이에 가는 틈이 보인다.
            // 클릭 판정·타워 좌표는 MapData 논리 좌표 그대로 — 4px 차이는 체감 불가.
            for (int i = 0; i < MapData.SLOT_POS.Length; i++)
            {
                var p = MapData.SLOT_POS[i];
                float sx = SnapToGrid(p.X, MapData.CENTER.X);
                float sy = SnapToGrid(p.Y, MapData.CENTER.Y);
                GameObject go;
                if (i == 0) // 제단 — 얼음 블록(반투명 결정 느낌)을 캡 대신 통째로
                {
                    go = Spawn(load(ALTAR_BLOCK), root, W(sx, sy, TILE_TOP - BLOCK_H), 0f, KIT_SCALE, "Altar");
                    Tint(go, ALTAR_TINT, mats);
                }
                else
                {
                    go = SpawnCap(load(CAP_GRASS[0]), root, sx, sy, 0f, $"Slot{i}");
                    Tint(go, SLOT_TINT, mats);
                }
                slots.Add(new SlotCap(i, go));
            }

            // ── 3. 슬로프 에이프런 — 섬 밖 셀 중 섬과 한 면만 닿는 곳에 경사 단면 ──
            // (2026-07-19) 슬로프 에이프런은 로우앵글에서 톱니 프린지로 보여 제거 —
            // 지터 절벽 + 흙 블록 단면만으로 실루엣이 성립한다 (계획의 폴백안).
            // BuildApron(root, load, mats);

            // ── 4. 구름 + 하부 부유 암석 ──
            BuildSky(root, load, mats);

            return slots;
        }

        // ───────── 실루엣 ─────────

        /// <summary>수퍼일립스 실루엣 + 해시 경계 지터. 길·슬롯 셀은 무조건 포함.</summary>
        static bool InIsland(int gx, int gy)
        {
            float px = MapData.CENTER.X + gx * MapData.TILE;
            float py = MapData.CENTER.Y + gy * MapData.TILE;
            if (IsRoadCell(gx, gy) || IsNearSlot(px, py)) return true;
            float u = Mathf.Abs(gx) / 7.5f, w = Mathf.Abs(gy) / 7.5f;
            float r = u * u * u * u + w * w * w * w;
            return r <= 0.88f + (Hash(gx, gy) & 7) / 40f; // 경계 ±지터 — 너덜너덜한 자연 윤곽
        }

        /// <summary>섬 바깥까지의 4방향 거리(0 = 림 셀). 블록 스택 깊이 결정용.</summary>
        static int RimDistance(int gx, int gy)
        {
            for (int d = 1; d <= 3; d++)
            {
                for (int dx = -d; dx <= d; dx++)
                for (int dy = -d; dy <= d; dy++)
                {
                    if (Mathf.Max(Mathf.Abs(dx), Mathf.Abs(dy)) != d) continue;
                    if (!InIsland(gx + dx, gy + dy)) return d - 1;
                }
            }
            return 3;
        }

        // ───────── 길 오토타일 ─────────

        /// <summary>이웃 연결(N/E/S/W) → 캡 조각·회전. 회전 사이클은 현행 검증된 시계방향 규약.</summary>
        static (string key, float rot) RoadPiece(bool n, bool e, bool s, bool w)
        {
            int count = (n ? 1 : 0) + (e ? 1 : 0) + (s ? 1 : 0) + (w ? 1 : 0);
            if (count >= 4) return (CAP_CROSS, ROT_CROSS);
            if (count == 3)
            {
                if (!e) return (CAP_T, ROT_T);
                if (!s) return (CAP_T, ROT_T + 90f);
                if (!w) return (CAP_T, ROT_T + 180f);
                return (CAP_T, ROT_T + 270f); // !n
            }
            if (count == 2)
            {
                if (e && w) return (CAP_STRAIGHT, ROT_STRAIGHT);
                if (n && s) return (CAP_STRAIGHT, ROT_STRAIGHT + 90f);
                if (w && n) return (CAP_CORNER, ROT_CORNER);
                if (n && e) return (CAP_CORNER, ROT_CORNER + 90f);
                if (e && s) return (CAP_CORNER, ROT_CORNER + 180f);
                return (CAP_CORNER, ROT_CORNER + 270f); // s && w
            }
            // 끝(end) 조각 부재 — 직선으로 대체 (현 맵은 막다른 길 없음, 보드 밖 연장뿐)
            if (n || s) return (CAP_STRAIGHT, ROT_STRAIGHT + 90f);
            return (CAP_STRAIGHT, ROT_STRAIGHT);
        }

        static bool IsRoadCell(int gx, int gy)
        {
            float px = MapData.CENTER.X + gx * MapData.TILE;
            float py = MapData.CENTER.Y + gy * MapData.TILE;
            return PerpDistToPath(px, py) < MapData.TILE * 0.4f;
        }

        // ───────── 에이프런·하늘 ─────────

        /// <summary>섬 밖 셀 중 섬 4이웃이 정확히 1개인 곳에 경사 타일 — 잔디 캡이 립처럼 걸치는 실루엣.</summary>
        static void BuildApron(Transform root, PrefabLoader load, Dictionary<int, Material> mats)
        {
            var slope = load(SLOPE);
            if (slope == null) return;
            for (int gx = -BOARD_R - 1; gx <= BOARD_R + 1; gx++)
            for (int gy = -BOARD_R - 1; gy <= BOARD_R + 1; gy++)
            {
                if (InIsland(gx, gy)) continue;
                bool n = InIsland(gx, gy - 1), s = InIsland(gx, gy + 1);
                bool e = InIsland(gx + 1, gy), w = InIsland(gx - 1, gy);
                int count = (n ? 1 : 0) + (e ? 1 : 0) + (s ? 1 : 0) + (w ? 1 : 0);
                if (count != 1) continue; // 코너 조합은 생략 — 블록 절벽만으로 성립(폴백)
                // 길이 섬 밖으로 빠지는 북측 출입 열은 수직 절벽으로 남긴다 (문 연출 자리)
                if (IsRoadCell(gx, gy)) continue;

                float px = MapData.CENTER.X + gx * MapData.TILE;
                float py = MapData.CENTER.Y + gy * MapData.TILE;
                // 보정 0 가정: 슬로프 높은 면이 -Z(모델)를 본다 → 섬 쪽으로 돌린다. 실측 후 오프셋 조정.
                float rot = n ? 0f : e ? 90f : s ? 180f : 270f;
                var go = Spawn(slope, root, W(px, py, CAP_BOTTOM - BLOCK_H), rot, KIT_SCALE, "Slope");
                Tint(go, Color.white, mats);
            }
        }

        static void BuildSky(Transform root, PrefabLoader load, Dictionary<int, Material> mats)
        {
            var center = W(MapData.CENTER.X, MapData.CENTER.Y);
            var rng = new System.Random(20260718); // 결정적 — 빌드마다 같은 하늘

            for (int i = 0; i < 10; i++)
            {
                var cloud = load(CLOUDS[i % CLOUDS.Length]);
                if (cloud == null) break;
                float ang = (float)(rng.NextDouble() * Mathf.PI * 2f);
                float rad = 25f + (float)rng.NextDouble() * 30f;
                float y = -14f + (float)rng.NextDouble() * 9f;
                var pos = center + new Vector3(Mathf.Cos(ang) * rad, y, Mathf.Sin(ang) * rad);
                var go = Spawn(cloud, root, pos, (float)(rng.NextDouble() * 360f), 2f + (float)rng.NextDouble() * 3f, "Cloud");
                Tint(go, Color.white, mats);
            }

            for (int i = 0; i < 4; i++) // 섬 아래 부유 암석 파편
            {
                var rock = load(ROCKS[i % ROCKS.Length]);
                if (rock == null) break;
                float ang = (float)(rng.NextDouble() * Mathf.PI * 2f);
                float rad = 4f + (float)rng.NextDouble() * 12f;
                float y = -16f + (float)rng.NextDouble() * 6f;
                var pos = center + new Vector3(Mathf.Cos(ang) * rad, y, Mathf.Sin(ang) * rad);
                var go = Spawn(rock, root, pos, (float)(rng.NextDouble() * 360f), 2.5f + (float)rng.NextDouble() * 2f, "FloatRock");
                Tint(go, Color.white, mats);
            }
        }

        // ───────── 장식 ─────────

        static void SpawnDecor(PrefabLoader load, Transform root, float px, float py, int hh, bool far,
            Dictionary<int, Material> mats)
        {
            int r = hh % 100;
            string key = null;
            if (far)
            {
                if (r < 34) key = TREES[hh % TREES.Length];
                else if (r < 46) key = ROCKS[hh % ROCKS.Length];
                else if (r < 52) key = PROPS[hh % PROPS.Length];
            }
            else
            {
                // 경로·슬롯 인접 — 낮은 소품만 드물게 (시야 방해 최소)
                if (r < 10) key = ROCKS[hh % ROCKS.Length];
                else if (r < 14) key = PROPS[hh % PROPS.Length];
            }
            if (key == null) return;
            var prefab = load(key);
            if (prefab == null) return;
            // 셀 중심에서 살짝 비껴 — 격자 반복감 제거
            float ox = ((hh >> 3 & 7) / 7f - 0.5f) * CELL * 0.4f;
            float oz = ((hh >> 6 & 3) / 3f - 0.5f) * CELL * 0.4f;
            float s = KIT_SCALE * (0.85f + (hh & 15) / 50f);
            var go = Spawn(prefab, root, W(px, py, TILE_TOP) + new Vector3(ox, 0f, oz), hh * 37 % 360, s, "Decor");
            Tint(go, Color.white, mats);
        }

        // ───────── 배치·틴트 헬퍼 ─────────

        public static Vector3 W(float px, float py, float h = 0f) =>
            new Vector3(px * SCALE, h, -py * SCALE);

        /// <summary>웹 px 좌표를 가장 가까운 격자 셀 중심으로 스냅 (비주얼 정렬용)</summary>
        static float SnapToGrid(float v, float center) =>
            center + Mathf.Round((v - center) / MapData.TILE) * MapData.TILE;

        static int Hash(int gx, int gy) => ((gx * 73856093) ^ (gy * 19349663)) & 0xff;

        /// <summary>Top 캡 — 피벗이 윗면이라 y=TILE_TOP에 그대로 놓으면 윗면이 맞는다.</summary>
        static GameObject SpawnCap(GameObject prefab, Transform root, float px, float py, float rotY, string name)
            => Spawn(prefab, root, W(px, py, TILE_TOP), rotY, KIT_SCALE, name);

        static GameObject Spawn(GameObject prefab, Transform root, Vector3 pos, float rotY, float scale, string name)
        {
            var go = Object.Instantiate(prefab, root);
            go.name = name;
            go.transform.position = pos;
            go.transform.rotation = Quaternion.Euler(0f, rotY, 0f);
            go.transform.localScale = Vector3.one * scale;
            return go;
        }

        /// <summary>틴트별 머티리얼 클론 캐시 — MPB 대신 공유 머티리얼 스왑 (SRP Batcher 유지).</summary>
        public static void Tint(GameObject go, Color tint, Dictionary<int, Material> cache)
        {
            // 8단계 양자화 — 캐시 키 폭발 방지
            int key = (Mathf.RoundToInt(Mathf.Clamp01(tint.r / 1.3f) * 31f) << 10)
                    | (Mathf.RoundToInt(Mathf.Clamp01(tint.g / 1.3f) * 31f) << 5)
                    | Mathf.RoundToInt(Mathf.Clamp01(tint.b / 1.3f) * 31f);
            foreach (var r in go.GetComponentsInChildren<MeshRenderer>())
            {
                if (!cache.TryGetValue(key, out var mat) || mat == null)
                {
                    mat = new Material(r.sharedMaterial);
                    mat.SetColor("_BaseColor", tint);
                    cache[key] = mat;
                }
                var shared = new Material[r.sharedMaterials.Length];
                for (int i = 0; i < shared.Length; i++) shared[i] = mat;
                r.sharedMaterials = shared;
            }
        }

        // ───────── 기하 (GameView와 동일 판정 — 통합 시 한 곳으로 합친다) ─────────

        static float PerpDistToPath(float px, float py)
        {
            var wp = MapData.WAYPOINTS;
            float best = float.MaxValue;
            for (int i = 0; i < wp.Length - 1; i++)
            {
                var a = wp[i]; var b = wp[i + 1];
                float dx = b.X - a.X, dy = b.Y - a.Y;
                float l2 = dx * dx + dy * dy;
                float t = l2 > 0f ? Mathf.Clamp01(((px - a.X) * dx + (py - a.Y) * dy) / l2) : 0f;
                float cx = a.X + t * dx, cy = a.Y + t * dy;
                best = Mathf.Min(best, MapData.Hypot(px - cx, py - cy));
            }
            return best;
        }

        static bool IsNearSlot(float px, float py)
        {
            foreach (var s in MapData.SLOT_POS)
                if (MapData.Hypot(s.X - px, s.Y - py) < MapData.TILE * 0.75f) return true;
            return false;
        }

        static bool IsNearSlot2(float px, float py, float tiles)
        {
            foreach (var s in MapData.SLOT_POS)
                if (MapData.Hypot(s.X - px, s.Y - py) < MapData.TILE * tiles) return true;
            return false;
        }
    }
}

