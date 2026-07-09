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
    public static class HeroData
    {
        /// <summary>제단은 게임 시작과 함께 주어진다. 십자 중앙 타일을 차지한다. (MapData.SLOT_POS[0])</summary>
        public const int ALTAR_SLOT = 0;

        // ── 파워 커브 ──
        // 초반에는 타워가 주력이고 영웅은 거들 뿐이다. 영웅 1레벨 DPS는 Lv1 타워 한 기 수준이다.
        //
        // **레벨 성장은 선형이다.** 후반 역전은 레벨이 아니라 **증강 시너지**가 만든다.
        // 레벨을 지수로 두면 아무 증강이나 골라도 저절로 세져서, 증강 선택이 결과를 못 바꾼다.
        // 선형으로 두면 증강 없는 영웅은 끝까지 GOD 타워 아래에 머물고, 계열을 몰아 특화·대특화를
        // 터뜨린 영웅만 넘어선다. 그 격차가 곧 빌드의 값어치다.

        public const float HERO_BASE_HP = 200f;
        public const float HERO_BASE_DAMAGE = 9f;
        public const float HERO_BASE_RANGE = 130f;
        public const float HERO_ATTACK_INTERVAL = 0.8f;
        public const float HERO_SPEED = 88f;
        /// <summary>이 거리 안이면 도착으로 본다 (경로 위 거리 기준)</summary>
        public const float HERO_ARRIVE_EPSILON = 2f;
        public const float HERO_RADIUS = 11f;

        /// <summary>
        /// 레벨당 성장 — 곱셈이 아니라 덧셈이다. 경험치 비용을 지수로 만든 만큼 기울기를 가파르게 뒀다.
        ///
        /// 기준은 **타워와 영웅에 골고루 투자한 판**에서 재는 GOD 타워 한 기(DPS 1182) 대비 배수다.
        /// 타입 배수가 사라져 단일 영웅 기준 DPS가 올랐기 때문에 26 → 22로 내려 초반 가드를 지킨다.
        /// </summary>
        public const float HERO_DAMAGE_PER_LEVEL = 22f;
        public const float HERO_HP_PER_LEVEL = 90f;

        // ───────── 골드 영웅 강화 ─────────
        // 미네랄로 영웅을 강화한다. **퍼센트**여야 한다.
        //
        // 영웅 공격력은 레벨당 선형으로 쌓이고 증강은 곱연산이다. 여기에 고정값을 더하면 후반엔
        // 반올림 오차가 되고, 퍼센트를 곱하면 레벨이 쌓은 기본값과 증강이 만든 배수 양쪽에
        // 다 곱해져서 **후반으로 갈수록 한 번의 강화가 커진다.**
        //
        // 그래서 두 가지가 생긴다. 타일 41칸이 다 차면 갈 곳 없던 미네랄에 무한 소비처가 생기고,
        // "유닛을 한 기 더 뽑을까 영웅을 강화할까"라는 선택이 생긴다.
        //
        // 비용은 초선형이라야 무한 스케일링이 안 된다.
        public const float HERO_UPGRADE_BASE_COST = 35f;
        public const float HERO_UPGRADE_COST_GROWTH = 1.28f;
        public const float HERO_UPGRADE_DAMAGE_MULT = 1.12f;
        public const float HERO_UPGRADE_HP_MULT = 1.08f;

        public static int HeroUpgradeCost(int bought) =>
            (int)MathF.Round(HERO_UPGRADE_BASE_COST * MathF.Pow(HERO_UPGRADE_COST_GROWTH, bought));

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
        public const int XP_PER_MOB = 1;
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
        public static float BossDamage(int level, int round) => EnemyDamage(round) * (1.5f + 0.5f * level);

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
