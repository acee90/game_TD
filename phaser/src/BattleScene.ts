// ───────── 전투 씬 — 엔진 상태를 도트로 그린다 ─────────
// 게임 규칙은 전부 @engine(web/src)의 Game 클래스가 굴린다. 이 씬은
// ① 상태를 스프라이트로 비추고 ② vfx/shots/floats 큐를 파티클·연출로 바꾼다.
// 규칙 코드는 여기 없다 — 이게 /web(밸런스 실험실)과 규칙이 영원히 같은 이유다.

import Phaser from 'phaser';
import { Game } from '@engine/game/game';
import type { Enemy } from '@engine/game/types';
import {
  CROSS_BARS, DOOR_IN, DOOR_OUT, NEXUS, TILE, WALKABLE_HALF_WIDTH, WAYPOINTS,
  pathPos, pathPosOffset,
} from '@engine/core/map';
import { BOSS_COOLDOWN_SECONDS } from '@engine/data/balance';
import { GOD_TIER, RACE_COLOR } from '@engine/data/units';
import { HERO_RADIUS } from '@engine/data/hero';
import { SKILLS } from '@engine/data/skills';
import { ParticlePool, TextPool } from './fx';
import { makeGlowTextures, makeTextures, tint } from './sprites';
import { PreviewBot } from './bot';

const PATH_WIDTH = (WALKABLE_HALF_WIDTH + 10) * 2;

const DEPTH = {
  board: 0, zone: 2, tower: 4, enemy: 6, hero: 8, decoy: 7,
  shot: 10, particle: 12, overlay: 14, text: 16, hud: 20,
};

interface TowerView { img: Phaser.GameObjects.Image; label: Phaser.GameObjects.Text; key: string }

type ProjStyle = 'arrow' | 'shell' | 'bolt' | 'seed' | 'bullet';

/** 날아가는 투사체 — 병과마다 모양·속도·꼬리가 다르다 (2026-07-21, 사용자 피드백) */
interface Proj {
  img: Phaser.GameObjects.Image;
  /** HD-2D 글로우 헤일로 — 마법 볼트·포탄이 빛을 끌고 다닌다 */
  halo?: Phaser.GameObjects.Image;
  x0: number; y0: number; tx: number; ty: number;
  t: number; dur: number;
  style: ProjStyle;
  color: string;
  splashRadius?: number;
  arcHeight: number;
  spin: number;
  trailTimer: number;
}

/** 병과 → 투사체 스타일. 정규군 화살은 일부러 느리다 — 긴 꼬리가 살도록. */
const RACE_PROJ: Record<number, { style: ProjStyle; speed: number }> = {
  0: { style: 'arrow', speed: 235 }, // 정규군 — 화살
  1: { style: 'shell', speed: 205 }, // 포병 — 곡사 포탄
  2: { style: 'bolt', speed: 330 }, // 마법대 — 매직 볼트
  3: { style: 'seed', speed: 430 }, // 소환대 — 가시
};

const TRAIL: Record<ProjStyle, { interval: number; life: number; scale: number; gravity: number }> = {
  arrow: { interval: 0.014, life: 0.5, scale: 0.75, gravity: 0 }, // 촘촘하고 오래 남는 긴 꼬리
  shell: { interval: 0.03, life: 0.45, scale: 0.8, gravity: -30 }, // 연기가 살짝 뜬다
  bolt: { interval: 0.02, life: 0.3, scale: 0.8, gravity: 0 },
  seed: { interval: 0.05, life: 0.2, scale: 0.7, gravity: 0 },
  bullet: { interval: 0.04, life: 0.18, scale: 0.7, gravity: 0 },
};

export class BattleScene extends Phaser.Scene {
  private game_!: Game;
  private bot = new PreviewBot();

  private towers: TowerView[] = [];
  private enemyImgs = new Map<Enemy, Phaser.GameObjects.Image>();
  private flashUntil = new Map<Enemy, number>();
  private seenShots = new WeakSet<object>();
  private seenFloats = new WeakSet<object>();
  private projectiles: Proj[] = [];
  /** 장판의 가산 광원 — HD-2D 빛웅덩이 */
  private zoneGlows = new Map<object, Phaser.GameObjects.Image>();

  private overlay!: Phaser.GameObjects.Graphics;
  private heroImg!: Phaser.GameObjects.Image;
  private heroLabel!: Phaser.GameObjects.Text;
  private decoyImg!: Phaser.GameObjects.Image;
  private hud!: Phaser.GameObjects.Text;
  private msg!: Phaser.GameObjects.Text;
  private pickBanner!: Phaser.GameObjects.Text;

  private particles!: ParticlePool;
  private embers!: ParticlePool;
  private texts!: TextPool;
  private walkClock = 0;

  constructor() {
    super('battle');
  }

  create(): void {
    makeTextures(this);
    makeGlowTextures(this); // HD-2D 이펙트 — 월드는 NEAREST, 글로우는 LINEAR
    this.game_ = new Game();

    this.drawBoard();
    this.overlay = this.add.graphics().setDepth(DEPTH.overlay);

    // 타워 뷰 — 슬롯 수만큼 미리 만들어 두고 상태에 맞춰 보이기만 바꾼다
    for (const slot of this.game_.slots) {
      const img = this.add.image(slot.x, slot.y, 'tower').setDepth(DEPTH.tower).setVisible(false);
      const label = this.add
        .text(slot.x, slot.y + 1, '', { fontFamily: 'monospace', fontSize: 7, color: '#1a130a' })
        .setOrigin(0.5)
        .setDepth(DEPTH.tower + 1)
        .setResolution(2)
        .setVisible(false);
      this.towers.push({ img, label, key: '' });
    }

    this.heroImg = this.add.image(0, 0, 'hero').setDepth(DEPTH.hero);
    this.heroLabel = this.add
      .text(0, 0, '', { fontFamily: 'monospace', fontSize: 7, color: '#ffd23f' })
      .setOrigin(0.5, 1)
      .setDepth(DEPTH.hero + 1)
      .setResolution(2);
    this.decoyImg = this.add.image(0, 0, 'decoy').setDepth(DEPTH.decoy).setVisible(false);

    this.particles = new ParticlePool(this, DEPTH.particle);
    this.embers = new ParticlePool(this, DEPTH.particle - 1, 120);
    this.texts = new TextPool(this, DEPTH.text);

    this.hud = this.add
      .text(4, 3, '', { fontFamily: 'monospace', fontSize: 9, color: '#e8e2d0', stroke: '#0d0a06', strokeThickness: 3 })
      .setDepth(DEPTH.hud)
      .setResolution(2);
    this.msg = this.add
      .text(4, 458, '', { fontFamily: 'monospace', fontSize: 8, color: '#9aa2c0', stroke: '#0d0a06', strokeThickness: 3 })
      .setDepth(DEPTH.hud)
      .setResolution(2);
    this.pickBanner = this.add
      .text(210, 200, '', {
        fontFamily: 'monospace', fontSize: 10, color: '#ffd23f', align: 'center',
        backgroundColor: '#1a130acc', padding: { x: 8, y: 6 },
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.hud)
      .setResolution(2)
      .setVisible(false);

    // 클릭: 빈 타일 = 생성 시도 · 그 외 = 영웅 이동
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      const slot = this.game_.slots.find(
        (s) => Math.abs(s.x - pointer.worldX) <= TILE / 2 && Math.abs(s.y - pointer.worldY) <= TILE / 2,
      );
      if (slot && !slot.tower) this.game_.spawnUnit(slot);
      else this.game_.moveHero(pointer.worldX, pointer.worldY);
    });
  }

  /** 정적 보드 — 한 번만 그린다 */
  private drawBoard(): void {
    const g = this.add.graphics().setDepth(DEPTH.board);
    const stroke = (width: number, color: number) => {
      g.lineStyle(width, color, 1);
      g.beginPath();
      g.moveTo(WAYPOINTS[0][0], WAYPOINTS[0][1]);
      for (let i = 1; i < WAYPOINTS.length; i++) g.lineTo(WAYPOINTS[i][0], WAYPOINTS[i][1]);
      g.strokePath();
    };
    stroke(PATH_WIDTH + 4, 0x46392a);
    stroke(PATH_WIDTH, 0x241c12);

    for (const bar of CROSS_BARS) {
      g.fillStyle(0x211a12, 1);
      g.fillRect(bar.x, bar.y, bar.w, bar.h);
      g.lineStyle(1, 0x4d3d28, 1);
      g.strokeRect(bar.x, bar.y, bar.w, bar.h);
    }

    for (const slot of this.game_.slots) {
      const half = TILE / 2 - 2;
      const altar = slot === this.game_.altarSlot;
      g.fillStyle(altar ? 0x2a2036 : 0x241d14, altar ? 1 : 0.72);
      g.fillRect(slot.x - half, slot.y - half, half * 2, half * 2);
      g.lineStyle(1, altar ? 0x8a6ea6 : 0x4d3d28, 1);
      g.strokeRect(slot.x - half, slot.y - half, half * 2, half * 2);
    }

    g.fillStyle(0x7d5a8c, 1);
    g.fillRect(DOOR_IN[0] - PATH_WIDTH / 2, DOOR_IN[1] + 6, PATH_WIDTH, 5);
    g.fillStyle(0xc14a2c, 1);
    g.fillRect(DOOR_OUT[0] - PATH_WIDTH / 2, DOOR_OUT[1] + 6, PATH_WIDTH, 5);
  }

  update(_time: number, deltaMs: number): void {
    const dt = Math.min(deltaMs / 1000, 0.05);
    const game = this.game_;

    this.bot.step(game, dt);
    game.update(dt);
    this.walkClock += dt;

    this.syncTowers();
    this.syncEnemies();
    this.syncHero();
    this.syncDecoy();
    this.consumeShots();
    this.stepProjectiles(dt);
    this.consumeVfx();
    this.consumeFloats();
    this.drawOverlay();
    this.syncHud();

    this.particles.update(dt);
    this.embers.update(dt);
    this.texts.update(dt);
  }

  private syncTowers(): void {
    this.game_.slots.forEach((slot, i) => {
      const view = this.towers[i];
      const tower = slot.tower;
      if (!tower || slot === this.game_.altarSlot) {
        view.img.setVisible(false);
        view.label.setVisible(false);
        view.key = '';
        return;
      }
      const god = tower.tier === GOD_TIER;
      const key = `${tower.def.race}:${tower.tier}`;
      if (view.key !== key) {
        view.key = key;
        view.img
          .setTexture(god ? 'towerGod' : 'tower')
          .setTint(tint(RACE_COLOR[tower.def.race]))
          .setScale(god ? 1.2 : 1 + tower.tier * 0.14)
          .setVisible(true);
        view.label
          .setText(god ? 'G' : String(tower.tier + 1))
          .setColor(god ? '#1a130a' : '#1a130a')
          .setVisible(true);
        // 배치·티어업 순간의 팝
        this.particles.burst(slot.x, slot.y, RACE_COLOR[tower.def.race], 6, { speed: 45, life: 0.35 });
      }
    });
  }

  private syncEnemies(): void {
    const game = this.game_;
    const now = this.time.now;
    const seen = new Set<Enemy>();

    for (const enemy of game.enemies) {
      seen.add(enemy);
      let img = this.enemyImgs.get(enemy);
      if (!img) {
        img = this.add.image(0, 0, 'mob0').setDepth(DEPTH.enemy);
        this.enemyImgs.set(enemy, img);
      }
      const [x, y] = pathPosOffset(enemy.distance, enemy.lateral ?? 0);
      const boss = enemy.kind === 'boss';
      const frame = Math.floor(this.walkClock * 6 + enemy.distance * 0.05) % 2;
      img.setTexture(`${boss ? 'boss' : 'mob'}${frame}`);
      img.setPosition(x, y);
      img.setScale((enemy.radius * 2) / (boss ? 16 : 11));
      const flashing = (this.flashUntil.get(enemy) ?? 0) > now;
      if (flashing) img.setTintFill(0xffffff);
      else img.setTint(tint(boss ? '#c14a2c' : (enemy.typeColor ?? '#a89a80')));

      // 화상 불씨 — 몸에서 이글이글 올라온다
      if (enemy.burnTimer && enemy.burnTimer > 0 && Math.random() < 0.25) {
        this.embers.burst(x + (Math.random() - 0.5) * enemy.radius, y, '#ff8a3c', 1, {
          speed: 24, life: 0.5, gravity: -60, up: true, scale: 0.7,
        });
      }
      // 감속 서리 — 발밑에 하늘색 알갱이
      if (enemy.slowFactor !== undefined && enemy.slowFactor < 1 && Math.random() < 0.12) {
        this.embers.burst(x, y + enemy.radius, '#7ce7ff', 1, { speed: 10, life: 0.4, gravity: 20, scale: 0.7 });
      }
    }

    for (const [enemy, img] of this.enemyImgs) {
      if (!seen.has(enemy)) {
        img.destroy();
        this.enemyImgs.delete(enemy);
        this.flashUntil.delete(enemy);
      }
    }
  }

  private syncHero(): void {
    const hero = this.game_.hero;
    if (!hero.alive) {
      const [ax, ay] = pathPos(hero.altarDistance);
      this.heroImg.setPosition(ax, ay).setAlpha(0.3).setTint(0x8a93a6);
      this.heroLabel.setVisible(false);
      return;
    }
    this.heroImg.setPosition(hero.x, hero.y).setAlpha(1).setTint(0xffffff);
    this.heroLabel.setPosition(hero.x, hero.y - HERO_RADIUS - 4).setText(`Lv${hero.level}`).setVisible(true);
  }

  private syncDecoy(): void {
    const decoy = this.game_.decoy;
    if (!decoy) {
      this.decoyImg.setVisible(false);
      return;
    }
    const [x, y] = pathPos(decoy.distance);
    this.decoyImg.setPosition(x, y).setTint(tint('#d97a2e')).setVisible(true);
  }

  /** shots(발사 이벤트)를 실제 날아가는 투사체로 — 병과별 모양·속도·꼬리 */
  private consumeShots(): void {
    for (const shot of this.game_.shots) {
      if (this.seenShots.has(shot)) continue;
      this.seenShots.add(shot);

      const dist = Math.hypot(shot.tx - shot.x, shot.ty - shot.y);
      // 제자리 폭발 (유성·초신성·폭사) — 비행 없이 바로 터진다
      if (dist < 4) {
        if (shot.splashRadius) this.explode(shot.tx, shot.ty, shot.splashRadius, shot.color);
        continue;
      }

      const conf = shot.race !== undefined ? RACE_PROJ[shot.race] : { style: 'bullet' as ProjStyle, speed: 520 };
      const img = this.add
        .image(shot.x, shot.y, conf.style === 'bullet' ? 'shot' : conf.style)
        .setTint(tint(shot.color))
        .setDepth(DEPTH.shot);
      // 마법 볼트·포탄은 가산 글로우를 끌고 다닌다 (HD-2D)
      const halo = conf.style === 'bolt' || conf.style === 'shell'
        ? this.add
            .image(shot.x, shot.y, 'glow')
            .setBlendMode(Phaser.BlendModes.ADD)
            .setTint(tint(shot.color))
            .setScale(0.35)
            .setAlpha(0.8)
            .setDepth(DEPTH.shot - 1)
        : undefined;
      this.projectiles.push({
        img,
        halo,
        x0: shot.x, y0: shot.y, tx: shot.tx, ty: shot.ty,
        t: 0,
        dur: Math.max(0.08, Math.min(0.7, dist / conf.speed)),
        style: conf.style,
        color: shot.color,
        splashRadius: shot.splashRadius,
        // 포탄만 포물선 — 사거리가 멀수록 높이 뜬다
        arcHeight: conf.style === 'shell' ? 10 + dist * 0.12 : 0,
        spin: 0,
        trailTimer: 0,
      });
    }
  }

  /** 투사체 비행 — 포물선·회전·꼬리, 도착하면 임팩트/폭발 */
  private stepProjectiles(dt: number): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.t = Math.min(1, p.t + dt / p.dur);
      const u = p.t;
      const x = p.x0 + (p.tx - p.x0) * u;
      const y = p.y0 + (p.ty - p.y0) * u - Math.sin(Math.PI * u) * p.arcHeight;
      p.img.setPosition(x, y);
      p.halo?.setPosition(x, y).setScale(0.32 + 0.06 * Math.sin(this.walkClock * 22));

      if (p.style === 'shell' || p.style === 'seed') {
        p.spin += dt * (p.style === 'seed' ? 18 : 9);
        p.img.setRotation(p.spin);
      } else {
        // 포물선 접선 방향으로 기수를 돌린다
        const dy = (p.ty - p.y0) - Math.PI * Math.cos(Math.PI * u) * p.arcHeight;
        p.img.setRotation(Math.atan2(dy, p.tx - p.x0));
      }

      // 꼬리 — 스타일별 밀도·수명 (화살이 제일 길다)
      const trail = TRAIL[p.style];
      p.trailTimer -= dt;
      if (p.trailTimer <= 0) {
        p.trailTimer = trail.interval;
        this.particles.burst(x, y, p.color, 1, {
          speed: 6, life: trail.life, gravity: trail.gravity, scale: trail.scale,
        });
      }

      if (u >= 1) {
        if (p.splashRadius) this.explode(p.tx, p.ty, p.splashRadius, p.color);
        else {
          this.particles.burst(p.tx, p.ty, p.color, 2, { speed: 40, life: 0.2, gravity: 0, scale: 0.8 });
        }
        p.img.destroy();
        p.halo?.destroy();
        this.projectiles.splice(i, 1);
      }
    }
  }

  /**
   * 스플래시 폭발 — HD-2D 글로우 (2026-07-21, 사용자 지시: "vfx만 HD-2D 스타일").
   * ① 경계 링(픽셀 선명)이 실제 반경에 즉시 떠서 머문다 — 범위를 읽는 축은 유지
   * ② 가산 섬광이 확 피었다 죽고 ③ 소프트 링 충격파가 천천히 퍼진다
   * ④ 글로우 스파크가 흩날린다.
   */
  private explode(x: number, y: number, radius: number, color: string): void {
    const c = tint(color);
    // 범위 경계 — 선명한 선 (사용자: "범위 명확히 보이는 건 좋다")
    const boundary = this.add.circle(x, y, radius).setStrokeStyle(1.5, c, 0.5).setDepth(DEPTH.shot);
    this.tweens.add({ targets: boundary, alpha: 0, duration: 620, ease: 'Sine.In', onComplete: () => boundary.destroy() });

    // 가산 섬광 — 터지는 순간의 빛
    const flash = this.add
      .image(x, y, 'glow')
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(c)
      .setScale((radius * 1.1) / 32)
      .setAlpha(0.95)
      .setDepth(DEPTH.shot);
    this.tweens.add({ targets: flash, alpha: 0, scale: (radius * 1.5) / 32, duration: 260, ease: 'Cubic.Out', onComplete: () => flash.destroy() });

    // 소프트 링 충격파 — 반경까지 천천히 퍼진다
    const wave = this.add
      .image(x, y, 'ring')
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(c)
      .setScale(0.1)
      .setAlpha(0.9)
      .setDepth(DEPTH.shot);
    this.tweens.add({
      targets: wave, scale: (radius * 2) / 128, alpha: 0, duration: 460, ease: 'Sine.Out',
      onComplete: () => wave.destroy(),
    });

    this.particles.burst(x, y, color, 10, { speed: 85, life: 0.5, gravity: 30, glow: true, scale: 1.2 });
    this.particles.burst(x, y, color, 6, { speed: 70, life: 0.4, gravity: 60 }); // 픽셀 파편도 약간
    // 셰이크 없음 — 폭발은 매 라운드 수십 번 터진다. 셰이크는 저빈도 사건(보스 처치)의
    // 전유물로 남긴다 (2026-07-21, 사용자 피드백: "너무 자주 흔들린다")
  }

  /** 엔진 vfx 큐 — 피격 플래시·데미지 숫자·처치 팝·보스 셰이크 */
  private consumeVfx(): void {
    const now = this.time.now;
    for (const event of this.game_.vfx.splice(0)) {
      if (event.kind === 'hit') {
        // 맞은 몹을 찾아 흰색 플래시
        for (const [enemy] of this.enemyImgs) {
          const [x, y] = pathPosOffset(enemy.distance, enemy.lateral ?? 0);
          if (Math.hypot(x - event.x, y - event.y) <= enemy.radius + 6) {
            this.flashUntil.set(enemy, now + 45);
            break;
          }
        }
        if (event.amount && event.amount >= 1) {
          this.texts.spawn(event.x, event.y, String(Math.round(event.amount)), '#f4efe0', false, event.crit === true);
        }
        // 피격 — 가산 글로우 점멸 + 픽셀 파편 (HD-2D 조합)
        this.particles.burst(event.x, event.y, event.color ?? '#ffffff', 1, {
          speed: 8, life: 0.16, gravity: 0, glow: true, scale: 1.1,
        });
        this.particles.burst(event.x, event.y, event.color ?? '#ffffff', 2, {
          speed: 55, life: 0.25, gravity: 100, scale: 0.8,
        });
      } else {
        // 처치 — 몸 색 파편 팝 + 글로우 잔광
        const boss = event.boss === true;
        this.particles.burst(event.x, event.y, event.color ?? '#a89a80', boss ? 26 : 9, {
          speed: boss ? 130 : 80, life: boss ? 0.8 : 0.5, gravity: 120,
        });
        this.particles.burst(event.x, event.y, event.color ?? '#a89a80', boss ? 12 : 3, {
          speed: boss ? 90 : 45, life: boss ? 0.7 : 0.4, gravity: -20, glow: true, scale: 1.3,
        });
        if (boss) {
          // 셰이크는 저빈도 사건의 전유물 — 보스 처치가 그 사건이다
          this.cameras.main.shake(220, 0.012);
          this.texts.spawn(event.x, event.y - 8, 'BOSS DOWN', '#ffd23f', true);
        }
      }
    }
  }

  private consumeFloats(): void {
    for (const f of this.game_.floats) {
      if (this.seenFloats.has(f)) continue;
      this.seenFloats.add(f);
      this.texts.spawn(f.x, f.y, f.text, f.color, true);
    }
  }

  /** 프레임마다 다시 그리는 것들 — 장판·빔·체력바·넥서스 링 */
  private drawOverlay(): void {
    const g = this.overlay;
    const game = this.game_;
    g.clear();

    // 장판 — 픽셀 경계선 + HD-2D 빛웅덩이 + 불씨
    const liveZones = new Set<object>(game.zones);
    for (const zone of game.zones) {
      const fade = Math.min(1, zone.remaining / 1.5);
      const flicker = 0.16 + 0.05 * Math.sin(this.walkClock * 11 + zone.distance);
      g.lineStyle(1, tint(zone.color), 0.5 * fade);
      g.strokeCircle(zone.x, zone.y, zone.radius);

      let pool = this.zoneGlows.get(zone);
      if (!pool) {
        pool = this.add
          .image(zone.x, zone.y, 'glow')
          .setBlendMode(Phaser.BlendModes.ADD)
          .setTint(tint(zone.color))
          .setDepth(DEPTH.zone);
        this.zoneGlows.set(zone, pool);
      }
      pool.setScale((zone.radius * 2.4) / 64).setAlpha((flicker + 0.12) * fade);

      if (Math.random() < 0.5) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * zone.radius;
        const hot = zone.dps > 0;
        this.embers.burst(zone.x + Math.cos(a) * r, zone.y + Math.sin(a) * r, zone.color, 1, {
          speed: hot ? 20 : 8, life: 0.5, gravity: hot ? -70 : 15, up: hot, scale: 0.7, glow: true,
        });
      }
    }
    for (const [zone, pool] of this.zoneGlows) {
      if (!liveZones.has(zone)) {
        pool.destroy();
        this.zoneGlows.delete(zone);
      }
    }

    // 레이저 빔 — 지글거리는 이중선
    const beam = game.beam;
    if (beam && game.hero.alive) {
      const from = pathPos(game.hero.distance);
      const to = pathPos(game.hero.distance + beam.direction * beam.skill.beamLength);
      const jitter = Math.sin(this.walkClock * 40) * 1.2;
      g.lineStyle(4, 0xc065e0, 0.25);
      g.lineBetween(from[0], from[1], to[0], to[1]);
      g.lineStyle(2, 0xe8a5ff, 0.9);
      g.lineBetween(from[0], from[1] + jitter, to[0], to[1] - jitter);
    }

    // 몹 체력바
    for (const [enemy] of this.enemyImgs) {
      const [x, y] = pathPosOffset(enemy.distance, enemy.lateral ?? 0);
      const w = enemy.radius * 2;
      g.fillStyle(0x0d0a06, 1);
      g.fillRect(x - enemy.radius, y - enemy.radius - 6, w, 2);
      g.fillStyle(enemy.kind === 'boss' ? 0xc14a2c : 0x8a9a5b, 1);
      g.fillRect(x - enemy.radius, y - enemy.radius - 6, w * Math.max(0, enemy.hp / enemy.maxHp), 2);
    }

    // 영웅 체력바
    const hero = game.hero;
    if (hero.alive) {
      const w = HERO_RADIUS * 2.4;
      g.fillStyle(0x0d0a06, 1);
      g.fillRect(hero.x - w / 2, hero.y - HERO_RADIUS - 10, w, 2);
      g.fillStyle(0x8a9a5b, 1);
      g.fillRect(hero.x - w / 2, hero.y - HERO_RADIUS - 10, w * Math.max(0, hero.hp / hero.stats.maxHp), 2);
    }

    // 허수아비 체력바
    if (game.decoy) {
      const [x, y] = pathPos(game.decoy.distance);
      g.fillStyle(0x0d0a06, 1);
      g.fillRect(x - 11, y - 15, 22, 2);
      g.fillStyle(0xd97a2e, 1);
      g.fillRect(x - 11, y - 15, 22 * Math.max(0, game.decoy.hp / game.decoy.maxHp), 2);
    }

    // 넥서스 보스 쿨타임 링
    if (game.bossCooldown > 0) {
      const progress = 1 - game.bossCooldown / BOSS_COOLDOWN_SECONDS;
      g.lineStyle(2, 0xe3b23e, 0.9);
      g.beginPath();
      g.arc(NEXUS[0], NEXUS[1], TILE / 2 + 5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
      g.strokePath();
    }
  }

  private syncHud(): void {
    const game = this.game_;
    this.hud.setText(
      `R${game.round}  금화 ${Math.floor(game.mineral)}  마정석 ${Math.floor(game.gas)}  ` +
      `라이프 ${game.lives}  킬 ${game.kills}  영웅 Lv${game.hero.level}${game.hero.atMaxLevel ? '(만렙)' : ''}`,
    );
    this.msg.setText(game.message.length > 52 ? game.message.slice(0, 52) + '…' : game.message);

    if (game.skillChoices.length > 0) {
      this.pickBanner
        .setText(`스킬 선택 중…\n${game.skillChoices.map((id) => SKILLS[id].name).join(' · ')}`)
        .setVisible(true);
    } else if (game.augmentChoices.length > 0) {
      this.pickBanner
        .setText(`증강 선택 중…\n${game.augmentChoices.map((c) => c.augment.name).join(' · ')}`)
        .setVisible(true);
    } else {
      this.pickBanner.setVisible(false);
    }
  }
}
