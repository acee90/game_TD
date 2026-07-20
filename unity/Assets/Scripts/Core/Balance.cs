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

        /// <summary>보스 처치 보상 Lv1..Lv6 [프로토]</summary>
        // 원본은 { 5, 8, 13, 20, 29, 39 } (trigger #601~#606 [원본확정]).
        // 2026-07-11 [프로토] 대체 — 보스 HP ×2.5와 함께 리스크에 보상이 따라가게. ← web
        // Lv8 추가 (2026-07-18) — 같은 ×1.65 패턴 (150 × 1.65 ≈ 248). ← web
        public static readonly int[] BOSS_KILL_MINERAL = { 5, 10, 18, 32, 55, 90, 150, 248 };

        /// <summary>
        /// 반복 킬 미션 — 20킬마다 +20골드 (2026-07-19, 사용자 지시).
        /// 200킬 간격 마일스톤 표(trigger #546~#566 [원본확정])를 대체한다. 그 표는 4000킬에서
        /// 끝나 후반 킬 수입이 0이 됐다. 원본의 반복 20킬 보상(trigger #544/#545, +10/+12)과
        /// 같은 리듬으로 돌아간 셈 — 액수만 우리 것. ← web
        /// </summary>
        public const int KILL_MISSION_EVERY = 20;
        public const int KILL_MISSION_REWARD = 20;

        /// <summary>
        /// 웨이브 클리어 보상.
        ///
        /// 원본에는 없다. 원본은 반복 20킬 보상(trigger #544/#545, +10/+12)으로 소득을 줬지만,
        /// 그러면 유닛 1기당 20킬을 모아야 해서 초반이 굶는다. 라운드마다 목돈이 들어오는 편이
        /// 타워를 세우는 리듬과 맞는다. [프로토]
        /// </summary>
        // 2026-07-19 (사용자 지시): **거의 평탄**하게 — 20 + 0.2×(라운드−5).
        // 옛 곡선(10+3r+이차항)은 후반 보상이 보스 수입을 압도해(R60에 라운드 253 vs 보스 62)
        // 보스 소환 실패의 리스크가 무의미했다. 라운드 보상을 깔아두는 기본기로 낮추고,
        // 소득의 성장 축을 보스 사다리와 킬 미션으로 옮긴다. ← web
        public static int WaveReward(int round) =>
            (int)MathF.Round(20f + 0.2f * MathF.Max(0, round - 5));

        /// <summary>누출 시 라이프 -1 · 미네랄 +5. strings:358 'Life -1 ! ! ! ! !미네랄 +5' [원본확정]</summary>
        public const int LEAK_MINERAL = 5;

        /// <summary>시작 라이프. 원본 미확인(EUD 메모리) [프로토]</summary>
        public const int START_LIVES = 20;

        // ───────── 지출 — 원본에는 트리거상 자원 차감이 없다(§8.3). 아래는 전부 [프로토] ─────────
        // 원본에서는 SC 네이티브 빌드 코스트로 처리되었을 것으로 보이나 수치를 읽을 수 없다.
        public const int SPAWN_UNIT_MINERAL = 12; // 소용돌이 클릭 → Lv1 생성 (strings:412)
        // 30 → 100 (2026-07-11): 프로브가 타워 2.5기 값이라 무조건 1순위였다.
        // 100이면 오프닝(시작 55) 구매가 불가능하고, 생존 우위가 +8R → +2R로 압축된다. ← web
        // 100 → 60 (2026-07-16): 진입가 100은 초반 보상의 3배 — 가스 엔진 시동이 안 걸렸다.
        // 오프닝 구매 불가(시작 55 < 60)는 유지. 지수 성장(×1.5)도 유지. ← web
        public const int PROBE_MINERAL = 60;

        /// <summary>
        /// GOD 타워 타입 리롤 (7차) — 어떤 GOD가 나오는지는 순수 운이었다. 병과가 어긋나면
        /// (가스 업그레이드는 병과별) 반쪽이 된다. 금화로 운을 교정한다.
        ///
        /// 지수(×1.5) → 고정 150 (2026-07-18, 사용자 지시). 반복 리롤일수록 비싸지는 구조가
        /// "운이 나쁠수록 교정이 더 비싸진다"는 역설을 만들었다 — 정작 교정이 필요한 상황에서
        /// 가장 비싸다. 고정가는 그 역설을 없애고, 몇 번을 굴리든 비용이 예측 가능하다. ← web
        /// </summary>
        public const int GOD_REROLL_MINERAL = 150;
        public static int GodRerollCost(int rolled) => GOD_REROLL_MINERAL;

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
        // 0.40 → 0.30 (2026-07-17 7차): "R30~40에 성장에 드는 골드가 너무 늘어 크는 재미가 없다".
        // 누적 40~120기 구간 총액 3,305 → 2,726(-18%). ← web
        public const float SPAWN_COST_GROWTH = 0.3f;
        public static int SpawnUnitCost(int spawned) =>
            (int)System.Math.Round(
                SPAWN_UNIT_MINERAL + SPAWN_COST_GROWTH * System.Math.Max(0, spawned - SPAWN_FREE_COUNT),
                System.MidpointRounding.AwayFromZero);

        /// <summary>
        /// [프로토] 프로브 비용 — **선형 증가** (2026-07-19, 사용자 지시).
        ///
        /// 지수(×1.5)는 10기째가 2,300을 넘어 가스 엔진이 중반에 봉인됐다 — 파워 사슬이
        /// "가스 → 업그레이드(선형) → 보드 피해(선형)"인데 그 시작이 지수로 잠기면
        /// 후반 구매 파워가 죽는다. 선형이면 광부 확장이 게임 내내 열려 있는 결정으로 남는다.
        /// 첫 두 기(60·90)는 지수 시절과 같아 초반 앵커는 불변. ← web
        /// </summary>
        public const int PROBE_COST_STEP = 30;
        public static int ProbeCost(int owned) => PROBE_MINERAL + PROBE_COST_STEP * owned;
        public const int PROBE_MAX = 16;
        public const float GAS_PER_PROBE_SECOND = 0.4f; // 0.25 → 0.4 (4차: 가스가 보드 파워 주축) ← web

        /// <summary>
        /// 파일런 종족 업그레이드. 가스 소비. [프로토]
        /// 2026-07-16 개편(economy-power-rebalance D1): 복리 ×1.1^L → 가산 1+0.4L,
        /// 비용 8+4L+L² → 선형 2+4L. 가산+선형만이 "레벨이 오를수록 효율 감소"를 만든다.
        /// 첫 업 2 = 시작 가스 6으로 3개 병과 1업. ← web/src/data/balance.ts
        /// </summary>
        // 0.45 → 0.5 (2026-07-18, 사용자 지시): 병과 업그레이드 버프. 가스비 이차항 제거와
        // 세트 — 사면 사는 만큼 세지는 쪽으로 더 민다. ← web
        public const float UPGRADE_DAMAGE_PER_LEVEL = 0.5f;
        // 2+3L+0.2L² → 2+3L (2026-07-18, 사용자 지시): 이차항 제거, 순수 등차 3.
        // L15 누적이 640 → 405로 가벼워진다 — 몰빵 페이스가 빨라진다. ← web
        public static int UpgradeGasCost(int level) => (int)MathF.Round(2f + 3f * level);

        // ───────── 보스 소환 ─────────
        // 소환은 라운드 진행과 무관한 상시 액션이고 쿨타임만 있다. 비용 없음.
        // Lv N은 Lv N-1을 처치해야 열린다. (원본 감지 로직·쿨타임은 EUD로 미확인 — §11.1)
        // Lv8 추가 (2026-07-18, 사용자 지시) — 사다리 꼭대기를 한 단 더. ← web
        public const int BOSS_MAX_LEVEL = 8;
        /// <summary>보스 한 바퀴의 80% — 상수가 아니라 경로 길이에서 유도한다 ← web</summary>
        public const float BOSS_COOLDOWN_RATIO = 0.8f;
        public static readonly float BOSS_LAP_SECONDS = MapData.PATH_LENGTH / BOSS_SPEED;
        public static readonly float BOSS_COOLDOWN_SECONDS =
            MathF.Round(BOSS_LAP_SECONDS * BOSS_COOLDOWN_RATIO);

        /// <summary>
        /// 보스 HP·장갑. 원본 UNIx는 Lv1~Lv6 전부 hp=100000이라 밸런스 근거로 못 쓴다(§4.6). [프로토]
        ///
        /// Lv1은 "시작 미네랄로 산 유닛만으로 잡을 수 있어야 한다"를 기준으로 맞췄다.
        /// tests/boss-balance.test.ts가 이 기준을 지킨다 — 유닛 6기면 확실히, 4기면 아슬아슬하게 잡힌다.
        /// 장갑은 타격당 감산이라 저티어 유닛에게 특히 아프다. Lv1 장갑을 3보다 올리면
        /// Lv1 유닛의 유효 피해가 10% 바닥값으로 깔려서 초반이 막힌다.
        /// </summary>
        // 레벨 성장 2.15 → 2.5 (2026-07-11): "항상 최고 소환" 처치율이 Lv6 96%였다.
        // 2.5에서 Lv5 54% · Lv6 75% — 레벨이 오를수록 리스크가 생긴다. ← web
        // 2026-07-16: 기본공 7→4에 맞춰 HP 1150→700, 장갑 3L→1.5L (장갑은 감산이라 함께 절반).
        // 2026-07-17: 성장 2.5 → 3.0 — 사다리 소진 R22가 너무 빨랐다 (Lv4 R15·Lv6 R22).
        // Lv1~2 앵커 유지, 상위만 가팔라진다: Lv6 = 170k (GOD 1기 시대 종료). ← web
        // 4차: base 550(기본공 3 동행)·성장 3.4 — GOD 다수 체제에서 사다리 재조정. ← web
        // 7차: 꼭대기 두 단만 완만하게 (Lv6 -24% · Lv7 -42%) — 아래 단 리듬은 불변. ← web
        // 700 → 640 (2026-07-19): 영웅 직접 캐리 차단으로 준 초반 영웅 딜만큼 Lv1 앵커 보정. ← web
        public const float BOSS_HP_BASE = 640f;
        public const float BOSS_HP_GROWTH = 3.4f;
        public const int BOSS_HP_TOP_FROM = 5;
        public const float BOSS_HP_TOP_GROWTH = 2.6f;
        public static float BossHP(int level)
        {
            int capped = Math.Min(level, BOSS_HP_TOP_FROM);
            float b = BOSS_HP_BASE * MathF.Pow(BOSS_HP_GROWTH, capped - 1);
            return level <= BOSS_HP_TOP_FROM
                ? b
                : b * MathF.Pow(BOSS_HP_TOP_GROWTH, level - BOSS_HP_TOP_FROM);
        }
        public static float BossArmor(int level) => 1.1f * level;
        public const float BOSS_SPEED = 26f;

        /// <summary>
        /// 보스 누출 = 잡몹과 같은 라이프 -1 (2026-07-17, 2+L → 1). 진짜 리스크는
        /// 기회비용 — 못 잡으면 쿨타임 동안 처치 보상을 못 얻는다. ← web
        /// </summary>
        public static int BossLeakLives(int level) => 1;

        // ───────── 적 웨이브 (§9) ─────────
        // 원본은 특정 라운드에 이름 붙은 GOD 적이 나오지만(trigger #268~#286), 그 사이 라운드의
        // 몹 구성·수·HP 곡선이 전부 EUD라 웨이브를 재현할 근거가 없다. 이 프로토는 모든 웨이브를
        // 같은 잡몹으로 두고, 특별한 적은 플레이어가 부르는 보스로만 등장시킨다.

        /// <summary>
        /// 웨이브는 5라운드 사이클로 돈다 — 사이클 안에서 몹 수가 늘고, 넘어가면 수가 리셋되며
        /// 개당 체력이 뛴다("새 몹은 적지만 굵다"). 총 체력은 아래 EnemyHP가 모델로 역산한다. [프로토]
        /// </summary>
        public const int CYCLE_ROUNDS = 5;
        public static int CycleOf(int round) => (round - 1) / CYCLE_ROUNDS;
        public static int PosInCycle(int round) => (round - 1) % CYCLE_ROUNDS;

        // ── 2026-07-19 재설계 3차 (사용자 지시): 웨이브 총체력은 **성장률 직접 지정** —
        // 수입 모델과 완전히 분리한다. 보상 구조를 아무리 바꿔도 난이도가 흔들리지 않고,
        // 시트의 growthPct 열이 곧 설계 상수다.
        //
        // 옛 모델(ExpectedBoardDps × TargetClearSeconds)은 시뮬 적합이라 상수 하나를 바꿀
        // 때마다 재적합이 필요했다. 1차(수입 비례)는 중반 성장률이 수입을 따라 4~7%까지
        // 내려가 "너무 쉬워졌다" — 보드 파워는 수입에 곱으로 붙어 수입보다 빨리 크기 때문.
        // ← web/src/data/balance.ts

        /// <summary>클리어 라인 — 이 라운드를 넘기면 승리. 이후는 무한 모드.</summary>
        // 주: Unity에는 아직 클리어 판정(ResolveClear)이 없다 — 상수만 미러한다.
        public const int CLEAR_ROUND = 60;

        /// <summary>R1 웨이브 총체력 = 기대 보드 DPS 실측 28 × 목표 clear 18초 — 초반 앵커의 유래</summary>
        public const float WAVE_HP_R1 = 504f;

        /// <summary>
        /// 구간별 라운드당 총체력 성장률. from 라운드부터 다음 구간 직전까지 이 배율로 큰다.
        /// 마지막 구간은 상한 없이 이어진다 — 무한 모드의 벽이다.
        /// </summary>
        public static readonly (int from, float rate)[] WAVE_RATE_SEGMENTS =
        {
            (2, 0.227f),  // R2~14 — 옛 수입 모델 초반 곡선의 기하평균
            (15, 0.17f),  // R15~40
            (41, 0.19f),  // R41~50
            (51, 0.15f),  // R51+ — 무한 모드의 벽
        };

        /// <summary>그 라운드로 넘어올 때 적용된 성장률 (R1은 앵커라 없다)</summary>
        public static float WaveGrowthRate(int round)
        {
            float rate = WAVE_RATE_SEGMENTS[0].rate;
            foreach (var (from, r) in WAVE_RATE_SEGMENTS) if (round >= from) rate = r;
            return rate;
        }

        /// <summary>웨이브 총 체력 — 구간별 순수 지수. 수입·시뮬과 무관한 설계 상수다.</summary>
        public static float WaveTotalHp(int round)
        {
            float hp = WAVE_HP_R1;
            for (int r = 2; r <= round; r++) hp *= 1f + WaveGrowthRate(r);
            return hp;
        }

        /// <summary>웨이브 총 체력 → 몹 1기 체력. 사이클마다 몹이 굵어지는 리듬은 count 리셋이 만든다</summary>
        public static float EnemyHP(int round) =>
            MathF.Max(1f, MathF.Round(WaveTotalHp(round) / EnemyCount(round)));

        /// <summary>
        /// 적 장갑은 계단식이다. 선형으로 매 라운드 오르면 저티어 유닛이 매 라운드 조금씩
        /// 무력해져서 언제 갈아엎어야 하는지 감이 안 온다. 5라운드마다 한 칸씩 오르면
        /// "다음 계단 전에 티어를 올려야 한다"는 목표가 분명해진다. [프로토]
        /// </summary>
        public const int ENEMY_ARMOR_STEP_ROUNDS = 5;
        // 2026-07-16: 3 → 1.5 — 기본공 7→4와 세트 (장갑은 감산이라 원피해와 함께 절반).
        public const float ENEMY_ARMOR_PER_STEP = 1.1f; // 기본공 3 동행 (2026-07-17 4차)
        public static float EnemyArmor(int round) => (round / ENEMY_ARMOR_STEP_ROUNDS) * ENEMY_ARMOR_PER_STEP;

        /// <summary>
        /// 웨이브당 잡몹 수. 사이클 안에서 라운드마다 COUNT_STEP만큼 늘어난다.
        /// 원본은 스폰 로직이 EUD라 몹 수를 읽을 수 없다(§9.2, §11.1). [프로토]
        /// </summary>
        // 20 → 16 · 4 → 3.2 (2026-07-18, 사용자 지시): 몹 수 -20% 전체. 초반에 뜨는 성장
        // 증강(막타 스택형)이 낮은 라운드에서부터 너무 많은 처치 기회를 얻어 고점이 치솟는
        // 문제 — 밀도를 낮춰 초반 막타 기회 자체를 줄인다. 총 체력(EnemyHP가 총량÷count로
        // 역산)은 그대로 — 개체가 굵어질 뿐 라운드 난이도 곡선은 안 바뀐다. ← web
        public const int ENEMY_BASE_COUNT = 16;
        public const float ENEMY_COUNT_STEP = 3.2f;
        public static int EnemyCount(int round) =>
            (int)MathF.Round(ENEMY_BASE_COUNT + ENEMY_COUNT_STEP * PosInCycle(round));

        /// <summary>웨이브 내 스폰 간격(초) [프로토]</summary>
        public const float SPAWN_INTERVAL = 0.18f;
        /// <summary>동시 일반 몹 상한 (6차) — 상한이면 스폰을 미룬다 (총 체력 불변). ← web</summary>
        public const int MAX_ALIVE_MOBS = 45;

        /// <summary>몹 2열 레인 — 경로 중심선에서 좌우로 비끼는 표시 오프셋(px). 판정은 1D. [프로토]</summary>
        public const float MOB_LANE_OFFSET = 8f;

        // ── 웨이브 타입 (2026-07-12 골격 — 타입 2개) ← web/src/data/balance.ts ──
        // 총체력 예산은 그대로, 접촉 공격력 배수만 다르다. 사냥꾼이 영웅 위협을 전담한다.
        public enum WaveTypeId { Normal, Hunter }

        public readonly struct WaveType
        {
            public readonly WaveTypeId Id;
            public readonly string Label;
            public readonly float ContactDamageMult;
            public readonly string Color;
            public WaveType(WaveTypeId id, string label, float mult, string color)
            { Id = id; Label = label; ContactDamageMult = mult; Color = color; }
        }

        public static readonly WaveType WAVE_NORMAL = new WaveType(WaveTypeId.Normal, "일반", 1f, "#9aa2c0");
        public static readonly WaveType WAVE_HUNTER = new WaveType(WaveTypeId.Hunter, "사냥꾼", 6f, "#c14a2c");

        /// <summary>R10부터 5의 배수 라운드는 사냥꾼 웨이브</summary>
        public static WaveType WaveTypeOf(int round) =>
            round >= 10 && round % 5 == 0 ? WAVE_HUNTER : WAVE_NORMAL; // 36기 × 0.18 = 6.5초 스폰 창
        public const float ENEMY_SPEED = 42f; // 52 → 42 (2026-07-14 web 동기화): 초반 체감 템포 완화 [프로토]

        /// <summary>
        /// 초반 전투 템포 배수 (2026-07-16). 게임 시작 몇 라운드를 "느린 템포"로 시작한다.
        /// 라운드 타이머·스폰·dt는 그대로 두고 전투 3요소에만 곱한다:
        /// 몹 이동속도 × p, 몹 체력 × p, 타워/영웅 공격 인터벌 ÷ p.
        /// 수학적 불변이 아니라 튜닝 대상 — 시드 시뮬로 초반 난이도를 맞춘다. [프로토]
        /// ← web/src/data/balance.ts earlyTempo
        /// </summary>
        public static float EarlyTempo(int round) => MathF.Min(1f, 0.5f + 0.1f * Math.Max(1, round));

        // ───────── 전투 (전부 [프로토]) ─────────
        // 원본은 무기슬롯→유닛 바인딩 정보가 없어 실제 공격력을 읽을 수 없다(§11.3).
        // 태그 3종의 전투 의미도 원본이 정의하지 않는다. 아래는 태그 이름에서 유도한 설계다.
        // 7 → 4 → 3 (2026-07-17 4차): 공짜 파워를 가스 업그레이드로 이관, 가스 0.4/s와 세트. ← web
        public const float BASE_DAMAGE = 3f;
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

        /// <summary>
        /// 태그별 전투 배수 (damage, interval, range). 인덱스 = Tag enum
        ///
        /// 2026-07-19 (사용자 지시): 파워를 **느린 한 방**으로 바꾼다.
        /// interval 1.0 → 1.5, damage 1.6 → 2.2 (지속 DPS 1.6 → 1.47로 소폭 하향, 한 방은 +38%).
        ///
        /// 의도 — "파워만 깔면 보스도 잡고 잡몹도 치운다"를 깨는 것. 파워는 최대 체력 대상을
        /// 먼저 쏘는데(Game.FireTowers), 발사 간격이 1.5배로 늘면 한 웨이브 동안 쏠 수 있는
        /// 횟수 자체가 줄고 오버킬은 전부 버려진다(피해 이월 없음). 잡몹 한 기에 과잉 피해를
        /// 꽂는 동안 나머지가 출구로 걸어간다 = **일반 몹을 놓칠 위험**.
        /// 보스는 체력이 커서 오버킬이 없으므로 한 방 상향분을 그대로 받는다.
        /// </summary>
        public static (float damage, float interval, float range) TagEffect(Tag tag)
        {
            switch (tag)
            {
                case Tag.Power: return (2.2f, 1.5f, 1.15f);
                case Tag.Splash: return (0.9f, 1.0f, 1.0f);
                case Tag.Speed: return (1.0f, 0.5f, 0.9f);
                default: return (1f, 1f, 1f);
            }
        }

        /// <summary>
        /// 스플래시 폭발 반경 = 타워 사거리 × 이 값 (2026-07-19, 사용자 지시).
        ///
        /// 전에는 반경이 **사거리 전체**였다 — 사실상 무제한 광역이라 감쇠를 아무리 조여도
        /// 사거리 안 모든 몹을 때렸다. 실제 폭발 반경을 따로 두어야 "감쇠 강화"가 의미를 갖는다.
        /// </summary>
        public const float SPLASH_RADIUS_MULT = 0.55f;

        /// <summary>
        /// 스플래시 피해 감쇠 — 3단계 계단식. 2026-07-19 (사용자 지시) 감쇠 강화:
        /// 0.75/0.5 → 0.55/0.25. 경로 1D 기준 구간 평균 0.75 → 0.6.
        ///
        /// 반경 축소(SPLASH_RADIUS_MULT)와 함께 스플래시 총량이 크게 깎이므로 태그 피해를
        /// 0.7 → 0.9로 되돌려 보상하고, 폭심을 **가장 몹이 몰린 곳**으로 잡는다(Game.FireTowers).
        /// 결과: 스플래시는 "뭉친 무리를 정확히 때리면 강한" 타워가 된다 — 넓게 뿌리는 게
        /// 아니라 밀집을 노리는 쪽으로 성격이 바뀐다.
        /// 영웅 스플래시(다중 투사 등)에도 같은 감쇠를 적용한다.
        /// </summary>
        public static readonly (float upTo, float mult)[] SPLASH_FALLOFF_TIERS =
        {
            (1f / 3f, 1f),
            (2f / 3f, 0.55f),
            (1f, 0.25f),
        };

        /// <summary>폭심에서 dist만큼 떨어진 대상의 피해 배수. radius 밖은 마지막 단계 값으로 처리.</summary>
        public static float SplashFalloff(float dist, float radius)
        {
            if (radius <= 0f) return 1f;
            float t = dist / radius;
            foreach (var (upTo, mult) in SPLASH_FALLOFF_TIERS) if (t <= upTo) return mult;
            return SPLASH_FALLOFF_TIERS[SPLASH_FALLOFF_TIERS.Length - 1].mult;
        }

        /// <summary>유효 피해 — 장갑을 뺀다. 최소 10%는 관통</summary>
        public static float EffectiveDamage(float raw, float armor) => MathF.Max(raw - armor, raw * 0.1f);

        /// <summary>조합 요구 수량. trigger #207/#209/#258/#260 전부 AtLeast 2 [원본확정]</summary>
        public const int MERGE_REQUIRED = 2;
    }
}
