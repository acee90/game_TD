// ───────── 점수 ─────────
// 출처: docs/갓타워디펜스X_VZ056_맵파일분석_v1.0.md §9.6, §10.3
//
// 원본에는 Victory/Defeat 액션이 0건이고 라운드 상한도 없다. 점수를 끝없이 쌓는
// 경쟁형(최강자전)이고, 명예의 전당에 누적 점수가 남는다(strings:592 — 1위 23,865,217점).
// 이 프로토도 같은 구조를 따른다: 승리 조건 없음, 라이프 0이 유일한 종료.
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

/** 몹을 놓치면 감점 — 라운드가 오를수록 아프다 */
export const leakPenalty = (round: number): number => Math.round(roundScore(round) * 0.25);

/** 명예의 전당에 남기는 기록 수 */
export const HALL_OF_FAME_SIZE = 5;
