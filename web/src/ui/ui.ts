// ───────── HUD / 패널 바인딩 ─────────
import * as B from '../data/balance';
import { RACES, RACE_COLOR, TIER_LABEL, tagLabel, type Race } from '../data/units';
import { attackInterval, damage, range } from '../game/combat';
import type { Game } from '../game/game';

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing element #${id}`);
  return el as T;
};

export interface Elements {
  readonly round: HTMLElement;
  readonly timer: HTMLElement;
  readonly mineral: HTMLElement;
  readonly gas: HTMLElement;
  readonly lives: HTMLElement;
  readonly kills: HTMLElement;
  readonly info: HTMLElement;
  readonly message: HTMLElement;
  readonly bossState: HTMLElement;
  readonly bossLevels: readonly HTMLButtonElement[];
  readonly probe: HTMLButtonElement;
  readonly spawn: HTMLButtonElement;
  readonly sell: HTMLButtonElement;
  readonly upgrades: readonly HTMLButtonElement[];
  readonly overlay: HTMLElement;
  readonly overlayTitle: HTMLElement;
  readonly overlayBody: HTMLElement;
}

export function bindElements(): Elements {
  return {
    round: $('round'),
    timer: $('timer'),
    mineral: $('mineral'),
    gas: $('gas'),
    lives: $('lives'),
    kills: $('kills'),
    info: $('info'),
    message: $('message'),
    bossState: $('bossState'),
    bossLevels: [1, 2, 3, 4, 5, 6].map((n) => $<HTMLButtonElement>(`boss${n}`)),
    probe: $<HTMLButtonElement>('probe'),
    spawn: $<HTMLButtonElement>('spawn'),
    sell: $<HTMLButtonElement>('sell'),
    upgrades: [0, 1, 2, 3].map((i) => $<HTMLButtonElement>(`up${i}`)),
    overlay: $('overlay'),
    overlayTitle: $('overlayTitle'),
    overlayBody: $('overlayBody'),
  };
}

function bossStateLabel(game: Game): string {
  const live = game.liveBossLevels;
  const fighting = live.length ? `교전 중 ${live.map((l) => `Lv${l}`).join(' ')} · ` : '';
  const gate =
    game.bossCooldown > 0
      ? `쿨타임 ${Math.ceil(game.bossCooldown)}s`
      : `소환 가능 Lv1~Lv${game.maxBossLevel}`;
  return fighting + gate;
}

function selectionInfo(game: Game): string {
  const tower = game.selected?.tower;
  if (!tower) {
    return '<span class="dim">빈 타일 = 유닛 생성 · 유닛 타일 = 정보. 같은 유닛 2기가 모이면 자동 조합됩니다.</span>';
  }
  const dmg = damage(tower, game.upgrades).toFixed(0);
  const dps = (damage(tower, game.upgrades) / attackInterval(tower)).toFixed(0);
  return `
    <div class="name" style="color:${RACE_COLOR[tower.def.race]}">
      ${tower.def.name}
      <span class="chip">${TIER_LABEL[tower.tier]}</span>
      <span class="chip">【 ${tagLabel(tower.def)} 】</span>
    </div>
    <div class="dim">${RACES[tower.def.race]} · 공격력 ${dmg} · 간격 ${attackInterval(tower).toFixed(2)}s
      · DPS ${dps} · 사거리 ${range(tower).toFixed(0)}</div>`;
}

export function refresh(el: Elements, game: Game): void {
  el.round.textContent = `R${game.round}`;
  el.timer.textContent = `${Math.ceil(game.roundTimer)}s`;
  el.timer.style.color = game.round > 1 && game.waveCleared ? 'var(--gold)' : '';
  el.mineral.textContent = String(Math.floor(game.mineral));
  el.gas.textContent = String(Math.floor(game.gas));
  el.lives.textContent = String(game.lives);
  el.kills.textContent = String(game.kills);

  el.bossState.textContent = bossStateLabel(game);
  el.bossLevels.forEach((button, i) => {
    const level = i + 1;
    const open = level <= game.maxBossLevel;
    button.disabled = !game.canSummonBossLevel(level);
    button.textContent = open ? `Lv${level}\n+${B.BOSS_KILL_MINERAL[i]}` : `Lv${level} 🔒`;
    button.classList.toggle('ready', open);
    button.classList.toggle('top', open && level === game.maxBossLevel);
  });

  el.probe.textContent = `프로브 ${B.PROBE_MINERAL} (${game.probes}/${B.PROBE_MAX})`;
  el.probe.disabled = game.probes >= B.PROBE_MAX || game.mineral < B.PROBE_MINERAL;

  el.spawn.textContent = `유닛 생성 ${B.SPAWN_UNIT_MINERAL}`;
  el.spawn.disabled = game.mineral < B.SPAWN_UNIT_MINERAL;

  el.sell.disabled = !game.selected?.tower;

  el.upgrades.forEach((button, i) => {
    const race = i as Race;
    const cost = game.upgradeCost(race);
    button.textContent = `${RACES[race]} +${game.upgrades[race]} · ${cost}가스`;
    button.disabled = game.gas < cost;
  });

  el.info.innerHTML = selectionInfo(game);
  el.message.textContent = game.message;

  if (game.over) {
    el.overlay.style.display = 'flex';
    el.overlayTitle.textContent = '패배';
    el.overlayBody.textContent =
      `${game.round}라운드 · ${game.kills}킬 · 보스 Lv${game.bossCleared}까지 처치`;
  }
}
