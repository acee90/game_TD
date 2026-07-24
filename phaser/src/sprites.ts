// ───────── 프로시저럴 도트 스프라이트 ─────────
// 외부 에셋 없이 시작 시 캔버스에 픽셀 단위로 구워 텍스처로 등록한다.
// 전부 흰색~회색 계열로 그린다 — 색은 런타임에 setTint(종족색·몹 타입색)로 입힌다.
// 해상도는 초기판(12px급)의 2배 — BattleScene의 카메라 zoom 2와 짝을 이뤄
// 같은 월드 크기에 두 배 밀도의 도트가 들어간다 (2026-07-21, 도트 고도화).
// 걷기는 4프레임(내딛기→모으기→반대→모으기), 재생은 makeAnims의 Phaser anims가 맡는다.
// 진짜 도트 아트(aseprite 등)로 교체할 때는 이 파일의 키만 유지하면 된다.

import Phaser from 'phaser';

/** 1px 단위 픽셀 브러시 */
type Px = (x: number, y: number, w?: number, h?: number, shade?: string) => void;

function makeCanvasTexture(
  scene: Phaser.Scene,
  key: string,
  w: number,
  h: number,
  draw: (px: Px, ctx: CanvasRenderingContext2D) => void,
): void {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, w, h);
  if (!tex) return;
  const ctx = tex.context;
  const px: Px = (x, y, pw = 1, ph = 1, shade = '#ffffff') => {
    ctx.fillStyle = shade;
    ctx.fillRect(x, y, pw, ph);
  };
  draw(px, ctx);
  tex.refresh();
}

// 명암 5단계 — 틴트가 곱해지므로 흰색이 곧 "본색 100%"다 (빛은 왼쪽 위)
const BODY = '#ffffff'; // 본색
const S1 = '#d2d2d2'; // 옅은 음영
const S2 = '#a4a4a4'; // 중간 음영
const S3 = '#747474'; // 짙은 음영
const INK = '#1a130a'; // 눈·틈새·잉크

/** 몹 — 24×24, 4프레임 걷기 (몸 바운스 + 다리 순환) */
function drawMob(px: Px, frame: number): void {
  const o = frame % 2; // 모으기 자세에서 몸이 1px 가라앉는다
  // 귀
  px(6, 2 + o, 2, 2, S1);
  px(16, 2 + o, 2, 2, S1);
  // 몸통 — 둥근 덩어리
  px(7, 3 + o, 10, 1, BODY);
  px(5, 4 + o, 14, 1, BODY);
  px(4, 5 + o, 16, 9, BODY);
  px(5, 14 + o, 14, 1, S1);
  px(6, 15 + o, 12, 1, S2);
  px(4, 5 + o, 1, 9, S1);
  px(19, 5 + o, 1, 9, S2);
  // 눈 — 잉크 + 글린트
  px(8, 7 + o, 2, 3, INK);
  px(14, 7 + o, 2, 3, INK);
  px(8, 7 + o, 1, 1, BODY);
  px(14, 7 + o, 1, 1, BODY);
  // 입
  px(11, 12 + o, 2, 1, S2);
  // 다리 — 내딛은 발은 길고 옅게, 들린 발은 짧고 짙게
  if (frame === 0) {
    px(7, 16, 3, 4, S2);
    px(14, 17, 3, 3, S3);
  } else if (frame === 2) {
    px(7, 17, 3, 3, S3);
    px(14, 16, 3, 4, S2);
  } else {
    px(7, 17, 3, 3, frame === 1 ? S2 : S3);
    px(14, 17, 3, 3, frame === 1 ? S3 : S2);
  }
}

/** 보스 — 36×36, 4프레임: 휜 뿔 + 성난 눈썹 + 벌린 입 */
function drawBoss(px: Px, frame: number): void {
  const o = frame % 2;
  // 뿔 — 끝이 바깥으로 휜다
  px(6, 2 + o, 2, 2, BODY);
  px(5, 3 + o, 3, 3, BODY);
  px(6, 5 + o, 4, 3, BODY);
  px(6, 2 + o, 1, 2, S1);
  px(28, 2 + o, 2, 2, BODY);
  px(28, 3 + o, 3, 3, BODY);
  px(26, 5 + o, 4, 3, BODY);
  px(29, 2 + o, 1, 2, S2);
  // 몸통 — 어깨 넓은 덩치
  px(8, 7 + o, 20, 1, BODY);
  px(6, 8 + o, 24, 18, BODY);
  px(7, 26 + o, 22, 1, S1);
  px(8, 27 + o, 20, 1, S2);
  px(6, 8 + o, 1, 18, S1);
  px(29, 8 + o, 1, 18, S2);
  // 성난 눈썹 + 눈 (글린트)
  px(10, 12 + o, 5, 2, S3);
  px(21, 12 + o, 5, 2, S3);
  px(10, 14 + o, 4, 5, INK);
  px(22, 14 + o, 4, 5, INK);
  px(10, 14 + o, 2, 2, BODY);
  px(22, 14 + o, 2, 2, BODY);
  // 벌린 입 + 이빨
  px(13, 21 + o, 10, 3, INK);
  px(14, 21 + o, 2, 2, BODY);
  px(20, 21 + o, 2, 2, BODY);
  px(17, 23 + o, 2, 1, BODY);
  // 발
  if (frame === 0) {
    px(9, 28, 6, 6, S2);
    px(21, 29, 6, 5, S3);
  } else if (frame === 2) {
    px(9, 29, 6, 5, S3);
    px(21, 28, 6, 6, S2);
  } else {
    px(9, 29, 6, 5, frame === 1 ? S2 : S3);
    px(21, 29, 6, 5, frame === 1 ? S3 : S2);
  }
}

/** 영웅 — 24×28, 2프레임 숨쉬기 (다리는 고정, 상체만 바운스) */
function drawHero(px: Px, frame: number): void {
  const o = frame;
  // 깃털 장식 — 숨쉴 때 살짝 흔들린다
  if (frame === 0) px(13, 0, 3, 2, S1);
  else px(12, 1, 3, 2, S1);
  // 투구
  px(7, 2 + o, 10, 2, BODY);
  px(6, 4 + o, 12, 5, BODY);
  px(6, 4 + o, 1, 5, S1);
  px(17, 4 + o, 1, 5, S2);
  // 바이저 — 눈빛 글린트
  px(8, 6 + o, 8, 2, INK);
  px(10, 6 + o, 1, 1, BODY);
  px(14, 6 + o, 1, 1, BODY);
  // 망토
  px(3, 10 + o, 2, 10, S2);
  px(19, 10 + o, 2, 10, S2);
  // 갑주
  px(4, 9 + o, 16, 2, BODY);
  px(5, 11 + o, 14, 10, BODY);
  px(5, 11 + o, 1, 10, S1);
  px(18, 11 + o, 1, 10, S2);
  // 벨트 + 버클
  px(6, 16 + o, 12, 1, S2);
  px(11, 15 + o, 2, 2, S1);
  // 다리
  px(7, 21, 4, 5, S2);
  px(13, 21, 4, 5, S2);
  px(7, 25, 4, 1, S3);
  px(13, 25, 4, 1, S3);
}

export function makeTextures(scene: Phaser.Scene): void {
  // 파티클용 낱알
  makeCanvasTexture(scene, 'px', 2, 2, (px) => px(0, 0, 2, 2));

  // 기본 투사체 (영웅·스킬) — 밝은 핵 + 꼬리 (12×6)
  makeCanvasTexture(scene, 'shot', 12, 6, (px) => {
    px(0, 2, 3, 2, S2);
    px(3, 1, 4, 4, S1);
    px(6, 1, 5, 4, BODY);
    px(7, 0, 3, 6, BODY);
    px(11, 2, 1, 2, BODY);
  });

  // 화살 — 작은 해상도에서도 깃·긴 화살대·촉이 분리되는 장축 실루엣 (30×8)
  makeCanvasTexture(scene, 'arrow', 30, 8, (px) => {
    // 이단 깃
    px(0, 0, 2, 3, S1);
    px(0, 5, 2, 3, S1);
    px(2, 1, 3, 2, BODY);
    px(2, 5, 3, 2, BODY);
    px(4, 2, 3, 4, S2);
    // 긴 화살대 — 어두운 하단과 밝은 상단으로 두께를 읽힌다
    px(6, 3, 19, 2, S3);
    px(7, 3, 18, 1, BODY);
    // 넓은 삼각 촉
    px(23, 2, 3, 4, S1);
    px(25, 1, 2, 6, BODY);
    px(27, 2, 2, 4, BODY);
    px(29, 3, 1, 2, BODY);
  });

  // 포탄 (포병) — 둥근 쇳덩이 + 심지 구멍 (10×10)
  makeCanvasTexture(scene, 'shell', 10, 10, (px) => {
    px(2, 0, 6, 10, BODY);
    px(0, 2, 10, 6, BODY);
    px(1, 1, 8, 8, BODY);
    px(8, 3, 1, 4, S1);
    px(6, 8, 3, 1, S1);
    px(2, 8, 4, 1, S2);
    px(4, 4, 2, 2, S2);
  });

  // 매직 볼트 (마법대) — 다이아몬드 결정 + 파셋 (10×10)
  makeCanvasTexture(scene, 'bolt', 10, 10, (px) => {
    px(4, 0, 2, 10, BODY);
    px(3, 1, 4, 8, BODY);
    px(2, 2, 6, 6, BODY);
    px(1, 3, 8, 4, BODY);
    px(0, 4, 10, 2, BODY);
    px(5, 5, 3, 2, S1);
    px(4, 7, 2, 2, S1);
  });

  // 가시 (소환대) — 4방 가시 + 대각 돌기 (10×10)
  makeCanvasTexture(scene, 'seed', 10, 10, (px) => {
    px(4, 0, 2, 3, BODY);
    px(0, 4, 3, 2, BODY);
    px(7, 4, 3, 2, BODY);
    px(4, 7, 2, 3, BODY);
    px(3, 3, 4, 4, BODY);
    px(2, 2, 1, 1, S1);
    px(7, 2, 1, 1, S1);
    px(2, 7, 1, 1, S1);
    px(7, 7, 1, 1, S1);
    px(4, 4, 2, 2, S2);
  });

  // 몹·보스 — 걷기 4프레임
  for (const frame of [0, 1, 2, 3]) {
    makeCanvasTexture(scene, `mob${frame}`, 24, 24, (px) => drawMob(px, frame));
    makeCanvasTexture(scene, `boss${frame}`, 36, 36, (px) => drawBoss(px, frame));
  }

  // 타워 — 28×28: 돌단 받침 + 벽돌 몸체 + 성가퀴 포탑 (틴트로 종족색)
  makeCanvasTexture(scene, 'tower', 28, 28, (px) => {
    px(5, 22, 18, 1, S2);
    px(4, 23, 20, 3, S3); // 받침
    px(6, 10, 16, 12, BODY); // 몸체
    px(6, 10, 1, 12, S1);
    px(21, 10, 1, 12, S2);
    px(7, 21, 14, 1, S1);
    // 벽돌 힌트 — 몸체 가운데는 비워 둔다 (티어 숫자 라벨이 그 위에 얹힌다)
    px(9, 13, 2, 1, S1);
    px(16, 15, 2, 1, S1);
    px(9, 19, 2, 1, S1);
    px(17, 19, 2, 1, S1);
    px(8, 6, 12, 4, BODY); // 포탑
    px(8, 4, 2, 2, BODY); // 성가퀴
    px(13, 4, 2, 2, BODY);
    px(18, 4, 2, 2, BODY);
    px(8, 6, 1, 4, S1);
    px(19, 6, 1, 4, S2);
    px(13, 7, 2, 3, INK); // 총안
  });

  // GOD 타워 — 32×32: 삼지 왕관 + 잉크 테두리 보석
  makeCanvasTexture(scene, 'towerGod', 32, 32, (px) => {
    px(5, 26, 22, 1, S2);
    px(4, 27, 24, 3, S3); // 받침
    px(6, 12, 20, 14, BODY); // 몸체
    px(6, 12, 1, 14, S1);
    px(25, 12, 1, 14, S2);
    px(7, 25, 18, 1, S1);
    px(7, 6, 2, 2, BODY); // 왕관 뿔 — 가운데가 제일 높다
    px(6, 8, 4, 4, BODY);
    px(15, 3, 2, 3, BODY);
    px(14, 6, 4, 6, BODY);
    px(23, 6, 2, 2, BODY);
    px(22, 8, 4, 4, BODY);
    // 가운데는 비워 둔다 — 'G' 라벨이 얹힌다 (잉크 장식은 라벨을 죽인다)
    px(8, 22, 16, 1, S1); // 장식 띠
  });

  // 허수아비 — 20×24
  makeCanvasTexture(scene, 'decoy', 20, 24, (px) => {
    px(8, 0, 4, 20, S1); // 기둥
    px(11, 0, 1, 20, S2);
    px(2, 7, 16, 3, S1); // 팔대
    px(2, 9, 16, 1, S2);
    px(7, 1, 6, 1, BODY); // 머리 자루
    px(6, 2, 8, 5, BODY);
    px(6, 2, 1, 5, S1);
    px(13, 2, 1, 5, S2);
    px(8, 4, 1, 1, INK); // 꿰맨 눈
    px(11, 4, 1, 1, INK);
    px(5, 20, 10, 1, S2); // 받침
    px(4, 21, 12, 3, S3);
  });
}

// ───────── 애니메이션 정의 — 프레임 관리는 코드가 아니라 데이터 ─────────
// 재생 속도는 BattleScene이 anims.globalTimeScale로 게임 배속·일시정지에 동기화한다.

export function makeAnims(scene: Phaser.Scene): void {
  const loop = (key: string, prefix: string, frames: number, frameRate: number) => {
    if (scene.anims.exists(key)) return;
    scene.anims.create({
      key,
      frames: Array.from({ length: frames }, (_, i) => ({ key: `${prefix}${i}`, frame: '__BASE' })),
      frameRate,
      repeat: -1,
    });
  };
  loop('mob-walk', 'mob', 4, 12); // 사이클 3회/초 — 초기판 2프레임 6fps와 같은 보속
  loop('boss-walk', 'boss', 4, 8); // 보스는 묵직하게
  if (!scene.anims.exists('hero-knight-idle')) {
    scene.anims.create({
      key: 'hero-knight-idle',
      frames: scene.anims.generateFrameNumbers('hero-knight-idle', { start: 0, end: 5 }),
      frameRate: 7,
      repeat: -1,
    });
  }
  if (!scene.anims.exists('hero-knight-attack')) {
    scene.anims.create({
      key: 'hero-knight-attack',
      frames: scene.anims.generateFrameNumbers('hero-knight-attack1', { start: 0, end: 7 }),
      frameRate: 16,
      repeat: 0,
    });
  }
}

/** '#rrggbb' → Phaser tint 정수 */
export const tint = (hex: string): number => parseInt(hex.replace('#', ''), 16);

// ───────── HD-2D 이펙트 텍스처 ─────────
// 월드는 픽셀(NEAREST)이지만 이펙트는 **부드러운 고해상 글로우(LINEAR)**다 —
// 옥토패스식 HD-2D의 핵심 조합 (2026-07-21, 사용자 지시: "vfx만 HD-2D 스타일").
// 가산 블렌딩(ADD)과 함께 쓰면 빛이 겹칠수록 타오른다.

export function makeGlowTextures(scene: Phaser.Scene): void {
  const smooth = (key: string, size: number, draw: (ctx: CanvasRenderingContext2D, s: number) => void) => {
    if (scene.textures.exists(key)) return;
    const tex = scene.textures.createCanvas(key, size, size);
    if (!tex) return;
    draw(tex.context, size);
    tex.refresh();
    tex.setFilter(Phaser.Textures.FilterMode.LINEAR); // 이펙트만 부드럽게
  };

  // 글로우 오브 — 폭발 섬광·임팩트 플래시
  smooth('glow', 64, (ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  });

  // 소프트 링 — 퍼지는 충격파
  smooth('ring', 128, (ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0.62, 'rgba(255,255,255,0)');
    g.addColorStop(0.8, 'rgba(255,255,255,.85)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  });

  // 스파크 — 가산 파티클 낱알
  smooth('spark', 16, (ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  });

  // 화살 리본 조각 — 여러 개가 비행 경로에 겹치며 하나의 긴 흰색 tail이 된다.
  if (!scene.textures.exists('trail-streak')) {
    const tex = scene.textures.createCanvas('trail-streak', 48, 8);
    if (tex) {
      const ctx = tex.context;
      const fade = ctx.createLinearGradient(0, 0, 48, 0);
      fade.addColorStop(0, 'rgba(255,255,255,0)');
      fade.addColorStop(0.38, 'rgba(255,255,255,.08)');
      fade.addColorStop(0.76, 'rgba(255,255,255,.48)');
      fade.addColorStop(1, 'rgba(255,255,255,1)');
      ctx.fillStyle = fade;
      ctx.fillRect(0, 2, 48, 4);

      const core = ctx.createLinearGradient(0, 0, 48, 0);
      core.addColorStop(0, 'rgba(255,255,255,0)');
      core.addColorStop(0.65, 'rgba(255,255,255,.15)');
      core.addColorStop(1, 'rgba(255,255,255,.95)');
      ctx.fillStyle = core;
      ctx.fillRect(8, 3, 40, 2);
      tex.refresh();
      tex.setFilter(Phaser.Textures.FilterMode.LINEAR);
    }
  }
}
