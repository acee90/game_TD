import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// 엔진 단일 원본 — 게임 로직·데이터는 web/src를 그대로 import한다 (이중화 없음).
// 나중에 monorepo(packages/engine)로 정리하더라도 이 alias만 옮기면 된다.
const engineDir = fileURLToPath(new URL('../web/src', import.meta.url));

export default defineConfig({
  resolve: {
    alias: { '@engine': engineDir },
  },
  server: {
    port: 5199,
    fs: { allow: ['..'] }, // ../web/src를 읽는다
  },
});
