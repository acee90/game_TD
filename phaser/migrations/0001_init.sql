-- 런 로그 저장소 초기 스키마 (M1)
-- 계획: docs/exec-plans/run-log-db-and-ranking.md §4.2
--
-- 저장 범위는 "모든 판"이다 — 중단(quit/restart/abandoned) 런도 분석용으로 적재하고,
-- 랭킹 노출만 complete=1 AND build_dirty=0 으로 거른다(§5.2).

CREATE TABLE IF NOT EXISTS runs (
  run_id            TEXT PRIMARY KEY,
  schema_version    INTEGER NOT NULL,
  -- 같은 run_id 재업로드가 같은 내용인지 판별한다 (idempotent 성공 vs 409 conflict)
  content_hash      TEXT    NOT NULL,

  -- 빌드 식별 — 랭킹은 dirty 빌드를 제외한다
  build_sha         TEXT    NOT NULL,
  build_branch      TEXT,
  build_target      TEXT    NOT NULL,
  build_dirty       INTEGER NOT NULL,
  app_version       TEXT,
  engine_version    TEXT,

  seed              INTEGER NOT NULL,
  rng_algorithm     TEXT    NOT NULL,

  started_at        TEXT    NOT NULL,
  uploaded_at       TEXT    NOT NULL,
  finish_reason     TEXT,
  -- run_finished 이벤트가 있으면 1. 중단 런은 0으로 저장된다
  complete          INTEGER NOT NULL,
  cleared           INTEGER,

  score             INTEGER NOT NULL,
  round             INTEGER NOT NULL,
  kills             INTEGER,
  elapsed_seconds   REAL,
  hero_level        INTEGER,
  boss_cleared      INTEGER,

  display_name      TEXT,
  -- 원문 토큰은 저장하지 않는다 — rate limit·"내 기록"용 해시만 (§6)
  client_token_hash TEXT    NOT NULL,
  -- 계정 도입 대비 예약. 지금은 항상 NULL (§6)
  user_id           TEXT,

  event_count       INTEGER NOT NULL,
  summary_json      TEXT
);

CREATE INDEX IF NOT EXISTS idx_runs_score      ON runs(score DESC);
CREATE INDEX IF NOT EXISTS idx_runs_started_at ON runs(started_at);
CREATE INDEX IF NOT EXISTS idx_runs_build      ON runs(build_sha, build_target);
-- 스팸 탐지·"내 기록" 조회
CREATE INDEX IF NOT EXISTS idx_runs_token      ON runs(client_token_hash, started_at);
-- 랭킹 전용 부분 인덱스 — 노출 조건을 인덱스에 박아 상위 N 조회를 싸게 만든다
CREATE INDEX IF NOT EXISTS idx_runs_ranking    ON runs(score DESC)
  WHERE complete = 1 AND build_dirty = 0;

CREATE TABLE IF NOT EXISTS run_events (
  run_id          TEXT    NOT NULL REFERENCES runs(run_id) ON DELETE CASCADE,
  seq             INTEGER NOT NULL,
  type            TEXT    NOT NULL,
  elapsed_seconds REAL    NOT NULL,
  round           INTEGER NOT NULL,
  round_time      REAL    NOT NULL,
  score           INTEGER NOT NULL,
  payload_json    TEXT    NOT NULL,
  PRIMARY KEY (run_id, seq)
);

CREATE INDEX IF NOT EXISTS idx_run_events_type ON run_events(run_id, type);
