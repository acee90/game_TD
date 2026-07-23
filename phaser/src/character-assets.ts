// ───────── 타워 캐릭터 에셋 배정 ─────────
// 전투 씬과 Wiki가 같은 배정을 공유한다. 규칙·밸런스와 무관한 렌더 전용 매핑이다.

/** Phaser에 적재 가능한 승인된 캐릭터 시트 전체. */
export const CHARACTER_ASSETS = [
  'human-spearman',
  'human-archer',
  'human-mage',
  'human-soldier-sword-shield',
] as const;
export type CharacterAsset = (typeof CHARACTER_ASSETS)[number];

/** 실게임 보드에서 현재 사용하는 캐릭터 시트. */
export const BATTLE_CHARACTER_ASSETS = ['human-spearman', 'human-archer', 'human-mage'] as const;

/** 현재 승인된 캐릭터 에셋으로 표시할 타워 계열. */
export function characterAssetForTower(id: string): CharacterAsset | null {
  if (id.startsWith('magic-')) return 'human-mage';
  if (id.includes('archer') || id.includes('bowman')) return 'human-archer';
  if (id.startsWith('army-')) return 'human-spearman';
  return null;
}

const KNIGHT_LINE_IDS = new Set([
  'army-squire',
  'army-knight',
  'army-sword-expert',
  'army-sword-master',
]);

/**
 * Wiki 검수용 배정. 기사 계열은 생성 창병 대신 원본 팩의 검방병을 우선 보여 준다.
 * 게임 보드 배정은 아직 바꾸지 않는다.
 */
export function characterAssetForWikiTower(id: string): CharacterAsset | null {
  if (KNIGHT_LINE_IDS.has(id)) return 'human-soldier-sword-shield';
  return characterAssetForTower(id);
}
