// ───────── 갓타디형 맵: 십자 둘레 한 바퀴 + 입/출구 분리 ─────────
// 중앙 십자(+) 타일 9칸을 몹이 "바짝 붙어" 시계방향으로 정확히 한 바퀴 돈다.
// 입구(좌상) → 십자 외곽선 일주 → 출구(좌하). 출구 도달 = 누출.
// 십자 팔/허브 = 외곽선 여러 변을 동시에 커버하는 요지,
// 외곽 타일 = 특정 변/문을 점사하는 자리 (80라 공략의 "새는 몹 점사").

export type Pt = readonly [number, number];

// 십자 타일 블록: 42px 격자, 중심 (210,270)
// 수직 바 x 189..231 (y 165..375) / 수평 바 y 249..291 (x 105..315)
// 경로는 타일 경계에서 18px 바깥을 지난다 (경로 폭 26 → 시각 간격 5px)
export const WAYPOINTS: Pt[] = [
  [-30, 231],   // 입구 (좌상 문, 화면 밖)
  [87, 231],    // 좌측 바 상단 모서리
  [171, 231],   // 내부 NW 코너
  [171, 147],   // 수직 바 좌상단
  [249, 147],   // 수직 바 우상단
  [249, 231],   // 내부 NE 코너
  [333, 231],   // 우측 바 상단 끝
  [333, 309],   // 우측 바 하단 끝
  [249, 309],   // 내부 SE 코너
  [249, 393],   // 수직 바 우하단
  [171, 393],   // 수직 바 좌하단
  [171, 309],   // 내부 SW 코너
  [87, 309],    // 좌측 바 하단 모서리
  [-30, 309],   // 출구 (좌하 문, 화면 밖)
];
export const DOOR_IN: Pt = [34, 231];
export const DOOR_OUT: Pt = [34, 309];

const SEG: number[] = [];
let total = 0;
for (let i = 0; i < WAYPOINTS.length - 1; i++) {
  const l = Math.hypot(
    WAYPOINTS[i + 1][0] - WAYPOINTS[i][0],
    WAYPOINTS[i + 1][1] - WAYPOINTS[i][1],
  );
  SEG.push(l);
  total += l;
}
// 경로 총 길이 — 끝(출구) 도달 = 누출 (루프 아님)
export const LOOP = total;

export function pathPos(d: number): [number, number] {
  if (d <= 0) return [WAYPOINTS[0][0], WAYPOINTS[0][1]];
  for (let i = 0; i < SEG.length; i++) {
    if (d <= SEG[i]) {
      const t = d / SEG[i];
      return [
        WAYPOINTS[i][0] + (WAYPOINTS[i + 1][0] - WAYPOINTS[i][0]) * t,
        WAYPOINTS[i][1] + (WAYPOINTS[i + 1][1] - WAYPOINTS[i][1]) * t,
      ];
    }
    d -= SEG[i];
  }
  const last = WAYPOINTS[WAYPOINTS.length - 1];
  return [last[0], last[1]];
}

export const TILE = 42;
export const SLOT_POS: Pt[] = [
  // ── 십자(+) 9칸: 몹 길이 사방을 감싸는 최고 요지 (십자가 빌드) ──
  [210, 186], [210, 228],   // 상 팔
  [210, 312], [210, 354],   // 하 팔
  [126, 270], [168, 270],   // 좌 팔
  [252, 270], [294, 270],   // 우 팔
  [210, 270],               // 허브 — 내부 코너 4개 동시 커버
  // ── 외곽 11칸: 변/문 점사 자리 ──
  [120, 120], [300, 120], [120, 420], [300, 420],  // 대각 코너
  [165, 84], [255, 84],                              // 상단 변 바깥
  [390, 180], [390, 360],                            // 우측 변 바깥
  [165, 456], [255, 456],                            // 하단 변 바깥
  [33, 270],                                         // 입/출구 문 사이 — 누출 점사 특등석
];
