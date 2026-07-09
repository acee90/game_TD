// 원본: web/src/render/render.ts + web/src/main.ts (캔버스 렌더·입력)
// ───────── Unity 뷰 ─────────
// 에셋 없이 GameObject.CreatePrimitive만으로 그린다.
// 큐브 = 타일/타워, 스피어 = 몹/영웅, 캡슐 = 보스. 카메라는 오소그래픽 탑다운.
//
// 좌표계: 웹 캔버스(px, y 아래로) → Unity XZ 평면. x = px·S, z = -py·S.

using System.Collections.Generic;
using GodTD.Core;
using UnityEngine;

namespace GodTD.View
{
    /// <summary>타일 클릭 판정용 — 슬롯 인덱스만 들고 있다</summary>
    public sealed class TileMarker : MonoBehaviour
    {
        public int Index;
    }

    public sealed class GameView : MonoBehaviour
    {
        /// <summary>웹 px → 월드 유닛</summary>
        public const float SCALE = 0.1f;

        public Game Game { get; private set; }
        public GameHud Hud { get; set; }

        Camera cam;
        Transform staticRoot;
        Transform dynamicRoot;

        GameObject[] tiles;
        GameObject[] towerObjects;
        UnitDef[] towerDefs;   // 캐시 — def/tier가 바뀌면 다시 만든다
        int[] towerTiers;

        readonly Dictionary<Enemy, GameObject> enemyObjects = new Dictionary<Enemy, GameObject>();
        readonly List<Enemy> enemyRemoveBuffer = new List<Enemy>();
        GameObject heroObject;
        GameObject decoyObject;

        readonly List<LineRenderer> shotLines = new List<LineRenderer>();
        readonly List<GameObject> splashDiscs = new List<GameObject>();
        LineRenderer selectionRing;
        LineRenderer heroRing;

        readonly Dictionary<Color, Material> materials = new Dictionary<Color, Material>();
        Shader spriteShader;

        // ── 색상 (웹 원본 render.ts와 동일) ──
        static readonly Color BG = Hex("#0e1220");
        static readonly Color PATH_OUTER = Hex("#333c66");
        static readonly Color PATH_INNER = Hex("#171d33");
        static readonly Color CROSS_FILL = Hex("#1a2036");
        static readonly Color TILE_EMPTY = Hex("#141a2c");
        static readonly Color TILE_TOWER = Hex("#232a44");
        static readonly Color ALTAR = Hex("#2a2140");
        static readonly Color ALTAR_EDGE = Hex("#b08cff");
        static readonly Color DOOR_IN_COLOR = Hex("#8a6fd0");
        static readonly Color DOOR_OUT_COLOR = Hex("#ff5a3c");
        static readonly Color MOB = Hex("#9aa2c0");
        static readonly Color BOSS = Hex("#ff5a3c");
        static readonly Color HERO = Hex("#b08cff");
        static readonly Color DECOY_COLOR = Hex("#ff8a3c");
        static readonly Color GOLD = Hex("#ffd23f");

        public static Color Hex(string hex)
        {
            return ColorUtility.TryParseHtmlString(hex, out var c) ? c : Color.magenta;
        }

        /// <summary>웹 px 좌표 → 월드 좌표 (h = 높이)</summary>
        public static Vector3 W(float px, float py, float h = 0f) =>
            new Vector3(px * SCALE, h, -py * SCALE);

        void Awake()
        {
            spriteShader = Shader.Find("Sprites/Default");
            Game = new Game();
            BuildCamera();
            BuildStaticScene();
            dynamicRoot = new GameObject("Dynamic").transform;
            dynamicRoot.SetParent(transform, false);
        }

        /// <summary>게임오버 후 재시작 — 동적 오브젝트를 모두 버리고 새 판을 만든다</summary>
        public void Restart()
        {
            Game = new Game();
            foreach (var pair in enemyObjects) Destroy(pair.Value);
            enemyObjects.Clear();
            for (int i = 0; i < towerObjects.Length; i++)
            {
                if (towerObjects[i] != null) Destroy(towerObjects[i]);
                towerObjects[i] = null;
                towerDefs[i] = null;
                towerTiers[i] = -1;
                Paint(tiles[i], i == HeroData.ALTAR_SLOT ? ALTAR : TILE_EMPTY);
            }
            if (decoyObject != null) { Destroy(decoyObject); decoyObject = null; }
        }

        void Update()
        {
            HandleInput();
            float dt = Mathf.Min(Time.deltaTime, 0.05f);
            Game.Update(dt);
            SyncDynamic();
        }

        // ───────── 입력 ─────────
        void HandleInput()
        {
            var game = Game;
            if (Input.GetKeyDown(KeyCode.P)) game.SpawnUnitAnywhere();
            if (Input.GetKeyDown(KeyCode.B)) game.SummonBoss();
            if (Input.GetKeyDown(KeyCode.R)) game.BuyProbe();
            if (Input.GetKeyDown(KeyCode.X)) game.SellSelected();
            if (Input.GetKeyDown(KeyCode.U)) game.UpgradeHero();
            if (Input.GetKeyDown(KeyCode.Alpha1)) game.Upgrade(Race.Terran);
            if (Input.GetKeyDown(KeyCode.Alpha2)) game.Upgrade(Race.Zerg);
            if (Input.GetKeyDown(KeyCode.Alpha3)) game.Upgrade(Race.Protoss);
            if (Input.GetKeyDown(KeyCode.Alpha4)) game.Upgrade(Race.Creature);

            if (!Input.GetMouseButtonDown(0)) return;
            if (game.Over || game.Paused) return; // 오버레이가 떠 있으면 월드 클릭 무시
            if (Hud != null && Hud.IsPointerOverHud(Input.mousePosition)) return;

            var ray = cam.ScreenPointToRay(Input.mousePosition);
            if (!Physics.Raycast(ray, out var hit, 500f)) return;

            // 타일 클릭 = 유닛 생성/선택 (제단은 영웅 이동)
            var marker = hit.collider.GetComponentInParent<TileMarker>();
            if (marker != null)
            {
                var slot = game.Slots[marker.Index];
                if (slot == game.AltarSlot)
                {
                    game.MoveHero(slot.X, slot.Y);
                    return;
                }
                if (slot.Tower != null) game.Selected = slot;
                else game.SpawnUnit(slot);
                return;
            }

            // 빈 곳 클릭 = 영웅 이동 (경로 위 스냅)
            float px = hit.point.x / SCALE;
            float py = -hit.point.z / SCALE;
            game.Selected = null;
            game.MoveHero(px, py);
        }

        // ───────── 카메라 ─────────
        void BuildCamera()
        {
            cam = Camera.main;
            if (cam == null)
            {
                var go = new GameObject("Main Camera");
                go.tag = "MainCamera";
                cam = go.AddComponent<Camera>();
            }
            cam.orthographic = true;
            cam.orthographicSize = 28f;
            cam.transform.position = W(MapData.CENTER.X, MapData.CENTER.Y, 60f);
            cam.transform.rotation = Quaternion.Euler(90f, 0f, 0f);
            cam.clearFlags = CameraClearFlags.SolidColor;
            cam.backgroundColor = BG;
            cam.nearClipPlane = 1f;
            cam.farClipPlane = 200f;
        }

        // ───────── 정적 씬 (경로 · 십자 · 타일 · 문 · 바닥) ─────────
        void BuildStaticScene()
        {
            staticRoot = new GameObject("Static").transform;
            staticRoot.SetParent(transform, false);

            // 바닥 — 빈 곳 클릭(영웅 이동)의 레이캐스트 판. 배경색과 같아 눈에 띄지 않는다.
            var ground = GameObject.CreatePrimitive(PrimitiveType.Cube);
            ground.name = "Ground";
            ground.transform.SetParent(staticRoot, false);
            ground.transform.position = W(MapData.CENTER.X, MapData.CENTER.Y, -0.6f);
            ground.transform.localScale = new Vector3(200f, 1f, 200f);
            Paint(ground, BG);

            // 경로 — 굵은 선 두 겹 (외곽선 + 안쪽)
            MakePathLine("PathOuter", (24f + 4f) * SCALE, PATH_OUTER, 0.01f);
            MakePathLine("PathInner", 24f * SCALE, PATH_INNER, 0.02f);

            // 십자 지형
            foreach (var bar in MapData.CROSS_BARS)
            {
                var cube = GameObject.CreatePrimitive(PrimitiveType.Cube);
                cube.name = "CrossBar";
                Destroy(cube.GetComponent<Collider>());
                cube.transform.SetParent(staticRoot, false);
                cube.transform.position = W(bar.X + bar.W / 2f, bar.Y + bar.H / 2f, 0.03f);
                cube.transform.localScale = new Vector3(bar.W * SCALE, 0.05f, bar.H * SCALE);
                Paint(cube, CROSS_FILL);
            }

            // 문 (입구 보라 / 출구 빨강)
            MakeDoor(MapData.DOOR_IN, DOOR_IN_COLOR);
            MakeDoor(MapData.DOOR_OUT, DOOR_OUT_COLOR);

            // 타일 41개 — 클릭 판정용 콜라이더 포함
            int count = MapData.SLOT_POS.Length;
            tiles = new GameObject[count];
            towerObjects = new GameObject[count];
            towerDefs = new UnitDef[count];
            towerTiers = new int[count];
            for (int i = 0; i < count; i++)
            {
                towerTiers[i] = -1;
                var p = MapData.SLOT_POS[i];
                var tile = GameObject.CreatePrimitive(PrimitiveType.Cube);
                tile.name = $"Tile{i}";
                tile.transform.SetParent(staticRoot, false);
                tile.transform.position = W(p.X, p.Y, 0.1f);
                float side = (MapData.TILE - 4f) * SCALE;
                tile.transform.localScale = new Vector3(side, 0.12f, side);
                bool isAltar = i == HeroData.ALTAR_SLOT;
                Paint(tile, isAltar ? ALTAR : TILE_EMPTY);
                tile.AddComponent<TileMarker>().Index = i;
                tiles[i] = tile;
            }

            // 제단 테두리 — 보라 링
            var altarRing = MakeRing("AltarRing", staticRoot, ALTAR_EDGE, 0.06f);
            SetCirclePoints(altarRing, MapData.SLOT_POS[0].X, MapData.SLOT_POS[0].Y, MapData.TILE / 2f, 0.25f);

            // 선택 링 · 영웅 사거리 링 (매 프레임 갱신)
            selectionRing = MakeRing("SelectionRing", staticRoot, new Color(1f, 0.82f, 0.25f, 0.28f), 0.05f);
            heroRing = MakeRing("HeroRangeRing", staticRoot, new Color(0.69f, 0.55f, 1f, 0.14f), 0.05f);
        }

        void MakePathLine(string name, float width, Color color, float h)
        {
            var go = new GameObject(name);
            go.transform.SetParent(staticRoot, false);
            var line = go.AddComponent<LineRenderer>();
            line.useWorldSpace = true;
            line.material = MatFor(color);
            line.startWidth = width;
            line.endWidth = width;
            line.positionCount = MapData.WAYPOINTS.Length;
            line.alignment = LineAlignment.TransformZ;
            go.transform.rotation = Quaternion.Euler(90f, 0f, 0f);
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
            cube.transform.position = W(at.X, at.Y + 6f, 0.15f);
            cube.transform.localScale = new Vector3(24f * SCALE, 0.1f, 0.5f);
            Paint(cube, color);
        }

        LineRenderer MakeRing(string name, Transform parent, Color color, float width)
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            go.transform.rotation = Quaternion.Euler(90f, 0f, 0f);
            var line = go.AddComponent<LineRenderer>();
            line.useWorldSpace = true;
            line.material = MatFor(color);
            line.startWidth = width;
            line.endWidth = width;
            line.loop = true;
            line.positionCount = 0;
            line.alignment = LineAlignment.TransformZ;
            return line;
        }

        static void SetCirclePoints(LineRenderer line, float px, float py, float radiusPx, float h)
        {
            const int SEGMENTS = 40;
            line.positionCount = SEGMENTS;
            for (int i = 0; i < SEGMENTS; i++)
            {
                float a = i / (float)SEGMENTS * Mathf.PI * 2f;
                line.SetPosition(i, W(px + Mathf.Cos(a) * radiusPx, py + Mathf.Sin(a) * radiusPx, h));
            }
        }

        // ───────── 매 프레임 동기화 ─────────
        void SyncDynamic()
        {
            SyncTowers();
            SyncEnemies();
            SyncHero();
            SyncDecoy();
            SyncShots();
            SyncRings();
        }

        void SyncTowers()
        {
            for (int i = 0; i < Game.Slots.Count; i++)
            {
                var tower = Game.Slots[i].Tower;
                if (tower == null)
                {
                    if (towerObjects[i] != null)
                    {
                        Destroy(towerObjects[i]);
                        towerObjects[i] = null;
                        towerDefs[i] = null;
                        towerTiers[i] = -1;
                        Paint(tiles[i], i == HeroData.ALTAR_SLOT ? ALTAR : TILE_EMPTY);
                    }
                    continue;
                }
                if (towerObjects[i] != null && towerDefs[i] == tower.Def && towerTiers[i] == tower.Tier)
                    continue;

                if (towerObjects[i] != null) Destroy(towerObjects[i]);
                bool isGod = tower.Tier == Units.GOD_TIER;
                var cube = GameObject.CreatePrimitive(PrimitiveType.Cube);
                cube.name = $"Tower {tower.Def.Name}";
                Destroy(cube.GetComponent<Collider>()); // 클릭은 타일 콜라이더가 받는다
                cube.transform.SetParent(dynamicRoot, false);
                var slot = Game.Slots[i];
                float size = (isGod ? 24f : 14f + 4f * tower.Tier) * SCALE;
                float height = (isGod ? 3.2f : 1.2f + 0.5f * tower.Tier);
                cube.transform.position = W(slot.X, slot.Y, 0.2f + height / 2f);
                cube.transform.localScale = new Vector3(size, height, size);
                Paint(cube, isGod ? Color.Lerp(Hex(Units.RACE_COLOR[(int)tower.Def.Race]), GOLD, 0.35f)
                    : Hex(Units.RACE_COLOR[(int)tower.Def.Race]));
                towerObjects[i] = cube;
                towerDefs[i] = tower.Def;
                towerTiers[i] = tower.Tier;
                Paint(tiles[i], TILE_TOWER);
            }
        }

        void SyncEnemies()
        {
            foreach (var enemy in Game.Enemies)
            {
                if (!enemyObjects.TryGetValue(enemy, out var go))
                {
                    bool boss = enemy.Kind == EnemyKind.Boss;
                    go = GameObject.CreatePrimitive(boss ? PrimitiveType.Capsule : PrimitiveType.Sphere);
                    go.name = enemy.Name;
                    Destroy(go.GetComponent<Collider>());
                    go.transform.SetParent(dynamicRoot, false);
                    float d = enemy.Radius * 2f * SCALE;
                    go.transform.localScale = new Vector3(d, d, d); // 캡슐은 세로 2d — 보스가 우뚝 선다
                    Paint(go, boss ? BOSS : MOB);
                    enemyObjects[enemy] = go;
                }
                var p = MapData.PathPos(enemy.Distance);
                float h = enemy.Kind == EnemyKind.Boss ? enemy.Radius * 2f * SCALE : enemy.Radius * SCALE;
                go.transform.position = W(p.X, p.Y, 0.3f + h);
            }

            // 죽거나 돌파한 적 정리
            enemyRemoveBuffer.Clear();
            foreach (var pair in enemyObjects)
                if (!Game.Enemies.Contains(pair.Key)) enemyRemoveBuffer.Add(pair.Key);
            foreach (var enemy in enemyRemoveBuffer)
            {
                Destroy(enemyObjects[enemy]);
                enemyObjects.Remove(enemy);
            }
        }

        void SyncHero()
        {
            if (heroObject == null)
            {
                heroObject = GameObject.CreatePrimitive(PrimitiveType.Sphere);
                heroObject.name = "Hero";
                Destroy(heroObject.GetComponent<Collider>());
                heroObject.transform.SetParent(dynamicRoot, false);
                float d = HeroData.HERO_RADIUS * 2f * SCALE;
                heroObject.transform.localScale = new Vector3(d, d, d);
                Paint(heroObject, HERO);
            }
            var hero = Game.Hero;
            heroObject.SetActive(hero.Alive);
            if (hero.Alive)
                heroObject.transform.position = W(hero.X, hero.Y, 0.3f + HeroData.HERO_RADIUS * SCALE);
        }

        void SyncDecoy()
        {
            var decoy = Game.Decoy;
            if (decoy == null)
            {
                if (decoyObject != null) { Destroy(decoyObject); decoyObject = null; }
                return;
            }
            if (decoyObject == null)
            {
                decoyObject = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
                decoyObject.name = "Decoy";
                Destroy(decoyObject.GetComponent<Collider>());
                decoyObject.transform.SetParent(dynamicRoot, false);
                float d = Skills.DECOY_RADIUS * 2f * SCALE;
                decoyObject.transform.localScale = new Vector3(d, 0.9f, d);
                Paint(decoyObject, decoy.Taunts ? Color.Lerp(DECOY_COLOR, GOLD, 0.4f) : DECOY_COLOR);
            }
            var p = MapData.PathPos(decoy.Distance);
            decoyObject.transform.position = W(p.X, p.Y, 0.3f + 0.9f);
        }

        void SyncShots()
        {
            var shots = Game.Shots;
            while (shotLines.Count < shots.Count && shotLines.Count < 96)
            {
                var go = new GameObject("Shot");
                go.transform.SetParent(dynamicRoot, false);
                go.transform.rotation = Quaternion.Euler(90f, 0f, 0f);
                var line = go.AddComponent<LineRenderer>();
                line.useWorldSpace = true;
                line.startWidth = 0.18f;
                line.endWidth = 0.18f;
                line.positionCount = 2;
                line.alignment = LineAlignment.TransformZ;
                shotLines.Add(line);
            }
            while (splashDiscs.Count < shots.Count && splashDiscs.Count < 96)
            {
                var disc = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
                disc.name = "Splash";
                Destroy(disc.GetComponent<Collider>());
                disc.transform.SetParent(dynamicRoot, false);
                splashDiscs.Add(disc);
            }

            for (int i = 0; i < shotLines.Count; i++)
            {
                bool active = i < shots.Count;
                shotLines[i].gameObject.SetActive(active);
                splashDiscs[i].SetActive(active && shots[i].SplashRadius > 0f);
                if (!active) continue;

                var shot = shots[i];
                var color = Hex(shot.Color);
                var line = shotLines[i];
                line.material = MatFor(color);
                line.SetPosition(0, W(shot.X, shot.Y, 1.6f));
                line.SetPosition(1, W(shot.Tx, shot.Ty, 1.6f));

                if (shot.SplashRadius > 0f)
                {
                    // 웹 원본과 같은 반투명 원 (splashRadius * 0.28)
                    float r = shot.SplashRadius * 0.28f * SCALE * 2f;
                    var disc = splashDiscs[i];
                    disc.transform.position = W(shot.Tx, shot.Ty, 0.25f);
                    disc.transform.localScale = new Vector3(r, 0.02f, r);
                    Paint(disc, new Color(color.r, color.g, color.b, 0.2f));
                }
            }
        }

        void SyncRings()
        {
            var selected = Game.Selected;
            if (selected?.Tower != null)
            {
                SetCirclePoints(selectionRing, selected.X, selected.Y, Combat.Range(selected.Tower), 0.28f);
            }
            else
            {
                selectionRing.positionCount = 0;
            }

            var hero = Game.Hero;
            if (hero.Alive)
                SetCirclePoints(heroRing, hero.X, hero.Y, hero.Stats.Range, 0.26f);
            else
                heroRing.positionCount = 0;
        }

        // ───────── 재질 ─────────
        /// <summary>sharedMaterial을 건드리지 않도록 색마다 전용 Material을 만들어 캐시한다</summary>
        public Material MatFor(Color color)
        {
            if (materials.TryGetValue(color, out var mat)) return mat;
            mat = new Material(spriteShader) { color = color };
            materials[color] = mat;
            return mat;
        }

        void Paint(GameObject go, Color color)
        {
            go.GetComponent<MeshRenderer>().sharedMaterial = MatFor(color);
        }
    }
}
