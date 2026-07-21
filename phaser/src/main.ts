import Phaser from 'phaser';
import { BattleScene } from './BattleScene';

// 420×470은 엔진(맵 좌표)의 논리 해상도다. FIT 스케일로 창에 꽉 채운다
// (2026-07-21, 사용자 피드백: "화면이 너무 작다") — 비정수 확대의 미세한 픽셀
// 불균일은 HD-2D 이펙트(LINEAR 글로우)와 섞이면 눈에 거의 안 띈다.
new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'app',
  width: 420,
  height: 470,
  pixelArt: true,
  roundPixels: true,
  backgroundColor: '#0d0a06',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BattleScene],
});
