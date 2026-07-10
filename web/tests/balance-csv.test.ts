// docs/balance/*.csv 는 tools/gen-balance-csv.ts 가 코드에서 생성한다.
// 밸런스를 고치고 CSV를 다시 뽑지 않으면 여기서 잡힌다.
//
//   npm run gen:balance

import { existsSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import * as H from '../src/data/hero';
import * as K from '../src/data/skills';

const DIR = `${dirname(fileURLToPath(import.meta.url))}/../../docs/balance`;
const read = (name: string): string[] => {
  expect(existsSync(`${DIR}/${name}`), `${name} 이 없다 — npm run gen:balance`).toBe(true);
  return readFileSync(`${DIR}/${name}`, 'utf8').trim().split('\n');
};

describe('밸런스 CSV — 코드와 일치해야 한다', () => {
  test('증강이 전부 들어있다', () => {
    const rows = read('augments.csv');
    expect(rows).toHaveLength(H.AUGMENTS.length + 1); // 헤더 포함
    for (const augment of H.AUGMENTS) {
      expect(rows.some((r) => r.startsWith(`${augment.id},`))).toBe(true);
    }
  });

  test('등급 수치가 코드와 같다', () => {
    const rows = read('rarities.csv').slice(1);
    for (const rarity of H.RARITY_ORDER) {
      const row = rows.find((r) => r.startsWith(`${rarity},`))!;
      const [, , power] = row.split(',');
      expect(Number(power)).toBe(H.RARITIES[rarity].power);
    }
  });

  test('시너지는 계열마다 특화·대특화 두 줄', () => {
    const rows = read('synergies.csv').slice(1);
    expect(rows).toHaveLength(Object.keys(H.SYNERGIES).length * 2);
  });

  test('증강 스케줄이 코드와 같다', () => {
    const rows = read('augment-schedule.csv').slice(1);
    const levels = rows.slice(0, H.AUGMENT_LEVELS.length).map((r) => Number(r.split(',')[1]));
    expect(levels).toEqual([...H.AUGMENT_LEVELS]);
  });

  test('상수 표의 값이 코드와 같다', () => {
    const rows = read('hero-constants.csv').slice(1);
    const value = (key: string) => Number(rows.find((r) => r.startsWith(`${key},`))!.split(',')[1]);
    expect(value('DMG_PER_STR')).toBe(H.DMG_PER_STR);
    expect(value('LEVEL_MULT_GROWTH')).toBe(H.LEVEL_MULT_GROWTH);
    expect(value('XP_COST_GROWTH')).toBe(H.XP_COST_GROWTH);
    expect(value('SYNERGY_THRESHOLD')).toBe(H.SYNERGY_THRESHOLD);
  });

  test('액티브 스킬 4종이 들어있다', () => {
    const rows = read('skills.csv').slice(1);
    expect(rows).toHaveLength(K.SKILL_IDS.length);
    for (const id of K.SKILL_IDS) {
      expect(rows.some((r) => r.startsWith(`${id},`))).toBe(true);
    }
  });

  test('스킬 증강과 개조 증강이 열로 표시된다', () => {
    const rows = read('augments.csv');
    expect(rows[0]).toContain('grantsSkill');
    expect(rows[0]).toContain('requiresSkill');
    expect(rows.some((r) => r.includes('skill_volley'))).toBe(true);
    expect(rows.some((r) => r.includes('explosive_arrow'))).toBe(true);
  });

  test('파워 커브에 무증강과 특화 빌드가 둘 다 있다', () => {
    const rows = read('hero-power-curve.csv');
    expect(rows[0]).toContain('vsGodTower');
    expect(rows.some((r) => r.startsWith('증강 없음,'))).toBe(true);
    expect(rows.some((r) => r.includes('완숙'))).toBe(true);
  });
});
