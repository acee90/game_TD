<script lang="ts">
  let { onClose, onRestart }: { onClose: () => void; onRestart: () => void } = $props();

  function onBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) onClose(); // 바깥을 누르면 닫힌다 (게임 재개)
  }
</script>

<div id="menuOverlay" role="presentation" onclick={onBackdrop}>
  <div class="modal">
    <h2>메뉴</h2>
    <p class="dim" style="text-align:center">일시정지 중 — 닫으면 이어서 진행됩니다</p>

    <p class="note" style="margin-top:0">
      몹은 북측 왼쪽 입구에서 나와 십자 외곽선을 반시계로 한 바퀴 돌고 북측 오른쪽 출구로 나간다.<br>
      보스는 라운드와 무관하게 <b>보스 소환</b> 버튼으로 언제든 부른다.<br>
      빈 곳을 클릭하면 영웅이 이동한다. 타일을 클릭하면 유닛 생성/선택.<br>
      스킬은 자동 시전 — 어떤 스킬을 들고 어떻게 개조할지만 고른다.<br>
      단축키 — P 생성 · B 보스 소환 · R 광부 · X 처분 · E XP 구매 · 1234 업그레이드
    </p>

    <button id="menuRestart" onclick={onRestart}>↻ 다시 시작</button>
    <button id="menuClose" onclick={onClose}>닫기 (Esc)</button>
  </div>
</div>
