import { error } from '@sveltejs/kit';
import type { EntryGenerator, PageLoad } from './$types';
import { TOWER_CATALOG } from '@engine/data/tower-catalog';
import { towerWikiView } from '@engine/lib/tower-wiki';

// Phaser 프리뷰 포함 — CSR 전용 (§3.1). 알려진 모든 타워 ID를 정적 엔트리로 생성 (M5).
export const ssr = false;

export const entries: EntryGenerator = () => TOWER_CATALOG.map((entry) => ({ id: entry.id }));

export const load: PageLoad = ({ params }) => {
  const index = TOWER_CATALOG.findIndex((entry) => entry.id === params.id);
  if (index < 0) error(404, '없는 타워입니다');

  const view = towerWikiView(TOWER_CATALOG[index]);
  const prev = index > 0 ? towerWikiView(TOWER_CATALOG[index - 1]) : null;
  const next = index < TOWER_CATALOG.length - 1 ? towerWikiView(TOWER_CATALOG[index + 1]) : null;
  return { view, prev, next };
};
