<script lang="ts">
  // ───────── 타워 티어 숫자 배지 (캔버스 밖 DOM 오버레이) ─────────
  // 티어 숫자를 Phaser 월드 텍스트로 그리면 캔버스가 CSS로 축소될 때 같이 작아져 안 보인다
  // (2026-07-23 사용자 지적). 그래서 캔버스 위에 DOM 배지를 얹고 clamp()로 최소 폰트를 보장한다.
  // 슬롯은 고정 좌표라 퍼센트 배치만으로 캔버스와 정확히 겹친다 — 프레임별 투영 계산이 필요 없다.
  import { GOD_TIER } from '@engine/data/units';
  import type { Game } from '@engine/game/game';

  interface Props {
    game: Game;
    /** 매 프레임 증가 — 타워 배치/합성/판매를 반영해 배지를 다시 그린다 */
    tick: number;
  }
  let { game, tick }: Props = $props();

  // BattleScene 카메라와 짝을 이룬다: 840×940 캔버스를 zoom 2로 보므로 월드 가시영역 = 420×470,
  // 월드 (0,0)이 캔버스 좌상단. 게임 보드 호스트도 같은 4:? 비율(aspect-ratio 420/470)이라
  // 캔버스가 레터박스 없이 꽉 차므로, 슬롯 좌표를 이 크기로 나눈 퍼센트가 곧 화면 위치다.
  const WORLD_W = 420;
  const WORLD_H = 470;

  interface Badge {
    key: string;
    left: number;
    top: number;
    text: string;
    god: boolean;
  }

  const badges = $derived.by<Badge[]>(() => {
    tick; // 프레임마다 재계산 (타워 상태 변화 반영)
    const altar = game.altarSlot;
    const out: Badge[] = [];
    game.slots.forEach((slot, i) => {
      const tower = slot.tower;
      if (!tower || slot === altar) return;
      const god = tower.tier === GOD_TIER;
      out.push({
        key: String(i),
        left: (slot.x / WORLD_W) * 100,
        top: (slot.y / WORLD_H) * 100,
        text: god ? 'G' : String(tower.tier + 1),
        god,
      });
    });
    return out;
  });
</script>

<!-- 순수 장식·정보 중복(캔버스 타워와 같은 정보)이라 스크린리더에서 숨긴다 -->
<div class="tower-badges" aria-hidden="true">
  {#each badges as b (b.key)}
    <span class="tower-badge" class:god={b.god} style="left:{b.left}%; top:{b.top}%">{b.text}</span>
  {/each}
</div>

<style>
  .tower-badges {
    position: absolute;
    inset: 0;
    pointer-events: none; /* 클릭은 캔버스로 통과 */
    container-type: inline-size; /* cqi = 보드 표시폭의 1% */
    overflow: hidden;
  }

  .tower-badge {
    position: absolute;
    /* 머리 위 → 몸 하단 반투명 겹침 (2026-07-24, 유닛 스케일업과 세트):
       머리 위 배지가 유닛 크기를 제약해서, 숫자를 다리 쪽에 겹쳐 그리고
       유닛을 키웠다. -20% = 텍스트 중심이 슬롯 중심 약간 아래(하반신) —
       얼굴·상체는 가리지 않는다. */
    transform: translate(-50%, -20%);
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 1em;
    height: 1em;
    padding: 0;
    box-sizing: border-box;
    /* 캔버스가 작아져도 최소 10px 유지, 커지면 보드폭에 비례 */
    font: 700 clamp(10px, 3.3cqi, 15px) / 1 system-ui, -apple-system, 'Noto Sans KR', sans-serif;
    color: #f5ecd6;
    opacity: 0.72; /* 유닛 도트가 숫자 뒤로 비쳐 보이는 반투명 */
    background: transparent;
    border: 0;
    box-shadow: none;
    /* 스프라이트 위에 겹치므로 어두운 외곽으로 가독성을 지킨다 */
    text-shadow:
      0 0 3px rgba(0, 0, 0, 0.85),
      0 1px 1.5px rgba(0, 0, 0, 0.9);
  }

  /* GOD은 금빛 + 옅은 후광으로 격을 구분한다 */
  .tower-badge.god {
    color: #ffdf7a;
    text-shadow:
      0 0 4px rgba(255, 200, 90, 0.55),
      0 1px 1.5px rgba(0, 0, 0, 0.7);
  }
</style>
