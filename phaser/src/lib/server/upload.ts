// ───────── 업로드 처리 (SvelteKit +server.ts에서 호출) ─────────
// 계획: docs/exec-plans/run-log-db-and-ranking.md M1
// 구 services/game-log-worker/src/index.ts의 handleUpload 로직을 SvelteKit 서버로 옮긴 것.

import type { D1Database } from '@cloudflare/workers-types';
import { ingestRun, recentUploadCount } from './db';
import { DEFAULT_LIMITS, ValidationError, sha256Hex, validateUpload } from './validate';

/** 같은 client_token이 1시간에 올릴 수 있는 런 수 (M0 실측 후 조정) */
const RATE_LIMIT_PER_HOUR = 60;

export interface UploadResponse {
  status: number;
  body: Record<string, unknown>;
}

/**
 * 원문(JSON 문자열)과 D1을 받아 검사·적재하고 응답을 돌려준다.
 * 라우트 핸들러는 이 결과를 그대로 json()으로 감싼다.
 */
export async function handleUpload(raw: string, db: D1Database): Promise<UploadResponse> {
  if (raw.length > DEFAULT_LIMITS.maxBytes) {
    return { status: 413, body: { error: 'payload_too_large', limit: DEFAULT_LIMITS.maxBytes } };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: 400, body: { error: 'bad_json' } };
  }

  const now = new Date();
  let run;
  try {
    run = validateUpload(parsed, DEFAULT_LIMITS, now);
  } catch (error) {
    if (error instanceof ValidationError) {
      return { status: 400, body: { error: error.code, message: error.message } };
    }
    throw error;
  }

  const clientToken = (parsed as { clientToken: string }).clientToken;
  const clientTokenHash = await sha256Hex(clientToken);

  const sinceIso = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  if ((await recentUploadCount(db, clientTokenHash, sinceIso)) >= RATE_LIMIT_PER_HOUR) {
    return { status: 429, body: { error: 'rate_limited', limit: RATE_LIMIT_PER_HOUR } };
  }

  const outcome = await ingestRun(db, run, clientTokenHash, now);
  switch (outcome.status) {
    case 'created':
      return { status: 201, body: { ok: true, runId: outcome.runId, eventCount: outcome.eventCount } };
    case 'duplicate':
      return { status: 200, body: { ok: true, runId: outcome.runId, duplicate: true } };
    case 'conflict':
      return { status: 409, body: { error: 'run_conflict', runId: outcome.runId } };
  }
}
