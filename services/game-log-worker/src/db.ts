// ───────── D1 적재 ─────────
// 계획: docs/exec-plans/run-log-db-and-ranking.md §4.2, M1 게이트
//
// 같은 run_id 재업로드 규칙: 내용(content_hash)이 같으면 idempotent 성공,
// 다르면 409 conflict로 거부한다 — 조용히 덮어쓰지 않는다.

import type { RunEvent, ValidatedRun } from './validate';
import { contentFingerprint, sha256Hex } from './validate';

export interface Env {
  DB: D1Database;
  /** 정적 자산 계층 — API가 아닌 요청을 되돌려준다 (루트 wrangler.jsonc의 assets.binding) */
  ASSETS: Fetcher;
  /** 선택 — 설정하면 이 값과 일치하는 요청만 admin 경로를 쓸 수 있다 */
  ADMIN_TOKEN?: string;
}

export type IngestOutcome =
  | { status: 'created'; runId: string; eventCount: number }
  | { status: 'duplicate'; runId: string }
  | { status: 'conflict'; runId: string };

/** D1 배치 상한 여유분 — 한 batch에 너무 많은 statement를 넣지 않는다 */
const EVENT_CHUNK = 200;

export async function ingestRun(
  env: Env,
  run: ValidatedRun,
  clientTokenHash: string,
  now: Date,
): Promise<IngestOutcome> {
  const contentHash = await sha256Hex(contentFingerprint(run.events));

  const existing = await env.DB.prepare('SELECT content_hash FROM runs WHERE run_id = ?')
    .bind(run.runId)
    .first<{ content_hash: string }>();

  if (existing) {
    // 같은 내용의 재전송(네트워크 재시도 등)은 성공으로 취급한다
    return existing.content_hash === contentHash
      ? { status: 'duplicate', runId: run.runId }
      : { status: 'conflict', runId: run.runId };
  }

  const summary = run.summary;
  const num = (key: string): number | null => {
    const v = summary?.[key];
    return typeof v === 'number' ? v : null;
  };

  const insertRun = env.DB.prepare(
    `INSERT INTO runs (
       run_id, schema_version, content_hash,
       build_sha, build_branch, build_target, build_dirty, app_version, engine_version,
       seed, rng_algorithm,
       started_at, uploaded_at, finish_reason, complete, cleared,
       score, round, kills, elapsed_seconds, hero_level, boss_cleared,
       display_name, client_token_hash, user_id,
       event_count, summary_json
     ) VALUES (?,?,?, ?,?,?,?,?,?, ?,?, ?,?,?,?,?, ?,?,?,?,?,?, ?,?,NULL, ?,?)`,
  ).bind(
    run.runId,
    1,
    contentHash,
    run.build.sha,
    run.build.branch,
    run.build.target,
    run.build.dirty ? 1 : 0,
    run.build.appVersion,
    run.build.engineVersion,
    run.seed,
    run.rngAlgorithm,
    run.startedAt,
    now.toISOString(),
    run.finishReason,
    run.complete ? 1 : 0,
    summary?.cleared === true ? 1 : summary?.cleared === false ? 0 : null,
    // 완주면 summary 값을, 중단이면 마지막 이벤트 값을 쓴다
    num('score') ?? run.score,
    num('round') ?? run.round,
    num('kills'),
    num('elapsedSeconds'),
    num('heroLevel'),
    num('bossCleared'),
    run.displayName,
    clientTokenHash,
    run.events.length,
    summary ? JSON.stringify(summary) : null,
  );

  const eventStatements = chunk(run.events, EVENT_CHUNK).map((group) =>
    group.map((e) => eventInsert(env, run.runId, e)),
  );

  // D1 batch는 암묵 트랜잭션이다. runs를 먼저 넣어 FK 참조를 만족시킨다.
  await env.DB.batch([insertRun]);
  for (const group of eventStatements) {
    await env.DB.batch(group);
  }

  return { status: 'created', runId: run.runId, eventCount: run.events.length };
}

function eventInsert(env: Env, runId: string, e: RunEvent): D1PreparedStatement {
  return env.DB.prepare(
    `INSERT OR IGNORE INTO run_events
       (run_id, seq, type, elapsed_seconds, round, round_time, score, payload_json)
     VALUES (?,?,?,?,?,?,?,?)`,
  ).bind(runId, e.seq, e.type, e.elapsedSeconds, e.round, e.roundTime, e.score, JSON.stringify(e.data));
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * 같은 토큰의 최근 업로드 수 — 단순 rate limit.
 * 정교한 제한이 필요해지면 Durable Object나 KV로 옮긴다.
 */
export async function recentUploadCount(
  env: Env,
  clientTokenHash: string,
  sinceIso: string,
): Promise<number> {
  const row = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM runs WHERE client_token_hash = ? AND uploaded_at >= ?',
  )
    .bind(clientTokenHash, sinceIso)
    .first<{ n: number }>();
  return row?.n ?? 0;
}
