"""
랜덤 합성 TD v0.5 시뮬레이터 — 단일 골드 경제 GA 베이스라인

v0.5 반영:
- 마나 삭제. 골드가 뽑기, 지정 구매, 계보 업그레이드, 예비금의 공통 자원.
- 티어 파워 커브 [1, 2.5, 7, 21, 70, 280].
- 계보 업그레이드 비용 = 50 + 선택계보Lv*8 + 전체계보Lv합*2.
- 지정 구매 비용 = 100 + 4R + 0.35R^2 + 20N + 3N^2.

주의:
- 캔버스 전투를 픽셀 단위로 재현하지 않고, v04처럼 aggregate DPS 모델로 근사한다.
- 현재 프로토타입 체험 모드 상수(HP_G=1.22, 보상 160+16r, 뽑기 40)를 기준으로 한다.
"""
import random
import statistics

R = 40
BOSS = {10, 20, 30, 40}
KILL_ACH = {9: 150, 18: 250, 27: 350, 36: 450}

DRAW_COST = 40
START_GOLD = 300
FIELD_CAP = 36
NKIND = 8
MERCHANT = 7

LIN = [0, 1, 2, 2, 3, 0, 1, 3]
APS = [2.0, 0.4, 0.8, 1.0, 1.0, 1.0, 1.0, 0.0]
BUDG = [1.0, 1.1, 0.6, 0.8, 0.4, 0.5, 0.4, 0.0]
TIERP = [1, 2.5, 7, 21, 70, 280]
UPG_EFF = 1.03

HP0, HP_G, ACC = 40, 1.22, 1.06
ARM0, ARM_G = 0.15, 1.17
REW_A, REW_B = 160, 16
MOBS, EFF_T = 30, 45

GOLDEN_P = 0.10
KG = {1: 1, 2: 1, 3: 2, 4: 3, 5: 5, 6: 8}
MERCH_CAP = lambda r: 15 + 4 * r

SPECIAL = {}
for r_ in (8, 17, 27, 35):
    SPECIAL[r_] = ("fast", 1.4, 1.15, 1.5)
for r_ in (13, 24, 33):
    SPECIAL[r_] = ("heavy", 1.15, 1.0, 1.5)
for r_ in (6, 15, 22, 31):
    SPECIAL[r_] = ("swarm", 0.55, 0.75, 1.5)
BOSS_DM = {10: 1.7, 20: 1.8, 30: 2.0, 40: 3.4}

PMISSION = [(12, 6, 150), (15, 15, 300), (18, 24, 700)]
PM_COOL = 5

GENES = [
    ("m_keep", 0, 8, True),
    ("m_until", 5, 32, True),
    ("lin_start", 1, 12, True),
    ("lin_mid", 0.15, 0.65, False),
    ("lin_late", 0.25, 0.85, False),
    ("split_main", 0.5, 1.0, False),
    ("reserve", 0, 500, True),
    ("buy_start", 1, 28, True),
    ("buy_frac", 0.0, 0.55, False),
    ("buy_cap", 0, 24, True),
    ("pm_margin", 0.85, 1.5, False),
    ("guts_pmax", 0, 70, True),
    ("aug_gold", 0, 1, False),
    ("blood_pact", 0, 1, False),
]


def wave_hp(r):
    hp = HP0 * HP_G ** r
    if r > 25:
        hp *= ACC ** (r - 25)
    return hp


def lin_cost(lineage, i):
    return int(50 + lineage[i] * 8 + sum(lineage) * 2)


def buy_cost(r, buys):
    return int(100 + 4 * r + 0.35 * r * r + 20 * buys + 3 * buys * buys)


class Run:
    def __init__(self, P):
        self.P = P
        self.gold = START_GOLD
        self.inv = {}
        self.lineage = [0, 0, 0, 0]
        self.pollution = 0.0
        self.debuff = 1.0
        self.milestones = set()
        self.missions = set()
        self.merchants = []
        self.buys = 0
        self.income_total = 0
        self.transcends = 0
        self.first_tr = None
        self.dead_at = None
        self.pm_stage = 0
        self.pm_cool = 0
        self.cur_r = 0

    def n_field(self):
        return sum(self.inv.values()) + len(self.merchants)

    def add_income(self, g):
        self.gold += g
        self.income_total += g

    def add_tower(self, tier, kind):
        self.inv[(tier, kind)] = self.inv.get((tier, kind), 0) + 1

    def draw(self, r):
        if self.gold < DRAW_COST or self.n_field() >= FIELD_CAP:
            return False
        self.gold -= DRAW_COST
        kind = random.randrange(NKIND)
        if kind == MERCHANT:
            if len(self.merchants) < self.P["m_keep"] and r <= self.P["m_until"]:
                self.merchants.append([1, random.random() < GOLDEN_P])
                self.merge_merchants()
            else:
                self.gold += DRAW_COST
            return True
        self.add_tower(1, kind)
        return True

    def choose_buy_kind(self):
        pair = [
            (tier, kind)
            for (tier, kind), c in self.inv.items()
            if c == 1 and tier <= 5
        ]
        if pair:
            target_line = self.main_lines()[0]
            pair.sort(key=lambda tk: (LIN[tk[1]] != target_line, -tk[0], -BUDG[tk[1]]))
            return pair[0][1]
        target_line = self.main_lines()[0]
        candidates = [k for k in range(7) if LIN[k] == target_line]
        return max(candidates, key=lambda k: BUDG[k])

    def buy_tower(self, r):
        c = buy_cost(r, self.buys)
        if self.gold < c or self.n_field() >= FIELD_CAP or self.buys >= self.P["buy_cap"]:
            return False
        self.gold -= c
        self.buys += 1
        kind = self.choose_buy_kind()
        if kind == MERCHANT:
            self.merchants.append([1, random.random() < GOLDEN_P])
            self.merge_merchants()
        else:
            self.add_tower(1, kind)
        return True

    def merge_all(self):
        changed = True
        while changed:
            changed = False
            for (tier, kind), count in list(self.inv.items()):
                if count >= 2 and tier <= 5:
                    self.inv[(tier, kind)] -= 2
                    if self.inv[(tier, kind)] == 0:
                        del self.inv[(tier, kind)]
                    next_kind = random.randrange(7)
                    self.add_tower(tier + 1, next_kind)
                    if tier == 5:
                        self.transcends += 1
                        if self.first_tr is None:
                            self.first_tr = self.cur_r
                    changed = True
                    break
        self.merge_merchants()

    def merge_merchants(self):
        changed = True
        while changed:
            changed = False
            for tier in range(1, 6):
                idx = [i for i, m in enumerate(self.merchants) if m[0] == tier]
                if len(idx) >= 2:
                    gold = random.random() < GOLDEN_P
                    for i in sorted(idx[:2], reverse=True):
                        self.merchants.pop(i)
                    self.merchants.append([tier + 1, gold])
                    changed = True
                    break

    def tower_score(self, tier, kind):
        return BUDG[kind] * TIERP[tier - 1]

    def enforce_cap(self):
        while self.n_field() > FIELD_CAP and self.inv:
            worst = min(self.inv, key=lambda tk: self.tower_score(*tk))
            self.inv[worst] -= 1
            if self.inv[worst] == 0:
                del self.inv[worst]
            tier, _ = worst
            if tier < 5:
                self.gold += int(DRAW_COST / 2 * 2 ** (tier - 1))

    def main_lines(self):
        share = [0.0, 0.0, 0.0, 0.0]
        for (tier, kind), count in self.inv.items():
            line = LIN[kind] if tier < 6 else kind % 4
            share[line] += count * self.tower_score(tier, kind)
        return sorted(range(4), key=lambda i: -share[i])

    def dps(self, armor=0.0):
        shred = max(
            [2 * 2 ** (tier - 1) for (tier, kind), count in self.inv.items() if kind == 6]
            + [0]
        ) * (1 + 0.01 * self.lineage[1])
        eff_armor = max(0.0, armor - shred)
        has_slow = any(kind == 4 and tier >= 2 for (tier, kind) in self.inv)
        aoe_f = min(1.5, 0.75 + (0.6 * (1 + self.lineage[3] / 200) if has_slow else 0))
        total = 0.0
        for (tier, kind), count in self.inv.items():
            line = LIN[kind] if tier < 6 else kind % 4
            base_dps = count * 6 * BUDG[kind] * TIERP[tier - 1] * (UPG_EFF ** self.lineage[line])
            if tier == 6:
                base_dps *= 1.4
            if kind == 3:
                d = base_dps
            else:
                aps = APS[kind] or 1.0
                per_hit = base_dps / max(0.1, aps * count)
                d = count * aps * max(1.0, per_hit - eff_armor)
            if kind == 2:
                d *= aoe_f
            elif kind == 4:
                d *= 0.35 + 0.45 * min(1.0, self.lineage[3] / 120)
            total += d
        return total * self.debuff

    def spend_lineage(self, r, budget):
        if r < self.P["lin_start"]:
            return
        frac = self.P["lin_mid"] if r < 20 else self.P["lin_late"]
        target = budget * frac
        spent = 0
        lines = self.main_lines()
        tick = 0
        while spent < target and lines:
            main, sub = lines[0], lines[1]
            line = main if (tick % 100) < self.P["split_main"] * 100 else sub
            c = lin_cost(self.lineage, line)
            if self.gold < c + self.P["reserve"]:
                break
            self.gold -= c
            spent += c
            self.lineage[line] += 1
            tick += 1

    def spend(self, r):
        self.cur_r = r
        budget = max(0, self.gold - self.P["reserve"])
        if r >= self.P["buy_start"]:
            target = budget * self.P["buy_frac"]
            spent = 0
            while spent < target:
                before = self.gold
                if not self.buy_tower(r):
                    break
                spent += before - self.gold
                self.merge_all()
        while self.gold >= DRAW_COST + self.P["reserve"] and self.n_field() < FIELD_CAP:
            if not self.draw(r):
                break
            self.merge_all()
        self.enforce_cap()
        self.spend_lineage(r, max(0, self.gold - self.P["reserve"]))

    def round_(self, r):
        hp = wave_hp(r)
        mobs = min(MOBS, 12 + 3 * r)
        armor = ARM0 * ARM_G ** r
        difficulty = 1.0
        leak_weight = 1.0
        if r in BOSS:
            difficulty = mobs * BOSS_DM[r] * 0.55
            mobs = 1
            armor *= 2
            leak_weight = 2.0
        elif r in SPECIAL:
            typ, hard, soft, leak_weight = SPECIAL[r]
            if typ == "swarm":
                mobs *= 2
                difficulty = hard if not any(k == 2 for (_, k) in self.inv) else soft
            elif typ == "fast":
                difficulty = soft if any(k == 4 and t >= 2 for (t, k) in self.inv) else hard
            elif typ == "heavy":
                armor *= 4
                difficulty = hard
        req = mobs * hp * difficulty / EFF_T
        surplus = self.dps(armor) / max(1.0, req)
        if surplus < 1.0:
            self.pollution += round(mobs * (1 - surplus)) * leak_weight * (0.5 if r <= 5 else 1.0)
        for th in (25, 50, 75):
            if self.pollution >= th and th not in self.milestones:
                self.milestones.add(th)
                self.debuff *= 0.97
        if self.pollution >= 100:
            self.dead_at = r
            return

        kill_ratio = min(1.0, surplus)
        kills = round(mobs * kill_ratio)
        self.add_income(int((REW_A + REW_B * r) * kill_ratio))
        per_kill = sum(KG[t] * (2 if gold else 1) for t, gold in self.merchants)
        if per_kill and kills:
            self.add_income(min(MERCH_CAP(r), per_kill * kills))
        if r in KILL_ACH:
            self.add_income(KILL_ACH[r])

        elems = set(LIN[k] for (t, k) in self.inv if t < 6)
        if "elem" not in self.missions and len(elems) >= 4:
            self.missions.add("elem")
            self.add_income(250)
        if "t3x3" not in self.missions and len(set(k for (t, k) in self.inv if t >= 3)) >= 3:
            self.missions.add("t3x3")
            self.add_income(350)
        if "myth2" not in self.missions and sum(c for (t, _), c in self.inv.items() if t >= 5) >= 2:
            self.missions.add("myth2")
            self.add_income(500)
        if "guts" not in self.missions and r >= 8 and self.pollution <= self.P["guts_pmax"]:
            self.missions.add("guts")
            self.pollution += 12
            self.add_income(600)

        if self.pm_cool > 0:
            self.pm_cool -= 1
        elif self.pm_stage < 3:
            mult, base_r, rew = PMISSION[self.pm_stage]
            if self.dps(ARM0 * ARM_G ** r) * 20 >= mult * wave_hp(base_r) * self.P["pm_margin"]:
                self.pm_stage += 1
                self.pm_cool = PM_COOL
                self.add_income(rew)

        if r in BOSS and surplus >= 0.6:
            self.add_income(300)
            if surplus >= 1.0:
                self.add_income(250)
            if r < 40:
                if self.P["blood_pact"] > 0.5 and self.pollution <= 50:
                    self.pollution += 15
                    line = self.main_lines()[0]
                    candidates = [k for k in range(7) if LIN[k] == line]
                    kind = max(candidates, key=lambda k: BUDG[k])
                    self.add_tower(4, kind)
                elif self.P["aug_gold"] < 0.5:
                    self.add_income(500)
                else:
                    line = self.main_lines()[0]
                    for _ in range(4):
                        c = lin_cost(self.lineage, line)
                        self.lineage[line] += 1
        self.spend(r)


def play(P):
    run = Run(P)
    run.spend(0)
    for r in range(1, R + 1):
        run.round_(r)
        if run.dead_at:
            break
    return run


def fitness(P, K=120):
    clears, reached = 0, 0
    for _ in range(K):
        out = play(P)
        if out.dead_at is None:
            clears += 1
            reached += 40
        else:
            reached += out.dead_at
    return clears / K * 1000 + reached / K, clears / K


def rand_gene():
    return {
        name: (random.randint(lo, hi) if isint else random.uniform(lo, hi))
        for name, lo, hi, isint in GENES
    }


def mutate(P, rate=0.3):
    Q = dict(P)
    for name, lo, hi, isint in GENES:
        if random.random() < rate:
            span = (hi - lo) * 0.25
            value = Q[name] + random.gauss(0, span)
            value = max(lo, min(hi, value))
            Q[name] = int(round(value)) if isint else value
    return Q


def crossover(A, B):
    return {name: (A[name] if random.random() < 0.5 else B[name]) for name, *_ in GENES}


def run_ga(pop_n=32, gens=14, K=120, log=True):
    pop = [rand_gene() for _ in range(pop_n)]
    best = None
    for gen in range(gens):
        scored = sorted(((fitness(P, K), P) for P in pop), key=lambda item: -item[0][0])
        if best is None or scored[0][0][0] > best[0][0]:
            best = (scored[0][0], scored[0][1])
        if log:
            print(f"  세대 {gen+1}: 최고 클리어 {scored[0][0][1]:.1%}, 평균도달 {scored[0][0][0] % 1000:.1f}")
        elite = [P for _, P in scored[:4]]
        nxt = list(elite)
        while len(nxt) < pop_n:
            a = max(random.sample(scored, 3), key=lambda item: item[0][0])[1]
            b = max(random.sample(scored, 3), key=lambda item: item[0][0])[1]
            nxt.append(mutate(crossover(a, b)))
        pop = nxt
    return best


def summarize(champ, N=4000):
    clears, deaths, income, trans, lin_sum = 0, [], [], [], []
    for _ in range(N):
        out = play(champ)
        if out.dead_at is None:
            clears += 1
        else:
            deaths.append(out.dead_at)
        income.append(out.income_total)
        trans.append(out.transcends)
        lin_sum.append(sum(out.lineage))
    death_med = "clear" if not deaths else f"R{sorted(deaths)[len(deaths)//2]}"
    return {
        "clear_rate": clears / N,
        "death_median": death_med,
        "income_avg": statistics.mean(income),
        "transcend_avg": statistics.mean(trans),
        "lineage_avg": statistics.mean(lin_sum),
    }


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="단일 골드 경제 v0.5 GA 시뮬레이터")
    parser.add_argument("--pop", type=int, default=16, help="세대당 정책 수")
    parser.add_argument("--gens", type=int, default=8, help="진화 세대 수")
    parser.add_argument("--k", type=int, default=60, help="정책 적합도 평가 반복 수")
    parser.add_argument("--eval", type=int, default=1000, help="챔피언 정밀 평가 반복 수")
    parser.add_argument("--seed", type=int, default=7, help="랜덤 시드")
    args = parser.parse_args()

    random.seed(args.seed)
    fit, champ = run_ga(pop_n=args.pop, gens=args.gens, K=args.k)
    print("챔피언 유전자:", {k: (round(v, 2) if isinstance(v, float) else v) for k, v in champ.items()})
    stats = summarize(champ, N=args.eval)
    print(
        f"챔피언 정밀 평가 (n={args.eval}): "
        f"클리어 {stats['clear_rate']:.2%}, 사망중위 {stats['death_median']}, "
        f"평균수입 {stats['income_avg']:.0f}, 평균초월 {stats['transcend_avg']:.2f}, "
        f"평균계보합 {stats['lineage_avg']:.1f}"
    )
