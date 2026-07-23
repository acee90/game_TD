// POST /api/v1/runs — 런 로그 업로드·검사·적재 (SvelteKit API route)
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { handleUpload } from '$lib/server/upload';

// 서버에서 실행되는 엔드포인트 — 루트 레이아웃의 prerender=true를 끊는다.
// trailingSlash도 무시해 클라이언트가 /api/v1/runs(슬래시 없이) POST할 수 있게 한다.
export const prerender = false;
export const trailingSlash = 'ignore';

export const POST: RequestHandler = async ({ request, platform }) => {
  const db = platform?.env?.DB;
  if (!db) throw error(503, 'database_unavailable');

  const raw = await request.text();
  const result = await handleUpload(raw, db);
  return json(result.body, { status: result.status });
};
