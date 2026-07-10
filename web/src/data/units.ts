// ───────── 유닛 로스터 ─────────
// 출처: docs/reference/god-td-x-vz056-map-analysis-v1.0.md §4(로스터) §5(조합) §6(태그)
//
// 태그(파워/스플래시/스피드/크리쳐)는 원본에서 **유닛마다 고정**이다. 상호 전환은 없다(§6.1).
// 티어 내 어느 유닛이 나오는지는 랜덤이 아니라 공유 인덱스로 결정된다(§5.3).
//
// [원본확정] = 맵파일에서 직접 읽은 것
// [프로토]   = 원본에서 확인 불가라 프로토타입용으로 정한 것 (§11에 미확인으로 기록됨)

export type Tag = 'power' | 'splash' | 'speed';
export const TAG_LABEL: Record<Tag, string> = {
  power: '파워',
  splash: '스플래시',
  speed: '스피드',
};

export const RACES = ['테란', '저그', '플토', '크리쳐'] as const;
export type Race = 0 | 1 | 2 | 3;
export const CREATURE: Race = 3;
export const RACE_COLOR = ['#4ea3ff', '#c065e0', '#ffd23f', '#6fdc8c'] as const;

export interface UnitDef {
  readonly name: string;
  readonly race: Race;
  readonly tags: readonly Tag[];
}

export const GOD_TIER = 4;
export const TIER_LABEL = ['Lv1', 'Lv2', 'Lv3', 'Lv4', 'GOD'] as const;

/**
 * 티어별 풀. 배열 순서 = 원본 트리거의 선택자 값 N=1..7 순서.
 * Lv2는 trigger #496~#502, Lv4는 #507~#513에서 그대로 읽었다. [원본확정]
 * Lv1 생성 7종은 strings:321/322/323/324/527/567/516. [원본확정 — 단 N 순서는 미확인]
 * Lv3 풀은 요청 카운터(unit#178)의 생성 트리거가 EUD로 잘려 미확인. 로스터의 Lv3 7종으로 채웠다. [프로토]
 */
export const TIER_POOLS: readonly (readonly UnitDef[])[] = [
  // Lv1 — strings:321,322,323,324,527,567,516
  [
    { name: '마린', race: 0, tags: ['speed'] },
    { name: '메딕', race: 0, tags: ['speed'] },
    { name: '히드라', race: 1, tags: ['power'] },
    { name: '저글링', race: 1, tags: ['power'] },
    { name: '질럿', race: 2, tags: ['splash'] },
    { name: '다크템플러', race: 2, tags: ['splash'] },
    { name: '벵갈라스', race: CREATURE, tags: ['power'] },
  ],
  // Lv2 — trigger #496~#502, N=1..7 순서 그대로
  [
    { name: '어사돈', race: CREATURE, tags: ['speed'] },
    { name: '하이템플러', race: 2, tags: ['splash'] },
    { name: '고스트', race: 0, tags: ['speed'] },
    // 디파일러의 태그 문자열만 원본 strings에서 확인되지 않는다(§11.4). 저그 파워로 채움. [프로토]
    { name: '디파일러', race: 1, tags: ['power'] },
    { name: '드라군', race: 2, tags: ['splash'] },
    { name: '파이어벳', race: 0, tags: ['speed'] },
    { name: '울트라리스크', race: 1, tags: ['power'] },
  ],
  // Lv3 — 태그는 [원본확정](strings:308/315/316/317/318/319/644), N 순서는 [프로토]
  [
    { name: '골리앗', race: 0, tags: ['speed'] },
    { name: '시저탱크', race: 0, tags: ['speed'] },
    { name: '뮤탈리스크', race: 1, tags: ['power'] },
    { name: '가디언', race: 1, tags: ['power'] },
    { name: '라이나돈', race: CREATURE, tags: ['splash'] },
    { name: '다크아칸', race: 2, tags: ['splash'] },
    { name: '아칸', race: 2, tags: ['splash'] },
  ],
  // Lv4 — trigger #507~#513, N=1..7 순서 그대로
  [
    { name: '럴커', race: 1, tags: ['power'] },
    { name: '카카루', race: CREATURE, tags: ['power', 'speed'] },
    { name: '캐리어', race: 2, tags: ['splash'] },
    { name: '레이스', race: 0, tags: ['speed'] },
    { name: '디바우러', race: 1, tags: ['power'] },
    { name: '커세어', race: 2, tags: ['splash'] },
    { name: '배틀크루져', race: 0, tags: ['speed'] },
  ],
];

/**
 * GOD 풀은 원본에서 처치한 보스 수로 분기한다(trigger #523~#529 / #534~#539).
 * `Deaths(CurrentPlayer, BOSS, AtMost, 5)` → 초기 풀 / `AtLeast, 6` → 확장 풀. [원본확정]
 * 확장 풀에 실제로 어떤 유닛이 들어가는지는 EUD로 잘려 미확인이라, [GOD] 11종 중
 * 초기 풀에서 확인된 4종을 뺀 나머지를 넣었다. [프로토]
 * 태그는 전부 [원본확정] (§4.3).
 */
export const GOD_POOL_EARLY: readonly UnitDef[] = [
  { name: '오버로드', race: 1, tags: ['power'] },
  { name: '리버', race: 2, tags: ['splash'] },
  { name: '발키리', race: 0, tags: ['speed'] },
  { name: '라그나소어', race: CREATURE, tags: ['power'] },
];

export const GOD_POOL_LATE: readonly UnitDef[] = [
  ...GOD_POOL_EARLY,
  { name: '사라 케리건', race: 1, tags: ['speed', 'power'] },
  { name: '짐 레이너', race: 0, tags: ['speed', 'splash'] },
  { name: '제라툴', race: 2, tags: ['splash', 'power'] },
  { name: '인페스티드 케리건', race: 1, tags: ['power', 'speed'] },
  { name: '헌터 킬러', race: 1, tags: ['power', 'splash'] },
  { name: '테사다', race: 2, tags: ['splash', 'speed'] },
  { name: '스칸티드', race: CREATURE, tags: ['splash'] },
];

/** 확장 GOD 풀이 열리는 처치 보스 수. trigger #534의 `AtLeast, 6`. [원본확정] */
export const GOD_POOL_LATE_AT = 6;

export function godPool(bossesKilled: number): readonly UnitDef[] {
  return bossesKilled >= GOD_POOL_LATE_AT ? GOD_POOL_LATE : GOD_POOL_EARLY;
}

export function tagLabel(u: UnitDef): string {
  const base = u.tags.map((t) => TAG_LABEL[t]).join(' ');
  return u.race === CREATURE ? `크리쳐 ${base}` : base;
}
