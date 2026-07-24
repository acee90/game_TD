#!/usr/bin/env python3
"""Tiled TMX(XML) → Phaser용 Tiled JSON 변환 + 타일셋 시트 반입.

왜 필요한가: Phaser 3의 로더는 Tiled **JSON**만 읽는다(`load.tilemapTiledJSON`).
TMX(XML)와 외부 .tsx 참조는 못 읽으므로, 타일셋을 JSON 안에 인라인해서 굽는다.

원본(수정하는 곳) : resources/map/gtd-map.tmx  ← Tiled로 여는 파일
산출물(건드리지 말 것): phaser/public/assets/map/gtd-map.json + *.png

맵을 고친 뒤엔 반드시 다시 굽는다:
    python3 tools/map/tmx-to-phaser.py

Cainos 원본 시트는 resources/downloads/(gitignore, 재배포 금지)에 있으므로
실제 쓰는 5장만 public/으로 복사한다 — 저장소에 커밋되는 건 이 사본이다.

레이어 그룹은 **평탄화**한다. Phaser도 그룹을 파싱하지만 이 맵은 그룹마다 같은
이름('잔디', '절벽')을 재사용해서 이름 조회가 모호해진다 → 'L1-잔디'처럼
접두사를 붙여 유일하게 만들고, 씬은 이름 대신 인덱스 순서로 전부 그린다.
"""

from __future__ import annotations

import json
import shutil
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
TMX = ROOT / "resources" / "map" / "gtd-map.tmx"
OUT_DIR = ROOT / "phaser" / "public" / "assets" / "map"

# .tsx의 image/@source는 gitignore된 원본을 가리킨다 → public/에 넣을 짧은 ASCII 이름으로 매핑.
# 씬의 load.image() 키도 이 stem을 쓴다(tiled-map-lab.ts의 SHEETS와 짝).
SHEET_FILENAME = {
    "cainos-grass": "tx-grass.png",
    "cainos-wall": "tx-wall.png",
    "cainos-struct": "tx-struct.png",
    "cainos-plant-shadow": "tx-plant.png",
    "cainos-props-shadow": "tx-props.png",
}

# 그룹 이름 → 레이어 이름 접두사. 그룹이 늘면 여기에 추가한다.
GROUP_PREFIX = {
    "1층 지면": "L1",
    "2층 고지대": "L2",
}


def parse_tileset(tsx_path: Path) -> dict:
    """외부 .tsx 한 장을 Tiled JSON의 인라인 tileset 딕셔너리로."""
    root = ET.parse(tsx_path).getroot()
    name = root.get("name")
    image_el = root.find("image")
    if image_el is None:
        raise SystemExit(f"{tsx_path.name}: <image>가 없다 (컬렉션 타일셋은 미지원)")

    src = (tsx_path.parent / image_el.get("source")).resolve()
    if not src.exists():
        raise SystemExit(f"{tsx_path.name}: 원본 시트를 못 찾음 → {src}")
    if name not in SHEET_FILENAME:
        raise SystemExit(f"{tsx_path.name}: SHEET_FILENAME에 '{name}' 매핑을 추가하라")

    dest_name = SHEET_FILENAME[name]
    shutil.copyfile(src, OUT_DIR / dest_name)
    with Image.open(src) as im:
        width, height = im.size

    return {
        "columns": int(root.get("columns")),
        "image": dest_name,
        "imageheight": height,
        "imagewidth": width,
        "margin": int(root.get("margin", 0)),
        "name": name,
        "spacing": int(root.get("spacing", 0)),
        "tilecount": int(root.get("tilecount")),
        "tileheight": int(root.get("tileheight")),
        "tilewidth": int(root.get("tilewidth")),
    }


def parse_csv_data(data_el: ET.Element, width: int, height: int, layer_name: str) -> list[int]:
    if data_el.get("encoding") != "csv":
        raise SystemExit(f"'{layer_name}': csv 인코딩만 지원한다 (Tiled 맵 속성에서 CSV로 저장)")
    values = [int(tok) for tok in (data_el.text or "").replace("\n", ",").split(",") if tok.strip()]
    if len(values) != width * height:
        raise SystemExit(f"'{layer_name}': 타일 수 불일치 — {len(values)} != {width * height}")
    return values


def convert() -> None:
    if not TMX.exists():
        raise SystemExit(f"맵 원본이 없다: {TMX}")
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    root = ET.parse(TMX).getroot()
    tilesets = [
        {"firstgid": int(ts.get("firstgid")), **parse_tileset(TMX.parent / ts.get("source"))}
        for ts in root.findall("tileset")
    ]

    layers: list[dict] = []
    objectgroups: list[dict] = []

    def walk(el: ET.Element, prefix: str = "") -> None:
        for child in el:
            if child.tag == "group":
                gname = child.get("name", "")
                walk(child, GROUP_PREFIX.get(gname, gname))
            elif child.tag == "layer":
                width, height = int(child.get("width")), int(child.get("height"))
                raw_name = child.get("name", "")
                name = f"{prefix}-{raw_name}" if prefix else raw_name
                layers.append({
                    "data": parse_csv_data(child.find("data"), width, height, name),
                    "height": height,
                    "id": int(child.get("id")),
                    "name": name,
                    "opacity": float(child.get("opacity", 1)),
                    "type": "tilelayer",
                    "visible": child.get("visible", "1") != "0",
                    "width": width,
                    "x": 0,
                    "y": 0,
                })
            elif child.tag == "objectgroup":
                objects = []
                for obj in child.findall("object"):
                    entry = {
                        "id": int(obj.get("id")),
                        "name": obj.get("name", ""),
                        "rotation": float(obj.get("rotation", 0)),
                        "type": obj.get("type", "") or obj.get("class", ""),
                        "visible": obj.get("visible", "1") != "0",
                        "width": float(obj.get("width", 0)),
                        "height": float(obj.get("height", 0)),
                        "x": float(obj.get("x", 0)),
                        "y": float(obj.get("y", 0)),
                    }
                    if obj.find("point") is not None:
                        entry["point"] = True
                    objects.append(entry)
                if not objects:
                    continue  # 빈 오브젝트 레이어는 굽지 않는다
                gname = child.get("name", "")
                objectgroups.append({
                    "draworder": child.get("draworder", "topdown"),
                    "id": int(child.get("id")),
                    "name": f"{prefix}-{gname}" if prefix else gname,
                    "objects": objects,
                    "opacity": 1,
                    "type": "objectgroup",
                    "visible": True,
                    "x": 0,
                    "y": 0,
                })

    walk(root)

    doc = {
        "compressionlevel": -1,
        "height": int(root.get("height")),
        "infinite": False,
        # 타일 레이어를 먼저, 오브젝트(마커)를 뒤에 — 씬은 인덱스 순서로 그린다.
        "layers": layers + objectgroups,
        "nextlayerid": int(root.get("nextlayerid", len(layers) + len(objectgroups) + 1)),
        "nextobjectid": int(root.get("nextobjectid", 1)),
        "orientation": root.get("orientation", "orthogonal"),
        "renderorder": root.get("renderorder", "right-down"),
        "tiledversion": root.get("tiledversion", ""),
        "tileheight": int(root.get("tileheight")),
        "tilesets": tilesets,
        "tilewidth": int(root.get("tilewidth")),
        "type": "map",
        "version": root.get("version", "1.10"),
        "width": int(root.get("width")),
    }

    out_json = OUT_DIR / "gtd-map.json"
    out_json.write_text(json.dumps(doc, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

    rel = out_json.relative_to(ROOT)
    print(f"✓ {rel}")
    print(f"  타일 레이어 {len(layers)}장: {', '.join(l['name'] for l in layers)}")
    print(f"  오브젝트 레이어 {len(objectgroups)}장: {', '.join(o['name'] for o in objectgroups)}")
    print(f"  타일셋 {len(tilesets)}장: {', '.join(t['image'] for t in tilesets)}")


if __name__ == "__main__":
    sys.exit(convert())
