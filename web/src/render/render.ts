// ───────── 캔버스 렌더 ─────────
import { CROSS_BARS, DOOR_IN, DOOR_OUT, NEXUS, TILE, WAYPOINTS, pathPos } from '../core/map';
import { BOSS_COOLDOWN_SECONDS } from '../data/balance';
import { HERO_RADIUS } from '../data/hero';
import { GOD_TIER, RACE_COLOR } from '../data/units';
import { range } from '../game/combat';
import type { Game } from '../game/game';
import type { Enemy, Slot } from '../game/types';

const PATH_WIDTH = 24;

function strokePath(ctx: CanvasRenderingContext2D, width: number, color: string): void {
  ctx.beginPath();
  ctx.moveTo(WAYPOINTS[0][0], WAYPOINTS[0][1]);
  for (let i = 1; i < WAYPOINTS.length; i++) ctx.lineTo(WAYPOINTS[i][0], WAYPOINTS[i][1]);
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'butt';
  ctx.strokeStyle = color;
  ctx.stroke();
}

function drawCross(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = '#1a2036';
  ctx.strokeStyle = '#39406a';
  ctx.lineWidth = 1.5;
  for (const bar of CROSS_BARS) {
    ctx.fillRect(bar.x, bar.y, bar.w, bar.h);
    ctx.strokeRect(bar.x, bar.y, bar.w, bar.h);
  }
}

function drawDoors(ctx: CanvasRenderingContext2D): void {
  ctx.font = '600 10px system-ui, sans-serif';
  ctx.textAlign = 'center';

  ctx.fillStyle = '#8a6fd0';
  ctx.fillRect(DOOR_IN[0] - PATH_WIDTH / 2, DOOR_IN[1] + 6, PATH_WIDTH, 5);
  ctx.fillText('입구', DOOR_IN[0], DOOR_IN[1] + 2);

  ctx.fillStyle = '#ff5a3c';
  ctx.fillRect(DOOR_OUT[0] - PATH_WIDTH / 2, DOOR_OUT[1] + 6, PATH_WIDTH, 5);
  ctx.fillText('출구', DOOR_OUT[0], DOOR_OUT[1] + 2);
}

function drawNexus(ctx: CanvasRenderingContext2D, game: Game): void {
  const [x, y] = NEXUS;
  if (game.bossCooldown <= 0) return;
  // 쿨타임 링은 교전 중에도 계속 찬다 — 소환을 막는 건 쿨타임뿐이다.
  ctx.beginPath();
  const progress = 1 - game.bossCooldown / BOSS_COOLDOWN_SECONDS;
  ctx.arc(x, y, TILE / 2 + 5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
  ctx.strokeStyle = '#ff8a3c';
  ctx.lineWidth = 3;
  ctx.stroke();
}

function drawSlot(ctx: CanvasRenderingContext2D, slot: Slot, selected: boolean): void {
  const half = TILE / 2 - 2;
  ctx.lineWidth = 1;
  ctx.strokeStyle = selected ? '#ffd23f' : '#39406a';
  ctx.fillStyle = slot.tower ? '#232a44' : 'rgba(20,26,44,.7)';
  ctx.beginPath();
  ctx.roundRect(slot.x - half, slot.y - half, half * 2, half * 2, 5);
  ctx.fill();
  ctx.stroke();

  const tower = slot.tower;
  if (!tower) return;

  if (selected) {
    ctx.beginPath();
    ctx.arc(slot.x, slot.y, range(tower), 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,210,63,.28)';
    ctx.stroke();
  }

  const isGod = tower.tier === GOD_TIER;
  ctx.beginPath();
  ctx.arc(slot.x, slot.y, isGod ? 12 : 7 + tower.tier, 0, Math.PI * 2);
  ctx.fillStyle = RACE_COLOR[tower.def.race];
  ctx.fill();
  if (isGod) {
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ffd23f';
    ctx.stroke();
  }

  ctx.fillStyle = '#0e1220';
  ctx.font = '700 9px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(isGod ? 'G' : String(tower.tier + 1), slot.x, slot.y);
  ctx.textBaseline = 'alphabetic';
}

function drawEnemy(ctx: CanvasRenderingContext2D, x: number, y: number, e: Enemy): void {
  const color = e.kind === 'boss' ? '#ff5a3c' : '#9aa2c0';
  ctx.beginPath();
  ctx.arc(x, y, e.radius, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();

  const w = e.radius * 2;
  ctx.fillStyle = '#0a0e19';
  ctx.fillRect(x - e.radius, y - e.radius - 6, w, 3);
  ctx.fillStyle = '#6fdc8c';
  ctx.fillRect(x - e.radius, y - e.radius - 6, w * Math.max(0, e.hp / e.maxHp), 3);
}

function drawAltar(ctx: CanvasRenderingContext2D, game: Game): void {
  if (!game.hero) return;
  const { x, y } = game.altarSlot;
  const half = TILE / 2 - 2;

  ctx.fillStyle = '#2a2140';
  ctx.strokeStyle = '#b08cff';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(x - half, y - half, half * 2, half * 2, 5);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#b08cff';
  ctx.font = '700 9px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('제단', x, y);
  ctx.textBaseline = 'alphabetic';
}

function drawHero(ctx: CanvasRenderingContext2D, game: Game): void {
  const hero = game.hero;
  if (!hero) return;

  if (!hero.alive) {
    const [ax, ay] = pathPos(hero.altarDistance);
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    ctx.arc(ax, ay, HERO_RADIUS, 0, Math.PI * 2);
    ctx.strokeStyle = '#b08cff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.globalAlpha = 1;
    return;
  }

  const x = hero.x;
  const y = hero.y;

  const stats = hero.stats;

  // 목적지 표시 (경로 위)
  if (Math.abs(hero.targetDistance - hero.distance) > 3) {
    const [tx, ty] = pathPos(hero.targetDistance);
    ctx.beginPath();
    ctx.arc(tx, ty, 4, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(176,140,255,.5)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.arc(x, y, stats.range, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(176,140,255,.14)';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(x, y, HERO_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = '#b08cff';
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  const width = HERO_RADIUS * 2.4;
  ctx.fillStyle = '#0a0e19';
  ctx.fillRect(x - width / 2, y - HERO_RADIUS - 8, width, 3);
  ctx.fillStyle = '#6fdc8c';
  ctx.fillRect(x - width / 2, y - HERO_RADIUS - 8, width * Math.max(0, hero.hp / stats.maxHp), 3);

  ctx.fillStyle = '#0e1220';
  ctx.font = '700 9px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(hero.level), x, y);
  ctx.textBaseline = 'alphabetic';
}

export function render(ctx: CanvasRenderingContext2D, game: Game): void {
  const { canvas } = ctx;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  strokePath(ctx, PATH_WIDTH + 4, '#333c66');
  strokePath(ctx, PATH_WIDTH, '#171d33');
  drawCross(ctx);
  drawDoors(ctx);
  drawNexus(ctx, game);

  for (const slot of game.slots) {
    if (game.hero && slot === game.altarSlot) continue;
    drawSlot(ctx, slot, slot === game.selected);
  }
  drawAltar(ctx, game);

  for (const shot of game.shots) {
    if (shot.splashRadius) {
      ctx.beginPath();
      ctx.arc(shot.tx, shot.ty, shot.splashRadius * 0.28, 0, Math.PI * 2);
      ctx.fillStyle = shot.color + '33';
      ctx.fill();
    }
    ctx.beginPath();
    ctx.moveTo(shot.x, shot.y);
    ctx.lineTo(shot.tx, shot.ty);
    ctx.strokeStyle = shot.color;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  for (const enemy of game.enemies) {
    const [x, y] = pathPos(enemy.distance);
    drawEnemy(ctx, x, y, enemy);
  }
  drawHero(ctx, game);

  ctx.font = '700 11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  for (const f of game.floats) {
    ctx.globalAlpha = Math.min(1, f.life / 0.5);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y);
    ctx.globalAlpha = 1;
  }
}
