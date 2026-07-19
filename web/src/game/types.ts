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
  /** 웨이브 타입의 접촉 공격력 배수 (기본 1). 사냥꾼 = 6 */
  readonly contactDamageMult?: number;
  /** 웨이브 타입 렌더색 (없으면 기본 몹색) */
  readonly typeColor?: string;
}

export interface Enemy extends EnemySpec {
  hp: number;
  /**
   * 경로 중심선에서의 횡오프셋(px, 좌측 법선 기준 부호). 스폰 시 좌/우 교대로 벌려
   * 시작하고, 이후 겹침 분리가 밀어낸다. 보스·테스트 픽스처는 0/생략.
   * 전투 판정은 여전히 distance 1D — 이 값은 공간 점유(겹침)와 표시에만 쓴다.
   */
  lateral?: number;
  /** 입구에서 이동한 거리. PATH_LENGTH 도달 시 돌파 */
  distance: number;
  dead?: boolean;
  /** 마지막으로 때린 게 영웅인가 — 막타 경험치 보너스 판정 */
  lastHitByHero?: boolean;
  /** 스킬 감속 디버프 남은 시간 */
  slowTimer?: number;
  /** 감속 중일 때의 이동속도 배수 */
  slowFactor?: number;
  /** 화상 남은 시간 — 영웅의 '화염 부착' 계열이 붙인다 */
  burnTimer?: number;
  /** 화상 초당 피해 — **스택 1개당**이다. 실제 피해는 burnDps × burnStacks */
  burnDps?: number;
  /** 화상 중첩 수. 스킬·도트가 쌓고, 상한이 없다. 점화는 화상이 꺼질 때 터뜨린다 */
  burnStacks?: number;
  /** 깎인 방어력 (맹독). 실제 장갑 = armor - armorShred */
  armorShred?: number;
  /** 이번 프레임에 영웅/허수아비에게 붙잡혀 있는가 — 탱킹 기여 집계용 */
  held?: boolean;
}

/** 영웅이 세운 미끼. 몹을 붙잡아 시간을 번다. */
export interface Decoy {
  /** 경로 위 위치 */
  distance: number;
  hp: number;
  maxHp: number;
  life: number;
  /** 주변 몹을 강제로 끌어당기는가 */
  taunts: boolean;
}

/**
 * 바닥에 깔린 장판 (불화살의 불바다 · 얼음화살의 빙판).
 * 몹은 경로를 따라야만 하므로 장판은 "길목에 놓는 지속 효과"가 된다.
 */
export interface Zone {
  /** 경로 위 중심 */
  distance: number;
  x: number;
  y: number;
  radius: number;
  /** 남은 시간(초) */
  remaining: number;
  /** 초당 피해 (0이면 피해 없는 장판) */
  dps: number;
  /** 안에 있는 몹의 이동속도 배수 (1이면 감속 없음) */
  slow: number;
  color: string;
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
