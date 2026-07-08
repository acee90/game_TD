// ───────── 밸런스 테이블 (외부 테이블화 — 디자인 문서 §11) ─────────
// 갓타디 프로토 체험용 러프 밸런스. 출시 수치는 GA 시뮬(sim/)에서 확정한다.

export const RACE = ['테란', '저그', '토스', '크리쳐'] as const;
export const RCOL = ['#4ea3ff', '#c065e0', '#ffd23f', '#6fdc8c'] as const;
export const CREATURE = 3; // 크리쳐 종족 인덱스

// ───────── 종족 정체성 (빌드 = 스타일 선언) ─────────
// 테란 = 단일·장사거리·고타격(중갑/보스) / 저그 = 초공속·물량 DPS(장갑에 약함)
// / 토스 = 광역(쇄도) / 크리쳐 = 강화 경제 바깥(§크리쳐 참조).
// 합성 종족은 랜덤(운) → 어느 종족에 커밋하나(운영).
export interface RaceStat {
  rangeMult: number;
  atkInt: number;    // 공격 간격(초)
  dmgMult: number;   // 타격당 피해 배수
  splash: boolean;
  blurb: string;
}
export const RSTAT: RaceStat[] = [
  { rangeMult: 1.3, atkInt: 0.9, dmgMult: 2.2, splash: false,
    blurb: '단일 · 장사거리 · 고타격 — 장갑 관통, 중갑/보스 특화' },
  { rangeMult: 0.8, atkInt: 0.3, dmgMult: 0.75, splash: false,
    blurb: '단일 · 초공속 · 단사거리 — 최고 DPS, 소타격이라 장갑에 약함' },
  { rangeMult: 1.0, atkInt: 0.55, dmgMult: 1.0, splash: true,
    blurb: '광역 — 범위 전체 타격, 쇄도 특화' },
  { rangeMult: 1.0, atkInt: 0.5, dmgMult: 1.0, splash: false,
    blurb: '강화 불가 — 종족 강화가 안 먹히는 대신 기본기가 다름' },
];
export const TOSS_SPLASH = 0.8;  // 토스 광역 타격 계수

// ───────── 크리쳐 (갓타디 동물 계열의 기능 이식) ─────────
// 야수 = 무강화·고기본스탯 브릿지: 업 커밋 없이 즉시 밥값 → 운 복구 밸브.
//        강화 복리가 없어 후반 자연 감쇠 → "언제 파나"가 운영 판단.
// 정령 = 감속 오라 보조: 공격하지 않고 범위 내 적을 늦춘다.
export const BEAST_DMG = 1.9;    // 야수 기본 피해 배수 (무강화 보상)
export const BEAST_RNG = 0.85;
export const SPIRIT_RNG = 1.1;
export const SPIRIT_SLOW = [0.72, 0.66, 0.6, 0.54]; // 티어별 이속 배수 (낮을수록 강함)
export const CREATURE_GOD = 1.4; // 크리쳐 갓 기본 피해 배수 (강화 불가 보상)

// ───────── 유닛 로스터 (4종족 × 4티어 × 2변형 = 32 + 갓 4 = 36종) ─────────
// 갓타디의 "등급당 8유닛" 구조. 같은 티어 안에서도 역할이 갈려서
// 합성 결과(운)가 곧 배치 자리 판단(운영)으로 이어진다.
export interface Variant { name: string; rngMult: number; dmgMult: number }
export const VARIANTS: Variant[] = [
  { name: '돌격', rngMult: 0.75, dmgMult: 1.35 },  // 근접 고화력 — 궤도 밀착 배치
  { name: '저격', rngMult: 1.3, dmgMult: 0.75 },   // 장거리 저화력 — 허브/외곽 요지
];
// 이름표 [종족][티어 0..3][변형 0..1] — 수치는 VARIANTS/크리쳐 상수가 결정
export const UNIT_NAMES: readonly (readonly (readonly string[])[])[] = [
  [ // 테란: 돌격 / 저격
    ['화염방사병', '저격병'], ['불곰', '유령'],
    ['공성전차', '사이클론'], ['토르', '발키리'],
  ],
  [ // 저그
    ['저글링', '히드라'], ['바퀴', '러커'],
    ['울트라리스크', '가시지옥'], ['토라스크', '브루드로드'],
  ],
  [ // 토스
    ['광전사', '용기병'], ['암흑기사', '집정관'],
    ['리버', '거신'], ['아콘', '폭풍함'],
  ],
  [ // 크리쳐: 야수 / 정령
    ['카카루', '서리정령'], ['벵갈라스', '바람정령'],
    ['우르사돈', '대지정령'], ['라그나사우르', '폭풍정령'],
  ],
];
export const GOD_NAMES = ['갓 오딘', '갓 케리건', '갓 제라툴', '갓 스칸티드'] as const;

// ───────── 티어 ─────────
export const TNAME = ['Lv1', 'Lv2', 'Lv3', 'Lv4', '갓'] as const;
export const TDMG = [1, 3, 9, 28, 95] as const;       // 티어별 공격력 배수(가속)
export const TRNG = [120, 140, 160, 185, 225] as const; // 티어별 사거리
export const GOD_TIER = 4;

export const DMG0 = 7;          // 기준 공격력
export const ATK_INT = 0.55;    // 갓 공격 간격(초)
// 갓 전용 스플/파워 변환 (갓타디: 변환은 갓 단계의 운영 — "갓 뜸 = 시작")
export const POWER_DMG = 1.6;   // 갓 단일 모드 피해 배수
export const SPLASH_DMG = 0.7;  // 갓 광역 모드 피해 배수
export const POWER_RNG = 1.15;  // 갓 단일 모드 사거리 배수

export const START_GOLD = 240;
export const PRODUCE_COST = 40;
export const KILL_GOLD = 2;
export const SELL_RATE = 0.5;

// 일꾼 경제 (Legion TD 계보 — 지금 투자 vs 이번 방어)
export const HIRE_BASE = 90;
export const HIRE_STEP = 35;
export const WORKER_INCOME = 14;
export const WORKER_MAX = 10;

// 종족 강화 — 커밋의 무게: 효과 크게(+10% 복리), 비용 누진(몰빵 vs 분산이 베팅)
// 크리쳐(3)는 강화 대상이 아니다.
export const UP_MULT = 1.10;
export const upCostF = (lv: number) => 40 + 18 * lv + 3 * lv * lv;

export const waveReward = (r: number) => 28 + 8 * r;
export const waveHP = (r: number) => 34 * Math.pow(1.32, r);
export const hireCost = (workers: number) => HIRE_BASE + workers * HIRE_STEP;
export const upCost = upCostF;
export const sellPrice = (tier: number) =>
  Math.floor(PRODUCE_COST * SELL_RATE * Math.pow(2, tier));

// ───────── 웨이브 성격 ─────────
export type WaveType = 'normal' | 'swarm' | 'heavy';
export const WTYPES: Record<WaveType, { name: string; tip: string; color: string }> = {
  normal: { name: '일반', tip: '균형 — 아무 형태나 무난', color: '#8a8fa8' },
  swarm: { name: '쇄도', tip: '다수 저체력 → 광역이 유리', color: '#55c8ff' },
  heavy: { name: '중갑', tip: '소수 고장갑 → 단일이 유리', color: '#ff8a3c' },
};

// ───────── 보스 소환 (갓타디의 척추: 소득 vs 안전) ─────────
export interface BossTier {
  label: string;
  hpMult: number;            // 잡몹 HP 대비 배수
  reward: (r: number) => number;
  leakPenalty: number;       // 못 잡고 누출 시 오염
}
export const BOSS_TIERS: (BossTier | null)[] = [
  null,
  { label: '★ 하급보스', hpMult: 26, reward: r => 260 + 40 * r, leakPenalty: 28 },
  { label: '★★ 상급보스', hpMult: 60, reward: r => 640 + 90 * r, leakPenalty: 45 },
];

// 누출 오염 (잡몹)
export const LEAK_POLL: Record<WaveType, number> = { swarm: 2, normal: 3, heavy: 6 };
