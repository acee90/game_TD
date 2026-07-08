import type { WaveType } from '../data/balance';

export type Mode = 'splash' | 'power';
export type Phase = 'prep' | 'wave';

export interface Tower {
  race: number;      // 0 테란 / 1 저그 / 2 토스
  tier: number;      // 0..4 (4 = 갓)
  mode: Mode;
  cd: number;
  variant?: number;  // 0 돌격 / 1 표준 / 2 저격 (갓은 무시, 미지정 = 표준)
}

export interface Slot {
  x: number;
  y: number;
  tower: Tower | null;
}

export type EnemyType = WaveType | 'boss';

export interface EnemySpec {
  hp: number;
  armor: number;
  spd: number;
  r: number;
  type: EnemyType;
  reward?: number;
  boss?: number;
}

export interface Enemy extends EnemySpec {
  d: number;       // 경로 진행 거리
  maxhp: number;
  dead?: boolean;
}

export interface Shot {
  x: number; y: number;
  tx: number; ty: number;
  life: number;
  c: string;
  splash?: number;
}

export interface FloatText {
  x: number; y: number;
  txt: string;
  c: string;
  life: number;
}
