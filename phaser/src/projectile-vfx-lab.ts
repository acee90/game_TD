import Phaser from 'phaser';
import './vfx-lab.css';

const WIDTH = 960;
const HEIGHT = 1390;
const FRAME_COUNT = 8;
const PANEL_DARK = 0x17120c;
const PANEL_LIGHT = 0xc7bdab;
const GOLD = '#f0d392';
const MUTED = '#9c9281';

interface Candidate {
  key: string;
  label: string;
  note: string;
}

const CANDIDATES: Candidate[] = [
  { key: 'explosion-02', label: '후보 02', note: '기준 · 긴 화염→연기 전환' },
  { key: 'explosion-04', label: '후보 04', note: '비교 · 3프레임부터 가속 소멸' },
  { key: 'explosion-05', label: '후보 05', note: '비교 · 방사형 화염과 얇은 잔연기' },
  { key: 'explosion-06', label: '후보 06', note: '비교 · 3프레임 폭발과 고정 연기 페이드' },
];

class ProjectileVfxLabScene extends Phaser.Scene {
  preload(): void {
    this.load.spritesheet('explosion-02', 'assets/vfx-preview/explosion-candidate-02.png?v=02-75', {
      frameWidth: 48,
      frameHeight: 48,
    });
    this.load.spritesheet('explosion-04', 'assets/vfx-preview/explosion-candidate-04.png?v=04-75', {
      frameWidth: 48,
      frameHeight: 48,
    });
    this.load.spritesheet('explosion-05', 'assets/vfx-preview/explosion-candidate-05.png?v=05-75', {
      frameWidth: 48,
      frameHeight: 48,
    });
    this.load.spritesheet('explosion-06', 'assets/vfx-preview/explosion-candidate-06.png?v=06-75', {
      frameWidth: 48,
      frameHeight: 48,
    });
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#100d09');
    for (const candidate of CANDIDATES) {
      this.textures.get(candidate.key).setFilter(Phaser.Textures.FilterMode.LINEAR);
      for (const fps of [12, 24, 48]) {
        this.anims.create({
          key: `${candidate.key}-${fps}`,
          frames: this.anims.generateFrameNumbers(candidate.key, { start: 0, end: 7 }),
          frameRate: fps,
          repeat: -1,
          repeatDelay: 360,
        });
      }
    }

    this.add.text(30, 24, 'B2 / EXPLOSION.PNG — CANDIDATE 02 / 04 / 05 / 06', {
      fontFamily: 'Rajdhani, sans-serif', fontStyle: 'bold', fontSize: 22, color: GOLD,
    });
    this.add.text(30, 52, '384×48 · 48×48 × 8 frames · content scale 75% · soft alpha / LINEAR · preview-only', {
      fontFamily: 'Gowun Dodum, sans-serif', fontSize: 12, color: MUTED,
    });
    this.badge(755, 30, 'BATTLESCENE 미연결');

    this.sectionTitle(30, 92, '01  FRAME STRIPS', '네 후보의 프레임별 화염→연기 전환 비교');
    this.frameStrip(CANDIDATES[0], 122);
    this.frameStrip(CANDIDATES[1], 218);
    this.frameStrip(CANDIDATES[2], 314);
    this.frameStrip(CANDIDATES[3], 410);

    this.sectionTitle(30, 522, '02  PLAYBACK SPEED', '각 칸 위부터 후보 02 / 04 / 05 / 06');
    [
      { x: 30, label: '0.5×', fps: 12 },
      { x: 340, label: '1×', fps: 24 },
      { x: 650, label: '2×', fps: 48 },
    ].forEach((speed) => {
      this.panel(speed.x, 552, 280, 310, PANEL_DARK);
      this.add.text(speed.x + 18, 565, speed.label, {
        fontFamily: 'Rajdhani, sans-serif', fontStyle: 'bold', fontSize: 18, color: GOLD,
      });
      CANDIDATES.forEach((candidate, index) => {
        const y = 618 + index * 64;
        this.add.text(speed.x + 24, y - 7, candidate.label, {
          fontFamily: 'Gowun Dodum, sans-serif', fontSize: 10, color: MUTED,
        }).setOrigin(0, 0.5);
        this.add.sprite(speed.x + 170, y, candidate.key)
          .setScale(1.35)
          .play(`${candidate.key}-${speed.fps}`);
      });
    });

    this.sectionTitle(30, 887, '03  OCCLUSION / DENSITY CHECK', '각 후보의 기준 몬스터·단발·5발 동시 착탄');
    CANDIDATES.forEach((candidate, index) => {
      const x = 30 + (index % 2) * 460;
      const y = 917 + Math.floor(index / 2) * 165;
      this.panel(x, y, 440, 145, PANEL_DARK);
      this.add.text(x + 14, y + 13, candidate.label, {
        fontFamily: 'Gowun Dodum, sans-serif', fontSize: 11, color: index ? '#d6b46e' : '#b4aa9a',
      });
      this.add.text(x + 14, y + 33, candidate.note, {
        fontFamily: 'Gowun Dodum, sans-serif', fontSize: 9, color: MUTED,
      });
      this.monsterSample(candidate, x + 85, y + 89, '기준', 0);
      this.monsterSample(candidate, x + 220, y + 89, '단발', 1);
      this.monsterSample(candidate, x + 355, y + 89, '5발', 5);
    });

    this.sectionTitle(30, 1267, '04  BACKGROUND CHECK', '어두운 보드와 밝은 바닥에서 1× 재생');
    CANDIDATES.forEach((candidate, index) => this.backgroundSample(candidate, 30 + index * 230, 1297));
  }

  private frameStrip(candidate: Candidate, y: number): void {
    this.panel(30, y, 900, 88, PANEL_DARK);
    this.add.text(48, y + 18, candidate.label, {
      fontFamily: 'Rajdhani, sans-serif', fontStyle: 'bold', fontSize: 16, color: GOLD,
    });
    this.add.text(48, y + 43, candidate.note, {
      fontFamily: 'Gowun Dodum, sans-serif', fontSize: 9, color: MUTED,
    });
    for (let frame = 0; frame < FRAME_COUNT; frame++) {
      const x = 220 + frame * 88;
      this.add.image(x, y + 42, candidate.key, frame).setScale(1.1);
      this.add.text(x, y + 73, String(frame + 1).padStart(2, '0'), {
        fontFamily: 'Rajdhani, sans-serif', fontStyle: 'bold', fontSize: 10, color: '#827662',
      }).setOrigin(0.5);
    }
  }

  private monsterSample(candidate: Candidate, x: number, y: number, label: string, impacts: number): void {
    this.add.circle(x, y, 15, 0x756957, 1).setStrokeStyle(2, 0x2a241c, 1);
    this.add.circle(x - 5, y - 2, 2, 0xe8d9b8, 1);
    this.add.circle(x + 5, y - 2, 2, 0xe8d9b8, 1);
    this.add.text(x, y + 30, label, {
      fontFamily: 'Gowun Dodum, sans-serif', fontSize: 10, color: MUTED,
    }).setOrigin(0.5);
    for (let i = 0; i < impacts; i++) {
      const offset = impacts === 1 ? 0 : (i - 2) * 4;
      this.add.sprite(x + offset, y + (i % 2 ? 3 : -2), candidate.key)
        .setAlpha(0.88)
        .play(`${candidate.key}-24`);
    }
  }

  private backgroundSample(candidate: Candidate, x: number, y: number): void {
    this.panel(x, y, 210, 82, PANEL_DARK);
    this.add.rectangle(x + 158, y + 41, 104, 80, PANEL_LIGHT, 1);
    this.add.text(x + 16, y + 12, candidate.label, {
      fontFamily: 'Rajdhani, sans-serif', fontStyle: 'bold', fontSize: 14, color: GOLD,
    });
    this.add.sprite(x + 53, y + 48, candidate.key).play(`${candidate.key}-24`);
    this.add.sprite(x + 158, y + 48, candidate.key).play(`${candidate.key}-24`);
  }

  private sectionTitle(x: number, y: number, title: string, note: string): void {
    this.add.text(x, y, title, {
      fontFamily: 'Rajdhani, sans-serif', fontStyle: 'bold', fontSize: 16, color: '#d6b46e',
    });
    this.add.text(x + 205, y + 2, note, {
      fontFamily: 'Gowun Dodum, sans-serif', fontSize: 10, color: MUTED,
    });
  }

  private panel(x: number, y: number, width: number, height: number, color: number): void {
    this.add.rectangle(x + width / 2, y + height / 2, width, height, color, 1)
      .setStrokeStyle(1, 0x5b482b, 0.55);
  }

  private badge(x: number, y: number, text: string): void {
    this.add.text(x, y, text, {
      fontFamily: 'Gowun Dodum, sans-serif', fontSize: 10, color: '#ffb29f',
      backgroundColor: '#5b241c', padding: { x: 8, y: 5 },
    });
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'lab',
  width: WIDTH,
  height: HEIGHT,
  pixelArt: false,
  roundPixels: false,
  backgroundColor: '#100d09',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [ProjectileVfxLabScene],
});
