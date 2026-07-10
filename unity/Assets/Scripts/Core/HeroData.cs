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
    /// <summary>골드로 사는 영웅 스탯 — 힘(공격·체력) / 민첩(공속) / 지능(스킬 피해)</summary>
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

        // ── 파워 커브 ──
        // 초반에는 타워가 주력이고 영웅은 거들 뿐이다. 영웅 1레벨 DPS는 Lv1 타워 한 기 수준이다.
        //
        // ───────── 세 개의 곱연산 축 ─────────
        // 영웅 파워 = 스탯(골드) × 레벨 배수(경험치) × 증강 배수(선택).
        // 자원마다 축이 하나씩이다 — 골드는 스탯 포인트를 사고, 경험치는 그 스탯을
        // 배수로 키우고, 증강은 그 위에 또 곱해지거나 특수능력(스킬·광역·시너지)을 얹는다.
        //
        // 레벨 배수는 레벨에 **선형**(1 + g×(L-1))이다. 지수로 두면 아무 증강이나 골라도
        // 저절로 세져서 선택이 결과를 못 바꾼다. 후반 역전은 여전히 증강 시너지 몫이다.

        public const float HERO_BASE_RANGE = 130f;
        public const float HERO_ATTACK_INTERVAL = 0.8f;
        public const float HERO_SPEED = 88f;
        /// <summary>이 거리 안이면 도착으로 본다 (경로 위 거리 기준)</summary>
        public const float HERO_ARRIVE_EPSILON = 2f;
        public const float HERO_RADIUS = 11f;

        // ───────── 스탯 — 골드로 산다 ─────────
        // 힘: 기본 공격력과 체력.  민첩: 공격 속도.  지능: 스킬 피해.
        //
        // 포인트당 효과는 **선형**이지만 약해지지 않는다 — 레벨 배수와 증강 배수가
        // 그 위에 곱해지기 때문에, 같은 +1힘도 후반에 사면 절대값이 몇 배로 커진다.
        // 대신 포인트가 쌓일수록 "전체 대비" 증가율은 줄어들므로(1/n) 비용은 완만한
        // 선형 증가로 충분하다 — 옛 배수형(×1.12, 비용 1.28^n)과 달리 많이 살 수 있다.

        public const int HERO_BASE_STR = 7;
        public const int HERO_BASE_AGI = 8;
        public const int HERO_BASE_INT = 8;

        /// <summary>힘 1당 공격력</summary>
        public const float DMG_PER_STR = 1f;
        /// <summary>힘 1당 최대 체력</summary>
        public const float HP_PER_STR = 18f;
        /// <summary>민첩 1당 공격 속도 +4%</summary>
        public const float AS_PER_AGI = 0.04f;
        /// <summary>공격 간격 하한 — 민첩을 아무리 사도 이 밑으로는 안 내려간다</summary>
        public const float MIN_ATTACK_INTERVAL = 0.25f;
        /// <summary>지능 1당 스킬 피해 +3.5%</summary>
        public const float SKILL_PER_INT = 0.035f;

        /// <summary>스탯 구매 비용 — 그 스탯을 n번 산 뒤의 다음 구매 가격</summary>
        public const int STAT_BASE_COST = 25;
        public const int STAT_COST_GROWTH = 14;
        public static int StatCost(int bought) => STAT_BASE_COST + STAT_COST_GROWTH * bought;

        /// <summary>
        /// n번째 구매(0부터)가 주는 포인트 — 살수록 한 번에 더 많이 준다.
        /// 20번마다 +1: 1pt → 2pt → 3pt … 후반의 넘치는 골드가 점점 굵은 구매로
        /// 환전되도록. 가격도 선형으로 오르므로 포인트당 값은 대체로 평평하다.
        /// </summary>
        public const int STAT_GRANT_EVERY = 20;
        public static int StatGrant(int bought) => 1 + bought / STAT_GRANT_EVERY;

        /// <summary>n번 샀을 때의 누적 포인트</summary>
        public static int StatPointsFor(int bought)
        {
            int points = 0;
            for (int i = 0; i < bought; i++) points += StatGrant(i);
            return points;
        }

        /// <summary>
        /// 레벨 배수 — 스탯이 만든 공격력·체력에 곱해진다. 레벨에 선형.
        /// Lv9에 ×6.6, Lv24에 ×17.1, Lv47에 ×33.2. 초반 가드(Lv9 &lt; GOD 1/4)와
        /// "혼합 3증강 = GOD 1~1.5기" 앵커를 기본 스탯과 함께 정한다.
        /// </summary>
        public const float LEVEL_MULT_GROWTH = 2.4f;
        public static float LevelMult(int level) => 1f + LEVEL_MULT_GROWTH * (level - 1);

        /// <summary>
        /// 체력의 레벨 배수는 공격력보다 완만하다. 같은 기울기를 쓰면 힘몰빵 탱커가
        /// 후반에 부술 수 없는 벽이 되어 생존 라운드를 혼자 20라운드씩 벌었다.
        /// </summary>
        public const float HP_LEVEL_MULT_GROWTH = 2.4f;
        public static float HpLevelMult(int level) => 1f + HP_LEVEL_MULT_GROWTH * (level - 1);

        /// <summary>
        /// 다음 레벨까지 필요한 경험치. **지수**다.
        ///
        /// 선형(14 + 1.5×레벨)일 때는 영웅이 64레벨까지 올라갔다. 영웅 공격력이 레벨당 ×1.16이라
        /// 레벨이 두 배면 파워가 수십 배가 되는데, 레벨 자체에 제동이 없으니 후반이 무의미하게
        /// 부풀었다. 지수 비용은 고레벨을 실질적으로 봉인한다 — 50레벨 비용이 선형의 세 배다.
        ///
        /// 1.06이면 30레벨이 R30~35에 오는 창을 지키면서(막타 30%, 보스 2라운드마다) 최고 레벨이
        /// R86에 47쯤에서 멎는다.
        /// </summary>
        public const float XP_BASE_COST = 14f;
        public const float XP_COST_GROWTH = 1.06f;
        public static int XpToNext(int level) =>
            (int)MathF.Round(XP_BASE_COST * MathF.Pow(XP_COST_GROWTH, level));

        /// <summary>
        /// 경험치. 타워가 잡아도 들어오지만, 영웅이 막타를 치면 더 많이 들어온다.
        /// 배수를 크게 두면 영웅을 최전선에 던지는 게 항상 정답이 되고 판마다 편차가 커진다.
        /// 2배 정도면 "영웅을 굴리면 조금 빨리 큰다" 수준에서 멈춘다.
        /// </summary>
        // 1 → 0.65 (2026-07-11): 몹 수 ×1.6의 XP 인플레 상쇄 — 라운드당 XP 총량 보존 ← web
        public const float XP_PER_MOB = 0.65f;
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
        public const float ENEMY_DAMAGE_BASE = 4f;
        public const float ENEMY_DAMAGE_PER_ROUND = 1.6f;
        public static float EnemyDamage(int round) => ENEMY_DAMAGE_BASE + ENEMY_DAMAGE_PER_ROUND * round;

        /// <summary>보스는 같은 라운드 잡몹 여러 기 몫으로 때린다</summary>
        /// <summary>Lv3까지는 영웅·허수아비를 공격하지 않고 지나간다 — 위협은 누출 라이프뿐 ← web</summary>
        public const int BOSS_HARMLESS_MAX_LEVEL = 3;
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
        public static readonly int[] AUGMENT_LEVELS = { 9, 16, 24, 30, 35, 42 };
        public const int AUGMENT_TAIL_EVERY = 8;
        public const int AUGMENT_CHOICES = 3;

        /// <summary>이 레벨에 도달하면 증강을 받는가</summary>
        public static bool GrantsAugment(int level)
        {
            if (Array.IndexOf(AUGMENT_LEVELS, level) >= 0) return true;
            int last = AUGMENT_LEVELS[AUGMENT_LEVELS.Length - 1];
            return level > last && (level - last) % AUGMENT_TAIL_EVERY == 0;
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
