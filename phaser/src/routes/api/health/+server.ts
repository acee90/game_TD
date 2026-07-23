// GET /api/health — 헬스체크
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const prerender = false;
export const trailingSlash = 'ignore';

export const GET: RequestHandler = () => json({ ok: true });
