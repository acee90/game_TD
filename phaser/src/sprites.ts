// ───────── 프로시저럴 도트 스프라이트 ─────────
// 외부 에셋 없이 시작 시 캔버스에 픽셀 단위로 구워 텍스처로 등록한다.
// 전부 흰색~회색 계열로 그린다 — 색은 런타임에 setTint(종족색·몹 타입색)로 입힌다.
// 진짜 도트 아트(aseprite 등)로 교체할 때는 이 파일의 키만 유지하면 된다.

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

const BODY = '#ffffff';
const SHADE = '#b8b8b8';
const DARK = '#6e6e6e';
const INK = '#1a130a';

export function makeTextures(scene: Phaser.Scene): void {
  // 파티클용 낱알
  makeCanvasTexture(scene, 'px', 2, 2, (px) => px(0, 0, 2, 2));

  // 기본 투사체 (영웅·스킬) — 밝은 핵 + 꼬리
  makeCanvasTexture(scene, 'shot', 6, 3, (px) => {
    px(0, 1, 2, 1, SHADE);
    px(2, 0, 3, 3, BODY);
    px(5, 1, 1, 1, BODY);
  });

  // 화살 (정규군) — 촉 + 살대 + 깃
  makeCanvasTexture(scene, 'arrow', 9, 3, (px) => {
    px(0, 0, 1, 3, SHADE); // 깃
    px(1, 1, 6, 1, DARK); // 살대
    px(7, 0, 2, 3, BODY); // 촉
  });

  // 포탄 (포병) — 둥근 쇳덩이
  makeCanvasTexture(scene, 'shell', 5, 5, (px) => {
    px(1, 0, 3, 5, BODY);
    px(0, 1, 5, 3, BODY);
    px(1, 1, 1, 1, '#f4f4f4'); // 하이라이트
    px(3, 3, 1, 1, SHADE);
  });

  // 매직 볼트 (마법대) — 다이아몬드 결정
  makeCanvasTexture(scene, 'bolt', 5, 5, (px) => {
    px(2, 0, 1, 5, BODY);
    px(0, 2, 5, 1, BODY);
    px(1, 1, 3, 3, BODY);
    px(2, 2, 1, 1, '#f4f4f4');
  });

  // 가시 (소환대) — 회전하는 자연 탄
  makeCanvasTexture(scene, 'seed', 5, 5, (px) => {
    px(2, 0, 1, 2, BODY);
    px(0, 2, 2, 1, BODY);
    px(3, 2, 2, 1, BODY);
    px(2, 3, 1, 2, BODY);
    px(2, 2, 1, 1, SHADE);
  });

  // 몹 — 12×12, 2프레임 걷기 (다리 교차)
  for (const frame of [0, 1]) {
    makeCanvasTexture(scene, `mob${frame}`, 12, 12, (px) => {
      px(3, 2, 6, 7, BODY); // 몸통
      px(2, 3, 1, 5, SHADE);
      px(9, 3, 1, 5, SHADE); // 옆 음영
      px(3, 8, 6, 1, SHADE);
      px(4, 4, 1, 2, INK);
      px(7, 4, 1, 2, INK); // 눈
      if (frame === 0) {
        px(3, 9, 2, 2, SHADE);
        px(7, 9, 2, 2, DARK);
      } else {
        px(3, 9, 2, 2, DARK);
        px(7, 9, 2, 2, SHADE);
      }
    });
  }

  // 보스 — 18×18, 뿔 달린 덩치
  for (const frame of [0, 1]) {
    makeCanvasTexture(scene, `boss${frame}`, 18, 18, (px) => {
      px(2, 1, 2, 3, BODY);
      px(14, 1, 2, 3, BODY); // 뿔
      px(3, 4, 12, 10, BODY); // 몸통
      px(2, 5, 1, 8, SHADE);
      px(15, 5, 1, 8, SHADE);
      px(3, 13, 12, 1, SHADE);
      px(5, 7, 2, 3, INK);
      px(11, 7, 2, 3, INK); // 눈
      if (frame === 0) {
        px(4, 14, 3, 3, SHADE);
        px(11, 14, 3, 3, DARK);
      } else {
        px(4, 14, 3, 3, DARK);
        px(11, 14, 3, 3, SHADE);
      }
    });
  }

  // 타워 — 14×14: 받침 + 몸체 + 포탑 (틴트로 종족색)
  makeCanvasTexture(scene, 'tower', 14, 14, (px) => {
    px(2, 11, 10, 2, DARK); // 받침
    px(3, 5, 8, 6, BODY); // 몸체
    px(3, 5, 1, 6, SHADE);
    px(10, 5, 1, 6, SHADE);
    px(4, 2, 6, 3, BODY); // 포탑
    px(4, 2, 1, 3, SHADE);
    px(5, 3, 4, 1, SHADE); // 총안
  });

  // GOD 타워 — 16×16: 왕관 실루엣
  makeCanvasTexture(scene, 'towerGod', 16, 16, (px) => {
    px(2, 13, 12, 2, DARK);
    px(3, 6, 10, 7, BODY);
    px(3, 6, 1, 7, SHADE);
    px(12, 6, 1, 7, SHADE);
    px(3, 2, 2, 4, BODY);
    px(7, 1, 2, 5, BODY);
    px(11, 2, 2, 4, BODY); // 왕관 뿔
  });

  // 영웅 — 12×14: 투구 + 망토 느낌
  makeCanvasTexture(scene, 'hero', 12, 14, (px) => {
    px(3, 1, 6, 4, BODY); // 투구
    px(4, 3, 4, 1, INK); // 눈가림
    px(2, 5, 8, 6, BODY); // 몸
    px(2, 5, 1, 6, SHADE);
    px(9, 5, 1, 6, SHADE);
    px(3, 11, 2, 2, SHADE);
    px(7, 11, 2, 2, SHADE); // 다리
  });

  // 허수아비 — 10×12
  makeCanvasTexture(scene, 'decoy', 10, 12, (px) => {
    px(4, 0, 2, 10, SHADE); // 기둥
    px(1, 3, 8, 2, BODY); // 팔대
    px(3, 1, 4, 3, BODY); // 머리
    px(2, 10, 6, 2, DARK); // 받침
  });
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
}
