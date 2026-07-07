"""
랜덤 합성 TD v0.4 시뮬레이터 — 유전 알고리즘 기반 밸런스 검증
- 정책을 손코딩 대신 유전자(11 파라미터)로 표현, GA가 최적 전략을 탐색
- 밸런스 기준: "GA가 찾아낸 최선의 전략"의 클리어율 ≤ 1%
- v0.3.2 룰 반영: 상인 뽑기 등장(12.5%)+T1 전액환급+킬골드, 서포트 스케일링(방깎=대지Lv,
  밀집=냉기Lv 연속), 분쇄(빙결사 하이브리드), v1 최소 증강(골드/마나/상인의왕/피의 계약)
"""
import random

R = 40
BOSS = {10, 20, 30, 40}
KILL_ACH = {9: 150, 18: 250, 27: 350, 36: 450}
DRAW_COST = 60
FIELD_CAP_BASE = 20
NKIND = 8            # 0~6 전투, 7 상인
LIN = [0, 1, 2, 2, 3, 0, 1, 3]
APS = {0: 2.0, 1: 0.4, 2: 0.8, 3: 1.0, 4: 1.0, 5: 1.0, 6: 1.0}

random.seed(7)
QUALITY = {t: [random.uniform(0.6, 1.6) for _ in range(8)] for t in range(1, 7)}
random.seed()

TIER_MULT, T1_DPS = 2.2, 6.0
UPG_COST, UPG_EFF, COST_SLOPE = 20, 1.03, 100
HP0 = 40
HP_G = 1.29          # GA 기준 확정 (챔피언 클리어 ≤1%)
ACC = 1.06           # R>25 가속
ARM0, ARM_G = 0.15, 1.17
REW_A, REW_B = 100, 10
MOBS, EFF_T = 30, 45
GOLDEN_P = 0.10
KG = {1: 1, 2: 1, 3: 2, 4: 3, 5: 5, 6: 8}   # 상인 킬골드
MERCH_CAP = lambda r: 15 + 4 * r              # 상인 수입 라운드 상한

SPECIAL = {}
for r_ in (8, 17, 27, 35): SPECIAL[r_] = (1.4, 4, 1.15, 1.5)   # 신속→빙결
for r_ in (13, 24, 33):    SPECIAL[r_] = (1.5, 1, 1.2, 1.5)    # 중갑→저격 (아머 4배)
for r_ in (6, 15, 22, 31): SPECIAL[r_] = (1.3, 2, 1.1, 1.5)    # 쇄도→화포
BOSS_DM = {10: 1.7, 20: 1.8, 30: 2.0, 40: 3.4}
PMISSION = [(12, 6, 150), (15, 15, 300), (18, 24, 700)]
PM_COOL = 5

GENES = [  # (이름, 최소, 최대, 정수여부)
    ("m_keep",       0, 6, True),    # 상인 킵 상한
    ("m_until",      5, 30, True),   # 킵 마감 라운드
    ("mana_start",   4, 12, True),   # 마나 전환 시작 라운드
    ("mana_mid",     0.2, 0.7, False),
    ("mana_late",    0.3, 0.8, False),
    ("split_main",   0.5, 1.0, False),  # 주력 계보 배분율
    ("reserve",      50, 300, True),
    ("pm_margin",    0.9, 1.4, False),
    ("guts_pmax",    0, 60, True),
    ("aug_gold",     0, 1, False),   # 증강 자원 선호 (<0.5 골드)
    ("blood_pact",   0, 1, False),   # 피의 계약 수용 (>0.5 수용)
]

def wave_hp(r):
    hp = HP0 * HP_G ** r
    if r > 25: hp *= ACC ** (r - 25)
    return hp

class Run:
    def __init__(self, P):
        self.P = P
        self.gold, self.mana = 150, 0
        self.inv = {}
        for k in random.sample(range(7), 4):
            self.inv[(1, k)] = self.inv.get((1, k), 0) + 1
        self.first4 = [k for (_, k) in self.inv]
        self.lineage = [0, 0, 0, 0]
        self.pollution, self.debuff = 0.0, 1.0
        self.milestones, self.missions = set(), set()
        self.merchants = []          # [tier, golden]
        self.merchant_king = False
        self.income_total, self.transcends, self.first_tr = 0, 0, None
        self.dead_at, self.pm_stage, self.pm_cool, self.cur_r = None, 0, 0, 0

    def field_cap(self, r): return FIELD_CAP_BASE + 2 * (r // 5)
    def n_field(self): return sum(self.inv.values()) + len(self.merchants)
    def add_income(self, g): self.gold += g; self.income_total += g

    def draw(self, r):
        if self.gold < DRAW_COST: return False
        self.gold -= DRAW_COST
        if r <= 5 and len(self.first4) < 4:
            k = random.choice([k for k in range(7) if k not in self.first4]); self.first4.append(k)
        else:
            k = random.randrange(NKIND)
        if k == 7:
            if len(self.merchants) < self.P["m_keep"] and r <= self.P["m_until"]:
                self.merchants.append([1, random.random() < GOLDEN_P]); self.merge_merchants()
            else:
                self.gold += DRAW_COST  # T1 전액 환급
            return True
        self.inv[(1, k)] = self.inv.get((1, k), 0) + 1
        return True

    def merge_all(self):
        changed = True
        while changed:
            changed = False
            for (t, k), c in list(self.inv.items()):
                if c >= 2 and t <= 5:
                    self.inv[(t, k)] -= 2
                    if self.inv[(t, k)] == 0: del self.inv[(t, k)]
                    nk = random.randrange(7)
                    self.inv[(t + 1, nk)] = self.inv.get((t + 1, nk), 0) + 1
                    if t == 5:
                        self.transcends += 1
                        if self.first_tr is None: self.first_tr = self.cur_r
                    changed = True
        self.merge_merchants()

    def merge_merchants(self):
        from collections import Counter
        changed = True
        while changed:
            changed = False
            cnt = Counter(t for t, _ in self.merchants)
            for t in sorted(cnt):
                if cnt[t] >= 2 and t <= 5:
                    rm, new = 0, []
                    for m in self.merchants:
                        if m[0] == t and rm < 2: rm += 1; continue
                        new.append(m)
                    new.append([t + 1, random.random() < GOLDEN_P])
                    self.merchants = new; changed = True; break

    def enforce_cap(self, r):
        cap = self.field_cap(r)
        while self.n_field() > cap and self.inv:
            worst = min(self.inv, key=lambda tk: TIER_MULT ** (tk[0]-1) * QUALITY[tk[0]][tk[1]])
            self.inv[worst] -= 1
            if self.inv[worst] == 0: del self.inv[worst]
            self.gold += int(30 * 2 ** (worst[0] - 1))

    def dps(self, armor=0.0):
        shred = max([2 * 2 ** (t-1) for (t, k) in self.inv if k == 6] + [0]) * (1 + 0.01 * self.lineage[1])
        eff_armor = max(0.0, armor - shred)
        has_slow = any(k == 4 and t >= 2 for (t, k) in self.inv)
        aoe_f = 0.75 + (0.6 * (1 + self.lineage[3] / 200) if has_slow else 0)
        total, has_t6 = 0.0, False
        for (t, k), c in self.inv.items():
            if t == 6: has_t6 = True
            base = c * T1_DPS * TIER_MULT ** (t-1) * QUALITY[t][k % 8] * (UPG_EFF ** self.lineage[LIN[k] if t < 6 else k % 4])
            if k == 3:
                d = base
            else:
                per_hit = base / max(0.1, APS.get(k, 1.0) * c)
                d = base * max(0.15, 1 - eff_armor / max(per_hit, 0.1))
            if k == 2: d *= min(1.5, aoe_f)
            if k == 4: d *= 0.35 + 0.45 * min(1.0, self.lineage[3] / 120)
            total += d
        mcoef = 1.2 if self.merchant_king else 0.4
        mbonus = 1 + (0.08 * len(self.merchants) if self.merchant_king else 0)
        for (t, g) in self.merchants:
            total += T1_DPS * TIER_MULT ** (t-1) * mcoef * mbonus * (UPG_EFF ** self.lineage[3])
        return total * (1.1 if has_t6 else 1.0) * self.debuff

    def spend(self, r):
        self.cur_r = r
        P = self.P
        mana_share = 0.0 if r < P["mana_start"] else (P["mana_mid"] if r < 20 else P["mana_late"])
        budget = max(0, self.gold - P["reserve"])
        mana_budget = int(budget * mana_share)
        while mana_budget >= 100 and self.gold >= 100 + P["reserve"]:
            self.gold -= 100; mana_budget -= 100
            self.mana += random.choice(range(20, 161, 10))
        while self.gold >= DRAW_COST + P["reserve"]:
            if not self.draw(r): break
        self.merge_all(); self.enforce_cap(r)
        share = [0.0] * 4
        for (t, k), c in self.inv.items():
            share[LIN[k] if t < 6 else k % 4] += c * TIER_MULT ** (t-1)
        order = sorted(range(4), key=lambda i: -share[i])
        li1, li2 = order[0], order[1]
        tick = 0
        while True:
            li = li1 if (tick % 100) < P["split_main"] * 100 else li2
            if self.lineage[li] >= 250: li = li2 if li == li1 else li1
            cost = int(UPG_COST * (1 + self.lineage[li] / COST_SLOPE))
            if self.mana < cost or self.lineage[li] >= 250: break
            self.mana -= cost; self.lineage[li] += 1; tick += 1

    def round_(self, r):
        P = self.P
        hp = wave_hp(r)
        mobs = min(MOBS, 12 + 3 * r)
        dm, pw = 1.0, 1.0
        armor = ARM0 * ARM_G ** r
        if r in BOSS:
            dm, pw = BOSS_DM[r], 2.0
        elif r in SPECIAL:
            mult, ck, soft, pw = SPECIAL[r]
            dm = soft if any(k == ck and t >= 2 for (t, k) in self.inv) else mult
            if ck == 1: armor *= 4.0
        req = mobs * hp / EFF_T * dm
        d = self.dps(armor)
        surplus = d / req
        if surplus < 1.0:
            self.pollution += round(mobs * (1 - surplus)) * pw * (0.5 if r <= 5 else 1.0)
        for th in (25, 50, 75):
            if self.pollution >= th and th not in self.milestones:
                self.milestones.add(th); self.debuff *= 0.97
        if self.pollution >= 100:
            self.dead_at = r; return
        kills = round(mobs * min(1.0, surplus))
        self.add_income(int((REW_A + REW_B * r) * min(1.0, surplus)))
        per_kill = sum(KG[t] * (2 if g else 1) for (t, g) in self.merchants)
        if per_kill and kills: self.add_income(min(MERCH_CAP(r), per_kill * kills))
        if r in KILL_ACH: self.add_income(KILL_ACH[r])
        elems = set(LIN[k] for (t, k) in self.inv if t < 6)
        if "elem" not in self.missions and len(elems) >= 4:
            self.missions.add("elem"); self.add_income(250)
        if "t3x3" not in self.missions and len(set(k for (t, k) in self.inv if t >= 3)) >= 3:
            self.missions.add("t3x3"); self.add_income(350)
        if "myth2" not in self.missions and sum(c for (t, _), c in self.inv.items() if t >= 5) >= 2:
            self.missions.add("myth2"); self.add_income(500)
        if "guts" not in self.missions and r >= 8 and self.pollution <= P["guts_pmax"]:
            self.missions.add("guts"); self.pollution += 12; self.add_income(600)
        if self.pm_cool > 0: self.pm_cool -= 1
        elif self.pm_stage < 3:
            mult, base_r, rew = PMISSION[self.pm_stage]
            if self.dps(ARM0 * ARM_G ** r) * 20 >= mult * wave_hp(base_r) * P["pm_margin"]:
                self.pm_stage += 1; self.pm_cool = PM_COOL; self.add_income(rew)
        if r in BOSS and surplus >= 0.6:
            self.mana += 150
            if surplus >= 1.0: self.add_income(250); self.mana += 100  # 무피해 리베이트
            if r < 40:  # v1 최소 증강 선택
                if not self.merchant_king and len(self.merchants) >= 3 and P["m_keep"] >= 3:
                    self.merchant_king = True                     # A형: 상인의왕
                elif P["blood_pact"] > 0.5 and self.pollution <= 50:
                    self.pollution += 15                          # C형: 피의 계약 → T4 선택권
                    li = max(range(4), key=lambda i: self.lineage[i])
                    ks = max([k for k in range(7) if LIN[k] == li] or [0], key=lambda x: QUALITY[4][x])
                    self.inv[(4, ks)] = self.inv.get((4, ks), 0) + 1
                elif P["aug_gold"] < 0.5: self.add_income(500)    # B형: 자원
                else: self.mana += 400
        if self.gold > 1000: self.gold -= 100
        self.spend(r)

def play(P):
    run = Run(P); run.spend(0)
    for r in range(1, R + 1):
        run.round_(r)
        if run.dead_at: break
    return run

def fitness(P, K=120):
    clears, dsum = 0, 0
    for _ in range(K):
        o = play(P)
        if o.dead_at is None: clears += 1; dsum += 40
        else: dsum += o.dead_at
    return clears / K * 1000 + dsum / K, clears / K

def rand_gene():
    return {n: (random.randint(lo, hi) if isint else random.uniform(lo, hi)) for n, lo, hi, isint in GENES}

def mutate(P, rate=0.3):
    Q = dict(P)
    for n, lo, hi, isint in GENES:
        if random.random() < rate:
            span = (hi - lo) * 0.25
            v = Q[n] + random.gauss(0, span)
            v = max(lo, min(hi, v))
            Q[n] = int(round(v)) if isint else v
    return Q

def crossover(A, B):
    return {n: (A[n] if random.random() < 0.5 else B[n]) for n, *_ in GENES}

def run_ga(pop_n=32, gens=14, K=120, log=True):
    pop = [rand_gene() for _ in range(pop_n)]
    best = None
    for g in range(gens):
        scored = sorted(((fitness(P, K), P) for P in pop), key=lambda x: -x[0][0])
        if best is None or scored[0][0][0] > best[0][0]:
            best = (scored[0][0], scored[0][1])
        if log: print(f"  세대 {g+1}: 최고 클리어 {scored[0][0][1]:.1%}, 평균도달 {scored[0][0][0]%1000:.1f}")
        elite = [P for _, P in scored[:4]]
        nxt = list(elite)
        while len(nxt) < pop_n:
            a = max(random.sample(scored, 3), key=lambda x: x[0][0])[1]
            b = max(random.sample(scored, 3), key=lambda x: x[0][0])[1]
            nxt.append(mutate(crossover(a, b)))
        pop = nxt
    return best

if __name__ == "__main__":
    (fit, champ) = run_ga()
    print("챔피언 유전자:", {k: (round(v, 2) if isinstance(v, float) else v) for k, v in champ.items()})
    # 챔피언 정밀 평가
    clears, deaths = 0, []
    N = 4000
    for _ in range(N):
        o = play(champ)
        if o.dead_at is None: clears += 1
        else: deaths.append(o.dead_at)
    import statistics
    print(f"챔피언 정밀 평가 (n={N}): 클리어 {clears/N:.2%}, 사망중위 R{sorted(deaths)[len(deaths)//2]}")
