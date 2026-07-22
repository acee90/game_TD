// ───────── Wiki 타워 프리뷰 씬 ─────────
// 타워 한 기가 허수아비 한 기를 향해 반복 발사한다 (M5).
// 투사체·트레일·착탄은 BattleScene과 **같은 ProjectileFxController**를 호출한다 —
// 피해·HP 판정은 없다. 수치표는 엔진 계산(tower-wiki view-model)이 담당하고
// 이 캔버스는 동일 VFX의 시각 확인만 맡는다 (§4.3).

import Phaser from 'phaser';
import { GOD_TIER, RACE_COLOR } from '@engine/data/units';
import { ParticlePool, UI_FONT, UI_RES } from '../fx';
import { makeGlowTextures, makeTextures, tint } from '../sprites';
import { ProjectileFxController } from '../projectile-fx';

/** 프리뷰 렌더 입력 — view-model(tower-wiki)에서 파생한 값만 받는다. 규칙 계산 없음. */
export interface TowerPreviewInput {
  race: number;
  tags: readonly string[];
  tier: number;
  /** 엔진 attackInterval() 결과 — 씬은 가독성 범위로만 클램프한다 */
  attackInterval: number;
  /** 엔진 splashRadius() 결과 — 스플래시 태그가 아니면 null */
  splashRadius: number | null;
}

// 월드 좌표 — 캔버스는 2배 해상도(zoom 2)로 본다 (BattleScene과 같은 도트 규약)
const WORLD_W = 320;
const WORLD_H = 180;
const TOWER_X = 64;
const DUMMY_X = 258;
const GROUND_Y = 118;
/** 발사 주기 가독성 클램프 — 실제 공속은 수치표가 말한다 */
const MIN_FIRE_INTERVAL = 0.6;
const MAX_FIRE_INTERVAL = 2.4;

const DEPTH = { board: 0, actor: 4, shot: 10, particle: 12 };

export class TowerPreviewScene extends Phaser.Scene {
  private particles!: ParticlePool;
  private projectileFx!: ProjectileFxController;
  private fireTimer = 0.35; // 첫 발은 살짝 뜸 들였다 발사
  private clock = 0;
  private paused = false;
  private speedMult = 1;

  constructor(private cfg: TowerPreviewInput) {
    super('tower-preview');
  }

  preload(): void {
    // 라우트 기준 상대 경로가 깨지지 않게 루트 고정 — 서브패스 배포 시 paths.base 주입
    this.load.setBaseURL('/');
    ProjectileFxController.preload(this);
  }

  create(): void {
    makeTextures(this);
    makeGlowTextures(this);
    ProjectileFxController.createAnimations(this);

    this.cameras.main.setZoom(2);
    this.cameras.main.centerOn(WORLD_W / 2, WORLD_H / 2);
    this.cameras.main.setBackgroundColor('#0d0a06');

    this.drawStage();

    this.particles = new ParticlePool(this, DEPTH.particle);
    this.projectileFx = new ProjectileFxController(this, this.particles, DEPTH.shot);

    // 타워 본체 — BattleScene syncTowers와 같은 규약 (병과 틴트·티어 스케일·라벨)
    const god = this.cfg.tier === GOD_TIER;
    this.add
      .image(TOWER_X, GROUND_Y - 8, god ? 'towerGod' : 'tower')
      .setTint(tint(RACE_COLOR[this.cfg.race]))
      .setScale((god ? 1.2 : 1 + this.cfg.tier * 0.14) / 2)
      .setDepth(DEPTH.actor);
    this.add
      .text(TOWER_X, GROUND_Y - 7, god ? 'G' : String(this.cfg.tier + 1), {
        fontFamily: UI_FONT, fontStyle: 'bold', fontSize: 8, color: '#1a130a',
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.actor + 1)
      .setResolution(UI_RES);

    // 허수아비 — 게임의 미끼(decoy)와 같은 텍스처
    this.add.image(DUMMY_X, GROUND_Y - 6, 'decoy').setScale(0.5).setDepth(DEPTH.actor);
  }

  /** 무대 — 보드와 같은 톤의 바닥 띠. 투사체가 잘리지 않게 여백을 넉넉히 둔다. */
  private drawStage(): void {
    this.add.rectangle(WORLD_W / 2, GROUND_Y + 24, WORLD_W, 60, 0x17120c).setDepth(DEPTH.board);
    this.add.rectangle(WORLD_W / 2, GROUND_Y + 1, WORLD_W, 2, 0x2a2115).setDepth(DEPTH.board);
    // 사거리 감각을 주는 눈금 — 수치는 정보 패널이 말한다
    for (let x = 24; x < WORLD_W - 12; x += 32) {
      this.add.rectangle(x, GROUND_Y + 5, 1, 4, 0x3a2e1d).setDepth(DEPTH.board);
    }
  }

  update(_time: number, deltaMs: number): void {
    if (this.paused) return;
    const dt = Math.min(deltaMs / 1000, 0.05) * this.speedMult;
    this.clock += dt;

    this.fireTimer -= dt;
    if (this.fireTimer <= 0) {
      this.fireTimer = Phaser.Math.Clamp(
        this.cfg.attackInterval,
        MIN_FIRE_INTERVAL,
        MAX_FIRE_INTERVAL,
      );
      this.fire();
    }

    this.projectileFx.update(dt, this.clock);
    this.particles.update(dt);
  }

  /** 실게임 발사 이벤트와 같은 필드 구성 (game.ts 타워 공격 경로 참조) */
  private fire(): void {
    this.projectileFx.spawn({
      x: TOWER_X,
      y: GROUND_Y - 14,
      tx: DUMMY_X,
      ty: GROUND_Y - 6,
      color: RACE_COLOR[this.cfg.race],
      race: this.cfg.race as 0 | 1 | 2 | 3,
      speed: this.cfg.tags.includes('speed'),
      splashRadius: this.cfg.splashRadius ?? undefined,
    });
  }

  /** 0.5× / 1× — 프리뷰 가독용 (개발자용 2×는 vfx-lab에 남긴다) */
  setSpeed(mult: number): void {
    this.speedMult = mult;
  }

  /** 탭 백그라운드·뷰포트 밖·reduced-motion — 애니메이션 정지 */
  setPaused(paused: boolean): void {
    this.paused = paused;
  }

  /** 다시 보기 — 다음 발사를 즉시 당긴다 */
  replay(): void {
    this.paused = false;
    this.fireTimer = 0;
  }
}

/** Svelte 컴포넌트가 onMount에서 부르고 언마운트 시 game.destroy(true)한다 */
export function createTowerPreview(
  parent: HTMLElement,
  input: TowerPreviewInput,
): { game: Phaser.Game; scene: TowerPreviewScene } {
  const scene = new TowerPreviewScene(input);
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: WORLD_W * 2,
    height: WORLD_H * 2,
    pixelArt: true,
    roundPixels: true,
    backgroundColor: '#0d0a06',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: [scene],
  });
  return { game, scene };
}
