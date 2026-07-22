// ───────── 명예의 전당 ─────────
// 원본은 기록을 맵 파일에 하드코딩해 두었다(strings:592/655). 여기서는 브라우저에 저장한다.

import { HALL_OF_FAME_SIZE } from '@engine/data/score';

const STORAGE_KEY = 'gattadi.hallOfFame.v1';

export interface Record {
  readonly score: number;
  readonly round: number;
  readonly kills: number;
  readonly heroLevel: number;
  /** 에포크 밀리초 */
  readonly at: number;
}

const isRecord = (value: unknown): value is Record => {
  if (typeof value !== 'object' || value === null) return false;
  const r = value as Partial<Record>;
  return (
    typeof r.score === 'number' &&
    typeof r.round === 'number' &&
    typeof r.kills === 'number' &&
    typeof r.heroLevel === 'number' &&
    typeof r.at === 'number'
  );
};

/** 저장된 기록. 읽기에 실패하면 빈 목록. */
export function load(): Record[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isRecord).sort((a, b) => b.score - a.score);
  } catch {
    return [];
  }
}

/** 새 기록을 넣고 상위 HALL_OF_FAME_SIZE개만 남긴다. 저장 실패해도 목록은 돌려준다. */
export function submit(record: Record): Record[] {
  const next = [...load(), record].sort((a, b) => b.score - a.score).slice(0, HALL_OF_FAME_SIZE);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // 저장 못 해도 이번 판 순위는 보여준다
  }
  return next;
}

/** 이 점수가 몇 위인가 (1-base). 순위권 밖이면 null. */
export function rankOf(records: readonly Record[], record: Record): number | null {
  const index = records.findIndex((r) => r.at === record.at && r.score === record.score);
  return index >= 0 ? index + 1 : null;
}
