// 검증 전용 UnityEngine 스텁 — unity/ 코드가 쓰는 API 표면만 흉내낸다.
// 실제 Unity API 시그니처(2022.3/Unity 6 공통)와 일치하도록 작성 (문법·타입 검증 목적).
#pragma warning disable CS0649, CS0169
using System;
using System.Collections.Generic;

namespace UnityEngine
{
    public enum RuntimeInitializeLoadType { AfterSceneLoad, BeforeSceneLoad }

    [AttributeUsage(AttributeTargets.Method)]
    public sealed class RuntimeInitializeOnLoadMethodAttribute : Attribute
    {
        public RuntimeInitializeOnLoadMethodAttribute() { }
        public RuntimeInitializeOnLoadMethodAttribute(RuntimeInitializeLoadType type) { }
    }

    public struct Vector2
    {
        public float x, y;
        public Vector2(float x, float y) { this.x = x; this.y = y; }
        public static Vector2 zero => new Vector2(0, 0);
        public static Vector2 one => new Vector2(1, 1);
    }

    public struct Vector3
    {
        public float x, y, z;
        public Vector3(float x, float y, float z) { this.x = x; this.y = y; this.z = z; }
        public static Vector3 zero => new Vector3(0, 0, 0);
        public static Vector3 one => new Vector3(1, 1, 1);
        public static Vector3 forward => new Vector3(0, 0, 1);
        public float magnitude => (float)Math.Sqrt(x * x + y * y + z * z);
        public Vector3 normalized => this;
        public static Vector3 operator +(Vector3 a, Vector3 b) => new Vector3(a.x + b.x, a.y + b.y, a.z + b.z);
        public static Vector3 operator -(Vector3 a, Vector3 b) => new Vector3(a.x - b.x, a.y - b.y, a.z - b.z);
        public static Vector3 operator *(Vector3 a, float d) => new Vector3(a.x * d, a.y * d, a.z * d);
        public static Vector3 operator *(float d, Vector3 a) => a * d;
        public static Vector3 Lerp(Vector3 a, Vector3 b, float t) => a;
        public static implicit operator Vector2(Vector3 v) => new Vector2(v.x, v.y);
    }

    public struct Quaternion
    {
        public static Quaternion Euler(float x, float y, float z) => default;
        public static Vector3 operator *(Quaternion rotation, Vector3 point) => point;
    }

    public struct Color
    {
        public float r, g, b, a;
        public Color(float r, float g, float b, float a = 1f) { this.r = r; this.g = g; this.b = b; this.a = a; }
        public static Color white => new Color(1, 1, 1);
        public static Color magenta => new Color(1, 0, 1);
        public static Color Lerp(Color a, Color b, float t) => a;
        public static Color operator *(Color c, float m) => new Color(c.r * m, c.g * m, c.b * m, c.a * m);
    }

    public struct Color32
    {
        public static implicit operator Color32(Color c) => default;
        public static implicit operator Color(Color32 c) => default;
    }

    public static class ColorUtility
    {
        public static bool TryParseHtmlString(string html, out Color color) { color = default; return true; }
        public static string ToHtmlStringRGB(Color color) => "FFFFFF";
    }

    public struct Rect
    {
        public float x, y, width, height;
        public Rect(float x, float y, float w, float h) { this.x = x; this.y = y; width = w; height = h; }
        public bool Contains(Vector2 point) => false;
    }

    public struct Ray { }

    public struct RaycastHit
    {
        public Collider collider => null;
        public Vector3 point => default;
    }

    public static class Physics
    {
        public static bool Raycast(Ray ray, out RaycastHit hit, float maxDistance) { hit = default; return false; }
    }

    public static class Mathf
    {
        public const float PI = (float)Math.PI;
        public static float Min(float a, float b) => Math.Min(a, b);
        public static float Max(float a, float b) => Math.Max(a, b);
        public static int Max(int a, int b) => Math.Max(a, b);
        public static float Cos(float f) => (float)Math.Cos(f);
        public static float Sin(float f) => (float)Math.Sin(f);
        public static float Exp(float f) => (float)Math.Exp(f);
        public static float Pow(float f, float p) => (float)Math.Pow(f, p);
        public static float Abs(float f) => Math.Abs(f);
        public static float Sqrt(float f) => (float)Math.Sqrt(f);
        public static float Clamp(float v, float min, float max) => v < min ? min : v > max ? max : v;
        public static float Clamp01(float f) => f < 0 ? 0 : f > 1 ? 1 : f;
        public static float Lerp(float a, float b, float t) => a + (b - a) * Clamp01(t);
        public static float SmoothStep(float from, float to, float t) => Lerp(from, to, t);
        public static int CeilToInt(float f) => (int)Math.Ceiling(f);
        public static int FloorToInt(float f) => (int)Math.Floor(f);
        public static int RoundToInt(float f) => (int)Math.Round(f);
    }

    public static class Random
    {
        public static Vector3 insideUnitSphere => default;
        public static float value => 0.5f;
    }

    public class Object
    {
        public string name { get; set; }
        public static void Destroy(Object obj) { }
        public static T FindObjectOfType<T>() where T : Object => null;
    }

    public class Component : Object
    {
        public Transform transform => null;
        public GameObject gameObject => null;
        public string tag { get; set; }
        public T GetComponent<T>() => default;
        public T GetComponentInParent<T>() => default;
    }

    public class Behaviour : Component
    {
        public bool enabled { get; set; }
    }

    public class MonoBehaviour : Behaviour { }

    public class Transform : Component
    {
        public Vector3 position { get; set; }
        public Vector3 localPosition { get; set; }
        public Vector3 localScale { get; set; }
        public Quaternion rotation { get; set; }
        public void SetParent(Transform parent, bool worldPositionStays) { }
        public void SetPositionAndRotation(Vector3 position, Quaternion rotation) { }
        public Transform Find(string name) => null;
    }

    public enum PrimitiveType { Sphere, Capsule, Cylinder, Cube, Plane, Quad }

    public class GameObject : Object
    {
        public GameObject() { }
        public GameObject(string name) { }
        public GameObject(string name, params Type[] components) { }
        public Transform transform => null;
        public string tag { get; set; }
        public T AddComponent<T>() where T : Component, new() => new T();
        public T GetComponent<T>() => default;
        public bool activeSelf => true;
        public void SetActive(bool value) { }
        public static GameObject CreatePrimitive(PrimitiveType type) => new GameObject();
    }

    public class Shader : Object
    {
        public static Shader Find(string name) => null;
    }

    public class Material : Object
    {
        public Material(Shader shader) { }
        public Color color { get; set; }
        public void SetFloat(string name, float value) { }
        public void SetColor(string name, Color value) { }
        public void EnableKeyword(string keyword) { }
    }

    public class Renderer : Component
    {
        public Material sharedMaterial { get; set; }
        public Material material { get; set; }
    }

    public class MeshRenderer : Renderer { }

    public class Mesh : Object
    {
        public Vector3[] vertices { get; set; }
        public Color[] colors { get; set; }
        public int[] triangles { get; set; }
        public void RecalculateBounds() { }
    }

    public class MeshFilter : Component
    {
        public Mesh sharedMesh { get; set; }
        public Mesh mesh { get; set; }
    }

    public enum LineAlignment { View, TransformZ }

    public class LineRenderer : Renderer
    {
        public bool useWorldSpace { get; set; }
        public float startWidth { get; set; }
        public float endWidth { get; set; }
        public int positionCount { get; set; }
        public bool loop { get; set; }
        public LineAlignment alignment { get; set; }
        public void SetPosition(int index, Vector3 position) { }
    }

    public class TrailRenderer : Renderer
    {
        public float time { get; set; }
        public float startWidth { get; set; }
        public float endWidth { get; set; }
        public Color startColor { get; set; }
        public Color endColor { get; set; }
        public void Clear() { }
    }

    public enum ParticleSystemSimulationSpace { Local, World }

    public sealed class ParticleSystem : Component
    {
        public struct MinMaxCurve
        {
            public MinMaxCurve(float constant) { }
            public MinMaxCurve(float min, float max) { }
            public static implicit operator MinMaxCurve(float constant) => new MinMaxCurve(constant);
        }

        public struct MainModule
        {
            public ParticleSystemSimulationSpace simulationSpace { get; set; }
            public MinMaxCurve startSpeed { get; set; }
            public MinMaxCurve startSize { get; set; }
            public MinMaxCurve startLifetime { get; set; }
            public MinMaxCurve gravityModifier { get; set; }
            public int maxParticles { get; set; }
        }

        public struct EmissionModule
        {
            public bool enabled { get; set; }
        }

        public struct ShapeModule
        {
            public bool enabled { get; set; }
        }

        public struct EmitParams
        {
            public Vector3 position { get; set; }
            public Vector3 velocity { get; set; }
            public Color32 startColor { get; set; }
            public float startSize { get; set; }
            public float startLifetime { get; set; }
        }

        public MainModule main => default;
        public EmissionModule emission => default;
        public ShapeModule shape => default;
        public void Play() { }
        public void Emit(EmitParams emitParams, int count) { }
    }

    public sealed class ParticleSystemRenderer : Renderer { }

    public class Collider : Component { }

    public enum CameraClearFlags { Skybox, SolidColor }

    public class Camera : Behaviour
    {
        public static Camera main => null;
        public bool orthographic { get; set; }
        public float orthographicSize { get; set; }
        public float fieldOfView { get; set; }
        public CameraClearFlags clearFlags { get; set; }
        public Color backgroundColor { get; set; }
        public float nearClipPlane { get; set; }
        public float farClipPlane { get; set; }
        public Ray ScreenPointToRay(Vector3 pos) => default;
        public Vector3 WorldToScreenPoint(Vector3 position) => default;
    }

    public enum LightType { Directional, Point, Spot }
    public enum LightShadows { None, Hard, Soft }

    public sealed class Light : Behaviour
    {
        public LightType type { get; set; }
        public Color color { get; set; }
        public float intensity { get; set; }
        public LightShadows shadows { get; set; }
        public float shadowStrength { get; set; }
        public float range { get; set; }
    }

    public static class RenderSettings
    {
        public static Rendering.AmbientMode ambientMode { get; set; }
        public static Color ambientLight { get; set; }
        public static Color ambientSkyColor { get; set; }
        public static Color ambientEquatorColor { get; set; }
        public static Color ambientGroundColor { get; set; }
    }

    public static class QualitySettings
    {
        public static float shadowDistance { get; set; }
    }

    public enum KeyCode
    {
        // 그리드 단축키 (커맨드 카드 3x3 위치 대응)
        Q, W, E, A, S, D, Z, X, C,
        Escape,
        // 이하 레거시 — 실제 UnityEngine.KeyCode에는 전체 키가 있다
        P, B, R, U, Alpha1, Alpha2, Alpha3, Alpha4, Alpha5, Alpha6, Alpha7,
    }

    public static class Input
    {
        public static bool GetKeyDown(KeyCode key) => false;
        public static bool GetMouseButtonDown(int button) => false;
        public static Vector3 mousePosition => default;
        public static float GetAxis(string axisName) => 0f;
    }

    public static class Time
    {
        public static float deltaTime => 0.016f;
        public static float unscaledDeltaTime => 0.016f;
    }

    public static class Screen
    {
        public static int width => 1920;
        public static int height => 1080;
    }

    public class Texture : Object { }

    public enum TextureFormat { RGBA32 }
    public enum TextureWrapMode { Repeat, Clamp }

    public class Texture2D : Texture
    {
        public Texture2D(int width, int height, TextureFormat format, bool mipChain) { }
        public static Texture2D whiteTexture => null;
        public TextureWrapMode wrapMode { get; set; }
        public void SetPixel(int x, int y, Color color) { }
        public void Apply() { }
    }

    public enum SpriteMeshType { FullRect, Tight }

    public class Sprite : Object
    {
        public static Sprite Create(Texture2D texture, Rect rect, Vector2 pivot, float pixelsPerUnit,
            uint extrude, SpriteMeshType meshType, Vector4 border) => null;
    }

    public struct Vector4
    {
        public Vector4(float x, float y, float z, float w) { }
    }

    public enum TextAnchor { UpperLeft, MiddleCenter }
    public enum FontStyle { Normal, Bold }

    public sealed class Font : Object
    {
        public Material material => null;
        public static Font CreateDynamicFontFromOSFont(string fontname, int size) => null;
    }

    public sealed class TextMesh : Component
    {
        public string text { get; set; }
        public Font font { get; set; }
        public int fontSize { get; set; }
        public float characterSize { get; set; }
        public TextAnchor anchor { get; set; }
        public Color color { get; set; }
    }

    public static class Resources
    {
        public static T GetBuiltinResource<T>(string path) where T : Object => null;
        public static T Load<T>(string path) where T : Object => null;
    }

    public class RectTransform : Transform
    {
        public Vector2 anchorMin { get; set; }
        public Vector2 anchorMax { get; set; }
        public Vector2 offsetMin { get; set; }
        public Vector2 offsetMax { get; set; }
        public Vector2 sizeDelta { get; set; }
        public Vector2 pivot { get; set; }
        public Vector2 anchoredPosition { get; set; }
    }

    public enum RenderMode { ScreenSpaceOverlay, ScreenSpaceCamera, WorldSpace }

    public class Canvas : Behaviour
    {
        public RenderMode renderMode { get; set; }
        public int sortingOrder { get; set; }
    }

    public class RectOffset
    {
        public RectOffset(int left, int right, int top, int bottom) { }
    }

    public class GUIStyle
    {
        public GUIStyle() { }
        public GUIStyle(GUIStyle other) { }
        public bool richText { get; set; }
        public int fontSize { get; set; }
        public FontStyle fontStyle { get; set; }
        public TextAnchor alignment { get; set; }
        public bool wordWrap { get; set; }
        public RectOffset padding { get; set; }
    }

    public class GUISkin : Object
    {
        public GUIStyle label => new GUIStyle();
        public GUIStyle button => new GUIStyle();
    }

    public static class GUI
    {
        public static GUISkin skin => null;
        public static bool enabled { get; set; }
        public static Color color { get; set; }
        public static Color backgroundColor { get; set; }
        public static void Box(Rect rect, string text) { }
        public static void Label(Rect rect, string text) { }
        public static void Label(Rect rect, string text, GUIStyle style) { }
        public static bool Button(Rect rect, string text) => false;
        public static bool Button(Rect rect, string text, GUIStyle style) => false;
        public static void DrawTexture(Rect rect, Texture texture) { }
    }

    public class GUILayoutOption { }

    public static class GUILayout
    {
        public static void BeginArea(Rect rect) { }
        public static void EndArea() { }
        public static void Label(string text, params GUILayoutOption[] options) { }
        public static void Label(string text, GUIStyle style, params GUILayoutOption[] options) { }
        public static bool Button(string text, params GUILayoutOption[] options) => false;
        public static bool Button(string text, GUIStyle style, params GUILayoutOption[] options) => false;
        public static void Space(float pixels) { }
        public static void BeginHorizontal(params GUILayoutOption[] options) { }
        public static void EndHorizontal() { }
    }

    public static class GUILayoutUtility
    {
        public static Rect GetRect(float width, float height) => default;
    }
}

namespace UnityEngine.Rendering
{
    public enum AmbientMode { Skybox, Trilight, Flat, Custom }
}


namespace UnityEngine.EventSystems
{
    public class EventSystem : UnityEngine.MonoBehaviour
    {
        public static EventSystem current => null;
    }

    public class StandaloneInputModule : UnityEngine.MonoBehaviour { }

    public class PointerEventData
    {
        public UnityEngine.Vector2 position;
    }

    public interface IPointerEnterHandler { void OnPointerEnter(PointerEventData eventData); }
    public interface IPointerExitHandler { void OnPointerExit(PointerEventData eventData); }
    public interface IPointerDownHandler { void OnPointerDown(PointerEventData eventData); }
    public interface IPointerUpHandler { void OnPointerUp(PointerEventData eventData); }
    public interface IPointerClickHandler { void OnPointerClick(PointerEventData eventData); }
}

namespace UnityEngine.UI
{
    public class Graphic : UnityEngine.MonoBehaviour
    {
        public UnityEngine.Color color { get; set; }
        public bool raycastTarget { get; set; }
        public UnityEngine.RectTransform rectTransform => null;
    }

    public class Image : Graphic
    {
        public enum Type { Simple, Sliced, Tiled, Filled }
        public UnityEngine.Sprite sprite { get; set; }
        public Type type { get; set; }
    }

    public class GraphicRaycaster : UnityEngine.MonoBehaviour { }
}

namespace TMPro
{
    public enum TextAlignmentOptions
    {
        Left, Center, Right, Top, Bottom, TopLeft, TopRight, BottomLeft, BottomRight, Midline,
    }

    [System.Flags]
    public enum FontStyles { Normal = 0, Bold = 1, Italic = 2 }

    public class TMP_FontAsset : UnityEngine.Object
    {
        public static TMP_FontAsset CreateFontAsset(UnityEngine.Font font) => null;
    }

    public static class TMP_Settings
    {
        public static TMP_FontAsset defaultFontAsset => null;
    }

    public class TextMeshProUGUI : UnityEngine.MonoBehaviour
    {
        public string text { get; set; }
        public TMP_FontAsset font { get; set; }
        public float fontSize { get; set; }
        public UnityEngine.Color color { get; set; }
        public TextAlignmentOptions alignment { get; set; }
        public FontStyles fontStyle { get; set; }
        public bool richText { get; set; }
        public bool raycastTarget { get; set; }
    }
}
