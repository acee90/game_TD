// ───────── 게임 런 로그 수집 Worker ─────────
// 계획: docs/exec-plans/run-log-db-and-ranking.md M1
//
// 이 단계(M1)의 범위는 **적재**뿐이다. 랭킹 조회 API와 화면은 M3에서 붙인다.
// 저장 범위는 "모든 판" — 중단 런도 complete=0으로 적재한다(§2).

import { ingestRun, recentUploadCount, type Env } from './db';
import { DEFAULT_LIMITS, ValidationError, sha256Hex, validateUpload } from './validate';

/** 같은 client_token이 1시간에 올릴 수 있는 런 수 (M0 실측 후 조정) */
const RATE_LIMIT_PER_HOUR = 60;

const json = (body: unknown, status = 200, extra: HeadersInit = {}): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...corsHeaders(), ...extra },
  });

function corsHeaders(): Record<string, string> {
  // 정적 사이트(다른 오리진)에서 호출하므로 CORS가 필요하다.
  // 업로드는 공개 엔드포인트이고 쿠키를 쓰지 않으므로 credentials는 허용하지 않는다.
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'POST, GET, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '86400',
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (url.pathname === '/health') {
      return json({ ok: true });
    }

    if (url.pathname === '/api/v1/runs' && request.method === 'POST') {
      return handleUpload(request, env);
    }

    return json({ error: 'not_found' }, 404);
  },
} satisfies ExportedHandler<Env>;

async function handleUpload(request: Request, env: Env): Promise<Response> {
  // 크기 상한 — 파싱 전에 거른다
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > DEFAULT_LIMITS.maxBytes) {
    return json({ error: 'payload_too_large', limit: DEFAULT_LIMITS.maxBytes }, 413);
  }

  const raw = await request.text();
  if (raw.length > DEFAULT_LIMITS.maxBytes) {
    return json({ error: 'payload_too_large', limit: DEFAULT_LIMITS.maxBytes }, 413);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return json({ error: 'bad_json' }, 400);
  }

  const now = new Date();
  let run;
  try {
    run = validateUpload(parsed, DEFAULT_LIMITS, now);
  } catch (error) {
    if (error instanceof ValidationError) {
      return json({ error: error.code, message: error.message }, 400);
    }
    throw error;
  }

  const clientToken = (parsed as { clientToken: string }).clientToken;
  const clientTokenHash = await sha256Hex(clientToken);

  const sinceIso = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const recent = await recentUploadCount(env, clientTokenHash, sinceIso);
  if (recent >= RATE_LIMIT_PER_HOUR) {
    return json({ error: 'rate_limited', limit: RATE_LIMIT_PER_HOUR }, 429);
  }

  const outcome = await ingestRun(env, run, clientTokenHash, now);

  switch (outcome.status) {
    case 'created':
      return json({ ok: true, runId: outcome.runId, eventCount: outcome.eventCount }, 201);
    case 'duplicate':
      // 네트워크 재시도로 같은 내용이 다시 온 경우 — 성공으로 취급한다
      return json({ ok: true, runId: outcome.runId, duplicate: true }, 200);
    case 'conflict':
      return json({ error: 'run_conflict', runId: outcome.runId }, 409);
  }
}
