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

export type Pt = readonly [number, number];

export const TILE = 36;

/** 십자 중심 */
export const CENTER: Pt = [210, 250];

/** 가지 하나의 타일 수 */
export const ARM_TILES = 4;

const HALF = TILE / 2;
const REACH = TILE * ARM_TILES + HALF; // 중심에서 가지 끝 바깥면까지

/** 십자 지형 사각형 두 개 (세로 바 / 가로 바) */
export const CROSS_BARS = [
  { x: CENTER[0] - HALF, y: CENTER[1] - REACH, w: TILE, h: REACH * 2 },
  { x: CENTER[0] - REACH, y: CENTER[1] - HALF, w: REACH * 2, h: TILE },
] as const;

/** 경로가 십자 바깥면에서 떨어진 거리 */
const OFFSET = 20;

const barL = CENTER[0] - HALF - OFFSET; // 172
const barR = CENTER[0] + HALF + OFFSET; // 248
const barT = CENTER[1] - REACH - OFFSET; // 68
const barB = CENTER[1] + REACH + OFFSET; // 432
const armT = CENTER[1] - HALF - OFFSET; // 212
const armB = CENTER[1] + HALF + OFFSET; // 288
const armL = CENTER[0] - REACH - OFFSET; // 28
const armR = CENTER[0] + REACH + OFFSET; // 392

/**
 * 십자 타일 17개 — 중앙 1 + 가지별 4.
 * 인덱스 0 = 중앙(제단 자리), 이후 상·하·좌·우 순서.
 */
const CROSS_SLOTS: readonly Pt[] = [
  CENTER,
  ...Array.from({ length: ARM_TILES }, (_, i) => [CENTER[0], CENTER[1] - TILE * (i + 1)] as const),
  ...Array.from({ length: ARM_TILES }, (_, i) => [CENTER[0], CENTER[1] + TILE * (i + 1)] as const),
  ...Array.from({ length: ARM_TILES }, (_, i) => [CENTER[0] - TILE * (i + 1), CENTER[1]] as const),
  ...Array.from({ length: ARM_TILES }, (_, i) => [CENTER[0] + TILE * (i + 1), CENTER[1]] as const),
];

/**
 * 모서리 타일 — 경로 바깥의 네 모서리에 3×2 블록씩, 모두 24칸.
 * 십자 타일과 달리 경로의 한쪽 변만 커버하므로 사거리가 짧은 유닛에게는 자리가 아깝다.
 * 대신 십자가 꽉 차도 계속 유닛을 놓을 수 있어 후반의 골드 소비처가 된다.
 */
export const CORNER_COLS = 3;
export const CORNER_ROWS = 2;

/** 경로 선의 절반 두께 + 타일 절반 — 이만큼은 경로 중심선에서 떨어져야 겹치지 않는다 */
const CLEARANCE = 12 + TILE / 2;

const cornerBlock = (originX: number, originY: number, dx: number, dy: number): Pt[] =>
  Array.from({ length: CORNER_COLS * CORNER_ROWS }, (_, i) => {
    const col = i % CORNER_COLS;
    const row = Math.floor(i / CORNER_COLS);
    return [originX + dx * TILE * col, originY + dy * TILE * row] as const;
  });

// 네 모서리의 안쪽 한계 — 십자 세로바/가로바를 감싸는 경로선에서 CLEARANCE만큼 물러난 지점
const innerLeft = CENTER[0] - HALF - OFFSET - CLEARANCE;
const innerRight = CENTER[0] + HALF + OFFSET + CLEARANCE;
const innerTop = CENTER[1] - HALF - OFFSET - CLEARANCE;
const innerBottom = CENTER[1] + HALF + OFFSET + CLEARANCE;

const CORNER_SLOTS: readonly Pt[] = [
  ...cornerBlock(innerLeft, innerTop, -1, -1),
  ...cornerBlock(innerRight, innerTop, 1, -1),
  ...cornerBlock(innerLeft, innerBottom, -1, 1),
  ...cornerBlock(innerRight, innerBottom, 1, 1),
];

/** 유닛을 놓을 수 있는 모든 타일 */
export const SLOT_POS: readonly Pt[] = [...CROSS_SLOTS, ...CORNER_SLOTS];

/** 북측 왼쪽 입구 → 반시계 일주 → 북측 오른쪽 출구 */
export const WAYPOINTS: readonly Pt[] = [
  [barL, barT - 40], // 입구 (화면 밖)
  [barL, barT],
  [barL, armT],
  [armL, armT],
  [armL, armB],
  [barL, armB],
  [barL, barB],
  [barR, barB],
  [barR, armB],
  [armR, armB],
  [armR, armT],
  [barR, armT],
  [barR, barT],
  [barR, barT - 40], // 출구 (화면 밖)
];

export const DOOR_IN: Pt = WAYPOINTS[0];
export const DOOR_OUT: Pt = WAYPOINTS[WAYPOINTS.length - 1];

const SEGMENTS: number[] = [];
let total = 0;
for (let i = 0; i < WAYPOINTS.length - 1; i++) {
  const a = WAYPOINTS[i];
  const b = WAYPOINTS[i + 1];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  SEGMENTS.push(len);
  total += len;
}

/** 입구에서 출구까지의 경로 길이. 이만큼 이동하면 돌파한다. */
export const PATH_LENGTH = total;

/** 경로 위 거리 d의 좌표 */
export function pathPos(d: number): [number, number] {
  if (d <= 0) return [WAYPOINTS[0][0], WAYPOINTS[0][1]];
  let rest = d;
  for (let i = 0; i < SEGMENTS.length; i++) {
    if (rest <= SEGMENTS[i]) {
      const a = WAYPOINTS[i];
      const b = WAYPOINTS[i + 1];
      const t = SEGMENTS[i] === 0 ? 0 : rest / SEGMENTS[i];
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    }
    rest -= SEGMENTS[i];
  }
  const last = WAYPOINTS[WAYPOINTS.length - 1];
  return [last[0], last[1]];
}

/** 넥서스 — 보스 소환 지점. 십자 중앙. */
export const NEXUS: Pt = CENTER;

/**
 * 임의의 점에서 가장 가까운 경로 위 지점의 거리.
 * 영웅은 경로를 벗어날 수 없으므로 클릭 좌표를 여기에 투영해서 목적지로 삼는다.
 */
export function nearestPathDistance(x: number, y: number): number {
  const STEPS = 600;
  let best = 0;
  let bestGap = Infinity;
  for (let i = 0; i <= STEPS; i++) {
    const d = (i / STEPS) * PATH_LENGTH;
    const [px, py] = pathPos(d);
    const gap = Math.hypot(px - x, py - y);
    if (gap < bestGap) {
      bestGap = gap;
      best = d;
    }
  }
  return best;
}

/** 제단(십자 중앙)에서 가장 가까운 경로 지점 — 영웅이 부활하는 자리 */
export const ALTAR_PATH_DISTANCE = nearestPathDistance(CENTER[0], CENTER[1]);
