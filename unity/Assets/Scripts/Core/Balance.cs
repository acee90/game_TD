// 원본: web/src/data/balance.ts
// ───────── 밸런스 테이블 ─────────
// 출처: docs/reference/god-td-x-vz056-map-analysis-v1.0.md
//
// [원본확정] 맵파일에서 직접 읽은 수치. 바꾸면 원작 재현이 깨진다.
// [프로토]   원본이 EUD로 가려져 읽을 수 없어 플레이 가능하게 정한 수치.

using System;

namespace GodTD.Core
{
    public static class Balance
    {
        // ── 시작 자원 — trigger #349 SetResources(SetTo, 55, ore) / (SetTo, 6, gas) [원본확정]
        // 제단은 공짜로 주어지므로 원본 값을 그대로 쓴다.
        public const int START_MINERAL = 55;
        public const int START_GAS = 6;

        /// <summary>원본 trigger #266의 SetCountdownTimer(57). [원본확정]</summary>
        public const float ORIGINAL_ROUND_SECONDS = 57f;

        /// <summary>
        /// 라운드 간격. 원본과 똑같이 **고정 간격**이다 — 웨이브를 빨리 정리해도 다음 라운드가
        /// 앞당겨지지 않는다.
        ///
        /// 웨이브를 다 잡으면 곧장 넘기는 방식은 쓰지 않는다. 그러면 천천히 잡을수록 라운드가
        /// 느려지고, 쉬운 웨이브에 머물면서 쿨타임(45초)만 도는 보스를 계속 소환하는 게 이득이 된다.
        /// 고정 간격이면 시간당 보스 소환 횟수가 라운드 진행과 무관하게 일정하다.
        ///
        /// 원본 57초는 연출과 조합 시간이 있을 때의 값이라 프로토에서는 짧게 잡았다. [프로토]
        /// </summary>
        public const float ROUND_SECONDS = 22f;

        /// <summary>
        /// 첫 라운드까지의 대기. 원본은 trigger #344에서 20초지만(그동안 명예의 전당 연출이 돈다)
        /// 연출이 없는 프로토에서는 그냥 기다리는 시간이라 짧게 줄였다. [프로토]
        /// </summary>
        public const float OPENING_SECONDS = 5f;

        // ───────── 소득 (§8.2) — 전부 Add, 플레이어 자원 차감은 원본에 0건(§8.3) ─────────

        /// <summary>보스 처치 보상. trigger #601~#606. Lv1..Lv6 [원본확정]</summary>
        public static readonly int[] BOSS_KILL_MINERAL = { 5, 8, 13, 20, 29, 39 };

        /// <summary>킬 마일스톤 보상. trigger #546~#566. 200킬 간격 [원본확정] — (킬 수, 미네랄)</summary>
        public static readonly (int kills, int mineral)[] KILL_MILESTONES =
        {
            (200, 5), (400, 5), (600, 10), (800, 5), (1000, 10),
            (1200, 6), (1400, 10), (1600, 6), (1800, 6), (2000, 15),
            (2200, 6), (2400, 6), (2600, 15), (2800, 6), (3000, 15),
            (3200, 6), (3400, 6), (3600, 15), (3800, 6), (4000, 15),
        };

        /// <summary>
        /// 웨이브 클리어 보상.
        ///
        /// 원본에는 없다. 원본은 반복 20킬 보상(trigger #544/#545, +10/+12)으로 소득을 줬지만,
        /// 그러면 유닛 1기당 20킬을 모아야 해서 초반이 굶는다. 라운드마다 목돈이 들어오는 편이
        /// 타워를 세우는 리듬과 맞는다. [프로토]
        /// </summary>
        public static int WaveReward(int round) => 14 + 3 * round;

        /// <summary>누출 시 라이프 -1 · 미네랄 +5. strings:358 'Life -1 ! ! ! ! !미네랄 +5' [원본확정]</summary>
        public const int LEAK_MINERAL = 5;

        /// <summary>시작 라이프. 원본 미확인(EUD 메모리) [프로토]</summary>
        public const int START_LIVES = 20;

        // ───────── 지출 — 원본에는 트리거상 자원 차감이 없다(§8.3). 아래는 전부 [프로토] ─────────
        // 원본에서는 SC 네이티브 빌드 코스트로 처리되었을 것으로 보이나 수치를 읽을 수 없다.
        public const int SPAWN_UNIT_MINERAL = 12; // 소용돌이 클릭 → Lv1 생성 (strings:412)
        public const int PROBE_MINERAL = 30;      // 첫 프로브 값 (trigger #72, 차감액 미확인)

        /// <summary>
        /// 유닛 생성 비용 — 누적 생성 횟수에 선형으로 오른다. ← web/src/data/balance.ts
        ///
        /// 고정 12일 때 중반 미네랄의 94%가 유닛 생성으로 흘러 GOD 타워가 R51에 20기(필드의 60%),
        /// 타일 40칸이 R61에 포화됐다(docs/reports/survival-curve-diagnosis-v0.1.md).
        ///
        /// 머리는 싸게, 꼬리만 조인다 — 처음 SPAWN_FREE_COUNT기는 12 그대로다.
        /// 그러지 않으면 초반 전력이 깎여 Lv1 보스를 못 잡는다.
        /// 조합으로 타워가 줄어도 비용은 내려가지 않는다(누적 생성 횟수 기준).
        /// [프로토]
        /// </summary>
        public const int SPAWN_FREE_COUNT = 8;
        public const float SPAWN_COST_GROWTH = 0.45f;
        public static int SpawnUnitCost(int spawned) =>
            (int)System.Math.Round(
                SPAWN_UNIT_MINERAL + SPAWN_COST_GROWTH * System.Math.Max(0, spawned - SPAWN_FREE_COUNT),
                System.MidpointRounding.AwayFromZero);

        /// <summary>
        /// [프로토] 프로브 비용은 지수로 오른다 — "지금 전력이냐 미래 경제냐"의 일꾼 딜레마.
        /// 8기 고정 상한이던 시절에는 GA가 전 세대 7~8로 수렴하는 무뇌 투자였다.
        /// </summary>
        public const float PROBE_COST_GROWTH = 1.3f;
        public static int ProbeCost(int owned) =>
            (int)MathF.Round(PROBE_MINERAL * MathF.Pow(PROBE_COST_GROWTH, owned));
        public const int PROBE_MAX = 16;
        public const float GAS_PER_PROBE_SECOND = 0.25f;

        /// <summary>파일런 종족 업그레이드. 가스 소비. 원본은 SC 네이티브라 비용 미확인(§8.4~8.5) [프로토]</summary>
        public const float UPGRADE_MULT = 1.1f;
        public static int UpgradeGasCost(int level) => 8 + 4 * level + level * level;

        // ───────── 보스 소환 ─────────
        // 소환은 라운드 진행과 무관한 상시 액션이고 쿨타임만 있다. 비용 없음.
        // Lv N은 Lv N-1을 처치해야 열린다. (원본 감지 로직·쿨타임은 EUD로 미확인 — §11.1)
        public const int BOSS_MAX_LEVEL = 6;
        public const float BOSS_COOLDOWN_SECONDS = 45f; // [프로토]

        /// <summary>
        /// 보스 HP·장갑. 원본 UNIx는 Lv1~Lv6 전부 hp=100000이라 밸런스 근거로 못 쓴다(§4.6). [프로토]
        ///
        /// Lv1은 "시작 미네랄로 산 유닛만으로 잡을 수 있어야 한다"를 기준으로 맞췄다.
        /// tests/boss-balance.test.ts가 이 기준을 지킨다 — 유닛 6기면 확실히, 4기면 아슬아슬하게 잡힌다.
        /// 장갑은 타격당 감산이라 저티어 유닛에게 특히 아프다. Lv1 장갑을 3보다 올리면
        /// Lv1 유닛의 유효 피해가 10% 바닥값으로 깔려서 초반이 막힌다.
        /// </summary>
        public static float BossHP(int level) => 1150f * MathF.Pow(2.15f, level - 1);
        public static float BossArmor(int level) => 3f * level;
        public const float BOSS_SPEED = 26f;

        /// <summary>보스가 일주를 끝내면 라이프 손실이 크다 [프로토]</summary>
        public static int BossLeakLives(int level) => 2 + level;

        // ───────── 적 웨이브 (§9) ─────────
        // 원본은 특정 라운드에 이름 붙은 GOD 적이 나오지만(trigger #268~#286), 그 사이 라운드의
        // 몹 구성·수·HP 곡선이 전부 EUD라 웨이브를 재현할 근거가 없다. 이 프로토는 모든 웨이브를
        // 같은 잡몹으로 두고, 특별한 적은 플레이어가 부르는 보스로만 등장시킨다.

        /// <summary>
        /// 웨이브는 5라운드 사이클로 돈다.
        ///
        /// 사이클 안에서는 같은 몹이 나오고 수만 늘어난다(12→15→18→21→24). 사이클이 넘어가면
        /// 새 몹이 나오면서 체력이 CYCLE_HP_JUMP배로 뛴다.
        ///
        /// 그래서 "웨이브 총 체력"은 사이클 안에서 **선형**이고, 5라운드마다 **기울기가 J배로 꺾인다**.
        /// 지수 곡선을 구분선형으로 근사한 셈이라 장기 성장률은 J^(1/5) = 라운드당 1.149와 같지만,
        /// 플레이어는 "이번 사이클은 예측 가능하게 조금씩 어려워지고, 새 몹이 나오면 각도가 선다"로 읽는다.
        ///
        /// J를 낮추면 꺾임이 부드러워지는 대신 게임이 길어진다. 2.0에서 사망 라운드 중앙값 R40,
        /// 게임 길이 15분, 영웅 레벨 중앙값 36이라 30레벨 각성 창(R30~35)을 확실히 지난다. [프로토]
        /// </summary>
        public const int CYCLE_ROUNDS = 5;
        public static int CycleOf(int round) => (round - 1) / CYCLE_ROUNDS;
        public static int PosInCycle(int round) => (round - 1) % CYCLE_ROUNDS;

        const float CYCLE_HP_JUMP = 2.0f;
        const float CYCLE_BASE_HP = 44f;

        public static float EnemyHP(int round) => CYCLE_BASE_HP * MathF.Pow(CYCLE_HP_JUMP, CycleOf(round));

        /// <summary>
        /// 적 장갑은 계단식이다. 선형으로 매 라운드 오르면 저티어 유닛이 매 라운드 조금씩
        /// 무력해져서 언제 갈아엎어야 하는지 감이 안 온다. 5라운드마다 한 칸씩 오르면
        /// "다음 계단 전에 티어를 올려야 한다"는 목표가 분명해진다. [프로토]
        /// </summary>
        public const int ENEMY_ARMOR_STEP_ROUNDS = 5;
        public const int ENEMY_ARMOR_PER_STEP = 3;
        public static float EnemyArmor(int round) => (round / ENEMY_ARMOR_STEP_ROUNDS) * ENEMY_ARMOR_PER_STEP;

        /// <summary>
        /// 웨이브당 잡몹 수. 사이클 안에서 라운드마다 COUNT_STEP만큼 늘어난다.
        /// 원본은 스폰 로직이 EUD라 몹 수를 읽을 수 없다(§9.2, §11.1). [프로토]
        /// </summary>
        public const int ENEMY_BASE_COUNT = 12;
        public const int ENEMY_COUNT_STEP = 3;
        public static int EnemyCount(int round) => ENEMY_BASE_COUNT + ENEMY_COUNT_STEP * PosInCycle(round);

        /// <summary>웨이브 내 스폰 간격(초) [프로토]</summary>
        public const float SPAWN_INTERVAL = 0.3f;
        public const float ENEMY_SPEED = 52f; // [프로토]

        // ───────── 전투 (전부 [프로토]) ─────────
        // 원본은 무기슬롯→유닛 바인딩 정보가 없어 실제 공격력을 읽을 수 없다(§11.3).
        // 태그 3종의 전투 의미도 원본이 정의하지 않는다. 아래는 태그 이름에서 유도한 설계다.
        public const float BASE_DAMAGE = 7f;
        public static readonly float[] TIER_DAMAGE = { 1f, 3f, 9f, 28f, 95f };
        public static readonly float[] TIER_RANGE = { 120f, 140f, 160f, 185f, 225f };
        public const float BASE_ATTACK_INTERVAL = 0.9f;

        /// <summary>
        /// 크리쳐는 보조 타워다. 딜은 40% 깎이는 대신 사거리 안 몹을 늦춘다.
        ///
        /// 감속은 곱연산으로 쌓지 않고 **가장 강한 것 하나만** 적용한다. 안 그러면 크리쳐를 도배해서
        /// 몹을 멈춰 세울 수 있다. 티어가 오를수록 배수가 낮아진다(= 더 느려진다).
        ///
        /// 이 타워가 있으면 몹이 타워 사거리에 오래 머물러, 영웅이 탱킹하지 않아도 딜 시간이 나온다.
        /// 그래서 크리쳐를 많이 뽑은 판은 원거리 영웅이, 딜 타워만 뜬 판은 탱커 영웅이 유리해진다. [프로토]
        /// </summary>
        public const float CREATURE_DAMAGE_MULT = 0.6f;
        public static readonly float[] CREATURE_SLOW = { 0.9f, 0.84f, 0.76f, 0.66f, 0.5f };

        /// <summary>태그별 전투 배수 (damage, interval, range). 인덱스 = Tag enum</summary>
        public static (float damage, float interval, float range) TagEffect(Tag tag)
        {
            switch (tag)
            {
                case Tag.Power: return (1.6f, 1.0f, 1.15f);
                case Tag.Splash: return (0.7f, 1.0f, 1.0f);
                case Tag.Speed: return (1.0f, 0.5f, 0.9f);
                default: return (1f, 1f, 1f);
            }
        }

        /// <summary>유효 피해 — 장갑을 뺀다. 최소 10%는 관통</summary>
        public static float EffectiveDamage(float raw, float armor) => MathF.Max(raw - armor, raw * 0.1f);

        /// <summary>조합 요구 수량. trigger #207/#209/#258/#260 전부 AtLeast 2 [원본확정]</summary>
        public const int MERGE_REQUIRED = 2;
    }
}
