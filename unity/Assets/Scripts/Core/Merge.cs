// 원본: web/src/game/merge.ts
// ───────── 조합(합성) ─────────
// 출처: docs/reference/god-td-x-vz056-map-analysis-v1.0.md §5
//
// 원본은 2단계 파이프라인이다. 같은 유닛 2기가 모이면(AtLeast 2) 요청 카운터를 올리고,
// 별도 생성 트리거가 그 카운터를 소비해 상위 티어 1기를 만든다.
//
// 원본에서 티어 내 유닛 선택은 공유 인덱스 unit#73으로 결정되지만(§5.3), 그 인덱스를
// 회전시키는 트리거가 EUD에 있어 주기를 읽을 수 없다. 즉 플레이어 입장에서 관측되는
// 동작은 랜덤과 구분되지 않는다. 이 프로토는 그냥 균등 랜덤으로 뽑는다.

using System;
using System.Collections.Generic;

namespace GodTD.Core
{
    public sealed class MergeResult
    {
        public readonly Slot Slot;
        public readonly UnitDef Produced;
        public readonly int Tier;
        public readonly string Consumed;

        public MergeResult(Slot slot, UnitDef produced, int tier, string consumed)
        {
            Slot = slot;
            Produced = produced;
            Tier = tier;
            Consumed = consumed;
        }
    }

    public static class Merge
    {
        public static UnitDef[] PoolFor(int tier, int bossesKilled) =>
            tier == Units.GOD_TIER ? Units.GodPool(bossesKilled) : Units.TIER_POOLS[tier];

        /// <summary>티어 `tier`의 풀에서 한 유닛을 균등 랜덤으로 뽑는다. rand는 [0,1) 난수 함수.</summary>
        public static UnitDef UnitFor(int tier, Func<double> rand, int bossesKilled)
        {
            var pool = PoolFor(tier, bossesKilled);
            return pool[Math.Min(pool.Length - 1, (int)(rand() * pool.Length))];
        }

        /// <summary>
        /// 같은 이름 유닛이 MERGE_REQUIRED기 모인 가장 낮은 티어를 한 번 조합한다.
        /// 연쇄 조합은 호출자가 반복 호출해서 처리한다.
        /// </summary>
        public static MergeResult FindMerge(IReadOnlyList<Slot> slots, Func<double> rand, int bossesKilled)
        {
            for (int tier = 0; tier < Units.GOD_TIER; tier++)
            {
                var byName = new Dictionary<string, List<Slot>>();
                var order = new List<string>(); // Map 삽입 순서 유지 (TS Map과 같은 순회 순서)
                foreach (var slot in slots)
                {
                    if (slot.Tower == null || slot.Tower.Tier != tier) continue;
                    string name = slot.Tower.Def.Name;
                    if (!byName.TryGetValue(name, out var group))
                    {
                        group = new List<Slot>();
                        byName[name] = group;
                        order.Add(name);
                    }
                    group.Add(slot);
                }
                foreach (var name in order)
                {
                    var group = byName[name];
                    if (group.Count < Balance.MERGE_REQUIRED) continue;
                    return new MergeResult(
                        group[0],
                        UnitFor(tier + 1, rand, bossesKilled),
                        tier + 1,
                        name);
                }
            }
            return null;
        }
    }
}
