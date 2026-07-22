// ───────── 랭킹 조회 클라이언트 (M3) ─────────
// 사이트와 API가 같은 Worker라 동일 출처다 (루트 wrangler.jsonc).

import { clientToken } from '$lib/game/run-upload';

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
  /** 이 브라우저에서 올린 기록인가 */
  mine: boolean;
}

export interface RunDetail {
  runId: string;
  displayName: string | null;
  score: number;
  round: number;
  startedAt: string;
  summary: RunSummaryLike | null;
  events: DetailEvent[];
}

export interface DetailEvent {
  seq: number;
  type: string;
  round: number;
  elapsedSeconds: number;
  data: Record<string, unknown>;
}

/** 상세 화면이 실제로 읽는 필드만 — summary 전체 스키마는 engine이 소유한다 */
export interface RunSummaryLike {
  kills?: number;
  heroLevel?: number;
  bossCleared?: number;
  elapsedSeconds?: number;
  upgrades?: readonly number[];
  towers?: readonly { tower: { name: string; tier: number; raceName: string }; count: number }[];
  augments?: readonly { augment: { name: string; rarity: string }; round: number }[];
}

export async function fetchRanking(limit = 20): Promise<RankingRow[]> {
  // clientToken은 조회 조건이 아니라 "내 기록" 표시용이다
  const params = new URLSearchParams({ limit: String(limit), clientToken: clientToken() });
  const response = await fetch(`/api/v1/ranking?${params}`);
  if (!response.ok) throw new Error(`ranking_failed_${response.status}`);
  const body = (await response.json()) as { rows: RankingRow[] };
  return body.rows;
}

export async function fetchRunDetail(runId: string): Promise<RunDetail | null> {
  const response = await fetch(`/api/v1/runs/${encodeURIComponent(runId)}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`detail_failed_${response.status}`);
  return (await response.json()) as RunDetail;
}
