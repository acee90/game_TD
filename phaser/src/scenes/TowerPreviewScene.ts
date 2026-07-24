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
import { ATTACK_RELEASE_FRAME, type CharacterAsset } from '../character-assets';

export type PreviewMotion = 'idle' | 'attack1' | 'attack2';

/** 프리뷰 렌더 입력 — view-model(tower-wiki)에서 파생한 값만 받는다. 규칙 계산 없음. */
export interface TowerPreviewInput {
  /** Wiki에서 승인된 캐릭터 애니메이션 키가 있을 때만 전달한다. */
  characterAsset: CharacterAsset | null;
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
// 탑다운 보드의 같은 깊이선에 캐릭터와 허수아비를 놓는다.
const GROUND_Y = 96;
/** 발사 주기 가독성 클램프 — 실제 공속은 수치표가 말한다 */
const MIN_FIRE_INTERVAL = 0.6;
const MAX_FIRE_INTERVAL = 2.4;

const DEPTH = { board: 0, actor: 4, shot: 10, particle: 12 };

export class TowerPreviewScene extends Phaser.Scene {
  private particles!: ParticlePool;
  private projectileFx!: ProjectileFxController;
  private fireTimer = 0; // 프리뷰는 대기 없이 첫 프레임부터 공격을 보여 준다
  private clock = 0;
  private paused = false;
  private speedMult = 1;
  private actor?: Phaser.GameObjects.Sprite;
  private motion: PreviewMotion = 'attack1';
  /** 공격 시트에서 투사체가 떠나는 프레임 (0-based) — 캐릭터가 있을 때만 유효 */
  private releaseFrame = ATTACK_RELEASE_FRAME['human-archer'];

  constructor(private cfg: TowerPreviewInput) {
    super('tower-preview');
  }

  preload(): void {
    // 라우트 기준 상대 경로가 깨지지 않게 루트 고정 — 서브패스 배포 시 paths.base 주입
    this.load.setBaseURL('/');
    ProjectileFxController.preload(this);
    if (this.cfg.characterAsset) {
      for (const motion of ['idle', 'attack1', 'attack2'] as const) {
        this.load.spritesheet(
          `${this.cfg.characterAsset}-${motion}`,
          `assets/sprites/${this.cfg.characterAsset}-${motion}.png`,
          { frameWidth: 96, frameHeight: 96 },
        );
      }
    }
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

    if (this.cfg.characterAsset) {
      this.releaseFrame = ATTACK_RELEASE_FRAME[this.cfg.characterAsset];
      this.createCharacterAnimations(this.cfg.characterAsset);
      // 프레임의 투명 여백까지 포함한 원본 중심을 유지한다. 발은 GROUND_Y에 맞춘다.
      this.actor = this.add
        .sprite(TOWER_X, GROUND_Y - 8, `${this.cfg.characterAsset}-idle`, 0)
        .setScale(1) // 전투 씬과 동일 배율 (2026-07-24 유닛 스케일업)
        .setDepth(DEPTH.actor)
        .play(`${this.cfg.characterAsset}-${this.motion}`, true);
      // 애니메이션 속도도 프리뷰 배속을 따라간다 — 안 그러면 0.5×에서 투사체만 느려져 다시 어긋난다.
      this.actor.anims.timeScale = this.speedMult;
      // 투사체는 발사 프레임을 지나는 순간에만 생성한다 — 손·무기와 싱크를 맞추는 핵심.
      this.actor.on(
        Phaser.Animations.Events.ANIMATION_UPDATE,
        (_anim: Phaser.Animations.Animation, frame: Phaser.Animations.AnimationFrame) => {
          // frame.index는 1-based(프레임 배열 위치). 0-based 발사 프레임과 비교한다.
          if (this.paused || this.motion === 'idle') return;
          if (frame.index - 1 === this.releaseFrame) this.spawnShot();
        },
      );
    } else {
      // 승인된 캐릭터 애니메이션이 없는 타워는 기존 프로시저럴 타워를 사용한다.
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
    }

    // 허수아비 — 게임의 미끼(decoy)와 같은 텍스처, 캐릭터와 같은 탑다운 깊이선
    this.add.image(DUMMY_X, GROUND_Y, 'decoy').setScale(0.5).setDepth(DEPTH.actor);
  }

  /** 무대 — 지평선/바닥 띠 없이 게임 보드와 같은 평면 탑다운 구도. */
  private drawStage(): void {
    this.add.rectangle(WORLD_W / 2, WORLD_H / 2, WORLD_W, WORLD_H, 0x17120c).setDepth(DEPTH.board);
    // 게임 보드의 셀 결을 약하게만 보여준다 — 수평 지면선과 원근감은 넣지 않는다.
    for (let x = 0; x <= WORLD_W; x += 16) {
      this.add.rectangle(x, WORLD_H / 2, 1, WORLD_H, 0x211a12, 0.55).setDepth(DEPTH.board);
    }
    for (let y = 0; y <= WORLD_H; y += 16) {
      this.add.rectangle(WORLD_W / 2, y, WORLD_W, 1, 0x211a12, 0.55).setDepth(DEPTH.board);
    }
    this.add.rectangle(WORLD_W / 2, GROUND_Y, WORLD_W - 24, 22, 0x241c12, 0.82).setDepth(DEPTH.board);
    this.add.rectangle(WORLD_W / 2, GROUND_Y, WORLD_W - 24, 1, 0x46392a, 0.8).setDepth(DEPTH.board);
  }

  update(_time: number, deltaMs: number): void {
    if (this.paused) return;
    const dt = Math.min(deltaMs / 1000, 0.05) * this.speedMult;
    this.clock += dt;

    // 캐릭터가 있으면 투사체는 공격 애니메이션의 발사 프레임(ANIMATION_UPDATE)이 생성한다 —
    // 스윙과 완전히 동기화된다. 캐릭터 없는 프로시저럴 타워만 여기서 주기 발사한다.
    if (!this.actor) {
      this.fireTimer -= dt;
      if (this.fireTimer <= 0) {
        this.fireTimer = Phaser.Math.Clamp(
          this.cfg.attackInterval,
          MIN_FIRE_INTERVAL,
          MAX_FIRE_INTERVAL,
        );
        if (this.motion !== 'idle') this.spawnShot();
      }
    }

    this.projectileFx.update(dt, this.clock);
    this.particles.update(dt);
    // 검수 기본값은 공격이다. Action 프레임이 끝나도 idle 첫 프레임으로 떨어지지 않고
    // 같은 동작을 이어 재생해 시트의 실제 공격 루프를 확인하게 한다.
    if (this.actor && !this.actor.anims.isPlaying) {
      this.actor.play(`${this.cfg.characterAsset}-${this.motion}`, true);
    }
  }

  /** 실게임 발사 이벤트와 같은 필드 구성 (game.ts 타워 공격 경로 참조).
   *  캐릭터 타워는 발사 프레임에서, 프로시저럴 타워는 주기 타이머에서 호출된다. */
  private spawnShot(): void {
    if (this.motion === 'idle') return;
    this.projectileFx.spawn({
      // 캐릭터 손/검 위치와 발사 시작점을 같은 월드 좌표계로 맞춘다.
      x: TOWER_X - 4,
      y: GROUND_Y - 7,
      tx: DUMMY_X,
      ty: GROUND_Y,
      color: RACE_COLOR[this.cfg.race],
      race: this.cfg.race as 0 | 1 | 2 | 3,
      speed: this.cfg.tags.includes('speed'),
      splashRadius: this.cfg.splashRadius ?? undefined,
    });
  }

  /** 동작별 시트를 직접 사용해 빈 칸을 애니메이션 프레임으로 포함하지 않는다. */
  private createCharacterAnimations(key: CharacterAsset): void {
    const entries: readonly [PreviewMotion, number, number][] = [
      ['idle', 6, 7],
      ['attack1', 8, 16],
      ['attack2', 8, 16],
    ];
    for (const [name, frameCount, frameRate] of entries) {
      const animationKey = `${key}-${name}`;
      if (!this.anims.exists(animationKey)) {
        this.anims.create({
          key: animationKey,
          frames: this.anims.generateFrameNumbers(`${key}-${name}`, {
            start: 0,
            end: frameCount - 1,
          }),
          frameRate,
          repeat: -1,
        });
      }
    }
  }

  /** Wiki에서 프레임 행을 분리해 검수한다. */
  setMotion(motion: PreviewMotion): void {
    this.motion = motion;
    if (motion === 'idle') {
      this.actor?.play(`${this.cfg.characterAsset}-idle`, true);
      return;
    }
    this.fireTimer = 0;
    this.actor?.play(`${this.cfg.characterAsset}-${motion}`, true);
  }

  /** 0.5× / 1× — 프리뷰 가독용 (개발자용 2×는 vfx-lab에 남긴다).
   *  투사체 dt와 애니메이션을 같은 배속으로 스케일해 발사 싱크를 유지한다. */
  setSpeed(mult: number): void {
    this.speedMult = mult;
    if (this.actor) this.actor.anims.timeScale = mult;
  }

  /** 탭 백그라운드·뷰포트 밖·reduced-motion — 애니메이션 정지.
   *  애니메이션도 멈춰야 발사 프레임 이벤트가 나지 않고 투사체가 새지 않는다. */
  setPaused(paused: boolean): void {
    this.paused = paused;
    if (this.actor) {
      if (paused) this.actor.anims.pause();
      else this.actor.anims.resume();
    }
  }

  /** 다시 보기 — 정지를 풀고 공격 스윙을 처음부터 다시 재생한다 */
  replay(): void {
    this.setPaused(false);
    this.fireTimer = 0;
    if (this.actor && this.motion !== 'idle') {
      this.actor.play(`${this.cfg.characterAsset}-${this.motion}`, true);
    }
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
