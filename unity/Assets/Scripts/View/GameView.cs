// 원본: web/src/render/render.ts + web/src/main.ts (렌더·입력) — 프레젠테이션 패스
// ───────── Unity 뷰: 보드게임 디오라마 ─────────
// 에셋 없이 GameObject.CreatePrimitive + 코드 생성 메시/파티클만으로 그린다.
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
        float camDistanceTarget = 44f;
        float camDistance = 54f; // 시작은 살짝 멀리서 줌인

        GameObject[] tiles;
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
        int lastHeroLevel = 1;
        bool heroWasAlive = true;
        GameObject decoyObject;

        LineRenderer selectionRing;
        LineRenderer heroRing;

        // ── 머티리얼 캐시 (색·발광 강도별) ──
        readonly Dictionary<Color, Material> litMats = new Dictionary<Color, Material>();
        readonly Dictionary<(Color, float), Material> glowMats = new Dictionary<(Color, float), Material>();
        readonly Dictionary<Color, Material> transMats = new Dictionary<Color, Material>();
        Material flashMat;
        Shader standardShader;
        Shader spriteShader;

        // ── 색상 (웹 원본 render.ts 팔레트 유지) ──
        static readonly Color BG = Hex("#090c16");
        static readonly Color BG_FAR = Hex("#05060c");
        static readonly Color BG_NEAR = Hex("#141b30");
        static readonly Color BOARD = Hex("#101526");
        static readonly Color PATH_OUTER = Hex("#333c66");
        static readonly Color PATH_INNER = Hex("#171d33");
        static readonly Color CROSS_FILL = Hex("#1a2036");
        static readonly Color TILE_EMPTY = Hex("#161c30");
        static readonly Color TILE_TOWER = Hex("#232a44");
        static readonly Color TILE_BASE = Hex("#0b0f1d");
        static readonly Color ALTAR = Hex("#2a2140");
        static readonly Color ALTAR_EDGE = Hex("#b08cff");
        static readonly Color DOOR_IN_COLOR = Hex("#8a6fd0");
        static readonly Color DOOR_OUT_COLOR = Hex("#ff5a3c");
        static readonly Color MOB = Hex("#9aa2c0");
        static readonly Color BOSS = Hex("#ff5a3c");
        static readonly Color HERO = Hex("#b08cff");
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
            standardShader = Shader.Find("Standard");
            spriteShader = Shader.Find("Sprites/Default");
            flashMat = new Material(standardShader) { color = Color.white };
            flashMat.EnableKeyword("_EMISSION");
            flashMat.SetColor("_EmissionColor", Color.white * 2.2f);

            Game = new Game();
            boardCenter = W(MapData.CENTER.X, MapData.CENTER.Y);
            camFocus = boardCenter;

            Fx = gameObject.AddComponent<GameViewFx>();
            Fx.Init(this);

            BuildCamera();
            BuildLights();
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

        void LateUpdate()
        {
            // 부드러운 따라가기 — 포커스는 영웅 쪽으로 살짝 쏠린다
            var hero = Game.Hero;
            var heroPos = W(hero.X, hero.Y);
            var targetFocus = boardCenter + (heroPos - boardCenter) * (hero.Alive ? CAM_HERO_BIAS : 0f);
            float dt = Time.deltaTime;
            camFocus = Vector3.Lerp(camFocus, targetFocus, 1f - Mathf.Exp(-3f * dt));
            camDistance = Mathf.Lerp(camDistance, camDistanceTarget, 1f - Mathf.Exp(-6f * dt));

            var rot = Quaternion.Euler(CAM_PITCH, CAM_YAW, 0f);
            cam.transform.SetPositionAndRotation(camFocus - rot * Vector3.forward * camDistance, rot);
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
            cam.backgroundColor = BG;
            cam.nearClipPlane = 1f;
            cam.farClipPlane = 300f;
        }

        void BuildLights()
        {
            var sun = new GameObject("Sun").AddComponent<Light>();
            sun.transform.SetParent(transform, false);
            sun.type = LightType.Directional;
            sun.transform.rotation = Quaternion.Euler(55f, -35f, 0f);
            sun.color = new Color(1f, 0.96f, 0.88f);
            sun.intensity = 1.15f;
            sun.shadows = LightShadows.Soft;
            sun.shadowStrength = 0.65f;

            // Trilight — Flat(0.30,0.33,0.46)이 딥네이비 팔레트를 회청색으로 씻어냈다(아트 계획 §2.6)
            RenderSettings.ambientMode = AmbientMode.Trilight;
            RenderSettings.ambientSkyColor = Hex("#1A2340");
            RenderSettings.ambientEquatorColor = Hex("#10162A");
            RenderSettings.ambientGroundColor = Hex("#070A14");
            QualitySettings.shadowDistance = 140f;

            // 반대편 차가운 필 — 실루엣이 어두운 판에서 분리된다 (감사 high/low)
            var fill = new GameObject("Fill").AddComponent<Light>();
            fill.transform.SetParent(transform, false);
            fill.type = LightType.Directional;
            fill.transform.rotation = Quaternion.Euler(38f, 140f, 0f);
            fill.color = new Color(0.55f, 0.65f, 1f);
            fill.intensity = 0.35f;
            fill.shadows = LightShadows.None;
        }

        // ───────── 정적 씬 (배경 · 보드 · 경로 · 십자 · 타일 · 문) ─────────
        void BuildStaticScene()
        {
            staticRoot = new GameObject("Static").transform;
            staticRoot.SetParent(transform, false);

            BuildBackdrop();

            // 보드 판 — 그림자를 받는 리트 바닥이자 빈 곳 클릭(영웅 이동)의 레이캐스트 판
            var board = GameObject.CreatePrimitive(PrimitiveType.Cube);
            board.name = "Ground";
            board.transform.SetParent(staticRoot, false);
            board.transform.position = boardCenter + new Vector3(0f, -0.45f, 0f);
            board.transform.localScale = new Vector3(52f, 0.8f, 62f);
            Paint(board, LitMat(BOARD));

            // 경로 — 굵은 선 두 겹 (외곽선 + 안쪽)
            MakePathLine("PathOuter", (36f + 4f) * SCALE, PATH_OUTER, 0.02f);  // 2열 레인 수용
            MakePathLine("PathInner", 36f * SCALE, PATH_INNER, 0.04f);

            // 십자 지형 — 살짝 도드라진 리트 플레이트
            foreach (var bar in MapData.CROSS_BARS)
            {
                var cube = GameObject.CreatePrimitive(PrimitiveType.Cube);
                cube.name = "CrossBar";
                Destroy(cube.GetComponent<Collider>());
                cube.transform.SetParent(staticRoot, false);
                cube.transform.position = W(bar.X + bar.W / 2f, bar.Y + bar.H / 2f, 0.05f);
                cube.transform.localScale = new Vector3(bar.W * SCALE, 0.1f, bar.H * SCALE);
                Paint(cube, LitMat(CROSS_FILL));
            }

            // 문 (입구 보라 / 출구 빨강) — 발광 게이트
            MakeDoor(MapData.DOOR_IN, DOOR_IN_COLOR);
            MakeDoor(MapData.DOOR_OUT, DOOR_OUT_COLOR);

            BuildTiles();

            // 제단 테두리 — 보라 링
            var altarRing = MakeRing("AltarRing", TransMat(ALTAR_EDGE), 0.07f);
            SetCirclePoints(altarRing, MapData.SLOT_POS[0].X, MapData.SLOT_POS[0].Y, MapData.TILE / 2f, 0.44f);

            // 선택 링 · 영웅 사거리 링 (매 프레임 갱신)
            selectionRing = MakeRing("SelectionRing", TransMat(new Color(1f, 0.82f, 0.25f, 0.30f)), 0.06f);
            heroRing = MakeRing("HeroRangeRing", TransMat(new Color(0.69f, 0.55f, 1f, 0.13f)), 0.05f);
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
            // 카메라가 -Z 근처에서 +Z(먼 쪽)를 바라본다 — 먼 쪽을 어둡게
            mesh.colors = new[] { BG_NEAR, BG_NEAR, BG_FAR, BG_FAR };
            mesh.triangles = new[] { 0, 2, 1, 1, 2, 3 };
            mesh.RecalculateBounds();

            var go = new GameObject("Backdrop");
            go.transform.SetParent(staticRoot, false);
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            go.AddComponent<MeshRenderer>().sharedMaterial = TransMat(Color.white);
        }

        void BuildTiles()
        {
            int count = MapData.SLOT_POS.Length;
            tiles = new GameObject[count];
            towerObjects = new GameObject[count];
            towerDefs = new UnitDef[count];
            towerTiers = new int[count];
            for (int i = 0; i < count; i++)
            {
                towerTiers[i] = -1;
                var p = MapData.SLOT_POS[i];
                float side = (MapData.TILE - 5f) * SCALE;

                // 받침 — 한 둘레 큰 어두운 판. 타일이 살짝 떠 있는 베벨 느낌을 만든다.
                var basePlate = GameObject.CreatePrimitive(PrimitiveType.Cube);
                basePlate.name = $"TileBase{i}";
                Destroy(basePlate.GetComponent<Collider>());
                basePlate.transform.SetParent(staticRoot, false);
                basePlate.transform.position = W(p.X, p.Y, 0.10f);
                basePlate.transform.localScale = new Vector3(side + 0.18f, 0.10f, side + 0.18f);
                Paint(basePlate, LitMat(TILE_BASE));

                // 본체 — 클릭 판정 콜라이더 포함
                var tile = GameObject.CreatePrimitive(PrimitiveType.Cube);
                tile.name = $"Tile{i}";
                tile.transform.SetParent(staticRoot, false);
                tile.transform.position = W(p.X, p.Y, 0.26f);
                tile.transform.localScale = new Vector3(side, 0.22f, side);
                tile.AddComponent<TileMarker>().Index = i;
                tiles[i] = tile;
                PaintTile(i, false);
            }
        }

        void PaintTile(int index, bool occupied)
        {
            bool isAltar = index == HeroData.ALTAR_SLOT;
            var color = isAltar ? ALTAR : occupied ? TILE_TOWER : TILE_EMPTY;
            Paint(tiles[index], isAltar ? GlowMat(ALTAR_EDGE, 0.25f, ALTAR) : LitMat(color));
        }

        void MakePathLine(string name, float width, Color color, float h)
        {
            var go = new GameObject(name);
            go.transform.SetParent(staticRoot, false);
            go.transform.rotation = Quaternion.Euler(90f, 0f, 0f);
            var line = go.AddComponent<LineRenderer>();
            line.useWorldSpace = true;
            line.material = TransMat(color);
            line.startWidth = width;
            line.endWidth = width;
            line.positionCount = MapData.WAYPOINTS.Length;
            line.alignment = LineAlignment.TransformZ;
            for (int i = 0; i < MapData.WAYPOINTS.Length; i++)
            {
                var p = MapData.WAYPOINTS[i];
                line.SetPosition(i, W(p.X, p.Y, h));
            }
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
                }
            }
        }

        GameObject BuildTowerBody(Slot slot, Tower tower)
        {
            bool isGod = tower.Tier == Units.GOD_TIER;
            var raceColor = Hex(Units.RACE_COLOR[(int)tower.Def.Race]);

            var body = GameObject.CreatePrimitive(PrimitiveType.Cube);
            body.name = $"Tower {tower.Def.Name}";
            Destroy(body.GetComponent<Collider>()); // 클릭은 타일 콜라이더가 받는다
            body.transform.SetParent(dynamicRoot, false);

            float size = (isGod ? 22f : 14f + 3f * tower.Tier) * SCALE;
            float height = isGod ? 3.6f : 1.2f + 0.55f * tower.Tier;
            body.transform.position = W(slot.X, slot.Y, 0.37f + height / 2f);

            // 티어가 오를수록 은은하게, GOD은 강하게 발광
            float glow = isGod ? 1.8f : 0.12f * tower.Tier;
            var mat = glow > 0f
                ? GlowMat(isGod ? Color.Lerp(raceColor, GOLD, 0.45f) : raceColor, glow,
                    isGod ? Color.Lerp(raceColor, GOLD, 0.3f) : raceColor)
                : LitMat(raceColor);
            Paint(body, mat);

            // 티어 라벨 — 웹의 render.ts:93 복원. GOD은 골드 'G'
            MakeWorldLabel(body.transform, isGod ? "G" : (tower.Tier + 1).ToString(),
                isGod ? GOLD : Color.white, isGod ? 0.10f : 0.07f,
                new Vector3(0f, 0.75f, 0f));

            if (isGod)
            {
                var halo = new GameObject("GodLight").AddComponent<Light>();
                halo.transform.SetParent(body.transform, false);
                halo.type = LightType.Point;
                halo.color = Color.Lerp(raceColor, GOLD, 0.5f);
                halo.range = 8f;
                halo.intensity = 2.0f;
            }

            var pop = body.AddComponent<PopScale>();
            pop.Target = new Vector3(size, height, size);
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
                var p = MapData.PathPosOffset(enemy.Distance, enemy.Lane * Balance.MOB_LANE_OFFSET);
                float h = enemy.Kind == EnemyKind.Boss ? enemy.Radius * 2f * SCALE : enemy.Radius * SCALE;
                body.Go.transform.position = W(p.X, p.Y, 0.4f + h);

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
            var go = GameObject.CreatePrimitive(boss ? PrimitiveType.Capsule : PrimitiveType.Sphere);
            go.name = enemy.Name;
            go.AddComponent<EnemyMarker>().Enemy = enemy;
            Destroy(go.GetComponent<Collider>());
            go.transform.SetParent(dynamicRoot, false);
            float d = enemy.Radius * 2f * SCALE; // 캡슐은 세로 2d — 보스가 우뚝 선다
            if (boss)
            {
                var menace = new GameObject("BossLight").AddComponent<Light>();
                menace.transform.SetParent(go.transform, false);
                menace.type = LightType.Point;
                menace.color = BOSS;
                menace.range = 9f;
                menace.intensity = 1.8f;
            }
            var mobColor = enemy.Spec.TypeColor != null ? Hex(enemy.Spec.TypeColor) : MOB;
            var mat = boss ? GlowMat(BOSS, 1.3f)
                : enemy.Spec.TypeColor != null ? GlowMat(mobColor, 0.5f)   // 사냥꾼 — 붉은 발광
                : LitMat(mobColor);
            Paint(go, mat);

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
                heroObject = GameObject.CreatePrimitive(PrimitiveType.Sphere);
                heroObject.name = "Hero";
                // 콜라이더를 남긴다 — 좌클릭으로 영웅을 선택하기 위해서다
                heroObject.AddComponent<HeroMarker>();
                heroObject.transform.SetParent(dynamicRoot, false);
                float d = HeroData.HERO_RADIUS * 2f * SCALE;
                heroObject.transform.localScale = new Vector3(d, d, d);
                Paint(heroObject, GlowMat(HERO, 1.1f));

                // 영웅 전용 보라 포인트 라이트 — 색·발광으로 구분
                var glow = new GameObject("HeroLight").AddComponent<Light>();
                glow.transform.SetParent(heroObject.transform, false);
                glow.type = LightType.Point;
                glow.color = HERO;
                glow.range = 7f;
                glow.intensity = 1.4f;
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
            if (alive)
                heroObject.transform.position = W(hero.X, hero.Y, 0.4f + HeroData.HERO_RADIUS * SCALE);

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
            mat = new Material(standardShader) { color = color };
            mat.SetFloat("_Metallic", 0.15f);
            mat.SetFloat("_Glossiness", 0.45f);
            litMats[color] = mat;
            return mat;
        }

        /// <summary>발광 머티리얼 — emission 색을 별도로 줄 수 있다 (기본은 본색)</summary>
        public Material GlowMat(Color color, float intensity, Color? baseColor = null)
        {
            var key = (color, intensity);
            if (glowMats.TryGetValue(key, out var mat)) return mat;
            mat = new Material(standardShader) { color = baseColor ?? color };
            mat.SetFloat("_Metallic", 0.2f);
            mat.SetFloat("_Glossiness", 0.5f);
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
