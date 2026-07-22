<script lang="ts">
  import { hallOfFameHtml } from './view';
  import type * as hallOfFame from './hall-of-fame';

  // 순수 표시 컴포넌트 — 스냅샷은 App이 game.over 순간에 한 번 계산해 넘긴다.
  let {
    title,
    body,
    records,
    myRank,
    onDownloadLog,
    onDownloadSummary,
  }: {
    title: string;
    body: string;
    records: readonly hallOfFame.Record[];
    myRank: number | null;
    onDownloadLog: () => void;
    onDownloadSummary: () => void;
  } = $props();

  // props는 마운트 시 1회만 전달된다 — derived로 표현해 값 캡처 경고를 피한다
  let hof = $derived(hallOfFameHtml(records, myRank));
</script>

<div id="overlay">
  <h1 id="overlayTitle">{title}</h1>
  <p id="overlayBody" class="dim">{body}</p>
  <div id="hallOfFame">{@html hof}</div>
  <button onclick={onDownloadLog}>게임 로그 JSONL</button>
  <button onclick={onDownloadSummary}>런 요약 JSON</button>
  <button onclick={() => location.reload()}>다시 도전</button>
</div>
