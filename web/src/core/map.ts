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

/**
 * 길의 보행 가능 반폭(px) — 경로 중심선에서 좌우로 이만큼까지 걸을 수 있다.
 * 영웅 이동과 몹 횡오프셋(겹침 분리)이 모두 이 폭을 쓴다.
 * 12 → 20 (2026-07-19, 사용자 지시): 몹 겹침 분리를 넣으면서 몹끼리 길을 완전히
 * 막지 않도록 길을 ~1.7배 넓혔다. 몹(반지름 9) 기준 2~3열이 나란히 지나간다.
 */
export const WALKABLE_HALF_WIDTH = 20;

/** 보행 반폭 + 타일 절반 — 이만큼은 경로 중심선에서 떨어져야 겹치지 않는다 */
const CLEARANCE = WALKABLE_HALF_WIDTH + TILE / 2;

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

/**
 * 경로 위 거리 d에서 진행 방향의 수직으로 lateral(px)만큼 비낀 좌표.
 * 몹 2열 레인 렌더용 — **판정은 여전히 1D(distance)이고 이건 표시 전용이다.**
 */
export function pathPosOffset(d: number, lateral: number): [number, number] {
  if (lateral === 0) return pathPos(d);
  let rest = Math.max(0, Math.min(d, PATH_LENGTH));
  for (let i = 0; i < SEGMENTS.length; i++) {
    if (rest <= SEGMENTS[i]) {
      const a = WAYPOINTS[i];
      const b = WAYPOINTS[i + 1];
      const t = SEGMENTS[i] === 0 ? 0 : rest / SEGMENTS[i];
      const nx = -(b[1] - a[1]) / SEGMENTS[i]; // 좌측 법선
      const ny = (b[0] - a[0]) / SEGMENTS[i];
      return [a[0] + (b[0] - a[0]) * t + nx * lateral, a[1] + (b[1] - a[1]) * t + ny * lateral];
    }
    rest -= SEGMENTS[i];
  }
  const last = WAYPOINTS[WAYPOINTS.length - 1];
  return [last[0], last[1]];
}

/** 넥서스 — 보스 소환 지점. 십자 중앙. */
export const NEXUS: Pt = CENTER;

// ───────── 영웅 클릭 지점 이동 (hero-point-movement.md, 2026-07-16) ─────────
// 영웅 위치 = 경로 진행도 + 횡방향(법선) 오프셋. 중앙선 고정을 없애되
// 전후 진행·몸막기 의미는 유지한다. 몹 판정은 여전히 1D(distance)다.

/**
 * 코너 블렌딩 반경(px). 웨이포인트(90도 코너)에서 법선이 급변하므로, 코너에서
 * 이 거리 안에 들면 횡오프셋을 선형으로 눌러 0에 수렴시킨다 — 좌표가 연속이 되어
 * 순간이동이 없다. 영웅은 코너에서 중앙선으로 모였다가 다시 벌어진다. [프로토 가설]
 */
export const CORNER_BLEND = 18;

/** 웨이포인트들의 누적 진행도 — 코너 블렌딩용 */
const CUM: number[] = [0];
for (let i = 0; i < SEGMENTS.length; i++) CUM.push(CUM[i] + SEGMENTS[i]);

/** 진행도 d에서 가장 가까운 코너(내부 웨이포인트)까지의 경로거리 */
function distToNearestCorner(d: number): number {
  let best = Infinity;
  // 양 끝(입구·출구)은 코너가 아니다 — 내부 웨이포인트만
  for (let i = 1; i < CUM.length - 1; i++) best = Math.min(best, Math.abs(d - CUM[i]));
  return best;
}

/** 코너 감쇠가 적용된 실제 좌표 — 영웅 렌더·판정이 모두 이 좌표를 쓴다 */
export function pathPosLateral(d: number, lateral: number): [number, number] {
  if (lateral === 0) return pathPos(d);
  const damp = Math.min(1, distToNearestCorner(d) / CORNER_BLEND);
  return pathPosOffset(d, lateral * damp);
}

export interface PathProjection {
  /** 최근접 경로 진행도 */
  readonly distance: number;
  /** 보행 폭으로 제한된 횡오프셋 (좌측 법선 기준 부호) */
  readonly lateral: number;
  /** 실제(보정된) 목적지 좌표 — 목적지 마커는 여기에 찍는다 */
  readonly x: number;
  readonly y: number;
}

/**
 * 클릭 좌표를 (진행도, 횡오프셋)으로 분해한다 — 구간별 수선의 발(해석적).
 * 보행 영역 밖 클릭은 최근접 유효 지점으로 보정된다.
 */
export function projectToPath(
  x: number,
  y: number,
  maxLateral: number = WALKABLE_HALF_WIDTH,
): PathProjection {
  let bestGap = Infinity;
  let bestD = 0;
  let bestLat = 0;
  for (let i = 0; i < SEGMENTS.length; i++) {
    const len = SEGMENTS[i];
    if (len === 0) continue;
    const a = WAYPOINTS[i];
    const b = WAYPOINTS[i + 1];
    const ux = (b[0] - a[0]) / len; // 진행 방향 단위벡터
    const uy = (b[1] - a[1]) / len;
    const t = Math.max(0, Math.min(len, (x - a[0]) * ux + (y - a[1]) * uy));
    const px = a[0] + ux * t;
    const py = a[1] + uy * t;
    const gap = Math.hypot(x - px, y - py);
    if (gap < bestGap) {
      bestGap = gap;
      bestD = CUM[i] + t;
      // 좌측 법선(-uy, ux) 기준 부호 있는 횡오프셋
      bestLat = (x - px) * -uy + (y - py) * ux;
    }
  }
  const lateral = Math.max(-maxLateral, Math.min(maxLateral, bestLat));
  const [rx, ry] = pathPosLateral(bestD, lateral);
  return { distance: bestD, lateral, x: rx, y: ry };
}

/**
 * 임의의 점에서 가장 가까운 경로 위 지점의 거리.
 * (2026-07-16: 600스텝 샘플링 → 해석적 투영. 결과 의미는 동일하되 더 정확하다.)
 */
export function nearestPathDistance(x: number, y: number): number {
  return projectToPath(x, y, 0).distance;
}

/** 제단(십자 중앙)에서 가장 가까운 경로 지점 — 영웅이 부활하는 자리 */
export const ALTAR_PATH_DISTANCE = nearestPathDistance(CENTER[0], CENTER[1]);
