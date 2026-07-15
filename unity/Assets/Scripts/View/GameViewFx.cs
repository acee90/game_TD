// 원본: web/src/render/render.ts (플로팅 텍스트·탄환·HP바) — 프레젠테이션 패스에서 분리
// ───────── 연출 전용 층 ─────────
// 파티클 버스트 · 투사체 비행(+트레일) · 확장 펄스/링 · TextMesh 플로팅 텍스트 ·
// 월드 스페이스 HP바. 전부 코드 생성, 에셋 0.
//
// Core의 판정은 즉발 그대로다 — Shot의 (x,y)→(tx,ty)를 뷰에서만 보간해 "날아가는" 연출을 얹는다.

using System.Collections.Generic;
using GodTD.Core;
using UnityEngine;

namespace GodTD.View
{
    /// <summary>스폰 스케일 팝 — 0에서 목표 크기로 오버슈트 이징</summary>
    public sealed class PopScale : MonoBehaviour
    {
        public Vector3 Target = Vector3.one;
        public float Duration = 0.22f;
        float t;

        void Awake()
        {
            // Start는 다음 프레임이라 한 프레임 원래 크기로 번쩍인다 — Awake는 AddComponent 즉시 돈다
            transform.localScale = Vector3.zero;
        }

        void Update()
        {
            t += Time.deltaTime;
            float k = Mathf.Clamp01(t / Duration);
            // ease-out-back — 살짝 튀었다가 정착
            float c1 = 1.70158f;
            float c3 = c1 + 1f;
            float e = 1f + c3 * Mathf.Pow(k - 1f, 3f) + c1 * Mathf.Pow(k - 1f, 2f);
            transform.localScale = Target * Mathf.Max(0f, e);
            if (k >= 1f)
            {
                transform.localScale = Target;
                enabled = false;
            }
        }
    }

    public sealed class GameViewFx : MonoBehaviour
    {
        const float SCALE = 0.1f;          // GameView.SCALE과 동일 (독립 컴파일을 위해 복제)
        const float PROJECTILE_SPEED = 26f; // 월드 유닛/초 — 비행 연출용, 판정과 무관
        const float TEXT_HEIGHT = 2.3f;

        GameView view;
        Camera cam;
        Transform root;

        // ── 파티클 ──
        ParticleSystem burstPs;

        // ── 투사체 풀 ──
        sealed class Projectile
        {
            public GameObject Go;
            public TrailRenderer Trail;
            public MeshRenderer Renderer;
            public Vector3 From;
            public Vector3 To;
            public float T;
            public float Duration;
            public Color Color;
            public float SplashRadiusPx;
            public bool Active;
        }

        readonly List<Projectile> projectiles = new List<Projectile>();
        readonly HashSet<Shot> seenShots = new HashSet<Shot>();

        // ── 펄스(확장 원반) · 링(확장 원) 풀 ──
        sealed class PulseFx
        {
            public GameObject Go;
            public float T;
            public float Duration;
            public float Radius;
            public bool Active;
        }

        sealed class RingFx
        {
            public LineRenderer Line;
            public Vector3 Center;
            public float T;
            public float Duration;
            public float Radius;
            public bool Active;
        }

        readonly List<PulseFx> pulses = new List<PulseFx>();
        readonly List<RingFx> rings = new List<RingFx>();

        // ── 플로팅 텍스트 ──
        readonly Dictionary<FloatText, TextMesh> floatTexts = new Dictionary<FloatText, TextMesh>();
        readonly List<FloatText> floatRemoveBuffer = new List<FloatText>();

        // ── 월드 HP바 ──
        sealed class WorldBar
        {
            public GameObject Root;
            public Transform Fill;
            public float Width;
        }

        readonly Dictionary<Enemy, WorldBar> enemyBars = new Dictionary<Enemy, WorldBar>();
        readonly List<Enemy> barRemoveBuffer = new List<Enemy>();
        WorldBar heroBar;
        WorldBar decoyBar;

        readonly Dictionary<Color, Material> unlitMats = new Dictionary<Color, Material>();
        Shader spriteShader;
        static Font sharedFont;

        static readonly Color BAR_BG = new Color(0.03f, 0.04f, 0.08f, 0.9f);
        static readonly Color BAR_HP = new Color(0.44f, 0.86f, 0.55f);
        static readonly Color BAR_HERO = new Color(0.69f, 0.55f, 1f);
        static readonly Color BAR_DECOY = new Color(1f, 0.54f, 0.24f);

        public void Init(GameView owner)
        {
            view = owner;
            spriteShader = Shader.Find("Sprites/Default");
            root = new GameObject("Fx").transform;
            root.SetParent(transform, false);
            BuildBurstSystem();
        }

        /// <summary>재시작 — 판에 매인 연출 상태를 전부 비운다</summary>
        public void OnRestart()
        {
            seenShots.Clear();
            foreach (var p in projectiles) Deactivate(p);
            foreach (var p in pulses) { p.Active = false; p.Go.SetActive(false); }
            foreach (var r in rings) { r.Active = false; r.Line.gameObject.SetActive(false); }
            foreach (var pair in floatTexts) Destroy(pair.Value.gameObject);
            floatTexts.Clear();
            foreach (var pair in enemyBars) Destroy(pair.Value.Root);
            enemyBars.Clear();
            if (decoyBar != null) { Destroy(decoyBar.Root); decoyBar = null; }
        }

        /// <summary>GameView.Update 끝에서 호출 — 연출 전체 동기화</summary>
        public void Sync(float dt)
        {
            if (cam == null) cam = Camera.main;
            if (cam == null || view == null) return;
            var game = view.Game;

            SyncProjectiles(game, dt);
            SyncFloats(game);
            SyncBars(game);
            TickPulses(dt);
            TickRings(dt);
        }

        // ───────── 파티클 버스트 ─────────
        void BuildBurstSystem()
        {
            var go = new GameObject("BurstPS");
            go.transform.SetParent(root, false);
            burstPs = go.AddComponent<ParticleSystem>();
            var main = burstPs.main;
            main.simulationSpace = ParticleSystemSimulationSpace.World;
            main.startSpeed = 0f;
            main.startSize = 0.2f;
            main.startLifetime = 0.5f;
            main.gravityModifier = 0.25f; // 가산 스파크는 떠오르듯 — 파편 중력감 제거
            main.maxParticles = 2000;
            var emission = burstPs.emission;
            emission.enabled = false; // Emit()로만 뿜는다
            var shape = burstPs.shape;
            shape.enabled = false;
            // 스크립트로 만든 파티클 시스템은 머티리얼이 비어 마젠타가 된다 — 언리트로 채운다
            var psr = go.GetComponent<ParticleSystemRenderer>();
            if (psr != null) psr.sharedMaterial = AdditiveSparkMat();
            burstPs.Play();
        }

        /// <summary>사방으로 튀는 짧은 버스트 — 사망·조합·레벨업 등</summary>
        public void Burst(Vector3 at, Color color, int count, float speed, float size)
        {
            for (int i = 0; i < count; i++)
            {
                var dir = Random.insideUnitSphere;
                dir.y = Mathf.Abs(dir.y) * 0.8f + 0.3f; // 위로 튀는 분수 느낌
                var ep = new ParticleSystem.EmitParams
                {
                    position = at,
                    velocity = dir.normalized * speed * (0.5f + Random.value * 0.9f),
                    startColor = color,
                    startSize = size * (0.6f + Random.value * 0.8f),
                    startLifetime = 0.3f + Random.value * 0.45f,
                };
                burstPs.Emit(ep, 1);
            }
        }

        // ───────── 펄스 (바닥에 퍼지는 원반) ─────────
        /// <summary>radius = 월드 유닛. 광역 타격·보스 폭발의 바닥 파문.</summary>
        public void Pulse(Vector3 at, Color color, float radius)
        {
            var fx = pulses.Find(p => !p.Active);
            if (fx == null)
            {
                if (pulses.Count >= 48) return;
                var disc = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
                disc.name = "Pulse";
                Destroy(disc.GetComponent<Collider>());
                disc.transform.SetParent(root, false);
                fx = new PulseFx { Go = disc };
                pulses.Add(fx);
            }
            fx.Go.SetActive(true);
            fx.Go.GetComponent<MeshRenderer>().sharedMaterial =
                UnlitMat(new Color(color.r, color.g, color.b, 0.26f));
            fx.Go.transform.position = new Vector3(at.x, 0.32f, at.z);
            fx.Go.transform.localScale = new Vector3(0.3f, 0.02f, 0.3f);
            fx.T = 0f;
            fx.Duration = 0.3f;
            fx.Radius = radius;
            fx.Active = true;
        }

        void TickPulses(float dt)
        {
            foreach (var p in pulses)
            {
                if (!p.Active) continue;
                p.T += dt;
                float k = Mathf.Clamp01(p.T / p.Duration);
                float d = Mathf.SmoothStep(0.3f, p.Radius * 2f, k);
                p.Go.transform.localScale = new Vector3(d, 0.02f, d);
                if (k >= 1f)
                {
                    p.Active = false;
                    p.Go.SetActive(false);
                }
            }
        }

        // ───────── 링 (확장 원 — 레벨업·부활) ─────────
        public void Ring(Vector3 at, Color color, float radius)
        {
            var fx = rings.Find(r => !r.Active);
            if (fx == null)
            {
                if (rings.Count >= 16) return;
                var go = new GameObject("RingFx");
                go.transform.SetParent(root, false);
                go.transform.rotation = Quaternion.Euler(90f, 0f, 0f);
                var line = go.AddComponent<LineRenderer>();
                line.useWorldSpace = true;
                line.loop = true;
                line.alignment = LineAlignment.TransformZ;
                fx = new RingFx { Line = line };
                rings.Add(fx);
            }
            fx.Line.gameObject.SetActive(true);
            fx.Line.material = UnlitMat(color);
            fx.Line.startWidth = 0.14f;
            fx.Line.endWidth = 0.14f;
            fx.Center = at;
            fx.T = 0f;
            fx.Duration = 0.5f;
            fx.Radius = radius;
            fx.Active = true;
        }

        void TickRings(float dt)
        {
            foreach (var r in rings)
            {
                if (!r.Active) continue;
                r.T += dt;
                float k = Mathf.Clamp01(r.T / r.Duration);
                WorldCircle(r.Line, r.Center, Mathf.SmoothStep(0.3f, r.Radius, k));
                float w = 0.14f * (1f - k);
                r.Line.startWidth = w;
                r.Line.endWidth = w;
                if (k >= 1f)
                {
                    r.Active = false;
                    r.Line.gameObject.SetActive(false);
                }
            }
        }

        static void WorldCircle(LineRenderer line, Vector3 center, float radius)
        {
            const int SEGMENTS = 40;
            line.positionCount = SEGMENTS;
            for (int i = 0; i < SEGMENTS; i++)
            {
                float a = i / (float)SEGMENTS * Mathf.PI * 2f;
                line.SetPosition(i, center + new Vector3(Mathf.Cos(a) * radius, 0f, Mathf.Sin(a) * radius));
            }
        }

        // ───────── 투사체 — Core 즉발 판정 위에 비행 연출만 ─────────
        void SyncProjectiles(Game game, float dt)
        {
            // 새 Shot 감지 → 투사체 발사 (제자리 광역은 펄스만)
            foreach (var shot in game.Shots)
            {
                if (!seenShots.Add(shot)) continue;
                var color = GameView.Hex(shot.Color);
                var from = GameView.W(shot.X, shot.Y, 1.5f);
                var to = GameView.W(shot.Tx, shot.Ty, 0.9f);

                if ((from - to).magnitude < 0.05f)
                {
                    // 소용돌이·유성·폭발 화살 — 그 자리 파문
                    if (shot.SplashRadius > 0f)
                    {
                        Pulse(to, color, shot.SplashRadius * SCALE * 0.6f);
                        Burst(to, color, 8, 2.6f, 0.14f);
                    }
                    continue;
                }
                Launch(from, to, color, shot.SplashRadius);
            }
            seenShots.IntersectWith(game.Shots); // Core가 지운 샷은 잊는다

            // 비행
            foreach (var p in projectiles)
            {
                if (!p.Active) continue;
                p.T += dt;
                float k = Mathf.Clamp01(p.T / p.Duration);
                p.Go.transform.position = Vector3.Lerp(p.From, p.To, k);
                if (k >= 1f)
                {
                    var hot = Color.Lerp(p.Color, Color.white, 0.35f);
                    if (p.SplashRadiusPx > 0f)
                    {
                        Pulse(p.To, p.Color, p.SplashRadiusPx * SCALE * 0.5f);
                        Burst(p.To, hot, 12, 2.8f, 0.13f);
                    }
                    else
                    {
                        // 단일 타격도 작은 불꽃 — 명중이 '느껴지게'
                        Burst(p.To, hot, 5, 2.2f, 0.1f);
                    }
                    Deactivate(p);
                }
            }
        }

        void Launch(Vector3 from, Vector3 to, Color color, float splashRadiusPx)
        {
            var p = projectiles.Find(x => !x.Active);
            if (p == null)
            {
                if (projectiles.Count >= 96) return;
                var orb = GameObject.CreatePrimitive(PrimitiveType.Sphere);
                orb.name = "Projectile";
                Destroy(orb.GetComponent<Collider>());
                orb.transform.SetParent(root, false);
                orb.transform.localScale = new Vector3(0.24f, 0.24f, 0.24f);
                var trail = orb.AddComponent<TrailRenderer>();
                trail.time = 0.18f;
                trail.startWidth = 0.22f;
                trail.endWidth = 0f;
                trail.numCapVertices = 2;
                trail.material = AdditiveSolid(Color.white); // 가산 트레일 — 겹칠수록 밝아져 블룸
                p = new Projectile
                {
                    Go = orb,
                    Trail = trail,
                    Renderer = orb.GetComponent<MeshRenderer>(),
                };
                projectiles.Add(p);
            }
            p.Go.SetActive(true);
            p.Go.transform.position = from;
            p.Trail.Clear();
            // 흰-핫 코어로 밝히고(가장자리는 본색), 트레일은 본색으로 꼬리를 남긴다
            var hot = Color.Lerp(color, Color.white, 0.35f);
            p.Trail.startColor = hot;
            p.Trail.endColor = new Color(color.r, color.g, color.b, 0f);
            p.Renderer.sharedMaterial = AdditiveSolid(hot * 1.8f); // HDR → 블룸이 코어를 문다
            p.From = from;
            p.To = to;
            p.T = 0f;
            p.Duration = Mathf.Clamp((to - from).magnitude / PROJECTILE_SPEED, 0.05f, 0.35f);
            p.Color = color;
            p.SplashRadiusPx = splashRadiusPx;
            p.Active = true;

            // 총구 섬광 — 발사가 '터지듯' 시작
            Burst(from, hot, 4, 1.8f, 0.09f);
        }

        void Deactivate(Projectile p)
        {
            p.Active = false;
            p.Trail.Clear();
            p.Go.SetActive(false);
        }

        // ───────── 플로팅 텍스트 (TextMesh 빌보드) ─────────
        void SyncFloats(Game game)
        {
            foreach (var f in game.Floats)
            {
                if (!floatTexts.TryGetValue(f, out var tm))
                {
                    tm = MakeText();
                    tm.text = f.Text;
                    floatTexts[f] = tm;
                }
                var color = GameView.Hex(f.Color);
                color.a = Mathf.Min(1f, f.Life / 0.5f);
                tm.color = color;
                tm.transform.position = GameView.W(f.X, f.Y, TEXT_HEIGHT);
                tm.transform.rotation = cam.transform.rotation; // 빌보드
            }

            floatRemoveBuffer.Clear();
            foreach (var pair in floatTexts)
                if (!game.Floats.Contains(pair.Key)) floatRemoveBuffer.Add(pair.Key);
            foreach (var f in floatRemoveBuffer)
            {
                Destroy(floatTexts[f].gameObject);
                floatTexts.Remove(f);
            }
        }

        TextMesh MakeText()
        {
            var go = new GameObject("FloatText");
            go.transform.SetParent(root, false);
            var tm = go.AddComponent<TextMesh>();
            tm.font = UiFont();
            tm.fontSize = 46;
            tm.characterSize = 0.032f;
            tm.anchor = TextAnchor.MiddleCenter;
            var renderer = go.GetComponent<MeshRenderer>();
            if (tm.font != null) renderer.sharedMaterial = tm.font.material;
            return tm;
        }

        /// <summary>2022.3(Arial)과 Unity 6(LegacyRuntime) 양쪽에서 도는 폰트 확보</summary>
        public static Font UiFont()
        {
            if (sharedFont != null) return sharedFont;
            try { sharedFont = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf"); }
            catch { }
            if (sharedFont == null)
            {
                try { sharedFont = Resources.GetBuiltinResource<Font>("Arial.ttf"); }
                catch { }
            }
            if (sharedFont == null)
                sharedFont = Font.CreateDynamicFontFromOSFont("Helvetica", 16);
            return sharedFont;
        }

        // ───────── 월드 HP바 (쿼드 2장 빌보드) ─────────
        void SyncBars(Game game)
        {
            // 적 — 몹은 가늘게, 보스는 넓게
            foreach (var enemy in game.Enemies)
            {
                if (!enemyBars.TryGetValue(enemy, out var bar))
                {
                    bar = MakeBar(enemy.Kind == EnemyKind.Boss ? 2.8f : 1.5f, BAR_HP);
                    enemyBars[enemy] = bar;
                }
                var p = MapData.PathPos(enemy.Distance);
                float top = enemy.Kind == EnemyKind.Boss
                    ? enemy.Radius * 4f * SCALE + 0.7f
                    : enemy.Radius * 2f * SCALE + 0.6f;
                UpdateBar(bar, GameView.W(p.X, p.Y, 0.4f + top),
                    enemy.MaxHp > 0f ? enemy.Hp / enemy.MaxHp : 0f);
            }
            barRemoveBuffer.Clear();
            foreach (var pair in enemyBars)
                if (!game.Enemies.Contains(pair.Key)) barRemoveBuffer.Add(pair.Key);
            foreach (var enemy in barRemoveBuffer)
            {
                Destroy(enemyBars[enemy].Root);
                enemyBars.Remove(enemy);
            }

            // 영웅
            var hero = game.Hero;
            if (heroBar == null) heroBar = MakeBar(2f, BAR_HERO);
            heroBar.Root.SetActive(hero.Alive);
            if (hero.Alive)
            {
                float ratio = hero.Stats.MaxHp > 0f ? hero.Hp / hero.Stats.MaxHp : 0f;
                UpdateBar(heroBar, GameView.W(hero.X, hero.Y,
                    0.4f + HeroData.HERO_RADIUS * 2f * SCALE + 0.55f), ratio);
            }

            // 허수아비
            var decoy = game.Decoy;
            if (decoy == null)
            {
                if (decoyBar != null) { Destroy(decoyBar.Root); decoyBar = null; }
            }
            else
            {
                if (decoyBar == null) decoyBar = MakeBar(1.6f, BAR_DECOY);
                var p = MapData.PathPos(decoy.Distance);
                UpdateBar(decoyBar, GameView.W(p.X, p.Y, 0.4f + 1.6f),
                    decoy.MaxHp > 0f ? decoy.Hp / decoy.MaxHp : 0f);
            }
        }

        WorldBar MakeBar(float width, Color fillColor)
        {
            var rootGo = new GameObject("Bar");
            rootGo.transform.SetParent(root, false);

            var bg = GameObject.CreatePrimitive(PrimitiveType.Quad);
            Destroy(bg.GetComponent<Collider>());
            bg.transform.SetParent(rootGo.transform, false);
            bg.transform.localScale = new Vector3(width, 0.16f, 1f);
            bg.GetComponent<MeshRenderer>().sharedMaterial = UnlitMat(BAR_BG);

            var fill = GameObject.CreatePrimitive(PrimitiveType.Quad);
            Destroy(fill.GetComponent<Collider>());
            fill.transform.SetParent(rootGo.transform, false);
            fill.transform.localScale = new Vector3(width, 0.12f, 1f);
            fill.GetComponent<MeshRenderer>().sharedMaterial = UnlitMat(fillColor);

            return new WorldBar { Root = rootGo, Fill = fill.transform, Width = width };
        }

        void UpdateBar(WorldBar bar, Vector3 at, float ratio)
        {
            ratio = Mathf.Clamp01(ratio);
            bar.Root.transform.position = at;
            bar.Root.transform.rotation = cam.transform.rotation; // 빌보드
            bar.Fill.localScale = new Vector3(bar.Width * ratio, 0.12f, 1f);
            // 왼쪽 기준으로 줄어들게 + 배경보다 카메라 쪽으로 살짝
            bar.Fill.localPosition = new Vector3(-bar.Width * (1f - ratio) / 2f, 0f, -0.012f);
        }

        // ───────── 머티리얼 ─────────
        /// <summary>언리트(Sprites/Default) — 트레일·바·파문·텍스트 배경용, 색마다 캐시</summary>
        Material UnlitMat(Color color)
        {
            if (unlitMats.TryGetValue(color, out var mat)) return mat;
            mat = new Material(spriteShader) { color = color };
            unlitMats[color] = mat;
            return mat;
        }

        // ── 텍스처 없는 가산 솔리드 — 투사체 코어·트레일용. 색은 HDR(>1) 가능 → 블룸이 문다 ──
        readonly Dictionary<Color, Material> additiveSolidMats = new Dictionary<Color, Material>();

        /// <summary>Sprites/Default를 SrcAlpha/One 가산으로. 텍스처 없이 솔리드 발광 — HDR 색으로 블룸.</summary>
        Material AdditiveSolid(Color color)
        {
            if (additiveSolidMats.TryGetValue(color, out var mat)) return mat;
            mat = new Material(spriteShader) { color = color };
            mat.SetInt("_SrcBlend", (int)UnityEngine.Rendering.BlendMode.SrcAlpha);
            mat.SetInt("_DstBlend", (int)UnityEngine.Rendering.BlendMode.One);
            additiveSolidMats[color] = mat;
            return mat;
        }

        // ── 가산 블렌드 스파크 — 파티클이 '파편'이 아니라 '에너지'로 읽히게 ──
        Material additiveMat;

        /// <summary>Sprites/Default를 SrcAlpha/One으로 강제 + 원형 페이드 텍스처</summary>
        Material AdditiveSparkMat()
        {
            if (additiveMat != null) return additiveMat;
            additiveMat = new Material(spriteShader) { color = Color.white };
            additiveMat.SetInt("_SrcBlend", (int)UnityEngine.Rendering.BlendMode.SrcAlpha);
            additiveMat.SetInt("_DstBlend", (int)UnityEngine.Rendering.BlendMode.One);
            additiveMat.mainTexture = SparkTexture();
            return additiveMat;
        }

        static Texture2D sparkTex;

        /// <summary>중심에서 가장자리로 사라지는 원형 그라데이션 — 코드 생성, 에셋 0</summary>
        static Texture2D SparkTexture()
        {
            if (sparkTex != null) return sparkTex;
            const int SIZE = 32;
            sparkTex = new Texture2D(SIZE, SIZE, TextureFormat.RGBA32, false);
            sparkTex.wrapMode = TextureWrapMode.Clamp;
            float c = (SIZE - 1) / 2f;
            for (int y = 0; y < SIZE; y++)
            for (int x = 0; x < SIZE; x++)
            {
                float d = Mathf.Sqrt((x - c) * (x - c) + (y - c) * (y - c)) / c;
                float a = Mathf.Clamp01(1f - d);
                sparkTex.SetPixel(x, y, new Color(1f, 1f, 1f, a * a));
            }
            sparkTex.Apply();
            return sparkTex;
        }
    }
}
