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
  plugins: [sveltekit()],
  define: {
    __GAME_BUILD_INFO__: JSON.stringify(buildInfo),
  },
  server: {
    port: 5199,
    fs: { allow: ['..'] }, // ../engine/src를 읽는다
  },
});
