// ───────── 부트스트랩: 입력 + 루프 ─────────
import { TILE } from './core/map';
import type { Race } from './data/units';
import { Game } from './game/game';
import { render } from './render/render';
import { bindElements, refresh } from './ui/ui';

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
el.buyXp.addEventListener('click', () => game.buyXp());
el.reroll.addEventListener('click', () => game.rerollAugments());
el.gasSkillDmg.addEventListener('click', () => game.buyGasSkill('damage'));
el.gasSkillCdr.addEventListener('click', () => game.buyGasSkill('cdr'));
el.bossLevels.forEach((button, i) => button.addEventListener('click', () => game.summonBoss(i + 1)));
el.upgrades.forEach((button, i) => button.addEventListener('click', () => game.upgrade(i as Race)));
el.augCards.addEventListener('click', (event) => {
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
window.addEventListener('keydown', (event) => KEYS[event.key.toLowerCase()]?.());

let last = performance.now();
function frame(now: number): void {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  game.update(dt);
  render(ctx!, game);
  refresh(el, game);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
