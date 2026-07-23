// ───────── 랭킹 조회 (M3) ─────────
// 계획: docs/exec-plans/run-log-db-and-ranking.md §7
//
// 노출 조건은 §5.2 하나뿐이다: normal_end = 1 AND build_dirty = 0.
// 중단 판(normal_end=0)과 개발 빌드는 저장은 되지만 절대 노출하지 않는다.
//
// 랭킹 목록은 runs 테이블의 컬럼만 읽는다 — JSON 파싱도, run_events 접근도 없다
// (부분 인덱스 idx_runs_ranking이 상위 N만 훑는다).

import type { D1Database } from '@cloudflare/workers-types';

/** 노출 자격 — 이 조건을 여러 곳에 흩지 않는다 */
const VISIBLE = 'normal_end = 1 AND build_dirty = 0';

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;

export interface RankingRow {
  rank: number;
  runId: string;
  displayName: string | null;
  score: number;
  round: number;
  kills: number | null;
  heroLevel: number | null;
  bossCleared: number | null;
  cleared: boolean;
  elapsedSeconds: number | null;
  startedAt: string;
  /** 이 브라우저(client_token)의 기록인가 */
  mine: boolean;
}

const clampLimit = (raw: string | null): number => {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.floor(n));
};

/** 상위 N — 점수 내림차순 */
export async function topRanking(
  db: D1Database,
  url: URL,
  clientTokenHash: string | null,
): Promise<RankingRow[]> {
  const limit = clampLimit(url.searchParams.get('limit'));

  const { results } = await db.prepare(
    `SELECT run_id, display_name, score, round, kills, hero_level, boss_cleared,
            cleared, elapsed_seconds, started_at, client_token_hash
       FROM runs
      WHERE ${VISIBLE}
      ORDER BY score DESC, elapsed_seconds ASC
      LIMIT ?`,
  )
    .bind(limit)
    .all<{
      run_id: string;
      display_name: string | null;
      score: number;
      round: number;
      kills: number | null;
      hero_level: number | null;
      boss_cleared: number | null;
      cleared: number | null;
      elapsed_seconds: number | null;
      started_at: string;
      client_token_hash: string;
    }>();

  return results.map((r, i) => ({
    rank: i + 1,
    runId: r.run_id,
    displayName: r.display_name,
    score: r.score,
    round: r.round,
    kills: r.kills,
    heroLevel: r.hero_level,
    bossCleared: r.boss_cleared,
    cleared: r.cleared === 1,
    elapsedSeconds: r.elapsed_seconds,
    startedAt: r.started_at,
    mine: clientTokenHash !== null && r.client_token_hash === clientTokenHash,
  }));
}

export interface RunDetail {
  runId: string;
  displayName: string | null;
  score: number;
  round: number;
  startedAt: string;
  /** 빌드 구성·증강 등 — summary_json 그대로 (§3.1: 랭킹 상세가 필요한 건 여기 다 있다) */
  summary: unknown;
  /** 선택 기록 타임라인 — 증강 선택·골드 소비·타워 배치 */
  events: { seq: number; type: string; round: number; elapsedSeconds: number; data: unknown }[];
}

/** 노출 자격이 있는 런의 상세. 자격 없으면 null (중단 판은 공개하지 않는다) */
export async function runDetail(db: D1Database, runId: string): Promise<RunDetail | null> {
  const row = await db.prepare(
    `SELECT run_id, display_name, score, round, started_at, summary_json
       FROM runs WHERE run_id = ? AND ${VISIBLE}`,
  )
    .bind(runId)
    .first<{
      run_id: string;
      display_name: string | null;
      score: number;
      round: number;
      started_at: string;
      summary_json: string | null;
    }>();

  if (!row) return null;

  // 선택 기록만 추린다 — 라운드 진행 같은 잡음은 상세 화면에 필요 없다
  const { results } = await db.prepare(
    `SELECT seq, type, round, elapsed_seconds, payload_json
       FROM run_events
      WHERE run_id = ?
        AND type IN ('tower_spawned','tower_merged','tower_sold','augment_chosen',
                     'augment_upgraded','hero_xp_bought','probe_bought','race_upgraded',
                     'god_rerolled','skill_rerolled','boss_summoned','boss_killed')
      ORDER BY seq`,
  )
    .bind(runId)
    .all<{
      seq: number;
      type: string;
      round: number;
      elapsed_seconds: number;
      payload_json: string;
    }>();

  return {
    runId: row.run_id,
    displayName: row.display_name,
    score: row.score,
    round: row.round,
    startedAt: row.started_at,
    summary: row.summary_json ? JSON.parse(row.summary_json) : null,
    events: results.map((e) => ({
      seq: e.seq,
      type: e.type,
      round: e.round,
      elapsedSeconds: e.elapsed_seconds,
      data: JSON.parse(e.payload_json),
    })),
  };
}
