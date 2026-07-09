// ───────── 부트스트랩: 타입 선택 → 입력 + 루프 ─────────
import { TILE } from './core/map';
import type { Race } from './data/units';
import { HERO_CLASS_IDS, HERO_CLASSES } from './data/hero-class';
import { SKILLS } from './data/skills';
import { Game } from './game/game';
import { render } from './render/render';
import { bindElements, refresh } from './ui/ui';

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d');
if (!ctx) throw new Error('2d context unavailable');

let game: Game | undefined;
const el = bindElements();

// ── 시작: 영웅 타입을 골라야 게임이 만들어진다 ──
const classOverlay = document.getElementById('classOverlay') as HTMLElement;
const classCards = document.getElementById('classCards') as HTMLElement;
classCards.innerHTML = HERO_CLASS_IDS.map((id) => {
  const k = HERO_CLASSES[id];
  const skills = k.skills.map((sid) => SKILLS[sid].name).join(' · ');
  const hint = [
    k.hpMult !== 1 ? `체력 ×${k.hpMult}` : null,
    k.damageMult !== 1 ? `공격 ×${k.damageMult}` : null,
    k.rangeMult !== 1 ? `사거리 ×${k.rangeMult}` : null,
    k.attackSpeedMult !== 1 ? `공속 ×${k.attackSpeedMult}` : null,
  ].filter(Boolean).join(' · ');
  return `<button class="augcard" data-class="${id}">
    <div class="n">${k.name}</div>
    <div class="d">${k.blurb}</div>
    <div class="d" style="margin-top:4px">${hint}</div>
    <div class="d" style="margin-top:2px">배울 수 있는 스킬 — ${skills}</div>
  </button>`;
}).join('');
classCards.addEventListener('click', (event) => {
  const card = (event.target as HTMLElement).closest<HTMLElement>('.augcard');
  const id = card?.dataset.class as (typeof HERO_CLASS_IDS)[number] | undefined;
  if (!id || game) return;
  game = new Game(Math.random, id);
  classOverlay.style.display = 'none';
});

// ── 캔버스 클릭 → 슬롯 선택 / 유닛 생성 ──
canvas.addEventListener('pointerdown', (event) => {
  const rect = canvas.getBoundingClientRect();
  const scale = canvas.width / rect.width;
  const x = (event.clientX - rect.left) * scale;
  const y = (event.clientY - rect.top) * scale;

  if (!game) return;
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

el.spawn.addEventListener('click', () => game?.spawnUnitAnywhere());
el.probe.addEventListener('click', () => game?.buyProbe());
el.sell.addEventListener('click', () => game?.sellSelected());
el.heroUp.addEventListener('click', () => game?.upgradeHero());
el.bossLevels.forEach((button, i) => button.addEventListener('click', () => game?.summonBoss(i + 1)));
el.upgrades.forEach((button, i) => button.addEventListener('click', () => game?.upgrade(i as Race)));
el.augCards.addEventListener('click', (event) => {
  const card = (event.target as HTMLElement).closest<HTMLElement>('.augcard');
  if (card?.dataset.index) game?.chooseAugment(Number(card.dataset.index));
});

const KEYS: Record<string, () => void> = {
  p: () => game?.spawnUnitAnywhere(),
  b: () => game?.summonBoss(),
  r: () => game?.buyProbe(),
  x: () => game?.sellSelected(),
  u: () => game?.upgradeHero(),
  '1': () => game?.upgrade(0),
  '2': () => game?.upgrade(1),
  '3': () => game?.upgrade(2),
  '4': () => game?.upgrade(3),
};
window.addEventListener('keydown', (event) => KEYS[event.key.toLowerCase()]?.());

let last = performance.now();
function frame(now: number): void {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  if (game) {
    game.update(dt);
    render(ctx!, game);
    refresh(el, game);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
