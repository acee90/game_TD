import { error } from '@sveltejs/kit';
import type { EntryGenerator, PageLoad } from './$types';
import { GOD_TIER } from '@engine/data/units';
import { TOWER_CATALOG } from '@engine/data/tower-catalog';
import { towerWikiView, towerWikiViewById, type TowerWikiView } from '$lib/wiki/tower-wiki';
import { lineStepFor } from '$lib/wiki/tower-lines';

// Phaser 프리뷰 포함 — CSR 전용 (§3.1). 알려진 모든 타워 ID를 정적 엔트리로 생성 (M5).
export const ssr = false;

export const entries: EntryGenerator = () => TOWER_CATALOG.map((entry) => ({ id: entry.id }));

export const load: PageLoad = ({ params }) => {
  const entry = TOWER_CATALOG.find((e) => e.id === params.id);
  if (!entry) error(404, '없는 타워입니다');

  const view = towerWikiView(entry);
  const step = lineStepFor(params.id);

  let prev: TowerWikiView | null = null;
  let next: TowerWikiView | null = null;

  if (step) {
    // 같은 계열의 한 단계 전/후 — tower-lines.ts §설명대로 명칭 기준 참고 구성이다
    const prevId = step.index > 0 ? step.line.steps[step.index - 1] : undefined;
    const nextId =
      step.index < step.line.steps.length - 1 ? step.line.steps[step.index + 1] : undefined;
    prev = prevId ? (towerWikiViewById(prevId) ?? null) : null;
    next = nextId ? (towerWikiViewById(nextId) ?? null) : null;
  } else {
    // GOD 등급 — 라인이 없으니 같은 병과의 GOD 목록 안에서만 이동한다
    const godPeers = TOWER_CATALOG.filter(
      (e) => e.tier === GOD_TIER && e.def.race === entry.def.race,
    );
    const index = godPeers.findIndex((e) => e.id === params.id);
    prev = index > 0 ? towerWikiView(godPeers[index - 1]) : null;
    next = index < godPeers.length - 1 ? towerWikiView(godPeers[index + 1]) : null;
  }

  return { view, prev, next };
};
