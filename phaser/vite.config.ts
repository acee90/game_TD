import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// 런 로깅용 빌드 정보 — engine/vite.config.ts와 같은 형태, target만 'phaser'.
// 빠뜨리면 런 로그의 빌드 정보가 조용히 깨진다 (M1 게이트 항목).
const repositoryDirectory = fileURLToPath(new URL('..', import.meta.url));
const packageJson = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
) as { version: string; devDependencies?: Record<string, string> };

function git(args: readonly string[], fallback = 'unknown'): string {
  try {
    return execFileSync('git', [...args], {
      cwd: repositoryDirectory,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim() || fallback;
  } catch {
    return fallback;
  }
}

const buildInfo = {
  gitSha: process.env.GITHUB_SHA ?? git(['rev-parse', 'HEAD']),
  branch: process.env.GITHUB_REF_NAME ?? git(['branch', '--show-current']),
  builtAt: new Date().toISOString(),
  target: 'phaser',
  appVersion: packageJson.version,
  engineVersion: `phaser-${packageJson.version}`,
  dirty: git(['status', '--porcelain'], '') !== '',
} as const;

export default defineConfig({
  // tailwindcss는 sveltekit보다 앞에 둔다 (daisyUI 스타일이 사이트 셸에만 실린다)
  plugins: [tailwindcss(), sveltekit()],
  define: {
    __GAME_BUILD_INFO__: JSON.stringify(buildInfo),
  },
  server: {
    port: 5199,
    fs: { allow: ['..'] }, // ../engine/src를 읽는다
    // ── 개발 방식 두 가지 ──
    //  ① 통합(권장): 루트에서 `npm run dev` → wrangler dev 하나가 localhost:8787에서
    //     사이트+API를 함께 서빙한다(프로덕션과 동일, build 산출물 서빙이라 HMR 없음).
    //  ② UI HMR: 이 vite dev(5199) + 루트에서 `npm run dev:api`(wrangler, 8787).
    //     vite는 API Worker를 모르므로 아래 프록시가 /api를 8787로 넘긴다.
    //     사이트 코드는 즉시 반영되지만 API용 wrangler를 함께 띄워야 한다.
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
    },
  },
});
