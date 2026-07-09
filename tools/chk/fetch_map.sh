#!/usr/bin/env bash
# 갓 타워 디펜스 원본 맵(.scx)을 scmscx.com에서 받아 CHK로 풀고 JSON/텍스트로 덤프한다.
#
#   ./fetch_map.sh <scmscx_map_id> <out_dir>
#   예: ./fetch_map.sh hVdqGx49 out_gtdx      # 갓 타워 디펜스X VZ056
#       ./fetch_map.sh HfkypxRT out_gtd5      # 갓 타워 디펜스5 V0.10
#
# 사전 준비: brew install stormlib
set -euo pipefail

MAP_ID="${1:?scmscx map id required}"
OUT="${2:?output dir required}"
HERE="$(cd "$(dirname "$0")" && pwd)"

mkdir -p "$OUT"
curl -fsS "https://scmscx.com/api/uiv2/map_info/${MAP_ID}" -o "${OUT}/map_info.json"
MPQ_HASH=$(python3 -c "import json,sys;print(json.load(open('${OUT}/map_info.json'))['meta']['mpq_hash'])")

curl -fsS "https://scmscx.com/api/maps/${MPQ_HASH}" -o "${OUT}/map.scx"
curl -fsS "https://scmscx.com/api/uiv2/minimap/${MAP_ID}" -o "${OUT}/minimap.png"

python3 "${HERE}/extract_chk.py" "${OUT}/map.scx" "${OUT}/scenario.chk"
python3 "${HERE}/chkparse.py" "${OUT}/scenario.chk" "${OUT}"
python3 "${HERE}/trigdec.py" "${OUT}/trig.bin" "${OUT}/map.json" "${OUT}/triggers.txt"

echo "done -> ${OUT}"
