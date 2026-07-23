<script lang="ts">
  // 가로 막대 — 골드 사용처·티어 분포처럼 크기 비교가 핵심인 데이터에.
  // CSS 폭 비율로만 그린다 (SVG도 불필요).
  export interface Bar {
    label: string;
    value: number;
    /** 오른쪽에 붙는 보조 텍스트 (예: "51회") */
    note?: string;
    color?: string;
  }

  let { bars, format = (v: number) => String(v) }: { bars: Bar[]; format?: (v: number) => string } =
    $props();

  const max = $derived(Math.max(1, ...bars.map((b) => b.value)));
</script>

<ul class="bars">
  {#each bars as bar (bar.label)}
    <li>
      <span class="lb">{bar.label}</span>
      <span class="track">
        <span
          class="fill"
          style="width: {(bar.value / max) * 100}%; background: {bar.color ?? 'var(--color-primary, #e3b23e)'}"
        ></span>
      </span>
      <b class="val">{format(bar.value)}</b>
      {#if bar.note}<span class="note">{bar.note}</span>{/if}
    </li>
  {/each}
</ul>

<style>
  .bars {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 8px;
  }
  .bars li {
    display: grid;
    grid-template-columns: 96px 1fr auto auto;
    align-items: center;
    gap: 10px;
    font-size: 13px;
    font-variant-numeric: tabular-nums;
  }
  .lb {
    color: var(--color-base-content, #ece2cb);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .track {
    height: 10px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--color-base-content, #ece2cb) 10%, transparent);
    overflow: hidden;
  }
  .fill {
    display: block;
    height: 100%;
    border-radius: 999px;
    min-width: 3px;
  }
  .val {
    color: var(--color-primary, #e3b23e);
    font-weight: 700;
  }
  .note {
    color: color-mix(in srgb, var(--color-base-content, #ece2cb) 55%, transparent);
    font-size: 11.5px;
  }

  @media (max-width: 560px) {
    .bars li {
      grid-template-columns: 72px 1fr auto;
    }
    .note {
      display: none;
    }
  }
</style>
