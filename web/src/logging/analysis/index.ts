import Ajv2020, { type ErrorObject, type ValidateFunction } from 'ajv/dist/2020.js';
import gameRunLogSchema from '../../../../schemas/game-run-log/v1.schema.json';
import {
  GAME_LOG_VERSION,
  type BuildInfo,
  type FinishReason,
  type GameRunEvent,
  type GameEventType,
  type RunSummary,
} from '../../game/logging';

export type IssueSeverity = 'error' | 'warning';

export interface RunLogIssue {
  readonly severity: IssueSeverity;
  readonly code: string;
  readonly message: string;
  readonly source: string;
  readonly line?: number;
  readonly seq?: number;
}

export interface RunProjection {
  readonly runId: string;
  readonly startedAt: string;
  readonly complete: boolean;
  readonly finishReason: FinishReason | 'incomplete';
  readonly build: BuildInfo | null;
  readonly seed: number | null;
  readonly score: number;
  readonly round: number;
  readonly elapsedSeconds: number;
  readonly kills: number | null;
  readonly bossCleared: number;
  readonly bossesKilled: number;
  readonly heroLevel: number;
  readonly heroXpPurchases: number;
  readonly heroXpSpent: number;
  readonly mineral: number | null;
  readonly gas: number | null;
  readonly probes: number;
  readonly upgrades: readonly number[];
  readonly towers: RunSummary['towers'];
  readonly augments: RunSummary['augments'];
  readonly unitsSpawned: number;
  readonly merges: number;
  readonly towersSold: number;
  readonly godRerolls: number;
  readonly lastSeq: number;
  readonly source: 'recorded' | 'partial' | 'summary_only';
}

export interface RunAnalysis {
  readonly sourceName: string;
  readonly runId: string;
  readonly events: readonly GameRunEvent[];
  readonly summary: RunSummary | null;
  readonly projection: RunProjection;
  readonly bossEncounters: readonly BossEncounter[];
  readonly issues: readonly RunLogIssue[];
  readonly valid: boolean;
}

export interface BossEncounter {
  readonly level: number;
  readonly summonedAt: number;
  readonly summonedRound: number;
  readonly killedAt: number | null;
  readonly durationSeconds: number | null;
}

const ajv = new Ajv2020({ allErrors: true, strict: true });
ajv.addSchema(gameRunLogSchema);
const validateEvent = ajv.getSchema(gameRunLogSchema.$id) as ValidateFunction;
const validateSummary = ajv.compile({ $ref: `${gameRunLogSchema.$id}#/$defs/runSummary` });

const issue = (
  severity: IssueSeverity,
  code: string,
  message: string,
  source: string,
  line?: number,
  seq?: number,
): RunLogIssue => ({ severity, code, message, source, ...(line ? { line } : {}), ...(seq ? { seq } : {}) });

const formatAjvErrors = (errors: ErrorObject[] | null | undefined): string =>
  (errors ?? []).map((error) => `${error.instancePath || '/'} ${error.message ?? 'invalid'}`).join('; ');

function asEnvelope(value: unknown): value is { v?: unknown; runId?: unknown; seq?: unknown } {
  return typeof value === 'object' && value !== null;
}

function emptyProjection(runId = 'unknown'): RunProjection {
  return {
    runId,
    startedAt: '',
    complete: false,
    finishReason: 'incomplete',
    build: null,
    seed: null,
    score: 0,
    round: 0,
    elapsedSeconds: 0,
    kills: null,
    bossCleared: 0,
    bossesKilled: 0,
    heroLevel: 1,
    heroXpPurchases: 0,
    heroXpSpent: 0,
    mineral: null,
    gas: null,
    probes: 0,
    upgrades: [],
    towers: [],
    augments: [],
    unitsSpawned: 0,
    merges: 0,
    towersSold: 0,
    godRerolls: 0,
    lastSeq: 0,
    source: 'partial',
  };
}

function projectBossEncounters(events: readonly GameRunEvent[]): BossEncounter[] {
  const encounters: { level: number; summonedAt: number; summonedRound: number; killedAt: number | null; durationSeconds: number | null }[] = [];
  for (const event of events) {
    if (event.type === 'boss_summoned') {
      encounters.push({
        level: event.data.level,
        summonedAt: event.elapsedSeconds,
        summonedRound: event.round,
        killedAt: null,
        durationSeconds: null,
      });
    } else if (event.type === 'boss_killed') {
      const encounter = encounters.find((candidate) => candidate.level === event.data.level && candidate.killedAt === null);
      if (encounter) {
        encounter.killedAt = event.elapsedSeconds;
        encounter.durationSeconds = Math.max(0, event.elapsedSeconds - encounter.summonedAt);
      }
    }
  }
  return encounters;
}

function projectionFromSummary(summary: RunSummary, source: 'recorded' | 'summary_only'): RunProjection {
  return {
    runId: summary.runId,
    startedAt: summary.startedAt,
    complete: summary.complete,
    finishReason: summary.finishReason,
    build: summary.build,
    seed: summary.seed,
    score: summary.score,
    round: summary.round,
    elapsedSeconds: summary.elapsedSeconds,
    kills: summary.kills,
    bossCleared: summary.bossCleared,
    bossesKilled: summary.bossesKilled,
    heroLevel: summary.heroLevel,
    heroXpPurchases: summary.heroXpPurchases,
    heroXpSpent: summary.heroXpSpent,
    mineral: summary.mineral,
    gas: summary.gas,
    probes: summary.probes,
    upgrades: summary.upgrades,
    towers: summary.towers,
    augments: summary.augments,
    unitsSpawned: summary.unitsSpawned,
    merges: summary.merges,
    towersSold: summary.towersSold,
    godRerolls: summary.godRerolls,
    lastSeq: summary.lastSeq,
    source,
  };
}

function partialProjection(events: readonly GameRunEvent[]): RunProjection {
  const first = events.find((event) => event.type === 'run_started');
  const last = events.at(-1);
  const started = first?.type === 'run_started' ? first.data : null;
  const levelEvents = events.filter((event) => event.type === 'hero_leveled');
  const heroLevel = levelEvents.reduce(
    (level, event) => event.type === 'hero_leveled' ? Math.max(level, event.data.toLevel) : level,
    1,
  );
  return {
    ...emptyProjection(first?.runId ?? last?.runId ?? 'unknown'),
    startedAt: started?.startedAt ?? '',
    build: started?.build ?? null,
    seed: started?.seed ?? null,
    score: last?.score ?? 0,
    round: last?.round ?? 0,
    elapsedSeconds: last?.elapsedSeconds ?? 0,
    bossesKilled: events.filter((event) => event.type === 'boss_killed').length,
    bossCleared: events.reduce(
      (level, event) => event.type === 'boss_killed' ? Math.max(level, event.data.level) : level,
      0,
    ),
    heroLevel,
    heroXpPurchases: events.filter((event) => event.type === 'hero_xp_bought').length,
    heroXpSpent: events.reduce(
      (sum, event) => event.type === 'hero_xp_bought' ? sum + event.data.cost : sum,
      0,
    ),
    probes: events.filter((event) => event.type === 'probe_bought').length,
    unitsSpawned: events.filter(
      (event) => event.type === 'tower_spawned' && event.data.source === 'purchase',
    ).length,
    merges: events.filter((event) => event.type === 'tower_merged').length,
    towersSold: events.filter((event) => event.type === 'tower_sold').length,
    godRerolls: events.filter((event) => event.type === 'god_rerolled').length,
    lastSeq: last?.seq ?? 0,
  };
}

function compareSummary(
  summary: RunSummary,
  events: readonly GameRunEvent[],
  sourceName: string,
  issues: RunLogIssue[],
): void {
  const last = events.at(-1);
  const count = (type: GameEventType): number => events.filter((event) => event.type === type).length;
  const checks: readonly [boolean, string][] = [
    [summary.runId === last?.runId, 'runId'],
    [summary.lastSeq === last?.seq, 'lastSeq'],
    [summary.score === last?.score, 'score'],
    [summary.round === last?.round, 'round'],
    [Math.abs(summary.elapsedSeconds - (last?.elapsedSeconds ?? 0)) < 1e-6, 'elapsedSeconds'],
    [summary.unitsSpawned === events.filter((event) => event.type === 'tower_spawned' && event.data.source === 'purchase').length, 'unitsSpawned'],
    [summary.merges === count('tower_merged'), 'merges'],
    [summary.towersSold === count('tower_sold'), 'towersSold'],
    [summary.godRerolls === count('god_rerolled'), 'godRerolls'],
    [summary.heroXpPurchases === count('hero_xp_bought'), 'heroXpPurchases'],
    [summary.bossesKilled === count('boss_killed'), 'bossesKilled'],
  ];
  for (const [matches, field] of checks) {
    if (!matches) issues.push(issue('error', 'summary_mismatch', `summary.${field}가 이벤트 재집계와 다릅니다.`, sourceName));
  }
}

function compareExternalSummary(
  embedded: RunSummary,
  external: RunSummary,
  sourceName: string,
  issues: RunLogIssue[],
): void {
  for (const field of ['runId', 'lastSeq', 'score', 'round', 'finishReason', 'complete'] as const) {
    if (embedded[field] !== external[field]) {
      issues.push(issue('error', 'external_summary_mismatch', `별도 summary의 ${field}가 run_finished와 다릅니다.`, sourceName));
    }
  }
}

export function parseRunSummaryText(text: string, sourceName = 'summary.json'):
  { readonly summary: RunSummary | null; readonly issues: readonly RunLogIssue[] } {
  try {
    const value = JSON.parse(text) as unknown;
    if (!validateSummary(value)) {
      return { summary: null, issues: [issue('error', 'summary_schema', formatAjvErrors(validateSummary.errors), sourceName)] };
    }
    return { summary: value as RunSummary, issues: [] };
  } catch (error) {
    return { summary: null, issues: [issue('error', 'summary_json', error instanceof Error ? error.message : String(error), sourceName)] };
  }
}

export function analysisFromSummary(summary: RunSummary, sourceName: string): RunAnalysis {
  return {
    sourceName,
    runId: summary.runId,
    events: [],
    summary,
    projection: projectionFromSummary(summary, 'summary_only'),
    bossEncounters: [],
    issues: [issue('warning', 'summary_only', '이벤트 JSONL 없이 summary만 불러왔습니다.', sourceName)],
    valid: true,
  };
}

export function analyzeRunLogText(
  text: string,
  sourceName = 'events.jsonl',
  externalSummary: RunSummary | null = null,
): RunAnalysis {
  const issues: RunLogIssue[] = [];
  const events: GameRunEvent[] = [];
  const lines = text.split(/\r?\n/);

  for (let index = 0; index < lines.length; index++) {
    const raw = lines[index].trim();
    if (!raw) continue;
    const line = index + 1;
    let value: unknown;
    try {
      value = JSON.parse(raw) as unknown;
    } catch (error) {
      issues.push(issue('error', 'invalid_json', error instanceof Error ? error.message : String(error), sourceName, line));
      continue;
    }
    const envelope = asEnvelope(value) ? value : null;
    if (envelope && envelope.v !== undefined && envelope.v !== GAME_LOG_VERSION) {
      issues.push(issue('error', 'unsupported_version', `지원하지 않는 로그 버전: ${String(envelope.v)}`, sourceName, line));
      continue;
    }
    if (!validateEvent(value)) {
      const seq = envelope && typeof envelope.seq === 'number' ? envelope.seq : undefined;
      issues.push(issue('error', 'schema_violation', formatAjvErrors(validateEvent.errors), sourceName, line, seq));
      continue;
    }
    events.push(value as GameRunEvent);
  }

  if (events.length === 0) {
    issues.push(issue('error', 'empty_run', '유효한 이벤트가 없습니다.', sourceName));
    const projection = externalSummary ? projectionFromSummary(externalSummary, 'recorded') : emptyProjection();
    return { sourceName, runId: projection.runId, events, summary: externalSummary, projection, bossEncounters: [], issues, valid: false };
  }

  const runId = events[0].runId;
  events.forEach((event, index) => {
    if (event.runId !== runId) {
      issues.push(issue('error', 'mixed_run_id', `runId ${event.runId}가 첫 runId ${runId}와 다릅니다.`, sourceName, undefined, event.seq));
    }
    const expected = index + 1;
    if (event.seq !== expected) {
      issues.push(issue('error', 'seq_discontinuity', `seq ${expected}가 필요하지만 ${event.seq}가 왔습니다.`, sourceName, undefined, event.seq));
    }
  });

  if (events[0].type !== 'run_started') {
    issues.push(issue('error', 'missing_run_started', '첫 이벤트가 run_started가 아닙니다.', sourceName, undefined, events[0].seq));
  }

  const finishedEvents = events.filter((event) => event.type === 'run_finished');
  let summary: RunSummary | null = null;
  if (finishedEvents.length === 0) {
    issues.push(issue('warning', 'incomplete_run', 'run_finished가 없는 미완료 런입니다.', sourceName));
  } else {
    if (finishedEvents.length > 1) {
      issues.push(issue('error', 'duplicate_run_finished', 'run_finished가 두 번 이상 기록됐습니다.', sourceName));
    }
    const finished = finishedEvents[0];
    if (events.at(-1) !== finished) {
      issues.push(issue('error', 'run_finished_not_last', 'run_finished 뒤에 이벤트가 있습니다.', sourceName, undefined, finished.seq));
    }
    summary = finished.data.summary;
    if (summary.complete !== finished.data.complete || summary.finishReason !== finished.data.reason) {
      issues.push(issue('error', 'finish_mismatch', 'run_finished envelope와 summary 종료 정보가 다릅니다.', sourceName));
    }
    compareSummary(summary, events, sourceName, issues);
    if (externalSummary) compareExternalSummary(summary, externalSummary, sourceName, issues);
  }

  if (!summary && externalSummary) {
    issues.push(issue('warning', 'orphan_summary', '미완료 이벤트에 별도 summary가 있어 이벤트 기준 부분 요약을 사용합니다.', sourceName));
  }
  const projection = summary ? projectionFromSummary(summary, 'recorded') : partialProjection(events);
  return {
    sourceName,
    runId,
    events,
    summary,
    projection,
    bossEncounters: projectBossEncounters(events),
    issues,
    valid: !issues.some((entry) => entry.severity === 'error'),
  };
}

export function eventDescription(event: GameRunEvent): string {
  switch (event.type) {
    case 'tower_spawned': return `${event.data.tower.name} 생성 (${event.data.source})`;
    case 'tower_merged': return `${event.data.consumed.name} → ${event.data.produced.name}`;
    case 'tower_sold': return `${event.data.tower.name} 판매`;
    case 'boss_summoned': return `보스 Lv${event.data.level} 소환`;
    case 'boss_killed': return `보스 Lv${event.data.level} 처치`;
    case 'augment_chosen': return `${event.data.augment.name} 선택`;
    case 'augment_offered': return `증강 ${event.data.choices.length}개 제안`;
    case 'augment_rerolled': return `증강 리롤 ${event.data.rerollCount}회`;
    case 'hero_xp_bought': return `XP ${event.data.xp} 구매`;
    case 'hero_leveled': return `영웅 Lv${event.data.toLevel}`;
    case 'race_upgraded': return `${event.data.raceName} Lv${event.data.toLevel}`;
    case 'round_started': return `라운드 ${event.data.round} 시작`;
    case 'round_cleared': return `라운드 ${event.data.round} 정산`;
    case 'game_cleared': return `R${event.data.round} 클리어! (라이프 ${event.data.lives})`;
    case 'game_over': return `${event.data.enemyKind} 누출로 패배`;
    case 'run_started': return '런 시작';
    case 'run_finished': return `런 종료 (${event.data.reason})`;
    default: return event.type.replaceAll('_', ' ');
  }
}
