// ───────── 전투 씬 — 엔진 상태를 도트로 그린다 ─────────
// 게임 규칙은 전부 @engine(engine/src)의 Game 클래스가 굴린다. 이 씬은
// ① 상태를 스프라이트로 비추고 ② vfx/shots/floats 큐를 파티클·연출로 바꾼다.
// 규칙 코드는 여기 없다 — 이게 engine/(밸런스 실험실)과 규칙이 영원히 같은 이유다.

import Phaser from 'phaser';
import { Game } from '@engine/game/game';
import type { Enemy, Shot } from '@engine/game/types';
import {
  DOOR_IN, DOOR_OUT, NEXUS, TILE,
  pathPos, pathPosOffset,
} from '@engine/core/map';
import { BOSS_COOLDOWN_SECONDS } from '@engine/data/balance';
import { range } from '@engine/game/combat';
import { GOD_TIER, RACE_COLOR } from '@engine/data/units';
import { HERO_RADIUS } from '@engine/data/hero';
import { SKILLS } from '@engine/data/skills';
import { ParticlePool, TextPool, UI_FONT, UI_RES } from './fx';
import { createTiledMap, preloadTiledMap } from './tiled-map';
import { makeAnims, makeGlowTextures, makeTextures, tint } from './sprites';
import { ProjectileFxController } from './projectile-fx';
import { PreviewBot } from './bot';
import {
  ATTACK_RELEASE_FRAME, BATTLE_CHARACTER_ASSETS, characterAssetForTower, type CharacterAsset,
} from './character-assets';

// 길 렌더 폭 = 정확히 한 칸(TILE). 격자 정렬(2026-07-24) 후 길이 옆 모서리 셀로 삐져나오지 않게
// 한 칸 안에 가둔다. (기존 (WALKABLE+10)*2=56은 한 칸보다 넓어 모서리 슬롯과 겹쳐 보였다)
const PATH_WIDTH = TILE;

const DEPTH = {
  // Tiled 지형(gtd-map)이 맨 아래. 레이어 6장이 -10..-5를 쓰므로 board(0)와 안 겹친다.
  terrain: -10, board: 0, zone: 2, tower: 4, enemy: 6, hero: 8, decoy: 7,
  shot: 10, particle: 12, overlay: 14, text: 16, hud: 20,
};

// 티어 숫자는 Phaser 월드 텍스트가 아니라 캔버스 밖 DOM 오버레이(TowerBadges.svelte)가
// 그린다 — 캔버스가 CSS로 축소돼도 clamp() 최소 폰트로 가독성을 지킨다 (2026-07-23 결정).
interface TowerView {
  img: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite;
  /** 발밑 티어 원판 — 티어만큼 pip, GOD은 금빛 링. 숫자는 DOM 배지(TowerBadges) 담당 */
  disc: Phaser.GameObjects.Image;
  key: string;
  /** 외부 캐릭터 시트의 키. 없으면 기존 프로시저럴 타워다. */
  characterKey: CharacterAsset | null;
  /** 공격 시트에서 투사체가 떠나는 프레임 (0-based) — 캐릭터 타워만 유효 */
  releaseFrame: number;
  /** 발사 프레임까지 대기 중인 발사 — 스윙 정점에서 한꺼번에 투사체로 나간다 */
  pendingShots: Shot[];
}

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
    for (const key of BATTLE_CHARACTER_ASSETS) {
      this.load.spritesheet(key, `assets/sprites/${key}.png`, {
        frameWidth: 96,
        frameHeight: 96,
      });
    }
    preloadTiledMap(this); // Tiled로 그린 지형 — 절차적 보드를 대체한다
    ProjectileFxController.preload(this); // 화살 본체 + 포병 착탄 플립북
    // SparkSet 파티클 팩 — 감속 눈꽃만 채택 (별·섬광은 기존 톤과 안 맞아 반려, 2026-07-22)
    this.load.image('fx-snow', 'assets/fx/snow.png');
  }

  create(): void {
    makeTextures(this);
    makeGlowTextures(this); // HD-2D 이펙트 — 월드는 NEAREST, 글로우는 LINEAR
    makeAnims(this);

    for (const key of BATTLE_CHARACTER_ASSETS) {
      this.createCharacterAnimations(key);
    }

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

    // 타워 뷰 — 슬롯 수만큼 미리 만들어 두고 상태에 맞춰 보이기만 바꾼다.
    // 티어 숫자 라벨은 여기서 그리지 않는다 — DOM 오버레이(TowerBadges)가 맡는다.
    this.makeTierDiscTextures();
    for (const slot of this.game_.slots) {
      const img = this.add.image(slot.x, slot.y, 'tower').setDepth(DEPTH.tower).setVisible(false);
      // 발밑 원판 — 유닛보다 아래(depth), 발치(y+12)에 깔린다. 텍스처는 2배 해상도.
      const disc = this.add
        .image(slot.x, slot.y + 12, 'tier-disc-0')
        .setScale(0.5)
        .setDepth(DEPTH.tower - 1)
        .setVisible(false);
      this.towers.push({ img, disc, key: '', characterKey: null, releaseFrame: 0, pendingShots: [] });
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

  /**
   * 발밑 티어 원판 텍스처 — 'tier-disc-0..3'(pip 1~4개) + 'tier-disc-god'(금빛 링).
   *
   * 티어를 숫자가 아니라 **형태**(pip 개수)로 부호화한다: 월드 텍스트 숫자는 캔버스가
   * CSS로 축소되면 안 읽혀서 DOM 배지로 옮긴 이력이 있고(2026-07-23), 바닥 숫자도 같은
   * 함정이다. pip은 축소돼도 개수가 읽힌다. 정확한 숫자는 여전히 TowerBadges(DOM)가 맡는다.
   * 색은 쓰지 않는다 — RACE_COLOR가 이미 종족을 말하고 있어 티어까지 색이면 충돌한다.
   * pip은 앞쪽 호(아래 반원)에만 — 유닛 뒤로 숨지 않는 자리다. 텍스처는 2배 해상도.
   */
  private makeTierDiscTextures(): void {
    const W2 = 76; // 2x: 월드 38×20
    const H2 = 40;
    const cx = W2 / 2;
    const cy = H2 / 2;
    const rx = 34;
    const ry = 15;
    for (let tier = 0; tier <= GOD_TIER; tier++) {
      const god = tier === GOD_TIER;
      const g = this.add.graphics();
      g.fillStyle(0x000000, god ? 0.34 : 0.28);
      g.fillEllipse(cx, cy, rx * 2, ry * 2);
      g.lineStyle(2, god ? 0xffdf7a : 0x3a2f1e, god ? 0.9 : 0.65);
      g.strokeEllipse(cx, cy, rx * 2, ry * 2);
      if (god) {
        // GOD — 이중 링 (pip 대신 격을 형태로)
        g.lineStyle(2, 0xffdf7a, 0.5);
        g.strokeEllipse(cx, cy, rx * 2 - 8, ry * 2 - 6);
      } else {
        // pip = tier+1개, 앞쪽 호(45°~135°)에 균등 배치
        const n = tier + 1;
        for (let k = 0; k < n; k++) {
          const a = ((n === 1 ? 90 : 55 + (70 * k) / (n - 1)) * Math.PI) / 180;
          const px = cx + (rx - 3) * Math.cos(a);
          const py = cy + (ry - 1) * Math.sin(a);
          g.fillStyle(0x0d0a06, 0.9);
          g.fillCircle(px, py, 4.5);
          g.fillStyle(0xf0d392, 1);
          g.fillCircle(px, py, 3);
        }
      }
      g.generateTexture(god ? 'tier-disc-god' : `tier-disc-${tier}`, W2, H2);
      g.destroy();
    }
  }

  /**
   * 정적 보드 — 한 번만 그린다.
   *
   * 지형(잔디·돌길·절벽·소품)은 Tiled로 그린 gtd-map이 담당한다(2026-07-24). 예전에는
   * 여기서 십자 사각형·길 폴리라인을 색칠했는데, 그 불투명 칠이 타일맵을 덮으므로 걷어냈다.
   * 남긴 것은 **타일 아트가 표현하지 못하는 게임 어포던스**뿐 — 배치 가능한 슬롯 칸과
   * 입·출구 표시. 경로/지형 자체는 이제 맵 아트가 말한다.
   */
  private drawBoard(): void {
    // 맵을 엔진 월드 좌표계로 축소·배치한다 — 엔진 수치·클릭 판정은 그대로다.
    // 틴트: 지형이 유닛·VFX보다 밝아 묻힌다는 지적(2026-07-24)으로 한 단계 눌렀다.
    createTiledMap(this, { inEngineSpace: true, depthBase: DEPTH.terrain, tint: 0xa8a8a8 });

    const g = this.add.graphics().setDepth(DEPTH.board);

    // 슬롯 칸 — 어디에 놓을 수 있는지. 지형이 비치도록 옅은 칠 + 테두리만.
    for (const slot of this.game_.slots) {
      const half = TILE / 2 - 2;
      const altar = slot === this.game_.altarSlot;
      g.fillStyle(altar ? 0x2a2036 : 0x1a140d, altar ? 0.5 : 0.22);
      g.fillRect(slot.x - half, slot.y - half, half * 2, half * 2);
      g.lineStyle(1, altar ? 0x8a6ea6 : 0x6b563a, altar ? 1 : 0.75);
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
        view.disc.setVisible(false);
        view.key = '';
        view.characterKey = null;
        view.pendingShots.length = 0; // 빈 슬롯 — 대기 발사도 폐기
        return;
      }
      const god = tower.tier === GOD_TIER;
      const characterKey = characterAssetForTower(tower.def.id);
      const key = characterKey ?? `${tower.def.race}:${tower.tier}`;
      // 발밑 원판 — key와 별개로 갱신한다 (캐릭터 타워는 key에 티어가 없다)
      const discKey = god ? 'tier-disc-god' : `tier-disc-${tower.tier}`;
      if (view.disc.texture.key !== discKey) view.disc.setTexture(discKey);
      view.disc.setVisible(true);
      if (view.key !== key) {
        view.key = key;
        view.characterKey = characterKey;
        view.releaseFrame = characterKey ? ATTACK_RELEASE_FRAME[characterKey] : 0;
        view.pendingShots.length = 0; // 병과·티어 교체 — 이전 타워의 대기 발사 폐기
        if (characterKey) {
          if (!(view.img instanceof Phaser.GameObjects.Sprite)) {
            view.img.destroy();
            // 스케일 1에선 공격 모션이 인접 타일까지 뻗는다 — 아래쪽 타워가 위를 덮도록 y-정렬
            const sprite = this.add
              .sprite(slot.x, slot.y + 2, characterKey, 0)
              .setDepth(DEPTH.tower + slot.y / 1000);
            this.attachTowerAttackHandlers(sprite, view);
            view.img = sprite;
          }
          const actor = view.img as Phaser.GameObjects.Sprite;
          actor
            .setTexture(characterKey, 0)
            .clearTint()
            // 1 → 1.5 (2026-07-24, 오블리크 뷰라 그리드 밖으로 튀어나와도 된다는 사용자
            // 지시): 몸체 ~30px로 슬롯(36px)을 꽉 채운다. zoom 2 기준 텍셀=3화면px —
            // 정수 배율이라 도트가 깨지지 않는다 (1.25 같은 반정수는 뭉개진다).
            .setScale(1.5)
            .setVisible(true)
            .play(`${characterKey}-idle`, true);
        } else {
          if (view.img instanceof Phaser.GameObjects.Sprite) {
            view.img.destroy();
            view.img = this.add.image(slot.x, slot.y, 'tower').setDepth(DEPTH.tower);
          }
          view.img
            .setTexture(god ? 'towerGod' : 'tower')
            .setTint(tint(RACE_COLOR[tower.def.race]))
            .setScale((god ? 1.2 : 1 + tower.tier * 0.14) * 0.75) // 2배 해상도 기준 0.5 × 1.5(캐릭터와 동율 확대)
            .setVisible(true);
        }
        // 배치·티어업 순간의 팝
        this.particles.burst(slot.x, slot.y, RACE_COLOR[tower.def.race], 6, { speed: 45, life: 0.35 });
      }
    });
  }

  /** 에셋 팩과 같은 행 배치: Idle(0~5), Attack1(20~27). */
  private createCharacterAnimations(key: string): void {
    this.anims.create({
      key: `${key}-idle`,
      frames: this.anims.generateFrameNumbers(key, { start: 0, end: 5 }),
      frameRate: 7,
      repeat: -1,
    });
    this.anims.create({
      key: `${key}-attack`,
      frames: this.anims.generateFrameNumbers(key, { start: 20, end: 27 }),
      frameRate: 16,
      repeat: 0,
    });
  }

  /**
   * 캐릭터 타워 스프라이트에 공격 처리 리스너를 한 번만 붙인다 (스프라이트는 재사용된다).
   * 투사체는 발사 이벤트가 아니라 **공격 스윙의 발사 프레임**에서 생성해 손·무기와 싱크를 맞춘다.
   * 공격이 끝나면 idle로 복귀한다. 캐릭터가 바뀌어도 view.releaseFrame/pendingShots만 갱신하면 된다.
   */
  private attachTowerAttackHandlers(sprite: Phaser.GameObjects.Sprite, view: TowerView): void {
    sprite.on(
      Phaser.Animations.Events.ANIMATION_UPDATE,
      (anim: Phaser.Animations.Animation, frame: Phaser.Animations.AnimationFrame) => {
        if (view.pendingShots.length === 0 || !anim.key.endsWith('-attack')) return;
        // frame.index는 1-based(프레임 배열 위치). 0-based 발사 프레임과 비교한다.
        if (frame.index - 1 !== view.releaseFrame) return;
        for (const shot of view.pendingShots) this.projectileFx.spawn(shot);
        view.pendingShots.length = 0;
      },
    );
    sprite.on(Phaser.Animations.Events.ANIMATION_COMPLETE, (anim: Phaser.Animations.Animation) => {
      if (anim.key.endsWith('-attack') && sprite.active && view.characterKey) {
        sprite.play(`${view.characterKey}-idle`, true);
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
      // 엔진의 발사 원점은 타워 슬롯 좌표다. 같은 좌표의 캐릭터만 공격 모션을 재생한다.
      const index = this.game_.slots.findIndex((slot) =>
        slot.tower !== null && Math.hypot(slot.x - shot.x, slot.y - shot.y) < 1,
      );
      const view = index < 0 ? undefined : this.towers[index];
      if (view?.characterKey && view.img instanceof Phaser.GameObjects.Sprite) {
        // 캐릭터 타워 — 투사체는 공격 스윙을 처음부터 다시 재생하고, 발사 프레임에서 생성한다.
        // 매 발사마다 스윙을 리스타트해 발사 프레임이 항상 앞에 오도록 보장한다(투사체 유실 방지).
        view.pendingShots.push(shot);
        view.img.play(`${view.characterKey}-attack`);
      } else {
        // 프로시저럴 타워·영웅 — 동기화할 스윙이 없으니 즉시 발사한다.
        this.projectileFx.spawn(shot);
      }
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
