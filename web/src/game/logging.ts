import type { Race } from '../data/units';
import type { SkillId, SkillRole } from '../data/skills';

export const GAME_LOG_VERSION = 1 as const;

export type LogTarget = 'web' | 'unity';
export type FinishReason = 'game_over' | 'cleared' | 'restart' | 'quit' | 'abandoned' | 'test';
export type XpSource = 'purchase' | 'mob_kill' | 'boss_kill' | 'augment';

export interface BuildInfo {
  readonly gitSha: string;
  readonly branch: string;
  readonly builtAt: string;
  readonly target: LogTarget;
  readonly appVersion: string;
  readonly engineVersion: string;
  readonly dirty: boolean;
}

export interface RunContext {
  readonly runId: string;
  readonly startedAt: string;
  readonly build: BuildInfo;
  readonly seed: number;
  readonly rngAlgorithm: 'mulberry32-v1';
}

export interface TowerLogRef {
  readonly name: string;
  readonly tier: number;
  readonly race: Race;
  readonly raceName: string;
}

export interface AugmentLogRef {
  readonly id: string;
  readonly name: string;
  readonly rarity: 'silver' | 'gold' | 'platinum';
}

export interface ChosenAugmentSummary {
  readonly augment: AugmentLogRef;
  readonly elapsedSeconds: number;
  readonly round: number;
  readonly roundTime: number;
}

export interface RunSummary {
  readonly v: typeof GAME_LOG_VERSION;
  readonly runId: string;
  readonly startedAt: string;
  readonly complete: boolean;
  readonly finishReason: FinishReason;
  readonly build: BuildInfo;
  readonly seed: number;
  readonly rngAlgorithm: 'mulberry32-v1';
  readonly score: number;
  readonly round: number;
  readonly elapsedSeconds: number;
  readonly kills: number;
  /** R60(CLEAR_ROUND) 통과 여부 — 스키마상 optional (2026-07-19 이전 로그에는 없다) */
  readonly cleared?: boolean;
  readonly bossCleared: number;
  readonly bossesKilled: number;
  readonly heroLevel: number;
  readonly heroXpPurchases: number;
  readonly heroXpSpent: number;
  readonly mineral: number;
  readonly gas: number;
  readonly probes: number;
  readonly upgrades: readonly [number, number, number, number];
  readonly towers: readonly { readonly tower: TowerLogRef; readonly count: number }[];
  readonly augments: readonly ChosenAugmentSummary[];
  readonly unitsSpawned: number;
  readonly merges: number;
  readonly towersSold: number;
  readonly godRerolls: number;
  readonly skillRerolls: number;
  readonly firstSeq: 1;
  readonly lastSeq: number;
}

export interface GameEventDataMap {
  readonly run_started: {
    readonly startedAt: string;
    readonly build: BuildInfo;
    readonly seed: number;
    readonly rngAlgorithm: 'mulberry32-v1';
    readonly initial: { readonly mineral: number; readonly gas: number; readonly lives: number };
  };
  readonly round_started: {
    readonly round: number;
    readonly enemyCount: number;
    readonly waveType: string;
  };
  readonly round_cleared: {
    readonly round: number;
    readonly mineralReward: number;
    readonly gasReward: number;
    readonly semantic: 'timer_elapsed';
  };
  readonly tower_spawned: {
    readonly source: 'purchase' | 'copy' | 'roll';
    readonly slotIndex: number;
    readonly tower: TowerLogRef;
    readonly cost: number;
  };
  readonly tower_merged: {
    readonly consumed: TowerLogRef;
    readonly consumedCount: number;
    readonly produced: TowerLogRef;
    readonly slotIndex: number;
    readonly isGod: boolean;
  };
  readonly tower_sold: { readonly slotIndex: number; readonly tower: TowerLogRef };
  readonly boss_summoned: { readonly level: number; readonly cooldown: number };
  readonly boss_killed: {
    readonly level: number;
    readonly reward: number;
    readonly unlocked: boolean;
    readonly maxBossLevel: number;
  };
  readonly augment_offered: {
    readonly offerId: number;
    readonly heroLevel: number;
    readonly choices: readonly AugmentLogRef[];
  };
  readonly augment_rerolled: {
    readonly offerId: number;
    readonly choiceIndex: number;
    readonly rerollCount: number;
    readonly cost: number;
    readonly choices: readonly AugmentLogRef[];
  };
  readonly augment_chosen: {
    readonly offerId: number;
    readonly choiceIndex: number;
    readonly augment: AugmentLogRef;
  };
  readonly hero_xp_bought: {
    readonly cost: number;
    readonly xp: number;
    readonly levelBefore: number;
    readonly levelAfter: number;
    readonly xpBefore: number;
    readonly xpAfter: number;
  };
  readonly hero_leveled: {
    readonly fromLevel: number;
    readonly toLevel: number;
    readonly xp: number;
    readonly source: XpSource;
  };
  readonly probe_bought: { readonly cost: number; readonly count: number };
  readonly race_upgraded: {
    readonly race: Race;
    readonly raceName: string;
    readonly fromLevel: number;
    readonly toLevel: number;
    readonly cost: number;
  };
  readonly god_rerolled: {
    readonly slotIndex: number;
    readonly cost: number;
    readonly before: TowerLogRef;
    readonly after: TowerLogRef;
    readonly rerollCount: number;
  };
  /** 스킬을 다시 뽑았다 (2026-07-20 스킬 독립) — 판이 낸 문제에 다시 답한 순간 */
  readonly skill_rerolled: {
    readonly before: SkillId;
    readonly after: SkillId;
    /** 새 스킬의 성향 — 보드 편중과 교차해 "답이 맞았는가"를 본다 */
    readonly afterRole: SkillRole;
    readonly cost: number;
    readonly rerollCount: number;
  };
  /** 증강 등급을 한 칸 올렸다 (2026-07-20 증강 강화) */
  readonly augment_upgraded: {
    readonly augment: AugmentLogRef;
    readonly fromRarity: AugmentLogRef['rarity'];
    readonly toRarity: AugmentLogRef['rarity'];
    readonly cost: number;
    readonly upgradeCount: number;
  };
  readonly tower_copy_marked: {
    readonly action: 'marked' | 'cancelled';
    readonly slotIndex?: number;
    readonly tower?: TowerLogRef;
  };
  /** R60(CLEAR_ROUND)을 넘겼다 — 게임은 무한 모드로 계속된다 (2026-07-19) */
  readonly game_cleared: {
    readonly round: number;
    readonly score: number;
    readonly lives: number;
  };
  readonly game_over: {
    readonly cause: 'leak';
    readonly enemyKind: 'mob' | 'boss';
    readonly bossLevel?: number;
    readonly lives: 0;
  };
  readonly run_finished: {
    readonly reason: FinishReason;
    readonly complete: boolean;
    readonly summary: RunSummary;
  };
}

export type GameEventType = keyof GameEventDataMap;

export type GameRunEvent = {
  [Type in GameEventType]: {
    readonly v: typeof GAME_LOG_VERSION;
    readonly runId: string;
    readonly seq: number;
    readonly elapsedSeconds: number;
    readonly round: number;
    readonly roundTime: number;
    readonly score: number;
    readonly type: Type;
    readonly data: GameEventDataMap[Type];
  };
}[GameEventType];

export interface GameEventSink {
  record(event: GameRunEvent): void;
  finish?(summary: RunSummary): void;
}

export interface GameLoggingSession {
  readonly context: RunContext;
  readonly sink: GameEventSink;
}

export class MemoryGameEventSink implements GameEventSink {
  readonly events: GameRunEvent[] = [];
  summary: RunSummary | null = null;

  record(event: GameRunEvent): void {
    this.events.push(event);
  }

  finish(summary: RunSummary): void {
    this.summary = summary;
  }

  toJsonl(): string {
    return this.events.map((event) => JSON.stringify(event)).join('\n') + (this.events.length ? '\n' : '');
  }
}
