<script lang="ts">
  // 사이트 셸 — 전역 헤더·내비게이션·푸터 (exec-plans/website-shell-tower-wiki.md §3.3)
  import type { Snippet } from 'svelte';
  import { page } from '$app/state';
  import { base } from '$app/paths';
  import './site.css';

  let { children }: { children: Snippet } = $props();

  const NAV = [
    { href: `${base}/`, label: '홈' },
    { href: `${base}/wiki`, label: 'Wiki' },
    { href: `${base}/dashboard`, label: '대시보드' },
    { href: `${base}/ranking`, label: '랭킹' },
  ] as const;

  function isCurrent(href: string): boolean {
    const path = page.url.pathname.replace(/\/$/, '') || '/';
    const target = href.replace(/\/$/, '') || '/';
    if (target === `${base}/`.replace(/\/$/, '') || target === '/') return path === target;
    return path === target || path.startsWith(`${target}/`);
  }
</script>

<div class="site">
  <header class="site-header">
    <div class="site-header-inner">
      <a class="site-logo" href="{base}/">G-타워디펜스</a>
      <nav class="site-nav" aria-label="사이트 메뉴">
        {#each NAV as item (item.href)}
          <a href={item.href} aria-current={isCurrent(item.href) ? 'page' : undefined}>
            {item.label}
          </a>
        {/each}
        <!-- /game은 전역 CSS(app.css)가 다른 세계 — 전체 로드로 격리한다 (§3.1) -->
        <a class="nav-play" href="{base}/game" data-sveltekit-reload>게임 시작</a>
      </nav>
    </div>
  </header>

  <main class="site-main">
    {@render children()}
  </main>

  <footer class="site-footer">
    <div class="site-footer-inner">
      <span>G-타워디펜스 — 브라우저 타워 디펜스</span>
      <span>기록은 이 브라우저에만 저장됩니다</span>
    </div>
  </footer>
</div>
