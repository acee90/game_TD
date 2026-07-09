import type { UnitDef } from '../data/units';

export interface Tower {
  readonly def: UnitDef;
  readonly tier: number;
  /** 다음 공격까지 남은 시간(초) */
  cooldown: number;
}

export interface Slot {
  readonly x: number;
  readonly y: number;
  tower: Tower | null;
}

export type EnemyKind = 'mob' | 'boss';

export interface EnemySpec {
  readonly kind: EnemyKind;
  readonly name: string;
  readonly maxHp: number;
  readonly armor: number;
  readonly speed: number;
  readonly radius: number;
  /** 보스일 때만 채워진다 */
  readonly bossLevel?: number;
}

export interface Enemy extends EnemySpec {
  hp: number;
  /** 입구에서 이동한 거리. PATH_LENGTH 도달 시 돌파 */
  distance: number;
  dead?: boolean;
  /** 마지막으로 때린 게 영웅인가 — 막타 경험치 보너스 판정 */
  lastHitByHero?: boolean;
}

export interface Shot {
  x: number;
  y: number;
  tx: number;
  ty: number;
  life: number;
  color: string;
  splashRadius?: number;
}

export interface FloatText {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
}
