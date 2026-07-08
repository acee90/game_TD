// ───────── 캔버스 렌더 ─────────
import * as B from '../data/balance';
import { DOOR_IN, DOOR_OUT, SLOT_POS, TILE, WAYPOINTS, pathPos } from '../core/map';
import type { Game } from '../game/game';

void SLOT_POS; // (slots는 game.slots 사용)

function rr(cx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  cx.beginPath();
  cx.moveTo(x + r, y);
  cx.arcTo(x + w, y, x + w, y + h, r);
  cx.arcTo(x + w, y + h, x, y + h, r);
  cx.arcTo(x, y + h, x, y, r);
  cx.arcTo(x, y, x + w, y, r);
  cx.closePath();
}

export function render(cx: CanvasRenderingContext2D, g: Game): void {
  const cv = cx.canvas;
  cx.clearRect(0, 0, cv.width, cv.height);

  // 루프 경로
  cx.strokeStyle = '#232a44'; cx.lineWidth = 26; cx.lineJoin = 'round';
  cx.beginPath();
  cx.moveTo(WAYPOINTS[0][0], WAYPOINTS[0][1]);
  for (let i = 1; i < WAYPOINTS.length; i++) cx.lineTo(WAYPOINTS[i][0], WAYPOINTS[i][1]);
  cx.stroke();
  cx.strokeStyle = '#3a4468'; cx.lineWidth = 2; cx.setLineDash([6, 8]);
  cx.beginPath();
  cx.moveTo(WAYPOINTS[0][0], WAYPOINTS[0][1]);
  for (let i = 1; i < WAYPOINTS.length; i++) cx.lineTo(WAYPOINTS[i][0], WAYPOINTS[i][1]);
  cx.stroke();
  cx.setLineDash([]);

  // 입/출구 문 (분리)
  cx.fillStyle = '#3a4468';
  cx.beginPath(); cx.arc(DOOR_IN[0], DOOR_IN[1], 8, 0, 7); cx.fill();
  cx.fillStyle = g.poll > 60 ? '#ff5a3c' : '#5a4a8a';
  cx.beginPath(); cx.arc(DOOR_OUT[0], DOOR_OUT[1], 8, 0, 7); cx.fill();
  cx.fillStyle = '#8a8fa8'; cx.font = '9px sans-serif'; cx.textAlign = 'center';
  cx.fillText('입구', DOOR_IN[0], DOOR_IN[1] - 12);
  cx.fillStyle = g.poll > 60 ? '#ff5a3c' : '#8a8fa8';
  cx.fillText('출구(누출)', DOOR_OUT[0] + 6, DOOR_OUT[1] + 20);

  // 타일 + 타워
  for (const s of g.slots) {
    const seld = g.sel === s;
    cx.fillStyle = '#141a2c';
    cx.strokeStyle = seld ? '#ffd23f' : '#2a3150';
    cx.lineWidth = seld ? 2.5 : 1.2;
    rr(cx, s.x - TILE / 2, s.y - TILE / 2, TILE, TILE, 7);
    cx.fill(); cx.stroke();
    const t = s.tower;
    if (!t) {
      // 빈 타일 = 탭하면 생산 (골드 충분 시 금색 + 표시)
      cx.fillStyle = g.gold >= B.PRODUCE_COST ? 'rgba(255,210,63,.55)' : 'rgba(138,143,168,.25)';
      cx.font = '16px sans-serif'; cx.textAlign = 'center';
      cx.fillText('+', s.x, s.y + 5);
      continue;
    }
    if (seld) {
      cx.strokeStyle = 'rgba(255,210,63,.28)'; cx.lineWidth = 1;
      cx.beginPath(); cx.arc(s.x, s.y, g.trng(t), 0, 7); cx.stroke();
    }
    // 정령 감속 오라 (상시 표시)
    if (g.isSpirit(t)) {
      cx.fillStyle = 'rgba(111,220,140,.07)';
      cx.beginPath(); cx.arc(s.x, s.y, g.trng(t), 0, 7); cx.fill();
      cx.strokeStyle = 'rgba(111,220,140,.35)'; cx.lineWidth = 1;
      cx.beginPath(); cx.arc(s.x, s.y, g.trng(t), 0, 7); cx.stroke();
    }
    cx.fillStyle = B.RCOL[t.race];
    rr(cx, s.x - 15, s.y - 15, 30, 30, 6); cx.fill();
    // 모드 링은 갓 전용 (광역=청/단일=주황) — 하위 티어는 종족 정체성 고정
    if (t.tier === B.GOD_TIER) {
      cx.strokeStyle = t.mode === 'splash' ? '#55c8ff' : '#ff8a3c'; cx.lineWidth = 3;
      cx.beginPath(); cx.arc(s.x, s.y, 17, 0, 7); cx.stroke();
    }
    cx.fillStyle = '#0e1220'; cx.font = 'bold 11px sans-serif'; cx.textAlign = 'center';
    cx.fillText(t.tier === B.GOD_TIER ? '갓' : 'L' + (t.tier + 1), s.x, s.y + 4);
  }

  // 샷
  for (const sh of g.shots) {
    cx.globalAlpha = Math.max(0, sh.life / 0.08);
    if (sh.splash) {
      cx.strokeStyle = sh.c; cx.lineWidth = 2;
      cx.beginPath(); cx.arc(sh.tx, sh.ty, sh.splash * 0.5, 0, 7); cx.stroke();
    }
    cx.strokeStyle = sh.c; cx.lineWidth = 2;
    cx.beginPath(); cx.moveTo(sh.x, sh.y); cx.lineTo(sh.tx, sh.ty); cx.stroke();
  }
  cx.globalAlpha = 1;

  // 적
  for (const e of g.enemies) {
    const p = pathPos(e.d);
    cx.fillStyle = e.type === 'boss' ? '#ff5a3c'
      : e.type === 'swarm' ? '#7fd8ff'
      : e.type === 'heavy' ? '#ffb07a' : '#d0d4e4';
    cx.beginPath(); cx.arc(p[0], p[1], e.r, 0, 7); cx.fill();
    const w = e.r * 2, h = e.hp / e.maxhp;
    cx.fillStyle = '#000'; cx.fillRect(p[0] - w / 2, p[1] - e.r - 6, w, 3);
    cx.fillStyle = e.type === 'boss' ? '#ffd23f' : '#7CFC8A';
    cx.fillRect(p[0] - w / 2, p[1] - e.r - 6, w * h, 3);
    if (e.type === 'boss') {
      cx.fillStyle = '#fff'; cx.font = 'bold 10px sans-serif';
      cx.fillText(e.boss === 2 ? '★★' : '★', p[0], p[1] + 3);
    }
  }

  // 플로팅 텍스트
  for (const f of g.floats) {
    cx.globalAlpha = Math.max(0, f.life / 0.9);
    cx.fillStyle = f.c; cx.font = 'bold 13px sans-serif'; cx.textAlign = 'center';
    cx.fillText(f.txt, f.x, f.y);
  }
  cx.globalAlpha = 1;

  if (g.phase === 'wave') {
    cx.fillStyle = '#8a8fa8'; cx.font = '11px sans-serif'; cx.textAlign = 'left';
    cx.fillText(`남은 적 ${g.alive}`, 12, 16);
  }
}
