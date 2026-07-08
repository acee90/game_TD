// ───────── 부트스트랩: 입력 + 루프 ─────────
import { TILE } from './core/map';
import { Game } from './game/game';
import { render } from './render/render';
import { clearInfo, showGameOver, showInfo, sync } from './ui/ui';

const $ = (id: string) => document.getElementById(id)!;
const cv = $('cv') as HTMLCanvasElement;
const cx = cv.getContext('2d')!;

const game = new Game();
let speed = 1;
let overShown = false;

// 디버그/검증용 노출
(window as unknown as { game: Game }).game = game;

// ── 캔버스 탭: 배치 or 선택 ──
cv.addEventListener('click', ev => {
  const r = cv.getBoundingClientRect();
  const px = (ev.clientX - r.left) * cv.width / r.width;
  const py = (ev.clientY - r.top) * cv.height / r.height;
  for (const s of game.slots) {
    if (Math.abs(px - s.x) <= TILE / 2 && Math.abs(py - s.y) <= TILE / 2) {
      if (s.tower) {
        // 타워 탭 = 선택/해제
        game.sel = game.sel === s ? null : s;
      } else {
        // 빈 타일 탭 = 즉시 생산 (갓타디식: 자리 먼저, 유닛은 배치 후 공개)
        game.produceAt(s);
      }
      if (game.sel?.tower) showInfo(game, game.sel.tower);
      else clearInfo();
      sync(game);
      return;
    }
  }
  game.sel = null;
  clearInfo();
  sync(game);
});

// ── 버튼 ──
$('produce').onclick = () => { game.produce(); if (game.sel?.tower) showInfo(game, game.sel.tower); sync(game); };
$('hire').onclick = () => { game.hire(); sync(game); };
$('start').onclick = () => { game.startWave(); sync(game); };
$('mSplash').onclick = () => { game.setGodsMode('splash'); if (game.sel?.tower) showInfo(game, game.sel.tower); sync(game); };
$('mPower').onclick = () => { game.setGodsMode('power'); if (game.sel?.tower) showInfo(game, game.sel.tower); sync(game); };
for (let i = 0; i < 3; i++) {
  $('bt' + i).onclick = () => { game.chooseBoss(i); sync(game); };
  $('up' + i).onclick = () => { game.upgrade(i); if (game.sel?.tower) showInfo(game, game.sel.tower); sync(game); };
}
$('speed').onclick = () => {
  speed = speed === 1 ? 2 : speed === 2 ? 3 : 1;
  $('speed').textContent = '×' + speed;
};

// ── 단축키 ──
addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (k === 'p') { game.produce(); if (game.sel?.tower) showInfo(game, game.sel.tower); }
  else if (k === 'h') game.hire();
  else if (k === ' ') { e.preventDefault(); game.startWave(); }
  else if (k === 'q') game.setGodsMode('splash');
  else if (k === 'e') game.setGodsMode('power');
  else if (k === '1') game.chooseBoss(0);
  else if (k === '2') game.chooseBoss(1);
  else if (k === '3') game.chooseBoss(2);
  else return;
  sync(game);
});

// ── 메인 루프 ──
let last = 0;
let prevPhase = game.phase;
function frame(ts: number) {
  const dt = Math.min(0.05, (ts - last) / 1000 || 0) * speed;
  last = ts;
  if (!game.over) {
    game.update(dt);
    if (game.phase !== prevPhase) { // 웨이브 종료/시작 시 패널 동기화
      prevPhase = game.phase;
      clearInfo();
      sync(game);
    }
    render(cx, game);
    // 가벼운 상시 동기화(골드/오염)
    $('gold').textContent = String(Math.floor(game.gold));
    ($('pollbar') as HTMLElement).style.width = game.poll + '%';
  } else if (!overShown) {
    overShown = true;
    showGameOver(game);
  }
  requestAnimationFrame(frame);
}

sync(game);
clearInfo();
requestAnimationFrame(frame);
