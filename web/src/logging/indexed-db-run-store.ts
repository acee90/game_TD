import type { GameEventSink, GameRunEvent, RunSummary } from '../game/logging';

const DB_NAME = 'game-td-run-logs';
const DB_VERSION = 1;
const EVENT_STORE = 'events';
const SUMMARY_STORE = 'summaries';

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
