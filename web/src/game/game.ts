// ───────── 게임 로직 (DOM 없음 — 테스트 가능) ─────────
// 출처: docs/갓타워디펜스X_VZ056_맵파일분석_v1.0.md

import * as B from '../data/balance';
import * as H from '../data/hero';
import * as K from '../data/skills';
import * as S from '../data/score';
import { PATH_LENGTH, SLOT_POS, pathPos } from '../core/map';
import { GOD_TIER, RACE_COLOR, tagLabel, type Race } from '../data/units';
import type { AugmentCard } from '../data/hero';
import { attackInterval, damage, isSplash, range, slowFactor, type UpgradeLevels } from './combat';
import { bossKillMineral, killIncome } from './economy';
import { Hero, rollAugmentChoices } from './hero';
import { findMerge, unitFor, type Rand } from './merge';
import type { Decoy, Enemy, EnemySpec, FloatText, Shot, Slot } from './types';

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

  /** 누적 점수. 승리 조건이 없으므로 이게 유일한 성적표다. */
  score = 0;
  /** GOD 타워 보너스를 이미 받은 유닛 이름 */
  private readonly scoredGods = new Set<string>();
  message = '소용돌이를 클릭해 유닛을 생성하세요. 같은 유닛 2기가 모이면 조합됩니다.';

  /** 처치한 최고 보스 레벨. Lv N+1 소환은 Lv N을 잡아야 열린다. */
  bossCleared = 0;
  bossesKilled = 0;
  bossCooldown = 0;
  /** 피해 기여 집계 — 영웅(평타+스킬) 대 타워. 밸런스 계측과 UI용 */
  heroDamageDealt = 0;
  towerDamageDealt = 0;
  /** 영웅/허수아비가 붙잡아둔 몹에게 타워가 넣은 피해 — 탱킹이 벌어준 딜 */
  tankAssistDamage = 0;

  upgrades: UpgradeLevels = [0, 0, 0, 0];

  /** 제단과 영웅은 시작부터 있다 */
  readonly hero: Hero;
  /** 증강 선택지가 떠 있으면 게임이 멈춘다 */
  augmentChoices: AugmentCard[] = [];
  /** 이번 증강 선택에서 쓴 리롤 수 — 새 선택지가 뜰 때 0으로 돌아간다 */
  rerollsUsed = 0;

  /**
   * 높은 등급 증강을 고른 대가. 몹 체력에 영구히 곱해진다.
   * 지금 세지느냐, 나중을 지키느냐 — 매 선택이 도박이다.
   */

  slots: Slot[] = SLOT_POS.map(([x, y]) => ({ x, y, tower: null }));
  selected: Slot | null = null;

  enemies: Enemy[] = [];
  shots: Shot[] = [];
  floats: FloatText[] = [];
  /** 영웅이 세운 미끼 (허수아비 스킬) */
  decoy: Decoy | null = null;

  private spawnQueue: EnemySpec[] = [];
  private spawnTimer = 0;
  private gasFraction = 0;
  private heroHitTimer = 0;
  private decoyHitTimer = 0;

  /** 유닛 추첨용 난수. 테스트에서 결정적 함수를 주입한다. */
  private readonly rand: Rand;

  constructor(rand: Rand = Math.random) {
    this.rand = rand;
    this.hero = new Hero();
  }

  /** 증강 선택 중에는 시간이 흐르지 않는다 */
  get paused(): boolean {
    return this.augmentChoices.length > 0;
  }

  // ── 제단 · 영웅 ──
  /** 제단은 게임 시작과 함께 십자 중앙 타일에 주어진다. 그 자리에는 타워를 놓을 수 없다. */
  get altarSlot(): Slot {
    return this.slots[H.ALTAR_SLOT];
  }

  moveHero(x: number, y: number): void {
    this.hero.moveTo(x, y);
  }

  // ── 액티브 스킬 (자동 시전) ──
  get canUseSkill(): boolean {
    return !this.over && !this.paused && this.hero.skillReady;
  }

  /**
   * 지금 스킬을 쓸 만한가. 쿨타임이 찼다고 아무 때나 쏘면 뭉친 순간을 놓친다.
   * 스킬마다 다른 조건을 데이터(autoCastMinTargets)로 둔다.
   */
  get shouldAutoCastSkill(): boolean {
    const skill = this.hero.skill;
    if (!this.canUseSkill || !skill) return false;
    return this.autoCastTargetCount(skill) >= skill.def.autoCastMinTargets;
  }

  /** 지금 시전하면 몇 기가 영향을 받는가 */
  private autoCastTargetCount(skill: K.ResolvedSkill): number {
    const hero = this.hero;
    const live = this.enemies.filter((e) => !e.dead);

    switch (skill.def.id) {
      case 'whirlwind':
        return live.filter((e) => Math.abs(e.distance - hero.distance) <= skill.radius).length;
      case 'volley':
        return live.filter((e) => Math.abs(e.distance - hero.distance) <= hero.stats.range).length;
      case 'meteor':
        return live.reduce(
          (best, candidate) =>
            Math.max(
              best,
              live.filter((e) => Math.abs(e.distance - candidate.distance) <= skill.radius).length,
            ),
          0,
        );
      case 'decoy':
        // 이미 세워져 있으면 다시 안 세운다
        if (this.decoy) return 0;
        return live.filter((e) => {
          const gap = hero.distance - e.distance;
          return gap >= 0 && gap <= K.DECOY_AUTOCAST_RANGE;
        }).length;
    }
  }

  /** 스킬을 쓴다. 못 쓰면 false. */
  useSkill(): boolean {
    const hero = this.hero;
    const skill = hero.skill;
    if (!this.canUseSkill || !skill) return false;

    switch (skill.def.id) {
      case 'whirlwind':
        this.castWhirlwind(skill);
        break;
      case 'volley':
        this.castVolley(skill);
        break;
      case 'meteor':
        this.castMeteor(skill);
        break;
      case 'decoy':
        this.castDecoy(skill);
        break;
    }
    hero.skillCooldown = skill.cooldown;
    return true;
  }

  /** 스킬 피해 한 방 */
  private skillHit(enemy: Enemy, skill: K.ResolvedSkill): void {
    const raw = this.hero.stats.damage * skill.damageMult * this.hero.stats.skillPower;
    const dealt = B.effectiveDamage(raw, enemy.armor);
    enemy.hp -= dealt;
    this.heroDamageDealt += dealt;
    enemy.lastHitByHero = true;
    if (skill.mods.slowFactor < 1) {
      enemy.slowFactor = skill.mods.slowFactor;
      enemy.slowTimer = skill.mods.slowSeconds;
    }
  }

  private castWhirlwind(skill: K.ResolvedSkill): void {
    const hero = this.hero;
    for (const enemy of this.enemies) {
      if (Math.abs(enemy.distance - hero.distance) <= skill.radius) this.skillHit(enemy, skill);
    }
    this.float(hero.x, hero.y, '소용돌이!', '#6fdc8c');
    this.shots.push({
      x: hero.x, y: hero.y, tx: hero.x, ty: hero.y, life: 0.22,
      color: '#6fdc8c', splashRadius: skill.radius,
    });
  }

  private castVolley(skill: K.ResolvedSkill): void {
    const hero = this.hero;
    const reach = hero.stats.range;
    const inReach = this.enemies
      .filter((e) => !e.dead && Math.abs(e.distance - hero.distance) <= reach)
      .sort((a, b) => b.distance - a.distance) // 출구에 가까운 적부터
      .slice(0, skill.targets);

    for (const target of inReach) {
      this.skillHit(target, skill);
      const [tx, ty] = pathPos(target.distance);
      this.shots.push({ x: hero.x, y: hero.y, tx, ty, life: 0.14, color: '#4ea3ff' });

      // 폭발 화살 — 화살마다 주변으로 번진다
      if (skill.mods.explosiveRadius > 0) {
        for (const splash of this.enemies) {
          if (splash === target || splash.dead) continue;
          if (Math.abs(splash.distance - target.distance) <= skill.mods.explosiveRadius) {
            this.skillHit(splash, skill);
          }
        }
        this.shots.push({
          x: tx, y: ty, tx, ty, life: 0.18,
          color: '#ff8a3c', splashRadius: skill.mods.explosiveRadius,
        });
      }
    }
    this.float(hero.x, hero.y, `일제 사격 x${skill.targets}`, '#4ea3ff');
  }

  /** 적이 가장 많이 몰린 경로 지점을 찾아 떨어뜨린다 */
  private castMeteor(skill: K.ResolvedSkill): void {
    if (!this.enemies.length) return;
    let bestDistance = this.enemies[0].distance;
    let bestCount = 0;
    for (const candidate of this.enemies) {
      const count = this.enemies.filter(
        (e) => Math.abs(e.distance - candidate.distance) <= skill.radius,
      ).length;
      if (count > bestCount) {
        bestCount = count;
        bestDistance = candidate.distance;
      }
    }
    for (const enemy of this.enemies) {
      if (Math.abs(enemy.distance - bestDistance) <= skill.radius) this.skillHit(enemy, skill);
    }
    const [x, y] = pathPos(bestDistance);
    this.float(x, y, `유성! ${bestCount}기`, '#c065e0');
    this.shots.push({ x, y, tx: x, ty: y, life: 0.3, color: '#c065e0', splashRadius: skill.radius });
  }

  private castDecoy(skill: K.ResolvedSkill): void {
    const hero = this.hero;
    const maxHp = Math.round(hero.stats.maxHp * K.DECOY_HP_RATIO * skill.mods.decoyHpMult);
    this.decoy = {
      distance: Math.max(0, hero.distance - K.DECOY_AHEAD), // 몹이 오는 쪽
      hp: maxHp,
      maxHp,
      life: K.DECOY_LIFETIME,
      taunts: skill.mods.decoyTaunts,
    };
    this.float(hero.x, hero.y, '허수아비!', '#ff8a3c');
  }

  /** 증강 하나를 고른다. 남은 선택이 있으면 다음 선택지를 띄운다. */
  chooseAugment(index: number): boolean {
    const card = this.augmentChoices[index];
    if (!card) return false;

    const rarity = H.RARITIES[card.rarity];
    this.hero.addAugment(card);
    this.augmentChoices = [];

    this.message = `[${rarity.label}] ${card.augment.name}: ${card.augment.description}`;
    this.offerAugmentIfPending();
    return true;
  }

  private offerAugmentIfPending(): void {
    const hero = this.hero;
    if (hero.pendingAugmentPicks <= 0) return;
    this.augmentChoices = rollAugmentChoices(hero, this.rand);
    this.rerollsUsed = 0;
    if (this.augmentChoices.length === 0) hero.pendingAugmentPicks = 0;
  }

  // ── 증강 리롤 (가스) ──
  get rerollCost(): number {
    return H.augmentRerollCost(this.rerollsUsed);
  }

  get canReroll(): boolean {
    return (
      this.augmentChoices.length > 0 &&
      this.rerollsUsed < H.AUGMENT_REROLL_MAX &&
      this.gas >= this.rerollCost
    );
  }

  /** 선택지 3장을 가스로 다시 뽑는다 — 한 선택당 최대 2회 */
  rerollAugments(): boolean {
    if (this.augmentChoices.length === 0) return false;
    if (this.rerollsUsed >= H.AUGMENT_REROLL_MAX) {
      this.message = `리롤은 선택당 ${H.AUGMENT_REROLL_MAX}회까지입니다.`;
      return false;
    }
    const cost = this.rerollCost;
    if (this.gas < cost) {
      this.message = `가스 부족 — 리롤 ${cost} 필요.`;
      return false;
    }
    this.gas -= cost;
    this.rerollsUsed++;
    this.augmentChoices = rollAugmentChoices(this.hero, this.rand);
    return true;
  }

  // ── 가스 스킬 개조 ──
  gasSkillCost(track: 'damage' | 'cdr'): number {
    return K.gasSkillCost(track === 'damage' ? this.hero.gasSkillDamage : this.hero.gasSkillCdr);
  }

  canBuyGasSkill(track: 'damage' | 'cdr'): boolean {
    return !this.over && this.hero.skillId !== null && this.gas >= this.gasSkillCost(track);
  }

  /** 가스로 스킬을 개조한다 — 종족 업그레이드와 같은 지갑을 두고 경쟁한다 */
  buyGasSkill(track: 'damage' | 'cdr'): boolean {
    if (this.hero.skillId === null) {
      this.message = '개조할 스킬이 없습니다 — 스킬 증강을 먼저 얻으세요.';
      return false;
    }
    const cost = this.gasSkillCost(track);
    if (this.gas < cost) {
      this.message = `가스 부족 — 개조 ${cost} 필요.`;
      return false;
    }
    this.gas -= cost;
    if (track === 'damage') this.hero.gasSkillDamage++;
    else this.hero.gasSkillCdr++;
    this.message =
      track === 'damage'
        ? `스킬 피해 개조 +${this.hero.gasSkillDamage} · 다음 ${this.gasSkillCost('damage')}`
        : `스킬 쿨타임 개조 +${this.hero.gasSkillCdr} · 다음 ${this.gasSkillCost('cdr')}`;
    return true;
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
    if (slot === this.altarSlot) {
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
    const empty = this.slots.find((s) => !s.tower && s !== this.altarSlot);
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
      if (isGod && !this.scoredGods.has(result.produced.name)) {
        this.scoredGods.add(result.produced.name);
        this.score += S.GOD_TOWER_SCORE;
      }
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
  get probeCost(): number {
    return B.probeCost(this.probes);
  }

  buyProbe(): boolean {
    if (this.probes >= B.PROBE_MAX) {
      this.message = `프로브는 최대 ${B.PROBE_MAX}기입니다.`;
      return false;
    }
    const cost = this.probeCost;
    if (this.mineral < cost) {
      this.message = `미네랄 부족 — 프로브 ${cost} 필요.`;
      return false;
    }
    this.mineral -= cost;
    this.probes++;
    this.message = `프로브 ${this.probes}기 — 가스를 채취합니다. 다음 ${this.probeCost}.`;
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

  // ── 골드 스탯 구매 ──
  statCost(stat: H.StatId): number {
    return this.hero.statCost(stat);
  }

  canBuyStat(stat: H.StatId): boolean {
    return !this.over && this.mineral >= this.statCost(stat);
  }

  /** 미네랄로 스탯 1포인트를 산다 — 힘(공격·체력) / 민첩(공속) / 지능(스킬) */
  buyStat(stat: H.StatId): boolean {
    const cost = this.statCost(stat);
    if (this.mineral < cost) {
      this.message = `미네랄 부족 — ${H.STAT_LABEL[stat]} ${cost} 필요.`;
      return false;
    }
    this.mineral -= cost;
    this.hero.buyStat(stat);
    this.message =
      `${H.STAT_LABEL[stat]} +1 (${this.hero.bought[stat]}) · 다음 ${this.statCost(stat)}`;
    return true;
  }

  // ── 라운드 ──
  private beginRound(): void {
    // 직전 라운드를 넘긴 대가 — 첫 라운드에는 없다
    if (this.round >= 1) {
      const reward = B.waveReward(this.round);
      this.mineral += reward;
      this.score += S.roundScore(this.round);
      this.float(this.slots[0].x, this.slots[0].y, `웨이브 +${reward}`, '#ffd23f');
    }

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
    this.score = Math.max(0, this.score - S.leakPenalty(this.round) * cost);
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
      this.score += S.bossScore(level);
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
    this.score += S.KILL_SCORE;
    const income = killIncome(before, this.kills);
    if (income.mineral > 0) {
      this.mineral += income.mineral;
      this.float(x, y, `+${income.mineral}`, '#8fd6ff');
      if (income.notes.length) this.message = income.notes.join(' · ');
    }
    this.mineral += this.hero.stats.mineralPerKill;
    this.grantXp(enemy.lastHitByHero ? H.XP_PER_MOB * H.HERO_LASTHIT_XP_MULT : H.XP_PER_MOB);
  }

  /** 경험치는 타워가 잡든 영웅이 잡든 들어온다. 레벨업 시 증강 선택을 띄운다. */
  private grantXp(amount: number): void {
    const hero = this.hero;
    const levels = hero.gainXp(amount);
    if (levels > 0) {
      this.score += S.HERO_LEVEL_SCORE * levels;
      this.float(hero.x, hero.y, `Lv${hero.level}!`, '#ffd23f');
    }
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

    this.advanceEnemies(dt);

    this.fireTowers(dt);
    this.stepHero(dt);
    if (this.shouldAutoCastSkill) this.useSkill();
    this.stepDecoy(dt);

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

  /**
   * 몹 전진. 영웅이 앞쪽 시야 안에 있으면 멈춰서 영웅부터 친다.
   * 이미 영웅을 지나쳐버린 몹은 되돌아오지 않는다 — 그래야 교착이 안 생긴다.
   */
  private advanceEnemies(dt: number): void {
    const hero = this.hero;
    const heroBlocks = hero.alive;
    const decoy = this.decoy;

    for (const enemy of this.enemies) {
      // 스킬 감속 디버프
      if (enemy.slowTimer !== undefined && enemy.slowTimer > 0) {
        enemy.slowTimer -= dt;
        if (enemy.slowTimer <= 0) enemy.slowFactor = undefined;
      }
      const debuff = enemy.slowFactor ?? 1;
      const speed = enemy.speed * this.slowAt(enemy.distance) * debuff;

      // 허수아비가 먼저 붙잡는다 — 보스는 도발 인형만 잡는다
      if (decoy && this.isDecoyAggroed(enemy, decoy) && (enemy.kind !== 'boss' || decoy.taunts)) {
        enemy.held = true;
        const gap = decoy.distance - enemy.distance;
        if (gap > H.ENEMY_TOUCH_RANGE) {
          enemy.distance += Math.min(speed * dt, gap - H.ENEMY_TOUCH_RANGE);
        }
        continue;
      }

      // 보스는 영웅에게 멈추지 않는다 — 지나가며 칠 뿐이다. 저지 불가라
      // 소환한 보스를 화력으로 못 잡으면 걸어나가 목숨을 문다.
      if (heroBlocks && enemy.kind !== 'boss' && this.isAggroed(enemy, hero)) {
        enemy.held = true;
        const gap = hero.distance - enemy.distance;
        // 영웅에게 다가가되 지나치지 않는다
        if (gap > H.ENEMY_TOUCH_RANGE) {
          enemy.distance += Math.min(speed * dt, gap - H.ENEMY_TOUCH_RANGE);
        }
        continue;
      }
      enemy.held = false;
      enemy.distance += speed * dt;
      if (enemy.distance >= PATH_LENGTH) {
        enemy.dead = true;
        this.breakthrough(enemy);
      }
    }
  }

  /**
   * 허수아비가 이 몹을 붙잡는가.
   * 도발 인형은 이미 지나친 몹도 끌어당긴다 — 원거리 영웅에게 탱킹을 대신 해준다.
   */
  private isDecoyAggroed(enemy: Enemy, decoy: Decoy): boolean {
    const gap = decoy.distance - enemy.distance;
    if (gap < -H.ENEMY_TOUCH_RANGE && !decoy.taunts) return false;
    return Math.abs(gap) <= K.DECOY_AGGRO_RANGE;
  }

  /** 허수아비를 때리고, 수명이나 체력이 다하면 치운다 */
  private stepDecoy(dt: number): void {
    const decoy = this.decoy;
    if (!decoy) return;

    decoy.life -= dt;
    this.decoyHitTimer -= dt;

    if (this.decoyHitTimer <= 0) {
      let incoming = 0;
      for (const enemy of this.enemies) {
        if (Math.abs(enemy.distance - decoy.distance) > H.ENEMY_TOUCH_RANGE + enemy.radius) continue;
        incoming +=
          enemy.kind === 'boss'
            ? H.bossDamage(enemy.bossLevel ?? 1, this.round)
            : H.enemyDamage(this.round);
      }
      decoy.hp -= incoming;
      this.decoyHitTimer = H.ENEMY_ATTACK_INTERVAL;
    }

    if (decoy.hp <= 0 || decoy.life <= 0) {
      const [x, y] = pathPos(decoy.distance);
      this.float(x, y, '허수아비 파괴', '#8a8fa8');
      this.decoy = null;
    }
  }

  /**
   * 경로 위 한 지점에 걸린 이동속도 배수.
   * 크리쳐 타워 여러 기가 겹쳐도 가장 강한 감속 하나만 적용한다.
   */
  slowAt(distance: number): number {
    const [x, y] = pathPos(distance);
    let slowest = 1;
    for (const slot of this.slots) {
      const tower = slot.tower;
      if (!tower) continue;
      const factor = slowFactor(tower);
      if (factor >= slowest) continue;
      if (Math.hypot(slot.x - x, slot.y - y) <= range(tower)) slowest = factor;
    }
    return slowest;
  }

  /** 몹 앞쪽 시야 안에 살아있는 영웅이 있는가 */
  private isAggroed(enemy: Enemy, hero: Hero): boolean {
    const gap = hero.distance - enemy.distance;
    if (gap < -H.ENEMY_TOUCH_RANGE) return false; // 이미 지나쳤다
    return gap <= H.HERO_AGGRO_RANGE;
  }

  /** 영웅 이동 · 공격, 그리고 적의 반격 */
  private stepHero(dt: number): void {
    const hero = this.hero;
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
              const dealt = B.effectiveDamage(stats.damage, enemy.armor);
              enemy.hp -= dealt;
              this.heroDamageDealt += dealt;
              enemy.lastHitByHero = true;
            }
          }
          this.shots.push({
            x: hero.x, y: hero.y, tx, ty, life: 0.1,
            color: '#c065e0', splashRadius: stats.splashRadius,
          });
        } else {
          const dealt = B.effectiveDamage(stats.damage, target.armor);
          target.hp -= dealt;
          this.heroDamageDealt += dealt;
          target.lastHitByHero = true;
          this.shots.push({ x: hero.x, y: hero.y, tx, ty, life: 0.1, color: '#ffffff' });
        }
        hero.attackCooldown = stats.attackInterval;
      }
    }

    // 적의 반격 — 영웅에 닿은 적이 때린다
    this.heroHitTimer -= dt;
    if (this.heroHitTimer <= 0) {
      const decoy = this.decoy;
      let incoming = 0;
      for (const enemy of this.enemies) {
        // 허수아비에 붙어 있는 몹은 영웅을 때리지 않는다
        if (decoy && Math.abs(enemy.distance - decoy.distance) <= H.ENEMY_TOUCH_RANGE + enemy.radius) {
          continue;
        }
        const gap = Math.abs(enemy.distance - hero.distance);
        if (gap > H.ENEMY_TOUCH_RANGE + enemy.radius) continue;
        incoming +=
          enemy.kind === 'boss'
            ? H.bossDamage(enemy.bossLevel ?? 1, this.round)
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

      const raw = damage(tower, this.upgrades) * this.hero.stats.towerDamageMult;
      const color = RACE_COLOR[tower.def.race];

      if (isSplash(tower)) {
        for (const e of inReach) {
          const dealt = B.effectiveDamage(raw, e.armor);
          e.hp -= dealt;
          this.towerDamageDealt += dealt;
          if (e.held) this.tankAssistDamage += dealt;
          e.lastHitByHero = false;
        }
        const [x, y] = pathPos(inReach[0].distance);
        this.shots.push({ x: slot.x, y: slot.y, tx: x, ty: y, life: 0.08, color, splashRadius: reach });
      } else {
        // 파워는 체력 최대(보스) 우선, 그 외에는 가장 멀리 간 적(돌파 임박) 우선
        const power = tower.def.tags.includes('power');
        // 파워는 체력 최대(보스) 우선, 그 외에는 출구에 가장 가까운 적 우선
        const target = inReach.reduce((best, e) =>
          power ? (e.hp > best.hp ? e : best) : e.distance > best.distance ? e : best,
        );
        const dealt = B.effectiveDamage(raw, target.armor);
        target.hp -= dealt;
        this.towerDamageDealt += dealt;
        if (target.held) this.tankAssistDamage += dealt;
        target.lastHitByHero = false;
        const [x, y] = pathPos(target.distance);
        this.shots.push({ x: slot.x, y: slot.y, tx: x, ty: y, life: 0.08, color });
      }
      tower.cooldown = attackInterval(tower);
    }
  }
}
