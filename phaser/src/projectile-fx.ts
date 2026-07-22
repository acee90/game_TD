// ───────── 공용 투사체 VFX 컨트롤러 ─────────
// BattleScene(실게임)과 TowerPreviewScene(Wiki 프리뷰)이 같은 API로 호출하는
// 시각 전용 모듈 (exec-plans/website-shell-tower-wiki.md §3.3, M4).
// 피해 계산·타깃 선택은 하지 않는다 — 시작점·도착점·색·병과·스플래시 반경 같은
// 렌더 데이터만 받아 본체·궤적·트레일·착탄을 그린다.
// 스타일·틴트·착탄 라우팅 계약: exec-plans/projectile-vfx-asset-brief.md.

import Phaser from 'phaser';
import type { Shot } from '@engine/game/types';
import { ParticlePool } from './fx';
import { tint } from './sprites';

export type ProjStyle = 'arrow' | 'shell' | 'bolt' | 'seed' | 'bullet';

/** 병과 → 투사체 스타일. 정규군 화살은 일부러 느리다 — 긴 꼬리가 살도록. */
export const RACE_PROJ: Record<number, { style: ProjStyle; speed: number }> = {
  0: { style: 'arrow', speed: 188 }, // 정규군 — 화살 (기존 대비 0.8배)
  1: { style: 'shell', speed: 205 }, // 포병 — 곡사 포탄
  2: { style: 'bolt', speed: 330 }, // 마법대 — 매직 볼트
  3: { style: 'seed', speed: 430 }, // 소환대 — 가시
};

const TRAIL: Record<ProjStyle, { interval: number; life: number; scale: number; gravity: number }> = {
  arrow: { interval: 0.016, life: 0.6, scale: 0.42, gravity: 0 }, // 리본은 별도 Graphics로 처리
  shell: { interval: 0.03, life: 0.45, scale: 0.8, gravity: -30 }, // 연기가 살짝 뜬다
  bolt: { interval: 0.02, life: 0.3, scale: 0.8, gravity: 0 },
  seed: { interval: 0.05, life: 0.2, scale: 0.7, gravity: 0 },
  bullet: { interval: 0.04, life: 0.18, scale: 0.7, gravity: 0 },
};

/**
 * 발사 렌더 입력 — 엔진 Shot의 시각 필드 부분집합.
 * BattleScene은 엔진 shots 큐를, 프리뷰는 파생한 가짜 발사를 그대로 넘긴다.
 */
export type ProjectileShot = Pick<
  Shot,
  | 'x' | 'y' | 'tx' | 'ty' | 'color' | 'splashRadius' | 'targetRadius'
  | 'race' | 'speed' | 'source'
>;

/** 날아가는 투사체 — 병과마다 모양·속도·꼬리가 다르다 (2026-07-21, 사용자 피드백) */
interface Proj {
  img: Phaser.GameObjects.Image;
  /** HD-2D 글로우 헤일로 — 마법 볼트·포탄이 빛을 끌고 다닌다 */
  halo?: Phaser.GameObjects.Image;
  ribbon?: Phaser.GameObjects.Graphics;
  ribbonPoints: Phaser.Math.Vector2[];
  x0: number; y0: number; tx: number; ty: number;
  /** 실제 판정 중심 — 범위 링은 여기에 남고 비행·착탄 그림만 tx/ty로 흩어진다. */
  hitX: number; hitY: number;
  t: number; dur: number;
  style: ProjStyle;
  color: string;
  splashRadius?: number;
  arcHeight: number;
  spin: number;
  trailTimer: number;
  prevX: number;
  prevY: number;
}

export class ProjectileFxController {
  private projectiles: Proj[] = [];
  private impactSerial = 0;

  constructor(
    private scene: Phaser.Scene,
    private particles: ParticlePool,
    /** 투사체 레이어 깊이 — 씬의 DEPTH.shot */
    private depth: number,
  ) {}

  /** 두 씬이 공유하는 에셋 — 화살 본체와 포병 착탄 플립북(후보 04, 사용자 승인) */
  static preload(scene: Phaser.Scene): void {
    scene.load.image('arrow', 'assets/sprites/arrow.png');
    scene.load.spritesheet('artillery-explosion', 'assets/sprites/explosion.png', {
      frameWidth: 48,
      frameHeight: 48,
    });
  }

  /** 포병 착탄 플립북 등록 — 3D 볼류메트릭이라 LINEAR, 24fps (에셋 지시서 B2) */
  static createAnimations(scene: Phaser.Scene): void {
    scene.textures.get('artillery-explosion').setFilter(Phaser.Textures.FilterMode.LINEAR);
    if (!scene.anims.exists('artillery-impact')) {
      scene.anims.create({
        key: 'artillery-impact',
        frames: scene.anims.generateFrameNumbers('artillery-explosion', { start: 0, end: 7 }),
        frameRate: 24,
        repeat: 0,
      });
    }
  }

  /** 발사 하나를 투사체로 — 병과별 모양·속도·꼬리. 제자리 발사는 즉시 폭발로 처리한다. */
  spawn(shot: ProjectileShot): void {
    const dist = Math.hypot(shot.tx - shot.x, shot.ty - shot.y);
    // 제자리 폭발 (유성·초신성·폭사) — 비행 없이 바로 터진다
    if (dist < 4) {
      if (shot.splashRadius) this.explode(shot.tx, shot.ty, shot.splashRadius, shot.color);
      return;
    }

    const conf = shot.source === 'hero'
      ? { style: 'arrow' as ProjStyle, speed: 312 }
      : shot.speed
        ? { style: 'arrow' as ProjStyle, speed: 312 }
        : shot.race !== undefined
          ? RACE_PROJ[shot.race]
          : { style: 'bullet' as ProjStyle, speed: 520 };
    const [impactX, impactY] = this.visualImpactPoint(shot.tx, shot.ty, shot.targetRadius);
    const img = this.scene.add
      .image(shot.x, shot.y, conf.style === 'bullet' ? 'shot' : conf.style)
      .setTint(tint(shot.color))
      .setScale(conf.style === 'arrow' ? 0.7 : 0.5)
      .setDepth(this.depth);
    // 포탄과 화살은 포물선 — 화살은 낮고 빠른 곡사다.
    const arcHeight = conf.style === 'shell' ? 10 + dist * 0.12 : conf.style === 'arrow' ? 6 + dist * 0.07 : 0;
    const ribbon = conf.style === 'arrow'
      ? this.scene.add.graphics().setDepth(this.depth - 1).setBlendMode(Phaser.BlendModes.ADD)
      : undefined;
    // 마법 볼트·포탄은 가산 글로우를 끌고 다닌다 (HD-2D)
    const halo = conf.style === 'bolt' || conf.style === 'shell'
      ? this.scene.add
          .image(shot.x, shot.y, 'glow')
          .setBlendMode(Phaser.BlendModes.ADD)
          .setTint(tint(shot.color))
          .setScale(0.35)
          .setAlpha(0.8)
          .setDepth(this.depth - 1)
      : undefined;
    this.projectiles.push({
      img,
      halo,
      ribbon,
      ribbonPoints: [new Phaser.Math.Vector2(shot.x, shot.y)],
      x0: shot.x, y0: shot.y, tx: impactX, ty: impactY,
      hitX: shot.tx, hitY: shot.ty,
      t: 0,
      dur: Math.max(0.08, Math.min(0.7, dist / conf.speed)),
      style: conf.style,
      color: shot.color,
      splashRadius: shot.splashRadius,
      arcHeight,
      spin: 0,
      trailTimer: 0,
      prevX: shot.x,
      prevY: shot.y,
    });
  }

  /** 지금 날고 있는 투사체 수 — 프리뷰의 발사 페이싱·테스트용 */
  get inFlight(): number {
    return this.projectiles.length;
  }

  /** 투사체 비행 — 포물선·회전·꼬리, 도착하면 임팩트/폭발. clock은 헤일로 맥동 위상. */
  update(dt: number, clock: number): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.t = Math.min(1, p.t + dt / p.dur);
      const u = p.t;
      const x = p.x0 + (p.tx - p.x0) * u;
      const y = p.y0 + (p.ty - p.y0) * u - Math.sin(Math.PI * u) * p.arcHeight;
      p.img.setPosition(x, y);
      p.halo?.setPosition(x, y).setScale(0.32 + 0.06 * Math.sin(clock * 22));

      if (p.style === 'shell' || p.style === 'seed') {
        p.spin += dt * (p.style === 'seed' ? 18 : 9);
        p.img.setRotation(p.spin);
      } else {
        // 실제 프레임 이동 벡터로 기수를 돌린다 — 곡사 중 상승·하강 각도가 그대로 반영된다.
        const vx = x - p.prevX;
        const vy = y - p.prevY;
        if (vx !== 0 || vy !== 0) p.img.setRotation(Math.atan2(vy, vx));
      }

      if (p.style === 'arrow') {
        const last = p.ribbonPoints[p.ribbonPoints.length - 1];
        if (Phaser.Math.Distance.Between(last.x, last.y, x, y) >= 1.5) {
          p.ribbonPoints.push(new Phaser.Math.Vector2(x, y));
          if (p.ribbonPoints.length > 36) p.ribbonPoints.shift();
          this.drawArrowRibbon(p);
        }
      }

      p.prevX = x;
      p.prevY = y;

      // 화살은 흰 발광 파티클을 쓰고 나머지 탄만 도트 꼬리를 남긴다.
      const trail = TRAIL[p.style];
      if (p.style !== 'arrow') p.trailTimer -= dt;
      if (p.style !== 'arrow' && p.trailTimer <= 0) {
        p.trailTimer = trail.interval;
        this.particles.burst(x, y, p.color, 1, {
          speed: 6, life: trail.life, gravity: trail.gravity, scale: trail.scale,
        });
      }

      if (u >= 1) {
        if (p.style === 'shell') {
          this.artilleryImpact(p.tx, p.ty, p.splashRadius, p.hitX, p.hitY);
        } else if (p.splashRadius) {
          this.explode(p.tx, p.ty, p.splashRadius, p.color, p.hitX, p.hitY);
        }
        else if (p.style === 'arrow') this.arrowImpact(p.tx, p.ty, p.color);
        else {
          this.particles.burst(p.tx, p.ty, p.color, 2, { speed: 40, life: 0.2, gravity: 0, scale: 0.8 });
        }
        p.img.destroy();
        p.halo?.destroy();
        if (p.ribbon) {
          const ribbon = p.ribbon;
          this.scene.tweens.add({ targets: ribbon, alpha: 0, duration: 260, ease: 'Sine.In', onComplete: () => ribbon.destroy() });
        }
        this.projectiles.splice(i, 1);
      }
    }
  }

  /**
   * 판정과 분리된 착탄 좌표. 순번 기반 결정론 값이라 게임 RNG·시드에는 손대지 않는다.
   * sqrt 분포로 원 면적에 고르게 흩고 작은 몹은 히트박스 안쪽 45%까지만 사용한다.
   */
  private visualImpactPoint(x: number, y: number, targetRadius?: number): [number, number] {
    if (!targetRadius || targetRadius <= 0) return [x, y];
    const serial = ++this.impactSerial;
    const angle = serial * 2.399963229728653; // golden angle — 연속 발사의 방향 반복을 줄인다
    const hash = Math.imul(serial ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
    const distance = Math.sqrt(hash / 0x100000000) * Math.min(5, targetRadius * 0.45);
    return [x + Math.cos(angle) * distance, y + Math.sin(angle) * distance];
  }

  /** 화살마다 Graphics 하나만 사용해 외곽 광과 흰 코어가 이어진 곡선 리본을 그린다. */
  private drawArrowRibbon(p: Proj): void {
    const ribbon = p.ribbon;
    if (!ribbon || p.ribbonPoints.length < 2) return;
    ribbon.clear();
    const points = p.ribbonPoints;
    for (let i = 1; i < points.length; i++) {
      const strength = i / (points.length - 1);
      const from = points[i - 1];
      const to = points[i];
      ribbon.lineStyle(4.2 * strength, 0xffffff, 0.06 + strength * 0.12);
      ribbon.beginPath();
      ribbon.moveTo(from.x, from.y);
      ribbon.lineTo(to.x, to.y);
      ribbon.strokePath();
      ribbon.lineStyle(0.65 + strength * 0.85, 0xffffff, 0.2 + strength * 0.75);
      ribbon.beginPath();
      ribbon.moveTo(from.x, from.y);
      ribbon.lineTo(to.x, to.y);
      ribbon.strokePath();
    }
  }

  /** 긴 비행 연출을 짧고 강한 섬광으로 닫는다. */
  private arrowImpact(x: number, y: number, color: string): void {
    const flash = this.scene.add.image(x, y, 'glow')
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(tint(color))
      .setScale(0.2)
      .setAlpha(1)
      .setDepth(this.depth);
    this.scene.tweens.add({ targets: flash, alpha: 0, scale: 0.48, duration: 150, ease: 'Cubic.Out', onComplete: () => flash.destroy() });
    this.particles.burst(x, y, '#ffffff', 4, { speed: 55, life: 0.22, gravity: 0, scale: 0.65 });
  }

  /** 포병 전용 착탄 — 고유색 플립북은 틴트하지 않고 실제 범위 링만 공용으로 쓴다. */
  private artilleryImpact(
    x: number,
    y: number,
    radius?: number,
    rangeX = x,
    rangeY = y,
  ): void {
    if (radius) this.showRangeBoundary(rangeX, rangeY, radius, '#bf7a3a');

    const flash = this.scene.add.image(x, y, 'glow')
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(0xffc36b)
      .setScale(0.24)
      .setAlpha(0.72)
      .setDepth(this.depth);
    this.scene.tweens.add({
      targets: flash, alpha: 0, scale: 0.42, duration: 120, ease: 'Cubic.Out',
      onComplete: () => flash.destroy(),
    });

    const explosion = this.scene.add.sprite(x, y, 'artillery-explosion')
      .setDepth(this.depth + 1)
      .play('artillery-impact');
    explosion.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => explosion.destroy());
  }

  /** 피해 반경을 읽는 선명한 경계 링. 공용 폭발과 포병 플립북이 함께 사용한다. */
  private showRangeBoundary(x: number, y: number, radius: number, color: string): void {
    const boundary = this.scene.add.circle(x, y, radius)
      .setStrokeStyle(1.5, tint(color), 0.5)
      .setDepth(this.depth);
    this.scene.tweens.add({
      targets: boundary, alpha: 0, duration: 620, ease: 'Sine.In',
      onComplete: () => boundary.destroy(),
    });
  }

  /**
   * 스플래시 폭발 — HD-2D 글로우 (2026-07-21, 사용자 지시: "vfx만 HD-2D 스타일").
   * ① 경계 링(픽셀 선명)이 실제 반경에 즉시 떠서 머문다 — 범위를 읽는 축은 유지
   * ② 가산 섬광이 확 피었다 죽고 ③ 소프트 링 충격파가 천천히 퍼진다
   * ④ 글로우 스파크가 흩날린다.
   */
  explode(
    x: number,
    y: number,
    radius: number,
    color: string,
    rangeX = x,
    rangeY = y,
  ): void {
    const c = tint(color);
    // 범위 경계 — 선명한 선 (사용자: "범위 명확히 보이는 건 좋다")
    this.showRangeBoundary(rangeX, rangeY, radius, color);

    // 가산 섬광 — 터지는 순간의 빛
    const flash = this.scene.add
      .image(x, y, 'glow')
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(c)
      .setScale((radius * 1.1) / 32)
      .setAlpha(0.95)
      .setDepth(this.depth);
    this.scene.tweens.add({ targets: flash, alpha: 0, scale: (radius * 1.5) / 32, duration: 260, ease: 'Cubic.Out', onComplete: () => flash.destroy() });

    // 소프트 링 충격파 — 반경까지 천천히 퍼진다
    const wave = this.scene.add
      .image(x, y, 'ring')
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(c)
      .setScale(0.1)
      .setAlpha(0.9)
      .setDepth(this.depth);
    this.scene.tweens.add({
      targets: wave, scale: (radius * 2) / 128, alpha: 0, duration: 460, ease: 'Sine.Out',
      onComplete: () => wave.destroy(),
    });

    this.particles.burst(x, y, color, 10, { speed: 85, life: 0.5, gravity: 30, glow: true, scale: 1.2 });
    this.particles.burst(x, y, color, 6, { speed: 70, life: 0.4, gravity: 60 }); // 픽셀 파편도 약간
    // 셰이크 없음 — 폭발은 매 라운드 수십 번 터진다. 셰이크는 저빈도 사건(보스 처치)의
    // 전유물로 남긴다 (2026-07-21, 사용자 피드백: "너무 자주 흔들린다")
  }
}
