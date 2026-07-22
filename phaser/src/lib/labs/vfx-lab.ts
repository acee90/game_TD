import Phaser from 'phaser';
import { makeGlowTextures, makeTextures } from '../../sprites';

interface Variant {
  id: string;
  name: string;
  note: string;
  life: number;
  width: number;
  alpha: number;
  glow?: boolean;
  attached?: boolean;
  streak?: boolean;
  ribbon?: boolean;
}

interface Segment {
  line: Phaser.GameObjects.Rectangle | Phaser.GameObjects.Image;
  life: number;
  max: number;
  glow: boolean;
  streak?: boolean;
  scale?: number;
}

interface FlyingArrow {
  img: Phaser.GameObjects.Image;
  variant: Variant;
  x0: number;
  y0: number;
  tx: number;
  ty: number;
  t: number;
  duration: number;
  arc: number;
  lastX: number;
  lastY: number;
  tail?: Phaser.GameObjects.Image;
  ribbon?: Phaser.GameObjects.Graphics;
  ribbonPoints: Phaser.Math.Vector2[];
}

const VARIANTS: Variant[] = [
  { id: 'A', name: 'CLEAN RIBBON', note: '현재 게임 · 하나로 이어지는 흰색 리본', life: 0.6, width: 1.5, alpha: 0.9, ribbon: true },
  { id: 'B', name: 'SILK LINE', note: '얇고 길게 이어지는 궤적', life: 0.7, width: 0.8, alpha: 0.8 },
  { id: 'C', name: 'BRIGHT CORE', note: '짧고 선명한 흰색 중심선', life: 0.3, width: 2.1, alpha: 1 },
  { id: 'D', name: 'COMET', note: '화살에 붙어 움직이는 테이퍼 tail', life: 0, width: 2, alpha: 0.95, attached: true },
  { id: 'E', name: 'MOON GLOW', note: '부드러운 빛을 겹친 장잔상', life: 0.58, width: 1.2, alpha: 0.95, glow: true },
  { id: 'F', name: 'DASH', note: '짧게 끊기는 빠른 스트릭', life: 0.2, width: 1.2, alpha: 0.85 },
];

class VfxLabScene extends Phaser.Scene {
  private arrows: FlyingArrow[] = [];
  private segments: Segment[] = [];
  private launchTimer = 0;

  preload(): void {
    // /dev/vfx-lab/ 라우트 기준 상대 경로가 깨지지 않게 루트 고정 — 서브패스 배포 시 paths.base 주입
    this.load.setBaseURL('/');
    this.load.image('arrow', 'assets/sprites/arrow.png');
  }

  create(): void {
    makeTextures(this);
    makeGlowTextures(this);
    this.makeTailTexture();
    this.cameras.main.setBackgroundColor('#100d09');

    VARIANTS.forEach((variant, index) => {
      const y = 74 + index * 92;
      this.add.rectangle(480, y, 920, 72, index % 2 ? 0x17120c : 0x1b160f, 1)
        .setStrokeStyle(1, 0x5b482b, 0.55);
      this.add.text(34, y - 20, variant.id, {
        fontFamily: 'Rajdhani, sans-serif', fontStyle: 'bold', fontSize: 25, color: '#f0d392',
      });
      this.add.text(70, y - 20, variant.name, {
        fontFamily: 'Rajdhani, sans-serif', fontStyle: 'bold', fontSize: 15, color: '#e8e2d0',
      });
      this.add.text(70, y + 3, variant.note, {
        fontFamily: 'Gowun Dodum, sans-serif', fontSize: 11, color: '#8f8677',
      });
      this.add.circle(248, y, 3, 0xd3aa60, 0.7);
      this.add.circle(902, y, 8, 0x5b2d26, 0.55).setStrokeStyle(1, 0xd36e52, 0.7);
    });

    this.launchAll();
  }

  update(_time: number, deltaMs: number): void {
    const dt = Math.min(deltaMs / 1000, 0.05);
    this.launchTimer -= dt;
    if (this.launchTimer <= 0) this.launchAll();

    for (let i = this.segments.length - 1; i >= 0; i--) {
      const segment = this.segments[i];
      segment.life -= dt;
      if (segment.life <= 0) {
        segment.line.destroy();
        this.segments.splice(i, 1);
      } else {
        const fade = segment.life / segment.max;
        segment.line.setAlpha(fade * fade * (segment.glow ? 0.42 : 1));
        if (segment.streak && segment.scale) {
          segment.line.setScale(
            segment.scale * (0.82 + fade * 0.18),
            segment.scale * (0.22 + fade * 0.78),
          );
        }
      }
    }

    for (let i = this.arrows.length - 1; i >= 0; i--) {
      const arrow = this.arrows[i];
      arrow.t = Math.min(1, arrow.t + dt / arrow.duration);
      const x = Phaser.Math.Linear(arrow.x0, arrow.tx, arrow.t);
      const y = Phaser.Math.Linear(arrow.y0, arrow.ty, arrow.t) - Math.sin(Math.PI * arrow.t) * arrow.arc;
      const dy = (arrow.ty - arrow.y0) - Math.PI * Math.cos(Math.PI * arrow.t) * arrow.arc;
      const rotation = Math.atan2(dy, arrow.tx - arrow.x0);
      arrow.img.setPosition(x, y).setRotation(rotation);
      arrow.tail?.setPosition(x, y).setRotation(rotation);

      if (arrow.variant.ribbon) {
        const last = arrow.ribbonPoints[arrow.ribbonPoints.length - 1];
        if (Phaser.Math.Distance.Between(last.x, last.y, x, y) >= 1.5) {
          arrow.ribbonPoints.push(new Phaser.Math.Vector2(x, y));
          if (arrow.ribbonPoints.length > 36) arrow.ribbonPoints.shift();
          this.drawRibbon(arrow);
        }
      } else if (!arrow.variant.attached) this.addSegment(arrow, x, y);
      if (arrow.t >= 1) {
        arrow.img.destroy();
        arrow.tail?.destroy();
        if (arrow.ribbon) {
          const ribbon = arrow.ribbon;
          this.tweens.add({ targets: ribbon, alpha: 0, duration: 260, onComplete: () => ribbon.destroy() });
        }
        this.arrows.splice(i, 1);
      }
    }
  }

  private launchAll(): void {
    this.launchTimer = 1.35;
    VARIANTS.forEach((variant, index) => {
      const y = 74 + index * 92;
      const img = this.add.image(258, y, 'arrow').setScale(0.7).setTint(0xf5f1e8).setDepth(3);
      const tail = variant.attached
        ? this.add.image(258, y, 'lab-tail').setOrigin(1, 0.5).setBlendMode(Phaser.BlendModes.ADD).setDepth(2)
        : undefined;
      const ribbon = variant.ribbon
        ? this.add.graphics().setDepth(2).setBlendMode(Phaser.BlendModes.ADD)
        : undefined;
      this.arrows.push({ img, tail, ribbon, ribbonPoints: [new Phaser.Math.Vector2(258, y)],
        variant, x0: 258, y0: y, tx: 892, ty: y, t: 0,
        duration: 634 / 312, arc: 48, lastX: 258, lastY: y });
    });
  }

  private drawRibbon(arrow: FlyingArrow): void {
    const ribbon = arrow.ribbon;
    if (!ribbon || arrow.ribbonPoints.length < 2) return;
    ribbon.clear();
    for (let i = 1; i < arrow.ribbonPoints.length; i++) {
      const strength = i / (arrow.ribbonPoints.length - 1);
      const from = arrow.ribbonPoints[i - 1];
      const to = arrow.ribbonPoints[i];
      ribbon.lineStyle(4.2 * strength, 0xffffff, 0.06 + strength * 0.12);
      ribbon.beginPath().moveTo(from.x, from.y).lineTo(to.x, to.y).strokePath();
      ribbon.lineStyle(0.65 + strength * 0.85, 0xffffff, 0.2 + strength * 0.75);
      ribbon.beginPath().moveTo(from.x, from.y).lineTo(to.x, to.y).strokePath();
    }
  }

  private addSegment(arrow: FlyingArrow, x: number, y: number): void {
    const dx = x - arrow.lastX;
    const dy = y - arrow.lastY;
    const length = Math.hypot(dx, dy);
    if (length < 1) return;
    const v = arrow.variant;
    if (v.streak) {
      const scale = 0.42;
      const line = this.add.image(x, y, 'trail-streak')
        .setOrigin(1, 0.5)
        .setRotation(Math.atan2(dy, dx))
        .setScale(scale)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(2);
      this.segments.push({ line, life: v.life, max: v.life, glow: false, streak: true, scale });
      arrow.lastX = x;
      arrow.lastY = y;
      return;
    }
    const make = (width: number, alpha: number, glow: boolean) => {
      const line = this.add.rectangle((arrow.lastX + x) / 2, (arrow.lastY + y) / 2, length + 1.5, width, 0xffffff, alpha)
        .setRotation(Math.atan2(dy, dx)).setDepth(glow ? 1 : 2);
      if (glow) line.setBlendMode(Phaser.BlendModes.ADD);
      this.segments.push({ line, life: v.life, max: v.life, glow });
    };
    if (v.glow) make(5, 0.3, true);
    make(v.width, v.alpha, false);
    arrow.lastX = x;
    arrow.lastY = y;
  }

  private makeTailTexture(): void {
    const tex = this.textures.createCanvas('lab-tail', 76, 8);
    if (!tex) return;
    const gradient = tex.context.createLinearGradient(0, 0, 76, 0);
    gradient.addColorStop(0, 'rgba(255,255,255,0)');
    gradient.addColorStop(0.7, 'rgba(255,255,255,.35)');
    gradient.addColorStop(1, 'rgba(255,255,255,1)');
    tex.context.fillStyle = gradient;
    tex.context.fillRect(0, 3, 76, 2);
    tex.refresh();
    tex.setFilter(Phaser.Textures.FilterMode.LINEAR);
  }
}

/** /dev/vfx-lab 라우트가 onMount에서 생성하고 언마운트 시 destroy(true)한다 */
export function createVfxLab(parent: HTMLElement): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: 960,
    height: 610,
    pixelArt: true,
    roundPixels: true,
    backgroundColor: '#100d09',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: [VfxLabScene],
  });
}
