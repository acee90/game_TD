// 원본: web/src/data/units.ts
// ───────── 유닛 로스터 ─────────
// 출처: docs/reference/god-td-x-vz056-map-analysis-v1.0.md §4(로스터) §5(조합) §6(태그)
//
// 태그(파워/스플래시/스피드/크리쳐)는 원본에서 **유닛마다 고정**이다. 상호 전환은 없다(§6.1).
// 티어 내 어느 유닛이 나오는지는 랜덤이 아니라 공유 인덱스로 결정된다(§5.3).
//
// [원본확정] = 맵파일에서 직접 읽은 것
// [프로토]   = 원본에서 확인 불가라 프로토타입용으로 정한 것 (§11에 미확인으로 기록됨)

using System;
using System.Text;

namespace GodTD.Core
{
    public enum Tag { Power, Splash, Speed }

    /// <summary>종족. 값 = 원본 인덱스 (테란/저그/플토/크리쳐)</summary>
    public enum Race { Terran = 0, Zerg = 1, Protoss = 2, Creature = 3 }

    public sealed class UnitDef
    {
        public readonly string Name;
        public readonly Race Race;
        public readonly Tag[] Tags;

        public UnitDef(string name, Race race, params Tag[] tags)
        {
            Name = name;
            Race = race;
            Tags = tags;
        }

        public bool HasTag(Tag tag) => Array.IndexOf(Tags, tag) >= 0;
    }

    public static class Units
    {
        public static string TagLabelOf(Tag tag)
        {
            switch (tag)
            {
                case Tag.Power: return "파워";
                case Tag.Splash: return "스플래시";
                default: return "스피드";
            }
        }

        public static readonly string[] RACES = { "정규군", "포병", "마법대", "소환대" };

        /// <summary>병과 색 (정규군/포병/마법대/소환대) — 웹 원본 RACE_COLOR와 동일한 hex</summary>
        public static readonly string[] RACE_COLOR = { "#4ea3ff", "#c065e0", "#ffd23f", "#6fdc8c" };

        public const int GOD_TIER = 4;
        public static readonly string[] TIER_LABEL = { "Lv1", "Lv2", "Lv3", "Lv4", "GOD" };

        /// <summary>
        /// 티어별 풀. 배열 순서 = 원본 트리거의 선택자 값 N=1..7 순서.
        /// Lv2는 trigger #496~#502, Lv4는 #507~#513에서 그대로 읽었다. [원본확정]
        /// Lv1 생성 7종은 strings:321/322/323/324/527/567/516. [원본확정 — 단 N 순서는 미확인]
        /// Lv3 풀은 요청 카운터(unit#178)의 생성 트리거가 EUD로 잘려 미확인. 로스터의 Lv3 7종으로 채웠다. [프로토]
        /// </summary>
        public static readonly UnitDef[][] TIER_POOLS =
        {
            // Lv1 — strings:321,322,323,324,527,567,516
            new[]
            {
                new UnitDef("견습 궁병", Race.Terran, Tag.Speed),
                new UnitDef("종자", Race.Terran, Tag.Speed),
                new UnitDef("소형 투석기", Race.Zerg, Tag.Power),
                new UnitDef("소형 노포", Race.Zerg, Tag.Power),
                new UnitDef("견습 마법사", Race.Protoss, Tag.Splash),
                new UnitDef("견습 정령술사", Race.Protoss, Tag.Splash),
                new UnitDef("미니 골렘", Race.Creature, Tag.Power),
            },
            // Lv2 — trigger #496~#502, N=1..7 순서 그대로
            new[]
            {
                new UnitDef("가고일", Race.Creature, Tag.Speed),
                new UnitDef("마법사", Race.Protoss, Tag.Splash),
                new UnitDef("궁병", Race.Terran, Tag.Speed),
                // 디파일러의 태그 문자열만 원본 strings에서 확인되지 않는다(§11.4). 저그 파워로 채움. [프로토]
                new UnitDef("망고넬", Race.Zerg, Tag.Power),
                new UnitDef("원소술사", Race.Protoss, Tag.Splash),
                new UnitDef("기사", Race.Terran, Tag.Speed),
                new UnitDef("발리스타", Race.Zerg, Tag.Power),
            },
            // Lv3 — 태그는 [원본확정](strings:308/315/316/317/318/319/644), N 순서는 [프로토]
            new[]
            {
                new UnitDef("장궁병", Race.Terran, Tag.Speed),
                new UnitDef("소드 엑스퍼트", Race.Terran, Tag.Speed),
                new UnitDef("트레뷰셋", Race.Zerg, Tag.Power),
                new UnitDef("중발리스타", Race.Zerg, Tag.Power),
                new UnitDef("매그마 골렘", Race.Creature, Tag.Splash),
                new UnitDef("마도사", Race.Protoss, Tag.Splash),
                new UnitDef("원소 마도사", Race.Protoss, Tag.Splash),
            },
            // Lv4 — trigger #507~#513, N=1..7 순서 그대로
            new[]
            {
                new UnitDef("거석 투석기", Race.Zerg, Tag.Power),
                new UnitDef("룬 골렘", Race.Creature, Tag.Power, Tag.Speed),
                new UnitDef("아크메이지", Race.Protoss, Tag.Splash),
                new UnitDef("신궁", Race.Terran, Tag.Speed),
                new UnitDef("연발 발리스타", Race.Zerg, Tag.Power),
                new UnitDef("대원소술사", Race.Protoss, Tag.Splash),
                new UnitDef("소드마스터", Race.Terran, Tag.Speed),
            },
        };

        /// <summary>
        /// GOD 풀은 원본에서 처치한 보스 수로 분기한다(trigger #523~#529 / #534~#539).
        /// `Deaths(CurrentPlayer, BOSS, AtMost, 5)` → 초기 풀 / `AtLeast, 6` → 확장 풀. [원본확정]
        /// 확장 풀에 실제로 어떤 유닛이 들어가는지는 EUD로 잘려 미확인이라, [GOD] 11종 중
        /// 초기 풀에서 확인된 4종을 뺀 나머지를 넣었다. [프로토]
        /// 태그는 전부 [원본확정] (§4.3).
        /// </summary>
        public static readonly UnitDef[] GOD_POOL_EARLY =
        {
            new UnitDef("공성 거탑", Race.Zerg, Tag.Power),
            new UnitDef("리치", Race.Protoss, Tag.Splash),
            new UnitDef("발키리", Race.Terran, Tag.Speed),
            new UnitDef("아이언 콜로서스", Race.Creature, Tag.Power),
        };

        public static readonly UnitDef[] GOD_POOL_LATE =
        {
            GOD_POOL_EARLY[0],
            GOD_POOL_EARLY[1],
            GOD_POOL_EARLY[2],
            GOD_POOL_EARLY[3],
            new UnitDef("왕립 대노포", Race.Zerg, Tag.Speed, Tag.Power),
            new UnitDef("팔라딘", Race.Terran, Tag.Speed, Tag.Splash),
            new UnitDef("대현자", Race.Protoss, Tag.Splash, Tag.Power),
            new UnitDef("파멸의 투석기", Race.Zerg, Tag.Power, Tag.Speed),
            new UnitDef("폭풍 노포", Race.Zerg, Tag.Power, Tag.Splash),
            new UnitDef("원소 군주", Race.Protoss, Tag.Splash, Tag.Speed),
            new UnitDef("미아즈마 로드", Race.Creature, Tag.Splash),
        };

        /// <summary>확장 GOD 풀이 열리는 처치 보스 수. trigger #534의 `AtLeast, 6`. [원본확정]</summary>
        public const int GOD_POOL_LATE_AT = 6;

        public static UnitDef[] GodPool(int bossesKilled) =>
            bossesKilled >= GOD_POOL_LATE_AT ? GOD_POOL_LATE : GOD_POOL_EARLY;

        public static string TagLabel(UnitDef u)
        {
            var sb = new StringBuilder();
            for (int i = 0; i < u.Tags.Length; i++)
            {
                if (i > 0) sb.Append(' ');
                sb.Append(TagLabelOf(u.Tags[i]));
            }
            return u.Race == Race.Creature ? $"소환대 {sb}" : sb.ToString();
        }
    }
}
