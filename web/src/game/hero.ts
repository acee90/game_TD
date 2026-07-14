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
  readonly towerRangeMult: number;
  /** 스킬 피해 배수 — 지능이 키운다 */
  readonly skillPower: number;

  // ── 발동 효과 (특수 계열)
  readonly lifesteal: number;
  readonly critChance: number;
  readonly critMult: number;
  readonly executeBelow: number;
  readonly burnDps: number;
  readonly slowOnHit: number;
  readonly thorns: number;
  readonly deathBlast: number;
  readonly deathBlastRadius: number;

  // ── 경제
  readonly mineralPerWave: number;
  readonly gasPerWave: number;
  readonly xpMult: number;

  // ── 유틸
  readonly aggroRange: number;

  // ── 스킬 개조 (증강 효과에서 온 것 — skillMod와 별개로 접힌다)
  readonly skillDamageMult: number;
  readonly skillCooldownMult: number;

  /** 체력이 낮을 때만 켜지는 공격력 배수. 평상시엔 1 */
  readonly lowHpDamageMult: number;
}

/** 성장(누적) 증강이 참조하는 런타임 카운터 */
export interface GrowthState {
  /** 영웅이 막타를 친 몹 수 */
  readonly killStacks: number;
  /** 지나온 라운드 수 */
  readonly waveStacks: number;
}

export const NO_GROWTH: GrowthState = { killStacks: 0, waveStacks: 0 };

/**
 * 증강 카드를 접어서 최종 스탯을 만든다. 순수 함수 — 테스트하기 쉽다.
 *
 * 접는 순서: 카드 효과(등급 반영됨) → 대가(등급 안 붙음) → 시너지 → 성장 누적.
 * 성장은 마지막이다 — growthMult(성장 특화)가 누적치에 곱해져야 하기 때문이다.
 */
export function computeStats(
  level: number,
  cards: readonly AugmentCard[],
  growth: GrowthState = NO_GROWTH,
): HeroStats {
  // 파워 = 스탯(레벨업 자동 균등 성장) × 증강 배수 — 레벨 배수는 없다 (3안 개편)
  const { str, agi, int } = H.attributesByLevel(level);

  let maxHp = H.HP_PER_STR * str;
  let damage = H.DMG_PER_STR * str;
  let range = H.HERO_BASE_RANGE;
  let attackSpeed = 1 + H.AS_PER_AGI * agi;
  let moveSpeed = H.HERO_SPEED;
  let regen = 0;
  let splashRadius = 0;
  let mineralPerKill = 0;
  let mineralPerWave = 0;
  let gasPerWave = 0;
  let respawnCut = 0;
  let towerDamageMult = 1;
  let towerRangeMult = 1;
  let xpMult = 1;
  let aggroRangeMult = 1;
  let lowHpDamageMult = 1;
  let growthMult = 1;
  let skillDamageMult = 1;
  let skillCooldownMult = 1;
  let lifesteal = 0;
  let critChance = 0;
  let critMultAdd = 0;
  let executeBelow = 0;
  let burnDps = 0;
  let slowOnHit = 0;
  let thorns = 0;
  let deathBlast = 0;
  let deathBlastRadius = 0;
  let killStackDamage = 0;
  let killStackCap = 0;
  let waveStackDamage = 0;
  let waveStackHp = 0;

  // 피해 감소는 곱연산으로 쌓아 100%에 도달하지 않게 한다
  let damageTaken = 1;

  const effects: AugmentEffect[] = [
    ...cards.map((c) => c.effect),
    // 대가는 등급으로 커지지 않는다 — 카드가 아니라 증강 정의에서 바로 가져온다
    ...cards.map((c) => c.augment.penalty).filter((p): p is AugmentEffect => p !== undefined),
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
    if (e.mineralPerWave) mineralPerWave += e.mineralPerWave;
    if (e.gasPerWave) gasPerWave += e.gasPerWave;
    if (e.respawnCut) respawnCut += e.respawnCut;
    if (e.towerDamageMult) towerDamageMult *= e.towerDamageMult;
    if (e.towerRangeMult) towerRangeMult *= e.towerRangeMult;
    if (e.xpMult) xpMult *= e.xpMult;
    if (e.aggroRangeMult) aggroRangeMult *= e.aggroRangeMult;
    if (e.lowHpDamageMult) lowHpDamageMult *= e.lowHpDamageMult;
    if (e.growthMult) growthMult *= e.growthMult;
    if (e.skillDamageMult) skillDamageMult *= e.skillDamageMult;
    if (e.skillCooldownMult) skillCooldownMult *= e.skillCooldownMult;
    if (e.lifesteal) lifesteal += e.lifesteal;
    if (e.critChance) critChance += e.critChance;
    if (e.critMultAdd) critMultAdd += e.critMultAdd;
    if (e.executeBelow) executeBelow += e.executeBelow;
    if (e.burnDps) burnDps += e.burnDps;
    if (e.slowOnHit) slowOnHit += e.slowOnHit;
    if (e.thorns) thorns += e.thorns;
    if (e.deathBlast) deathBlast += e.deathBlast;
    if (e.deathBlastRadius) deathBlastRadius += e.deathBlastRadius;
    if (e.killStackDamage) killStackDamage += e.killStackDamage;
    if (e.killStackCap) killStackCap += e.killStackCap;
    if (e.waveStackDamage) waveStackDamage += e.waveStackDamage;
    if (e.waveStackHp) waveStackHp += e.waveStackHp;
  }

  // ── 성장 누적. 성장 특화(growthMult)가 누적치 자체를 키운다.
  if (killStackDamage > 0) {
    const gained = Math.min(killStackDamage * growth.killStacks, killStackCap);
    damage *= 1 + gained * growthMult;
  }
  if (waveStackDamage > 0) damage *= 1 + waveStackDamage * growth.waveStacks * growthMult;
  if (waveStackHp > 0) maxHp *= 1 + waveStackHp * growth.waveStacks * growthMult;

  return {
    maxHp: Math.round(maxHp),
    damage: Math.round(damage),
    range,
    attackInterval: Math.max(H.MIN_ATTACK_INTERVAL, H.HERO_ATTACK_INTERVAL / attackSpeed),
    moveSpeed,
    regen,
    damageReduction: Math.min(H.DAMAGE_REDUCTION_CAP, 1 - damageTaken),
    splashRadius,
    mineralPerKill,
    respawnSeconds: Math.max(3, H.HERO_RESPAWN_SECONDS - respawnCut),
    towerDamageMult,
    towerRangeMult,
    skillPower: 1 + H.SKILL_PER_INT * int,

    lifesteal: Math.min(H.LIFESTEAL_CAP, lifesteal),
    critChance: Math.min(H.CRIT_CHANCE_CAP, critChance),
    critMult: H.CRIT_BASE_MULT + critMultAdd,
    executeBelow: Math.min(H.EXECUTE_CAP, executeBelow),
    burnDps,
    slowOnHit: Math.min(0.8, slowOnHit),
    thorns,
    deathBlast,
    deathBlastRadius,

    mineralPerWave,
    gasPerWave,
    xpMult,

    aggroRange: H.HERO_AGGRO_RANGE * aggroRangeMult,

    skillDamageMult,
    skillCooldownMult,
    lowHpDamageMult,
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
  /** 가스로 산 스킬 개조 횟수 */
  gasSkillDamage = 0;
  gasSkillCdr = 0;

  /** 성장 증강용 — 영웅이 막타를 친 몹 수 */
  killStacks = 0;
  /** 성장 증강용 — 지나온 라운드 수 */
  waveStacks = 0;

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
    return computeStats(this.level, this.augments, {
      killStacks: this.killStacks,
      waveStacks: this.waveStacks,
    });
  }

  /**
   * 지금 이 순간의 공격력. 위기 증강(최후의 저항)은 체력이 낮을 때만 켜지므로
   * stats.damage와 달리 hp를 본다 — 전투 코드는 이걸 쓴다.
   */
  get attackDamage(): number {
    const s = this.stats;
    const low = this.hp <= s.maxHp * H.LOW_HP_THRESHOLD;
    return low ? Math.round(s.damage * s.lowHpDamageMult) : s.damage;
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
    // 스킬 계열 증강·시너지가 주는 배수 (skillMod가 아니라 AugmentEffect로 온 것)
    const stats = this.stats;
    if (stats.skillDamageMult !== 1 || stats.skillCooldownMult !== 1) {
      patches.push({ damageMult: stats.skillDamageMult, cooldownMult: stats.skillCooldownMult });
    }
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
      if (H.grantsAugment(this.level)) this.pendingAugmentPicks++;
    }
    if (gained > 0) this.hp = this.stats.maxHp; // 레벨업 시 완전 회복
    return gained;
  }

  /** 흡혈·재생이 체력을 되돌린다. 최대 체력을 넘지 않는다. */
  heal(amount: number): void {
    if (!this.alive || amount <= 0) return;
    this.hp = Math.min(this.stats.maxHp, this.hp + amount);
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
