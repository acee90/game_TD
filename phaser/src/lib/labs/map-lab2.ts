// Pixel Art Top Down - Basic v1.2.3 기반 맵 타일 미리보기.
// 게임 규칙·경로 좌표는 @engine/core/map에서 가져오고, 이 파일은 시각 레이어만 담당한다.
import Phaser from 'phaser';
import { CENTER, CROSS_BARS, SLOT_POS, TILE, WAYPOINTS } from '@engine/core/map';

const WORLD_W = 420;
const WORLD_H = 470;
const HALF = TILE / 2;
const GRID_COLS = 12;
const GRID_ROWS = 14;

const DEPTH = { ground: 0, path: 2, wall: 4, slots: 6, labels: 10, overlay: 20 };

class MapLab2Scene extends Phaser.Scene {
  private showGrid = false;
  private grid!: Phaser.GameObjects.Graphics;
  private gridLabel!: Phaser.GameObjects.Text;

  preload(): void {
    this.load.setBaseURL('/');
    this.load.image('map2-grass', 'assets/tiles/pixel-topdown-grass.png');
    this.load.image('map2-stone', 'assets/tiles/pixel-topdown-stone.png');
    this.load.image('map2-wall', 'assets/tiles/pixel-topdown-wall.png');
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#24211d');
    this.drawGrass();
    this.drawPath();
    this.drawWalls();
    this.drawSlots();
    this.drawGrid();
    this.drawHud();
    this.input.keyboard?.on('keydown-G', () => {
      this.showGrid = !this.showGrid;
      this.grid.setVisible(this.showGrid);
      this.gridLabel.setText(`G: 격자 ${this.showGrid ? '켜짐' : '꺼짐'}`);
    });
  }

  private tile(key: string, x: number, y: number, depth: number): Phaser.GameObjects.Image {
    return this.add
      .image(x, y, key)
      .setDisplaySize(TILE, TILE)
      .setDepth(depth)
      .setOrigin(0.5);
  }

  private drawGrass(): void {
    for (let row = 0; row < GRID_ROWS; row++) {
      for (let col = 0; col < GRID_COLS; col++) {
        this.tile('map2-grass', col * TILE + HALF, row * TILE + HALF, DEPTH.ground);
      }
    }
  }

  private snapPath(value: number, center: number): number {
    return center + Math.round((value - center) / TILE) * TILE;
  }

  private putPathCell(x: number, y: number, seen: Set<string>): void {
    const key = `${x},${y}`;
    if (seen.has(key)) return;
    seen.add(key);
    this.tile('map2-stone', x, y, DEPTH.path);
  }

  private drawPath(): void {
    const seen = new Set<string>();
    for (let i = 0; i < WAYPOINTS.length - 1; i++) {
      const [ax, ay] = WAYPOINTS[i];
      const [bx, by] = WAYPOINTS[i + 1];
      const horizontal = ay === by;
      const steps = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / TILE));
      for (let k = 0; k <= steps; k++) {
        const x = ax + ((bx - ax) * k) / steps;
        const y = ay + ((by - ay) * k) / steps;
        if (horizontal) {
          const cy = this.snapPath(y, CENTER[1]);
          this.putPathCell(this.snapPath(x, CENTER[0]), cy, seen);
          this.putPathCell(this.snapPath(x, CENTER[0]), cy + TILE, seen);
        } else {
          const cx = this.snapPath(x, CENTER[0]);
          this.putPathCell(cx, this.snapPath(y, CENTER[1]), seen);
          this.putPathCell(cx + TILE, this.snapPath(y, CENTER[1]), seen);
        }
      }
    }
  }

  private drawWalls(): void {
    // 십자 plateau의 외곽에 반복 벽 타일을 놓아 빈 그리드 대신 지형 단차를 읽게 한다.
    const g = this.add.graphics().setDepth(DEPTH.wall);
    g.lineStyle(3, 0x302c2e, 0.45);
    for (const bar of CROSS_BARS) {
      g.strokeRect(bar.x, bar.y, bar.w, bar.h);
    }
    for (let x = 18; x <= WORLD_W - 18; x += TILE) {
      this.tile('map2-wall', x, 2, DEPTH.wall);
      this.tile('map2-wall', x, WORLD_H - 2, DEPTH.wall);
    }
  }

  private drawSlots(): void {
    const g = this.add.graphics().setDepth(DEPTH.slots);
    for (const [x, y] of SLOT_POS) {
      g.lineStyle(1, 0xf0d392, 0.32);
      g.strokeRect(x - HALF + 2, y - HALF + 2, TILE - 4, TILE - 4);
    }
    g.lineStyle(2, 0xf0d392, 0.72);
    g.strokeRect(CENTER[0] - HALF + 1, CENTER[1] - HALF + 1, TILE - 2, TILE - 2);
  }

  private drawGrid(): void {
    this.grid = this.add.graphics().setDepth(DEPTH.overlay).setVisible(false);
    this.grid.lineStyle(1, 0xffffff, 0.14);
    for (let x = 0; x <= WORLD_W; x += TILE) {
      this.grid.lineBetween(x, 0, x, WORLD_H);
    }
    for (let y = 0; y <= WORLD_H; y += TILE) {
      this.grid.lineBetween(0, y, WORLD_W, y);
    }
  }

  private drawHud(): void {
    this.add.text(12, 12, 'Pixel Art Top Down · 타일 맵 미리보기', {
      fontFamily: 'Rajdhani, sans-serif', fontSize: 16, fontStyle: 'bold', color: '#f0d392',
      stroke: '#302c2e', strokeThickness: 3,
    }).setDepth(DEPTH.labels);
    this.gridLabel = this.add.text(12, WORLD_H - 22, 'G: 격자 꺼짐', {
      fontFamily: 'Rajdhani, sans-serif', fontSize: 12, color: '#e8e2d0',
      stroke: '#302c2e', strokeThickness: 2,
    }).setDepth(DEPTH.labels);
  }
}

export function createMapLab2(parent: HTMLElement): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: WORLD_W,
    height: WORLD_H,
    pixelArt: true,
    roundPixels: true,
    backgroundColor: '#24211d',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: [MapLab2Scene],
  });
}
