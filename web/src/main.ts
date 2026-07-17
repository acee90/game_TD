// ───────── 부트스트랩: 입력 + 루프 ─────────
import { TILE } from './core/map';
import type { Race } from './data/units';
import { Game } from './game/game';
import { render } from './render/render';
import { augmentInputLocked, bindElements, refresh } from './ui/ui';

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d');
if (!ctx) throw new Error('2d context unavailable');

const game = new Game();
const el = bindElements();

// ── 캔버스 클릭 → 슬롯 선택 / 유닛 생성 ──
canvas.addEventListener('pointerdown', (event) => {
  const rect = canvas.getBoundingClientRect();
  const scale = canvas.width / rect.width;
  const x = (event.clientX - rect.left) * scale;
  const y = (event.clientY - rect.top) * scale;

  // 몹/보스를 찍으면 스탯을 본다 (타일보다 먼저 — 몹은 타일 위를 지나간다)
  const enemy = game.enemyAt(x, y);
  if (enemy) {
    game.selectedEnemy = enemy;
    game.selected = null;
    return;
  }
  game.selectedEnemy = null;

  const hit = game.slots.find(
    (slot) => Math.abs(slot.x - x) <= TILE / 2 && Math.abs(slot.y - y) <= TILE / 2,
  );
  if (!hit) {
    // 타일 밖을 찍으면 영웅이 그리로 걸어간다
    game.selected = null;
    game.moveHero(x, y);
    return;
  }
  if (hit === game.altarSlot) {
    game.moveHero(x, y);
    return;
  }
  if (hit.tower) game.selected = hit;
  else game.spawnUnit(hit);
});

el.spawn.addEventListener('click', () => game.spawnUnitAnywhere());
el.probe.addEventListener('click', () => game.buyProbe());
el.sell.addEventListener('click', () => game.sellSelected());
el.copyTower.addEventListener('click', () => {
  // 예약돼 있으면 취소, 아니면 선택한 타워를 예약한다
  const target = game.copyTarget ?? game.selected;
  if (target) game.markCopyTarget(target);
});
el.buyXp.addEventListener('click', () => game.buyXp());
el.reroll.addEventListener('click', () => {
  if (augmentInputLocked()) return; // F1 — 등장 직후 1초 오클릭 방지
  game.rerollAugments();
});
el.gasSkillDmg.addEventListener('click', () => game.buyGasSkill('damage'));
el.gasSkillCdr.addEventListener('click', () => game.buyGasSkill('cdr'));
// 보스 소환은 1-depth — 버튼을 누르면 소환 가능한 최고 레벨을 바로 부른다(레벨 선택 없음)
el.bossGrid.addEventListener('click', (event) => {
  const btn = (event.target as HTMLElement).closest<HTMLElement>('.bossbtn');
  if (btn?.dataset.level) game.summonBoss(Number(btn.dataset.level));
});
el.upgrades.forEach((button, i) => button.addEventListener('click', () => game.upgrade(i as Race)));
el.augCards.addEventListener('click', (event) => {
  if (augmentInputLocked()) return; // F1 — pointer-events만 믿지 않고 재검사
  const card = (event.target as HTMLElement).closest<HTMLElement>('.augcard');
  if (card?.dataset.index) game.chooseAugment(Number(card.dataset.index));
});

const KEYS: Record<string, () => void> = {
  p: () => game.spawnUnitAnywhere(),
  b: () => game.summonBoss(),
  r: () => game.buyProbe(),
  x: () => game.sellSelected(),
  e: () => game.buyXp(),
  '1': () => game.upgrade(0),
  '2': () => game.upgrade(1),
  '3': () => game.upgrade(2),
  '4': () => game.upgrade(3),
};
window.addEventListener('keydown', (event) => {
  KEYS[event.key.toLowerCase()]?.();
});

// ── 게임 시작 게이트 — 첫 클릭 전에는 시간이 흐르지 않는다 (보드는 미리 보여준다) ──
let started = false;
const startOverlay = document.getElementById('startOverlay') as HTMLElement;
document.getElementById('startBtn')!.addEventListener('click', () => {
  started = true;
  startOverlay.style.display = 'none';
  last = performance.now(); // 게이트에 머문 시간이 첫 프레임 dt로 새지 않게
});
// 다시 시작 — 전체 리로드가 가장 확실한 리셋이다 (게임오버 '다시 도전'과 동일 경로)
document.getElementById('restart')!.addEventListener('click', () => {
  if (window.confirm('처음부터 다시 시작할까요?')) location.reload();
});

let last = performance.now();
function frame(now: number): void {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  if (started) game.update(dt);
  render(ctx!, game);
  refresh(el, game);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
