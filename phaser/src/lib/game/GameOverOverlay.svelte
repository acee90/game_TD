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
    playerName = $bindable(''),
    uploadStatus = 'idle',
    onSaveName,
  }: {
    title: string;
    body: string;
    records: readonly hallOfFame.Record[];
    myRank: number | null;
    onDownloadLog: () => void;
    onDownloadSummary: () => void;
    /** 랭킹 표시명 — 비우면 익명으로 올라간다 */
    playerName?: string;
    /** 서버 업로드 진행 상태 (실패해도 화면을 막지 않는다) */
    uploadStatus?: 'idle' | 'sending' | 'done' | 'failed';
    onSaveName?: () => void;
  } = $props();

  const STATUS_TEXT = {
    idle: '',
    sending: '기록을 올리는 중…',
    done: '랭킹에 기록했습니다.',
    failed: '지금은 올리지 못했습니다 — 다음 방문에 다시 시도합니다.',
  } as const;

  // props는 마운트 시 1회만 전달된다 — derived로 표현해 값 캡처 경고를 피한다
  let hof = $derived(hallOfFameHtml(records, myRank));
</script>

<div id="overlay">
  <h1 id="overlayTitle">{title}</h1>
  <p id="overlayBody" class="dim">{body}</p>
  <div id="hallOfFame">{@html hof}</div>

  <div class="rankEntry">
    <label class="rankLabel" for="playerName">랭킹 표시명 <span class="dim">(비우면 익명)</span></label>
    <div class="rankRow">
      <input
        id="playerName"
        bind:value={playerName}
        maxlength="24"
        placeholder="익명"
        autocomplete="off"
      />
      <button onclick={onSaveName} disabled={uploadStatus === 'sending'}>이름 저장</button>
    </div>
    {#if uploadStatus !== 'idle'}
      <p class="rankStatus" class:failed={uploadStatus === 'failed'} aria-live="polite">
        {STATUS_TEXT[uploadStatus]}
      </p>
    {/if}
  </div>

  <button onclick={onDownloadLog}>게임 로그 JSONL</button>
  <button onclick={onDownloadSummary}>런 요약 JSON</button>
  <button onclick={() => location.reload()}>다시 도전</button>
</div>

<style>
  .rankEntry {
    width: min(100%, 320px);
    margin: 14px auto 4px;
    display: grid;
    gap: 6px;
    text-align: left;
  }
  .rankLabel {
    font-size: 11.5px;
    color: #b9b09e;
  }
  .rankRow {
    display: flex;
    gap: 6px;
  }
  .rankRow input {
    flex: 1;
    min-width: 0;
    padding: 7px 9px;
    font-size: 13px;
    color: #ece2cb;
    background: #17120b;
    border: 1px solid #4d3d28;
    border-radius: 6px;
  }
  .rankRow input:focus {
    outline: none;
    border-color: #e3b23e;
  }
  .rankRow button {
    margin: 0;
    padding: 7px 12px;
    font-size: 12px;
    white-space: nowrap;
  }
  .rankStatus {
    margin: 0;
    font-size: 11.5px;
    color: #8a9a5b;
  }
  .rankStatus.failed {
    color: #c9a14a;
  }
</style>
