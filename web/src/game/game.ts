// ───────── 게임 로직 (DOM 없음 — 테스트 가능) ─────────
// 출처: docs/reference/god-td-x-vz056-map-analysis-v1.0.md

import * as B from '../data/balance';
import * as H from '../data/hero';
import * as K from '../data/skills';
import * as S from '../data/score';
import { PATH_LENGTH, SLOT_POS, pathPos, type PathProjection } from '../core/map';
import { GOD_TIER, RACE_COLOR, tagLabel, type Race } from '../data/units';
import type { AugmentCard } from '../data/hero';
import { attackInterval, damage, isSplash, range, slowFactor, type UpgradeLevels } from './combat';
import { bossKillMineral, killIncome } from './economy';
import { Hero, rollAugmentChoices, type HeroStats } from './hero';
import { findMerge, unitFor, type Rand } from './merge';
import type { Decoy, Enemy, EnemySpec, FloatText, Shot, Slot, Zone } from './types';

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

  /** 누적 유닛 생성 횟수. 조합으로 타워가 줄어도 이 값은 내려가지 않는다. */
  unitsSpawned = 0;
  /** 다음 유닛의 가격 — 누적 생성 횟수를 따라 오른다 */
  get spawnCost(): number {
    return B.spawnUnitCost(this.unitsSpawned);
  }

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
  /** 클릭해서 들여다보는 몹/보스 (죽으면 자동 해제) */
  selectedEnemy: Enemy | null = null;
  /** 라운드 종료 시 복제할 타워 ('복제 장치' 증강) */
  copyTarget: Slot | null = null;

  enemies: Enemy[] = [];
  shots: Shot[] = [];
  floats: FloatText[] = [];
  /** 영웅이 세운 미끼 (허수아비 스킬) */
  decoy: Decoy | null = null;
  /** 깔려 있는 장판들 (불바다·빙판) */
  zones: Zone[] = [];
  /** 지금 쏘고 있는 레이저 빔 (없으면 null) */
  beam: {
    skill: K.ResolvedSkill;
    remaining: number;
    tickTimer: number;
    /** 쏘기 시작한 지점 — 빔은 영웅을 따라간다 */
    origin: number;
  } | null = null;

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

  /** 증강 선택 중에는 시간이 흐르지 않는다. */
  get paused(): boolean {
    return this.augmentChoices.length > 0;
  }

  // ── 제단 · 영웅 ──
  /** 제단은 게임 시작과 함께 십자 중앙 타일에 주어진다. 그 자리에는 타워를 놓을 수 없다. */
  get altarSlot(): Slot {
    return this.slots[H.ALTAR_SLOT];
  }

  /** 우클릭 이동 — 보정된 실제 목적지를 돌려준다 (렌더러가 목적지 마커에 쓴다) */
  moveHero(x: number, y: number): PathProjection {
    return this.hero.moveTo(x, y);
  }

  /** 클릭 지점의 몹/보스를 고른다 (없으면 null). 보스는 크므로 더 넉넉히 잡는다. */
  enemyAt(x: number, y: number): Enemy | null {
    let best: Enemy | null = null;
    let bestDistance = Infinity;
    for (const enemy of this.enemies) {
      if (enemy.dead) continue;
      const [ex, ey] = pathPos(enemy.distance);
      const reach = enemy.radius + (enemy.kind === 'boss' ? 14 : 8);
      const gap = Math.hypot(ex - x, ey - y);
      if (gap <= reach && gap < bestDistance) {
        best = enemy;
        bestDistance = gap;
      }
    }
    return best;
  }

  // ── 액티브 스킬 (자동 시전) ──
  get canUseSkill(): boolean {
    // 채널링 중에는 다시 못 쓴다 (빔이 나가는 동안)
    return !this.over && !this.paused && this.beam === null && this.hero.skillReady;
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
      case 'smite':
        // 기본 스킬 — 사거리 안에 하나라도 있으면 값어치가 있다
        return live.filter((e) => Math.abs(e.distance - hero.distance) <= hero.stats.range).length;
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
      case 'laser':
        // 이미 쏘고 있으면 다시 안 쏜다. 빔은 앞쪽 직선만 태운다.
        if (this.beam) return 0;
        return live.filter((e) => {
          const gap = e.distance - hero.distance;
          return gap >= -H.ENEMY_TOUCH_RANGE && gap <= skill.beamLength;
        }).length;
      case 'firearrow':
      case 'icearrow':
        // 장판은 '가장 뭉친 곳'에 깐다 — 유성과 같은 셈법
        return live.reduce(
          (best, candidate) =>
            Math.max(
              best,
              live.filter((e) => Math.abs(e.distance - candidate.distance) <= skill.zoneRadius).length,
            ),
          0,
        );
      case 'execution':
        return live.filter((e) => Math.abs(e.distance - hero.distance) <= hero.stats.range).length;
      case 'chain':
        // 튕김은 몹이 많아야 값어치가 있다 — 사거리 안 적 수를 그대로 센다
        return live.filter((e) => Math.abs(e.distance - hero.distance) <= hero.stats.range).length;
    }
  }

  /** 스킬을 쓴다. 못 쓰면 false. */
  useSkill(): boolean {
    const hero = this.hero;
    const skill = hero.skill;
    if (!this.canUseSkill || !skill) return false;

    switch (skill.def.id) {
      case 'smite':
        this.castSmite(skill);
        break;
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
      case 'laser':
        this.castLaser(skill);
        hero.spendMana();
        // 채널링 — 빔이 나가는 동안은 마나가 차지 않는다 (tickBeam/stepHero가 막는다)
        return true;
      case 'firearrow':
      case 'icearrow':
        this.castZoneArrow(skill);
        break;
      case 'execution':
        this.castExecution(skill);
        return true; // 마나는 castExecution이 정한다 (처치하면 마나가 안 든다)
      case 'chain':
        this.castChain(skill);
        break;
    }
    hero.spendMana();
    return true;
  }

  /**
   * 레이저 — 즉발이 아니라 지속이다. 여기서는 빔을 '켜기만' 하고,
   * 실제 피해는 tickBeam이 tickInterval마다 넣는다.
   */
  private castLaser(skill: K.ResolvedSkill): void {
    this.beam = { skill, remaining: skill.beamSeconds, tickTimer: 0, origin: this.hero.distance };
    this.float(this.hero.x, this.hero.y, '레이저!', '#c065e0');
  }

  /** 불화살·얼음화살 — 착탄 피해 + 바닥에 장판 */
  private castZoneArrow(skill: K.ResolvedSkill): void {
    const hero = this.hero;
    const live = this.enemies.filter((e) => !e.dead);
    // 가장 뭉친 지점에 쏜다
    let best = hero.distance;
    let bestCount = -1;
    for (const candidate of live) {
      const count = live.filter(
        (e) => Math.abs(e.distance - candidate.distance) <= skill.zoneRadius,
      ).length;
      if (count > bestCount) {
        bestCount = count;
        best = candidate.distance;
      }
    }

    // 착탄 즉발 피해
    for (const enemy of live) {
      if (Math.abs(enemy.distance - best) <= skill.radius) this.skillHit(enemy, skill);
    }

    const [zx, zy] = pathPos(best);
    this.zones.push({
      distance: best,
      x: zx,
      y: zy,
      radius: skill.zoneRadius,
      remaining: skill.zoneSeconds,
      // 장판 피해는 영웅 공격력에 비례한다 — 고정값은 레벨을 못 따라간다
      // 불바다는 화염이다 — '점화'의 화염 배수를 함께 받는다
      dps: skill.zoneDps * hero.stats.skillPower *
        (skill.def.id === 'firearrow' ? hero.stats.fireDamageMult : 1),
      slow: skill.zoneSlow,
      color: skill.def.id === 'icearrow' ? '#7ce7ff' : '#ff8a3c',
    });
    this.float(zx, zy, skill.def.name + '!', skill.def.id === 'icearrow' ? '#7ce7ff' : '#ff8a3c');
  }

  /**
   * 처형자의 일격 — 체력이 가장 낮은 적을 때린다. 죽이면 쿨이 즉시 돌아온다.
   * '다중 투사'로 대상 수를 늘리면 낮은 순서대로 여러 명을 정리한다.
   */
  private castExecution(skill: K.ResolvedSkill): void {
    const hero = this.hero;
    const reach = hero.stats.range;
    const targets = this.enemies
      .filter((e) => !e.dead && Math.abs(e.distance - hero.distance) <= reach)
      .sort((a, b) => a.hp - b.hp)
      .slice(0, Math.max(1, skill.targets));

    let killed = false;
    for (const enemy of targets) {
      this.skillHit(enemy, skill);
      if (enemy.hp <= 0) killed = true;
      const [tx, ty] = pathPos(enemy.distance);
      this.shots.push({ x: hero.x, y: hero.y, tx, ty, life: 0.12, color: '#ff5a3c' });
    }

    // 처치하면 마나가 그대로 남는다 — 잘 고르면 연쇄 처형이 된다
    if (!killed) hero.spendMana();
    else this.float(hero.x, hero.y, '처형!', '#ff5a3c');
  }

  /** 스킬 피해 한 방 */
  private skillHit(enemy: Enemy, skill: K.ResolvedSkill, rawOverride?: number): void {
    const stats = this.hero.stats;
    const raw =
      rawOverride ?? this.hero.attackDamage * skill.damageMult * stats.skillPower;
    const dealt = B.effectiveDamage(this.burnAmped(enemy, raw), this.armorOf(enemy));

    // 불은 스킬이 붙인다 (평타가 아니라)
    this.applyBurn(enemy, stats);
    enemy.hp -= dealt;
    this.heroDamageDealt += dealt;
    enemy.lastHitByHero = true;
    if (skill.mods.slowFactor < 1) {
      enemy.slowFactor = skill.mods.slowFactor;
      enemy.slowTimer = skill.mods.slowSeconds;
    }
  }

  /** 강타 (기본 스킬, 6차) — 사거리 안 최근접 적 주변 좁은 범위를 때린다 */
  private castSmite(skill: K.ResolvedSkill): void {
    const hero = this.hero;
    const target = this.nearestEnemy(hero.x, hero.y, hero.stats.range);
    if (!target) return;
    for (const enemy of this.enemies) {
      if (Math.abs(enemy.distance - target.distance) <= skill.radius) this.skillHit(enemy, skill);
    }
    const [tx, ty] = pathPos(target.distance);
    this.float(tx, ty, '강타!', '#e3b23e');
    this.shots.push({
      x: hero.x, y: hero.y, tx, ty, life: 0.18,
      color: '#e3b23e', splashRadius: skill.radius,
    });
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

  // ── 증강 리롤 (마정석) ──
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

  /** 선택지 3장을 마정석로 다시 뽑는다 — 한 선택당 최대 2회 */
  rerollAugments(): boolean {
    if (this.augmentChoices.length === 0) return false;
    if (this.rerollsUsed >= H.AUGMENT_REROLL_MAX) {
      this.message = `리롤은 선택당 ${H.AUGMENT_REROLL_MAX}회까지입니다.`;
      return false;
    }
    const cost = this.rerollCost;
    if (this.gas < cost) {
      this.message = `마정석 부족 — 리롤 ${cost} 필요.`;
      return false;
    }
    this.gas -= cost;
    this.rerollsUsed++;
    this.augmentChoices = rollAugmentChoices(this.hero, this.rand);
    return true;
  }

  // ── 마정석 스킬 개조 ──
  gasSkillCost(track: 'damage' | 'cdr'): number {
    return K.gasSkillCost(track === 'damage' ? this.hero.gasSkillDamage : this.hero.gasSkillCdr);
  }

  canBuyGasSkill(track: 'damage' | 'cdr'): boolean {
    return !this.over && this.hero.skillId !== null && this.gas >= this.gasSkillCost(track);
  }

  /** 마정석로 스킬을 개조한다 — 종족 업그레이드와 같은 지갑을 두고 경쟁한다 */
  buyGasSkill(track: 'damage' | 'cdr'): boolean {
    if (this.hero.skillId === null) {
      this.message = '개조할 스킬이 없습니다 — 스킬 증강을 먼저 얻으세요.';
      return false;
    }
    const cost = this.gasSkillCost(track);
    if (this.gas < cost) {
      this.message = `마정석 부족 — 개조 ${cost} 필요.`;
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
    // 보스는 HP·속도 원본 그대로. 초반 느린 템포는 update의 combatDt가 보스·영웅·타워를 통째로
    // 같은 비율로 늦추므로(순수 슬로우모션) 보스전 난이도는 불변이다 — 여기서 손댈 게 없다.
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
    const cost = this.spawnCost;
    if (this.mineral < cost) {
      this.message = `금화 부족 — ${cost} 필요.`;
      return false;
    }
    this.mineral -= cost;
    this.unitsSpawned++;
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

  // ── 타워 복제 ('복제 장치' 증강) ──
  // 라운드 중에 타워 하나를 찍어두면 라운드가 끝날 때 빈 타일에 똑같은 게 하나 더 생긴다.
  // 상한 티어가 라운드·영웅 레벨을 따라 오르므로, "지금 뭘 복제할 수 있나"가 계속 바뀐다.

  /** 복제 증강을 들고 있는가 */
  get canCopyTower(): boolean {
    return this.hero.stats.towerCopyTier > 0;
  }

  /**
   * 지금 복제할 수 있는 최고 티어.
   * 증강이 준 기본 상한(towerCopyTier) + 라운드/영웅 레벨이 밀어올린 만큼.
   * 초반엔 싸구려만, 후반엔 GOD까지 — 복제가 "언젠가 쓸 카드"로 남는다.
   */
  get copyTierCap(): number {
    if (!this.canCopyTower) return -1;
    const base = this.hero.stats.towerCopyTier - 1; // 1스택 = 티어 0(가장 낮은 등급)까지
    const byRound = Math.floor(this.round / B.COPY_TIER_ROUNDS);
    const byLevel = Math.floor(this.hero.level / B.COPY_TIER_LEVELS);
    return Math.min(GOD_TIER, base + Math.max(byRound, byLevel));
  }

  /** 이 타워를 복제 예약할 수 있는가 */
  canMarkCopy(slot: Slot): boolean {
    return (
      this.canCopyTower &&
      slot.tower !== null &&
      slot.tower.tier <= this.copyTierCap &&
      this.slots.some((s) => !s.tower && s !== this.altarSlot)
    );
  }

  /** 라운드가 끝날 때 복제할 타워를 찍는다. 다시 찍으면 예약이 풀린다. */
  markCopyTarget(slot: Slot): boolean {
    if (this.copyTarget === slot) {
      this.copyTarget = null;
      this.message = '복제 예약을 취소했습니다.';
      return true;
    }
    if (!this.canCopyTower) return false;
    if (!slot.tower) {
      this.message = '복제할 타워를 고르세요.';
      return false;
    }
    if (slot.tower.tier > this.copyTierCap) {
      this.message = `아직 티어 ${this.copyTierCap}까지만 복제할 수 있습니다 (라운드·영웅 레벨이 오르면 열립니다).`;
      return false;
    }
    this.copyTarget = slot;
    this.message = `${slot.tower.def.name} 복제 예약 — 라운드가 끝나면 하나 더 생깁니다.`;
    return true;
  }

  /** 라운드 종료 — 예약된 타워를 빈 타일에 복제한다. 예약이 없으면 자동으로 최고 티어. */
  private resolveCopy(): void {
    let target = this.copyTarget;
    this.copyTarget = null;
    if (!this.canCopyTower) return;
    // 무조작 시 자동 선택 (2026-07-17 6차, 플레이테스트): 복제 가능한 것 중 최고 티어.
    // 예약 UI를 몰라도 증강이 놀지 않고, 아는 플레이어는 예약으로 덮어쓴다.
    if (!target?.tower) {
      target = this.slots
        .filter((s): s is Slot & { tower: NonNullable<Slot['tower']> } =>
          s.tower !== null && s.tower.tier <= this.copyTierCap)
        .sort((a, b) => b.tower.tier - a.tower.tier)[0] ?? null;
    }
    if (!target?.tower) return;

    const empty = this.slots.find((s) => !s.tower && s !== this.altarSlot);
    if (!empty) {
      this.message = '복제 실패 — 빈 타일이 없습니다.';
      return;
    }
    // 복제는 생성 비용을 올리지 않는다 (unitsSpawned를 건드리지 않는다) — 그게 복제의 값어치다
    empty.tower = { def: target.tower.def, tier: target.tower.tier, cooldown: 0 };
    this.float(empty.x, empty.y, `복제: ${target.tower.def.name}`, '#7ce7ff');
    this.message = `${target.tower.def.name}을(를) 복제했습니다.`;
    this.resolveMerges();
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

  // ── 광부 / 업그레이드 ──
  get probeCost(): number {
    return B.probeCost(this.probes);
  }

  buyProbe(): boolean {
    if (this.probes >= B.PROBE_MAX) {
      this.message = `광부는 최대 ${B.PROBE_MAX}기입니다.`;
      return false;
    }
    const cost = this.probeCost;
    if (this.mineral < cost) {
      this.message = `금화 부족 — 광부 ${cost} 필요.`;
      return false;
    }
    this.mineral -= cost;
    this.probes++;
    this.message = `광부 ${this.probes}기 — 마정석를 채취합니다. 다음 ${this.probeCost}.`;
    return true;
  }

  upgrade(race: Race): boolean {
    const cost = B.upgradeGasCost(this.upgrades[race]);
    if (this.gas < cost) {
      this.message = `마정석 부족 — 업그레이드 ${cost} 필요.`;
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
  get canBuyXp(): boolean {
    return !this.over && this.hero.alive && this.mineral >= H.XP_BUY_GOLD;
  }

  /** 골드로 XP 구매 (TFT식) — 영웅 성장의 주 연료 */
  buyXp(): boolean {
    if (!this.canBuyXp) {
      this.message = `금화 부족 — XP 구매 ${H.XP_BUY_GOLD} 필요.`;
      return false;
    }
    this.mineral -= H.XP_BUY_GOLD;
    this.grantXp(H.XP_BUY_AMOUNT);
    return true;
  }

  // ── 라운드 ──
  private beginRound(): void {
    // 직전 라운드를 넘긴 대가 — 첫 라운드에는 없다
    if (this.round >= 1) {
      // 경제 증강은 라운드 보상에 **배수**로 붙는다 — 보상 자체가 라운드를 따라 커지므로
      const reward = Math.round(B.waveReward(this.round) * this.hero.stats.waveRewardMult);
      this.mineral += reward;
      this.score += S.roundScore(this.round);
      this.float(this.slots[0].x, this.slots[0].y, `웨이브 +${reward}`, '#ffd23f');

      // 경제 증강의 라운드 수입
      const stats = this.hero.stats;
      if (stats.mineralPerWave > 0) this.mineral += stats.mineralPerWave;
      if (stats.gasPerWave > 0) this.gas += stats.gasPerWave;
      if (stats.mineralPerWave > 0 || stats.gasPerWave > 0) {
        const parts: string[] = [];
        if (stats.mineralPerWave > 0) parts.push(`+${stats.mineralPerWave} 금화`);
        if (stats.gasPerWave > 0) parts.push(`+${stats.gasPerWave} 마정석`);
        this.float(this.hero.x, this.hero.y, parts.join(' · '), '#8fd6ff');
      }

      // 성장 증강 — 라운드를 넘길 때마다 누적된다
      this.hero.waveStacks++;

      // 라운드가 끝났으니 예약된 타워를 복제한다
      this.resolveCopy();
    }

    this.round++;
    // 초반 느린 템포 — 몹 체력을 ×p로 낮춘다. 이동·공속은 update의 combatDt가 함께 늦춘다.
    const hp = Math.round(B.enemyHP(this.round) * B.earlyTempo(this.round));
    const armor = B.enemyArmor(this.round);

    const waveType = B.waveTypeOf(this.round);
    for (let i = 0; i < B.enemyCount(this.round); i++) {
      this.spawnQueue.push({
        kind: 'mob',
        name: `R${this.round}`,
        maxHp: hp,
        armor,
        speed: B.ENEMY_SPEED,
        radius: 9,
        contactDamageMult: waveType.contactDamageMult,
        typeColor: waveType.id === 'normal' ? undefined : waveType.color,
      });
    }
    this.message =
      waveType.id === 'normal'
        ? `Round Start — ${this.round}라운드`
        : `Round Start — ${this.round}라운드 · ${waveType.label} 웨이브! (접촉 피해 ×${waveType.contactDamageMult})`;
  }

  /** 모든 적은 북측 왼쪽 문 하나에서 나온다 */
  private spawn(spec: EnemySpec): void {
    this.enemies.push({
      ...spec,
      hp: spec.maxHp,
      distance: 0,
      // 2열 레인 — 잡몹은 좌/우 교대, 보스는 중앙. 표시 전용(판정은 distance 1D)
      lane: spec.kind === 'boss' ? 0 : this.enemies.length % 2 === 0 ? -1 : 1,
    });
  }

  // ── 누출 / 처치 ──
  private breakthrough(enemy: Enemy): void {
    const cost = enemy.kind === 'boss' ? B.bossLeakLives(enemy.bossLevel ?? 1) : 1;
    this.lives -= cost;
    this.mineral += B.LEAK_MINERAL;
    this.score = Math.max(0, this.score - S.leakPenalty(this.round) * cost);
    const [x, y] = pathPos(enemy.distance);
    this.float(x, y, `Life -${cost} · 금화 +${B.LEAK_MINERAL}`, '#ff5a3c');
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
      this.message = `Lv${level} BOSS 처치! +${reward} 금화${suffix}`;
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

    // 처치 수입은 누가 잡았든 들어온다 (경제 증강의 기존 동작 유지)
    this.mineral += this.hero.stats.mineralPerKill;

    if (enemy.lastHitByHero) {
      // 성장 증강 — 영웅 막타만 센다. 타워가 잡은 몹은 영웅을 키우지 않는다.
      this.hero.killStacks++;
      this.heroExplode(enemy, x, y);
    }
    this.grantXp(enemy.lastHitByHero ? H.XP_PER_MOB * H.HERO_LASTHIT_XP_MULT : H.XP_PER_MOB);
  }

  /**
   * 폭사 — 영웅이 잡은 적이 터진다.
   * 폭발이 죽인 적은 다시 터지지 않는다(연쇄 금지). 무한 연쇄를 막는 안전장치다.
   */
  private heroExplode(enemy: Enemy, x: number, y: number): void {
    const stats = this.hero.stats;
    if (stats.deathBlast <= 0 || stats.deathBlastRadius <= 0) return;

    const raw = this.hero.attackDamage * stats.deathBlast;
    for (const other of this.enemies) {
      if (other === enemy || other.dead) continue;
      const [ox, oy] = pathPos(other.distance);
      if (Math.hypot(ox - x, oy - y) > stats.deathBlastRadius) continue;
      const dealt = B.effectiveDamage(raw, other.armor);
      other.hp -= dealt;
      this.heroDamageDealt += dealt;
      // lastHitByHero를 켜지 않는다 — 폭발 막타가 다시 폭발을 부르면 연쇄가 된다
    }
    this.shots.push({
      x, y, tx: x, ty: y, life: 0.15,
      color: '#ff5a3c', splashRadius: stats.deathBlastRadius,
    });
  }

  /** 경험치는 타워가 잡든 영웅이 잡든 들어온다. 레벨업 시 증강 선택을 띄운다. */
  private grantXp(amount: number): void {
    const hero = this.hero;
    const levels = hero.gainXp(amount * hero.stats.xpMult);
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
        // 동시 몹 상한 (2026-07-17 6차): 필드의 일반 몹이 상한이면 스폰을 미룬다 —
        // 후반에 웨이브가 겹쳐 수십 기가 쌓이는 압사를 막는다 (총 체력은 그대로,
        // 압력이 시간으로 펴진다). 보스는 상한과 무관.
        const normals = this.enemies.filter((e) => e.kind !== 'boss' && !e.dead).length;
        if (normals < B.MAX_ALIVE_MOBS) {
          this.spawn(this.spawnQueue.shift()!);
          this.spawnTimer = B.SPAWN_INTERVAL;
        } else {
          this.spawnTimer = B.SPAWN_INTERVAL; // 잠시 뒤 다시 시도
        }
      }
    }

    // 초반 느린 템포 — 전투 스텝만 combatDt로 늦춘다(순수 슬로우모션). 위의 라운드 타이머·
    // 스폰·마정석·보스 쿨다운은 실시간 dt를 써서 라운드 진행 속도는 그대로 유지한다.
    const combatDt = dt * B.earlyTempo(this.round);

    this.advanceEnemies(combatDt);

    this.fireTowers(combatDt);
    this.stepHero(combatDt);
    // 영웅 생사와 무관하게 돌아야 한다 — 화상·장판은 계속 타고, 사망 폭발은 죽는 순간 터진다
    this.tickBurns(combatDt);
    this.tickBeam(combatDt);
    this.tickZones(combatDt);
    this.tickNova();
    if (this.shouldAutoCastSkill) this.useSkill();
    this.stepDecoy(combatDt);

    for (const enemy of this.enemies) {
      if (enemy.hp <= 0 && !enemy.dead) {
        enemy.dead = true;
        this.onKilled(enemy);
      }
    }
    if (this.selectedEnemy?.dead) this.selectedEnemy = null;
    this.enemies = this.enemies.filter((e) => !e.dead);

    // 투사체 궤적은 전투의 일부 — combatDt로 함께 늦춘다. (아래 떠오르는 텍스트는 UI라 실시간)
    for (const shot of this.shots) shot.life -= combatDt;
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
      const attackers: Enemy[] = [];
      for (const enemy of this.enemies) {
        if (Math.abs(enemy.distance - decoy.distance) > H.ENEMY_TOUCH_RANGE + enemy.radius) continue;
        incoming +=
          enemy.kind === 'boss'
            ? H.bossDamage(enemy.bossLevel ?? 1, this.round)
            : H.enemyDamage(this.round) * (enemy.contactDamageMult ?? 1);
        attackers.push(enemy);
      }
      decoy.hp -= incoming;

      // 가시는 허수아비에게도 걸린다 ('가시오라') — 미끼가 스스로 되받아친다
      const thorns = this.hero.stats.thorns;
      if (thorns > 0 && incoming > 0 && attackers.length > 0) {
        const back = (incoming * thorns) / attackers.length;
        for (const enemy of attackers) {
          const dealt = B.effectiveDamage(back, enemy.armor);
          enemy.hp -= dealt;
          this.heroDamageDealt += dealt;
          enemy.lastHitByHero = true;
        }
      }
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
    // '도발' 계열이 어그로 범위를 넓힌다 — 더 많이 붙잡는다
    return gap <= hero.stats.aggroRange;
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
        // 치명타는 공격당 한 번만 굴린다 — 광역이어도 대상마다 다시 굴리지 않는다
        const crit = stats.critChance > 0 && this.rand() < stats.critChance;
        const raw = hero.attackDamage * (crit ? stats.critMult : 1);

        if (stats.splashRadius > 0) {
          for (const enemy of this.enemies) {
            const [ex, ey] = pathPos(enemy.distance);
            if (Math.hypot(ex - tx, ey - ty) <= stats.splashRadius) {
              this.heroHitEnemy(enemy, raw, stats);
            }
          }
          this.shots.push({
            x: hero.x, y: hero.y, tx, ty, life: 0.1,
            color: '#c065e0', splashRadius: stats.splashRadius,
          });
        } else {
          this.heroHitEnemy(target, raw, stats);
          this.shots.push({
            x: hero.x, y: hero.y, tx, ty, life: 0.1,
            color: crit ? '#ffd23f' : '#ffffff',
          });
        }
        if (crit) this.float(tx, ty, 'CRIT!', '#ffd23f');
        hero.attackCooldown = stats.attackInterval;
        // 평타가 마나를 채운다 (TFT식) — 채널링 중에는 안 찬다
        if (this.beam === null) hero.gainMana(K.MANA_PER_ATTACK);
      }
    }


    // 적의 반격 — 영웅에 닿은 적이 때린다
    this.heroHitTimer -= dt;
    if (this.heroHitTimer <= 0) {
      const decoy = this.decoy;
      let incoming = 0;
      const attackers: Enemy[] = [];
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
            : H.enemyDamage(this.round) * (enemy.contactDamageMult ?? 1);
        attackers.push(enemy);
      }
      if (incoming > 0) {
        hero.takeDamage(incoming);
        this.float(hero.x, hero.y, `-${Math.round(incoming)}`, '#ff5a3c');

        // 가시 갑옷 — 받은 피해를 때린 적들에게 나눠 되돌린다
        if (stats.thorns > 0 && attackers.length > 0) {
          const back = (incoming * stats.thorns) / attackers.length;
          for (const enemy of attackers) {
            const dealt = B.effectiveDamage(back, enemy.armor);
            enemy.hp -= dealt;
            this.heroDamageDealt += dealt;
            enemy.lastHitByHero = true;
          }
        }
        if (!hero.alive) {
          this.message = `영웅 사망 — ${Math.ceil(hero.respawnTimer)}초 뒤 제단에서 부활합니다.`;
        }
      }
      this.heroHitTimer = H.ENEMY_ATTACK_INTERVAL;
    }
  }

  /**
   * 화상 증폭 — 불타는 적은 영웅의 **모든** 피해를 더 받는다.
   * 평타·스킬·장판·레이저·폭사가 전부 이득을 본다. 도트끼리 시너지가 나는 지점이다.
   */
  /**
   * 튕기는 사격 — 가장 가까운 적을 맞히고 다음 적으로 넘어간다. **넘어갈 때마다 세진다.**
   * 그래서 몹이 적으면 첫 타에서 끝나 가장 약한 스킬이고, 뭉쳤을 때 가장 강하다.
   */
  private castChain(skill: K.ResolvedSkill): void {
    const hero = this.hero;
    const hit = new Set<Enemy>();
    let current = this.nearestEnemy(hero.x, hero.y, hero.stats.range);
    if (!current) return;

    let raw = hero.attackDamage * skill.damageMult * hero.stats.skillPower;
    let from: [number, number] = [hero.x, hero.y];

    for (let bounce = 0; bounce <= skill.bounces && current; bounce++) {
      hit.add(current);
      this.skillHit(current, skill, raw);

      const [tx, ty] = pathPos(current.distance);
      this.shots.push({ x: from[0], y: from[1], tx, ty, life: 0.12, color: '#7ce7ff' });
      if (bounce > 0) this.float(tx, ty, `×${bounce + 1}`, '#7ce7ff');
      from = [tx, ty];

      // 다음 대상 — 아직 안 맞은 가장 가까운 적
      let next: Enemy | null = null;
      let best = skill.bounceRange;
      for (const enemy of this.enemies) {
        if (enemy.dead || hit.has(enemy)) continue;
        const gap = Math.abs(enemy.distance - current.distance);
        if (gap <= best) {
          best = gap;
          next = enemy;
        }
      }
      current = next;
      raw *= skill.bounceGrowth; // 튕길수록 세진다
    }
  }

  /** 방깎이 반영된 실제 장갑 */
  private armorOf(enemy: Enemy): number {
    return Math.max(0, enemy.armor - (enemy.armorShred ?? 0));
  }

  private burnAmped(enemy: Enemy, raw: number): number {
    const amp = this.hero.stats.burnAmp;
    if (amp <= 0 || !enemy.burnTimer || enemy.burnTimer <= 0) return raw;
    return raw * (1 + amp);
  }

  /**
   * 영웅의 한 방이 적에게 닿았을 때. 피해 + 발동 효과(흡혈·처형·화상·감속)를 한곳에서 처리한다.
   * 광역이면 대상마다 불린다.
   */
  private heroHitEnemy(enemy: Enemy, raw: number, stats: HeroStats): void {
    const dealt = B.effectiveDamage(this.burnAmped(enemy, raw), this.armorOf(enemy));
    enemy.hp -= dealt;
    this.heroDamageDealt += dealt;
    enemy.lastHitByHero = true;

    if (stats.lifesteal > 0 && this.hero.alive) {
      this.hero.heal(dealt * stats.lifesteal);
    }
    // 평타는 불을 붙이지 않는다 (2026-07-14) — 화상은 스킬·도트의 것이다.
    if (stats.armorShred > 0) this.shredArmor(enemy, stats.armorShred);
    if (stats.slowOnHit > 0) {
      const factor = 1 - stats.slowOnHit;
      // 이미 더 센 감속이 걸려 있으면 덮어쓰지 않는다
      if (enemy.slowFactor === undefined || factor < enemy.slowFactor) enemy.slowFactor = factor;
      enemy.slowTimer = Math.max(enemy.slowTimer ?? 0, H.SLOW_ON_HIT_SECONDS);
    }
    // 처형 — 보스는 예외다. 보스에 걸면 소환 즉시 증발한다.
    if (stats.executeBelow > 0 && enemy.hp > 0 && enemy.kind !== 'boss') {
      if (enemy.hp <= enemy.maxHp * stats.executeBelow) {
        this.heroDamageDealt += enemy.hp;
        enemy.hp = 0;
        this.float(...pathPos(enemy.distance), '처형', '#ff5a3c');
      }
    }
  }

  /**
   * 화상을 한 겹 얹는다. **스킬 적중과 도트 틱만** 이걸 부른다 — 평타는 불을 못 붙인다.
   *
   * 상한이 없다. 겹당 피해는 공격력과 무관한 고정값이라, 화염의 스케일링은
   * "얼마나 세게"가 아니라 **"얼마나 여러 겹"**에서 온다 — 도트가 빠를수록 두꺼워진다.
   */
  private applyBurn(enemy: Enemy, stats: HeroStats): void {
    if (stats.burnDamage <= 0) return;
    // 겹당 고정 피해 (공격력 계수 없음) × 화염 배수('점화')
    enemy.burnDps = stats.burnDamage * stats.fireDamageMult;
    enemy.burnTimer = stats.burnSeconds;
    enemy.burnStacks = (enemy.burnStacks ?? 0) + 1; // 상한 없음
  }

  /** 방어력을 깎는다 (맹독). 0 밑으로는 안 내려간다 — 타워 피해도 같이 이득을 본다. */
  private shredArmor(enemy: Enemy, amount: number): void {
    enemy.armorShred = Math.min(enemy.armor, (enemy.armorShred ?? 0) + amount);
  }

  /**
   * 화상 — 영웅이 붙인 지속 피해. 막타가 화상이어도 영웅 막타로 친다.
   *
   * **화상은 방어력을 무시한다(트루 피해).** 몹 장갑은 라운드마다 계단식으로 오르므로
   * (floor(R/5)×3), 후반으로 갈수록 화상이 유일하게 감산되지 않는 피해가 된다 —
   * 그게 화염 빌드의 정체성이다.
   */
  private tickBurns(dt: number): void {
    for (const enemy of this.enemies) {
      if (!enemy.burnTimer || enemy.burnTimer <= 0 || !enemy.burnDps) continue;
      enemy.burnTimer -= dt;

      const stacks = enemy.burnStacks ?? 1;
      const dealt = enemy.burnDps * stacks * dt; // 트루 피해 — effectiveDamage를 거치지 않는다
      enemy.hp -= dealt;
      this.heroDamageDealt += dealt;
      enemy.lastHitByHero = true;

      if (enemy.burnTimer <= 0) {
        enemy.burnDps = undefined;
        enemy.burnTimer = undefined;
        enemy.burnStacks = undefined;
      }
    }
  }

  /**
   * 레이저 빔 — tickInterval마다 앞쪽 직선의 적을 전부 지진다.
   * 빔은 영웅을 따라다닌다(영웅이 움직이면 태우는 줄도 움직인다).
   */
  private tickBeam(dt: number): void {
    const beam = this.beam;
    if (!beam) return;
    const hero = this.hero;
    if (!hero.alive) {
      this.beam = null;
      return;
    }

    beam.remaining -= dt;
    beam.tickTimer -= dt;
    beam.origin = hero.distance;

    if (beam.tickTimer <= 0) {
      beam.tickTimer = beam.skill.tickInterval;
      const raw = hero.attackDamage * beam.skill.damageMult * hero.stats.skillPower;
      for (const enemy of this.enemies) {
        if (enemy.dead) continue;
        const gap = enemy.distance - hero.distance;
        // 앞쪽 beamLength 안 + 경로에서 벗어난 레인은 beamWidth 안
        if (gap < -H.ENEMY_TOUCH_RANGE || gap > beam.skill.beamLength) continue;
        if (Math.abs((enemy.lane ?? 0) * 12) > beam.skill.beamWidth) continue;
        this.skillHit(enemy, beam.skill, raw); // 틱마다 화상 한 겹 (skillHit 안에서)
      }
      const [tx, ty] = pathPos(Math.min(PATH_LENGTH, hero.distance + beam.skill.beamLength));
      this.shots.push({ x: hero.x, y: hero.y, tx, ty, life: beam.skill.tickInterval, color: '#c065e0' });
    }

    // 채널이 끝나면 그때부터 다시 마나가 찬다 (빔 중에는 안 찬다)
    if (beam.remaining <= 0) this.beam = null;
  }

  /** 장판 — 불바다는 태우고 빙판은 늦춘다. 몹이 지나갈 수밖에 없는 길목에 깔린다. */
  private tickZones(dt: number): void {
    const stats = this.hero.stats;
    for (const zone of this.zones) {
      const wasWhole = Math.ceil(zone.remaining);
      zone.remaining -= dt;
      // 불바다는 1초에 한 번 화상을 얹는다 — 불화살 + 화염 부착이 한 빌드가 된다
      const burnTick = zone.dps > 0 && stats.burnDamage > 0 && Math.ceil(zone.remaining) < wasWhole;

      for (const enemy of this.enemies) {
        if (enemy.dead) continue;
        if (Math.abs(enemy.distance - zone.distance) > zone.radius) continue;

        if (zone.dps > 0) {
          const dealt = B.effectiveDamage(this.burnAmped(enemy, zone.dps * dt), this.armorOf(enemy));
          enemy.hp -= dealt;
          this.heroDamageDealt += dealt;
          enemy.lastHitByHero = true;
          if (burnTick) this.applyBurn(enemy, stats);
        }
        if (zone.slow < 1) {
          // 장판 안에 있는 동안만 느리다 — 나가면 곧 풀린다
          if (enemy.slowFactor === undefined || zone.slow < enemy.slowFactor) {
            enemy.slowFactor = zone.slow;
          }
          enemy.slowTimer = Math.max(enemy.slowTimer ?? 0, 0.3);
        }
      }
    }
    this.zones = this.zones.filter((z) => z.remaining > 0);
  }

  /** 사망·부활 폭발 ('초신성') — 죽는 순간과 돌아오는 순간을 자원으로 바꾼다 */
  private tickNova(): void {
    const hero = this.hero;
    const stats = hero.stats;

    // 초신성은 탱커의 마지막 한 방이다 — 체력 계수가 공격력 계수보다 크다
    const novaBase = (mult: number) => stats.damage * mult + stats.maxHp * stats.novaHpMult;

    if (hero.justDied) {
      hero.justDied = false;
      if (stats.deathNova > 0 || stats.novaHpMult > 0) {
        this.novaAt(hero.distance, novaBase(stats.deathNova), stats.novaRadius, '초신성!');
      }
    }
    if (hero.justRevived) {
      hero.justRevived = false;
      if (stats.reviveNova > 0 || stats.novaHpMult > 0) {
        this.novaAt(hero.distance, novaBase(stats.reviveNova), stats.novaRadius, '재림!');
      }
    }
  }

  private novaAt(distance: number, raw: number, radius: number, label: string): void {
    const [x, y] = pathPos(distance);
    for (const enemy of this.enemies) {
      if (enemy.dead || Math.abs(enemy.distance - distance) > radius) continue;
      const dealt = B.effectiveDamage(raw, this.armorOf(enemy));
      enemy.hp -= dealt;
      this.heroDamageDealt += dealt;
      enemy.lastHitByHero = true;
    }
    this.shots.push({ x, y, tx: x, ty: y, life: 0.3, color: '#ffd23f', splashRadius: radius });
    this.float(x, y, label, '#ffd23f');
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

      // '지휘' 계열이 타워 사거리를 넓힌다
      const reach = range(tower) * this.hero.stats.towerRangeMult;
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
