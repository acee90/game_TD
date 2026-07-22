// ───────── G-타워디펜스 통합 Worker ─────────
// 계획: docs/exec-plans/run-log-db-and-ranking.md M1
//
// 정적 사이트와 API를 한 Worker로 배포한다(2026-07-22 사용자 결정, 루트 wrangler.jsonc).
// Cloudflare가 정적 자산을 먼저 찾고, 없을 때만 이 스크립트를 부른다. 그래서 여기서는
// **API 경로만 처리하고 나머지는 ASSETS로 되돌려준다** — 안 그러면 오타 URL에서
// 우리 404 페이지 대신 JSON 404가 뜬다.
//
// 동일 출처이므로 CORS 헤더를 두지 않는다. 로컬 개발은 vite 프록시가 같은 출처를 만든다
// (phaser/vite.config.ts server.proxy).
//
// 이 단계(M1)의 범위는 **적재**뿐이다. 랭킹 조회 API와 화면은 M3에서 붙인다.

import { ingestRun, recentUploadCount, type Env } from './db';
import { DEFAULT_LIMITS, ValidationError, sha256Hex, validateUpload } from './validate';

/** 같은 client_token이 1시간에 올릴 수 있는 런 수 (M0 실측 후 조정) */
const RATE_LIMIT_PER_HOUR = 60;

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api/v1/runs' && request.method === 'POST') {
      return handleUpload(request, env);
    }

    if (url.pathname === '/api/health') {
      return json({ ok: true });
    }

    // API가 아닌 경로 — 정적 자산 계층으로 되돌린다.
    // (여기 왔다는 건 매칭되는 파일이 없었다는 뜻이므로 보통 404.html이 나간다)
    if (!url.pathname.startsWith('/api/')) {
      return env.ASSETS.fetch(request);
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
