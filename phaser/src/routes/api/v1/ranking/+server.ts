// GET /api/v1/ranking — 상위 N개 랭킹 (정상 종료·정상 빌드만)
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { topRanking } from '$lib/server/ranking';
import { sha256Hex } from '$lib/server/validate';

export const prerender = false;
export const trailingSlash = 'ignore';

export const GET: RequestHandler = async ({ url, platform }) => {
  const db = platform?.env?.DB;
  if (!db) throw error(503, 'database_unavailable');

  // clientToken은 조회 조건이 아니라 "내 기록" 표시용이다
  const token = url.searchParams.get('clientToken');
  const tokenHash = token ? await sha256Hex(token) : null;
  return json({ rows: await topRanking(db, url, tokenHash) });
};
