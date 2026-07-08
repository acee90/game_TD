// ───────── 게임 로직 (DOM 없음 — 테스트 가능) ─────────
import * as B from '../data/balance';
import { DOOR_OUT, LOOP, SLOT_POS, pathPos } from '../core/map';
import type { Enemy, EnemySpec, FloatText, Mode, Phase, Shot, Slot, Tower } from './types';

export interface Wave {
  type: B.WaveType;
  q: EnemySpec[];
}

export function pickType(r: number): B.WaveType {
  if (r < 3) return 'normal';
  const m = r % 3;
  return m === 0 ? 'heavy' : m === 1 ? 'swarm' : 'normal';
}

export function buildWave(r: number): Wave {
  const t = pickType(r);
  const hp = B.waveHP(r);
  const q: EnemySpec[] = [];
  if (t === 'swarm') {
    for (let i = 0; i < 16 + r; i++)
      q.push({ hp: hp * 0.55, armor: hp * 0.02, spd: 78, r: 8, type: t });
  } else if (t === 'heavy') {
    for (let i = 0; i < 5; i++)
      q.push({ hp: hp * 2.6, armor: hp * 0.13, spd: 42, r: 13, type: t });
  } else {
    for (let i = 0; i < 9; i++)
      q.push({ hp, armor: hp * 0.05, spd: 56, r: 10, type: t });
  }
  return { type: t, q };
}

// 유효 피해: 장갑을 뺀다(단일 큰 타격 = 장갑 관통 / 광역 소타격 = 장갑에 갉아먹힘)
export const effDmg = (raw: number, armor: number) => Math.max(raw - armor, raw * 0.1);

export class Game {
  gold = B.START_GOLD;
  poll = 0;
  round = 1;
  phase: Phase = 'prep';
  workers = 0;
  up = [0, 0, 0];
  boss = 0;
  over = false;

  slots: Slot[] = SLOT_POS.map(([x, y]) => ({ x, y, tower: null }));
  sel: Slot | null = null;

  enemies: Enemy[] = [];
  shots: Shot[] = [];
  floats: FloatText[] = [];
  spawnQ: EnemySpec[] = [];
  spawnT = 0;
  alive = 0;

  next: Wave = buildWave(1);
  msg = '준비 단계: 다음 웨이브 성격을 보고 스플/파워를 맞춘 뒤 시작하세요.';
  lastReward = 0;

  rand: () => number;
  constructor(rand: () => number = Math.random) {
    this.rand = rand;
  }

  // ── 타워 수치 (갓 = 모드 기반 / 하위 티어 = 종족 정체성 × 역할 변형) ──
  isGod(t: Tower) { return t.tier === B.GOD_TIER; }
  isCreature(t: Tower) { return t.race === B.CREATURE; }
  isSpirit(t: Tower) { return this.isCreature(t) && !this.isGod(t) && (t.variant ?? 0) === 1; }
  isBeast(t: Tower) { return this.isCreature(t) && !this.isGod(t) && (t.variant ?? 0) === 0; }
  variant(t: Tower): B.Variant {
    if (this.isBeast(t)) return { name: '야수', rngMult: B.BEAST_RNG, dmgMult: B.BEAST_DMG };
    if (this.isSpirit(t)) return { name: '정령', rngMult: B.SPIRIT_RNG, dmgMult: 0 };
    return B.VARIANTS[t.variant ?? 0];
  }
  // 크리쳐는 종족 강화가 안 먹힌다 (무커밋 = 정체성)
  upMult(t: Tower) { return this.isCreature(t) ? 1 : Math.pow(B.UP_MULT, this.up[t.race]); }
  tdmg(t: Tower) {
    const base = B.DMG0 * B.TDMG[t.tier] * this.upMult(t);
    if (this.isGod(t)) return base * (this.isCreature(t) ? B.CREATURE_GOD : 1);
    return base * B.RSTAT[t.race].dmgMult * this.variant(t).dmgMult;
  }
  atkInt(t: Tower) { return this.isGod(t) ? B.ATK_INT : B.RSTAT[t.race].atkInt; }
  trng(t: Tower) {
    return B.TRNG[t.tier] * (this.isGod(t)
      ? (t.mode === 'power' ? B.POWER_RNG : 1)
      : B.RSTAT[t.race].rangeMult * this.variant(t).rngMult);
  }
  isSplash(t: Tower) { return this.isGod(t) ? t.mode === 'splash' : B.RSTAT[t.race].splash; }
  unitName(t: Tower) {
    return this.isGod(t)
      ? B.GOD_NAMES[t.race]
      : B.UNIT_NAMES[t.race][t.tier][t.variant ?? 0];
  }

  // ── 생산 (갓타디식: 자리 먼저, 유닛은 배치 후 공개) / 합성 / 판매 ──
  produceAt(slot: Slot): boolean {
    if (slot.tower) { this.msg = '빈 타일을 선택하세요.'; return false; }
    if (this.gold < B.PRODUCE_COST) { this.msg = `골드 부족 — 생산 ${B.PRODUCE_COST} 필요.`; return false; }
    this.gold -= B.PRODUCE_COST;
    const t: Tower = {
      race: Math.floor(this.rand() * 4), tier: 0, mode: 'splash', cd: 0,
      variant: Math.floor(this.rand() * 2),
    };
    slot.tower = t;
    this.float(slot.x, slot.y, this.unitName(t), B.RCOL[t.race]);
    this.msg = `${this.unitName(t)}(${B.RACE[t.race]} · ${this.variant(t).name}) 등장!`;
    this.sel = slot;
    this.tryMerge();
    if (!slot.tower) this.sel = null; // 즉시 합성으로 소모된 경우
    return true;
  }

  // 버튼/단축키 편의: 무작위 빈 타일에 생산 (자리도 운에 맡기는 최속 템포)
  produce(): boolean {
    const empty = this.slots.filter(s => !s.tower);
    if (!empty.length) { this.msg = '빈 타일이 없습니다 — 합성/판매로 정리하세요.'; return false; }
    return this.produceAt(empty[Math.floor(this.rand() * empty.length)]);
  }

  // 같은 종족+티어 2기 → 상위 티어(종족 랜덤). 연쇄 검사.
  tryMerge(): void {
    for (let ti = 0; ti < B.GOD_TIER; ti++)
      for (let r = 0; r < 4; r++) {
        const g = this.slots.filter(s => s.tower && s.tower.tier === ti && s.tower.race === r);
        if (g.length >= 2) {
          const keep = g[0], drop = g[1];
          drop.tower = null;
          keep.tower = {
            race: Math.floor(this.rand() * 4),
            tier: ti + 1,
            mode: keep.tower!.mode,
            cd: 0,
            variant: Math.floor(this.rand() * 2),
          };
          this.float(keep.x, keep.y, ti + 1 === B.GOD_TIER ? '★갓★' : '합성!',
            ti + 1 === B.GOD_TIER ? '#ffd23f' : '#fff');
          return this.tryMerge();
        }
      }
  }

  sellSel(): boolean {
    if (!this.sel?.tower) return false;
    this.gold += B.sellPrice(this.sel.tower.tier);
    this.sel.tower = null;
    this.sel = null;
    this.msg = '판매 완료.';
    return true;
  }

  // ── 스플/파워 전환 — 갓 전용 (갓타디의 백미: "갓 뜸 = 운영 시작") ──
  setGodsMode(mode: Mode): number {
    let n = 0;
    for (const s of this.slots)
      if (s.tower && this.isGod(s.tower)) { s.tower.mode = mode; n++; }
    this.msg = n === 0
      ? '변환할 갓이 없습니다 — 동일 종족 Lv4 2기를 합성하세요.'
      : `갓 ${n}기 → ${mode === 'splash' ? '광역(라인청소)' : '단일(보스·중갑)'} 변환`;
    return n;
  }
  toggleSel(): void {
    const t = this.sel?.tower;
    if (t && this.isGod(t)) t.mode = t.mode === 'splash' ? 'power' : 'splash';
  }

  // ── 웨이브 예보 (흐름을 읽고 빌드를 커밋하는 근거) ──
  forecast(n = 3): B.WaveType[] {
    const out: B.WaveType[] = [];
    for (let i = 1; i <= n; i++) out.push(pickType(this.round + i));
    return out;
  }

  // ── 일꾼 / 강화 / 보스 선택 ──
  hire(): boolean {
    const c = B.hireCost(this.workers);
    if (this.gold < c) { this.msg = `골드 부족 — 일꾼 ${c} 필요.`; return false; }
    if (this.workers >= B.WORKER_MAX) { this.msg = `일꾼은 최대 ${B.WORKER_MAX}기.`; return false; }
    this.gold -= c;
    this.workers++;
    this.msg = `일꾼 고용! 웨이브당 +${B.WORKER_INCOME}골드 (지금 투자 = 미래 소득, 대신 이번 방어는 얇아짐)`;
    return true;
  }

  upgrade(r: number): boolean {
    if (r >= B.CREATURE) { this.msg = '크리쳐는 강화할 수 없습니다 (무커밋 = 정체성).'; return false; }
    const c = B.upCost(this.up[r]);
    if (this.gold < c) { this.msg = `골드 부족 — ${B.RACE[r]} 강화 ${c} 필요`; return false; }
    this.gold -= c;
    this.up[r]++;
    this.msg = `${B.RACE[r]} 강화 → Lv${this.up[r]} (공격력 +10% 복리 · 다음 비용 ${B.upCost(this.up[r])})`;
    return true;
  }

  chooseBoss(n: number): void {
    if (this.phase !== 'prep') return;
    this.boss = n;
  }

  // ── 웨이브 진행 ──
  startWave(): boolean {
    if (this.phase !== 'prep') return false;
    this.phase = 'wave';
    this.spawnQ = this.next.q.slice();
    this.spawnT = 0;
    const bt = B.BOSS_TIERS[this.boss];
    if (bt) {
      this.spawnQ.push({
        hp: B.waveHP(this.round) * bt.hpMult,
        armor: B.waveHP(this.round) * 0.18,
        spd: 30, r: 20, type: 'boss',
        reward: bt.reward(this.round), boss: this.boss,
      });
    }
    this.alive = this.spawnQ.length;
    this.msg = `${B.WTYPES[this.next.type].name} 웨이브 진행 중…`;
    return true;
  }

  private endWave(): void {
    this.lastReward = B.waveReward(this.round) + this.workers * B.WORKER_INCOME;
    this.gold += this.lastReward;
    this.round++;
    this.phase = 'prep';
    this.boss = 0;
    this.sel = null;
    this.next = buildWave(this.round);
    this.msg = `웨이브 클리어! +${this.lastReward}골드. 다음 성격을 보고 형태를 맞추세요.`;
  }

  private leak(e: Enemy): void {
    const p = e.type === 'boss'
      ? (B.BOSS_TIERS[e.boss ?? 1]?.leakPenalty ?? 28)
      : B.LEAK_POLL[e.type];
    this.poll = Math.min(100, this.poll + p);
    this.float(DOOR_OUT[0], DOOR_OUT[1], e.type === 'boss' ? '보스 누출!' : '누출',
      e.type === 'boss' ? '#ff5a3c' : '#ff8a3c');
    if (this.poll >= 100) this.over = true;
  }

  float(x: number, y: number, txt: string, c: string): void {
    this.floats.push({ x, y, txt, c, life: 0.9 });
  }

  // ── 프레임 업데이트 ──
  update(dt: number): void {
    if (this.over) return;
    if (this.phase === 'wave') {
      // 스폰
      if (this.spawnQ.length) {
        this.spawnT -= dt;
        if (this.spawnT <= 0) {
          const spec = this.spawnQ.shift()!;
          this.enemies.push({ ...spec, d: 0, maxhp: spec.hp });
          this.spawnT = spec.type === 'swarm' ? 0.35 : 0.7;
        }
      }
      // 정령 감속 오라: 범위 내 적의 이속 배수 (중첩 시 최솟값)
      const spirits = this.slots.filter(s => s.tower && this.isSpirit(s.tower));
      const slowOf = (e: Enemy): number => {
        let m = 1;
        const p = pathPos(e.d);
        for (const s of spirits) {
          if (Math.hypot(p[0] - s.x, p[1] - s.y) <= this.trng(s.tower!))
            m = Math.min(m, B.SPIRIT_SLOW[s.tower!.tier]);
        }
        return m;
      };
      // 이동 + 누출
      for (const e of this.enemies) {
        e.d += e.spd * slowOf(e) * dt;
        if (e.d >= LOOP) { e.dead = true; this.leak(e); }
      }
      // 타워 공격 (정령은 공격하지 않음 — 감속 전담)
      for (const s of this.slots) {
        const t = s.tower;
        if (!t || this.isSpirit(t)) continue;
        t.cd -= dt;
        if (t.cd > 0) continue;
        const rng = this.trng(t), raw = this.tdmg(t);
        const inRange = this.enemies.filter(e => {
          if (e.dead) return false;
          const p = pathPos(e.d);
          return Math.hypot(p[0] - s.x, p[1] - s.y) <= rng;
        });
        if (!inRange.length) continue;
        if (this.isSplash(t)) {
          // 광역: 범위 내 전체에 감소 피해 (갓 스플 0.7 / 토스 0.8)
          const mult = this.isGod(t) ? B.SPLASH_DMG : B.TOSS_SPLASH;
          for (const e of inRange) e.hp -= effDmg(raw * mult, e.armor);
          const p = pathPos(inRange[0].d);
          this.shots.push({ x: s.x, y: s.y, tx: p[0], ty: p[1], life: 0.08, c: '#55c8ff', splash: rng });
        } else if (this.isGod(t)) {
          // 갓 파워: 체력 최대(보스/중갑 우선) 하나에 큰 피해
          let tg = inRange[0];
          for (const e of inRange) if (e.hp > tg.hp) tg = e;
          tg.hp -= effDmg(raw * B.POWER_DMG, tg.armor);
          const p = pathPos(tg.d);
          this.shots.push({ x: s.x, y: s.y, tx: p[0], ty: p[1], life: 0.08, c: '#ff8a3c' });
        } else {
          // 단일(테란/저그): 선두(누출 임박) 우선
          let tg = inRange[0];
          for (const e of inRange) if (e.d > tg.d) tg = e;
          tg.hp -= effDmg(raw, tg.armor);
          const p = pathPos(tg.d);
          this.shots.push({ x: s.x, y: s.y, tx: p[0], ty: p[1], life: 0.08, c: B.RCOL[t.race] });
        }
        t.cd = this.atkInt(t);
      }
      // 처치
      for (const e of this.enemies) {
        if (e.hp <= 0 && !e.dead) {
          e.dead = true;
          this.gold += B.KILL_GOLD;
          if (e.type === 'boss' && e.reward) {
            this.gold += e.reward;
            const p = pathPos(e.d);
            this.float(p[0], p[1], '+' + e.reward, '#ffd23f');
          }
        }
      }
      this.enemies = this.enemies.filter(e => !e.dead);
      this.alive = this.enemies.length + this.spawnQ.length;
      if (this.alive === 0) this.endWave();
    }
    for (const s of this.shots) s.life -= dt;
    this.shots = this.shots.filter(s => s.life > 0);
    for (const f of this.floats) { f.life -= dt; f.y -= 18 * dt; }
    this.floats = this.floats.filter(f => f.life > 0);
  }
}
