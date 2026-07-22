// 정적 사이트 — 모든 알려진 경로를 prerender한다 (fallback에 의존하지 않는다).
// trailingSlash 'always' → 경로마다 index.html이 생겨 어떤 정적 호스팅에서도
// 직접 URL·새로고침이 동작한다 (M1 게이트).
export const prerender = true;
export const trailingSlash = 'always';
