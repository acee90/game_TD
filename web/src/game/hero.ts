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
  /** 화상 — **스택 1개당** 초당 영웅 공격력의 이 배수 */
  readonly burnMult: number;
  /** 화상 최대 중첩 */
  readonly burnMaxStacks: number;
  /** 점화 — 최대 중첩에서 스택을 태워 터뜨린다 (0이면 안 터진다) */
  readonly igniteMult: number;
  readonly igniteRadius: number;
  /** 화상 걸린 적이 영웅 피해를 더 받는 비율 */
  readonly burnAmp: number;
  readonly slowOnHit: number;
  readonly thorns: number;
  readonly deathBlast: number;
  readonly deathBlastRadius: number;

  // ── 경제
  readonly mineralPerWave: number;
  readonly waveRewardMult: number;
  readonly gasPerWave: number;
  readonly xpMult: number;

  // ── 유틸
  readonly aggroRange: number;

  // ── 스킬 개조 (증강 효과에서 온 것 — skillMod와 별개로 접힌다)
  readonly skillDamageMult: number;
  readonly skillCooldownMult: number;

  /** 체력이 낮을 때만 켜지는 공격력 배수. 평상시엔 1 */
  readonly lowHpDamageMult: number;

  /** 피격 시 스킬 쿨타임 감소(초) */
  readonly skillCdrOnHit: number;
  /** 사망 시 폭발 (영웅 공격력 배수) */
  readonly deathNova: number;
  /** 부활 시 폭발 */
  readonly reviveNova: number;
  readonly novaRadius: number;
  /** 타워 복제 기본 티어 상한 (0이면 복제 못 한다) */
  readonly towerCopyTier: number;
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

  let maxHp = H.HERO_BASE_HP + H.HP_PER_STR * str;
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
  let lifesteal = 0;
  let critChance = 0;
  let critMultAdd = 0;
  let executeBelow = 0;
  let burnMult = 0;
  let burnStacksAdd = 0;
  let igniteMult = 0;
  let igniteRadius = 0;
  let burnAmp = 0;
  let slowOnHit = 0;
  let thorns = 0;
  let deathBlast = 0;
  let deathBlastRadius = 0;
  let killStackDamage = 0;
  let killStackCap = 0;
  let waveStackDamage = 0;
  let waveStackHp = 0;
  let skillCdrOnHit = 0;
  let deathNova = 0;
  let reviveNova = 0;
  let novaRadius = 0;
  let towerCopyTier = 0;

  // 피해 감소는 곱연산으로 쌓아 100%에 도달하지 않게 한다
  let damageTaken = 1;

  /**
   * 배수형 필드는 **가산으로 접는다** — `damageMult: 1.45`는 "기본값의 45%를 더한다".
   * 곱연산은 COMPOUNDING_IDS의 소수만 (data/hero.ts 주석 참고).
   */
  const bonus = {
    hp: 0, damage: 0, range: 0, attackSpeed: 0, moveSpeed: 0,
    towerDamage: 0, towerRange: 0, xp: 0, aggro: 0, lowHp: 0,
    growth: 0, skillDamage: 0, skillCooldown: 0, waveReward: 0,
  };
  /** 곱연산 증강만 여기에 곱해진다 */
  const compound = { damage: 1, hp: 1, growth: 1, skillDamage: 1 };

  const additive: AugmentEffect[] = [
    ...cards.filter((c) => !H.isCompounding(c.augment)).map((c) => c.effect),
    // 대가는 등급으로 커지지 않는다 — 카드가 아니라 증강 정의에서 바로 가져온다.
    // 대가는 곱연산 증강의 것이라도 가산으로 접는다 (대가가 복리로 불어나면 잔인해진다)
    ...cards.map((c) => c.augment.penalty).filter((p): p is AugmentEffect => p !== undefined),
    // 시너지도 가산이다 — 특화가 곱이면 몰빵이 다시 복리가 된다
    ...H.activeSynergies(cards).map((s) => s.effect),
  ];

  // 곱연산 증강 (소수) — 카드 효과가 통째로 곱해진다
  for (const c of cards) {
    if (!H.isCompounding(c.augment)) continue;
    const e = c.effect;
    if (e.damageMult) compound.damage *= e.damageMult;
    if (e.hpMult) compound.hp *= e.hpMult;
    if (e.growthMult) compound.growth *= e.growthMult;
    if (e.skillDamageMult) compound.skillDamage *= e.skillDamageMult;
  }

  for (const e of additive) {
    if (e.hpMult) bonus.hp += e.hpMult - 1;
    if (e.damageMult) bonus.damage += e.damageMult - 1;
    if (e.rangeMult) bonus.range += e.rangeMult - 1;
    if (e.attackSpeedMult) bonus.attackSpeed += e.attackSpeedMult - 1;
    if (e.moveSpeedMult) bonus.moveSpeed += e.moveSpeedMult - 1;
    if (e.towerDamageMult) bonus.towerDamage += e.towerDamageMult - 1;
    if (e.towerRangeMult) bonus.towerRange += e.towerRangeMult - 1;
    if (e.xpMult) bonus.xp += e.xpMult - 1;
    if (e.aggroRangeMult) bonus.aggro += e.aggroRangeMult - 1;
    if (e.lowHpDamageMult) bonus.lowHp += e.lowHpDamageMult - 1;
    if (e.growthMult) bonus.growth += e.growthMult - 1;
    if (e.skillDamageMult) bonus.skillDamage += e.skillDamageMult - 1;
    if (e.skillCooldownMult) bonus.skillCooldown += e.skillCooldownMult - 1;
    if (e.waveRewardMult) bonus.waveReward += e.waveRewardMult - 1;

    if (e.regen) regen += e.regen;
    // 피해 감소만은 곱으로 쌓는다 — 가산이면 다섯 장에 100%가 되어 무적이 된다
    if (e.damageReduction) damageTaken *= 1 - e.damageReduction;
    if (e.splashRadius) splashRadius += e.splashRadius;
    if (e.mineralPerKill) mineralPerKill += e.mineralPerKill;
    if (e.mineralPerWave) mineralPerWave += e.mineralPerWave;
    if (e.gasPerWave) gasPerWave += e.gasPerWave;
    if (e.respawnCut) respawnCut += e.respawnCut;
    if (e.lifesteal) lifesteal += e.lifesteal;
    if (e.critChance) critChance += e.critChance;
    if (e.critMultAdd) critMultAdd += e.critMultAdd;
    if (e.executeBelow) executeBelow += e.executeBelow;
    if (e.burnMult) burnMult += e.burnMult;
    if (e.burnStacksAdd) burnStacksAdd += e.burnStacksAdd;
    if (e.igniteMult) igniteMult += e.igniteMult;
    if (e.igniteRadius) igniteRadius += e.igniteRadius;
    if (e.burnAmp) burnAmp += e.burnAmp;
    if (e.slowOnHit) slowOnHit += e.slowOnHit;
    if (e.thorns) thorns += e.thorns;
    if (e.deathBlast) deathBlast += e.deathBlast;
    if (e.deathBlastRadius) deathBlastRadius += e.deathBlastRadius;
    if (e.killStackDamage) killStackDamage += e.killStackDamage;
    if (e.killStackCap) killStackCap += e.killStackCap;
    if (e.waveStackDamage) waveStackDamage += e.waveStackDamage;
    if (e.waveStackHp) waveStackHp += e.waveStackHp;
    if (e.skillCdrOnHit) skillCdrOnHit += e.skillCdrOnHit;
    if (e.deathNova) deathNova += e.deathNova;
    if (e.reviveNova) reviveNova += e.reviveNova;
    if (e.novaRadius) novaRadius += e.novaRadius;
    if (e.towerCopyTier) towerCopyTier = Math.max(towerCopyTier, e.towerCopyTier);
  }

  // ── 성장 누적. 성장 배수(growth 보너스 + 진화의 곱)가 누적치 자체를 키운다.
  //    성장도 가산이다 — 공격력 보너스에 합류할 뿐 따로 곱하지 않는다.
  const growthMult = (1 + bonus.growth) * compound.growth;
  if (killStackDamage > 0) {
    const gained = Math.min(killStackDamage * growth.killStacks, killStackCap);
    bonus.damage += gained * growthMult;
  }
  if (waveStackDamage > 0) bonus.damage += waveStackDamage * growth.waveStacks * growthMult;
  if (waveStackHp > 0) bonus.hp += waveStackHp * growth.waveStacks * growthMult;

  // 최종 = 기본 × (1 + 가산 보너스 합) × 곱연산 증강
  maxHp *= Math.max(0.1, 1 + bonus.hp) * compound.hp;
  damage *= Math.max(0.1, 1 + bonus.damage) * compound.damage;
  range *= Math.max(0.2, 1 + bonus.range);
  attackSpeed *= Math.max(0.2, 1 + bonus.attackSpeed);
  moveSpeed *= Math.max(0.2, 1 + bonus.moveSpeed);

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
    towerDamageMult: Math.max(0.1, 1 + bonus.towerDamage),
    towerRangeMult: Math.max(0.2, 1 + bonus.towerRange),
    skillPower: 1 + H.SKILL_PER_INT * int,

    lifesteal: Math.min(H.LIFESTEAL_CAP, lifesteal),
    critChance: Math.min(H.CRIT_CHANCE_CAP, critChance),
    critMult: H.CRIT_BASE_MULT + critMultAdd,
    executeBelow: Math.min(H.EXECUTE_CAP, executeBelow),
    burnMult,
    burnMaxStacks: H.BURN_BASE_MAX_STACKS + burnStacksAdd,
    igniteMult,
    igniteRadius,
    burnAmp,
    slowOnHit: Math.min(0.8, slowOnHit),
    thorns,
    deathBlast,
    deathBlastRadius,

    mineralPerWave,
    waveRewardMult: Math.max(0.1, 1 + bonus.waveReward),
    gasPerWave,
    xpMult: Math.max(0.1, 1 + bonus.xp),

    aggroRange: H.HERO_AGGRO_RANGE * Math.max(0.2, 1 + bonus.aggro),

    skillDamageMult: Math.max(0.1, 1 + bonus.skillDamage) * compound.skillDamage,
    // 쿨감은 가산이지만 바닥이 있다 — 0에 닿으면 스킬이 상시 발동이 된다
    skillCooldownMult: Math.max(0.35, 1 + bonus.skillCooldown),
    lowHpDamageMult: Math.max(1, 1 + bonus.lowHp),

    skillCdrOnHit,
    deathNova,
    reviveNova,
    novaRadius,
    towerCopyTier,
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
    // 허수아비·처형은 손이 빠를수록 자주 나간다 — 공속이 쿨을 깎는다
    const attackSpeedRatio = H.HERO_ATTACK_INTERVAL / stats.attackInterval;
    return resolveSkill(id, foldMods([...patches, ...gas]), attackSpeedRatio);
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
    const stats = this.stats;
    this.hp -= raw * (1 - stats.damageReduction);

    // '반격 집중' — 맞을수록 스킬이 빨리 돌아온다 ('마나 회복'의 번역)
    if (stats.skillCdrOnHit > 0 && this.skillCooldown > 0) {
      this.skillCooldown = Math.max(0, this.skillCooldown - stats.skillCdrOnHit);
    }

    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      this.respawnTimer = stats.respawnSeconds;
      this.justDied = true; // Game이 이번 프레임에 사망 폭발을 터뜨린다
    }
  }

  /** 이번 프레임에 죽었는가 — Game이 읽고 내린다 (사망 폭발) */
  justDied = false;
  /** 이번 프레임에 부활했는가 — Game이 읽고 내린다 (부활 폭발) */
  justRevived = false;

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
    this.justRevived = true; // Game이 이번 프레임에 부활 폭발을 터뜨린다
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
