<script lang="ts">
  // 경량 SVG 도넛 — 외부 차트 라이브러리 없이 (번들·CSP 부담 회피).
  // 병과 분포처럼 항목이 적은 데이터에 쓴다.
  export interface Slice {
    label: string;
    value: number;
    color: string;
  }

  let { slices, size = 140, thickness = 18 }: { slices: Slice[]; size?: number; thickness?: number } =
    $props();

  const radius = $derived((size - thickness) / 2);
  const circumference = $derived(2 * Math.PI * radius);
  const total = $derived(slices.reduce((sum, s) => sum + s.value, 0));

  // 각 조각의 시작 오프셋을 누적으로 계산한다
  let arcs = $derived.by(() => {
    let acc = 0;
    return slices
      .filter((s) => s.value > 0)
      .map((s) => {
        const frac = total > 0 ? s.value / total : 0;
        const dash = frac * circumference;
        const arc = { ...s, dash, gap: circumference - dash, offset: -acc * circumference, frac };
        acc += frac;
        return arc;
      });
  });
</script>

<div class="donut" style="--size: {size}px">
  <svg viewBox="0 0 {size} {size}" width={size} height={size} role="img" aria-label="분포 도넛 차트">
    <g transform="rotate(-90 {size / 2} {size / 2})">
      {#each arcs as arc (arc.label)}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={arc.color}
          stroke-width={thickness}
          stroke-dasharray="{arc.dash} {arc.gap}"
          stroke-dashoffset={arc.offset}
        />
      {/each}
    </g>
    <text x="50%" y="50%" class="center" text-anchor="middle" dominant-baseline="central">
      {total}
    </text>
  </svg>
  <ul class="legend">
    {#each slices.filter((s) => s.value > 0) as s (s.label)}
      <li>
        <span class="dot" style="background: {s.color}"></span>
        <span class="lb">{s.label}</span>
        <b>{s.value}</b>
      </li>
    {/each}
  </ul>
</div>

<style>
  .donut {
    display: flex;
    align-items: center;
    gap: 18px;
    flex-wrap: wrap;
  }
  .center {
    font-size: 22px;
    font-weight: 700;
    fill: var(--color-base-content, #ece2cb);
  }
  .legend {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 5px;
  }
  .legend li {
    display: grid;
    grid-template-columns: 12px 1fr auto;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    font-variant-numeric: tabular-nums;
  }
  .dot {
    width: 12px;
    height: 12px;
    border-radius: 3px;
  }
  .lb {
    color: var(--color-base-content, #ece2cb);
  }
  .legend b {
    color: var(--color-primary, #e3b23e);
  }
</style>
