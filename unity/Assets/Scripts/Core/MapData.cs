// 원본: web/src/core/map.ts
// ───────── 십자(十) 일주 맵 ─────────
// 출처: docs/reference/god-td-x-vz056-map-analysis-v1.0.md §2.3
//
// 원본은 128x128 Jungle 맵에 76셀짜리 십자 arm이 4개 있고, 각 arm을 P1~P4가 하나씩 쓴다.
// 이 프로토는 1인용이라 arm 하나를 확대해서 쓴다.
//
// 몹은 북측 왼쪽 문으로 들어와 십자 외곽선을 **반시계방향**으로 한 바퀴 돌고
// 북측 오른쪽 문으로 나간다. 나가면 돌파(누출)다.
//
// 주의: 적의 실제 이동 경로는 원본에서 읽어낼 수 없다(Order 액션 0건, §9.5·§11.1).
// 이 경로는 '일주'라는 이름과 십자 지형에 맞춘 설계다.

using System;
using System.Collections.Generic;

namespace GodTD.Core
{
    /// <summary>2D 점 — 웹 캔버스 좌표계(px, y는 아래로)</summary>
    public readonly struct Pt
    {
        public readonly float X;
        public readonly float Y;
        public Pt(float x, float y) { X = x; Y = y; }
    }

    /// <summary>십자 지형 사각형 (세로 바 / 가로 바)</summary>
    public readonly struct Bar
    {
        public readonly float X;
        public readonly float Y;
        public readonly float W;
        public readonly float H;
        public Bar(float x, float y, float w, float h) { X = x; Y = y; W = w; H = h; }
    }

    public static class MapData
    {
        public const float TILE = 36f;

        /// <summary>십자 중심</summary>
        public static readonly Pt CENTER = new Pt(210f, 250f);

        /// <summary>가지 하나의 타일 수</summary>
        public const int ARM_TILES = 4;

        const float HALF = TILE / 2f;
        const float REACH = TILE * ARM_TILES + HALF; // 중심에서 가지 끝 바깥면까지

        /// <summary>십자 지형 사각형 두 개 (세로 바 / 가로 바)</summary>
        public static readonly Bar[] CROSS_BARS =
        {
            new Bar(CENTER.X - HALF, CENTER.Y - REACH, TILE, REACH * 2f),
            new Bar(CENTER.X - REACH, CENTER.Y - HALF, REACH * 2f, TILE),
        };

        /// <summary>경로가 십자 바깥면에서 떨어진 거리</summary>
        const float OFFSET = 20f;

        static readonly float barL = CENTER.X - HALF - OFFSET;  // 172
        static readonly float barR = CENTER.X + HALF + OFFSET;  // 248
        static readonly float barT = CENTER.Y - REACH - OFFSET; // 68
        static readonly float barB = CENTER.Y + REACH + OFFSET; // 432
        static readonly float armT = CENTER.Y - HALF - OFFSET;  // 212
        static readonly float armB = CENTER.Y + HALF + OFFSET;  // 288
        static readonly float armL = CENTER.X - REACH - OFFSET; // 28
        static readonly float armR = CENTER.X + REACH + OFFSET; // 392

        /// <summary>모서리 블록 크기 — 3×2 블록 4개 = 모서리 타일 24칸</summary>
        public const int CORNER_COLS = 3;
        public const int CORNER_ROWS = 2;

        /// <summary>경로 선의 절반 두께 + 타일 절반 — 이만큼은 경로 중심선에서 떨어져야 겹치지 않는다</summary>
        const float CLEARANCE = 12f + TILE / 2f;

        /// <summary>유닛을 놓을 수 있는 모든 타일 — 십자 17(인덱스 0 = 중앙/제단) + 모서리 24</summary>
        public static readonly Pt[] SLOT_POS;

        /// <summary>북측 왼쪽 입구 → 반시계 일주 → 북측 오른쪽 출구</summary>
        public static readonly Pt[] WAYPOINTS =
        {
            new Pt(barL, barT - 40f), // 입구 (화면 밖)
            new Pt(barL, barT),
            new Pt(barL, armT),
            new Pt(armL, armT),
            new Pt(armL, armB),
            new Pt(barL, armB),
            new Pt(barL, barB),
            new Pt(barR, barB),
            new Pt(barR, armB),
            new Pt(armR, armB),
            new Pt(armR, armT),
            new Pt(barR, armT),
            new Pt(barR, barT),
            new Pt(barR, barT - 40f), // 출구 (화면 밖)
        };

        public static Pt DOOR_IN => WAYPOINTS[0];
        public static Pt DOOR_OUT => WAYPOINTS[WAYPOINTS.Length - 1];

        static readonly float[] SEGMENTS;

        /// <summary>입구에서 출구까지의 경로 길이. 이만큼 이동하면 돌파한다.</summary>
        public static readonly float PATH_LENGTH;

        /// <summary>넥서스 — 보스 소환 지점. 십자 중앙.</summary>
        public static Pt NEXUS => CENTER;

        /// <summary>제단(십자 중앙)에서 가장 가까운 경로 지점 — 영웅이 부활하는 자리</summary>
        public static readonly float ALTAR_PATH_DISTANCE;

        /// <summary>정적 초기화 — 필드 간 의존 순서를 명시적으로 지킨다 (경로 → 제단 거리)</summary>
        static MapData()
        {
            SLOT_POS = BuildSlots();

            SEGMENTS = new float[WAYPOINTS.Length - 1];
            float total = 0f;
            for (int i = 0; i < WAYPOINTS.Length - 1; i++)
            {
                Pt a = WAYPOINTS[i];
                Pt b = WAYPOINTS[i + 1];
                float len = Hypot(b.X - a.X, b.Y - a.Y);
                SEGMENTS[i] = len;
                total += len;
            }
            PATH_LENGTH = total;

            CUM = new float[WAYPOINTS.Length];
            for (int i = 0; i < SEGMENTS.Length; i++) CUM[i + 1] = CUM[i] + SEGMENTS[i];

            ALTAR_PATH_DISTANCE = NearestPathDistance(CENTER.X, CENTER.Y);
        }

        static Pt[] BuildSlots()
        {
            var slots = new List<Pt>(17 + CORNER_COLS * CORNER_ROWS * 4);

            // 십자 타일 17개 — 중앙 1 + 가지별 4. 인덱스 0 = 중앙(제단 자리), 이후 상·하·좌·우 순서.
            slots.Add(CENTER);
            for (int i = 0; i < ARM_TILES; i++) slots.Add(new Pt(CENTER.X, CENTER.Y - TILE * (i + 1)));
            for (int i = 0; i < ARM_TILES; i++) slots.Add(new Pt(CENTER.X, CENTER.Y + TILE * (i + 1)));
            for (int i = 0; i < ARM_TILES; i++) slots.Add(new Pt(CENTER.X - TILE * (i + 1), CENTER.Y));
            for (int i = 0; i < ARM_TILES; i++) slots.Add(new Pt(CENTER.X + TILE * (i + 1), CENTER.Y));

            // 모서리 타일 — 경로 바깥의 네 모서리에 3×2 블록씩, 모두 24칸.
            // 십자 타일과 달리 경로의 한쪽 변만 커버하므로 사거리가 짧은 유닛에게는 자리가 아깝다.
            // 대신 십자가 꽉 차도 계속 유닛을 놓을 수 있어 후반의 골드 소비처가 된다.
            float innerLeft = CENTER.X - HALF - OFFSET - CLEARANCE;
            float innerRight = CENTER.X + HALF + OFFSET + CLEARANCE;
            float innerTop = CENTER.Y - HALF - OFFSET - CLEARANCE;
            float innerBottom = CENTER.Y + HALF + OFFSET + CLEARANCE;

            AddCornerBlock(slots, innerLeft, innerTop, -1, -1);
            AddCornerBlock(slots, innerRight, innerTop, 1, -1);
            AddCornerBlock(slots, innerLeft, innerBottom, -1, 1);
            AddCornerBlock(slots, innerRight, innerBottom, 1, 1);
            return slots.ToArray();
        }

        static void AddCornerBlock(List<Pt> slots, float originX, float originY, int dx, int dy)
        {
            for (int i = 0; i < CORNER_COLS * CORNER_ROWS; i++)
            {
                int col = i % CORNER_COLS;
                int row = i / CORNER_COLS;
                slots.Add(new Pt(originX + dx * TILE * col, originY + dy * TILE * row));
            }
        }

        public static float Hypot(float dx, float dy) => MathF.Sqrt(dx * dx + dy * dy);

        /// <summary>경로 위 거리 d의 좌표</summary>
        /// <summary>경로 위 거리 d에서 진행 방향 수직으로 lateral(px) 비낀 좌표 — 레인 표시 전용</summary>
        public static Pt PathPosOffset(float d, float lateral)
        {
            if (lateral == 0f) return PathPos(d);
            float rest = Math.Max(0f, Math.Min(d, PATH_LENGTH));
            for (int i = 0; i < SEGMENTS.Length; i++)
            {
                if (rest <= SEGMENTS[i])
                {
                    var a = WAYPOINTS[i];
                    var b = WAYPOINTS[i + 1];
                    float t = SEGMENTS[i] == 0f ? 0f : rest / SEGMENTS[i];
                    float nx = -(b.Y - a.Y) / SEGMENTS[i];
                    float ny = (b.X - a.X) / SEGMENTS[i];
                    return new Pt(a.X + (b.X - a.X) * t + nx * lateral, a.Y + (b.Y - a.Y) * t + ny * lateral);
                }
                rest -= SEGMENTS[i];
            }
            var last = WAYPOINTS[WAYPOINTS.Length - 1];
            return new Pt(last.X, last.Y);
        }

        public static Pt PathPos(float d)
        {
            if (d <= 0f) return WAYPOINTS[0];
            float rest = d;
            for (int i = 0; i < SEGMENTS.Length; i++)
            {
                if (rest <= SEGMENTS[i])
                {
                    Pt a = WAYPOINTS[i];
                    Pt b = WAYPOINTS[i + 1];
                    float t = SEGMENTS[i] == 0f ? 0f : rest / SEGMENTS[i];
                    return new Pt(a.X + (b.X - a.X) * t, a.Y + (b.Y - a.Y) * t);
                }
                rest -= SEGMENTS[i];
            }
            return WAYPOINTS[WAYPOINTS.Length - 1];
        }

        // ───────── 영웅 클릭 지점 이동 (hero-point-movement.md, 2026-07-16) ← web/src/core/map.ts ─────────

        /// <summary>길의 보행 가능 반폭(px) — 경로 중심선에서 좌우로 이만큼까지 걸을 수 있다.</summary>
        public const float WALKABLE_HALF_WIDTH = 12f;

        /// <summary>
        /// 코너 블렌딩 반경(px). 90도 코너에서 법선이 급변하므로 코너 근처에서 횡오프셋을
        /// 선형으로 눌러 0에 수렴시킨다 — 좌표가 연속이 되어 순간이동이 없다. [프로토 가설]
        /// </summary>
        public const float CORNER_BLEND = 18f;

        /// <summary>웨이포인트들의 누적 진행도 — 코너 블렌딩·투영용 (정적 초기화에서 채운다)</summary>
        static readonly float[] CUM;

        static float DistToNearestCorner(float d)
        {
            float best = float.PositiveInfinity;
            // 양 끝(입구·출구)은 코너가 아니다 — 내부 웨이포인트만
            for (int i = 1; i < CUM.Length - 1; i++) best = Math.Min(best, Math.Abs(d - CUM[i]));
            return best;
        }

        /// <summary>코너 감쇠가 적용된 실제 좌표 — 영웅 렌더·판정이 모두 이 좌표를 쓴다</summary>
        public static Pt PathPosLateral(float d, float lateral)
        {
            if (lateral == 0f) return PathPos(d);
            float damp = Math.Min(1f, DistToNearestCorner(d) / CORNER_BLEND);
            return PathPosOffset(d, lateral * damp);
        }

        public readonly struct PathProjection
        {
            /// <summary>최근접 경로 진행도</summary>
            public readonly float Distance;
            /// <summary>보행 폭으로 제한된 횡오프셋 (좌측 법선 기준 부호)</summary>
            public readonly float Lateral;
            /// <summary>실제(보정된) 목적지 좌표 — 목적지 마커는 여기에 찍는다</summary>
            public readonly float X;
            public readonly float Y;

            public PathProjection(float distance, float lateral, float x, float y)
            {
                Distance = distance;
                Lateral = lateral;
                X = x;
                Y = y;
            }
        }

        /// <summary>
        /// 클릭 좌표를 (진행도, 횡오프셋)으로 분해한다 — 구간별 수선의 발(해석적).
        /// 보행 영역 밖 클릭은 최근접 유효 지점으로 보정된다.
        /// fixture 비교: web/tests/hero-movement.test.ts — (180,100) → (72, −8).
        /// </summary>
        public static PathProjection ProjectToPath(float x, float y, float maxLateral = WALKABLE_HALF_WIDTH)
        {
            float bestGap = float.PositiveInfinity;
            float bestD = 0f;
            float bestLat = 0f;
            for (int i = 0; i < SEGMENTS.Length; i++)
            {
                float len = SEGMENTS[i];
                if (len == 0f) continue;
                Pt a = WAYPOINTS[i];
                Pt b = WAYPOINTS[i + 1];
                float ux = (b.X - a.X) / len; // 진행 방향 단위벡터
                float uy = (b.Y - a.Y) / len;
                float t = Math.Max(0f, Math.Min(len, (x - a.X) * ux + (y - a.Y) * uy));
                float px = a.X + ux * t;
                float py = a.Y + uy * t;
                float gap = Hypot(x - px, y - py);
                if (gap < bestGap)
                {
                    bestGap = gap;
                    bestD = CUM[i] + t;
                    // 좌측 법선(-uy, ux) 기준 부호 있는 횡오프셋
                    bestLat = (x - px) * -uy + (y - py) * ux;
                }
            }
            float lateral = Math.Max(-maxLateral, Math.Min(maxLateral, bestLat));
            Pt r = PathPosLateral(bestD, lateral);
            return new PathProjection(bestD, lateral, r.X, r.Y);
        }

        /// <summary>
        /// 임의의 점에서 가장 가까운 경로 위 지점의 거리.
        /// (2026-07-16: 600스텝 샘플링 → 해석적 투영. 결과 의미는 동일하되 더 정확하다.)
        /// </summary>
        public static float NearestPathDistance(float x, float y) => ProjectToPath(x, y, 0f).Distance;
    }
}
