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

        // ── 임포트한 파티클 팩(URP 변환) 프리팹 — Resources/Fx/*, 풀링 재사용 ──
        // 코드 생성 버스트 위에 얹는 '고급' 착탄·총구 연출. 프리팹이 없으면 코드 FX만으로 폴백한다.
        GameObject fxMuzzle, fxExplosion, fxPlasma, fxSparks;
        const float FX_MUZZLE_SCALE = 0.22f;
        const float FX_IMPACT_SCALE = 0.28f;
        const float FX_SPLASH_SCALE = 0.42f;
        const int FX_MAX_ACTIVE = 48; // 동시 인스턴스 상한 — 과부하·시각 노이즈 방지
        sealed class FxInstance { public ParticleSystem Ps; public float Until; public GameObject Key; }
        readonly List<FxInstance> fxActive = new List<FxInstance>();
        readonly Dictionary<GameObject, Stack<ParticleSystem>> fxPool =
            new Dictionary<GameObject, Stack<ParticleSystem>>();

        // 스킬 시그니처 — Core 판정은 색만 넘긴다. 종족색이 스킬색과 겹치므로(테란=일제사격 등)
        // 원소 구분은 "제자리 AoE인가 + 색"으로 판별한다. 이동 투사체는 흰색=평타(둥근 pip),
        // 그 외=화살/볼트(진행 방향으로 길쭉하게 정렬).
        enum FxKind { Basic, Bolt, Fire, Arcane, Wind, Generic }

        static FxKind Classify(string hex)
        {
            switch (hex)
            {
                case "#ff8a3c": return FxKind.Fire;   // 폭발 화살
                case "#c065e0": return FxKind.Arcane;  // 유성 · 광역 평타
                case "#6fdc8c": return FxKind.Wind;    // 소용돌이
                case "#ffffff": return FxKind.Basic;   // 영웅 평타(단일)
                default: return FxKind.Bolt;           // 타워·일제사격 화살 — 방향 정렬 볼트
            }
        }

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
            public FxKind Kind;
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

        // ── AoE 범위 표시 — 실제 반경에 즉시 그려 잠깐 유지 후 페이드(확장 링과 달리 '범위'를 읽게) ──
        sealed class AoeFx
        {
            public GameObject Disc;      // 반투명 바닥 원판
            public LineRenderer Ring;    // 외곽선
            public Vector3 Center;
            public float Radius;
            public Color Color;
            public float T;
            public float Duration;
            public bool Active;
        }
        readonly List<AoeFx> aoeAreas = new List<AoeFx>();

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
            // 임포트한 파티클 팩(URP 변환본) — 없으면 null이라 코드 FX로 폴백
            fxMuzzle = Resources.Load<GameObject>("Fx/MuzzleFlashEffect");
            fxExplosion = Resources.Load<GameObject>("Fx/SmallExplosionEffect");
            fxPlasma = Resources.Load<GameObject>("Fx/PlasmaExplosionEffect");
            fxSparks = Resources.Load<GameObject>("Fx/SparksEffect");
        }

        /// <summary>재시작 — 판에 매인 연출 상태를 전부 비운다</summary>
        public void OnRestart()
        {
            seenShots.Clear();
            foreach (var p in projectiles) Deactivate(p);
            foreach (var f in fxActive)
            {
                if (f.Ps == null) continue;
                f.Ps.Stop(true, ParticleSystemStopBehavior.StopEmittingAndClear);
                f.Ps.gameObject.SetActive(false);
                fxPool[f.Key].Push(f.Ps);
            }
            fxActive.Clear();
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
            TickAoe(dt);
            TickFxPool();
        }

        // ───────── 임포트 파티클 팩 — 풀링 스폰/회수 ─────────
        /// <summary>착탄/총구 위치에 팩 프리팹을 재생. 프리팹 null이면 무시(코드 FX 폴백).</summary>
        void SpawnFx(GameObject prefab, Vector3 pos, float scale)
        {
            if (prefab == null || fxActive.Count >= FX_MAX_ACTIVE) return;
            if (!fxPool.TryGetValue(prefab, out var pool)) { pool = new Stack<ParticleSystem>(); fxPool[prefab] = pool; }
            ParticleSystem ps = pool.Count > 0 ? pool.Pop() : null;
            if (ps == null)
            {
                var go = Instantiate(prefab, root);
                StripSmoke(go); // 어두운 연기 서브시스템 제거 — 밝은 불꽃·스파크만 남겨 토이 룩 유지
                // 팩 폭발 프리팹은 loop=true(데모용 상시 폭발)라 계속 뿜으며 바닥에 쌓인다.
                // 모든 서브시스템을 1회성으로 강제해 '한 번 터지고 끝'이 되게 한다.
                foreach (var sub in go.GetComponentsInChildren<ParticleSystem>(true))
                {
                    var m = sub.main;
                    m.loop = false;
                    m.stopAction = ParticleSystemStopAction.None;
                }
                ps = go.GetComponent<ParticleSystem>() ?? go.GetComponentInChildren<ParticleSystem>();
                if (ps == null) { Destroy(go); return; }
            }
            var t = ps.transform;
            t.position = pos;
            t.localScale = Vector3.one * scale;
            ps.gameObject.SetActive(true);
            ps.Clear(true);
            ps.Play(true);
            // 모든 서브시스템의 최대 (지속시간+수명)으로 회수 시점을 잡는다
            float dur = 0f;
            foreach (var sub in ps.GetComponentsInChildren<ParticleSystem>(true))
                dur = Mathf.Max(dur, sub.main.duration + sub.main.startLifetime.constantMax);
            fxActive.Add(new FxInstance { Ps = ps, Until = Time.time + dur + 0.2f, Key = prefab });
        }

        /// <summary>인스턴스에서 어두운 연기 계열 파티클 렌더러를 끈다 — 밝은 가산 요소만 남긴다</summary>
        static void StripSmoke(GameObject go)
        {
            foreach (var psr in go.GetComponentsInChildren<ParticleSystemRenderer>(true))
            {
                var m = psr.sharedMaterial;
                string mn = m != null ? m.name : "";
                if (mn.Contains("Smoke") || mn.Contains("PlasmaExplosionParticle") || psr.gameObject.name.Contains("Smoke"))
                    psr.gameObject.SetActive(false);
            }
        }

        void TickFxPool()
        {
            for (int i = fxActive.Count - 1; i >= 0; i--)
            {
                var f = fxActive[i];
                if (f.Ps == null) { fxActive.RemoveAt(i); continue; }
                if (Time.time >= f.Until)
                {
                    f.Ps.Stop(true, ParticleSystemStopBehavior.StopEmittingAndClear);
                    f.Ps.gameObject.SetActive(false);
                    fxPool[f.Key].Push(f.Ps);
                    fxActive.RemoveAt(i);
                }
            }
        }

        /// <summary>착탄 종류별 팩 프리팹 선택 — 비전=플라즈마, 스플래시/화염=폭발, 그 외=스파크</summary>
        GameObject ImpactFx(FxKind kind, bool splash)
        {
            if (kind == FxKind.Arcane && fxPlasma != null) return fxPlasma;
            if (splash || kind == FxKind.Fire) return fxExplosion;
            return fxSparks;
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

        /// <summary>위로 솟구쳐 사그라드는 불티 — 화염 착탄용. 중력에 살짝 끌려 아치를 그린다.</summary>
        void EmberBurst(Vector3 at, Color color, int count)
        {
            for (int i = 0; i < count; i++)
            {
                var dir = Random.insideUnitSphere;
                dir.y = Mathf.Abs(dir.y) * 1.6f + 0.8f; // 강하게 위로
                var ep = new ParticleSystem.EmitParams
                {
                    position = at + Vector3.up * 0.1f,
                    velocity = dir.normalized * (2.2f + Random.value * 2.6f),
                    startColor = Color.Lerp(color, Color.white, Random.value * 0.5f),
                    startSize = 0.08f + Random.value * 0.12f,
                    startLifetime = 0.4f + Random.value * 0.5f,
                };
                burstPs.Emit(ep, 1);
            }
        }

        /// <summary>중심 둘레를 도는 접선 방향 파티클 — 바람/소용돌이 착탄용.</summary>
        void SwirlBurst(Vector3 at, Color color, int count)
        {
            for (int i = 0; i < count; i++)
            {
                float a = i / (float)count * Mathf.PI * 2f;
                var radial = new Vector3(Mathf.Cos(a), 0f, Mathf.Sin(a));
                var tangent = new Vector3(-radial.z, 0f, radial.x); // 시계방향 접선
                var vel = (tangent * 3.4f + radial * 1.1f + Vector3.up * 0.6f);
                var ep = new ParticleSystem.EmitParams
                {
                    position = at + radial * 0.3f + Vector3.up * 0.15f,
                    velocity = vel,
                    startColor = color,
                    startSize = 0.1f + Random.value * 0.1f,
                    startLifetime = 0.3f + Random.value * 0.25f,
                };
                burstPs.Emit(ep, 1);
            }
        }

        /// <summary>착탄 지점 위에서 내리꽂히는 섬광 — 유성. 볼트 하나를 하늘에서 떨어뜨린다.</summary>
        void MeteorStreak(Vector3 at, Color color)
        {
            var from = at + new Vector3(0.6f, 9f, 0.6f); // 살짝 비스듬히 위
            Launch(from, at, Color.Lerp(color, Color.white, 0.3f), 0f, FxKind.Bolt);
        }

        /// <summary>스킬 착탄 시그니처 — 원소별로 다른 연출. at·radiusWorld는 월드 단위.</summary>
        void SignatureLand(Vector3 at, Color color, float radiusWorld, FxKind kind)
        {
            switch (kind)
            {
                case FxKind.Fire:
                    Pulse(at, color, radiusWorld * 0.7f);
                    Ring(at, color, radiusWorld);
                    EmberBurst(at, color, 18);
                    break;
                case FxKind.Arcane:
                    MeteorStreak(at, color);
                    Ring(at, color, radiusWorld * 1.1f);
                    Pulse(at, color, radiusWorld * 0.6f);
                    Burst(at, Color.Lerp(color, Color.white, 0.4f), 16, 3.2f, 0.14f);
                    break;
                case FxKind.Wind:
                    Ring(at, color, radiusWorld);
                    SwirlBurst(at, color, 22);
                    break;
                default:
                    Pulse(at, color, radiusWorld * 0.6f);
                    Burst(at, color, 10, 2.6f, 0.12f);
                    break;
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

        // ───────── AoE 범위 표시 ─────────
        /// <summary>
        /// 실제 피해 반경(월드 단위)을 바닥 원판+외곽선으로 즉시 그려 잠깐 유지 후 페이드한다.
        /// 확장 링(Ring)은 다 커질 즈음 투명해져 범위가 안 읽혔다 — 이건 처음부터 전체 반경을 보인다.
        /// </summary>
        void AoeArea(Vector3 center, Color color, float radiusWorld)
        {
            if (radiusWorld < 0.05f) return;
            var fx = aoeAreas.Find(a => !a.Active);
            if (fx == null)
            {
                if (aoeAreas.Count >= 24) return;
                var disc = GameObject.CreatePrimitive(PrimitiveType.Cylinder); // 납작 원판
                disc.name = "AoeDisc";
                Destroy(disc.GetComponent<Collider>());
                disc.transform.SetParent(root, false);
                var ringGo = new GameObject("AoeRing");
                ringGo.transform.SetParent(root, false);
                var line = ringGo.AddComponent<LineRenderer>();
                line.useWorldSpace = true;
                line.loop = true;
                line.numCornerVertices = 2;
                fx = new AoeFx { Disc = disc, Ring = line };
                aoeAreas.Add(fx);
            }
            var ground = new Vector3(center.x, 0.34f, center.z);
            fx.Disc.SetActive(true);
            fx.Disc.transform.position = ground;
            fx.Disc.transform.localScale = new Vector3(radiusWorld * 2f, 0.02f, radiusWorld * 2f);
            fx.Ring.gameObject.SetActive(true);
            WorldCircle(fx.Ring, ground, radiusWorld);
            fx.Center = ground;
            fx.Radius = radiusWorld;
            fx.Color = color;
            fx.T = 0f;
            fx.Duration = 0.55f;
            fx.Active = true;
        }

        void TickAoe(float dt)
        {
            foreach (var a in aoeAreas)
            {
                if (!a.Active) continue;
                a.T += dt;
                float k = Mathf.Clamp01(a.T / a.Duration);
                // 앞 30%는 꽉 차게 유지, 그 뒤 페이드 — 범위를 눈으로 잡을 시간을 준다
                float alpha = 1f - Mathf.SmoothStep(0f, 1f, Mathf.Clamp01((k - 0.3f) / 0.7f));
                a.Disc.GetComponent<MeshRenderer>().sharedMaterial =
                    UnlitMat(new Color(a.Color.r, a.Color.g, a.Color.b, 0.22f * alpha));
                float w = 0.18f * alpha;
                a.Ring.material = UnlitMat(new Color(a.Color.r, a.Color.g, a.Color.b, 0.9f * alpha));
                a.Ring.startWidth = w;
                a.Ring.endWidth = w;
                if (k >= 1f)
                {
                    a.Active = false;
                    a.Disc.SetActive(false);
                    a.Ring.gameObject.SetActive(false);
                }
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

                var kind = Classify(shot.Color);

                if ((from - to).magnitude < 0.05f)
                {
                    // 제자리 광역 = 스킬 착탄 — 원소별 시그니처(화염 불티·유성 낙하·바람 소용돌이) + 팩 폭발
                    if (shot.SplashRadius > 0f)
                    {
                        AoeArea(to, color, shot.SplashRadius * SCALE);   // 실제 반경을 바닥에 명확히
                        SignatureLand(to, color, shot.SplashRadius * SCALE * 0.6f, kind);
                        SpawnFx(ImpactFx(kind, true), to + Vector3.up * 0.4f, FX_SPLASH_SCALE);
                    }
                    continue;
                }
                Launch(from, to, color, shot.SplashRadius, kind);
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
                    if (p.SplashRadiusPx > 0f)
                    {
                        // 타워 스플래시는 사거리 전체가 피해 범위 → 매 발 사거리 원을 그리면 노이즈이고
                        // 오해를 준다(사거리 원은 타워 선택 시 이미 표시). 착탄 연출만 남긴다.
                        SignatureLand(p.To, p.Color, p.SplashRadiusPx * SCALE * 0.5f, p.Kind);
                        SpawnFx(ImpactFx(p.Kind, true), p.To + Vector3.up * 0.4f, FX_SPLASH_SCALE);
                    }
                    else
                    {
                        // 단일 타격도 작은 불꽃 — 명중이 '느껴지게' + 팩 스파크
                        var hot = Color.Lerp(p.Color, Color.white, 0.35f);
                        Burst(p.To, hot, 5, 2.2f, 0.1f);
                        SpawnFx(ImpactFx(p.Kind, false), p.To, FX_IMPACT_SCALE);
                    }
                    Deactivate(p);
                }
            }
        }

        void Launch(Vector3 from, Vector3 to, Color color, float splashRadiusPx, FxKind kind)
        {
            var p = projectiles.Find(x => !x.Active);
            if (p == null)
            {
                if (projectiles.Count >= 96) return;
                var orb = GameObject.CreatePrimitive(PrimitiveType.Sphere);
                orb.name = "Projectile";
                Destroy(orb.GetComponent<Collider>());
                orb.transform.SetParent(root, false);
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

            // 형태 — 볼트(화살·타워탄)는 진행 방향으로 길쭉, 그 외는 둥근 탄
            var dir = to - from;
            if (dir.sqrMagnitude < 1e-4f) dir = Vector3.forward;
            dir.Normalize();
            if (kind == FxKind.Bolt)
            {
                p.Go.transform.rotation = Quaternion.LookRotation(dir);
                p.Go.transform.localScale = new Vector3(0.12f, 0.12f, 0.5f);
            }
            else
            {
                p.Go.transform.rotation = Quaternion.identity;
                p.Go.transform.localScale = new Vector3(0.22f, 0.22f, 0.22f);
            }

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
            p.Kind = kind;
            p.Active = true;

            // 총구 섬광 — 발사가 '터지듯' 시작 (코드 버스트 + 팩 머즐 플래시)
            Burst(from, hot, 4, 1.8f, 0.09f);
            SpawnFx(fxMuzzle, from, FX_MUZZLE_SCALE);
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
                    bar = MakeBar(enemy.Kind == EnemyKind.Boss ? 3.6f : 1.7f, BAR_HP);
                    enemyBars[enemy] = bar;
                }
                var p = MapData.PathPos(enemy.Distance);
                // 바는 몸체 바로 위에 붙는다. 보스는 몸이 커서 오프셋만 조금 더 준다
                // (기존 radius*4는 7.9월드유닛까지 떠서 보스 한참 위 허공에 걸리는 버그였다)
                float top = enemy.Kind == EnemyKind.Boss
                    ? enemy.Radius * 2f * SCALE + 1.0f
                    : enemy.Radius * 2f * SCALE + 0.6f;
                float ratio = enemy.MaxHp > 0f ? enemy.Hp / enemy.MaxHp : 0f;
                // 잡몹은 다닥다닥 겹치므로 풀피일 땐 바를 숨긴다(다치면 보인다). 보스는 항상 표시.
                bool show = enemy.Kind == EnemyKind.Boss || ratio < 0.995f;
                bar.Root.SetActive(show);
                if (show) UpdateBar(bar, GameView.W(p.X, p.Y, 0.4f + top), ratio);
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
                // 영웅 몸과 겹치지 않게 머리 위로 더 띄운다
                UpdateBar(heroBar, GameView.W(hero.X, hero.Y,
                    0.4f + HeroData.HERO_RADIUS * 2f * SCALE + 0.95f), ratio);
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

            // 전용 머티리얼 + 렌더 큐 — fill을 배경보다 뒤(높은 큐)에 그려 항상 위에 보이게 한다.
            // (체력이 줄면 fill 쿼드 중심이 왼쪽으로 옮겨가 반투명 거리정렬이 뒤집혀 배경에 가려지던 버그 수정)
            var bgMat = new Material(spriteShader) { color = BAR_BG, renderQueue = 4000 };
            var fillMat = new Material(spriteShader) { color = fillColor, renderQueue = 4002 };

            var bg = GameObject.CreatePrimitive(PrimitiveType.Quad);
            Destroy(bg.GetComponent<Collider>());
            bg.transform.SetParent(rootGo.transform, false);
            bg.transform.localScale = new Vector3(width + 0.12f, 0.30f, 1f); // 테두리처럼 살짝 더 크게
            bg.GetComponent<MeshRenderer>().sharedMaterial = bgMat;

            var fill = GameObject.CreatePrimitive(PrimitiveType.Quad);
            Destroy(fill.GetComponent<Collider>());
            fill.transform.SetParent(rootGo.transform, false);
            fill.transform.localScale = new Vector3(width, 0.22f, 1f);
            fill.GetComponent<MeshRenderer>().sharedMaterial = fillMat;

            return new WorldBar { Root = rootGo, Fill = fill.transform, Width = width };
        }

        void UpdateBar(WorldBar bar, Vector3 at, float ratio)
        {
            ratio = Mathf.Clamp01(ratio);
            bar.Root.transform.position = at;
            bar.Root.transform.rotation = cam.transform.rotation; // 빌보드
            bar.Fill.localScale = new Vector3(bar.Width * ratio, 0.22f, 1f);
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
