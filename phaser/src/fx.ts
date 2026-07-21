// ───────── 파티클 · 데미지 숫자 풀 ─────────
// 수백 개 수준이라 수동 풀이 제일 단순하고 예측 가능하다.
// (Phaser 내장 에미터도 있지만, 버스트마다 색이 다른 우리 용법엔 풀이 더 곧다.)

import Phaser from 'phaser';
import { tint } from './sprites';

// ───────── 캔버스 안 UI 폰트 ─────────
// 도트 스프라이트와 달리 텍스트는 **시인성이 우선**이다 (2026-07-21, 사용자 결정) —
// HUD(app.css)와 같은 시스템 산세리프로 맞추고, 3배 해상도로 구워 선명하게 표시한다.
export const UI_FONT = "system-ui, -apple-system, 'Noto Sans KR', sans-serif";
/** Phaser Text 내부 래스터 배율 — 카메라 zoom 2 + 레티나까지 감안한 값 */
export const UI_RES = 3;

interface Particle {
  img: Phaser.GameObjects.Image;
  vx: number;
  vy: number;
  life: number;
  max: number;
  gravity: number;
}

export class ParticlePool {
  private pool: Particle[] = [];

  constructor(private scene: Phaser.Scene, private depth: number, private cap = 240) {}

  burst(
    x: number,
    y: number,
    color: string,
    count: number,
    opts: {
      speed?: number; life?: number; gravity?: number; up?: boolean; scale?: number;
      /** HD-2D 가산 글로우 낱알 — 픽셀 파편('px') 대신 부드러운 'spark'를 ADD로 */
      glow?: boolean;
    } = {},
  ): void {
    const { speed = 60, life = 0.45, gravity = 90, up = false, scale = 1, glow = false } = opts;
    for (let i = 0; i < count; i++) {
      if (this.pool.filter((p) => p.life > 0).length >= this.cap) return;
      const p = this.acquire();
      const angle = up
        ? -Math.PI / 2 + (Math.random() - 0.5) * 0.9
        : Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.8);
      p.vx = Math.cos(angle) * v;
      p.vy = Math.sin(angle) * v;
      p.life = p.max = life * (0.6 + Math.random() * 0.7);
      p.gravity = gravity;
      p.img
        .setTexture(glow ? 'spark' : 'px')
        .setBlendMode(glow ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL)
        .setPosition(x, y)
        .setTint(tint(color))
        .setScale(glow ? scale * 0.8 : scale)
        .setVisible(true)
        .setAlpha(1);
    }
  }

  private acquire(): Particle {
    const idle = this.pool.find((p) => p.life <= 0);
    if (idle) return idle;
    const img = this.scene.add.image(0, 0, 'px').setDepth(this.depth).setVisible(false);
    const p: Particle = { img, vx: 0, vy: 0, life: 0, max: 1, gravity: 0 };
    this.pool.push(p);
    return p;
  }

  update(dt: number): void {
    for (const p of this.pool) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.img.setVisible(false);
        continue;
      }
      p.vy += p.gravity * dt;
      p.img.x += p.vx * dt;
      p.img.y += p.vy * dt;
      p.img.setAlpha(Math.min(1, (p.life / p.max) * 1.6));
    }
  }
}

interface RisingText {
  obj: Phaser.GameObjects.Text;
  life: number;
  max: number;
  vy: number;
}

export class TextPool {
  private pool: RisingText[] = [];

  constructor(private scene: Phaser.Scene, private depth: number, private cap = 48) {}

  spawn(x: number, y: number, text: string, color: string, big = false, crit = false): void {
    if (this.pool.filter((t) => t.life > 0).length >= this.cap) return;
    const t = this.acquire();
    // 크리티컬은 셰이크가 아니라 **숫자 변형**으로 말한다 (2026-07-21 피드백) —
    // 크고 금색이고 더 오래 떠 있는다
    t.obj
      .setText(crit ? `${text}!` : text)
      .setColor(crit ? '#ffd23f' : color)
      .setFontSize(crit ? 14 : big ? 12 : 9)
      .setPosition(x + (Math.random() - 0.5) * 8, y - 6)
      .setVisible(true)
      .setAlpha(1);
    t.life = t.max = crit ? 1.0 : big ? 0.9 : 0.55;
    t.vy = crit ? -20 : big ? -26 : -34;
  }

  private acquire(): RisingText {
    const idle = this.pool.find((t) => t.life <= 0);
    if (idle) return idle;
    const obj = this.scene.add
      .text(0, 0, '', {
        fontFamily: UI_FONT, fontStyle: 'bold', fontSize: 9, color: '#fff',
        stroke: '#1a130a', strokeThickness: 2,
      })
      .setOrigin(0.5, 1)
      .setDepth(this.depth)
      .setResolution(UI_RES)
      .setVisible(false);
    const t: RisingText = { obj, life: 0, max: 1, vy: -30 };
    this.pool.push(t);
    return t;
  }

  update(dt: number): void {
    for (const t of this.pool) {
      if (t.life <= 0) continue;
      t.life -= dt;
      if (t.life <= 0) {
        t.obj.setVisible(false);
        continue;
      }
      t.obj.y += t.vy * dt;
      t.obj.setAlpha(Math.min(1, (t.life / t.max) * 2));
    }
  }
}
