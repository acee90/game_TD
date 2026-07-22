// ───────── 업로드 payload 기본 검사 ─────────
// 계획: docs/exec-plans/run-log-db-and-ranking.md §5.1 ("기본 검사만")
//
// 계약의 원본은 schemas/game-run-log/v1.schema.json이다. 여기 있는 것은 그 계약 중
// **서버가 강제하는 부분집합**을 손으로 옮긴 구현이다 — Worker는 eval을 못 쓰므로
// Ajv 런타임 컴파일을 쓸 수 없고, 이 범위에는 precompile 빌드 단계가 과하다.
// tests/validate.test.ts가 실제 fixture로 이 구현과 스키마의 합의를 확인한다.
//
// 점수 재계산·리플레이는 하지 않는다 (사용자 결정 2026-07-22, §2).

// 정상 종료 판정은 스키마 원본(engine)이 소유한다 — 규칙을 여기서 복제하지 않는다
import { isNormalEnd } from "../../../engine/src/game/logging";

/** eventBase.type enum — v1.schema.json과 같은 목록 */
export const EVENT_TYPES = [
  'run_started',
  'round_started',
  'round_cleared',
  'tower_spawned',
  'tower_merged',
  'tower_sold',
  'boss_summoned',
  'boss_killed',
  'augment_offered',
  'augment_rerolled',
  'augment_chosen',
  'hero_xp_bought',
  'hero_leveled',
  'probe_bought',
  'race_upgraded',
  'god_rerolled',
  'skill_rerolled',
  'augment_upgraded',
  'tower_copy_marked',
  'game_cleared',
  'game_over',
  'run_finished',
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

export interface RunEvent {
  v: 1;
  runId: string;
  seq: number;
  elapsedSeconds: number;
  round: number;
  roundTime: number;
  score: number;
  type: EventType;
  data: Record<string, unknown>;
}

export interface UploadBody {
  events: RunEvent[];
  clientToken: string;
  displayName?: string;
}

export interface Limits {
  /** 요청 본문 바이트 상한 */
  maxBytes: number;
  /** 런 하나의 이벤트 수 상한 */
  maxEvents: number;
  /** 표시명 최대 길이 */
  maxDisplayName: number;
  /** 미래 시각 허용 오차(초) — 클라이언트 시계 오차 흡수 */
  clockSkewSeconds: number;
}

/**
 * 실측 기반 상한 (2026-07-22 측정, 계획 §8 M0 게이트 충족).
 *
 * 측정: 봇 12판 게임오버까지 — 이벤트 p50 168 / 최대 207개, JSONL p50 45 / 최대 56 KB.
 * 라운드당 7.1이벤트·1.92KB이므로 R60 클리어를 외삽하면 약 427이벤트·115KB다.
 *
 * maxEvents는 두 천장 아래에 둔다:
 *  ① 현실 최대(R60 ≈ 427)의 10배 여유
 *  ② **D1 무료 플랜의 Worker 호출당 쿼리 50개 제한** — ingestRun은 조회 2회 + runs 1회 +
 *     이벤트를 EVENT_CHUNK(200)씩 batch로 나눠 넣는다(batch 1회 = 쿼리 1회). 즉 이벤트
 *     상한이 약 9,400개를 넘으면 batch 수가 50을 넘겨 런타임에 실패한다.
 */
export const DEFAULT_LIMITS: Limits = {
  maxBytes: 1024 * 1024, // 실측 최대 56 KB의 약 18배
  maxEvents: 5_000, // R60 외삽 427의 약 12배, D1 쿼리 한도(≈9,400) 아래
  maxDisplayName: 24,
  clockSkewSeconds: 24 * 60 * 60,
};

export type Rejection = { code: string; message: string };

export class ValidationError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

const fail = (code: string, message: string): never => {
  throw new ValidationError(code, message);
};

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const isFiniteNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

const EVENT_TYPE_SET: ReadonlySet<string> = new Set(EVENT_TYPES);

/** 표시명 — 제어문자 금지, 앞뒤 공백 제거, 길이 제한. 빈 값이면 익명(null) */
export function normalizeDisplayName(raw: unknown, limits: Limits): string | null {
  if (typeof raw !== 'string') return null;
  // 제어문자(C0 + DEL) 제거 — 표시명에 줄바꿈·이스케이프가 섞이지 않게 한다
  const cleaned = raw.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (cleaned.length === 0) return null;
  if (cleaned.length > limits.maxDisplayName) {
    fail('display_name_too_long', `표시명은 ${limits.maxDisplayName}자 이하여야 합니다`);
  }
  return cleaned;
}

function validateEventShape(e: unknown, index: number): RunEvent {
  if (!isPlainObject(e)) fail('event_not_object', `events[${index}]가 객체가 아닙니다`);
  const o = e as Record<string, unknown>;

  if (o.v !== 1) fail('unsupported_version', `events[${index}].v는 1이어야 합니다`);
  if (typeof o.runId !== 'string' || o.runId.length === 0 || o.runId.length > 128) {
    fail('bad_run_id', `events[${index}].runId가 유효하지 않습니다`);
  }
  if (!isInt(o.seq) || o.seq < 1) fail('bad_seq', `events[${index}].seq가 유효하지 않습니다`);
  if (!isFiniteNum(o.elapsedSeconds) || o.elapsedSeconds < 0) {
    fail('bad_elapsed', `events[${index}].elapsedSeconds가 유효하지 않습니다`);
  }
  if (!isInt(o.round) || o.round < 0) fail('bad_round', `events[${index}].round가 유효하지 않습니다`);
  if (!isFiniteNum(o.roundTime) || o.roundTime < 0) {
    fail('bad_round_time', `events[${index}].roundTime이 유효하지 않습니다`);
  }
  if (!isInt(o.score) || o.score < 0) fail('bad_score', `events[${index}].score가 유효하지 않습니다`);
  if (typeof o.type !== 'string' || !EVENT_TYPE_SET.has(o.type)) {
    fail('unknown_event_type', `events[${index}].type을 알 수 없습니다: ${String(o.type)}`);
  }
  if (!isPlainObject(o.data)) fail('bad_data', `events[${index}].data가 객체가 아닙니다`);

  return o as unknown as RunEvent;
}

export interface ValidatedRun {
  runId: string;
  events: RunEvent[];
  /** run_finished 이벤트가 있으면 true — "로그가 온전한가"이지 "정상 종료인가"가 아니다 */
  complete: boolean;
  /**
   * 정상 종료(game_over·cleared)로 끝났는가 — 랭킹·대시보드 노출 자격.
   * 중단(quit·restart)도 run_finished를 남기므로 complete만으로는 구분할 수 없다.
   */
  normalEnd: boolean;
  finishReason: string | null;
  summary: Record<string, unknown> | null;
  startedAt: string;
  build: {
    sha: string;
    branch: string | null;
    target: string;
    dirty: boolean;
    appVersion: string | null;
    engineVersion: string | null;
  };
  seed: number;
  rngAlgorithm: string;
  /** 마지막 이벤트 기준 진행도 (중단 런도 값이 있다) */
  score: number;
  round: number;
  displayName: string | null;
}

/**
 * 업로드 본문 전체를 검사하고 적재에 필요한 형태로 정규화한다.
 * 위반은 ValidationError를 던진다 — 호출자가 4xx로 변환한다.
 */
export function validateUpload(
  body: unknown,
  limits: Limits = DEFAULT_LIMITS,
  now: Date = new Date(),
): ValidatedRun {
  if (!isPlainObject(body)) fail('bad_body', '본문이 객체가 아닙니다');
  const b = body as Record<string, unknown>;

  if (typeof b.clientToken !== 'string' || b.clientToken.length < 8 || b.clientToken.length > 200) {
    fail('bad_client_token', 'clientToken이 유효하지 않습니다');
  }
  if (!Array.isArray(b.events)) fail('bad_events', 'events가 배열이 아닙니다');

  const rawEvents = b.events as unknown[];
  if (rawEvents.length === 0) fail('empty_events', 'events가 비어 있습니다');
  if (rawEvents.length > limits.maxEvents) {
    fail('too_many_events', `이벤트 수가 상한(${limits.maxEvents})을 넘습니다`);
  }

  const events = rawEvents.map(validateEventShape);

  // ── 런 단위 규칙 ──
  const runId = events[0].runId;
  for (const e of events) {
    if (e.runId !== runId) fail('mixed_run_id', '한 요청에 여러 runId가 섞여 있습니다');
  }

  if (events[0].type !== 'run_started') fail('missing_run_started', '첫 이벤트가 run_started가 아닙니다');
  if (events[0].seq !== 1) fail('bad_first_seq', '첫 이벤트의 seq가 1이 아닙니다');

  // seq는 순증(중복·역행 금지). 결번은 허용한다 — 중간 저장 실패로 빠질 수 있는데
  // "모든 판 수집"이 목표라 그 런까지 버리지는 않는다.
  for (let i = 1; i < events.length; i++) {
    if (events[i].seq <= events[i - 1].seq) {
      fail('seq_not_increasing', `seq가 순증하지 않습니다 (${events[i - 1].seq} → ${events[i].seq})`);
    }
    if (events[i].elapsedSeconds < events[i - 1].elapsedSeconds) {
      fail('time_went_backwards', 'elapsedSeconds가 역행합니다');
    }
  }

  // ── run_started 내용 ──
  const started = events[0].data as Record<string, unknown>;
  const build = started.build;
  if (!isPlainObject(build)) fail('missing_build', 'run_started.data.build가 없습니다');
  const bi = build as Record<string, unknown>;
  if (typeof bi.gitSha !== 'string' || bi.gitSha.length === 0) {
    fail('missing_git_sha', 'build.gitSha가 없습니다');
  }
  if (typeof bi.target !== 'string' || bi.target.length === 0) {
    fail('missing_target', 'build.target이 없습니다');
  }
  if (typeof started.startedAt !== 'string') fail('missing_started_at', 'startedAt이 없습니다');

  const startedAtMs = Date.parse(started.startedAt as string);
  if (Number.isNaN(startedAtMs)) fail('bad_started_at', 'startedAt을 해석할 수 없습니다');
  if (startedAtMs > now.getTime() + limits.clockSkewSeconds * 1000) {
    fail('started_at_in_future', 'startedAt이 미래입니다');
  }

  if (!isInt(started.seed)) fail('missing_seed', 'seed가 없습니다');

  // ── 종료 상태 ──
  const last = events[events.length - 1];
  const finished = last.type === 'run_finished' ? (last.data as Record<string, unknown>) : null;
  const summary = finished && isPlainObject(finished.summary) ? finished.summary : null;

  const finishReason = finished && typeof finished.reason === 'string' ? finished.reason : null;

  return {
    runId,
    events,
    complete: finished !== null,
    // 판정 기준의 원본은 engine/src/game/logging.ts다 — 여기서 규칙을 다시 쓰지 않는다
    normalEnd: isNormalEnd(finishReason),
    finishReason,
    summary,
    startedAt: started.startedAt as string,
    build: {
      sha: bi.gitSha as string,
      branch: typeof bi.branch === 'string' ? bi.branch : null,
      target: bi.target as string,
      dirty: bi.dirty === true,
      appVersion: typeof bi.appVersion === 'string' ? bi.appVersion : null,
      engineVersion: typeof bi.engineVersion === 'string' ? bi.engineVersion : null,
    },
    seed: started.seed as number,
    rngAlgorithm: typeof started.rngAlgorithm === 'string' ? started.rngAlgorithm : 'unknown',
    score: last.score,
    round: last.round,
    displayName: normalizeDisplayName(b.displayName, limits),
  };
}

/** SHA-256 hex — 토큰 해시와 재업로드 동일성 판정에 쓴다 */
export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** 재업로드가 같은 내용인지 판정하는 해시 — 이벤트 열만 본다 (표시명 변경은 허용) */
export function contentFingerprint(events: RunEvent[]): string {
  return JSON.stringify(events.map((e) => [e.seq, e.type, e.score, e.round]));
}
