// ───────── 영웅 ─────────
// 제단에서 부활하고, 경로에 매이지 않고 자유롭게 움직이며(타워 사이도 통과),
// 처치 경험치로 레벨을 올리고, 일정 레벨마다 증강을 고른다.

import { ALTAR_PATH_DISTANCE, PATH_LENGTH, nearestPathDistance, pathPos } from '../core/map';
import * as H from '../data/hero';
import type { AugmentCard, AugmentEffect } from '../data/hero';
import * as K from '../data/skills';
import { foldMods, resolveSkill, type ResolvedSkill, type SkillId, type SkillModPatch } from '../data/skills';

export interface HeroStats {
  readonly maxHp: number;
  readonly damage: number;
  readonly range: number;
  readonly attackInterval: number;
  readonly moveSpeed: number;
  readonly regen: number;
  readonly damageReduction: number;
  /** 0이면 단일 공격 */
  readonly splashRadius: number;
  readonly mineralPerKill: number;
  readonly respawnSeconds: number;
  readonly towerDamageMult: number;
  /** 스킬 피해 배수 — 지능이 키운다 */
  readonly skillPower: number;
}

/** 골드로 산 스탯 포인트 */
export interface BoughtStats {
  readonly str: number;
  readonly agi: number;
  readonly int: number;
}

export const NO_STATS: BoughtStats = { str: 0, agi: 0, int: 0 };

/** 증강 카드를 접어서 최종 스탯을 만든다. 순수 함수 — 테스트하기 쉽다. */
export function computeStats(
  _level: number,
  cards: readonly AugmentCard[],
  bought: BoughtStats = NO_STATS,
): HeroStats {
  // 파워 = 스탯(레벨업 택1 적립) × 증강 배수 — 레벨 배수는 폐지 (2안 개편)
  const str = H.HERO_BASE_STR + bought.str;
  const agi = H.HERO_BASE_AGI + bought.agi;
  const int = H.HERO_BASE_INT + bought.int;

  let maxHp = H.HP_PER_STR * str;
  let damage = H.DMG_PER_STR * str;
  let range = H.HERO_BASE_RANGE;
  let attackSpeed = 1 + H.AS_PER_AGI * agi;
  let moveSpeed = H.HERO_SPEED;
  let regen = 0;
  let splashRadius = 0;
  let mineralPerKill = 0;
  let respawnCut = 0;
  let towerDamageMult = 1;

  // 피해 감소는 곱연산으로 쌓아 100%에 도달하지 않게 한다
  let damageTaken = 1;

  const effects: AugmentEffect[] = [
    ...cards.map((c) => c.effect),
    ...H.activeSynergies(cards).map((s) => s.effect),
  ];

  for (const e of effects) {
    if (e.hpMult) maxHp *= e.hpMult;
    if (e.damageMult) damage *= e.damageMult;
    if (e.rangeMult) range *= e.rangeMult;
    if (e.attackSpeedMult) attackSpeed *= e.attackSpeedMult;
    if (e.moveSpeedMult) moveSpeed *= e.moveSpeedMult;
    if (e.regen) regen += e.regen;
    if (e.damageReduction) damageTaken *= 1 - e.damageReduction;
    if (e.splashRadius) splashRadius += e.splashRadius;
    if (e.mineralPerKill) mineralPerKill += e.mineralPerKill;
    if (e.respawnCut) respawnCut += e.respawnCut;
    if (e.towerDamageMult) towerDamageMult *= e.towerDamageMult;
  }

  return {
    maxHp: Math.round(maxHp),
    damage: Math.round(damage),
    range,
    attackInterval: Math.max(H.MIN_ATTACK_INTERVAL, H.HERO_ATTACK_INTERVAL / attackSpeed),
    moveSpeed,
    regen,
    damageReduction: 1 - damageTaken,
    splashRadius,
    mineralPerKill,
    respawnSeconds: Math.max(3, H.HERO_RESPAWN_SECONDS - respawnCut),
    towerDamageMult,
    skillPower: 1 + H.SKILL_PER_INT * int,
  };
}

/**
 * 영웅은 몹과 같은 경로 위에서만 움직인다. 타워 타일을 넘어 날아다닐 수 없다.
 * 그래서 위치는 좌표가 아니라 경로 위 거리 하나로 표현된다.
 */
export class Hero {
  /** 경로 위 현재 거리 */
  distance: number;
  /** 경로 위 목적지 */
  targetDistance: number;

  hp: number;
  level = 1;
  xp = 0;
  alive = true;
  respawnTimer = 0;
  attackCooldown = 0;
  /** 액티브 스킬 재사용 대기 */
  skillCooldown = 0;
  /** 레벨업이 focus 스탯에 적립한 포인트 (2안 개편 — 골드 구매 아님) */
  bought: BoughtStats = NO_STATS;

  /** 레벨업 포인트가 들어갈 스탯 — 기본값은 마지막 선택 반복 (비차단 UI) */
  focus: H.StatId = 'str';

  /** 가스로 산 스킬 개조 횟수 */
  gasSkillDamage = 0;
  gasSkillCdr = 0;

  /** bought가 곧 포인트다 (환산 없음) */
  get points(): BoughtStats {
    return this.bought;
  }

  readonly augments: AugmentCard[] = [];
  /** 아직 고르지 않은 증강 선택 횟수 */
  pendingAugmentPicks = 0;

  constructor(readonly altarDistance: number = ALTAR_PATH_DISTANCE) {
    this.distance = altarDistance;
    this.targetDistance = altarDistance;
    this.hp = this.stats.maxHp;
  }

  get x(): number {
    return pathPos(this.distance)[0];
  }

  get y(): number {
    return pathPos(this.distance)[1];
  }

  get stats(): HeroStats {
    return computeStats(this.level, this.augments, this.points);
  }

  /** 레벨업 보상 — focus 스탯에 포인트 적립. 체력이 늘면 증가분을 채워준다. */
  grantStatPoints(points: number): void {
    const before = this.stats.maxHp;
    this.bought = { ...this.bought, [this.focus]: this.bought[this.focus] + points };
    const after = this.stats.maxHp;
    if (after > before) this.hp += after - before;
  }

  get xpNeeded(): number {
    return H.xpToNext(this.level);
  }

  /** 증강을 몇 개 쌓았는지 */
  stacksOf(id: string): number {
    return this.augments.filter((c) => c.augment.id === id).length;
  }

  get hasSplash(): boolean {
    return this.stats.splashRadius > 0;
  }

  /** 들고 있는 액티브 스킬. 스킬 증강을 안 골랐으면 null. */
  get skillId(): SkillId | null {
    return this.augments.find((c) => c.augment.grantsSkill)?.augment.grantsSkill ?? null;
  }

  /** 개조가 반영된 스킬 수치 — 증강 개조와 가스 개조가 함께 접힌다 */
  get skill(): ResolvedSkill | null {
    const id = this.skillId;
    if (!id) return null;
    const patches = this.augments
      .map((c) => c.augment.skillMod)
      .filter((m): m is NonNullable<typeof m> => m !== undefined);
    const gas: SkillModPatch[] = [];
    if (this.gasSkillDamage > 0)
      gas.push({ damageMult: Math.pow(K.GAS_SKILL_DAMAGE_MULT, this.gasSkillDamage) });
    if (this.gasSkillCdr > 0)
      gas.push({ cooldownMult: Math.pow(K.GAS_SKILL_CDR_MULT, this.gasSkillCdr) });
    return resolveSkill(id, foldMods([...patches, ...gas]));
  }

  get skillReady(): boolean {
    return this.alive && this.skillId !== null && this.skillCooldown <= 0;
  }

  /** 클릭 좌표를 경로에 투영해서 목적지로 삼는다 */
  moveTo(x: number, y: number): void {
    this.targetDistance = nearestPathDistance(x, y);
  }

  /** 경로 위 거리를 직접 지정 (테스트·내부용) */
  moveToDistance(distance: number): void {
    this.targetDistance = Math.min(PATH_LENGTH, Math.max(0, distance));
  }

  /** 경험치를 넣고, 레벨이 오르면 오른 레벨 수를 돌려준다 */
  gainXp(amount: number): number {
    if (!this.alive) return 0;
    this.xp += amount;
    let gained = 0;
    while (this.xp >= this.xpNeeded) {
      this.xp -= this.xpNeeded;
      this.level++;
      gained++;
      // 레벨업 = focus 스탯 포인트 적립 (2안 — 스탯 골드 구매 폐지)
      this.grantStatPoints(H.levelStatPoints(this.level));
      if (H.grantsAugment(this.level)) this.pendingAugmentPicks++;
    }
    if (gained > 0) this.hp = this.stats.maxHp; // 레벨업 시 완전 회복
    return gained;
  }

  takeDamage(raw: number): void {
    if (!this.alive) return;
    this.hp -= raw * (1 - this.stats.damageReduction);
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      this.respawnTimer = this.stats.respawnSeconds;
    }
  }

  addAugment(card: AugmentCard): void {
    this.augments.push(card);
    if (this.pendingAugmentPicks > 0) this.pendingAugmentPicks--;
    this.hp = Math.min(this.stats.maxHp, this.hp + (this.stats.maxHp - this.hp) * 0.5);
  }

  /** 이동 · 재생 · 부활. 전투는 Game이 처리한다. */
  step(dt: number): void {
    if (!this.alive) {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) this.respawn();
      return;
    }

    this.attackCooldown -= dt;
    if (this.skillCooldown > 0) this.skillCooldown = Math.max(0, this.skillCooldown - dt);

    const { moveSpeed, regen, maxHp } = this.stats;
    if (regen > 0) this.hp = Math.min(maxHp, this.hp + regen * dt);

    const gap = this.targetDistance - this.distance;
    if (Math.abs(gap) <= H.HERO_ARRIVE_EPSILON) return;

    const step = Math.min(Math.abs(gap), moveSpeed * dt);
    this.distance += Math.sign(gap) * step;
  }

  private respawn(): void {
    this.alive = true;
    this.skillCooldown = 0;
    this.hp = this.stats.maxHp;
    this.distance = this.altarDistance;
    this.targetDistance = this.altarDistance;
    this.respawnTimer = 0;
  }
}

/** 이 영웅에게 뜰 수 있는 증강인가 — 타입 제한은 없다, 스킬은 하나만 */
export function augmentAllowed(hero: Hero, augment: H.Augment): boolean {
  if (hero.stacksOf(augment.id) >= augment.maxStacks) return false;
  if (H.requiresSplash(augment) && !hero.hasSplash) return false;
  if (!H.skillGateAllows(augment, hero.skillId)) return false;
  return true;
}

/** 가중치를 따라 하나를 뽑아 인덱스를 돌려준다 */
function weightedIndex(weights: readonly number[], rand: () => number): number {
  const total = weights.reduce((sum, w) => sum + w, 0);
  let roll = rand() * total;
  for (let i = 0; i < weights.length; i++) {
    roll -= weights[i];
    if (roll < 0) return i;
  }
  return weights.length - 1;
}

/**
 * 증강 카드 3장을 뽑는다. 카드마다 등급이 따로 굴려진다.
 *
 * 가중치는 적응형이다 — 이미 든 계열일수록 더 잘 뜬다(ADAPTIVE_KIND_WEIGHT).
 * 그래서 특화는 강제가 아니라 드래프트의 관성으로 만들어진다.
 * 스킬 개조 증강은 이미 그 스킬을 든 영웅에게만 뜨므로 보유 스킬 계열만큼 기운다.
 */
export function rollAugmentChoices(hero: Hero, rand: () => number): AugmentCard[] {
  const remaining = H.AUGMENTS.filter((augment) => augmentAllowed(hero, augment));
  const heldByKind = new Map<H.AugmentKind, number>();
  for (const c of hero.augments) {
    heldByKind.set(c.augment.kind, (heldByKind.get(c.augment.kind) ?? 0) + 1);
  }
  const weightOf = (augment: H.Augment): number =>
    1 + H.ADAPTIVE_KIND_WEIGHT * (heldByKind.get(augment.kind) ?? 0);

  const cards: AugmentCard[] = [];
  while (cards.length < H.AUGMENT_CHOICES && remaining.length > 0) {
    const index = weightedIndex(remaining.map(weightOf), rand);
    cards.push(H.makeCard(remaining[index], H.rollRarity(rand)));
    remaining.splice(index, 1);
  }
  return cards;
}
