// Tiled로 손수 그린 맵(resources/map/gtd-map.tmx)을 Phaser 타일맵으로 띄우는 검수실.
//
// map-lab(절차적 생성)과 다른 점: 여기서는 아무것도 생성하지 않는다. Tiled에서 찍은
// 타일을 그대로 읽어 그린다 — 맵의 원본은 .tmx 파일이고, 이 씬은 뷰어다.
//
//   resources/map/gtd-map.tmx        ← Tiled로 편집 (원본)
//     └ python3 tools/map/tmx-to-phaser.py
//       └ phaser/public/assets/map/gtd-map.json (+ tx-*.png)  ← 이 씬이 읽는 것
//
// 좌표 변환(MAP_SCALE·MAP_ORIGIN)과 로딩은 실게임과 공유한다 — src/tiled-map.ts가 원본.
// 이 검수실은 맵을 **원본 32px 그대로**(inEngineSpace 없이) 띄우고, 그 위에 엔진
// 지오메트리를 변환해 겹쳐 그려 정합을 눈으로 확인한다.
// 주의: .tmx '마커'의 제단 오브젝트는 (640,384)로 한 타일 아래다(손배치 오차).
// 겹쳐보기에서 흰 점과 계산값이 그만큼 벌어져 보인다 — 맵 아트가 아니라 마커가 틀렸다.
import Phaser from 'phaser';
import { CROSS_BARS, DOOR_IN, DOOR_OUT, SLOT_POS, WAYPOINTS } from '@engine/core/map';
import { MAP_SCALE, createTiledMap, preloadTiledMap, toMapX, toMapY } from '../../tiled-map';

class TiledMapScene extends Phaser.Scene {
  private layers: Phaser.Tilemaps.TilemapLayer[] = [];
  private overlay?: Phaser.GameObjects.Container;
  /**
   * 겹쳐보기 희망 상태. create()는 preload 뒤에 비동기로 도는데 Svelte는 그 전에
   * setOverlayVisible을 부른다 — 여기에 담아뒀다가 오버레이가 생길 때 반영한다.
   */
  private overlayVisible = false;
  /** 레이어 목록이 준비되면 Svelte 범례에 알린다 */
  constructor(private onLayers?: (names: string[]) => void) {
    super('tiled-map');
  }

  preload(): void {
    this.load.setBaseURL('/');
    preloadTiledMap(this);
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#1c2026');

    const { map, layers } = createTiledMap(this); // 검수실은 맵 픽셀 그대로(32px 원본)
    this.layers = layers;
    this.onLayers?.(this.layers.map((l) => l.layer.name));

    this.drawOverlay(map);

    // 캔버스가 맵보다 크면 남는 공간이 생긴다 — 맵 중앙을 화면 중앙에 맞춘다.
    this.cameras.main.centerOn(map.widthInPixels / 2, map.heightInPixels / 2);

    this.input.keyboard?.on('keydown-O', () => this.setOverlayVisible(!this.overlayVisible));
    this.layers.forEach((layer, i) => {
      if (i > 8) return; // 숫자키는 1..9만
      this.input.keyboard?.on(`keydown-${['ONE','TWO','THREE','FOUR','FIVE','SIX','SEVEN','EIGHT','NINE'][i]}`, () => {
        layer.setVisible(!layer.visible);
      });
    });
  }

  /** 엔진 지오메트리를 맵 좌표로 변환해 겹쳐 그린다 — 타일 아트와 로직이 맞는지 눈으로 검증 */
  private drawOverlay(map: Phaser.Tilemaps.Tilemap): void {
    this.overlay = this.add.container(0, 0).setDepth(100).setVisible(this.overlayVisible);
    const g = this.add.graphics();

    // 십자 지형(타워가 서는 고지대)
    g.lineStyle(2, 0x6fd3ff, 0.85);
    for (const bar of CROSS_BARS) {
      g.strokeRect(
        toMapX(bar.x),
        toMapY(bar.y),
        bar.w * MAP_SCALE,
        bar.h * MAP_SCALE,
      );
    }

    // 몹 경로 중심선
    g.lineStyle(3, 0xffb45c, 0.9);
    g.beginPath();
    WAYPOINTS.forEach(([x, y], i) => {
      const mx = toMapX(x);
      const my = toMapY(y);
      if (i === 0) g.moveTo(mx, my);
      else g.lineTo(mx, my);
    });
    g.strokePath();

    // 타워 슬롯
    g.lineStyle(1.5, 0xf0d392, 0.8);
    const slot = 36 * MAP_SCALE;
    for (const [x, y] of SLOT_POS) {
      g.strokeRect(toMapX(x) - slot / 2, toMapY(y) - slot / 2, slot, slot);
    }

    // 입·출구
    g.fillStyle(0x8bff9a, 0.95);
    g.fillCircle(toMapX(DOOR_IN[0]), toMapY(DOOR_IN[1]), 7);
    g.fillStyle(0xff8b8b, 0.95);
    g.fillCircle(toMapX(DOOR_OUT[0]), toMapY(DOOR_OUT[1]), 7);
    this.overlay.add(g);

    // .tmx의 '마커' 오브젝트 레이어 — 손으로 찍은 위치. 위 원(엔진 계산값)과 겹쳐야 정합이다.
    const markers = map.getObjectLayer('마커');
    for (const obj of markers?.objects ?? []) {
      const dot = this.add.circle(obj.x ?? 0, obj.y ?? 0, 4, 0xffffff, 0.9);
      const label = this.add
        .text((obj.x ?? 0) + 8, (obj.y ?? 0) - 8, obj.name ?? '', {
          fontFamily: 'monospace',
          fontSize: '13px',
          color: '#ffffff',
        })
        .setStroke('#000000', 4);
      this.overlay.add(dot);
      this.overlay.add(label);
    }
  }

  setLayerVisible(index: number, visible: boolean): void {
    this.layers[index]?.setVisible(visible);
  }

  setOverlayVisible(visible: boolean): void {
    this.overlayVisible = visible;
    this.overlay?.setVisible(visible);
  }
}

export interface TiledMapLab {
  game: Phaser.Game;
  setLayerVisible(index: number, visible: boolean): void;
  setOverlayVisible(visible: boolean): void;
}

/** /dev/tiled-map 라우트가 onMount에서 생성하고 언마운트 시 destroy(true)한다 */
export function createTiledMapLab(
  parent: HTMLElement,
  onLayers?: (names: string[]) => void,
): TiledMapLab {
  const scene = new TiledMapScene(onLayers);
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: 1280,
    height: 928, // 맵 크기와 동일 (40×29 타일 × 32px)
    pixelArt: true,
    roundPixels: true,
    backgroundColor: '#1c2026',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: [scene],
  });
  return {
    game,
    setLayerVisible: (i, v) => scene.setLayerVisible(i, v),
    setOverlayVisible: (v) => scene.setOverlayVisible(v),
  };
}
