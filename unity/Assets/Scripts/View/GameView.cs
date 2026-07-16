// 원본: web/src/render/render.ts + web/src/main.ts (렌더·입력) — 프레젠테이션 패스
// ───────── Unity 뷰: 보드게임 디오라마 ─────────
// 보드·적·영웅은 코드 생성 메시로, 타워는 Kenney Tower Defense Kit 프로토타입으로 그린다.
// 웹 캔버스의 복제가 아니라: 기울어진 원근 카메라(휠 줌), Directional 그림자,
// Standard 머티리얼(메탈릭/스무스니스), GOD 타워·보스 emissive 발광.
// 스폰 팝·피격 플래시·사망 파티클·투사체·HP바·플로팅 텍스트는 GameViewFx.cs가 맡는다.
//
// 좌표계: 웹 캔버스(px, y 아래로) → Unity XZ 평면. x = px·S, z = -py·S.
// Core의 판정·상수는 그대로 — 여기는 순수 연출 층이다.

using System.Collections.Generic;
using GodTD.Core;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace GodTD.View
{
    /// <summary>타일 클릭 판정용 — 슬롯 인덱스만 들고 있다</summary>
    public sealed class TileMarker : MonoBehaviour
    {
        public int Index;
    }

    /// <summary>영웅 클릭 판정용 — 좌클릭으로 영웅을 고를 수 있게 한다</summary>
    public sealed class HeroMarker : MonoBehaviour
    {
    }

    public sealed class EnemyMarker : MonoBehaviour
    {
        public Enemy Enemy;
    }

    public sealed class GameView : MonoBehaviour
    {
        /// <summary>웹 px → 월드 유닛</summary>
        public const float SCALE = 0.1f;

        // ── 카메라 리그 ──
        const float CAM_PITCH = 55f;  // 기울어진 원근
        const float CAM_YAW = 12f;    // 살짝 회전 — 정면 복제 탈피
        const float CAM_FOV = 42f;
        const float CAM_DIST_MIN = 22f;
        const float CAM_DIST_MAX = 62f;
        const float CAM_ZOOM_SPEED = 14f;
        /// <summary>포커스가 영웅 쪽으로 쏠리는 비율 — 부드러운 따라가기</summary>
        const float CAM_HERO_BIAS = 0.22f;

        public Game Game { get; private set; }
        public GameHud Hud { get; set; }
        public GameViewFx Fx { get; private set; }

        /// <summary>무엇을 골랐는가 — 하단 커맨드 바가 이걸 보고 통째로 바뀐다</summary>
        public Selection Selection { get; private set; } = Selection.None;

        /// <summary>커맨드 카드 페이지 (보스 소환은 하위 메뉴)</summary>
        public CardPage Page { get; private set; } = CardPage.Root;

        Camera cam;
        Transform staticRoot;
        Transform dynamicRoot;
        Vector3 boardCenter;
        Vector3 camFocus;
        float shakeAmp;      // 감쇠 노이즈 셰이크
        float hitstopTimer;  // 짧은 시간 정지 — 큰 순간의 '멈칫'
        float camDistanceTarget = 44f;
        float camDistance = 54f; // 시작은 살짝 멀리서 줌인

        GameObject[] tiles;
        MeshRenderer[] tileRenderers; // Kenney 타일 색조(occupied/altar) MPB 적용용
        GameObject[] towerObjects;
        UnitDef[] towerDefs;   // 캐시 — def/tier가 바뀌면 다시 만든다
        int[] towerTiers;

        /// <summary>적 뷰 상태 — 피격 플래시·사망 판별용</summary>
        sealed class EnemyBody
        {
            public GameObject Go;
            public MeshRenderer Renderer;
            public Material BaseMat;
            public float LastHp;
            public float Flash;
        }

        readonly Dictionary<Enemy, EnemyBody> enemyBodies = new Dictionary<Enemy, EnemyBody>();
        readonly List<Enemy> enemyRemoveBuffer = new List<Enemy>();
        GameObject heroObject;
        Animator heroAnimator;
        Vector3 heroLastPosition;
        float heroLastAttackCooldown;
        int lastHeroLevel = 1;
        bool heroWasAlive = true;
        TextMesh respawnLabel;   // F3 — 제단 위 부활 카운트다운 빌보드
        GameObject decoyObject;

        LineRenderer selectionRing;
        LineRenderer heroRing;
        GameObject tileSelectMarker;   // Kenney selection-a — 선택한 타일 위 4모서리 브래킷

        // ── 머티리얼 캐시 (색·발광 강도별) ──
        readonly Dictionary<Color, Material> litMats = new Dictionary<Color, Material>();
        readonly Dictionary<(Color, float), Material> glowMats = new Dictionary<(Color, float), Material>();
        readonly Dictionary<Color, Material> transMats = new Dictionary<Color, Material>();
        Material flashMat;
        Shader litShader;
        Shader spriteShader;

        // ── 색상 — Kenney Sample.png 룩: 어두운 배경 위에 밝은 타일 섬이 뜬다. ──
        static readonly Color SKY = Hex("#38383f");        // 배경 = 어두운 차콜 (타일을 팝시킨다)
        static readonly Color SKY_FAR = Hex("#303036");
        static readonly Color SOIL_GROUND = Hex("#33333a"); // 타일 밑/틈 = 어두운 배경색과 통일
        // Kenney 잔디 알베도가 청록빛이라 파란기를 눌러 깨끗한 중간 초록으로 (형광/라임 방지)
        static readonly Color GRASS_TINT = new Color(0.72f, 0.95f, 0.55f);
        // 길 타일 — 따뜻한 탄/흙색 (Sample의 오렌지빛 길)
        static readonly Color ROAD_TINT = new Color(1.15f, 0.92f, 0.62f);
        const float TILE_TOP = 0.36f;                        // 타일 윗면 = 유닛이 서는 높이

        // 제단 — 성주가 부활하는 사당. 테두리 금동색.
        static readonly Color ALTAR_EDGE = Hex("#c8a24a");
        static readonly Color DOOR_IN_COLOR = Hex("#8a6fd0");
        static readonly Color DOOR_OUT_COLOR = Hex("#ff5a3c");
        static readonly Color MOB = Hex("#9aa2c0");
        static readonly Color BOSS = Hex("#ff5a3c");
        // 영웅 = 성주. 망토색이다 — 몸은 밝은 강철 갑주다 (LowPoly.Hero).
        // 보라(#b08cff)에서 청으로 바꿨다: 세계관 §8이 마법적 네온 인물을 배제한다.
        static readonly Color HERO = Hex("#4f86d8");
        /// <summary>불빛 — 세계관 §8이 허용하는 유일한 광원색. 화로·횃불·불화살에 쓴다.</summary>
        static readonly Color FIRELIGHT = Hex("#ff9a48");
        static readonly Color DECOY_COLOR = Hex("#ff8a3c");
        public static readonly Color GOLD = Hex("#ffd23f");

        public static Color Hex(string hex)
        {
            return ColorUtility.TryParseHtmlString(hex, out var c) ? c : Color.magenta;
        }

        /// <summary>웹 px 좌표 → 월드 좌표 (h = 높이)</summary>
        public static Vector3 W(float px, float py, float h = 0f) =>
            new Vector3(px * SCALE, h, -py * SCALE);

        void Awake()
        {
            litShader = Shader.Find("Universal Render Pipeline/Lit");
            spriteShader = Shader.Find("Sprites/Default");
            flashMat = new Material(litShader) { color = Color.white };
            flashMat.EnableKeyword("_EMISSION");
            flashMat.SetColor("_EmissionColor", Color.white * 2.2f);

            Game = new Game();
            boardCenter = W(MapData.CENTER.X, MapData.CENTER.Y);
            camFocus = boardCenter;

            Fx = gameObject.AddComponent<GameViewFx>();
            Fx.Init(this);

            BuildCamera();
            BuildLights();
            BuildPostFx();
            BuildStaticScene();
            dynamicRoot = new GameObject("Dynamic").transform;
            dynamicRoot.SetParent(transform, false);
        }

        /// <summary>게임오버 후 재시작 — 동적 오브젝트를 모두 버리고 새 판을 만든다</summary>
        public void Restart()
        {
            Game = new Game();
            Selection = Selection.None;
            Page = CardPage.Root;
            foreach (var pair in enemyBodies) Destroy(pair.Value.Go);
            enemyBodies.Clear();
            for (int i = 0; i < towerObjects.Length; i++)
            {
                if (towerObjects[i] != null) Destroy(towerObjects[i]);
                towerObjects[i] = null;
                towerDefs[i] = null;
                towerTiers[i] = -1;
                PaintTile(i, false);
            }
            if (decoyObject != null) { Destroy(decoyObject); decoyObject = null; }
            lastHeroLevel = 1;
            heroWasAlive = true;
            Fx.OnRestart();
        }

        void Update()
        {
            HandleInput();
            float dt = Mathf.Min(Time.deltaTime, 0.05f);
            Game.Update(dt);
            SyncTowers();
            SyncEnemies(dt);
            SyncHero();
            SyncDecoy();
            SyncRings();
            Fx.Sync(dt);
        }

        /// <summary>보드를 상단 바(34px) 아래 전체에 프레이밍 — 모서리 카드는 보드 위에 떠 있다</summary>
        void ApplyViewport()
        {
            float h = 1f - 34f / Screen.height;
            cam.rect = new Rect(0f, 0f, 1f, Mathf.Max(0.2f, h));
        }

        void LateUpdate()
        {
            ApplyViewport();
            // 부드러운 따라가기 — 포커스는 영웅 쪽으로 살짝 쏠린다
            var hero = Game.Hero;
            var heroPos = W(hero.X, hero.Y);
            var targetFocus = boardCenter + (heroPos - boardCenter) * (hero.Alive ? CAM_HERO_BIAS : 0f);
            float dt = Time.deltaTime;
            camFocus = Vector3.Lerp(camFocus, targetFocus, 1f - Mathf.Exp(-3f * dt));
            camDistance = Mathf.Lerp(camDistance, camDistanceTarget, 1f - Mathf.Exp(-6f * dt));

            // 셰이크 — 감쇠 노이즈 (unscaled: 히트스톱 중에도 흔들림은 산다)
            Vector3 shakeOffset = Vector3.zero;
            if (shakeAmp > 0.01f)
            {
                shakeAmp = Mathf.Lerp(shakeAmp, 0f, 1f - Mathf.Exp(-6f * Time.unscaledDeltaTime));
                shakeOffset = new Vector3(
                    (Mathf.PerlinNoise(Time.unscaledTime * 18f, 0.3f) - 0.5f),
                    (Mathf.PerlinNoise(0.7f, Time.unscaledTime * 18f) - 0.5f),
                    0f) * (shakeAmp * 2f);
            }

            if (hitstopTimer > 0f)
            {
                hitstopTimer -= Time.unscaledDeltaTime;
                Time.timeScale = hitstopTimer > 0f ? 0.05f : 1f;
            }

            var rot = Quaternion.Euler(CAM_PITCH, CAM_YAW, 0f);
            cam.transform.SetPositionAndRotation(
                camFocus + shakeOffset - rot * Vector3.forward * camDistance, rot);
        }

        // ───────── 입력 ─────────
        // 좌클릭 = 선택 · 우클릭 = 영웅 이동 (Warcraft II 이후 RTS 표준)
        // 단축키는 커맨드 카드의 물리적 위치에 대응한다 — QWE/ASD/ZXC.

        /// <summary>선택을 바꾼다. 타워일 때만 Core의 Game.Selected를 함께 갱신한다.</summary>
        public void SetSelection(Selection next)
        {
            Selection = next;
            Game.Selected = next.IsTower ? next.Slot : null;
            Page = CardPage.Root;   // 선택이 바뀌면 하위 메뉴에서 빠져나온다
        }

        void HandleInput()
        {
            var game = Game;

            // 마우스 휠 = 줌 (오버레이 중에도 허용)
            float wheel = Input.GetAxis("Mouse ScrollWheel");
            if (wheel != 0f)
                camDistanceTarget = Mathf.Clamp(
                    camDistanceTarget - wheel * CAM_ZOOM_SPEED, CAM_DIST_MIN, CAM_DIST_MAX);

            if (game.Over || game.Paused) return; // 오버레이가 떠 있으면 월드·카드 입력 무시

            // 선택 대상이 조합·판매로 사라졌으면 해제한다
            if (!Selection.StillValid(game)) SetSelection(Selection.None);

            HandleEscape();
            HandleCardHotkeys();
            HandleMouse();
        }

        void HandleEscape()
        {
            if (!Input.GetKeyDown(KeyCode.Escape)) return;
            if (Hud != null && Hud.CloseAugmentHistory()) return; // F4 — 기록 오버레이 먼저 닫는다
            if (Page != CardPage.Root) Page = CardPage.Root;   // 하위 메뉴 → 루트
            else SetSelection(Selection.None);                 // 루트 → 선택 해제
        }

        /// <summary>그리드 단축키 — 칸 위치가 곧 키다. 선택이 바뀌어도 대응은 유지된다.</summary>
        void HandleCardHotkeys()
        {
            var cmds = CommandCard.Build(Game, Selection, Page);
            for (int i = 0; i < CommandCard.SLOTS; i++)
            {
                if (!Input.GetKeyDown(CommandCard.HOTKEYS[i])) continue;
                InvokeCommand(cmds[i]);
                return;
            }
        }

        /// <summary>카드 한 칸을 실행한다 — 키보드와 버튼이 같은 경로를 탄다</summary>
        public void InvokeCommand(Command cmd)
        {
            if (cmd.IsEmpty || !cmd.Enabled) return;
            if (cmd.OpensSubmenu)
            {
                Page = CardPage.BossSummon;
                return;
            }
            cmd.Invoke?.Invoke();
            // 판매·조합으로 선택 대상이 사라졌을 수 있다
            if (!Selection.StillValid(Game)) SetSelection(Selection.None);
        }

        void HandleMouse()
        {
            bool left = Input.GetMouseButtonDown(0);
            bool right = Input.GetMouseButtonDown(1);
            if (!left && !right) return;
            if (Hud != null && Hud.IsPointerOverHud(Input.mousePosition)) return;

            var ray = cam.ScreenPointToRay(Input.mousePosition);
            if (!Physics.Raycast(ray, out var hit, 500f))
            {
                if (left) SetSelection(Selection.None);
                return;
            }

            // 우클릭 = 영웅 이동. 어디를 찍든 경로 위로 투영된다.
            if (right)
            {
                Game.MoveHero(hit.point.x / SCALE, -hit.point.z / SCALE);
                return;
            }

            // 좌클릭 = 선택
            if (hit.collider.GetComponentInParent<HeroMarker>() != null)
            {
                SetSelection(Selection.Hero());
                return;
            }

            var enemyMarker = hit.collider.GetComponentInParent<EnemyMarker>();
            if (enemyMarker != null && enemyMarker.Enemy != null)
            {
                SetSelection(Selection.Of(enemyMarker.Enemy));
                return;
            }

            var marker = hit.collider.GetComponentInParent<TileMarker>();
            if (marker != null)
            {
                SetSelection(Selection.Of(Game.Slots[marker.Index]));
                return;
            }

            SetSelection(Selection.None);   // 빈 바닥 클릭 = 선택 해제
        }

        // ───────── 카메라 · 조명 ─────────
        void BuildCamera()
        {
            cam = Camera.main;
            if (cam == null)
            {
                var go = new GameObject("Main Camera");
                go.tag = "MainCamera";
                cam = go.AddComponent<Camera>();
            }
            cam.orthographic = false;
            cam.fieldOfView = CAM_FOV;
            cam.clearFlags = CameraClearFlags.SolidColor;
            cam.backgroundColor = SKY;
            cam.nearClipPlane = 1f;
            cam.farClipPlane = 300f;
            // URP: 블룸은 Volume(Bloom override)이 처리한다 — 카메라 포스트프로세싱만 켠다.
            var camData = cam.GetUniversalAdditionalCameraData();
            camData.renderPostProcessing = true;
            ApplyViewport();
        }

        void BuildLights()
        {
            // 씬에 남은 기본 Directional Light 제거 — 우리 라이트와 합쳐 광량이 2배가 되어
            // 딥네이비 팔레트를 회청색으로 씻었다 (픽셀 실측 0.45 → 제거 후 0.30)
            foreach (var stray in FindObjectsByType<Light>(FindObjectsSortMode.None))
                if (stray.type == LightType.Directional) Destroy(stray.gameObject);

            // 부드럽고 균일한 밝은 조명 — Kenney Sample 룩(스튜디오 렌더). 입체감은 이제 타일
            // 지오메트리(언덕·나무)가 만드므로, 조명은 대비를 낮춰 색을 곱게 살린다.
            var sun = new GameObject("Sun").AddComponent<Light>();
            sun.transform.SetParent(transform, false);
            sun.type = LightType.Directional;
            sun.transform.rotation = Quaternion.Euler(45f, -40f, 0f);
            sun.color = new Color(1f, 0.98f, 0.92f);
            sun.intensity = 1.05f;
            sun.shadows = LightShadows.Soft;
            sun.shadowStrength = 0.45f; // 옅고 부드러운 그림자

            // 밝은 균일 앰비언트 — 그늘도 환하게 (Sample처럼 대비 낮음)
            RenderSettings.ambientMode = AmbientMode.Flat;
            RenderSettings.ambientLight = new Color(0.62f, 0.62f, 0.6f);
            QualitySettings.shadowDistance = 140f;

            // 반대편 필 — 그림자 쪽을 부드럽게 채운다
            var fill = new GameObject("Fill").AddComponent<Light>();
            fill.transform.SetParent(transform, false);
            fill.type = LightType.Directional;
            fill.transform.rotation = Quaternion.Euler(40f, 150f, 0f);
            fill.color = new Color(1f, 0.95f, 0.85f);
            fill.intensity = 0.3f;
            fill.shadows = LightShadows.None;
        }

        // ───────── 포스트프로세싱 (URP Volume) ─────────
        // 구형 BloomEffect(OnRenderImage)를 대체한다. emissive·가산 파티클이 '밝은 알베도'가
        // 아니라 진짜 빛으로 읽히게 하는 게 핵심 — 감사가 지목한 "싸구려 느낌"의 최대 처방.
        // 코드 생성(에셋 0) 원칙 유지: 프로파일도 런타임에 만든다.
        void BuildPostFx()
        {
            var go = new GameObject("PostFx Volume");
            go.transform.SetParent(transform, false);
            var volume = go.AddComponent<Volume>();
            volume.isGlobal = true;
            volume.priority = 10f;

            var profile = ScriptableObject.CreateInstance<VolumeProfile>();
            volume.sharedProfile = profile;

            // Bloom — 밝은 대낮 씬이므로 임계를 높여 발광 이펙트(투사체·GOD·보스)만 번지게. 잔디는 안 번진다.
            var bloom = profile.Add<Bloom>(true);
            bloom.threshold.Override(1.25f);
            bloom.intensity.Override(0.7f);
            bloom.scatter.Override(0.6f);
            bloom.highQualityFiltering.Override(true);

            // Tonemapping(Neutral) — HDR 발광값을 색 왜곡 최소로 눌러 담는다. 없으면 >1 값이 하얗게 클립.
            // ACES는 딥네이비 팔레트를 데워 회청색으로 밀기에 Neutral을 쓴다.
            var tone = profile.Add<Tonemapping>(true);
            tone.mode.Override(TonemappingMode.Neutral);
        }

        // ───────── 정적 씬 (배경 · 보드 · 경로 · 십자 · 타일 · 문) ─────────
        void BuildStaticScene()
        {
            staticRoot = new GameObject("Static").transform;
            staticRoot.SetParent(transform, false);

            BuildBackdrop();

            // 어두운 바닥판 — 타일 섬 밑을 받치고(틈·너머는 어두운 배경) + 빈 곳 클릭 레이캐스트.
            // 윗면을 길 파인 바닥보다 아래로 낮춰야(≈-0.05) 길 채널에 지면이 안 비친다.
            var board = GameObject.CreatePrimitive(PrimitiveType.Cube);
            board.name = "Ground";
            board.transform.SetParent(staticRoot, false);
            board.transform.position = boardCenter + new Vector3(0f, -0.55f, 0f);
            board.transform.localScale = new Vector3(60f, 1f, 70f);
            Paint(board, LitMat(SOIL_GROUND));

            BuildTiles();   // 타워 슬롯 = 클릭 가능한 잔디 타일 (격자와 같은 높이)
            BuildBoard();   // 통합 격자 — 잔디(언덕·나무·바위 혼합) + 경로 흙 타일 오토타일링

            // 문 (입구·출구) — 게이트
            MakeDoor(MapData.DOOR_IN, DOOR_IN_COLOR);
            MakeDoor(MapData.DOOR_OUT, DOOR_OUT_COLOR);

            // 제단 테두리 — 보라 링
            var altarRing = MakeRing("AltarRing", TransMat(ALTAR_EDGE), 0.07f);
            SetCirclePoints(altarRing, MapData.SLOT_POS[0].X, MapData.SLOT_POS[0].Y, MapData.TILE / 2f, 0.44f);

            // 선택 링 · 영웅 사거리 링 (매 프레임 갱신)
            selectionRing = MakeRing("SelectionRing", TransMat(new Color(1f, 0.82f, 0.25f, 0.30f)), 0.06f);
            heroRing = MakeRing("HeroRangeRing", TransMat(new Color(0.69f, 0.55f, 1f, 0.13f)), 0.05f);

            // 선택 타일 마커 — Kenney selection-a(4모서리 브래킷). 선택한 타일 위에 얹어 매 프레임 옮긴다
            var selPrefab = Resources.Load<GameObject>("Kenney/selection-a");
            if (selPrefab != null)
            {
                tileSelectMarker = Instantiate(selPrefab, staticRoot);
                tileSelectMarker.name = "TileSelectMarker";
                float s = MapData.TILE * SCALE;
                tileSelectMarker.transform.localScale = new Vector3(s, s, s);
                tileSelectMarker.SetActive(false);
            }
        }

        /// <summary>배경 그라데이션 — 버텍스 컬러 메시 (먼 쪽 어둡게, 가까운 쪽 살짝 밝게)</summary>
        void BuildBackdrop()
        {
            var mesh = new Mesh { name = "Backdrop" };
            const float EXTENT = 260f;
            const float Y = -1.8f;
            mesh.vertices = new[]
            {
                boardCenter + new Vector3(-EXTENT, Y, -EXTENT),
                boardCenter + new Vector3(EXTENT, Y, -EXTENT),
                boardCenter + new Vector3(-EXTENT, Y, EXTENT),
                boardCenter + new Vector3(EXTENT, Y, EXTENT),
            };
            // 보드 너머는 어두운 배경 — 타일 섬이 뜬다 (Sample 룩)
            mesh.colors = new[] { SKY, SKY, SKY_FAR, SKY_FAR };
            mesh.triangles = new[] { 0, 2, 1, 1, 2, 3 };
            mesh.RecalculateBounds();

            var go = new GameObject("Backdrop");
            go.transform.SetParent(staticRoot, false);
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            go.AddComponent<MeshRenderer>().sharedMaterial = TransMat(Color.white);
        }

        static readonly int BaseColorId = Shader.PropertyToID("_BaseColor");

        /// <summary>Kenney 타일 인스턴스 — 균일 스케일(네이티브 도톰한 베벨 유지), 윗면을 topY에 맞춘다.</summary>
        GameObject SpawnTile(GameObject prefab, float px, float py, float side, float topY, float rotY, string name)
        {
            var t = Instantiate(prefab);
            t.name = name;
            t.transform.SetParent(staticRoot, false);
            t.transform.position = W(px, py, topY - 0.2f * side); // 메시 윗면(0.2·side)을 topY에
            t.transform.localScale = new Vector3(side, side, side);
            t.transform.rotation = Quaternion.Euler(0f, rotY, 0f);
            return t;
        }

        const int BOARD_R = 7; // 격자 반경(셀)

        static bool IsRoadCell(int gx, int gy)
        {
            float px = MapData.CENTER.X + gx * MapData.TILE;
            float py = MapData.CENTER.Y + gy * MapData.TILE;
            return PerpDistToPath(px, py) < MapData.TILE * 0.4f; // 셀 중심이 경로선 위
        }

        /// <summary>이웃 연결(N/E/S/W)로 길 조각·회전 선택 — 마칭스퀘어식 오토타일링.
        /// 실측 기준(top-down): 직선=N-S가 rot0, 코너=W-N이 rot0. 삼거리·끝은 드물어 근사.</summary>
        static (GameObject prefab, float rot) RoadPiece(bool n, bool e, bool s, bool w,
            GameObject straight, GameObject corner, GameObject crossing, GameObject split, GameObject end)
        {
            int count = (n ? 1 : 0) + (e ? 1 : 0) + (s ? 1 : 0) + (w ? 1 : 0);
            if (count >= 4) return (crossing ? crossing : straight, 0f);
            if (count == 3)
            {
                // split base(rot0)=빠진 방향 S 가정 → 실측 필요 시 조정
                if (!s) return (split, 0f);
                if (!w) return (split, 90f);
                if (!n) return (split, 180f);
                return (split, 270f); // !e
            }
            if (count == 2)
            {
                if (n && s) return (straight, 0f);
                if (e && w) return (straight, 90f);
                // 코너 rot0 = W-N. 시계방향으로 +90씩.
                if (w && n) return (corner, 0f);
                if (n && e) return (corner, 90f);
                if (e && s) return (corner, 180f);
                return (corner, 270f); // s && w
            }
            if (n) return (end, 0f);
            if (e) return (end, 90f);
            if (s) return (end, 180f);
            if (w) return (end, 270f);
            return (straight, 0f);
        }

        /// <summary>통합 보드 격자 — 잔디 + 실제 길 타일(잔디 벽+파인 흙길)을 방향 맞춰 오토타일링. 슬롯 자리는 건너뜀.</summary>
        void BuildBoard()
        {
            var grass = Resources.Load<GameObject>("Kenney/tile");
            var straight = Resources.Load<GameObject>("Kenney/tile-straight");
            var corner = Resources.Load<GameObject>("Kenney/tile-corner-square");
            var crossing = Resources.Load<GameObject>("Kenney/tile-crossing");
            var split = Resources.Load<GameObject>("Kenney/tile-split");
            var end = Resources.Load<GameObject>("Kenney/tile-end");
            // 3D 기복 타일 — 평 잔디는 어떤 크기여도 평면이라, 언덕·나무·바위로 지형을 세운다(진단 확인).
            var hill = Resources.Load<GameObject>("Kenney/tile-hill");
            var tree = Resources.Load<GameObject>("Kenney/tile-tree");
            var treeD = Resources.Load<GameObject>("Kenney/tile-tree-double");
            var treeQ = Resources.Load<GameObject>("Kenney/tile-tree-quad");
            var rock = Resources.Load<GameObject>("Kenney/tile-rock");
            if (grass == null) return;
            float side = MapData.TILE * SCALE; // flush — 길 타일 잔디 벽이 이음새를 이룬다

            for (int gx = -BOARD_R; gx <= BOARD_R; gx++)
            for (int gy = -BOARD_R; gy <= BOARD_R; gy++)
            {
                float px = MapData.CENTER.X + gx * MapData.TILE;
                float py = MapData.CENTER.Y + gy * MapData.TILE;
                if (IsNearSlot(px, py)) continue; // 슬롯 타일이 이미 채운다

                int hh = ((gx * 73856093) ^ (gy * 19349663)) & 0xff;
                float v = 0.96f + (hh / 255f) * 0.08f; // 타일별 아주 미세한 명암(체커보드 방지)

                if (straight != null && IsRoadCell(gx, gy))
                {
                    bool n = IsRoadCell(gx, gy - 1), s = IsRoadCell(gx, gy + 1);
                    bool e = IsRoadCell(gx + 1, gy), w = IsRoadCell(gx - 1, gy);
                    var (prefab, rot) = RoadPiece(n, e, s, w, straight, corner, crossing, split, end);
                    var rt = SpawnTile(prefab, px, py, side, TILE_TOP, rot, "Road");
                    // 순한 틴트 — 잔디 벽 파란기만 눌러 초록으로, 흙은 갈색 유지 (흙까지 초록 되면 길이 묻힌다)
                    TintTile(rt, ROAD_TINT * v);
                }
                else
                {
                    // 잔디 셀 = 3D 기복 타일 혼합. 언덕(낮음) 위주로 지형을 세우고 나무·바위를 흩뿌린다.
                    // 경로에서 먼 셀일수록 나무를 짙게(시야 방해 최소). 회전도 셀마다 달라 반복감 제거.
                    bool far = PerpDistToPath(px, py) > MapData.TILE * 2.2f && !IsNearSlot2(px, py, 1.6f);
                    var prefab = GrassPick(hh, far, grass, hill, tree, treeD, treeQ, rock);
                    var gt = SpawnTile(prefab, px, py, side, TILE_TOP, (hh & 3) * 90f, "Grass");
                    TintTile(gt, GRASS_TINT * v);
                }
            }
        }

        /// <summary>잔디 셀 타일 선택 — 언덕 위주 저기복 + 나무·바위 악센트. far면 나무를 짙게.</summary>
        static GameObject GrassPick(int hh, bool far, GameObject grass, GameObject hill,
            GameObject tree, GameObject treeD, GameObject treeQ, GameObject rock)
        {
            int r = hh % 100;
            if (far)
            {
                if (r < 22) return hill ?? grass;
                if (r < 45) return tree ?? grass;
                if (r < 57) return treeD ?? grass;
                if (r < 64) return treeQ ?? grass;
                if (r < 80) return rock ?? grass;
                return grass;
            }
            // 경로·슬롯 인접: 낮은 기복만 (언덕·바위·평지) — 시야 방해 최소
            if (r < 46) return hill ?? grass;
            if (r < 62) return rock ?? grass;
            if (r < 72) return tree ?? grass;
            return grass;
        }

        static bool IsNearSlot2(float px, float py, float tiles)
        {
            foreach (var s in MapData.SLOT_POS)
                if (MapData.Hypot(s.X - px, s.Y - py) < MapData.TILE * tiles) return true;
            return false;
        }

        /// <summary>Kenney 타일 렌더러에 _BaseColor 틴트 (MPB — 공유 머티리얼 오염 없음).</summary>
        static void TintTile(GameObject tile, Color tint)
        {
            var r = tile.GetComponentInChildren<MeshRenderer>();
            if (r == null) return;
            var mpb = new MaterialPropertyBlock();
            r.GetPropertyBlock(mpb);
            mpb.SetColor(BaseColorId, tint);
            r.SetPropertyBlock(mpb);
        }

        /// <summary>나무·바위 디테일 — 슬롯·경로 아닌 잔디 셀에 드문드문 (결정적 배치).</summary>
        static bool IsNearSlot(float px, float py)
        {
            foreach (var s in MapData.SLOT_POS)
                if (MapData.Hypot(s.X - px, s.Y - py) < MapData.TILE * 0.75f) return true;
            return false;
        }

        static float PerpDistToPath(float px, float py)
        {
            var wp = MapData.WAYPOINTS;
            float best = float.MaxValue;
            for (int i = 0; i < wp.Length - 1; i++)
            {
                var a = wp[i]; var b = wp[i + 1];
                float dx = b.X - a.X, dy = b.Y - a.Y;
                float l2 = dx * dx + dy * dy;
                float t = l2 > 0f ? Mathf.Clamp01(((px - a.X) * dx + (py - a.Y) * dy) / l2) : 0f;
                float cx = a.X + t * dx, cy = a.Y + t * dy;
                best = Mathf.Min(best, MapData.Hypot(px - cx, py - cy));
            }
            return best;
        }

        void BuildTiles()
        {
            int count = MapData.SLOT_POS.Length;
            tiles = new GameObject[count];
            tileRenderers = new MeshRenderer[count];
            towerObjects = new GameObject[count];
            towerDefs = new UnitDef[count];
            towerTiers = new int[count];

            // 타워 슬롯 = 잔디 위에 살짝 도톰하게 올라온 빌드 패드. 제단만 크리스탈 타일.
            var grassPrefab = Resources.Load<GameObject>("Kenney/tile");
            var altarPrefab = Resources.Load<GameObject>("Kenney/tile-crystal");
            float side = MapData.TILE * SCALE; // 격자와 동일 flush

            for (int i = 0; i < count; i++)
            {
                towerTiers[i] = -1;
                var p = MapData.SLOT_POS[i];
                bool isAltar = i == HeroData.ALTAR_SLOT;
                var prefab = isAltar && altarPrefab != null ? altarPrefab : grassPrefab;

                // 격자와 같은 높이(flush) — 슬롯은 색조로만 구분한다
                var tile = SpawnTile(prefab, p.X, p.Y, side, TILE_TOP, 0f, $"Tile{i}");

                var box = tile.AddComponent<BoxCollider>(); // 클릭 판정
                box.center = new Vector3(0f, 0.1f, 0f);
                box.size = new Vector3(1f, 0.4f, 1f);
                tile.AddComponent<TileMarker>().Index = i;

                tiles[i] = tile;
                tileRenderers[i] = tile.GetComponentInChildren<MeshRenderer>();
                PaintTile(i, false);
            }
        }

        void PaintTile(int index, bool occupied)
        {
            var r = tileRenderers[index];
            if (r == null) return;
            bool isAltar = index == HeroData.ALTAR_SLOT;
            // 컬러맵 아틀라스는 공유하므로 색은 _BaseColor 틴트로만 준다 (MPB — 머티리얼 오염 없음).
            Color tint = isAltar ? new Color(1.2f, 1.0f, 0.5f)       // 제단 — 금빛(블룸으로 은은히 발광)
                       : occupied ? GRASS_TINT * 0.72f               // 세워진 자리 — 눌린 흙빛으로 어둡게
                       : GRASS_TINT * 1.12f;                         // 빈 슬롯 — 살짝 밝은 잔디(빌드 가능 표시)
            var mpb = new MaterialPropertyBlock();
            r.GetPropertyBlock(mpb);
            mpb.SetColor(BaseColorId, tint);
            r.SetPropertyBlock(mpb);
        }

        void MakeDoor(Pt at, Color color)
        {
            var cube = GameObject.CreatePrimitive(PrimitiveType.Cube);
            cube.name = "Door";
            Destroy(cube.GetComponent<Collider>());
            cube.transform.SetParent(staticRoot, false);
            cube.transform.position = W(at.X, at.Y + 6f, 0.35f);
            cube.transform.localScale = new Vector3(24f * SCALE, 0.7f, 0.5f);
            Paint(cube, GlowMat(color, 1.4f));

            // 발광은 광원이어야 한다 — 문 빛이 바닥에 번진다 (감사: 발광체 점광)
            var glow = new GameObject("DoorLight").AddComponent<Light>();
            glow.transform.SetParent(cube.transform, false);
            glow.type = LightType.Point;
            glow.color = color;
            glow.range = 7f;
            glow.intensity = 1.6f;

            bool isIn = at.X < MapData.CENTER.X;
            MakeWorldLabel(cube.transform, isIn ? "입구" : "출구", color, 0.055f,
                new Vector3(0f, 1.6f, 0f));
        }

        LineRenderer MakeRing(string name, Material mat, float width)
        {
            var go = new GameObject(name);
            go.transform.SetParent(staticRoot, false);
            go.transform.rotation = Quaternion.Euler(90f, 0f, 0f);
            var line = go.AddComponent<LineRenderer>();
            line.useWorldSpace = true;
            line.material = mat;
            line.startWidth = width;
            line.endWidth = width;
            line.loop = true;
            line.positionCount = 0;
            line.alignment = LineAlignment.TransformZ;
            return line;
        }

        static void SetCirclePoints(LineRenderer line, float px, float py, float radiusPx, float h)
        {
            const int SEGMENTS = 64;
            line.positionCount = SEGMENTS;
            for (int i = 0; i < SEGMENTS; i++)
            {
                float a = i / (float)SEGMENTS * Mathf.PI * 2f;
                line.SetPosition(i, W(px + Mathf.Cos(a) * radiusPx, py + Mathf.Sin(a) * radiusPx, h));
            }
        }

        // ───────── 매 프레임 동기화 ─────────
        void SyncTowers()
        {
            for (int i = 0; i < Game.Slots.Count; i++)
            {
                var tower = Game.Slots[i].Tower;
                if (tower == null)
                {
                    if (towerObjects[i] != null)
                    {
                        // 조합 소모·판매 — 작은 퍼프
                        Fx.Burst(towerObjects[i].transform.position, MOB, 6, 2.2f, 0.16f);
                        Destroy(towerObjects[i]);
                        towerObjects[i] = null;
                        towerDefs[i] = null;
                        towerTiers[i] = -1;
                        PaintTile(i, false);
                    }
                    continue;
                }
                if (towerObjects[i] != null && towerDefs[i] == tower.Def && towerTiers[i] == tower.Tier)
                    continue;

                bool merged = towerTiers[i] >= 0 && tower.Tier > towerTiers[i];
                if (towerObjects[i] != null) Destroy(towerObjects[i]);
                towerObjects[i] = BuildTowerBody(Game.Slots[i], tower);
                towerDefs[i] = tower.Def;
                towerTiers[i] = tower.Tier;
                PaintTile(i, true);

                if (merged)
                {
                    // 조합 연출 — 골드 버스트 + 상위 티어 등장 플래시
                    var at = towerObjects[i].transform.position;
                    bool isGod = tower.Tier == Units.GOD_TIER;
                    Fx.Burst(at, GOLD, isGod ? 34 : 16, isGod ? 5.5f : 3.6f, 0.22f);
                    Fx.Pulse(at, GOLD, isGod ? 3.4f : 2.2f);
                    if (isGod) Impact(0.5f, 0.12f); // GOD 탄생 — 화면이 반응한다
                }
            }
        }

        GameObject BuildTowerBody(Slot slot, Tower tower)
        {
            bool isGod = tower.Tier == Units.GOD_TIER;

            // 병과 식별색. 세계관 §8에 따라 이 색은 몸이 아니라 <b>군기</b>에만 실린다 —
            // 몸체는 목재·철·가죽의 물성색이다. Core의 RACE_COLOR는 UI(HudIcons)와 공유하므로
            // 그대로 쓴다: 같은 색이 UI에서도 전장에서도 같은 병과를 뜻해야 한다.
            var flagColor = Hex(Units.RACE_COLOR[(int)tower.Def.Race]);

            var body = new GameObject($"Tower {tower.Def.Name}"); // 클릭은 타일 콜라이더가 받는다
            body.transform.SetParent(dynamicRoot, false);
            body.transform.position = W(slot.X, slot.Y, 0.37f);

            // 프로토타입에서는 Kenney 원본 받침+무기를 조립한다. 카탈로그가 빠지거나 참조가
            // 깨진 빌드에서는 기존 절차적 메시로 폴백해 게임 화면이 사라지지 않게 한다.
            float modelHeight = 0f;
            var kenney = KenneyTowerCatalog.Load();
            bool usedKenney = kenney != null &&
                kenney.TryBuild(body.transform, (int)tower.Def.Race, tower.Tier, out modelHeight);
            if (!usedKenney)
            {
                var filter = body.AddComponent<MeshFilter>();
                body.AddComponent<MeshRenderer>();
                filter.sharedMesh = LowPoly.Tower((int)tower.Def.Race, tower.Tier, isGod, flagColor);
                Paint(body, LowPoly.Mat(0f));
                modelHeight = isGod ? 1.62f : 1.32f;
            }

            // <b>균등 스케일</b>이다. 예전의 (size, height, size) 비균등 스케일은 투석기 암 같은
            // 사선 부품을 왜곡시켰다. 티어는 이제 크기가 아니라 메시 레시피(창 수·노 문수·기치 수)로
            // 표현되므로(LowPoly.Tower), 스케일은 완만하게만 키운다.
            // 메시는 밑면이 y=0 규약이라 타일 윗면(0.37)에 그대로 얹는다.
            float s = isGod ? 2.60f : 2.15f + 0.09f * tower.Tier;
            // 병사는 <b>카메라를 향해</b> 선다. 메시 정면은 +Z인데 게임 카메라는 +Z 방향을 보므로,
            // 그대로 두면 판 위의 모든 병사가 등을 돌린다 — 쇠뇌·대방패·포신이 전부 안 보인다.
            // (적은 반대다. 적은 진행 방향을 바라봐야 하므로 회전을 걸지 않는다.)
            body.transform.rotation = Quaternion.Euler(0f, 180f, 0f);

            // 티어 라벨 — 웹의 render.ts:93 복원. GOD은 골드 'G'
            // 오프셋은 <b>머리 위</b>다. 메시가 밑면 기준(y=0)으로 바뀌었으므로 예전 값(0.75)은
            // 가슴 높이가 되어 라벨이 몸에 박혔다. 명장은 대장기가 더 높아 라벨도 더 올린다.
            MakeWorldLabel(body.transform, isGod ? "G" : (tower.Tier + 1).ToString(),
                isGod ? GOLD : Color.white, isGod ? 0.10f : 0.07f,
                new Vector3(0f, modelHeight + 0.18f, 0f));

            if (isGod)
            {
                // 명장의 화로 불빛. 색이 보라·네온이 아니라 <b>불</b>이라는 게 요점이다.
                var halo = new GameObject("BrazierLight").AddComponent<Light>();
                halo.transform.SetParent(body.transform, false);
                halo.transform.localPosition = new Vector3(0f, 0.25f, 0f);
                halo.type = LightType.Point;
                halo.color = FIRELIGHT;
                halo.range = 8f;
                halo.intensity = 1.7f;
            }

            var pop = body.AddComponent<PopScale>();
            pop.Target = new Vector3(s, s, s);
            return body;
        }

        void SyncEnemies(float dt)
        {
            foreach (var enemy in Game.Enemies)
            {
                if (!enemyBodies.TryGetValue(enemy, out var body))
                {
                    body = BuildEnemyBody(enemy);
                    enemyBodies[enemy] = body;
                }
                float lane = enemy.Lane * Balance.MOB_LANE_OFFSET;
                var p = MapData.PathPosOffset(enemy.Distance, lane);
                // 메시는 보스도 단위 큐브라 높이 규약이 잡몹과 같다 (캡슐은 세로 2배였다)
                body.Go.transform.position = W(p.X, p.Y, 0.4f + enemy.Radius * SCALE);

                // 진행 방향을 바라본다 — 구체는 앞이 없었지만 생물은 있다.
                // 경로를 조금 앞서 샘플해 접선을 얻는다.
                var ahead = MapData.PathPosOffset(enemy.Distance + 2f, lane);
                var dir = W(ahead.X, ahead.Y) - W(p.X, p.Y);
                if (dir.sqrMagnitude > 1e-5f)
                    body.Go.transform.rotation = Quaternion.Slerp(
                        body.Go.transform.rotation, Quaternion.LookRotation(dir), dt * 10f);

                // 피격 플래시 — 체력이 줄어든 프레임에 짧게 하얗게
                if (enemy.Hp < body.LastHp - 0.01f) body.Flash = 0.07f;
                body.LastHp = enemy.Hp;
                if (body.Flash > 0f)
                {
                    body.Flash -= dt;
                    body.Renderer.sharedMaterial = body.Flash > 0f ? flashMat : body.BaseMat;
                }
            }

            // 죽거나 돌파한 적 정리 — 사망이면 파티클 버스트
            enemyRemoveBuffer.Clear();
            foreach (var pair in enemyBodies)
                if (!Game.Enemies.Contains(pair.Key)) enemyRemoveBuffer.Add(pair.Key);
            foreach (var enemy in enemyRemoveBuffer)
            {
                var body = enemyBodies[enemy];
                var at = body.Go.transform.position;
                if (enemy.Hp <= 0f)
                {
                    if (enemy.Kind == EnemyKind.Boss)
                    {
                        // 보스 전용 사망 폭발
                        Fx.Burst(at, BOSS, 46, 7.5f, 0.3f);
                        Fx.Burst(at, GOLD, 22, 5f, 0.22f);
                        Fx.Pulse(at, BOSS, 4.6f);
                        Impact(0.8f, 0.16f); // 보스 처치 — 셰이크 + 히트스톱
                    }
                    else
                    {
                        Fx.Burst(at, MOB, 9, 3f, 0.15f);
                    }
                }
                else
                {
                    // 누출 — 출구 쪽 붉은 퍼프
                    Fx.Burst(at, DOOR_OUT_COLOR, 7, 2.5f, 0.16f);
                }
                Destroy(body.Go);
                enemyBodies.Remove(enemy);
            }
        }

        EnemyBody BuildEnemyBody(Enemy enemy)
        {
            bool boss = enemy.Kind == EnemyKind.Boss;
            var go = new GameObject(enemy.Name, typeof(MeshFilter), typeof(MeshRenderer));
            go.AddComponent<EnemyMarker>().Enemy = enemy;
            go.transform.SetParent(dynamicRoot, false);

            // 세력색. 세계관 §7·§8에 따라 이 색은 몸이 아니라 군기·술띠·투구 깃에만 실린다.
            bool hunter = enemy.Spec.TypeColor != null;
            var bannerColor = hunter ? Hex(enemy.Spec.TypeColor) : MOB;

            // 적은 괴수가 아니라 <b>군세</b>다 (세계관 §7). 갑각·등뿔·발광 눈은 폐기했다.
            //   일반  → 보병 (창·방패. 발자국이 작은 정사각)
            //   사냥꾼 → 기병 (말 때문에 발자국이 세로로 길다). 연출이 아니라 사양의 직역이다 —
            //            사냥꾼은 접촉 피해 ×6으로 영웅을 노리도록 설계됐다(balance.ts).
            //   보스  → 적장 (전차. 가장 크고 가장 세로로 길다)
            // 셋을 가르는 것은 색이 아니라 <b>부감 발자국</b>이다. 무리 속에서도 형태로 읽혀야 한다.
            // 메시는 단위 큐브(±0.5) 중심 규약이라 스케일·높이 계산이 기존과 같다.
            go.GetComponent<MeshFilter>().sharedMesh =
                boss ? LowPoly.Warlord(BOSS)
                     : hunter ? LowPoly.Rider(bannerColor)
                              : LowPoly.Foot(bannerColor);

            // 발광 0 — 적은 사람이다. 빛나는 것은 아무것도 없다 (세계관 §8).
            var mat = LowPoly.Mat(0f);
            Paint(go, mat);

            if (boss)
            {
                // 적장의 존재감은 광원으로 낸다. 다만 마법 오라가 아니라 <b>횃불빛</b>이다 —
                // 전차 앞뒤로 횃불을 든 무리가 온다는 함의.
                var menace = new GameObject("BossTorch").AddComponent<Light>();
                menace.transform.SetParent(go.transform, false);
                menace.type = LightType.Point;
                menace.color = FIRELIGHT;
                menace.range = 9f;
                menace.intensity = 1.5f;
            }

            float d = enemy.Radius * 2f * SCALE;
            var pop = go.AddComponent<PopScale>();
            pop.Target = new Vector3(d, d, d);

            return new EnemyBody
            {
                Go = go,
                Renderer = go.GetComponent<MeshRenderer>(),
                BaseMat = mat,
                LastHp = enemy.Hp,
            };
        }

        void SyncHero()
        {
            if (heroObject == null)
            {
                // 성주 — 판 위에서 유일하게 <b>움직이는 사람</b>이다. 예전엔 "유일한 2족 보행"이
                // 구분 단서였지만, 적이 군세가 되면서(세계관 §7) 그 단서가 사라졌다. 새 단서는
                // 밝은 강철 갑주 + 청 망토 + <b>군기가 없다는 것</b>(명장은 등에 군기를 지고 정지해 있다).
                // Mixamo 휴머노이드 프리팹. 프리팹이 없을 때만 기존 코드 생성 메시로 폴백한다.
                var heroPrefab = Resources.Load<GameObject>("Hero/WanderingArcherHero");
                heroObject = heroPrefab != null
                    ? Instantiate(heroPrefab)
                    : new GameObject("Hero", typeof(MeshFilter), typeof(MeshRenderer));
                heroObject.name = "Hero";
                // 영웅 몸집 축소 — 1.8배 → 1.4배 (프리팹 모델이 커서 몹·타워 대비 과하게 컸다)
                if (heroPrefab != null)
                    heroObject.transform.localScale = Vector3.one * (1.4f / 1.8f);
                heroObject.AddComponent<SphereCollider>();
                heroObject.AddComponent<HeroMarker>();
                heroObject.transform.SetParent(dynamicRoot, false);
                heroAnimator = heroObject.GetComponent<Animator>();
                if (heroPrefab == null)
                {
                    heroObject.GetComponent<MeshFilter>().sharedMesh = LowPoly.Hero(HERO);
                    float d = HeroData.HERO_RADIUS * 2f * SCALE;
                    heroObject.transform.localScale = new Vector3(d, d, d);
                    Paint(heroObject, LowPoly.Mat(0f));
                }

                // 영웅 전용 포인트 라이트 — 갑주에 닿는 빛으로 위치를 알린다.
                // 마법 오라가 아니라 <b>성주를 따르는 횃불</b>이라는 함의로 불빛을 쓴다.
                var glow = new GameObject("HeroTorch").AddComponent<Light>();
                glow.transform.SetParent(heroObject.transform, false);
                glow.type = LightType.Point;
                glow.color = FIRELIGHT;
                glow.range = 7f;
                glow.intensity = 1.3f;
            }
            var hero = Game.Hero;
            bool alive = hero.Alive;
            if (alive && !heroWasAlive)
            {
                // 부활 — 제단에서 링 이펙트
                Fx.Ring(W(hero.X, hero.Y, 0.5f), HERO, 3.2f);
            }
            heroWasAlive = alive;
            heroObject.SetActive(alive);

            // F3 — 사망 중 제단 위에 남은 부활 초를 빌보드로 (§7.13). HUD 배너와 같은 숫자.
            if (!alive && !Game.Over)
            {
                if (respawnLabel == null)
                {
                    respawnLabel = MakeWorldLabel(transform, "", HERO, 0.085f, Vector3.zero);
                    respawnLabel.transform.position = W(MapData.CENTER.X, MapData.CENTER.Y, 2.4f);
                    respawnLabel.fontStyle = FontStyle.Bold;
                }
                respawnLabel.gameObject.SetActive(true);
                respawnLabel.text = $"부활 {Mathf.CeilToInt(hero.RespawnTimer)}";
            }
            else if (respawnLabel != null && respawnLabel.gameObject.activeSelf)
            {
                respawnLabel.gameObject.SetActive(false);
            }
            if (alive)
            {
                var nextPosition = W(hero.X, hero.Y, heroAnimator != null
                    ? 0.4f
                    : 0.4f + HeroData.HERO_RADIUS * SCALE);
                var delta = nextPosition - heroLastPosition;
                bool moving = delta.sqrMagnitude > 0.0001f;
                heroObject.transform.position = nextPosition;
                if (heroAnimator != null)
                {
                    heroAnimator.SetBool("Moving", moving);
                    if (moving)
                        heroObject.transform.rotation = Quaternion.LookRotation(delta.normalized, Vector3.up);
                    if (hero.AttackCooldown > heroLastAttackCooldown + 0.01f)
                    {
                        // 코어가 이번 공격에 만든 실제 투사체를 사용한다. 막타로 대상이 이미
                        // Enemies에서 제거됐더라도 Shot에는 발사 방향이 남아 있다.
                        for (int i = Game.Shots.Count - 1; i >= 0; i--)
                        {
                            var shot = Game.Shots[i];
                            if (Mathf.Abs(shot.X - hero.X) > 0.01f ||
                                Mathf.Abs(shot.Y - hero.Y) > 0.01f) continue;
                            var attackDirection = W(shot.Tx, shot.Ty, 0.4f) - nextPosition;
                            attackDirection.y = 0f;
                            if (attackDirection.sqrMagnitude > 0.0001f)
                                heroObject.transform.rotation = Quaternion.LookRotation(
                                    attackDirection.normalized, Vector3.up);
                            break;
                        }
                        heroAnimator.SetTrigger("Attack");
                    }
                }
                heroLastPosition = nextPosition;
                heroLastAttackCooldown = hero.AttackCooldown;
            }

            // 레벨업 — 확장 링 + 버스트
            if (hero.Level > lastHeroLevel)
            {
                lastHeroLevel = hero.Level;
                var at = W(hero.X, hero.Y, 0.5f);
                Fx.Ring(at, GOLD, 4f);
                Fx.Burst(at, HERO, 18, 4.2f, 0.2f);
            }
        }

        void SyncDecoy()
        {
            var decoy = Game.Decoy;
            if (decoy == null)
            {
                if (decoyObject != null)
                {
                    Fx.Burst(decoyObject.transform.position, DECOY_COLOR, 8, 2.6f, 0.16f);
                    Destroy(decoyObject);
                    decoyObject = null;
                }
                return;
            }
            if (decoyObject == null)
            {
                decoyObject = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
                decoyObject.name = "Decoy";
                Destroy(decoyObject.GetComponent<Collider>());
                decoyObject.transform.SetParent(dynamicRoot, false);
                float d = Skills.DECOY_RADIUS * 2f * SCALE;
                Paint(decoyObject, decoy.Taunts
                    ? GlowMat(Color.Lerp(DECOY_COLOR, GOLD, 0.4f), 1.2f)
                    : GlowMat(DECOY_COLOR, 0.5f));
                var pop = decoyObject.AddComponent<PopScale>();
                pop.Target = new Vector3(d, 0.9f, d);
            }
            var p = MapData.PathPos(decoy.Distance);
            decoyObject.transform.position = W(p.X, p.Y, 0.4f + 0.9f);
        }

        void SyncRings()
        {
            var selected = Game.Selected;
            if (selected?.Tower != null)
                SetCirclePoints(selectionRing, selected.X, selected.Y, Combat.Range(selected.Tower), 0.46f);
            else
                selectionRing.positionCount = 0;

            // 선택 타일 브래킷 — 빈 타일이든 타워든 슬롯을 고르면 그 타일 위에 얹는다
            if (tileSelectMarker != null)
            {
                var slot = Selection.Slot;
                bool show = slot != null && (Selection.IsTower || Selection.IsEmptyTile);
                tileSelectMarker.SetActive(show);
                if (show) tileSelectMarker.transform.position = W(slot.X, slot.Y, 0.46f);
            }

            var hero = Game.Hero;
            if (hero.Alive)
                SetCirclePoints(heroRing, hero.X, hero.Y, hero.Stats.Range, 0.44f);
            else
                heroRing.positionCount = 0;
        }

        // ───────── 머티리얼 ─────────
        /// <summary>리트 머티리얼 — 메탈릭·스무스니스 살짝. sharedMaterial 오염 없이 색마다 캐시.</summary>
        public Material LitMat(Color color)
        {
            if (litMats.TryGetValue(color, out var mat)) return mat;
            mat = new Material(litShader) { color = color };
            mat.SetFloat("_Metallic", 0.03f);  // 0.15/0.45는 넓은 스펙큘러가 팔레트를 회색으로 씻었다 (캡처 검증)
            mat.SetFloat("_Smoothness", 0.18f);
            litMats[color] = mat;
            return mat;
        }

        /// <summary>발광 머티리얼 — emission 색을 별도로 줄 수 있다 (기본은 본색)</summary>
        public Material GlowMat(Color color, float intensity, Color? baseColor = null)
        {
            var key = (color, intensity);
            if (glowMats.TryGetValue(key, out var mat)) return mat;
            mat = new Material(litShader) { color = baseColor ?? color };
            mat.SetFloat("_Metallic", 0.2f);
            mat.SetFloat("_Smoothness", 0.5f);
            mat.EnableKeyword("_EMISSION");
            mat.SetColor("_EmissionColor", color * intensity);
            glowMats[key] = mat;
            return mat;
        }

        /// <summary>언리트 반투명 (링·경로·배경) — Sprites/Default</summary>
        public Material TransMat(Color color)
        {
            if (transMats.TryGetValue(color, out var mat)) return mat;
            mat = new Material(spriteShader) { color = color };
            transMats[color] = mat;
            return mat;
        }

        static void Paint(GameObject go, Material mat)
        {
            go.GetComponent<MeshRenderer>().sharedMaterial = mat;
        }

        /// <summary>화면 흔들림 + 선택적 히트스톱 — 보스 사망·GOD 조합의 '멈칫'</summary>
        public void Impact(float amplitude, float stopSeconds = 0f)
        {
            shakeAmp = Mathf.Max(shakeAmp, amplitude);
            if (stopSeconds > 0f) hitstopTimer = stopSeconds;
        }

        /// <summary>인월드 라벨 — 웹 렌더러에 있던 티어·문 표기 복원 (감사: 가독성 회귀)</summary>
        TextMesh MakeWorldLabel(Transform parent, string text, Color color, float size, Vector3 localPos)
        {
            var go = new GameObject("Label");
            go.transform.SetParent(parent, false);
            go.transform.localPosition = localPos;
            go.transform.rotation = Quaternion.Euler(CAM_PITCH, CAM_YAW, 0f); // 카메라 정면
            var tm = go.AddComponent<TextMesh>();
            tm.text = text;
            tm.font = GameViewFx.UiFont();
            tm.fontSize = 42;
            tm.characterSize = size;
            tm.anchor = TextAnchor.MiddleCenter;
            tm.color = color;
            var mr = go.GetComponent<MeshRenderer>();
            if (mr != null && tm.font != null) mr.sharedMaterial = tm.font.material;
            return tm;
        }
    }
}
