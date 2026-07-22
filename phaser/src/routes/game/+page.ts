// Phaser·HUD 컴포넌트는 SSR 안전성이 보장되지 않는다 — CSR 전용 (§3.1).
// prerender는 루트 레이아웃에서 상속 — 빈 셸 HTML만 생성되고 전부 클라이언트에서 뜬다.
export const ssr = false;
