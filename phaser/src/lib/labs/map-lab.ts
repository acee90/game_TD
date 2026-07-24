// 맵 타일셋 검수실 — Cainos "Pixel Art Top Down - Basic"를 실제 맵 지오메트리에 입힌다.
// 규칙·좌표는 @engine/core/map에서 파생(로직 이중화 없음). 이 파일은 시각 레이어만.
//
// ── 단위(레퍼런스 실측) ──
//  네이티브 타일 = 32px. 논리 셀 1칸 = 2×2 = 64px(셀당 타일 4장, 픽셀퍼펙트).
//  엔진 TILE(36)은 게임 로직 전용, 화면 좌표로 안 쓴다 → 밸런스 불변.
//
// ── 구조(Cainos 가이드: 높이 레벨마다 레이어 스택, 벽이 레벨 경계를 잇는다) ──
//  · elev 0 = 빈 배경(어두운 밖) / 1 = 지면(몬스터 길 포함) / 2 = plateau(타워 자리).
//  · 바닥 = TX Tileset Grass — 잔디 변형 로테이션 + 16px 포장돌 군집(몬스터 동선 리본).
//  · 층 경계 옹벽 = TX Tileset Wall — 북=상단 캡 / 좌·우=측벽 / 남=전면 벽돌면(+그림자).
// 숫자키 5로 격자/슬롯 오버레이 토글.
import Phaser from 'phaser';
import {
  CENTER,
  CROSS_BARS,
  DOOR_IN,
  DOOR_OUT,
  SLOT_POS,
  TILE,
  WALKABLE_HALF_WIDTH,
  WAYPOINTS,
} from '@engine/core/map';

const TS = 32; // 네이티브 타일 px
// 논리 1셀 = 네이티브 2×2타일(64px). 4×4(128px) 확대 실험은 롤백 (2026-07-24, 사용자
// 지시): 레퍼런스는 셀이 작아도 복잡한 길로 밀도를 내며, 타일만 키우면 소품 대비
// 비율이 비어 보인다. 소품·벽 스케일은 레퍼런스와 동일한 1x를 유지한다.
const SUB = 2; // 논리 셀당 서브타일(2×2)
const STONE = 16; // 포장돌 1개 px (네이티브 타일당 2×2)
const CANVAS = 1200; // 고정 캔버스 — 섬은 카메라로 중앙 정렬, 나머지는 빈 배경

// 포장돌 변형군 — pave=깨끗 / worn=풀 덮임(군집 가장자리) / part=낱개·부서짐(가장 바깥)
const PAVES = ['cn-p1', 'cn-p2', 'cn-p3', 'cn-p4', 'cn-p5', 'cn-p6', 'cn-p7', 'cn-p8'] as const;
const WORNS = ['cn-o1', 'cn-o2', 'cn-o3', 'cn-o4', 'cn-o5', 'cn-o6'] as const;
const PARTS = ['cn-q1', 'cn-q2', 'cn-q3', 'cn-q4'] as const;
// 바닥 변형 타일 — 풀포기/꽃(드물게 섞어 단조로움 제거)
const GRASS_VARS = ['cn-g2', 'cn-g3', 'cn-g4', 'cn-g5'] as const;
const FLOWER_VARS = ['cn-f1', 'cn-f2', 'cn-f3', 'cn-f4'] as const;
// 소품(그림자 합본) — 나무=랜드마크, 나머지=소형 장식. 텍스트 표지판·묘비류는 제외.
const TREES = ['pr-tree1', 'pr-tree2', 'pr-tree3'] as const;
const PROP_FILES = [
  'tree1',
  'tree2',
  'tree3',
  'bush1',
  'bush2',
  'barrel',
  'pot1',
  'pot2',
  'rock-big',
  'rock-small',
  'dais',
] as const;
const KEY = {
  grass: 'cn-grass',
  topN: 'cn-w-top',
  topNW: 'cn-w-top-nw',
  topNE: 'cn-w-top-ne',
  sideW: 'cn-w-side-w',
  sideE: 'cn-w-side-e',
  // 남쪽 벽 = 정확히 2셀 스택(Frame A row3+row4): 캡(기둥 위)+face상단 / face하단+발단(기둥 아래).
  // y축 반복 없음 — 이 두 장이 전부다.
  frontTop: 'cn-w-front-top',
  frontTopL: 'cn-w-front-top-l',
  frontTopR: 'cn-w-front-top-r',
  frontBot: 'cn-w-front-bot',
  frontBotL: 'cn-w-front-bot-l',
  frontBotR: 'cn-w-front-bot-r',
} as const;

type Kind = 'plateau' | 'path' | 'grass';

function rand01(a: number, b: number): number {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** 저주파 값 노이즈(격자 해시 + 스무스스텝 이중선형 보간) — 돌 패치가 "군집"을 이루게 한다 */
function vnoise(x: number, y: number, period: number, salt: number): number {
  const gx = Math.floor(x / period);
  const gy = Math.floor(y / period);
  let tx = (x - gx * period) / period;
  let ty = (y - gy * period) / period;
  tx = tx * tx * (3 - 2 * tx);
  ty = ty * ty * (3 - 2 * ty);
  const c00 = rand01(gx * 3 + salt, gy * 7 + salt);
  const c10 = rand01((gx + 1) * 3 + salt, gy * 7 + salt);
  const c01 = rand01(gx * 3 + salt, (gy + 1) * 7 + salt);
  const c11 = rand01((gx + 1) * 3 + salt, (gy + 1) * 7 + salt);
  const top = c00 + (c10 - c00) * tx;
  const bot = c01 + (c11 - c01) * tx;
  return top + (bot - top) * ty;
}

/** 노이즈 주기 배율 — 논리 셀당 스톤 수에 비례해야 군집 크기가 셀 스케일을 따라간다 */
const NOISE_SCALE = SUB / 2;

/** 2옥타브 군집 노이즈 (0..1) */
function clusterNoise(x: number, y: number): number {
  return 0.65 * vnoise(x, y, 6 * NOISE_SCALE, 11) + 0.35 * vnoise(x, y, 3 * NOISE_SCALE, 47);
}

function distToPath(x: number, y: number): number {
  let best = Infinity;
  for (let i = 0; i < WAYPOINTS.length - 1; i++) {
    const [ax, ay] = WAYPOINTS[i];
    const [bx, by] = WAYPOINTS[i + 1];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2));
    best = Math.min(best, Math.hypot(x - (ax + dx * t), y - (ay + dy * t)));
  }
  return best;
}

class MapLabScene extends Phaser.Scene {
  private logic = new Map<string, Kind>();
  private cornerKeys = new Set<string>();
  private MARGIN = 2;
  private iMin = 0;
  private jMin = 0;
  private nw = 0;
  private nh = 0;
  private elev: number[][] = [];
  private kindN: (Kind | null)[][] = [];
  private overlay!: Phaser.GameObjects.Container;

  preload(): void {
    this.load.setBaseURL('/');
    const base = 'assets/tiles/cainos';
    this.load.image(KEY.grass, `${base}/grass.png`);
    PAVES.forEach((k, i) => this.load.image(k, `${base}/pave${i + 1}.png`));
    WORNS.forEach((k, i) => this.load.image(k, `${base}/worn${i + 1}.png`));
    PARTS.forEach((k, i) => this.load.image(k, `${base}/part${i + 1}.png`));
    GRASS_VARS.forEach((k, i) => this.load.image(k, `${base}/grass${i + 2}.png`));
    FLOWER_VARS.forEach((k, i) => this.load.image(k, `${base}/flower${i + 1}.png`));
    PROP_FILES.forEach((f) => this.load.image(`pr-${f}`, `assets/props/${f}.png`));
    this.load.image(KEY.topN, `${base}/w_top.png`);
    this.load.image(KEY.topNW, `${base}/w_top_nw.png`);
    this.load.image(KEY.topNE, `${base}/w_top_ne.png`);
    this.load.image(KEY.sideW, `${base}/w_side_w.png`);
    this.load.image(KEY.sideE, `${base}/w_side_e.png`);
    this.load.image(KEY.frontTop, `${base}/w_front_top.png`);
    this.load.image(KEY.frontTopL, `${base}/w_front_top_l.png`);
    this.load.image(KEY.frontTopR, `${base}/w_front_top_r.png`);
    this.load.image(KEY.frontBot, `${base}/w_front_bot.png`);
    this.load.image(KEY.frontBotL, `${base}/w_front_bot_l.png`);
    this.load.image(KEY.frontBotR, `${base}/w_front_bot_r.png`);
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#1c2026');
    this.classifyLogic();
    this.buildNative();
    this.drawFloor();
    this.drawWalls();
    this.drawProps();
    this.drawOverlay();
    this.cameras.main.centerOn((this.nw * TS) / 2, (this.nh * TS) / 2);
    this.input.keyboard?.on('keydown-FIVE', () => this.overlay.setVisible(!this.overlay.visible));
  }

  // ── 논리 셀 분류 ──────────────────────────────────────
  private lkey(i: number, j: number): string {
    return `${i},${j}`;
  }
  /** 위치 → 정수 격자 셀 인덱스 (셀 중심 = center + TILE·idx) — 십자 1칸 롤백(2026-07-24) */
  private cellIdx(v: number, center: number): number {
    return Math.round((v - center) / TILE);
  }
  private inCross(x: number, y: number): boolean {
    return CROSS_BARS.some((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
  }
  private classifyLogic(): void {
    // 타워 셀은 정수 격자: 셀 중심 = CENTER + TILE·i (십자 1칸, 제단 = 중앙 1칸).
    for (const [x, y] of SLOT_POS.slice(SLOT_POS.length - 12)) {
      this.cornerKeys.add(this.lkey(this.cellIdx(x, CENTER[0]), this.cellIdx(y, CENTER[1])));
    }
    const core = new Map<string, Kind>();
    for (let j = -7; j <= 7; j++)
      for (let i = -7; i <= 7; i++) {
        const x = CENTER[0] + TILE * i;
        const y = CENTER[1] + TILE * j;
        if (this.inCross(x, y) || this.cornerKeys.has(this.lkey(i, j)))
          core.set(this.lkey(i, j), 'plateau');
        else if (distToPath(x, y) <= WALKABLE_HALF_WIDTH + 1) core.set(this.lkey(i, j), 'path');
      }
    // 섬 = 코어(길·plateau) 그대로 — 바깥 잔디 테두리 없이 벽이 플레이 영역에 바로 붙는다.
    // (2026-07-24, 사용자 지시: 외곽 1셀 축소 — 테두리 링 제거)
    for (const [k, v] of core) this.logic.set(k, v);
    // ④ 실루엣 가공(시각 전용, 로직 불변) — 오목 노치를 1패스 클로징으로 채운다.
    //  빈 셀의 직교 이웃이 수직+수평으로 2개 이상 차 있으면(오목 코너/1셀 틈) 채움.
    //  볼록 코너의 대각 셀은 직교 이웃이 0~1개라 안 채워진다 → 팽창 없이 노치만 사라짐.
    //  이웃 2개 이상이 plateau면 같은 높이로 채워 L자 슬롯 블록이 2×2 덩어리로 보인다.
    const fills = new Map<string, Kind>();
    for (let j = -10; j <= 9; j++)
      for (let i = -10; i <= 9; i++) {
        if (core.has(this.lkey(i, j))) continue;
        const n = [core.get(this.lkey(i, j - 1)), core.get(this.lkey(i, j + 1))];
        const w = [core.get(this.lkey(i - 1, j)), core.get(this.lkey(i + 1, j))];
        const vCnt = n.filter(Boolean).length;
        const hCnt = w.filter(Boolean).length;
        // 오목 코너(양 축에 이웃) 또는 1셀 틈(한 축의 양쪽) — 그 외엔 채우지 않는다.
        if (!((vCnt > 0 && hCnt > 0) || vCnt === 2 || hCnt === 2)) continue;
        const plateauCnt = [...n, ...w].filter((k) => k === 'plateau').length;
        fills.set(this.lkey(i, j), plateauCnt >= 2 ? 'plateau' : 'grass');
      }
    for (const [k, v] of fills) this.logic.set(k, v);
  }

  // ── 네이티브 격자 ─────────────────────────────────────
  private buildNative(): void {
    let iMax = -99;
    let jMax = -99;
    this.iMin = 99;
    this.jMin = 99;
    for (const k of this.logic.keys()) {
      const [i, j] = k.split(',').map(Number);
      this.iMin = Math.min(this.iMin, i);
      this.jMin = Math.min(this.jMin, j);
      iMax = Math.max(iMax, i);
      jMax = Math.max(jMax, j);
    }
    this.nw = (iMax - this.iMin + 1) * SUB + this.MARGIN * 2;
    this.nh = (jMax - this.jMin + 1) * SUB + this.MARGIN * 2;
    this.elev = Array.from({ length: this.nh }, () => Array(this.nw).fill(0));
    this.kindN = Array.from({ length: this.nh }, () => Array(this.nw).fill(null));
    for (const [k, kind] of this.logic) {
      const [i, j] = k.split(',').map(Number);
      const level = kind === 'plateau' ? 2 : 1;
      for (let sj = 0; sj < SUB; sj++)
        for (let si = 0; si < SUB; si++) {
          const nx = this.MARGIN + (i - this.iMin) * SUB + si;
          const ny = this.MARGIN + (j - this.jMin) * SUB + sj;
          this.elev[ny][nx] = level;
          this.kindN[ny][nx] = kind;
        }
    }
  }

  private img(key: string, nx: number, ny: number, depth: number): Phaser.GameObjects.Image {
    return this.add.image(nx * TS, ny * TS, key).setOrigin(0, 0).setDepth(depth);
  }
  private elevAt(nx: number, ny: number): number {
    if (ny < 0 || ny >= this.nh || nx < 0 || nx >= this.nw) return 0;
    return this.elev[ny][nx];
  }

  // ── 바닥: 잔디(변형 타일 로테이션) + 포장돌 군집 (elev≥1) ──────────
  // 돌은 16px 낱개 단위로, 저주파 노이즈 임계값을 넘는 곳에만 깔린다 →
  // 레퍼런스처럼 "닳은 길·광장" 덩어리가 생기고 i.i.d. 소금후추 노이즈가 사라진다.
  /** 스톤 셀(sx,sy) 중심의 월드 좌표 — 스톤 1개 = 논리 셀의 1/4, 셀 i 스팬 = CENTER+TILE·(i±0.5) */
  private stoneWorld(sx: number, sy: number): [number, number] {
    const wx = CENTER[0] + TILE * (this.iMin + (sx / 2 - this.MARGIN) / SUB - 3 / 8);
    const wy = CENTER[1] + TILE * (this.jMin + (sy / 2 - this.MARGIN) / SUB - 3 / 8);
    return [wx, wy];
  }
  private drawFloor(): void {
    for (let ny = 0; ny < this.nh; ny++)
      for (let nx = 0; nx < this.nw; nx++) {
        const e = this.elev[ny][nx];
        if (e < 1) continue;
        // depth = 화면 행(base-row) 기준 — 아래(가까운) 것이 위에 그려진다(오클루전).
        // 잔디 베이스: 대부분 무지 잔디, 가끔 풀포기, 드물게 꽃.
        const r = rand01(nx * 5 + 3, ny * 11 + 9);
        const baseKey =
          r < 0.72
            ? KEY.grass
            : r < 0.94
              ? GRASS_VARS[Math.floor(rand01(nx, ny * 2 + 1) * GRASS_VARS.length)]
              : FLOWER_VARS[Math.floor(rand01(nx * 2 + 1, ny) * FLOWER_VARS.length)];
        this.img(baseKey, nx, ny, ny * 100);
        // 포장돌: 네이티브 타일당 2×2 스톤 셀, 군집 노이즈 임계값으로 배치.
        // kind='path'는 보행 영역 전체(2셀 폭 통로)라 그대로 쓰면 지면이 전부 포장된다 —
        // 실제 몬스터 동선(웨이포인트 폴리라인)까지의 거리로 좁은 리본만 조밀하게 깐다.
        const kind = this.kindN[ny][nx];
        for (let sy = ny * 2; sy < ny * 2 + 2; sy++)
          for (let sx = nx * 2; sx < nx * 2 + 2; sx++) {
            let thr = kind === 'plateau' ? 0.72 : 0.8;
            if (kind === 'path') {
              const [wx, wy] = this.stoneWorld(sx, sy);
              // 저주파 흔들림 — 리본 폭이 유기적으로 늘었다 줄었다 한다(직선 경계 방지).
              const d = distToPath(wx, wy) + (vnoise(sx, sy, 5 * NOISE_SCALE, 83) - 0.5) * 14;
              thr = d <= 14 ? 0.32 : d <= 24 ? 0.66 : 0.8;
            }
            const margin = clusterNoise(sx, sy) - thr;
            if (margin < 0) continue;
            // 군집 중심부는 깨끗한 돌, 가장자리로 갈수록 마모/낱개 → 유기적인 경계.
            const pool = margin < 0.035 ? PARTS : margin < 0.08 ? WORNS : PAVES;
            const v = Math.floor(rand01(sx * 13 + 7, sy * 17 + 3) * pool.length);
            this.add
              .image(sx * STONE, sy * STONE, pool[Math.min(v, pool.length - 1)])
              .setOrigin(0, 0)
              .setDepth(ny * 100 + 5);
          }
      }
  }

  // ── 층 경계 옹벽: 높은 레벨의 낮은 이웃 방향에 벽 조각 ──
  // Frame A(3×4 셀 템플릿)의 문법 그대로: 북=상단 rim, 좌우=측면 rim,
  // 남=2셀 스택(캡+face상단 / face하단+발단) — face하단은 아랫칸(지면/허공)을 차지한다.
  // depth는 화면상 base-row 기준 — 앞이 뒤 벽을 덮지 않는다.
  private drawWalls(): void {
    for (let ny = 0; ny < this.nh; ny++)
      for (let nx = 0; nx < this.nw; nx++) {
        const e = this.elev[ny][nx];
        if (e < 1) continue;
        const nLow = this.elevAt(nx, ny - 1) < e;
        const sLow = this.elevAt(nx, ny + 1) < e;
        const wLow = this.elevAt(nx - 1, ny) < e;
        const eLow = this.elevAt(nx + 1, ny) < e;
        const capD = ny * 100 + 60; // 자기 타일 바닥 위
        // 문 개구부 — 입·출구 통로가 섬 북쪽 외곽 벽을 뚫는 타일은 캡을 생략한다.
        const wx = CENTER[0] + TILE * (this.iMin + (nx + 0.5 - this.MARGIN) / SUB - 0.5);
        const door =
          nLow &&
          this.elevAt(nx, ny - 1) === 0 &&
          [DOOR_IN[0], DOOR_OUT[0]].some((dx) => Math.abs(wx - dx) <= WALKABLE_HALF_WIDTH);
        // 북쪽 back wall 상단 rim (+ 모서리)
        if (nLow && !door) this.img(wLow ? KEY.topNW : eLow ? KEY.topNE : KEY.topN, nx, ny, capD);
        // 남쪽 front wall: 위칸(캡+face상단)은 자기 타일, 아래칸(face하단+발단)은 아랫칸.
        if (sLow) {
          this.img(wLow ? KEY.frontTopL : eLow ? KEY.frontTopR : KEY.frontTop, nx, ny, capD);
          this.img(
            wLow ? KEY.frontBotL : eLow ? KEY.frontBotR : KEY.frontBot,
            nx,
            ny + 1,
            (ny + 1) * 100 + 50,
          );
          const cliff = this.elevAt(nx, ny + 1) === 0; // 섬 밖으로 떨어짐
          const bands: [number, number][] = cliff
            ? [
                [6, 0.34],
                [4, 0.18],
                [3, 0.08],
              ]
            : [
                [5, 0.3],
                [4, 0.15],
                [3, 0.07],
              ];
          let sy0 = (ny + 2) * TS;
          for (const [h, alpha] of bands) {
            this.add
              .rectangle(nx * TS, sy0, TS, h, 0x000000, alpha)
              .setOrigin(0, 0)
              .setDepth((ny + 1) * 100 + 45);
            sy0 += h;
          }
        }
        // 좌·우 측면 rim — 직선 변 전용(코너는 전용 조각이 rim을 포함한다).
        // 문 개구부 타일은 캡 대신 측면 rim으로 마감한다.
        if (wLow && ((!nLow && !sLow) || door)) this.img(KEY.sideW, nx, ny, capD + 1);
        if (eLow && ((!nLow && !sLow) || door)) this.img(KEY.sideE, nx, ny, capD + 1);
      }
  }

  // ── 소품: 나무(랜드마크) + 소형 장식, 시드 결정적 배치 ──────────
  // 지면(1층) 내부 타일에만 — 트레일·프레이 존과 plateau(타워 자리)는 비워둔다.
  // 나무는 크게 떨어뜨리고(간격 5타일) 소형 소품은 그 사이를 채운다(간격 3타일).
  private drawProps(): void {
    const sites: { nx: number; ny: number; r: number; d: number }[] = [];
    for (let ny = 1; ny < this.nh - 1; ny++)
      for (let nx = 1; nx < this.nw - 1; nx++) {
        if (this.elev[ny][nx] !== 1) continue;
        if (
          this.elevAt(nx, ny - 1) < 1 ||
          this.elevAt(nx, ny + 1) < 1 ||
          this.elevAt(nx - 1, ny) < 1 ||
          this.elevAt(nx + 1, ny) < 1
        )
          continue;
        const [wx, wy] = this.stoneWorld(nx * 2, ny * 2);
        const d = distToPath(wx, wy);
        if (d < 26) continue; // 트레일 코어+프레이(≤24px)만 피한다
        sites.push({ nx, ny, r: rand01(nx * 31 + 5, ny * 29 + 11), d });
      }
    sites.sort((a, b) => a.r - b.r);
    const used: [number, number][] = [];
    const far = (nx: number, ny: number, min: number) =>
      used.every(([ux, uy]) => Math.hypot(ux - nx, uy - ny) >= min);
    const place = (key: string, nx: number, ny: number) => {
      this.add
        .image(nx * TS + TS / 2, ny * TS + TS, key)
        .setOrigin(0.5, 1)
        .setDepth(ny * 100 + 70);
      used.push([nx, ny]);
    };
    // 개수·간격은 비주얼 배율에 비례 — SUB=4(면적 4배)에서 밀도가 유지되게.
    const treeMax = 5 + Math.round(2.5 * NOISE_SCALE * NOISE_SCALE);
    const smallMax = 8 + Math.round(4 * NOISE_SCALE * NOISE_SCALE);
    let trees = 0;
    for (const s of sites) {
      if (trees >= treeMax) break;
      if (!far(s.nx, s.ny, 5)) continue;
      place(TREES[Math.floor(rand01(s.nx * 3 + 1, s.ny * 5 + 2) * TREES.length)], s.nx, s.ny);
      trees++;
    }
    let smalls = 0;
    for (const s of sites) {
      if (smalls >= smallMax) break;
      if (!far(s.nx, s.ny, 3)) continue;
      const v = rand01(s.nx * 7 + 3, s.ny * 13 + 1);
      const key =
        v < 0.3
          ? `pr-bush${1 + (Math.floor(v * 100) % 2)}`
          : v < 0.55
            ? `pr-rock-${v < 0.42 ? 'big' : 'small'}`
            : v < 0.75
              ? `pr-pot${1 + (Math.floor(v * 100) % 2)}`
              : v < 0.9
                ? 'pr-barrel'
                : 'pr-rock-small';
      place(key, s.nx, s.ny);
      smalls++;
    }
    // 중앙 제단 자리 표시 — 원형 단상을 중앙 셀(0,0) 정중앙에.
    const cx = (this.MARGIN + (0 - this.iMin) * SUB + SUB / 2) * TS;
    const cy = (this.MARGIN + (0 - this.jMin) * SUB + SUB / 2) * TS;
    this.add
      .image(cx, cy, 'pr-dais')
      .setOrigin(0.5, 0.5)
      .setDepth(Math.floor(cy / TS) * 100 + 70);
  }

  // ── 격자·슬롯 오버레이(토글 5, 기본 꺼짐) ──
  private drawOverlay(): void {
    this.overlay = this.add.container(0, 0).setDepth(9000).setVisible(false);
    const g = this.add.graphics();
    g.lineStyle(1, 0xffffff, 0.13);
    for (const k of this.logic.keys()) {
      const [i, j] = k.split(',').map(Number);
      const x = (this.MARGIN + (i - this.iMin) * SUB) * TS;
      const y = (this.MARGIN + (j - this.jMin) * SUB) * TS;
      g.strokeRect(x, y, SUB * TS, SUB * TS);
    }
    SLOT_POS.forEach(([sx, sy], idx) => {
      const i = this.cellIdx(sx, CENTER[0]);
      const j = this.cellIdx(sy, CENTER[1]);
      const x = (this.MARGIN + (i - this.iMin) * SUB) * TS;
      const y = (this.MARGIN + (j - this.jMin) * SUB) * TS;
      g.lineStyle(idx === 0 ? 2 : 1, idx === 0 ? 0xe6c15a : 0xf0d392, 0.8);
      g.strokeRect(x + 5, y + 5, SUB * TS - 10, SUB * TS - 10);
    });
    this.overlay.add(g);
  }
}

/** /dev/map-lab 라우트가 onMount에서 생성하고 언마운트 시 destroy(true)한다 */
export function createMapLab(parent: HTMLElement): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: CANVAS,
    height: CANVAS,
    pixelArt: true,
    roundPixels: true,
    backgroundColor: '#1c2026',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: [MapLabScene],
  });
}
