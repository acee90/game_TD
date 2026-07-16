// ───────── 캔버스 렌더 ─────────
import { pathPosOffset, CROSS_BARS, DOOR_IN, DOOR_OUT, NEXUS, TILE, WAYPOINTS, pathPos } from '../core/map';
import { BOSS_COOLDOWN_SECONDS, MOB_LANE_OFFSET } from '../data/balance';
import { HERO_RADIUS } from '../data/hero';
import { GOD_TIER, RACE_COLOR } from '../data/units';
import { range } from '../game/combat';
import type { Game } from '../game/game';
import type { Enemy, Slot } from '../game/types';

const PATH_WIDTH = 36; // 2열 레인 (±8px) 수용

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
  ctx.fillStyle = '#211a12';
  ctx.strokeStyle = '#4d3d28';
  ctx.lineWidth = 1.5;
  for (const bar of CROSS_BARS) {
    ctx.fillRect(bar.x, bar.y, bar.w, bar.h);
    ctx.strokeRect(bar.x, bar.y, bar.w, bar.h);
  }
}

function drawDoors(ctx: CanvasRenderingContext2D): void {
  ctx.font = '600 10px system-ui, sans-serif';
  ctx.textAlign = 'center';

  ctx.fillStyle = '#7d5a8c';
  ctx.fillRect(DOOR_IN[0] - PATH_WIDTH / 2, DOOR_IN[1] + 6, PATH_WIDTH, 5);
  ctx.fillText('입구', DOOR_IN[0], DOOR_IN[1] + 2);

  ctx.fillStyle = '#c14a2c';
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
  ctx.strokeStyle = '#e3b23e';
  ctx.lineWidth = 3;
  ctx.stroke();
}

function drawSlot(ctx: CanvasRenderingContext2D, slot: Slot, selected: boolean): void {
  const half = TILE / 2 - 2;
  ctx.lineWidth = 1;
  ctx.strokeStyle = selected ? '#e3b23e' : '#4d3d28';
  ctx.fillStyle = slot.tower ? '#31271a' : 'rgba(36,29,20,.72)';
  ctx.beginPath();
  ctx.roundRect(slot.x - half, slot.y - half, half * 2, half * 2, 5);
  ctx.fill();
  ctx.stroke();

  const tower = slot.tower;
  if (!tower) return;

  if (selected) {
    ctx.beginPath();
    ctx.arc(slot.x, slot.y, range(tower), 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(227,178,62,.28)';
    ctx.stroke();
  }

  const isGod = tower.tier === GOD_TIER;
  ctx.beginPath();
  ctx.arc(slot.x, slot.y, isGod ? 12 : 7 + tower.tier, 0, Math.PI * 2);
  ctx.fillStyle = RACE_COLOR[tower.def.race];
  ctx.fill();
  if (isGod) {
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#e3b23e';
    ctx.stroke();
  }

  ctx.fillStyle = '#1a130a';
  ctx.font = '700 9px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(isGod ? 'G' : String(tower.tier + 1), slot.x, slot.y);
  ctx.textBaseline = 'alphabetic';
}

function drawEnemy(ctx: CanvasRenderingContext2D, x: number, y: number, e: Enemy): void {
  const color = e.kind === 'boss' ? '#c14a2c' : (e.typeColor ?? '#a89a80');
  ctx.beginPath();
  ctx.arc(x, y, e.radius, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();

  const w = e.radius * 2;
  ctx.fillStyle = '#0d0a06';
  ctx.fillRect(x - e.radius, y - e.radius - 6, w, 3);
  ctx.fillStyle = '#8a9a5b';
  ctx.fillRect(x - e.radius, y - e.radius - 6, w * Math.max(0, e.hp / e.maxHp), 3);
}

function drawAltar(ctx: CanvasRenderingContext2D, game: Game): void {
  if (!game.hero) return;
  const { x, y } = game.altarSlot;
  const half = TILE / 2 - 2;

  ctx.fillStyle = '#2a2036';
  ctx.strokeStyle = '#8a6ea6';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(x - half, y - half, half * 2, half * 2, 5);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#b89ad8';
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
    ctx.strokeStyle = '#cbd2dd';
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
    ctx.strokeStyle = 'rgba(203,210,221,.5)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.arc(x, y, stats.range, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(203,210,221,.16)';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(x, y, HERO_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = '#cdd3dc';
  ctx.fill();
  ctx.strokeStyle = '#f4efe0';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  const width = HERO_RADIUS * 2.4;
  ctx.fillStyle = '#0d0a06';
  ctx.fillRect(x - width / 2, y - HERO_RADIUS - 8, width, 3);
  ctx.fillStyle = '#8a9a5b';
  ctx.fillRect(x - width / 2, y - HERO_RADIUS - 8, width * Math.max(0, hero.hp / stats.maxHp), 3);

  ctx.fillStyle = '#1a130a';
  ctx.font = '700 9px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(hero.level), x, y);
  ctx.textBaseline = 'alphabetic';
}

/** 장판 — 불바다(주황)와 빙판(하늘). 바닥에 깔리므로 몹·타워 밑에 그린다. */
function drawZones(ctx: CanvasRenderingContext2D, game: Game): void {
  for (const zone of game.zones) {
    // 꺼져갈수록 옅어진다
    const fade = Math.min(1, zone.remaining / 1.5);
    ctx.globalAlpha = 0.18 * fade;
    ctx.beginPath();
    ctx.arc(zone.x, zone.y, zone.radius, 0, Math.PI * 2);
    ctx.fillStyle = zone.color;
    ctx.fill();
    ctx.globalAlpha = 0.5 * fade;
    ctx.strokeStyle = zone.color;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

function drawDecoy(ctx: CanvasRenderingContext2D, game: Game): void {
  const decoy = game.decoy;
  if (!decoy) return;
  const [x, y] = pathPos(decoy.distance);

  ctx.beginPath();
  ctx.arc(x, y, 9, 0, Math.PI * 2);
  ctx.fillStyle = '#d97a2e';
  ctx.fill();
  ctx.strokeStyle = decoy.taunts ? '#e3b23e' : '#1a130a';
  ctx.lineWidth = 2;
  ctx.stroke();

  const width = 22;
  ctx.fillStyle = '#0d0a06';
  ctx.fillRect(x - width / 2, y - 16, width, 3);
  ctx.fillStyle = '#d97a2e';
  ctx.fillRect(x - width / 2, y - 16, width * Math.max(0, decoy.hp / decoy.maxHp), 3);
}

export function render(ctx: CanvasRenderingContext2D, game: Game): void {
  const { canvas } = ctx;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  strokePath(ctx, PATH_WIDTH + 4, '#46392a');
  strokePath(ctx, PATH_WIDTH, '#241c12');
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

  // 장판은 바닥이다 — 몹보다 먼저 그린다
  drawZones(ctx, game);

  for (const enemy of game.enemies) {
    const [x, y] = pathPosOffset(enemy.distance, (enemy.lane ?? 0) * MOB_LANE_OFFSET);
    drawEnemy(ctx, x, y, enemy);

    // 클릭해서 들여다보는 중인 몹에 표식
    if (enemy === game.selectedEnemy) {
      ctx.beginPath();
      ctx.arc(x, y, enemy.radius + 5, 0, Math.PI * 2);
      ctx.strokeStyle = '#e3b23e';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    // 화상 중이면 테두리를 불색으로
    if (enemy.burnTimer && enemy.burnTimer > 0) {
      ctx.beginPath();
      ctx.arc(x, y, enemy.radius + 2, 0, Math.PI * 2);
      ctx.strokeStyle = '#d97a2e';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
  drawDecoy(ctx, game);
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
