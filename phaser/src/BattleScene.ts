// ───────── 전투 씬 — 엔진 상태를 도트로 그린다 ─────────
// 게임 규칙은 전부 @engine(engine/src)의 Game 클래스가 굴린다. 이 씬은
// ① 상태를 스프라이트로 비추고 ② vfx/shots/floats 큐를 파티클·연출로 바꾼다.
// 규칙 코드는 여기 없다 — 이게 engine/(밸런스 실험실)과 규칙이 영원히 같은 이유다.

import Phaser from 'phaser';
import { Game } from '@engine/game/game';
import type { Enemy } from '@engine/game/types';
import {
  CROSS_BARS, DOOR_IN, DOOR_OUT, NEXUS, TILE, WALKABLE_HALF_WIDTH, WAYPOINTS,
  pathPos, pathPosOffset,
} from '@engine/core/map';
import { BOSS_COOLDOWN_SECONDS } from '@engine/data/balance';
import { range } from '@engine/game/combat';
import { GOD_TIER, RACE_COLOR } from '@engine/data/units';
import { HERO_RADIUS } from '@engine/data/hero';
import { SKILLS } from '@engine/data/skills';
import { ParticlePool, TextPool, UI_FONT, UI_RES } from './fx';
import { makeAnims, makeGlowTextures, makeTextures, tint } from './sprites';
import { ProjectileFxController } from './projectile-fx';
import { PreviewBot } from './bot';

const PATH_WIDTH = (WALKABLE_HALF_WIDTH + 10) * 2;

const DEPTH = {
  board: 0, zone: 2, tower: 4, enemy: 6, hero: 8, decoy: 7,
  shot: 10, particle: 12, overlay: 14, text: 16, hud: 20,
};

interface TowerView { img: Phaser.GameObjects.Image; label: Phaser.GameObjects.Text; key: string }

/** 씬 바깥(Svelte HUD)과 공유하는 의존성 */
export interface SceneDeps {
  /** 엔진 인스턴스 — HUD와 같은 객체를 본다 */
  game: Game;
  /** 게임 배속 (HUD의 1×/1.25×/1.5×/2× 버튼) */
  speed: () => number;
  /** 데모 봇 모드 (?bot) — 켜면 증강·건설을 자동으로 굴리고 캔버스 안 HUD를 띄운다 */
  bot: boolean;
  /** 시뮬레이션 진행 여부 — 시작 게이트·메뉴가 닫혀 있을 때만 true. 렌더는 계속 돈다 */
  running?: () => boolean;
  /** 프레임마다 호출 — Svelte HUD의 tick을 올린다 */
  onTick?: () => void;
}

export class BattleScene extends Phaser.Scene {
  private game_: Game;
  private bot = new PreviewBot();

  constructor(private deps: SceneDeps) {
    super('battle');
    this.game_ = deps.game;
  }

  private towers: TowerView[] = [];
  private enemyImgs = new Map<Enemy, Phaser.GameObjects.Sprite>();
  private flashUntil = new Map<Enemy, number>();
  private seenShots = new WeakSet<object>();
  private seenFloats = new WeakSet<object>();
  /** 공용 투사체 VFX — 프리뷰 씬과 같은 컨트롤러 (M4 추출) */
  private projectileFx!: ProjectileFxController;
  /** 장판의 가산 광원 — HD-2D 빛웅덩이 */
  private zoneGlows = new Map<object, Phaser.GameObjects.Image>();

  private overlay!: Phaser.GameObjects.Graphics;
  private heroImg!: Phaser.GameObjects.Sprite;
  private heroLabel!: Phaser.GameObjects.Text;
  private decoyImg!: Phaser.GameObjects.Image;
  private hud!: Phaser.GameObjects.Text;
  private msg!: Phaser.GameObjects.Text;
  private pickBanner!: Phaser.GameObjects.Text;

  private particles!: ParticlePool;
  private embers!: ParticlePool;
  private texts!: TextPool;
  private walkClock = 0;

  preload(): void {
    // /game/ 라우트 기준 상대 경로가 깨지지 않게 루트 고정 — 서브패스 배포 시 paths.base 주입
    this.load.setBaseURL('/');
    // 정식 도트 에셋을 기존 애니메이션 키에 연결한다. 프레임별 PNG가 생기기 전까지는
    // 같은 텍스처를 재사용해 현재 애니메이션/틴트 파이프라인을 그대로 유지한다.
    for (const frame of [0, 1]) {
      this.load.image(`hero${frame}`, 'assets/sprites/hero-knight.png');
    }
    for (const frame of [0, 1, 2, 3]) {
      this.load.image(`boss${frame}`, 'assets/sprites/boss-dragon.png');
    }
    ProjectileFxController.preload(this); // 화살 본체 + 포병 착탄 플립북
    // SparkSet 파티클 팩 — 감속 눈꽃만 채택 (별·섬광은 기존 톤과 안 맞아 반려, 2026-07-22)
    this.load.image('fx-snow', 'assets/fx/snow.png');
  }

  create(): void {
    makeTextures(this);
    makeGlowTextures(this); // HD-2D 이펙트 — 월드는 NEAREST, 글로우는 LINEAR
    makeAnims(this);

    // 승인된 후보 04 — 포병 착탄에만 쓰는 3D 볼류메트릭 플립북 (공용 컨트롤러가 등록)
    ProjectileFxController.createAnimations(this);

    // SparkSet 눈꽃 — 글로우 계열이라 LINEAR
    if (this.textures.exists('fx-snow')) {
      this.textures.get('fx-snow').setFilter(Phaser.Textures.FilterMode.LINEAR);
    }

    // 도트 고도화 — 스프라이트가 2배 해상도라 카메라도 2배로 본다.
    // 월드 좌표계(420×470)는 그대로 — 엔진·클릭·이펙트 수치는 전혀 안 바뀐다.
    this.cameras.main.setZoom(2);
    this.cameras.main.centerOn(210, 235);

    this.drawBoard();
    this.overlay = this.add.graphics().setDepth(DEPTH.overlay);

    // 타워 뷰 — 슬롯 수만큼 미리 만들어 두고 상태에 맞춰 보이기만 바꾼다
    for (const slot of this.game_.slots) {
      const img = this.add.image(slot.x, slot.y, 'tower').setDepth(DEPTH.tower).setVisible(false);
      const label = this.add
        .text(slot.x, slot.y + 1, '', { fontFamily: UI_FONT, fontStyle: 'bold', fontSize: 8, color: '#1a130a' })
        .setOrigin(0.5)
        .setDepth(DEPTH.tower + 1)
        .setResolution(UI_RES)
        .setVisible(false);
      this.towers.push({ img, label, key: '' });
    }

    // 초기 0.5배 기준의 1.5배 크기. 직전 2배(1.0)는 보드에서 지나치게 컸다.
    this.heroImg = this.add.sprite(0, 0, 'hero0').setScale(0.75).setDepth(DEPTH.hero);
    this.heroImg.play('hero-idle');
    this.heroLabel = this.add
      .text(0, 0, '', {
        fontFamily: UI_FONT, fontStyle: 'bold', fontSize: 7, color: '#ffd23f',
        stroke: '#0d0a06', strokeThickness: 2,
      })
      .setOrigin(0.5, 1)
      .setDepth(DEPTH.hero + 1)
      .setResolution(UI_RES);
    this.decoyImg = this.add.image(0, 0, 'decoy').setScale(0.5).setDepth(DEPTH.decoy).setVisible(false);

    this.particles = new ParticlePool(this, DEPTH.particle);
    this.embers = new ParticlePool(this, DEPTH.particle - 1, 120);
    this.texts = new TextPool(this, DEPTH.text);
    this.projectileFx = new ProjectileFxController(this, this.particles, DEPTH.shot);

    this.hud = this.add
      .text(4, 3, '', { fontFamily: UI_FONT, fontStyle: 'bold', fontSize: 9, color: '#e8e2d0', stroke: '#0d0a06', strokeThickness: 3 })
      .setDepth(DEPTH.hud)
      .setResolution(UI_RES);
    this.msg = this.add
      .text(4, 458, '', { fontFamily: UI_FONT, fontSize: 8, color: '#9aa2c0', stroke: '#0d0a06', strokeThickness: 3 })
      .setDepth(DEPTH.hud)
      .setResolution(UI_RES);
    this.pickBanner = this.add
      .text(210, 200, '', {
        fontFamily: UI_FONT, fontStyle: 'bold', fontSize: 10, color: '#ffd23f', align: 'center',
        backgroundColor: '#1a130acc', padding: { x: 8, y: 6 },
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.hud)
      .setResolution(UI_RES)
      .setVisible(false);

    // 클릭 규칙 — web App.svelte의 onCanvasPointerDown과 동일:
    // 몹 클릭 = 스탯 보기 → 타일 = 선택/생성 → 제단·바깥 = 영웅 이동
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      const game = this.game_;
      const x = pointer.worldX;
      const y = pointer.worldY;

      const enemy = game.enemyAt(x, y);
      if (enemy) {
        game.selectedEnemy = enemy;
        game.selected = null;
        return;
      }
      game.selectedEnemy = null;

      const hit = game.slots.find(
        (s) => Math.abs(s.x - x) <= TILE / 2 && Math.abs(s.y - y) <= TILE / 2,
      );
      if (!hit || hit === game.altarSlot) {
        game.selected = null;
        game.moveHero(x, y);
        return;
      }
      if (hit.tower) game.selected = hit;
      else game.spawnUnit(hit);
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
    const dt = Math.min(deltaMs / 1000, 0.05) * this.deps.speed();
    const game = this.game_;

    // 걷기·숨쉬기 애니는 게임 배속·일시정지를 그대로 따라간다
    this.anims.globalTimeScale = (this.deps.running?.() ?? true) ? this.deps.speed() : 0;

    // 시작 게이트·메뉴 중에는 시뮬만 멈춘다 — 보드·HUD는 계속 그린다
    if (this.deps.running?.() ?? true) {
      if (this.deps.bot) this.bot.step(game, dt); // 데모 모드에서만 자동 조작
      game.update(dt);
    }
    this.walkClock += dt;

    this.syncTowers();
    this.syncEnemies();
    this.syncHero();
    this.syncDecoy();
    this.consumeShots();
    this.projectileFx.update(dt, this.walkClock);
    this.consumeVfx();
    this.consumeFloats();
    this.drawOverlay();
    this.syncHud();

    this.particles.update(dt);
    this.embers.update(dt);
    this.texts.update(dt);
    this.deps.onTick?.();
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
          .setScale((god ? 1.2 : 1 + tower.tier * 0.14) / 2) // 텍스처가 2배 해상도라 절반이 기준

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
      const boss = enemy.kind === 'boss';
      let img = this.enemyImgs.get(enemy);
      if (!img) {
        img = this.add.sprite(0, 0, boss ? 'boss0' : 'mob0').setDepth(DEPTH.enemy);
        // 걷기 위상을 무작위로 흩는다 — 전 몹이 발맞춰 행진하지 않도록
        img.play({ key: boss ? 'boss-walk' : 'mob-walk', startFrame: Math.floor(Math.random() * 4) });
        this.enemyImgs.set(enemy, img);
      }
      const [x, y] = pathPosOffset(enemy.distance, enemy.lateral ?? 0);
      img.setPosition(x, y);
      img.setScale((enemy.radius * 2) / (boss ? 32 : 22)); // 분모 = 텍스처 속 몸통 폭
      const flashing = (this.flashUntil.get(enemy) ?? 0) > now;
      if (flashing) img.setTintFill(0xffffff);
      else img.setTint(tint(boss ? '#c14a2c' : (enemy.typeColor ?? '#a89a80')));

      // 화상 불씨 — 몸에서 이글이글 올라온다
      if (enemy.burnTimer && enemy.burnTimer > 0 && Math.random() < 0.25) {
        this.embers.burst(x + (Math.random() - 0.5) * enemy.radius, y, '#ff8a3c', 1, {
          speed: 24, life: 0.5, gravity: -60, up: true, scale: 0.7,
        });
      }
      // 감속 서리 — 발밑에 눈꽃이 흩날린다 (SparkSet, 원색 유지 — 파랑=냉기 고정 의미)
      if (enemy.slowFactor !== undefined && enemy.slowFactor < 1 && Math.random() < 0.12) {
        if (this.textures.exists('fx-snow')) {
          this.embers.burst(x, y + enemy.radius, '#ffffff', 1, {
            tex: 'fx-snow', glow: true, speed: 10, life: 0.5, gravity: 16, scale: 0.14,
          });
        } else {
          this.embers.burst(x, y + enemy.radius, '#7ce7ff', 1, { speed: 10, life: 0.4, gravity: 20, scale: 0.7 });
        }
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

  /** shots(발사 이벤트)를 공용 컨트롤러의 투사체로 — 병과별 모양·속도·꼬리 */
  private consumeShots(): void {
    for (const shot of this.game_.shots) {
      if (this.seenShots.has(shot)) continue;
      this.seenShots.add(shot);
      this.projectileFx.spawn(shot);
    }
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

    // 선택 표시 — 타워는 타일 테두리+사거리 링, 몹은 금색 원 (ActionsColumn 정보와 짝)
    const sel = game.selected;
    if (sel?.tower) {
      const half = TILE / 2 - 2;
      g.lineStyle(1.5, 0xe3b23e, 1);
      g.strokeRect(sel.x - half, sel.y - half, half * 2, half * 2);
      g.lineStyle(1, 0xe3b23e, 0.28);
      g.strokeCircle(sel.x, sel.y, range(sel.tower) * game.hero.stats.towerRangeMult);
    }
    const selEnemy = game.selectedEnemy;
    if (selEnemy && !selEnemy.dead) {
      const [ex, ey] = pathPosOffset(selEnemy.distance, selEnemy.lateral ?? 0);
      g.lineStyle(1.5, 0xe3b23e, 0.9);
      g.strokeCircle(ex, ey, selEnemy.radius + 5);
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
    // 캔버스 안 텍스트 HUD는 데모(봇) 전용 — DOM HUD가 있으면 중복이라 숨긴다
    if (!this.deps.bot) {
      this.hud.setVisible(false);
      this.msg.setVisible(false);
      this.pickBanner.setVisible(false);
      return;
    }
    const particles = this.particles.metrics;
    const embers = this.embers.metrics;
    const fps = Math.round(this.game.loop.actualFps);
    this.hud.setText(
      `R${game.round}  금화 ${Math.floor(game.mineral)}  마정석 ${Math.floor(game.gas)}  ` +
      `라이프 ${game.lives}  킬 ${game.kills}  영웅 Lv${game.hero.level}${game.hero.atMaxLevel ? '(만렙)' : ''}\n` +
      `FPS ${fps}  FX ${particles.active}/${particles.peak}/${particles.dropped} (cap ${particles.cap})  ` +
      `EMBER ${embers.active}/${embers.peak}/${embers.dropped} (cap ${embers.cap})`,
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
