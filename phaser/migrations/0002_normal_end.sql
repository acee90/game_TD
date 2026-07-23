-- 정상 종료 구분 (2026-07-22 사용자 결정)
--
-- 왜 필요한가: `complete`(run_finished 이벤트 존재)만으로는 정상 종료를 판정할 수 없다.
-- 중단(quit·restart)도 이탈 처리에서 finishRun()을 부르므로 run_finished를 남긴다.
-- 따라서 랭킹·대시보드 노출은 finish_reason이 game_over·cleared인 런으로 한정해야 한다.
-- 중단 런은 버리지 않고 저장해 두었다가 운영 분석에 쓴다.
--
-- 판정 규칙의 원본은 engine/src/game/logging.ts의 isNormalEnd()다.

ALTER TABLE runs ADD COLUMN normal_end INTEGER NOT NULL DEFAULT 0;

-- 기존 행 보정 (0001만 적용된 DB에서 올라오는 경우)
UPDATE runs
SET normal_end = 1
WHERE complete = 1 AND finish_reason IN ('game_over', 'cleared');

-- 0001의 랭킹 인덱스는 조건이 부정확했다(중단 런이 포함됨) — 교체한다
DROP INDEX IF EXISTS idx_runs_ranking;

CREATE INDEX IF NOT EXISTS idx_runs_ranking ON runs(score DESC)
  WHERE normal_end = 1 AND build_dirty = 0;

-- 운영 분석용 — 중단 런만 훑는 조회
CREATE INDEX IF NOT EXISTS idx_runs_aborted ON runs(started_at)
  WHERE normal_end = 0;
