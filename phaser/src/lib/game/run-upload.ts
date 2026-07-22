// ───────── 런 로그 서버 업로드 (M2) ─────────
// 계획: docs/exec-plans/run-log-db-and-ranking.md §4.1
//
// 원칙: **로컬 IndexedDB가 원본이고 업로드는 실패해도 되는 계층이다.**
// 네트워크 오류가 게임 흐름이나 게임오버 화면을 절대 막지 않는다.
//
// 이탈(pagehide) 순간의 쓰기는 신뢰할 수 없다 — 실측으로 확인했다(이벤트는 남고
// run_finished·summary는 유실). 그래서 이탈 시점에 보내려 하지 않고, **다음 방문 때**
// 밀린 런을 올린다. 오프라인 플레이도 같은 경로로 자연히 커버된다.

import {
  listPendingRunIds,
  loadRunForUpload,
  markUploadState,
} from '@engine/logging/indexed-db-run-store';

/** 사이트와 API가 같은 Worker라 동일 출처다 — 절대 경로로 충분하다 (루트 wrangler.jsonc) */
const UPLOAD_PATH = '/api/v1/runs';

const TOKEN_KEY = 'gattadi.clientToken.v1';
const NAME_KEY = 'gattadi.displayName.v1';

/**
 * 브라우저별 익명 토큰. 인증 수단이 아니라 rate limit과 "내 기록" 표시용이며,
 * 서버에는 해시만 저장된다. 계정을 붙이면 이 자리를 user_id가 대체한다.
 */
export function clientToken(): string {
  try {
    const saved = localStorage.getItem(TOKEN_KEY);
    if (saved && saved.length >= 8) return saved;
    const fresh = crypto.randomUUID();
    localStorage.setItem(TOKEN_KEY, fresh);
    return fresh;
  } catch {
    // localStorage를 못 쓰는 환경(사생활 보호 모드 등) — 세션 한정 토큰으로 진행한다
    return crypto.randomUUID();
  }
}

export function displayName(): string | null {
  try {
    const saved = localStorage.getItem(NAME_KEY);
    return saved && saved.trim().length > 0 ? saved : null;
  } catch {
    return null;
  }
}

export function setDisplayName(name: string): void {
  try {
    const trimmed = name.trim();
    if (trimmed.length === 0) localStorage.removeItem(NAME_KEY);
    else localStorage.setItem(NAME_KEY, trimmed);
  } catch {
    // 저장 실패해도 이번 업로드에는 값을 쓸 수 있으므로 조용히 넘어간다
  }
}

export type UploadResult =
  | { ok: true; duplicate: boolean }
  | { ok: false; reason: string; retriable: boolean };

/** 4xx는 다시 보내도 같은 결과다 — 재시도 대상에서 빼야 매 방문마다 헛수고하지 않는다 */
const isRetriable = (status: number): boolean => status === 429 || status >= 500;

/**
 * 런 하나를 서버로 보낸다. 성공·영구 실패 모두 업로드 상태에 기록해
 * 다음 방문의 동기화 대상에서 빠지게 한다.
 */
export async function uploadRun(runId: string, name = displayName()): Promise<UploadResult> {
  let events;
  try {
    events = await loadRunForUpload(runId);
  } catch (error) {
    return { ok: false, reason: `local_read_failed: ${String(error)}`, retriable: true };
  }
  if (events.length === 0) return { ok: false, reason: 'no_events', retriable: false };

  try {
    const response = await fetch(UPLOAD_PATH, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ clientToken: clientToken(), displayName: name ?? undefined, events }),
    });

    if (response.ok) {
      const body = (await response.json().catch(() => ({}))) as { duplicate?: boolean };
      await recordState(runId, 'uploaded');
      return { ok: true, duplicate: body.duplicate === true };
    }

    const retriable = isRetriable(response.status);
    const reason = `http_${response.status}`;
    // 영구 실패(4xx)는 failed로 확정해 재시도 목록에서 제외한다
    if (!retriable) await recordState(runId, 'failed', reason);
    return { ok: false, reason, retriable };
  } catch (error) {
    // 네트워크 단절 — 상태를 남기지 않아 다음 방문에 다시 시도된다
    return { ok: false, reason: `network: ${String(error)}`, retriable: true };
  }
}

async function recordState(runId: string, status: 'uploaded' | 'failed', error?: string): Promise<void> {
  try {
    await markUploadState({
      runId,
      status,
      attempts: 1,
      updatedAt: new Date().toISOString(),
      ...(error ? { error } : {}),
    });
  } catch {
    // 상태 기록 실패는 업로드 성패를 바꾸지 않는다 (최악의 경우 다음에 한 번 더 보낸다 —
    // 서버가 같은 내용을 idempotent로 처리하므로 안전하다)
  }
}

/**
 * 밀린 런을 올린다 — 앱 진입 시 1회 호출한다.
 * 진행 중인 런(`activeRunId`)은 제외해 플레이 도중 부분 업로드가 생기지 않게 한다.
 * 재시도 가능한 실패가 나오면 즉시 멈춘다(오프라인에서 전부 헛돌지 않게).
 */
export async function syncPendingRuns(activeRunId?: string, limit = 5): Promise<number> {
  let uploaded = 0;
  try {
    const pending = await listPendingRunIds(activeRunId ? [activeRunId] : []);
    for (const runId of pending.slice(0, limit)) {
      const result = await uploadRun(runId);
      if (result.ok) uploaded++;
      else if (result.retriable) break;
    }
  } catch {
    // 동기화 실패는 조용히 넘어간다 — 다음 방문에 다시 시도한다
  }
  return uploaded;
}
