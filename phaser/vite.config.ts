import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// 엔진 단일 원본 — 게임 로직·데이터는 engine/src를 그대로 import한다 (이중화 없음).
const engineDir = fileURLToPath(new URL('../engine/src', import.meta.url));

// 런 로깅용 빌드 정보 — engine/vite.config.ts와 같은 형태, target만 'phaser'
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
  // HUD도 단일 원본 — engine/src/lib의 Svelte 컴포넌트를 그대로 import한다
  plugins: [svelte()],
  define: {
    __GAME_BUILD_INFO__: JSON.stringify(buildInfo),
  },
  resolve: {
    alias: { '@engine': engineDir },
  },
  server: {
    port: 5199,
    fs: { allow: ['..'] }, // ../engine/src를 읽는다
  },
  build: {
    rollupOptions: {
      input: {
        game: fileURLToPath(new URL('./index.html', import.meta.url)),
        vfxLab: fileURLToPath(new URL('./vfx-lab.html', import.meta.url)),
        projectileVfxLab: fileURLToPath(new URL('./projectile-vfx-lab.html', import.meta.url)),
      },
    },
  },
});
