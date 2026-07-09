// ───────── 게임 로직 (DOM 없음 — 테스트 가능) ─────────
// 출처: docs/갓타워디펜스X_VZ056_맵파일분석_v1.0.md

import * as B from '../data/balance';
import { PATH_LENGTH, SLOT_POS, pathPos } from '../core/map';
import { GOD_TIER, RACE_COLOR, tagLabel, type Race } from '../data/units';
import { attackInterval, damage, isSplash, range, type UpgradeLevels } from './combat';
import { bossKillMineral, killIncome } from './economy';
import { PickIndex, findMerge, unitFor } from './merge';
import type { Enemy, EnemySpec, FloatText, Shot, Slot } from './types';

export class Game {
  mineral = B.START_MINERAL;
  gas = B.START_GAS;
  lives = B.START_LIVES;
  round = 1;
  roundTimer = B.OPENING_SECONDS;
  kills = 0;
  probes = 0;
  over = false;
  message = '소용돌이를 클릭해 유닛을 생성하세요. 같은 유닛 2기가 모이면 조합됩니다.';

  /** 처치한 최고 보스 레벨. Lv N+1 소환은 Lv N을 잡아야 열린다. */
  bossCleared = 0;
  bossesKilled = 0;
  bossCooldown = 0;
  /** 필드에 살아있는 보스 레벨 (동시 1기) */
  activeBossLevel: number | null = null;

  upgrades: UpgradeLevels = [0, 0, 0, 0];

  readonly pick = new PickIndex();
  slots: Slot[] = SLOT_POS.map(([x, y]) => ({ x, y, tower: null }));
  selected: Slot | null = null;

  enemies: Enemy[] = [];
  shots: Shot[] = [];
  floats: FloatText[] = [];

  private spawnQueue: EnemySpec[] = [];
  private spawnTimer = 0;
  private gasFraction = 0;

  // ── 소환 가능한 보스 레벨 ──
  get nextBossLevel(): number {
    return Math.min(this.bossCleared + 1, B.BOSS_MAX_LEVEL);
  }

  get canSummonBoss(): boolean {
    return (
      !this.over &&
      this.bossCooldown <= 0 &&
      this.activeBossLevel === null &&
      this.bossCleared < B.BOSS_MAX_LEVEL
    );
  }

  /**
   * 보스 소환 — 라운드 진행과 무관한 상시 액션. 비용 없음, 쿨타임만.
   * 소환한 보스를 잡아야 다음 레벨이 열린다.
   */
  summonBoss(): boolean {
    if (!this.canSummonBoss) {
      this.message =
        this.activeBossLevel !== null
          ? '이미 보스가 필드에 있습니다.'
          : this.bossCleared >= B.BOSS_MAX_LEVEL
            ? `Lv${B.BOSS_MAX_LEVEL} 보스까지 모두 처치했습니다.`
            : `쿨타임 ${Math.ceil(this.bossCooldown)}초 남았습니다.`;
      return false;
    }
    const level = this.nextBossLevel;
    this.activeBossLevel = level;
    this.bossCooldown = B.BOSS_COOLDOWN_SECONDS;
    this.spawn({
      kind: 'boss',
      name: `Lv${level} BOSS`,
      maxHp: B.bossHP(level),
      armor: B.bossArmor(level),
      speed: B.BOSS_SPEED,
      radius: 18,
      bossLevel: level,
    });
    const next = level < B.BOSS_MAX_LEVEL ? ` 처치하면 Lv${level + 1} 소환이 열립니다.` : '';
    this.message = `Lv${level} BOSS를 소환합니다.${next}`;
    return true;
  }

  // ── 유닛 생성 / 조합 / 판매 ──
  spawnUnit(slot: Slot): boolean {
    if (slot.tower) {
      this.message = '빈 타일을 선택하세요.';
      return false;
    }
    if (this.mineral < B.SPAWN_UNIT_MINERAL) {
      this.message = `미네랄 부족 — ${B.SPAWN_UNIT_MINERAL} 필요.`;
      return false;
    }
    this.mineral -= B.SPAWN_UNIT_MINERAL;
    const def = unitFor(0, this.pick.value, this.bossesKilled);
    slot.tower = { def, tier: 0, cooldown: 0 };
    this.float(slot.x, slot.y, def.name, RACE_COLOR[def.race]);
    this.selected = slot;
    this.resolveMerges();
    if (!slot.tower) this.selected = null;
    return true;
  }

  spawnUnitAnywhere(): boolean {
    const empty = this.slots.find((s) => !s.tower);
    if (!empty) {
      this.message = '빈 타일이 없습니다 — 조합하거나 판매하세요.';
      return false;
    }
    return this.spawnUnit(empty);
  }

  /** 연쇄 조합까지 전부 해소한다 */
  resolveMerges(): void {
    for (let guard = 0; guard < 64; guard++) {
      const result = findMerge(this.slots, this.pick.value, this.bossesKilled);
      if (!result) return;

      let removed = 0;
      for (const slot of this.slots) {
        if (removed >= B.MERGE_REQUIRED) break;
        if (slot.tower?.def.name === result.consumed && slot.tower.tier === result.tier - 1) {
          slot.tower = null;
          removed++;
        }
      }
      result.slot.tower = { def: result.produced, tier: result.tier, cooldown: 0 };
      const isGod = result.tier === GOD_TIER;
      this.float(
        result.slot.x,
        result.slot.y,
        isGod ? `★ ${result.produced.name}` : result.produced.name,
        isGod ? '#ffd23f' : '#ffffff',
      );
      this.message = `${result.produced.name} 【 ${tagLabel(result.produced)} 】를 조합하였습니다.`;
    }
  }

  sellSelected(): boolean {
    const slot = this.selected;
    if (!slot?.tower) return false;
    slot.tower = null;
    this.selected = null;
    this.message = '유닛을 처분하였습니다.';
    return true;
  }

  // ── 프로브 / 업그레이드 ──
  buyProbe(): boolean {
    if (this.probes >= B.PROBE_MAX) {
      this.message = `프로브는 최대 ${B.PROBE_MAX}기입니다.`;
      return false;
    }
    if (this.mineral < B.PROBE_MINERAL) {
      this.message = `미네랄 부족 — 프로브 ${B.PROBE_MINERAL} 필요.`;
      return false;
    }
    this.mineral -= B.PROBE_MINERAL;
    this.probes++;
    this.message = '프로브를 생산하였습니다. 가스를 채취합니다.';
    return true;
  }

  upgrade(race: Race): boolean {
    const cost = B.upgradeGasCost(this.upgrades[race]);
    if (this.gas < cost) {
      this.message = `가스 부족 — 업그레이드 ${cost} 필요.`;
      return false;
    }
    this.gas -= cost;
    const next: UpgradeLevels = [
      this.upgrades[0], this.upgrades[1], this.upgrades[2], this.upgrades[3],
    ];
    next[race] += 1;
    this.upgrades = next;
    this.message = `파일런 업그레이드 → Lv${this.upgrades[race]}`;
    return true;
  }

  upgradeCost(race: Race): number {
    return B.upgradeGasCost(this.upgrades[race]);
  }

  // ── 라운드 ──
  private beginRound(): void {
    const godName = B.GOD_ENEMY_ROUNDS[this.round];
    const hp = B.enemyHP(this.round);
    const armor = B.enemyArmor(this.round);

    if (godName) {
      this.spawnQueue.push({
        kind: 'god',
        name: godName,
        maxHp: hp * B.GOD_ENEMY_HP_MULT,
        armor: armor * 2,
        speed: B.ENEMY_SPEED * 0.8,
        radius: 14,
      });
      this.message = `${godName} 등장! (라운드 ${this.round})`;
      return;
    }

    for (let i = 0; i < B.enemyCount(this.round); i++) {
      this.spawnQueue.push({
        kind: 'mob',
        name: `R${this.round}`,
        maxHp: hp,
        armor,
        speed: B.ENEMY_SPEED,
        radius: 9,
      });
    }
    this.message = `Round Start — ${this.round}라운드`;
  }

  /** 모든 적은 북측 왼쪽 문 하나에서 나온다 */
  private spawn(spec: EnemySpec): void {
    this.enemies.push({ ...spec, hp: spec.maxHp, distance: 0 });
  }

  // ── 누출 / 처치 ──
  private breakthrough(enemy: Enemy): void {
    const cost = enemy.kind === 'boss' ? B.bossLeakLives(enemy.bossLevel ?? 1) : 1;
    this.lives -= cost;
    this.mineral += B.LEAK_MINERAL;
    const [x, y] = pathPos(enemy.distance);
    this.float(x, y, `Life -${cost} · 미네랄 +${B.LEAK_MINERAL}`, '#ff5a3c');
    if (enemy.kind === 'boss') {
      this.activeBossLevel = null;
      this.message = `${enemy.name} 돌파! 다음 레벨은 열리지 않습니다.`;
    }
    if (this.lives <= 0) {
      this.lives = 0;
      this.over = true;
      this.message = '패배';
    }
  }

  private onKilled(enemy: Enemy): void {
    const [x, y] = pathPos(enemy.distance);

    if (enemy.kind === 'boss') {
      const level = enemy.bossLevel ?? 1;
      const reward = bossKillMineral(level);
      this.mineral += reward;
      this.bossesKilled++;
      this.bossCleared = Math.max(this.bossCleared, level);
      this.activeBossLevel = null;
      this.pick.bump(); // trigger #602~#606 — 조합 선택자를 한 칸 민다
      this.float(x, y, `[ Lv${level} BOSS KILL ] +${reward}`, '#ffd23f');
      this.message =
        this.bossCleared >= B.BOSS_MAX_LEVEL
          ? `Lv${level} BOSS 처치! 모든 보스를 잡았습니다.`
          : `Lv${level} BOSS 처치! +${reward} 미네랄 · Lv${level + 1} 소환이 열렸습니다.`;
      return;
    }

    const before = this.kills;
    this.kills++;
    const income = killIncome(before, this.kills);
    if (income.mineral > 0) {
      this.mineral += income.mineral;
      this.float(x, y, `+${income.mineral}`, '#8fd6ff');
      if (income.notes.length) this.message = income.notes.join(' · ');
    }
  }

  float(x: number, y: number, text: string, color: string): void {
    this.floats.push({ x, y, text, color, life: 0.9 });
  }

  // ── 프레임 ──
  update(dt: number): void {
    if (this.over) return;

    this.pick.advanceTime(dt);
    if (this.bossCooldown > 0) this.bossCooldown = Math.max(0, this.bossCooldown - dt);

    this.gasFraction += this.probes * B.GAS_PER_PROBE_SECOND * dt;
    if (this.gasFraction >= 1) {
      const whole = Math.floor(this.gasFraction);
      this.gas += whole;
      this.gasFraction -= whole;
    }

    this.roundTimer -= dt;
    if (this.roundTimer <= 0) {
      this.roundTimer = B.ROUND_SECONDS;
      this.beginRound();
      this.round++;
    }

    if (this.spawnQueue.length) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawn(this.spawnQueue.shift()!);
        this.spawnTimer = 0.38;
      }
    }

    for (const enemy of this.enemies) {
      enemy.distance += enemy.speed * dt;
      if (enemy.distance >= PATH_LENGTH) {
        enemy.dead = true;
        this.breakthrough(enemy);
      }
    }

    this.fireTowers(dt);

    for (const enemy of this.enemies) {
      if (enemy.hp <= 0 && !enemy.dead) {
        enemy.dead = true;
        this.onKilled(enemy);
      }
    }
    this.enemies = this.enemies.filter((e) => !e.dead);

    for (const shot of this.shots) shot.life -= dt;
    this.shots = this.shots.filter((s) => s.life > 0);
    for (const f of this.floats) {
      f.life -= dt;
      f.y -= 18 * dt;
    }
    this.floats = this.floats.filter((f) => f.life > 0);
  }

  private fireTowers(dt: number): void {
    for (const slot of this.slots) {
      const tower = slot.tower;
      if (!tower) continue;
      tower.cooldown -= dt;
      if (tower.cooldown > 0) continue;

      const reach = range(tower);
      const inReach = this.enemies.filter((e) => {
        if (e.dead) return false;
        const [x, y] = pathPos(e.distance);
        return Math.hypot(x - slot.x, y - slot.y) <= reach;
      });
      if (!inReach.length) continue;

      const raw = damage(tower, this.upgrades);
      const color = RACE_COLOR[tower.def.race];

      if (isSplash(tower)) {
        for (const e of inReach) e.hp -= B.effectiveDamage(raw, e.armor);
        const [x, y] = pathPos(inReach[0].distance);
        this.shots.push({ x: slot.x, y: slot.y, tx: x, ty: y, life: 0.08, color, splashRadius: reach });
      } else {
        // 파워는 체력 최대(보스) 우선, 그 외에는 가장 멀리 간 적(돌파 임박) 우선
        const power = tower.def.tags.includes('power');
        // 파워는 체력 최대(보스) 우선, 그 외에는 출구에 가장 가까운 적 우선
        const target = inReach.reduce((best, e) =>
          power ? (e.hp > best.hp ? e : best) : e.distance > best.distance ? e : best,
        );
        target.hp -= B.effectiveDamage(raw, target.armor);
        const [x, y] = pathPos(target.distance);
        this.shots.push({ x: slot.x, y: slot.y, tx: x, ty: y, life: 0.08, color });
      }
      tower.cooldown = attackInterval(tower);
    }
  }
}
