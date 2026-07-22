<script lang="ts">
  import { page } from '$app/state';
  import { base } from '$app/paths';
</script>

<svelte:head>
  <title>{page.status} — G-타워디펜스</title>
</svelte:head>

<div class="error-page">
  <p class="status">{page.status}</p>
  <h1>{page.status === 404 ? '페이지를 찾을 수 없습니다' : '문제가 발생했습니다'}</h1>
  <p class="detail">{page.error?.message ?? ''}</p>
  <a href="{base}/">홈으로 돌아가기</a>
</div>

<style>
  .error-page {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    background: #15110c;
    color: #ece2cb;
    font-family: -apple-system, 'Noto Sans KR', sans-serif;
    text-align: center;
    padding: 24px;
  }

  .status {
    font-size: 46px;
    font-weight: 700;
    color: #e3b23e;
    font-family: 'Iowan Old Style', 'Palatino Linotype', Georgia, serif;
  }

  h1 {
    margin: 0;
    font-size: 20px;
  }

  .detail {
    color: #9d8c6f;
    font-size: 13px;
  }

  a {
    margin-top: 14px;
    color: #e3b23e;
    text-decoration: none;
    border-bottom: 1px solid #8a6a20;
    padding-bottom: 2px;
  }
</style>
