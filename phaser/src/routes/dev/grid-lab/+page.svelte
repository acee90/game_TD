<script lang="ts">
  // 논리맵 그리드 검수실 — @engine/core/map을 "있는 그대로" 그린다 (렌더 가공 없음).
  // 편집 루프: engine/src/core/map.ts의 상수(CROSS_HALF·OFFSET·ARM_TILES·
  // CORNER_OFFSETS·WALKABLE_HALF_WIDTH)를 에디터에서 고치면 vite HMR로 즉시 갱신된다.
  // 셀 배열 사본을 만들지 않는다 — 원본은 항상 연속 기하(십자 사각형 + 슬롯 + 폴리라인).
  import { base } from '$app/paths';
  import '$lib/labs/lab.css';
  import {
    CENTER,
    CROSS_BARS,
    SLOT_POS,
    TILE,
    WALKABLE_HALF_WIDTH,
    WAYPOINTS,
  } from '@engine/core/map';

  /** 점→경로 폴리라인 유클리드 거리 (뷰 전용 — 엔진의 nearestPathDistance는 진행도 반환) */
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

  const inCross = (x: number, y: number): boolean =>
    CROSS_BARS.some((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);

  // ── 셀 분류 (map-lab classifyLogic과 같은 규칙: 정수 격자, 셀 중심 판정) ──
  const R = 7; // 그리드 반경(셀)
  interface Cell {
    i: number;
    j: number;
    x: number; // 셀 좌상단 월드좌표
    y: number;
    kind: 'plateau' | 'path' | 'empty';
    slot: number; // SLOT_POS 인덱스, 없으면 -1
    d: number; // 셀 중심 → 경로 유클리드 거리
  }
  const cells: Cell[] = [];
  for (let j = -R; j <= R; j++)
    for (let i = -R; i <= R; i++) {
      const cx = CENTER[0] + TILE * i;
      const cy = CENTER[1] + TILE * j;
      const slot = SLOT_POS.findIndex(([sx, sy]) => Math.abs(sx - cx) < 1 && Math.abs(sy - cy) < 1);
      const d = distToPath(cx, cy);
      const kind =
        inCross(cx, cy) || slot >= 0 ? 'plateau' : d <= WALKABLE_HALF_WIDTH + 1 ? 'path' : 'empty';
      cells.push({ i, j, x: cx - TILE / 2, y: cy - TILE / 2, kind, slot, d });
    }

  const FILL = { plateau: '#4d4370', path: '#8a7440', empty: '#232830' } as const;

  // ── 뷰박스: 그리드 전체 + 여백 ──
  const pad = TILE;
  const vb = {
    x: CENTER[0] - TILE * (R + 0.5) - pad,
    y: CENTER[1] - TILE * (R + 0.5) - pad,
    w: TILE * (2 * R + 1) + pad * 2,
    h: TILE * (2 * R + 1) + pad * 2,
  };
  const wpStr = WAYPOINTS.map(([x, y]) => `${x},${y}`).join(' ');

  // ── 호버 검사 ──
  let svgEl: SVGSVGElement | undefined = $state();
  let hover: { i: number; j: number; wx: number; wy: number; d: number; slot: number } | null =
    $state(null);
  function onMove(ev: MouseEvent): void {
    if (!svgEl) return;
    const r = svgEl.getBoundingClientRect();
    const wx = vb.x + ((ev.clientX - r.left) / r.width) * vb.w;
    const wy = vb.y + ((ev.clientY - r.top) / r.height) * vb.h;
    const i = Math.round((wx - CENTER[0]) / TILE);
    const j = Math.round((wy - CENTER[1]) / TILE);
    if (Math.abs(i) > R || Math.abs(j) > R) {
      hover = null;
      return;
    }
    const cell = cells.find((c) => c.i === i && c.j === j);
    hover = { i, j, wx: Math.round(wx), wy: Math.round(wy), d: Math.round(distToPath(wx, wy)), slot: cell?.slot ?? -1 };
  }
</script>

<svelte:head>
  <title>논리맵 그리드 검수실 — G-타워디펜스 DEV</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="lab-page">
  <main>
    <header>
      <p class="eyebrow">G-TD / GRID LAB</p>
      <h1>논리맵 그리드 검수실</h1>
      <p>
        <b>@engine/core/map</b>을 렌더 가공 없이 그대로 그립니다 — 보이는 것이 곧 게임 규칙입니다.
        <code>engine/src/core/map.ts</code>의 상수(<code>CROSS_HALF</code>·<code>OFFSET</code>·<code>ARM_TILES</code>·<code>CORNER_OFFSETS</code>·<code>WALKABLE_HALF_WIDTH</code>)를
        에디터에서 고치면 HMR로 즉시 반영됩니다. 반투명 띠 = 실제 보행 영역(연속),
        칠해진 셀 = 셀 중심 기준 분류(맵 렌더러가 쓰는 양자화)입니다.
      </p>
    </header>

    <div class="grid-wrap">
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
      <svg
        bind:this={svgEl}
        viewBox="{vb.x} {vb.y} {vb.w} {vb.h}"
        role="img"
        aria-label="논리맵 그리드 — 십자 plateau, 보행 통로, 타워 슬롯, 웨이포인트"
        onmousemove={onMove}
        onmouseleave={() => (hover = null)}
      >
        <!-- 셀(양자화 뷰) -->
        {#each cells as c (c.i + ',' + c.j)}
          <rect
            x={c.x}
            y={c.y}
            width={TILE}
            height={TILE}
            fill={FILL[c.kind]}
            stroke="#00000055"
            stroke-width="0.5"
          />
        {/each}

        <!-- 실제 보행 영역(연속 띠) -->
        <polyline
          points={wpStr}
          fill="none"
          stroke="#e6c15a33"
          stroke-width={WALKABLE_HALF_WIDTH * 2}
          stroke-linejoin="miter"
          stroke-linecap="butt"
        />
        <!-- 경로 중심선 + 웨이포인트 -->
        <polyline points={wpStr} fill="none" stroke="#e6c15a" stroke-width="1.5" />
        {#each WAYPOINTS as [x, y], idx (idx)}
          <circle cx={x} cy={y} r="3" fill={idx === 0 || idx === WAYPOINTS.length - 1 ? '#e05a5a' : '#e6c15a'} />
        {/each}
        <text x={WAYPOINTS[0][0]} y={WAYPOINTS[0][1] - 8} class="wp-label">입구</text>
        <text x={WAYPOINTS[WAYPOINTS.length - 1][0]} y={WAYPOINTS[WAYPOINTS.length - 1][1] - 8} class="wp-label">출구</text>

        <!-- 십자 지형 원본 사각형(연속 기하) -->
        {#each CROSS_BARS as b, idx (idx)}
          <rect x={b.x} y={b.y} width={b.w} height={b.h} fill="none" stroke="#9b8ac9" stroke-width="1.5" stroke-dasharray="4 3" />
        {/each}

        <!-- 슬롯 -->
        {#each SLOT_POS as [sx, sy], idx (idx)}
          <rect
            x={sx - TILE / 2 + 3}
            y={sy - TILE / 2 + 3}
            width={TILE - 6}
            height={TILE - 6}
            fill="none"
            stroke={idx === 0 ? '#e6c15a' : '#f0d392aa'}
            stroke-width={idx === 0 ? 2 : 1}
          />
          <text x={sx} y={sy + 3.5} class="slot-label" fill={idx === 0 ? '#e6c15a' : '#f0d392'}>{idx}</text>
        {/each}

        <!-- 호버 셀 하이라이트 -->
        {#if hover}
          <rect
            x={CENTER[0] + TILE * hover.i - TILE / 2}
            y={CENTER[1] + TILE * hover.j - TILE / 2}
            width={TILE}
            height={TILE}
            fill="none"
            stroke="#fff"
            stroke-width="1.5"
          />
        {/if}
      </svg>

      <aside class="info" aria-live="polite">
        {#if hover}
          <b>셀 ({hover.i}, {hover.j})</b>
          <span>월드 ({hover.wx}, {hover.wy})</span>
          <span>경로거리 {hover.d}px {hover.d <= WALKABLE_HALF_WIDTH ? '· 보행가능' : ''}</span>
          {#if hover.slot >= 0}<span>슬롯 #{hover.slot}{hover.slot === 0 ? ' (제단)' : ''}</span>{/if}
        {:else}
          <span>그리드에 마우스를 올리면 셀 정보가 나옵니다</span>
        {/if}
      </aside>

      <ul class="legend">
        <li><i style:background={FILL.plateau}></i> plateau(십자·슬롯)</li>
        <li><i style:background={FILL.path}></i> 보행 셀(중심 기준)</li>
        <li><i style:background="#e6c15a33"></i> 실제 보행 띠(연속)</li>
        <li><i style:background="#9b8ac9"></i> 십자 원본 사각형</li>
        <li><i style:background="#e6c15a"></i> 경로·슬롯 번호</li>
      </ul>
    </div>

    <nav aria-label="검수실 이동">
      <a href="{base}/dev/map-lab" data-sveltekit-reload>맵 타일셋 검수실</a>
      <a href="{base}/game" data-sveltekit-reload>게임으로</a>
      <a href="{base}/" data-sveltekit-reload>홈</a>
    </nav>
  </main>
</div>

<style>
  .grid-wrap {
    position: relative;
    display: grid;
    gap: 0.75rem;
  }
  svg {
    width: 100%;
    max-width: 720px;
    aspect-ratio: 1;
    background: #171a20;
    border: 1px solid #333a46;
    border-radius: 8px;
    cursor: crosshair;
  }
  .wp-label {
    font-size: 11px;
    fill: #e05a5a;
    text-anchor: middle;
    font-family: inherit;
  }
  .slot-label {
    font-size: 9px;
    text-anchor: middle;
    font-family: inherit;
  }
  .info {
    display: flex;
    gap: 1rem;
    flex-wrap: wrap;
    font-size: 0.85rem;
    min-height: 1.4em;
    color: #cfd6e4;
  }
  .legend {
    display: flex;
    gap: 1rem;
    flex-wrap: wrap;
    list-style: none;
    padding: 0;
    margin: 0;
    font-size: 0.8rem;
    color: #9aa3b5;
  }
  .legend i {
    display: inline-block;
    width: 0.8em;
    height: 0.8em;
    border-radius: 2px;
    margin-right: 0.3em;
    vertical-align: -0.05em;
  }
</style>
