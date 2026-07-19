// ───────── 점수 ─────────
// 출처: docs/reference/god-td-x-vz056-map-analysis-v1.0.md §9.6, §10.3
//
// 원본에는 Victory/Defeat 액션이 0건이고 라운드 상한도 없다. 점수를 끝없이 쌓는
// 경쟁형(최강자전)이고, 명예의 전당에 누적 점수가 남는다(strings:592 — 1위 23,865,217점).
// 이 프로토는 2026-07-19(사용자 지시)부터 원본에서 이탈한다: **R60을 넘기면 클리어**
// (balance.CLEAR_ROUND) — 다만 게임은 무한 모드로 계속되고 점수 경쟁도 계속된다.
// 라이프 0은 여전히 유일한 종료다.
//
// 점수 배점은 원본에서 읽을 수 없어(EUD) 새로 설계했다. [프로토]

/**
 * 라운드 클리어 점수. 후반 라운드가 압도적으로 커야 "얼마나 오래 버텼나"가 점수로 드러난다.
 * 몹 체력이 라운드당 약 1.149배로 자라므로 점수도 비슷한 지수로 준다.
 */
export const ROUND_SCORE_BASE = 60;
export const ROUND_SCORE_GROWTH = 1.15;
export const roundScore = (round: number): number =>
  Math.round(ROUND_SCORE_BASE * Math.pow(ROUND_SCORE_GROWTH, round));

/** 잡몹 처치 — 꾸준한 기저 점수 */
export const KILL_SCORE = 10;

/** 보스 처치. 레벨이 오를수록 급격히 커진다 — 상위 보스에 도전할 이유 */
export const bossScore = (level: number): number => 400 * level * level;

/** 영웅 레벨업 */
export const HERO_LEVEL_SCORE = 300;

/** GOD 타워를 처음 띄웠을 때의 일회성 보너스 */
export const GOD_TOWER_SCORE = 5000;

/**
 * R60 클리어 일회성 보너스 (2026-07-19 — 승리 조건 신설, 원본의 "승리 없음"에서 이탈).
 * 그 시점 라운드 점수(≈ roundScore(60) ≈ 260만)의 절반쯤 — 클리어 자체가 큰 이정표지만
 * 이후 무한 모드에서 점수 경쟁이 계속되므로 압도적이지는 않게.
 */
export const CLEAR_SCORE = 1_000_000;

/** 몹을 놓치면 감점 — 라운드가 오를수록 아프다 */
export const leakPenalty = (round: number): number => Math.round(roundScore(round) * 0.25);

/** 명예의 전당에 남기는 기록 수 */
export const HALL_OF_FAME_SIZE = 5;
