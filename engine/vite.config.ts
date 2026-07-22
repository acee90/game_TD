import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

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
  // 프로토 앱 은퇴 후 이 define은 vitest·vite-node에서만 쓰인다. 'web'은 과거 로그와의 호환 표기.
  target: 'web',
  appVersion: packageJson.version,
  engineVersion: `vite-${packageJson.devDependencies?.vite ?? 'unknown'}`,
  dirty: git(['status', '--porcelain'], '') !== '',
} as const;

export default defineConfig({
  plugins: [svelte()],
  define: {
    __GAME_BUILD_INFO__: JSON.stringify(buildInfo),
  },
});
