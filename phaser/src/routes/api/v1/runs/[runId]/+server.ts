// GET /api/v1/runs/:runId — 그 판의 요약 + 선택 기록 타임라인
// 노출 자격(normal_end=1 AND build_dirty=0)이 없는 런은 404 (중단 판은 비공개).
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { runDetail } from '$lib/server/ranking';

export const prerender = false;
export const trailingSlash = 'ignore';

export const GET: RequestHandler = async ({ params, platform }) => {
  const db = platform?.env?.DB;
  if (!db) throw error(503, 'database_unavailable');

  const detail = await runDetail(db, params.runId);
  if (!detail) throw error(404, 'not_found');
  return json(detail);
};
