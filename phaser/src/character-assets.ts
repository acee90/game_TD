// ───────── 타워 캐릭터 에셋 배정 ─────────
// 전투 씬과 Wiki가 같은 배정을 공유한다. 규칙·밸런스와 무관한 렌더 전용 매핑이다.

/** Phaser에 적재 가능한 승인된 캐릭터 시트 전체. */
export const CHARACTER_ASSETS = [
  'human-spearman',
  'human-archer',
  'human-mage',
  'human-artillery',
  'artillery-cannon',
  'human-soldier-sword-shield',
] as const;
export type CharacterAsset = (typeof CHARACTER_ASSETS)[number];

/**
 * 공격 시트(8프레임)에서 투사체가 실제로 떠나는 프레임 (0-based).
 * 준비동작 뒤 발사 정점에 맞춘다 — 이 프레임에서 투사체를 생성해야 손·무기와 싱크가 맞는다.
 * 활 놓기·시전·창 최대 전진·검 슬래시 = 4, 총 머즐 플래시 = 1, 대포 점화 = 3.
 * attack1·attack2는 같은 8프레임 스윙이라 발사 정점을 공유한다.
 */
export const ATTACK_RELEASE_FRAME: Record<CharacterAsset, number> = {
  'human-spearman': 4,
  'human-archer': 4,
  'human-mage': 4,
  'human-artillery': 1,
  'artillery-cannon': 3,
  'human-soldier-sword-shield': 4,
};

/** 실게임 보드에서 현재 사용하는 캐릭터 시트. */
export const BATTLE_CHARACTER_ASSETS = [
  'human-spearman',
  'human-archer',
  'human-mage',
  'human-artillery',
  'artillery-cannon',
] as const;

/** Wiki·전투에서 대포 오브젝트를 사용하는 투석기 계열. */
const CANNON_TOWER_IDS = new Set([
  'artillery-small-catapult',
  'artillery-mangonel',
  'artillery-trebuchet',
  'artillery-megalith-catapult',
]);

/** 현재 승인된 캐릭터 에셋으로 표시할 타워 계열. */
export function characterAssetForTower(id: string): CharacterAsset | null {
  if (id.startsWith('magic-')) return 'human-mage';
  if (id.includes('archer') || id.includes('bowman')) return 'human-archer';
  if (CANNON_TOWER_IDS.has(id)) return 'artillery-cannon';
  if (id.startsWith('artillery-')) return 'human-artillery';
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
