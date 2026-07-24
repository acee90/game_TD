#!/usr/bin/env python3
"""gtd-map ↔ 엔진 지오메트리 정합 검사 (맵을 구울 때마다 돌린다).

    python3 tools/map/check-map-coverage.py            # 검사 (실패 시 exit 1)
    python3 tools/map/check-map-coverage.py --holes    # 실패 칸을 Tiled 좌표로 나열

왜 있나: 2026-07-24에 "슬롯이 고지대에 얹히는가(점)"와 "경로 중심선이 돌길 위인가(선)"만
검사하고 통과시켰다가, 영웅이 걷는 **보행 밴드(면)** 아래 지면이 없는 걸 놓쳤다
(9시·3시 팔 끝 허공). 점·선 검사는 면 구멍을 못 잡는다 — 그래서 이 도구는 면을 검사한다.

검사 항목 (tmp 계획 §5 → 여기로 승격):
  1. 보행 밴드 커버리지 — 카메라 가시영역 안의 밴드 전 면적에 지면 타일 존재 (100%)
  2. 엔진 십자 68칸 vs 고지대(L2-잔디) 미스매치 0 — MAP_ORIGIN이 맞다는 증명
  3. 타워 슬롯 29칸 전부 고지대에 완전히 얹힘
  4. 몹 경로가 고지대를 침범하지 않음
  5. 경로 중심선의 돌길 커버리지 ≥ 95% (좌우 한 타일 내 돌길 존재)

가시영역 클리핑: 밴드는 월드 x −24..444, y −24..484까지 뻗지만 카메라는 0..420×0..470만
보여준다. 화면 밖 허공은 아무도 못 보므로 **가시영역 안만** 100%를 요구한다.
밴드 가장자리는 ±(HW−1)로 샘플 — 정확히 HW인 점은 타일 경계 위라 이웃 칸으로 판정이 튄다.

MAP_ORIGIN은 phaser/src/tiled-map.ts에서 읽는다(이중 기재 방지). 엔진 상수는 npx tsx로 뽑는다.
"""

from __future__ import annotations

import json
import math
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MAP_JSON = ROOT / "phaser" / "public" / "assets" / "map" / "gtd-map.json"
TILED_MAP_TS = ROOT / "phaser" / "src" / "tiled-map.ts"

# 카메라 가시영역 (BattleScene: zoom 2, centerOn(210,235) → 월드 420×470)
VIEW_W, VIEW_H = 420, 470
S = 64 / 36  # 맵px / 엔진px


def read_origin() -> tuple[int, int]:
    m = re.search(r"MAP_ORIGIN[^=]*=\s*\[(\d+),\s*(\d+)\]", TILED_MAP_TS.read_text())
    if not m:
        sys.exit(f"MAP_ORIGIN을 {TILED_MAP_TS}에서 찾지 못했다")
    return int(m.group(1)), int(m.group(2))


def read_engine() -> dict:
    js = subprocess.run(
        ["npx", "tsx", "-e",
         "import {WAYPOINTS,CENTER,TILE,SLOT_POS,CROSS_BARS,WALKABLE_HALF_WIDTH as HW}"
         " from './engine/src/core/map.ts';"
         "console.log(JSON.stringify({WAYPOINTS,CENTER,TILE,SLOT_POS,CROSS_BARS,HW}))"],
        capture_output=True, text=True, cwd=ROOT,
    )
    if js.returncode != 0:
        sys.exit(f"엔진 상수 추출 실패:\n{js.stderr[-500:]}")
    return json.loads(js.stdout.strip().splitlines()[-1])


def main() -> None:
    show_holes = "--holes" in sys.argv
    ox, oy = read_origin()
    eng = read_engine()
    C, TILE, HW = eng["CENTER"], eng["TILE"], eng["HW"]
    WP = eng["WAYPOINTS"]

    d = json.loads(MAP_JSON.read_text())
    W, H = d["width"], d["height"]
    lay = {l["name"]: l for l in d["layers"] if l["type"] == "tilelayer"}
    cells = lambda n: {(i % W, i // W) for i, v in enumerate(lay[n]["data"]) if v}
    plateau = cells("L2-잔디")
    road = cells("L1-돌길")
    ground = cells("L1-잔디") | road | plateau

    mx = lambda x: (x - C[0]) * S + ox
    my = lambda y: (y - C[1]) * S + oy
    tile = lambda x, y: (int(mx(x) // 32), int(my(y) // 32))
    visible = lambda x, y: 0 <= x <= VIEW_W and 0 <= y <= VIEW_H

    failures: list[str] = []

    # ── 1. 보행 밴드 커버리지 (면) ──────────────────────────
    holes: set[tuple[int, int]] = set()
    band_total = band_ok = 0
    offs = [k / 2 for k in range(-2 * (HW - 1), 2 * (HW - 1) + 1)]  # 0.5px 간격, ±(HW-1)
    for i in range(len(WP) - 1):
        (ax, ay), (bx, by) = WP[i], WP[i + 1]
        n = max(1, int(math.hypot(bx - ax, by - ay)))
        dx, dy = (bx - ax) / n, (by - ay) / n
        px, py = -dy, dx
        for s in range(n + 1):
            for off in offs:
                gx, gy = ax + dx * s + px * off, ay + dy * s + py * off
                if not visible(gx, gy):
                    continue
                band_total += 1
                t = tile(gx, gy)
                if t in ground:
                    band_ok += 1
                else:
                    holes.add(t)
    if holes:
        failures.append(f"보행 밴드 구멍 {len(holes)}칸 (샘플 {band_total - band_ok}/{band_total})")

    # ── 2. 십자 정합 (MAP_ORIGIN 증명) ─────────────────────
    cross = set()
    for b in eng["CROSS_BARS"]:
        x0, y0 = mx(b["x"]), my(b["y"])
        for cy in range(round(y0 / 32), round((y0 + b["h"] * S) / 32)):
            for cx in range(round(x0 / 32), round((x0 + b["w"] * S) / 32)):
                cross.add((cx, cy))
    miss = cross - plateau
    if miss:
        failures.append(f"십자 {len(cross)}칸 중 {len(miss)}칸이 고지대 밖 — MAP_ORIGIN({ox},{oy}) 재측정 필요")

    # ── 3. 슬롯 29칸 ───────────────────────────────────────
    bad_slots = []
    for i, (sx, sy) in enumerate(eng["SLOT_POS"]):
        x0, y0 = mx(sx - TILE / 2), my(sy - TILE / 2)
        quad = [(int(x0 // 32) + a, int(y0 // 32) + b) for b in range(2) for a in range(2)]
        if any(t not in plateau for t in quad):
            bad_slots.append(i)
    if bad_slots:
        failures.append(f"고지대에 안 얹힌 슬롯: {bad_slots}")

    # ── 4. 경로가 고지대 침범 안 함 + 5. 돌길 커버리지 ──────
    on_plateau = road_hit = center_total = 0
    road_gaps: set[tuple[int, int]] = set()
    for i in range(len(WP) - 1):
        (ax, ay), (bx, by) = WP[i], WP[i + 1]
        n = max(1, int(math.hypot(bx - ax, by - ay)))
        dx, dy = (bx - ax) / n, (by - ay) / n
        px, py = -dy, dx
        for s in range(n):
            wx, wy = ax + dx * s, ay + dy * s
            if not visible(wx, wy):
                continue
            center_total += 1
            if tile(wx, wy) in plateau:
                on_plateau += 1
            near = {tile(wx + px * o, wy + py * o) for o in (-20, -7, 7, 20)}
            if near & road:
                road_hit += 1
            else:
                road_gaps.add(tile(wx, wy))
    if on_plateau:
        failures.append(f"경로가 고지대 침범 {on_plateau}점")
    road_pct = road_hit / center_total * 100 if center_total else 0
    if road_pct < 95:
        failures.append(f"돌길 커버리지 {road_pct:.0f}% < 95% (끊긴 칸 {len(road_gaps)})")

    # ── 리포트 ─────────────────────────────────────────────
    print(f"맵 {W}x{H}, MAP_ORIGIN=({ox},{oy}), 가시영역 {VIEW_W}x{VIEW_H} 기준")
    print(f"  1. 밴드 커버리지  {band_ok}/{band_total} ({band_ok / band_total * 100:.1f}%)")
    print(f"  2. 십자 정합      {len(cross) - len(miss)}/{len(cross)}")
    print(f"  3. 슬롯           {len(eng['SLOT_POS']) - len(bad_slots)}/{len(eng['SLOT_POS'])}")
    print(f"  4. 고지대 침범    {on_plateau}점")
    print(f"  5. 돌길 커버리지  {road_pct:.0f}%")

    if show_holes and (holes or road_gaps):
        def rows(cells_: set) -> None:
            by_row: dict[int, list[int]] = {}
            for c, r in sorted(cells_, key=lambda t: (t[1], t[0])):
                by_row.setdefault(r, []).append(c)
            for r in sorted(by_row):
                print(f"     행 {r:2d}: 열 {by_row[r]}")
        if holes:
            print("  밴드 구멍 (Tiled 좌표):")
            rows(holes)
        if road_gaps:
            print("  돌길 끊김 (Tiled 좌표):")
            rows(road_gaps)

    if failures:
        print("\n✗ FAIL")
        for f in failures:
            print(f"  - {f}")
        sys.exit(1)
    print("\n✓ PASS")


if __name__ == "__main__":
    main()
