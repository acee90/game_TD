import type { GameEventSink, GameRunEvent, RunSummary } from '../game/logging';

const DB_NAME = 'game-td-run-logs';
/** v2 — 업로드 상태 스토어 신설 (M2, 서버 동기화) */
const DB_VERSION = 2;
const EVENT_STORE = 'events';
const SUMMARY_STORE = 'summaries';
const UPLOAD_STORE = 'uploads';

/**
 * 업로드 진행 상태. 로컬 기록이 원본이고 업로드는 실패해도 되는 계층이므로,
 * 여기 없는 런은 "아직 안 올린 것"으로 본다 (별도 pending 표시를 두지 않는다).
 */
export interface RunUploadState {
  readonly runId: string;
  readonly status: 'uploaded' | 'failed';
  readonly attempts: number;
  readonly updatedAt: string;
  readonly error?: string;
}

function openRunLogDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(EVENT_STORE)) {
        const events = db.createObjectStore(EVENT_STORE, { keyPath: ['runId', 'seq'] });
        events.createIndex('runId', 'runId');
        events.createIndex('type', 'type');
      }
      if (!db.objectStoreNames.contains(SUMMARY_STORE)) {
        db.createObjectStore(SUMMARY_STORE, { keyPath: 'runId' });
      }
      if (!db.objectStoreNames.contains(UPLOAD_STORE)) {
        db.createObjectStore(UPLOAD_STORE, { keyPath: 'runId' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'));
  });
}

function put(db: IDBDatabase, storeName: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    transaction.objectStore(storeName).put(value);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB write failed'));
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB write aborted'));
  });
}

function requestResult<Result>(request: IDBRequest<Result>): Promise<Result> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB read failed'));
  });
}

export async function loadRunEvents(runId: string): Promise<GameRunEvent[]> {
  const db = await openRunLogDatabase();
  const transaction = db.transaction(EVENT_STORE, 'readonly');
  const events = await requestResult(
    transaction.objectStore(EVENT_STORE).index('runId').getAll(IDBKeyRange.only(runId)),
  ) as GameRunEvent[];
  return events.sort((a, b) => a.seq - b.seq);
}

export async function loadRunSummary(runId: string): Promise<RunSummary | null> {
  const db = await openRunLogDatabase();
  const transaction = db.transaction(SUMMARY_STORE, 'readonly');
  const summary = await requestResult(
    transaction.objectStore(SUMMARY_STORE).get(runId),
  ) as RunSummary | undefined;
  return summary ?? null;
}

export async function listRunSummaries(): Promise<RunSummary[]> {
  const db = await openRunLogDatabase();
  const transaction = db.transaction(SUMMARY_STORE, 'readonly');
  const summaries = await requestResult(
    transaction.objectStore(SUMMARY_STORE).getAll(),
  ) as RunSummary[];
  return summaries.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

// ───────── 업로드 동기화 (M2) ─────────
// 로컬 IndexedDB가 원본이고 서버 업로드는 실패해도 되는 계층이다.
// 이탈 순간에는 쓰기가 유실되므로(실측 확인) **다음 방문 때** 밀린 런을 올린다.

/** 업로드 결과를 기록한다 */
export async function markUploadState(state: RunUploadState): Promise<void> {
  const db = await openRunLogDatabase();
  await put(db, UPLOAD_STORE, state);
}

export async function getUploadState(runId: string): Promise<RunUploadState | null> {
  const db = await openRunLogDatabase();
  const transaction = db.transaction(UPLOAD_STORE, 'readonly');
  const state = (await requestResult(
    transaction.objectStore(UPLOAD_STORE).get(runId),
  )) as RunUploadState | undefined;
  return state ?? null;
}

/**
 * 아직 서버에 올리지 않은 런 ID — 이벤트는 있는데 uploaded 표시가 없는 것들.
 * 오래된 것부터 돌려준다(먼저 시작한 판을 먼저 올린다).
 *
 * `exclude`로 진행 중인 런을 빼면 플레이 도중에 부분 업로드되는 일을 막는다.
 */
export async function listPendingRunIds(exclude: readonly string[] = []): Promise<string[]> {
  const db = await openRunLogDatabase();
  const transaction = db.transaction([EVENT_STORE, UPLOAD_STORE], 'readonly');

  // run_started(seq 1)만 모으면 런 목록과 시작 순서를 한 번에 얻는다
  const starts = (await requestResult(
    transaction.objectStore(EVENT_STORE).index('type').getAll(IDBKeyRange.only('run_started')),
  )) as GameRunEvent[];
  const uploaded = (await requestResult(
    transaction.objectStore(UPLOAD_STORE).getAll(),
  )) as RunUploadState[];

  const done = new Set(uploaded.filter((u) => u.status === 'uploaded').map((u) => u.runId));
  const skip = new Set(exclude);

  return starts
    .filter((e) => !done.has(e.runId) && !skip.has(e.runId))
    .sort((a, b) => a.elapsedSeconds - b.elapsedSeconds)
    .map((e) => e.runId);
}

/** 업로드 페이로드 — 한 런의 이벤트 전체를 seq 순서로 */
export async function loadRunForUpload(runId: string): Promise<GameRunEvent[]> {
  return loadRunEvents(runId);
}

function downloadText(filename: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * Game에는 동기 sink로 보이지만 실제 브라우저 저장은 순서가 보장된 비동기 queue로 처리한다.
 * 메모리 사본이 JSONL 내보내기의 즉시 원본이고 IndexedDB는 reload/강제 종료 대비 사본이다.
 */
export class IndexedDbRunStore implements GameEventSink {
  readonly events: GameRunEvent[] = [];
  summary: RunSummary | null = null;
  lastError: unknown = null;

  private readonly database = openRunLogDatabase();
  private pending: Promise<void> = Promise.resolve();

  record(event: GameRunEvent): void {
    this.events.push(event);
    this.enqueue(async () => put(await this.database, EVENT_STORE, event));
  }

  finish(summary: RunSummary): void {
    this.summary = summary;
    this.enqueue(async () => put(await this.database, SUMMARY_STORE, summary));
  }

  private enqueue(operation: () => Promise<void>): void {
    this.pending = this.pending.then(operation).catch((error: unknown) => {
      this.lastError = error;
    });
  }

  flush(): Promise<void> {
    return this.pending;
  }

  toJsonl(): string {
    return this.events.map((event) => JSON.stringify(event)).join('\n') + (this.events.length ? '\n' : '');
  }

  downloadJsonl(): void {
    const runId = this.events[0]?.runId ?? 'unknown-run';
    downloadText(`${runId}.jsonl`, this.toJsonl(), 'application/x-ndjson;charset=utf-8');
  }

  downloadSummary(): void {
    if (!this.summary) return;
    downloadText(
      `${this.summary.runId}-summary.json`,
      `${JSON.stringify(this.summary, null, 2)}\n`,
      'application/json;charset=utf-8',
    );
  }
}
