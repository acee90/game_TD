import { describe, expect, it } from 'vitest';
import { Game, buildWave, effDmg, pickType } from '../src/game/game';
import { LOOP, SLOT_POS } from '../src/core/map';
import * as B from '../src/data/balance';

function place(g: Game, race: number, tier: number, mode: 'splash' | 'power' = 'splash') {
  const s = g.slots.find(s => !s.tower)!;
  s.tower = { race, tier, mode, cd: 0 };
  return s;
}

describe('맵 (십자 둘레 일주 + 입/출구 분리)', () => {
  it('타일은 십자 9 + 외곽 11 = 20칸', () => {
    expect(SLOT_POS.length).toBe(20);
  });
  it('경로는 입구→십자 일주→출구, 총 길이 > 0', () => {
    expect(LOOP).toBeGreaterThan(0);
  });
});

describe('웨이브 구성 · 예보', () => {
  it('라운드 성격이 일반/쇄도/중갑으로 순환한다', () => {
    expect(pickType(1)).toBe('normal');
    expect(pickType(4)).toBe('swarm');
    expect(pickType(6)).toBe('heavy');
  });
  it('쇄도는 다수 저체력, 중갑은 소수 고장갑', () => {
    const sw = buildWave(4), hv = buildWave(6);
    expect(sw.q.length).toBeGreaterThan(hv.q.length * 2);
    expect(hv.q[0].armor).toBeGreaterThan(sw.q[0].armor * 3);
  });
  it('예보 3개가 결정적으로 나온다 (빌드 커밋 근거)', () => {
    const g = new Game(() => 0);
    expect(g.forecast(3)).toEqual([pickType(2), pickType(3), pickType(4)]);
  });
});

describe('종족 정체성', () => {
  it('테란은 장사거리·고타격, 저그는 초공속·단사거리', () => {
    const g = new Game(() => 0);
    const terran = { race: 0, tier: 1, mode: 'splash' as const, cd: 0 };
    const zerg = { race: 1, tier: 1, mode: 'splash' as const, cd: 0 };
    expect(g.trng(terran)).toBeGreaterThan(g.trng(zerg) * 1.5);
    expect(g.tdmg(terran)).toBeGreaterThan(g.tdmg(zerg) * 2);
    expect(g.atkInt(zerg)).toBeLessThan(g.atkInt(terran) / 2);
  });
  it('토스만 광역, 갓은 모드를 따른다', () => {
    const g = new Game(() => 0);
    expect(g.isSplash({ race: 2, tier: 1, mode: 'power', cd: 0 })).toBe(true);
    expect(g.isSplash({ race: 0, tier: 1, mode: 'splash', cd: 0 })).toBe(false);
    expect(g.isSplash({ race: 0, tier: B.GOD_TIER, mode: 'splash', cd: 0 })).toBe(true);
    expect(g.isSplash({ race: 2, tier: B.GOD_TIER, mode: 'power', cd: 0 })).toBe(false);
  });
  it('종족 강화는 +10% 복리, 비용 누진', () => {
    const g = new Game(() => 0);
    g.gold = 100000;
    const t = { race: 0, tier: 1, mode: 'splash' as const, cd: 0 };
    const d0 = g.tdmg(t);
    g.upgrade(0);
    expect(g.tdmg(t)).toBeCloseTo(d0 * B.UP_MULT);
    expect(B.upCost(1)).toBeGreaterThan(B.upCost(0));
    expect(B.upCost(10)).toBeGreaterThan(B.upCost(0) * 5); // 누진
  });
});

describe('유닛 로스터 (4종족 × 4티어 × 2변형 = 32 + 갓 4 = 36종)', () => {
  it('이름표는 32종 전부 고유, 갓 4종 — 티어당 8유닛 (갓타디 구조)', () => {
    const flat = B.UNIT_NAMES.flat(2);
    expect(flat.length).toBe(32);
    expect(new Set(flat).size).toBe(32);
    expect(B.GOD_NAMES.length).toBe(4);
  });
  it('변형이 사거리/화력을 가른다 (돌격 근접 고화력 vs 저격 장거리 저화력)', () => {
    const g = new Game(() => 0);
    const rush = { race: 0, tier: 0, mode: 'splash' as const, cd: 0, variant: 0 };
    const snipe = { race: 0, tier: 0, mode: 'splash' as const, cd: 0, variant: 1 };
    expect(g.trng(snipe)).toBeGreaterThan(g.trng(rush) * 1.5);
    expect(g.tdmg(rush)).toBeGreaterThan(g.tdmg(snipe) * 1.5);
    expect(g.unitName(rush)).toBe('화염방사병');
    expect(g.unitName(snipe)).toBe('저격병');
  });
  it('생산·합성 결과에 종족(4)·변형(2)이 배정된다', () => {
    const g = new Game(() => 0.9);
    g.produce();
    const made = g.slots.find(s => s.tower)!.tower!;
    expect(made.race).toBe(3);    // 크리쳐
    expect(made.variant).toBe(1); // 정령
    const g2 = new Game(() => 0);
    g2.slots[0].tower = { race: 0, tier: 0, mode: 'splash', cd: 0, variant: 0 };
    g2.slots[1].tower = { race: 0, tier: 0, mode: 'splash', cd: 0, variant: 1 }; // 변형 달라도 종족+티어면 합성
    g2.tryMerge();
    const merged = g2.slots.filter(s => s.tower);
    expect(merged.length).toBe(1);
    expect(merged[0].tower!.tier).toBe(1);
    expect(merged[0].tower!.variant).toBe(0);
  });
  it('갓은 변형 무시, 갓 이름을 쓴다', () => {
    const g = new Game(() => 0);
    const god = { race: 2, tier: B.GOD_TIER, mode: 'power' as const, cd: 0, variant: 0 };
    expect(g.unitName(god)).toBe('갓 제라툴');
    expect(g.trng(god)).toBeCloseTo(B.TRNG[B.GOD_TIER] * B.POWER_RNG); // 변형 배수 미적용
    expect(g.unitName({ race: 3, tier: B.GOD_TIER, mode: 'splash', cd: 0 })).toBe('갓 스칸티드');
  });
});

describe('크리쳐 — 야수(무강화 브릿지) / 정령(감속 오라)', () => {
  it('크리쳐는 종족 강화가 불가하고, 강화가 피해에 안 먹힌다', () => {
    const g = new Game(() => 0);
    g.gold = 100000;
    expect(g.upgrade(B.CREATURE)).toBe(false);
    const beast = { race: 3, tier: 1, mode: 'splash' as const, cd: 0, variant: 0 };
    const d0 = g.tdmg(beast);
    g.upgrade(0); g.upgrade(1); g.upgrade(2);
    expect(g.tdmg(beast)).toBe(d0); // 무강화
  });
  it('야수는 같은 티어 표준 화력보다 기본기가 세다 (노업 밥값)', () => {
    const g = new Game(() => 0);
    const beast = { race: 3, tier: 1, mode: 'splash' as const, cd: 0, variant: 0 };
    const toss = { race: 2, tier: 1, mode: 'splash' as const, cd: 0, variant: 0 };
    expect(g.tdmg(beast) / g.atkInt(beast)).toBeGreaterThan(g.tdmg(toss) / g.atkInt(toss));
  });
  it('정령은 공격하지 않고, 범위 내 적을 늦춘다', () => {
    const g = new Game(() => 0);
    // 좌 팔 타일(126,270) — 입구 쪽 경로변에 정령 배치
    g.slots[4].tower = { race: 3, tier: 0, mode: 'splash', cd: 0, variant: 1 };
    g.startWave();
    g.update(0.05); // 첫 적 스폰
    const e = g.enemies[0];
    e.d = 150;      // 좌상 변 위 (120,231) — 정령 사거리 안
    const d0 = e.d;
    g.update(1.0);
    const moved = e.d - d0;
    expect(moved).toBeLessThan(e.spd * 1.0 * 0.85);   // 감속 적용
    expect(moved).toBeGreaterThan(0);
    expect(e.hp).toBe(e.maxhp);                        // 정령은 딜 없음
    expect(g.shots.length).toBe(0);
  });
});

describe('유효 피해(장갑)', () => {
  it('큰 타격은 장갑 관통, 소타격은 최소 10%로 바닥', () => {
    expect(effDmg(100, 30)).toBe(70);
    expect(effDmg(10, 30)).toBe(1);
  });
});

describe('생산·배치·합성 (갓타디식: 자리 먼저, 유닛은 배치 후 공개)', () => {
  it('빈 타일 생산 → 같은 종족+티어 2기 자동 합성(상위 티어)', () => {
    const g = new Game(() => 0);
    place(g, 0, 0);
    expect(g.produceAt(g.slots.find(s => !s.tower)!)).toBe(true);
    const towers = g.slots.filter(s => s.tower);
    expect(towers.length).toBe(1);
    expect(towers[0].tower!.tier).toBe(1);
  });
  it('점유 타일에는 생산 불가, 골드는 생산 즉시 차감', () => {
    const g = new Game(() => 0);
    const s = place(g, 0, 0);
    expect(g.produceAt(s)).toBe(false);
    const g0 = g.gold;
    g.produceAt(g.slots.find(x => !x.tower)!);
    expect(g.gold).toBe(g0 - B.PRODUCE_COST);
  });
  it('합성 연쇄로 갓까지 도달 가능', () => {
    const g = new Game(() => 0);
    place(g, 0, 3);
    place(g, 0, 3);
    g.tryMerge();
    expect(g.slots.find(s => s.tower)!.tower!.tier).toBe(B.GOD_TIER);
  });
  it('골드 부족이면 생산 실패', () => {
    const g = new Game();
    g.gold = 10;
    expect(g.produce()).toBe(false);
  });
});

describe('스플/파워 전환 — 갓 전용', () => {
  it('setGodsMode는 갓만 바꾸고 하위 티어는 손대지 않는다', () => {
    const g = new Game(() => 0);
    const lv2 = place(g, 0, 1, 'splash');
    const god = place(g, 1, B.GOD_TIER, 'splash');
    const n = g.setGodsMode('power');
    expect(n).toBe(1);
    expect(god.tower!.mode).toBe('power');
    expect(lv2.tower!.mode).toBe('splash'); // 무시됨 (하위 티어는 종족 고정)
  });
  it('갓이 없으면 0을 반환하고 안내 메시지', () => {
    const g = new Game(() => 0);
    place(g, 0, 1);
    expect(g.setGodsMode('power')).toBe(0);
    expect(g.msg).toContain('갓이 없습니다');
  });
  it('갓 파워 모드는 사거리 배수가 붙는다', () => {
    const g = new Game(() => 0);
    const god = place(g, 0, B.GOD_TIER, 'splash');
    const before = g.trng(god.tower!);
    g.setGodsMode('power');
    expect(g.trng(god.tower!)).toBeCloseTo(before * B.POWER_RNG);
  });
});

describe('일꾼 경제', () => {
  it('고용 비용이 누진하고 웨이브 보상에 일꾼 소득이 붙는다', () => {
    const g = new Game(() => 0);
    g.gold = 100000;
    g.hire(); g.hire();
    expect(g.workers).toBe(2);
    place(g, 0, B.GOD_TIER, 'splash');
    g.up = [50, 50, 50];
    g.startWave();
    let guard = 0;
    while (g.phase === 'wave' && guard++ < 10000) g.update(0.05);
    expect(g.round).toBe(2);
    expect(g.lastReward).toBe(B.waveReward(1) + 2 * B.WORKER_INCOME);
  });
});

describe('보스 소환 (소득 vs 안전)', () => {
  it('보스를 선택하면 웨이브에 합류하고, 잡으면 보상 골드', () => {
    const g = new Game(() => 0);
    place(g, 0, B.GOD_TIER, 'power');
    g.up = [80, 80, 80];
    g.chooseBoss(1);
    g.startWave();
    expect(g.spawnQ.some(e => e.type === 'boss')).toBe(true);
    const before = g.gold;
    let guard = 0;
    while (g.phase === 'wave' && guard++ < 20000) g.update(0.05);
    expect(g.round).toBe(2);
    expect(g.gold - before).toBeGreaterThan(B.BOSS_TIERS[1]!.reward(1));
  });
  it('화력이 없으면 보스 누출로 오염 폭증', () => {
    const g = new Game(() => 0);
    g.chooseBoss(2);
    g.startWave();
    let guard = 0;
    while (g.phase === 'wave' && !g.over && guard++ < 30000) g.update(0.05);
    expect(g.poll).toBeGreaterThanOrEqual(B.BOSS_TIERS[2]!.leakPenalty);
  });
});

describe('누출 → 오염 → 게임오버', () => {
  it('오염 100이면 over', () => {
    const g = new Game(() => 0);
    g.poll = 99;
    g.startWave();
    g.update(0.05);
    for (const e of g.enemies) e.d = LOOP + 1;
    g.update(0.05);
    expect(g.over).toBe(true);
  });
});

describe('3라운드 통합 스모크', () => {
  it('생산·배치·웨이브를 반복해도 크래시 없이 진행된다', () => {
    const g = new Game();
    g.gold = 3000;
    for (let i = 0; i < 6; i++) {
      g.produce();
    }
    let guard = 0;
    while (g.round < 4 && !g.over && guard++ < 60000) {
      if (g.phase === 'prep') {
        g.setGodsMode(g.next.type === 'heavy' ? 'power' : 'splash');
        g.startWave();
      }
      g.update(0.05);
    }
    expect(guard).toBeLessThan(60000);
    expect(g.round >= 4 || g.over).toBe(true);
  });
});
