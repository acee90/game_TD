// ───────── 영웅 ─────────
// 제단에서 부활하고, 경로에 매이지 않고 자유롭게 움직이며(타워 사이도 통과),
// 처치 경험치로 레벨을 올리고, 일정 레벨마다 증강을 고른다.

import { ALTAR_PATH_DISTANCE, PATH_LENGTH, nearestPathDistance, pathPos } from '../core/map';
import * as H from '../data/hero';
import type { AugmentCard, AugmentEffect } from '../data/hero';

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
}

/** 증강 카드를 접어서 최종 스탯을 만든다. 순수 함수 — 테스트하기 쉽다. */
export function computeStats(level: number, cards: readonly AugmentCard[]): HeroStats {
  let maxHp = H.HERO_BASE_HP * Math.pow(H.HERO_HP_GROWTH, level - 1);
  let damage = H.HERO_BASE_DAMAGE * Math.pow(H.HERO_DAMAGE_GROWTH, level - 1);
  let range = H.HERO_BASE_RANGE;
  let attackSpeed = 1;
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
    attackInterval: H.HERO_ATTACK_INTERVAL / attackSpeed,
    moveSpeed,
    regen,
    damageReduction: 1 - damageTaken,
    splashRadius,
    mineralPerKill,
    respawnSeconds: Math.max(3, H.HERO_RESPAWN_SECONDS - respawnCut),
    towerDamageMult,
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
    return computeStats(this.level, this.augments);
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

    const { moveSpeed, regen, maxHp } = this.stats;
    if (regen > 0) this.hp = Math.min(maxHp, this.hp + regen * dt);

    const gap = this.targetDistance - this.distance;
    if (Math.abs(gap) <= H.HERO_ARRIVE_EPSILON) return;

    const step = Math.min(Math.abs(gap), moveSpeed * dt);
    this.distance += Math.sign(gap) * step;
  }

  private respawn(): void {
    this.alive = true;
    this.hp = this.stats.maxHp;
    this.distance = this.altarDistance;
    this.targetDistance = this.altarDistance;
    this.respawnTimer = 0;
  }
}

/**
 * 증강 카드 3장을 뽑는다. 카드마다 등급이 따로 굴려진다.
 * 최대 스택에 도달한 것과 선행 조건을 못 채운 것은 제외한다.
 */
export function rollAugmentChoices(hero: Hero, rand: () => number): AugmentCard[] {
  const pool = H.AUGMENTS.filter((augment) => {
    if (hero.stacksOf(augment.id) >= augment.maxStacks) return false;
    if (H.requiresSplash(augment) && !hero.hasSplash) return false;
    return true;
  });

  const cards: AugmentCard[] = [];
  const remaining = [...pool];
  while (cards.length < H.AUGMENT_CHOICES && remaining.length > 0) {
    const index = Math.min(remaining.length - 1, Math.floor(rand() * remaining.length));
    cards.push(H.makeCard(remaining[index], H.rollRarity(rand)));
    remaining.splice(index, 1);
  }
  return cards;
}
