// ───────── 게임 로직 (DOM 없음 — 테스트 가능) ─────────
// 출처: docs/갓타워디펜스X_VZ056_맵파일분석_v1.0.md

import * as B from '../data/balance';
import * as H from '../data/hero';
import { PATH_LENGTH, SLOT_POS, pathPos } from '../core/map';
import { GOD_TIER, RACE_COLOR, tagLabel, type Race } from '../data/units';
import type { Augment } from '../data/hero';
import { attackInterval, damage, isSplash, range, type UpgradeLevels } from './combat';
import { bossKillMineral, killIncome } from './economy';
import { Hero, rollAugmentChoices } from './hero';
import { findMerge, unitFor, type Rand } from './merge';
import type { Enemy, EnemySpec, FloatText, Shot, Slot } from './types';

export class Game {
  mineral = B.START_MINERAL;
  gas = B.START_GAS;
  lives = B.START_LIVES;
  /** 진행 중인 라운드. 첫 웨이브가 시작되기 전에는 0이다. */
  round = 0;
  roundTimer = B.OPENING_SECONDS;
  kills = 0;
  probes = 0;
  over = false;
  message = '소용돌이를 클릭해 유닛을 생성하세요. 같은 유닛 2기가 모이면 조합됩니다.';

  /** 처치한 최고 보스 레벨. Lv N+1 소환은 Lv N을 잡아야 열린다. */
  bossCleared = 0;
  bossesKilled = 0;
  bossCooldown = 0;

  upgrades: UpgradeLevels = [0, 0, 0, 0];

  /** 제단을 세우면 영웅이 생긴다. 세우기 전에는 null. */
  hero: Hero | null = null;
  /** 증강 선택지가 떠 있으면 게임이 멈춘다 */
  augmentChoices: Augment[] = [];

  slots: Slot[] = SLOT_POS.map(([x, y]) => ({ x, y, tower: null }));
  selected: Slot | null = null;

  enemies: Enemy[] = [];
  shots: Shot[] = [];
  floats: FloatText[] = [];

  private spawnQueue: EnemySpec[] = [];
  private spawnTimer = 0;
  private gasFraction = 0;
  private heroHitTimer = 0;

  /** 유닛 추첨용 난수. 테스트에서 결정적 함수를 주입한다. */
  private readonly rand: Rand;

  constructor(rand: Rand = Math.random) {
    this.rand = rand;
  }

  /** 증강 선택 중에는 시간이 흐르지 않는다 */
  get paused(): boolean {
    return this.augmentChoices.length > 0;
  }

  // ── 제단 · 영웅 ──
  get altarSlot(): Slot {
    return this.slots[H.ALTAR_SLOT];
  }

  get canBuildAltar(): boolean {
    return this.hero === null && !this.altarSlot.tower && this.mineral >= H.ALTAR_MINERAL;
  }

  /** 제단은 십자 중앙 타일을 차지한다. 그 자리에는 타워를 놓을 수 없게 된다. */
  buildAltar(): boolean {
    if (this.hero) {
      this.message = '제단은 하나뿐입니다.';
      return false;
    }
    if (this.altarSlot.tower) {
      this.message = '중앙 타일을 비워야 제단을 세울 수 있습니다.';
      return false;
    }
    if (this.mineral < H.ALTAR_MINERAL) {
      this.message = `미네랄 부족 — 제단 ${H.ALTAR_MINERAL} 필요.`;
      return false;
    }
    this.mineral -= H.ALTAR_MINERAL;
    this.hero = new Hero(this.altarSlot.x, this.altarSlot.y);
    this.message = '제단을 세웠습니다. 맵을 클릭해 영웅을 움직이세요.';
    return true;
  }

  moveHero(x: number, y: number): void {
    this.hero?.moveTo(x, y);
  }

  /** 증강 하나를 고른다. 남은 선택이 있으면 다음 선택지를 띄운다. */
  chooseAugment(index: number): boolean {
    const augment = this.augmentChoices[index];
    if (!augment || !this.hero) return false;

    this.hero.addAugment(augment);
    this.augmentChoices = [];
    this.message = `증강 획득 — ${augment.name}: ${augment.description}`;
    this.offerAugmentIfPending();
    return true;
  }

  private offerAugmentIfPending(): void {
    const hero = this.hero;
    if (!hero || hero.pendingAugmentPicks <= 0) return;
    this.augmentChoices = rollAugmentChoices(hero, this.rand);
    if (this.augmentChoices.length === 0) hero.pendingAugmentPicks = 0;
  }

  /** 필드에 살아있는 보스들의 레벨 */
  get liveBossLevels(): number[] {
    return this.enemies.filter((e) => e.kind === 'boss').map((e) => e.bossLevel ?? 1);
  }

  // ── 소환 가능한 보스 레벨 ──
  /** 아직 열리지 않은 가장 높은 레벨. Lv N을 잡아야 Lv N+1이 열린다. */
  get maxBossLevel(): number {
    return Math.min(this.bossCleared + 1, B.BOSS_MAX_LEVEL);
  }

  /** 열린 레벨은 언제든 다시 고를 수 있다. 낮은 레벨은 안전하지만 보상이 적다. */
  canSummonBossLevel(level: number): boolean {
    return this.canSummonBoss && level >= 1 && level <= this.maxBossLevel;
  }

  /** 쿨타임만이 소환을 막는다. 앞선 보스와 교전 중이어도 쿨타임이 차면 또 부를 수 있다. */
  get canSummonBoss(): boolean {
    return !this.over && this.bossCooldown <= 0;
  }

  /**
   * 보스 소환 — 라운드 진행과 무관한 상시 액션. 비용 없음, 쿨타임만.
   * 레벨을 생략하면 열려 있는 가장 높은 레벨을 부른다.
   */
  summonBoss(level: number = this.maxBossLevel): boolean {
    if (!this.canSummonBossLevel(level)) {
      this.message =
        this.bossCooldown > 0
          ? `쿨타임 ${Math.ceil(this.bossCooldown)}초 남았습니다.`
          : `Lv${level} 보스는 아직 열리지 않았습니다 — Lv${this.maxBossLevel}까지 소환할 수 있습니다.`;
      return false;
    }
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
    const unlocks =
      level === this.maxBossLevel && level < B.BOSS_MAX_LEVEL
        ? ` 처치하면 Lv${level + 1} 소환이 열립니다.`
        : '';
    this.message = `Lv${level} BOSS를 소환합니다. 보상 +${bossKillMineral(level)}.${unlocks}`;
    return true;
  }

  // ── 유닛 생성 / 조합 / 판매 ──
  spawnUnit(slot: Slot): boolean {
    if (this.hero && slot === this.altarSlot) {
      this.message = '제단 타일에는 유닛을 놓을 수 없습니다.';
      return false;
    }
    if (slot.tower) {
      this.message = '빈 타일을 선택하세요.';
      return false;
    }
    if (this.mineral < B.SPAWN_UNIT_MINERAL) {
      this.message = `미네랄 부족 — ${B.SPAWN_UNIT_MINERAL} 필요.`;
      return false;
    }
    this.mineral -= B.SPAWN_UNIT_MINERAL;
    const def = unitFor(0, this.rand, this.bossesKilled);
    slot.tower = { def, tier: 0, cooldown: 0 };
    this.float(slot.x, slot.y, def.name, RACE_COLOR[def.race]);
    this.selected = slot;
    this.resolveMerges();
    if (!slot.tower) this.selected = null;
    return true;
  }

  spawnUnitAnywhere(): boolean {
    const empty = this.slots.find((s) => !s.tower && !(this.hero && s === this.altarSlot));
    if (!empty) {
      this.message = '빈 타일이 없습니다 — 조합하거나 판매하세요.';
      return false;
    }
    return this.spawnUnit(empty);
  }

  /** 연쇄 조합까지 전부 해소한다 */
  resolveMerges(): void {
    for (let guard = 0; guard < 64; guard++) {
      const result = findMerge(this.slots, this.rand, this.bossesKilled);
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
    this.round++;
    const hp = B.enemyHP(this.round);
    const armor = B.enemyArmor(this.round);

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
      const unlocked = level > this.bossCleared;
      this.mineral += reward;
      this.bossesKilled++;
      this.bossCleared = Math.max(this.bossCleared, level);
      this.float(x, y, `[ Lv${level} BOSS KILL ] +${reward}`, '#ffd23f');
      this.grantXp(H.xpPerBoss(level));

      const suffix = !unlocked
        ? ''
        : this.bossCleared >= B.BOSS_MAX_LEVEL
          ? ' · 모든 보스를 잡았습니다.'
          : ` · Lv${level + 1} 소환이 열렸습니다.`;
      this.message = `Lv${level} BOSS 처치! +${reward} 미네랄${suffix}`;
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
    this.mineral += this.hero?.stats.mineralPerKill ?? 0;
    this.grantXp(H.XP_PER_MOB);
  }

  /** 경험치는 타워가 잡든 영웅이 잡든 들어온다. 레벨업 시 증강 선택을 띄운다. */
  private grantXp(amount: number): void {
    const hero = this.hero;
    if (!hero) return;
    const levels = hero.gainXp(amount);
    if (levels > 0) this.float(hero.x, hero.y, `Lv${hero.level}!`, '#ffd23f');
    if (this.augmentChoices.length === 0) this.offerAugmentIfPending();
  }

  float(x: number, y: number, text: string, color: string): void {
    this.floats.push({ x, y, text, color, life: 0.9 });
  }

  // ── 프레임 ──
  update(dt: number): void {
    // 밀린 증강 선택이 있으면 먼저 띄운다 — 그래야 아래에서 일시정지된다
    if (this.augmentChoices.length === 0) this.offerAugmentIfPending();
    if (this.over || this.paused) return;

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
    }

    if (this.spawnQueue.length) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawn(this.spawnQueue.shift()!);
        this.spawnTimer = B.SPAWN_INTERVAL;
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
    this.stepHero(dt);

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

  /** 영웅 이동 · 공격, 그리고 적의 반격 */
  private stepHero(dt: number): void {
    const hero = this.hero;
    if (!hero) return;

    hero.step(dt);
    if (!hero.alive) return;

    const stats = hero.stats;

    // 영웅 공격 — 사거리 안에서 가장 가까운 적
    if (hero.attackCooldown <= 0) {
      const target = this.nearestEnemy(hero.x, hero.y, stats.range);
      if (target) {
        const [tx, ty] = pathPos(target.distance);
        if (stats.splashRadius > 0) {
          for (const enemy of this.enemies) {
            const [ex, ey] = pathPos(enemy.distance);
            if (Math.hypot(ex - tx, ey - ty) <= stats.splashRadius) {
              enemy.hp -= B.effectiveDamage(stats.damage, enemy.armor);
            }
          }
          this.shots.push({
            x: hero.x, y: hero.y, tx, ty, life: 0.1,
            color: '#c065e0', splashRadius: stats.splashRadius,
          });
        } else {
          target.hp -= B.effectiveDamage(stats.damage, target.armor);
          this.shots.push({ x: hero.x, y: hero.y, tx, ty, life: 0.1, color: '#ffffff' });
        }
        hero.attackCooldown = stats.attackInterval;
      }
    }

    // 적의 반격 — 영웅에 닿은 적이 때린다
    this.heroHitTimer -= dt;
    if (this.heroHitTimer <= 0) {
      let incoming = 0;
      for (const enemy of this.enemies) {
        const [ex, ey] = pathPos(enemy.distance);
        if (Math.hypot(ex - hero.x, ey - hero.y) > H.ENEMY_TOUCH_RANGE + enemy.radius) continue;
        incoming +=
          enemy.kind === 'boss'
            ? H.bossDamage(enemy.bossLevel ?? 1)
            : H.enemyDamage(this.round);
      }
      if (incoming > 0) {
        hero.takeDamage(incoming);
        this.float(hero.x, hero.y, `-${Math.round(incoming)}`, '#ff5a3c');
        if (!hero.alive) {
          this.message = `영웅 사망 — ${Math.ceil(hero.respawnTimer)}초 뒤 제단에서 부활합니다.`;
        }
      }
      this.heroHitTimer = H.ENEMY_ATTACK_INTERVAL;
    }
  }

  private nearestEnemy(x: number, y: number, reach: number): Enemy | null {
    let best: Enemy | null = null;
    let bestDistance = reach;
    for (const enemy of this.enemies) {
      if (enemy.dead) continue;
      const [ex, ey] = pathPos(enemy.distance);
      const distance = Math.hypot(ex - x, ey - y);
      if (distance <= bestDistance) {
        bestDistance = distance;
        best = enemy;
      }
    }
    return best;
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

      const raw = damage(tower, this.upgrades) * (this.hero?.stats.towerDamageMult ?? 1);
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
