// ───────── Tiled 맵(gtd-map) 로딩 + 엔진↔맵 좌표 변환 ─────────
// BattleScene(실게임)과 /dev/tiled-map(검수실)이 같은 값을 쓰도록 여기 한 곳에 둔다.
//
//   resources/map/gtd-map.tmx        ← Tiled로 편집 (원본)
//     └ python3 tools/map/tmx-to-phaser.py
//       └ phaser/public/assets/map/gtd-map.json (+ tx-*.png)  ← 여기서 읽는 것
//
// ── 좌표계 ──
//  엔진(@engine/core/map)은 TILE=36px 논리 격자. 맵은 32px 타일 2장이 논리 1칸(64px)이다.
//  따라서 맵 픽셀 = 엔진 픽셀 × 64/36, 그리고 엔진 CENTER(210,250)가 맵 (640,448)에 온다.
//
//  [검증] ORIGIN은 눈대중이 아니다 — 엔진 십자(CROSS_BARS) 68칸을 이 식으로 변환했을 때
//  .tmx의 'L2-잔디'(고지대)와 어긋나는 칸이 0이 되는 값이다. 32px씩 옮겨보면 바로 깨진다
//  (±1타일에서 2칸, ±2타일에서 18칸 어긋남). **맵을 위아래로 자르거나 늘리면 여기도 고쳐야 한다** —
//  tools/map/check-map-coverage.py가 이 값을 읽어 검증하니 그걸 돌려 재확정할 것.
//  (이력: 40×30 y=480 → 상단 4행 삭제로 40×26 y=352 → 상단 3행 복원으로 40×29 y=448.
//   입·출구 통로가 카메라 상단(월드 y0)까지 이어지려면 이 3행이 필요했다.)

import type Phaser from 'phaser';

/** 논리 1칸(엔진 TILE=36) = 맵 타일 2장(64px) */
export const MAP_SCALE = 64 / 36;
/** 엔진 CENTER(210,250)가 놓이는 맵 픽셀 좌표 */
export const MAP_ORIGIN: readonly [number, number] = [640, 448];
/** 엔진 CENTER 상수 사본 — MAP_ORIGIN이 대응하는 엔진 좌표 */
const ENGINE_CENTER: readonly [number, number] = [210, 250];

/** 엔진 좌표 → 맵 픽셀 */
export const toMapX = (x: number): number => (x - ENGINE_CENTER[0]) * MAP_SCALE + MAP_ORIGIN[0];
export const toMapY = (y: number): number => (y - ENGINE_CENTER[1]) * MAP_SCALE + MAP_ORIGIN[1];

export const TILEMAP_KEY = 'gtd-map';

/** .tmx의 tileset name → public/assets/map의 시트 (tools/map/tmx-to-phaser.py의 SHEET_FILENAME과 짝) */
const SHEETS: readonly (readonly [string, string])[] = [
  ['cainos-grass', 'tx-grass'],
  ['cainos-wall', 'tx-wall'],
  ['cainos-struct', 'tx-struct'],
  ['cainos-plant-shadow', 'tx-plant'],
  ['cainos-props-shadow', 'tx-props'],
];

/** preload()에서 호출 — 타일셋 시트 5장 + 맵 JSON */
export function preloadTiledMap(scene: Phaser.Scene): void {
  for (const [, file] of SHEETS) scene.load.image(file, `assets/map/${file}.png`);
  scene.load.tilemapTiledJSON(TILEMAP_KEY, 'assets/map/gtd-map.json');
}

export interface TiledMapView {
  map: Phaser.Tilemaps.Tilemap;
  layers: Phaser.Tilemaps.TilemapLayer[];
}

/**
 * create()에서 호출 — 맵을 만들어 레이어를 전부 그린다.
 *
 * @param inEngineSpace true면 레이어를 엔진 월드 좌표계에 맞춰 축소·배치한다(실게임).
 *   false면 맵 픽셀 그대로 둔다(검수실 — 타일이 원본 32px로 보인다).
 * @param depthBase 첫 레이어의 depth. 이후 레이어는 +1씩.
 */
export function createTiledMap(
  scene: Phaser.Scene,
  { inEngineSpace = false, depthBase = 0 } = {},
): TiledMapView {
  const map = scene.make.tilemap({ key: TILEMAP_KEY });
  // 시트를 전부 등록하고 레이어마다 전부 넘긴다 — Tiled에서 한 레이어가 여러 시트를
  // 섞어 쓸 수 있으므로(소품 레이어가 plant+props 혼용) 굳이 나누지 않는다.
  const tilesets = SHEETS.map(([tiledName, file]) => map.addTilesetImage(tiledName, file)).filter(
    (t): t is Phaser.Tilemaps.Tileset => t !== null,
  );

  // 엔진 공간으로 넣을 때: 맵 픽셀 → 엔진 픽셀이므로 축소율은 MAP_SCALE의 역수.
  // 레이어 원점(맵 0,0)이 가는 엔진 좌표를 그대로 위치로 준다.
  const s = 1 / MAP_SCALE;
  const ox = ENGINE_CENTER[0] - MAP_ORIGIN[0] * s;
  const oy = ENGINE_CENTER[1] - MAP_ORIGIN[1] * s;

  const layers: Phaser.Tilemaps.TilemapLayer[] = [];
  // 이름이 아니라 인덱스 순서로 그린다 — .tmx의 레이어 순서가 곧 그리기 순서다.
  map.layers.forEach((_, i) => {
    const layer = map.createLayer(i, tilesets, 0, 0);
    if (!layer) return;
    layer.setDepth(depthBase + i);
    if (inEngineSpace) layer.setScale(s).setPosition(ox, oy);
    layers.push(layer);
  });

  return { map, layers };
}
