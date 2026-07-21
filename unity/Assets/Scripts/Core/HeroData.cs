// 원본: web/src/data/hero.ts (상수·커브 부분. 증강 데이터는 Augments.cs)
// ───────── 영웅 · 제단 · 증강 ─────────
// 원본 갓타디에는 없는 신규 설계다. 근거 표기 대상이 아니다.
//
// 영웅은 몹과 같은 경로 위에서만 움직인다. 타워 타일을 넘어다닐 수 없다.
// 대신 몹은 영웅을 보면 진행을 멈추고 영웅부터 처치한 뒤 지나간다.
// 그래서 영웅은 딜러이자 **어그로 블로커**다 — 몹을 한곳에 모으고 시간을 번다.

using System;

namespace GodTD.Core
{
    /// <summary>레벨에 따라 자동 성장하는 영웅 스탯 — 힘(공격·체력) / 민첩(공속) / 지능(스킬 피해)</summary>
    public enum StatId { Str, Agi, Int }

    public static class HeroData
    {
        public static readonly StatId[] STAT_IDS = { StatId.Str, StatId.Agi, StatId.Int };

        public static string StatLabel(StatId stat)
        {
            switch (stat)
            {
                case StatId.Str: return "힘";
                case StatId.Agi: return "민첩";
                default: return "지능";
            }
        }

        /// <summary>제단은 게임 시작과 함께 주어진다. 십자 중앙 타일을 차지한다. (MapData.SLOT_POS[0])</summary>
        public const int ALTAR_SLOT = 0;

        // ── 파워 커브 (2026-07-13 3안) ──
        // 영웅 파워 = 스탯(레벨업 자동 균등 성장) × 증강 배수(선택).
        // 레벨 배수와 스탯 직접 구매는 없다. 골드의 영웅 성장 창구는 XP 구매 하나다.

        public const float HERO_BASE_RANGE = 130f;
        public const float HERO_ATTACK_INTERVAL = 0.8f;
        public const float HERO_SPEED = 88f;
        /// <summary>이 거리 안이면 도착으로 본다 (경로 위 거리 기준)</summary>
        public const float HERO_ARRIVE_EPSILON = 2f;
        public const float HERO_RADIUS = 11f;

        // ───────── 스탯 — 레벨업마다 자동으로 골고루 오른다 ─────────
        // 힘: 기본 공격력과 체력.  민첩: 공격 속도.  지능: 스킬 피해.
        //
        // 포인트당 효과는 **선형**이지만 약해지지 않는다 — 레벨 배수와 증강 배수가
        // 그 위에 곱해지기 때문에, 같은 +1힘도 후반에 사면 절대값이 몇 배로 커진다.
        // 대신 포인트가 쌓일수록 "전체 대비" 증가율은 줄어들므로(1/n) 비용은 완만한
        // 선형 증가로 충분하다 — 옛 배수형(×1.12, 비용 1.28^n)과 달리 많이 살 수 있다.

        public const int HERO_BASE_STR = 2; // 2안: 레벨 배수 폐지 재척도 ← web
        public const int HERO_BASE_AGI = 8;
        public const int HERO_BASE_INT = 8;

        /// <summary>힘 1당 공격력 — 1 → 6 재척도, 7차 6 → 5 [프로토] ← web</summary>
        public const float DMG_PER_STR = 5f;
        /// <summary>힘 1당 최대 체력 — 같은 이유로 18 → 70 [프로토]</summary>
        public const float HP_PER_STR = 70f;

        /// <summary>
        /// 레벨과 무관한 기본 체력 (2026-07-14). 체력이 힘×70뿐이라 Lv1(힘 2) 영웅이 140이었다 —
        /// 어그로 범위 안 몹이 뭉쳐 붙으면 8.8초에 죽었다(라운드는 22초). 기본값을 주면
        /// **초반만** 두꺼워진다 — 레벨이 오를수록 힘 몫이 커져 후반 밸런스는 거의 그대로. ← web
        /// </summary>
        public const float HERO_BASE_HP = 260f;

        /// <summary>
        /// 민첩 1당 공격 속도 — **포화식** (2026-07-19, 사용자 지시).
        /// 0.056×agi/(1+agi/23). 선형이면 민첩이 레벨에 초선형이라 Lv20~30에 공격 간격
        /// 하한에 박혀 이후 성장이 전부 낭비됐다. 무증강 앵커: Lv1 1.67/초 · Lv40 3.0/초. ← web
        /// </summary>
        public const float AS_PER_AGI = 0.056f;
        public const float AS_AGI_SOFT_CAP = 23f;

        /// <summary>
        /// 레벨업마다 오르는 **기본** 공격 속도 (2026-07-18) — 민첩과는 별개 축이고,
        /// 증강의 AttackSpeedMult와는 가산이 아니라 **곱연산**으로 붙는다.
        /// 레벨에 선형이다(복리 아님) — 복리면 Lv50에 공속만 +87%로 부푼다. ← web
        /// </summary>
        public const float LEVEL_ATTACK_SPEED_RATE = 0.005f;
        /// <summary>공격 간격 하한 — 민첩을 아무리 사도 이 밑으로는 안 내려간다</summary>
        public const float MIN_ATTACK_INTERVAL = 0.25f;
        /// <summary>지능 1당 스킬 피해 +3.5%</summary>
        public const float SKILL_PER_INT = 0.035f;

        /// <summary>
        /// 2026-07-13 3안 개편 ← web/src/data/hero.ts:
        /// 골드 → XP → 레벨업 → 세 스탯 자동 균등 성장. 기존 레벨업 총 포인트 예산을
        /// 3등분해 파워 총량을 보존하면서 중간 빌드 전환 비용을 없앤다.
        /// </summary>
        /// <summary>레벨업이 세 스탯에 나눠 주는 총 포인트 — 후반 레벨일수록 굵게</summary>
        // 2+L/10 → 1+L/7 → 1+L/6 (2026-07-17 4차): 백로딩 유지 + 후반 상향 (Lv38 +14%). ← web
        // Lv19+ 추가 항 (2026-07-18): 후반부에 더 벌어지게 — Lv50 +64%. ← web
        public const int HERO_LATE_GAME_FROM = 19;
        public const int HERO_LATE_GAME_DIVISOR = 3;
        public static int LevelStatPoints(int level) =>
            1 + level / 6 + Math.Max(0, level - HERO_LATE_GAME_FROM) / HERO_LATE_GAME_DIVISOR;

        /// <summary>해당 레벨까지 각 스탯이 공통으로 받은 자연 성장치.</summary>
        public static float StatBonusByLevel(int level)
        {
            int total = 0;
            for (int l = 2; l <= level; l++) total += LevelStatPoints(l);
            return total / (float)STAT_IDS.Length;
        }

        public static float StatValue(int level, StatId stat)
        {
            float bonus = StatBonusByLevel(level);
            switch (stat)
            {
                case StatId.Str: return HERO_BASE_STR + bonus;
                case StatId.Agi: return HERO_BASE_AGI + bonus;
                default: return HERO_BASE_INT + bonus;
            }
        }

        /// <summary>XP 골드 구매 (TFT식) — 1골드 = 1XP, 버튼 한 번에 20</summary>
        public const int XP_BUY_GOLD = 20;
        public const int XP_BUY_AMOUNT = 20;

        /// <summary>
        /// 다음 레벨까지 필요한 경험치. **지수**다.
        ///
        /// 선형(14 + 1.5×레벨)일 때는 영웅이 64레벨까지 올라갔다. 영웅 공격력이 레벨당 ×1.16이라
        /// 레벨이 두 배면 파워가 수십 배가 되는데, 레벨 자체에 제동이 없으니 후반이 무의미하게
        /// 부풀었다. 지수 비용은 고레벨을 실질적으로 봉인한다 — 50레벨 비용이 선형의 세 배다.
        ///
        /// 1.06 → 1.10 (2026-07-16, economy-power-rebalance D3): XP 20골드 고정 + 완만한 지수가
        /// "최소 타워 + 영웅 몰빵"을 지배 전략으로 만들었다(영웅 DPS가 최강 타워의 ×15.7).
        /// 1.10이면 골드 2배당 +7레벨 — 새 창: 수입 20%로 R45에 Lv~24, 실질 상한 ~Lv43. ← web
        /// </summary>
        public const float XP_BASE_COST = 14f;
        // 1.12 → 1.10 (2026-07-17 4차) → 1.08 (2026-07-18): Lv30+ 비용을 더 완화. ← web
        public const float XP_COST_GROWTH = 1.08f;
        public static int XpToNext(int level) =>
            (int)MathF.Round(XP_BASE_COST * MathF.Pow(XP_COST_GROWTH, level));

        /// <summary>
        /// 경험치. 타워가 잡아도 들어오지만, 영웅이 막타를 치면 더 많이 들어온다.
        /// 배수를 크게 두면 영웅을 최전선에 던지는 게 항상 정답이 되고 판마다 편차가 커진다.
        /// 2배 정도면 "영웅을 굴리면 조금 빨리 큰다" 수준에서 멈춘다.
        /// </summary>
        // 1 → 0.65 (2026-07-11): 몹 수 ×1.6의 XP 인플레 상쇄 — 라운드당 XP 총량 보존 ← web
        public const float XP_PER_MOB = 0.3f; // 킬 XP는 부축 — 주 연료는 골드 구매
        public const int HERO_LASTHIT_XP_MULT = 2;
        public static int XpPerBoss(int level) => 8 * level;

        /// <summary>부활 대기시간. 죽으면 그동안 영웅 딜이 빠지는 것 자체가 패널티다.</summary>
        public const float HERO_RESPAWN_SECONDS = 12f;

        /// <summary>이 거리 안에 영웅이 보이면 몹이 멈춰서 영웅부터 친다</summary>
        public const float HERO_AGGRO_RANGE = 110f;
        /// <summary>이만큼 붙으면 실제로 때린다</summary>
        public const float ENEMY_TOUCH_RANGE = 22f;
        public const float ENEMY_ATTACK_INTERVAL = 1f;

        /// <summary>
        /// 몹 공격력. 영웅 체력이 선형이므로 이쪽도 선형이다.
        ///
        /// 지수로 두면(4 × 1.12^r) 선형 체력의 영웅이 후반에 즉사한다. 둘을 나란히 선형으로 두면
        /// "몹 10기를 막을 수 있는 시간"이 라운드 내내 완만하게만 줄어들고, 그 시간을 늘리는 건
        /// 오직 탱커 증강이다 — 그래서 탱킹이 빌드 선택이 된다.
        /// </summary>
        public const float ENEMY_DAMAGE_BASE = 0.5f; // 2026-07-21 접촉 공격력 절반 ← web
        public const float ENEMY_DAMAGE_PER_ROUND = 0.3f;
        public static float EnemyDamage(int round) => ENEMY_DAMAGE_BASE + ENEMY_DAMAGE_PER_ROUND * round;

        /// <summary>보스는 같은 라운드 잡몹 여러 기 몫으로 때린다</summary>
        /// <summary>Lv3까지는 영웅·허수아비를 공격하지 않고 지나간다 — 위협은 누출 라이프뿐 ← web</summary>
        // 3 → 6 (2026-07-17 플레이테스트): 보스는 전 레벨 무해 — 위협은 누출 라이프뿐. ← web
        public const int BOSS_HARMLESS_MAX_LEVEL = 8; // Lv8(2026-07-18)도 무해 — 전 레벨 불변 ← web
        public static float BossDamage(int level, int round) =>
            level <= BOSS_HARMLESS_MAX_LEVEL ? 0f : EnemyDamage(round) * (1.5f + 0.5f * level);

        /// <summary>
        /// 증강을 받는 영웅 레벨.
        ///
        /// 10레벨 고정 간격이면 증강이 게임 앞쪽에 몰린다. 측정해 보니 3번째 증강이 진행률 47%,
        /// 4번째가 61%에 왔고 median 4개에서 멈췄다. 뒤쪽 40%가 아무 선택 없는 구간이 됐다.
        ///
        /// 그래서 레벨 간격을 벌려가며 게임 전체에 고르게 뿌린다. 80/20 기준으로,
        /// **앞의 네 개는 80% 이상의 판이 받고**(핵심 빌드가 완성된다), 뒤의 두 개는 오래 버틴
        /// 판만 받는 보상이다. 소진 후에는 AUGMENT_TAIL_EVERY 레벨마다 계속 준다.
        /// </summary>
        public static readonly int[] AUGMENT_LEVELS = { 5, 10, 24, 30, 35, 42 }; // 첫 둘 조기화 (5차: 증강 보고 빌드 결정) ← web
        public const int AUGMENT_TAIL_EVERY = 8;
        public const int AUGMENT_CHOICES = 3;

        /// <summary>이 레벨에 도달하면 증강을 받는가</summary>
        public static bool GrantsAugment(int level)
        {
            if (Array.IndexOf(AUGMENT_LEVELS, level) >= 0) return true;
            int last = AUGMENT_LEVELS[AUGMENT_LEVELS.Length - 1];
            return level > last && (level - last) % AUGMENT_TAIL_EVERY == 0;
        }

        /// <summary>다음 증강을 받는 레벨 — UI 예고용 ← web</summary>
        public static int NextAugmentLevel(int level)
        {
            for (int l = level + 1; l <= level + AUGMENT_TAIL_EVERY + 1; l++)
                if (GrantsAugment(l)) return l;
            return level + 1;
        }

        /// <summary>`level`까지 올렸을 때 받은 증강 개수</summary>
        public static int AugmentsByLevel(int level)
        {
            int count = 0;
            for (int l = 2; l <= level; l++) if (GrantsAugment(l)) count++;
            return count;
        }
    }
}
