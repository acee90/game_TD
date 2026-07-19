<script lang="ts">
  import {
    analysisFromSummary,
    analyzeRunLogText,
    eventDescription,
    parseRunSummaryText,
    type RunAnalysis,
  } from './logging/analysis';
  import type { GameEventType, RunSummary } from './game/logging';

  let analyses = $state<RunAnalysis[]>([]);
  let selectedRunIds = $state<string[]>([]);
  let loadMessages = $state<string[]>([]);
  let dragging = $state(false);
  let eventType = $state<'all' | GameEventType>('all');
  let roundFrom = $state<number | null>(null);
  let roundTo = $state<number | null>(null);
  let timeFrom = $state<number | null>(null);
  let timeTo = $state<number | null>(null);

  const active = $derived(analyses.find((analysis) => analysis.runId === selectedRunIds[0]) ?? analyses[0] ?? null);
  const compared = $derived(analyses.filter((analysis) => selectedRunIds.includes(analysis.runId)));
  const buildKeys = $derived(new Set(analyses.map((analysis) => {
    const build = analysis.projection.build;
    return build ? `${build.target}:${build.gitSha}` : 'unknown';
  })));
  const eventTypes = $derived(active ? [...new Set(active.events.map((event) => event.type))].sort() : []);
  const filteredEvents = $derived(active?.events.filter((event) =>
    (eventType === 'all' || event.type === eventType) &&
    (roundFrom === null || event.round >= roundFrom) &&
    (roundTo === null || event.round <= roundTo) &&
    (timeFrom === null || event.elapsedSeconds >= timeFrom) &&
    (timeTo === null || event.elapsedSeconds <= timeTo)
  ) ?? []);

  const number = (value: number): string => value.toLocaleString('ko-KR');
  const duration = (seconds: number): string =>
    `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
  const shortSha = (sha: string | undefined): string => sha?.slice(0, 8) ?? 'unknown';

  function toggleRun(runId: string): void {
    selectedRunIds = selectedRunIds.includes(runId)
      ? selectedRunIds.filter((id) => id !== runId)
      : [...selectedRunIds, runId];
  }

  async function loadFiles(files: readonly File[]): Promise<void> {
    const summaries = new Map<string, { summary: RunSummary; source: string }>();
    const jsonl: { file: File; text: string }[] = [];
    const messages: string[] = [];

    for (const file of files) {
      const text = await file.text();
      if (file.name.endsWith('.jsonl')) {
        jsonl.push({ file, text });
        continue;
      }
      if (file.name.endsWith('.json')) {
        const parsed = parseRunSummaryText(text, file.name);
        if (parsed.summary) summaries.set(parsed.summary.runId, { summary: parsed.summary, source: file.name });
        else messages.push(...parsed.issues.map((entry) => `${file.name}: ${entry.message}`));
        continue;
      }
      messages.push(`${file.name}: JSONL 또는 summary JSON만 지원합니다.`);
    }

    const loaded: RunAnalysis[] = [];
    const matchedSummaries = new Set<string>();
    for (const input of jsonl) {
      const initial = analyzeRunLogText(input.text, input.file.name);
      const external = summaries.get(initial.runId);
      if (external) matchedSummaries.add(initial.runId);
      loaded.push(analyzeRunLogText(input.text, input.file.name, external?.summary ?? null));
    }
    for (const [runId, entry] of summaries) {
      if (!matchedSummaries.has(runId)) loaded.push(analysisFromSummary(entry.summary, entry.source));
    }

    analyses = loaded;
    selectedRunIds = loaded.slice(0, 1).map((analysis) => analysis.runId);
    loadMessages = messages;
    eventType = 'all';
    roundFrom = roundTo = timeFrom = timeTo = null;
  }

  function onFileInput(event: Event): void {
    const input = event.currentTarget as HTMLInputElement;
    void loadFiles([...(input.files ?? [])]);
  }

  function onDrop(event: DragEvent): void {
    event.preventDefault();
    dragging = false;
    void loadFiles([...(event.dataTransfer?.files ?? [])]);
  }
</script>

<svelte:head><title>Game TD · Run Log Viewer</title></svelte:head>

<main class="viewer">
  <header>
    <div>
      <p class="eyebrow">GAME TD · LOCAL TOOLS</p>
      <h1>런 로그 뷰어</h1>
      <p>파일은 브라우저 메모리에서만 처리되며 서버로 전송되지 않습니다.</p>
    </div>
    <a href="/">게임으로 돌아가기</a>
  </header>

  <label
    class:dragging
    class="dropzone"
    ondragover={(event) => { event.preventDefault(); dragging = true; }}
    ondragleave={() => (dragging = false)}
    ondrop={onDrop}
  >
    <input type="file" multiple accept=".jsonl,.json,application/json,application/x-ndjson" onchange={onFileInput} />
    <strong>JSONL·summary 파일을 놓거나 선택하세요</strong>
    <span>여러 런과 각 런의 summary를 한 번에 불러올 수 있습니다.</span>
  </label>

  {#if loadMessages.length || buildKeys.size > 1}
    <section class="notice warning">
      {#if buildKeys.size > 1}<p>서로 다른 target/build가 섞여 있습니다. 비교 시 빌드 차이를 확인하세요.</p>{/if}
      {#each loadMessages as message}<p>{message}</p>{/each}
    </section>
  {/if}

  {#if analyses.length === 0}
    <section class="empty">
      <b>아직 불러온 런이 없습니다.</b>
      <span>게임오버 화면에서 받은 JSONL 또는 Unity `GameLogs` 파일을 사용하세요.</span>
    </section>
  {:else}
    <section class="runs">
      <div class="section-title"><h2>런 목록</h2><span>{analyses.length}개</span></div>
      <div class="run-grid">
        {#each analyses as analysis (analysis.sourceName + analysis.runId)}
          {@const run = analysis.projection}
          {@const errors = analysis.issues.filter((entry) => entry.severity === 'error').length}
          {@const warnings = analysis.issues.filter((entry) => entry.severity === 'warning').length}
          <article class:active={active?.runId === run.runId} class:invalid={!analysis.valid}>
            <div class="run-select">
              <input
                type="checkbox"
                checked={selectedRunIds.includes(run.runId)}
                onchange={() => toggleRun(run.runId)}
                aria-label={`${run.runId} 비교 선택`}
              />
              <button class="plain" onclick={() => (selectedRunIds = [run.runId])}>
                <b>{run.build?.target ?? '?'}</b>
                <code>{shortSha(run.build?.gitSha)}</code>
              </button>
            </div>
            <div class="score">{number(run.score)}<small>점</small></div>
            <div class="run-meta">R{run.round} · {duration(run.elapsedSeconds)} · seed {run.seed ?? '?'}</div>
            <div class="badges">
              <span class:ok={run.complete}>{run.finishReason}</span>
              {#if errors}<span class="error">E {errors}</span>{/if}
              {#if warnings}<span class="warn">W {warnings}</span>{/if}
            </div>
          </article>
        {/each}
      </div>
    </section>

    {#if compared.length > 1}
      <section>
        <div class="section-title"><h2>런 비교</h2><span>{compared.length}개 선택</span></div>
        <div class="table-wrap"><table>
          <thead><tr><th>지표</th>{#each compared as item}<th>{item.projection.build?.target}<br><code>{shortSha(item.projection.build?.gitSha)}</code></th>{/each}</tr></thead>
          <tbody>
            <tr><th>점수</th>{#each compared as item}<td>{number(item.projection.score)}</td>{/each}</tr>
            <tr><th>라운드</th>{#each compared as item}<td>{item.projection.round}</td>{/each}</tr>
            <tr><th>시간</th>{#each compared as item}<td>{duration(item.projection.elapsedSeconds)}</td>{/each}</tr>
            <tr><th>보스</th>{#each compared as item}<td>Lv{item.projection.bossCleared} / {item.projection.bossesKilled}킬</td>{/each}</tr>
            <tr><th>영웅</th>{#each compared as item}<td>Lv{item.projection.heroLevel}</td>{/each}</tr>
            <tr><th>생성/조합</th>{#each compared as item}<td>{item.projection.unitsSpawned} / {item.projection.merges}</td>{/each}</tr>
          </tbody>
        </table></div>
      </section>
    {/if}

    {#if active}
      {@const run = active.projection}
      <section>
        <div class="section-title"><h2>런 상세</h2><code>{run.runId}</code></div>
        <div class="metrics">
          <div><span>점수</span><b>{number(run.score)}</b></div>
          <div><span>라운드</span><b>{run.round}</b></div>
          <div><span>플레이 시간</span><b>{duration(run.elapsedSeconds)}</b></div>
          <div><span>영웅</span><b>Lv{run.heroLevel}</b></div>
          <div><span>보스</span><b>Lv{run.bossCleared}</b></div>
          <div><span>XP 구매</span><b>{run.heroXpPurchases}회</b></div>
        </div>

        <div class="detail-grid">
          <div class="detail-card"><h3>최종 타워</h3>
            {#if run.towers.length}<ul>{#each run.towers as item}<li><b>{item.tower.name}</b><span>T{item.tower.tier} · {item.tower.raceName} ×{item.count}</span></li>{/each}</ul>
            {:else}<p>없음 또는 미완료 런에서 확인 불가</p>{/if}
          </div>
          <div class="detail-card"><h3>선택 증강</h3>
            {#if run.augments.length}<ul>{#each run.augments as item}<li><b>{item.augment.name}</b><span>{item.augment.rarity} · R{item.round} {duration(item.elapsedSeconds)}</span></li>{/each}</ul>
            {:else}<p>없음 또는 미완료 런에서 확인 불가</p>{/if}
          </div>
          <div class="detail-card"><h3>보스 교전</h3>
            {#if active.bossEncounters.length}<ul>{#each active.bossEncounters as encounter}<li><b>Lv{encounter.level} · R{encounter.summonedRound}</b><span>{encounter.durationSeconds === null ? '진행/미처치' : `${encounter.durationSeconds.toFixed(1)}초`}</span></li>{/each}</ul>
            {:else}<p>소환 기록 없음</p>{/if}
          </div>
          <div class="detail-card"><h3>최종 경제·강화</h3>
            <ul>
              <li><b>금화 / 마정석</b><span>{run.mineral ?? '?'} / {run.gas ?? '?'}</span></li>
              <li><b>광부</b><span>{run.probes}</span></li>
              <li><b>병과 강화</b><span>{run.upgrades.length ? run.upgrades.join(' / ') : '미확인'}</span></li>
            </ul>
          </div>
        </div>

        {#if active.issues.length}
          <div class="issues">
            <h3>품질 검사</h3>
            {#each active.issues as entry}
              <p class:error={entry.severity === 'error'}><b>{entry.code}</b> {entry.message}{entry.line ? ` · line ${entry.line}` : ''}</p>
            {/each}
          </div>
        {/if}
      </section>

      <section>
        <div class="section-title"><h2>이벤트 타임라인</h2><span>{filteredEvents.length}/{active.events.length}</span></div>
        <div class="filters">
          <label>유형<select bind:value={eventType}><option value="all">전체</option>{#each eventTypes as type}<option value={type}>{type}</option>{/each}</select></label>
          <label>라운드 시작<input type="number" min="0" bind:value={roundFrom} placeholder="0" /></label>
          <label>라운드 끝<input type="number" min="0" bind:value={roundTo} placeholder="∞" /></label>
          <label>시간 시작<input type="number" min="0" step="1" bind:value={timeFrom} placeholder="0" /></label>
          <label>시간 끝<input type="number" min="0" step="1" bind:value={timeTo} placeholder="∞" /></label>
        </div>
        <div class="timeline">
          {#each filteredEvents as event (event.seq)}
            <div><time>{duration(event.elapsedSeconds)}</time><span class="round">R{event.round}</span><code>{event.type}</code><p>{eventDescription(event)}</p><small>#{event.seq}</small></div>
          {:else}<p class="no-events">필터에 맞는 이벤트가 없습니다.</p>{/each}
        </div>
      </section>
    {/if}
  {/if}
</main>

<style>
  :global(body){display:block;align-items:initial;padding:0;background:#100d09;color:#ece2cb}
  :global(button),:global(input),:global(select){font:inherit}
  .viewer{width:min(1440px,100%);margin:0 auto;padding:28px;display:grid;gap:22px}
  header{display:flex;justify-content:space-between;align-items:flex-end;gap:24px;border-bottom:1px solid #4d3d28;padding-bottom:18px}
  header h1{font-family:var(--serif);font-size:32px;color:var(--gold)}
  header p{color:var(--dim);margin-top:5px}.eyebrow{font-size:11px;letter-spacing:.18em;color:var(--gold)!important}
  header a{color:var(--gold);text-decoration:none;border:1px solid var(--line2);border-radius:7px;padding:9px 14px;white-space:nowrap}
  .dropzone{border:1px dashed var(--line2);border-radius:12px;padding:26px;display:grid;place-items:center;gap:6px;background:rgba(49,39,26,.5);cursor:pointer}
  .dropzone.dragging{border-color:var(--gold);background:rgba(227,178,62,.08)}.dropzone input{position:absolute;opacity:0;pointer-events:none}.dropzone span{font-size:12px;color:var(--dim)}
  section,.notice,.empty{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:18px;box-shadow:inset 0 1px rgba(255,230,180,.05)}
  .empty{min-height:180px;display:grid;place-content:center;text-align:center;gap:8px}.empty span{color:var(--dim)}
  .notice{padding:12px 16px}.warning{border-color:#8d6a2d;color:#e7c57b}.warning p+p{margin-top:5px}
  .section-title{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-bottom:14px}.section-title h2{font-family:var(--serif);font-size:18px;color:var(--gold)}.section-title span,.section-title code{font-size:11px;color:var(--dim)}
  .run-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px}.run-grid article{border:1px solid var(--line);border-radius:9px;padding:12px;background:#1b160f}.run-grid article.active{border-color:var(--gold)}.run-grid article.invalid{border-color:var(--danger)}
  .run-select{display:flex;gap:8px;align-items:center}.plain{padding:0;border:0;background:none;box-shadow:none;display:flex;gap:8px;align-items:center}.plain b{text-transform:uppercase;color:var(--gold)}code{font-family:ui-monospace,SFMono-Regular,monospace}
  .score{font-family:var(--serif);font-size:27px;margin-top:12px}.score small{font-size:12px;color:var(--dim);margin-left:3px}.run-meta{font-size:11px;color:var(--dim);margin-top:3px}.badges{display:flex;gap:5px;margin-top:10px}.badges span{font-size:10px;padding:2px 6px;border:1px solid var(--line);border-radius:9px}.badges .ok{color:var(--moss)}.badges .error{color:#ff8069}.badges .warn{color:#e7c57b}
  .table-wrap{overflow-x:auto}table{width:100%;border-collapse:collapse;font-size:12px}th,td{padding:9px;border-bottom:1px solid var(--line);text-align:right}th:first-child{text-align:left;color:var(--dim)}thead th{color:var(--gold)}
  .metrics{display:grid;grid-template-columns:repeat(6,1fr);gap:8px}.metrics div{background:#1b160f;border:1px solid var(--line);border-radius:8px;padding:10px}.metrics span{font-size:10px;color:var(--dim);display:block}.metrics b{font-family:var(--serif);font-size:18px;color:var(--gold)}
  .detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px}.detail-card{background:#1b160f;border:1px solid var(--line);border-radius:8px;padding:12px}.detail-card h3,.issues h3{font-size:13px;color:var(--dim);margin-bottom:8px}.detail-card ul{list-style:none;display:grid;gap:5px}.detail-card li{display:flex;justify-content:space-between;gap:8px;font-size:12px}.detail-card li span,.detail-card p{color:var(--dim);font-size:11px}
  .issues{margin-top:12px;border-top:1px solid var(--line);padding-top:12px}.issues p{font-size:11px;color:#e7c57b;margin-top:5px}.issues p.error{color:#ff8069}.issues b{font-family:ui-monospace,SFMono-Regular,monospace;margin-right:6px}
  .filters{display:grid;grid-template-columns:2fr repeat(4,1fr);gap:8px;margin-bottom:12px}.filters label{font-size:10px;color:var(--dim)}.filters input,.filters select{display:block;width:100%;margin-top:4px;background:#17120d;color:var(--text);border:1px solid var(--line);border-radius:6px;padding:7px}
  .timeline{display:grid}.timeline>div{display:grid;grid-template-columns:52px 38px 170px 1fr 36px;align-items:center;gap:8px;border-top:1px solid var(--line);padding:8px 3px;font-size:12px}.timeline time,.timeline .round,.timeline small{color:var(--dim);font-variant-numeric:tabular-nums}.timeline code{color:var(--slate)}.timeline small{text-align:right}.no-events{color:var(--dim);padding:22px;text-align:center}
  @media(max-width:760px){.viewer{padding:14px}.metrics{grid-template-columns:repeat(2,1fr)}.detail-grid{grid-template-columns:1fr}.filters{grid-template-columns:1fr 1fr}.filters label:first-child{grid-column:1/-1}.timeline>div{grid-template-columns:45px 32px 1fr}.timeline p{grid-column:2/-1}.timeline small{display:none}header{align-items:flex-start;flex-direction:column}}
</style>
