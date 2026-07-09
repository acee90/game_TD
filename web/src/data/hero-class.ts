// ───────── 영웅 타입 ─────────
// 게임 시작에 하나를 고른다. 원본 갓타디에는 없는 신규 설계다.
//
// 타입은 두 가지를 한다.
//
// 하나는 기본 스탯을 비튼다 — 전사는 단단하고 느리게 때리고, 궁수는 멀리서 빠르게 때린다.
//
// 다른 하나가 더 중요하다. **증강 풀의 가중치와 금지 목록**을 정한다. 궁수에게 소용돌이가
// 뜨지 않고, 전사에게 유성이 뜨지 않는다. 그래서 첫 증강부터 빌드의 방향이 잡히고,
// 3개쯤 모이면 특화 시너지가 저절로 터진다 — 무작위 풀에서는 계열을 몰기가 운이었다.
//
// 가중치 0은 "안 뜬다"이고, 1이 기준이다.

import type { AugmentKind } from './hero';
import type { SkillId } from './skills';

export type HeroClassId = 'warrior' | 'archer' | 'mage';

export interface HeroClassDef {
  readonly id: HeroClassId;
  readonly name: string;
  readonly blurb: string;
  /** 기본 스탯 배수 */
  readonly hpMult: number;
  readonly damageMult: number;
  readonly rangeMult: number;
  readonly attackSpeedMult: number;
  /** 증강 계열별 뽑기 가중치. 0이면 안 뜬다. */
  readonly kindWeights: Readonly<Record<AugmentKind, number>>;
  /** 이 타입이 배울 수 있는 액티브 스킬 */
  readonly skills: readonly SkillId[];
}

export const HERO_CLASSES: Record<HeroClassId, HeroClassDef> = {
  warrior: {
    id: 'warrior',
    name: '전사',
    blurb: '단단하고 가까이서 싸운다. 몹을 붙잡아 시간을 번다.',
    hpMult: 1.35,
    damageMult: 0.9,
    rangeMult: 0.75,
    attackSpeedMult: 0.9,
    kindWeights: { tank: 3, stat: 1.6, utility: 1, ranged: 0.25, mage: 0 },
    skills: ['whirlwind', 'decoy'],
  },
  archer: {
    id: 'archer',
    name: '궁수',
    blurb: '멀리서 빠르게 때린다. 맞으면 약하니 붙잡히면 안 된다.',
    hpMult: 0.8,
    damageMult: 1,
    rangeMult: 1.35,
    attackSpeedMult: 1.1,
    kindWeights: { ranged: 3, stat: 1.6, utility: 1, tank: 0.4, mage: 0 },
    skills: ['volley', 'decoy'],
  },
  mage: {
    id: 'mage',
    name: '마법사',
    blurb: '광역으로 쓸어담는다. 뭉친 몹에게 강하다.',
    hpMult: 0.85,
    damageMult: 1,
    rangeMult: 1.15,
    attackSpeedMult: 0.85,
    kindWeights: { mage: 3, stat: 1.6, utility: 1, ranged: 0.5, tank: 0.3 },
    skills: ['meteor', 'decoy'],
  },
};

export const HERO_CLASS_IDS: readonly HeroClassId[] = ['warrior', 'archer', 'mage'];

/** 전직 선택이 뜨는 영웅 레벨. 첫 증강(Lv9)보다 앞이다 — 이후 증강이 타입을 따른다. */
export const CLASS_PICK_LEVEL = 5;

/**
 * 전직 전의 중립 영웅. 배수는 전부 1이고 스킬을 못 배운다.
 * 게임은 타입 없이 바로 시작한다 — 정보가 0인 시작 선택 대신,
 * 몹과 보스를 본 뒤(Lv5, ~R4)에 맥락 있는 선택을 하게 한다.
 */
export const NOVICE: HeroClassDef = {
  id: 'warrior', // 자리만 채운다 — NOVICE는 id로 조회되지 않는다
  name: '견습',
  blurb: '아직 길을 정하지 않았다.',
  hpMult: 1,
  damageMult: 1,
  rangeMult: 1,
  attackSpeedMult: 1,
  kindWeights: { tank: 1, ranged: 1, mage: 1, stat: 1, utility: 1 },
  skills: [],
};
