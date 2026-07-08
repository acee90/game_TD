// ───────── HUD / 패널 바인딩 ─────────
import * as B from '../data/balance';
import type { Game } from '../game/game';
import type { Tower } from '../game/types';

const $ = (id: string) => document.getElementById(id)!;

export function showInfo(g: Game, t: Tower, pending = false): void {
  const col = B.RCOL[t.race];
  const god = g.isGod(t), spirit = g.isSpirit(t), beast = g.isBeast(t);
  const modeChip = god
    ? `<span class="chip" style="background:${t.mode === 'splash' ? '#55c8ff' : '#ff8a3c'}">${t.mode === 'splash' ? '광역' : '단일'}</span>`
    : spirit
    ? `<span class="chip" style="background:#6fdc8c">감속</span>`
    : `<span class="chip" style="background:${B.RSTAT[t.race].splash ? '#55c8ff' : '#8a8fa8'}">${B.RSTAT[t.race].splash ? '광역' : '단일'}</span>`;
  const stats = spirit
    ? `사거리 ${g.trng(t).toFixed(0)} · 범위 내 적 이속 ×${B.SPIRIT_SLOW[t.tier].toFixed(2)}`
    : `공격력 ${g.tdmg(t).toFixed(0)} · 공속 ${(1 / g.atkInt(t)).toFixed(1)}/s · 사거리 ${g.trng(t).toFixed(0)} · DPS ${(g.tdmg(t) / g.atkInt(t)).toFixed(0)}`;
  const blurb = god ? '갓 — 광역↔단일 변환 가능. 웨이브 성격에 맞춰 바꾸세요.'
    : spirit ? '정령 — 공격하지 않음. 감속 오라 전담, 궤도 요지에 두면 전 타워의 실효 DPS가 오름.'
    : beast ? '야수 — 강화 불가·높은 기본기. 업 커밋 없이 즉시 밥값, 후반 자연 감쇠 → 갓 각이 보이면 매각 판단.'
    : `${B.RSTAT[t.race].blurb} · ${g.variant(t).name}형(${(t.variant ?? 0) === 0 ? '근접 고화력 — 궤도 밀착 배치' : '장거리 저화력 — 허브/외곽 요지'})`;
  $('info').innerHTML =
    `<span class="name">${g.unitName(t)} <span class="tag">${B.TNAME[t.tier]}</span></span>` +
    `<span class="chip" style="background:${col}">${B.RACE[t.race]}</span>` +
    (god ? '' : `<span class="chip" style="background:#5a6288;color:#e8e6df">${g.variant(t).name}</span>`) +
    modeChip +
    (pending ? `<span class="chip" style="background:#8a8fa8">배치 대기</span>` : '') +
    `<br><span class="tag">${stats}</span>` +
    `<br><span class="tag">${blurb}</span>` +
    (pending ? '' :
      `<div class="row c2" style="margin-top:6px">` +
      (god ? `<button id="ibToggle">${t.mode === 'splash' ? '→ 단일 전환' : '→ 광역 전환'}</button>` : '<span></span>') +
      `<button id="ibSell">판매 +${B.sellPrice(t.tier)}</button></div>`);
  const tg = document.getElementById('ibToggle');
  const sl = document.getElementById('ibSell');
  if (tg) tg.onclick = () => { g.toggleSel(); if (g.sel?.tower) showInfo(g, g.sel.tower); };
  if (sl) sl.onclick = () => { g.sellSel(); clearInfo(); sync(g); };
}

export function clearInfo(): void {
  $('info').innerHTML =
    '<span class="tag">빈 타일 탭 = 생산 40 (유닛은 배치 후 공개) · 타워 탭 = 정보/변환</span>';
}

export function sync(g: Game): void {
  $('round').textContent = 'R' + g.round;
  $('phase').textContent = g.phase === 'prep' ? '준비' : '전투';
  $('gold').textContent = String(Math.floor(g.gold));
  $('wk').textContent = '일꾼 ' + g.workers;
  ($('pollbar') as HTMLElement).style.width = g.poll + '%';
  $('produce').textContent = `생산 ${B.PRODUCE_COST} · 무작위 타일`;
  $('hire').textContent = '일꾼 고용 ' + B.hireCost(g.workers);
  for (let i = 0; i < 3; i++) $('up' + i).textContent = B.RACE[i] + ' +' + g.up[i];
  ($('prep') as HTMLElement).style.display = g.phase === 'prep' ? '' : 'none';
  const wt = B.WTYPES[g.next.type];
  const wn = $('wtName');
  wn.textContent = '다음: ' + wt.name + ' ×' + g.next.q.length;
  (wn as HTMLElement).style.color = wt.color;
  $('wtTip').textContent = wt.tip;
  $('wtNext').textContent =
    '이후 ' + g.forecast(3).map(t => B.WTYPES[t].name).join(' → ');
  for (let i = 0; i < 3; i++) $('bt' + i).classList.toggle('hot', g.boss === i);
  $('bossTip').textContent =
    g.boss === 0 ? '보스 없음 — 안전하게 소득만 챙깁니다.'
    : g.boss === 1 ? '하급보스: 중간 보상 · 중간 위험. 단일 형태 화력이 필요.'
    : '상급보스: 큰 보상 · 큰 위험. 못 잡으면 오염 +45. 도박입니다.';
  $('msg').textContent = g.msg;
}

export function showGameOver(g: Game): void {
  $('ovT').textContent = '라인이 뚫렸다';
  $('ovB').innerHTML =
    `도달 <b>R${g.round}</b> · 일꾼 ${g.workers}기<br>` +
    `오염 100% — 다음 판엔 웨이브 성격에 맞춰 스플/파워를 더 빨리 전환해보세요.`;
  ($('overlay') as HTMLElement).style.display = 'flex';
}
