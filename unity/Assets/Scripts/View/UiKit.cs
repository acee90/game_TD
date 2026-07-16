// ───────── uGUI 조립 도우미 ─────────
// 프리팹 없이 코드로 캔버스를 짓는다. 판·텍스트·버튼·게이지 네 가지 원자를 만든다.
//
// 판 하나는 여러 겹이다 (아래 → 위):
//   그림자 · 그을린 철판 · 가장자리 광택 · 황동 테두리 · 상단 장식선

using System;
using TMPro;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace GodTD.View
{
    public static class UiKit
    {
        /// <summary>앵커·오프셋을 한 번에 — 모든 요소가 이 함수로 배치된다</summary>
        public static RectTransform Rect(GameObject go, Transform parent,
            Vector2 anchorMin, Vector2 anchorMax, Vector2 offsetMin, Vector2 offsetMax)
        {
            var rt = go.GetComponent<RectTransform>();
            if (rt == null) rt = go.AddComponent<RectTransform>();
            rt.SetParent(parent, false);
            rt.anchorMin = anchorMin;
            rt.anchorMax = anchorMax;
            rt.offsetMin = offsetMin;
            rt.offsetMax = offsetMax;
            return rt;
        }

        /// <summary>부모를 꽉 채우는 자식 (inset px만큼 안쪽으로)</summary>
        static RectTransform Fill(GameObject go, Transform parent, float inset = 0f)
            => Rect(go, parent, Vector2.zero, Vector2.one,
                new Vector2(inset, inset), new Vector2(-inset, -inset));

        static Image Raw(string name, Transform parent, Sprite sprite, Color color,
            Image.Type type = Image.Type.Sliced)
        {
            var go = new GameObject(name, typeof(RectTransform), typeof(Image));
            var img = go.GetComponent<Image>();
            img.sprite = sprite;
            img.type = type;
            img.color = color;
            img.raycastTarget = false;
            go.transform.SetParent(parent, false);
            return img;
        }

        /// <summary>모서리 깎인 단색 판. cut=0이면 그냥 사각형. stroke&gt;0이면 테두리 링만.</summary>
        public static Image Panel(string name, Transform parent, Color color, float cut,
            int stroke = 0)
        {
            var img = Raw(name, parent, UiTheme.Chamfer(Mathf.RoundToInt(cut), stroke), color);
            return img;
        }

        /// <summary>
        /// 떠 있는 철제 판 — 그림자 + 불투명 본체 + 가장자리 광택 + 황동 테두리.
        /// 반환하는 body의 부모가 그림자 루트다 (배치 단위 — 그림자 여백만큼 크게 잡아야 한다).
        /// </summary>
        public static Image GlassPlate(string name, Transform parent, int cut = UiTheme.CutPanel)
        {
            // 그림자 (본체보다 사방 8px 크게, 아래로 4px)
            var shadow = Raw(name + "Shadow", parent, UiTheme.Shadow(), new Color(0f, 0f, 0f, 0.6f));

            // 그을린 철제 본체
            var body = Panel(name, shadow.transform, UiTheme.PanelBg, cut);
            Rect(body.gameObject, shadow.transform, Vector2.zero, Vector2.one,
                new Vector2(8f, 12f), new Vector2(-8f, -4f));
            body.raycastTarget = true; // 판 밑 보드 클릭 차단

            // 가장자리의 약한 황동 반사광
            var glow = Raw("Glow", body.transform, UiTheme.InnerGlow(cut, 16), UiTheme.AccentGlow);
            Fill(glow.gameObject, body.transform);

            // 황동 테두리 — 본체와 픽셀 단위로 정렬된 1px 링
            var outline = Panel("Outline", body.transform, UiTheme.PanelStroke, cut, 1);
            Fill(outline.gameObject, body.transform);

            return body;
        }

        /// <summary>철제 판 + 상단 황동 장식선 + 섹션 제목.</summary>
        public static (Image body, TextMeshProUGUI title) FloatingPanel(
            string name, Transform parent, Color accent, string titleText)
        {
            const int CUT = UiTheme.CutPanel;
            var body = GlassPlate(name, parent, CUT);

            // 상단 장식선 — 판의 진영색
            var strip = Panel("Accent", body.transform, accent, 1);
            Rect(strip.gameObject, body.transform, new Vector2(0, 1), Vector2.one,
                new Vector2(CUT, -4f), new Vector2(-CUT, -2f));

            // 각인된 섹션 제목
            var title = Text(name + "Title", body.transform, UiTheme.FontCaption, accent,
                TextAlignmentOptions.TopLeft, FontStyles.Bold);
            title.characterSpacing = 8f;
            title.text = titleText;
            Rect(title.gameObject, body.transform, new Vector2(0, 1), Vector2.one,
                new Vector2(UiTheme.Pad, -24f), new Vector2(-UiTheme.Pad, -8f));

            return (body, title);
        }

        public static TextMeshProUGUI Text(string name, Transform parent, float size, Color color,
            TextAlignmentOptions align = TextAlignmentOptions.Left, FontStyles style = FontStyles.Normal)
        {
            var go = new GameObject(name, typeof(RectTransform), typeof(TextMeshProUGUI));
            var t = go.GetComponent<TextMeshProUGUI>();
            t.font = UiTheme.Font;
            t.fontSize = size;
            t.color = color;
            t.alignment = align;
            t.fontStyle = style;
            t.richText = true;
            t.raycastTarget = false;
            go.transform.SetParent(parent, false);
            return t;
        }

        /// <summary>체력·XP·쿨타임 게이지 — 어두운 홈 + 채움 + 채움 끝의 발광</summary>
        public static (Image bg, Image fill) Bar(string name, Transform parent, Color fillColor)
        {
            var bg = Panel(name, parent, UiTheme.Hex("#0C0A07", 0.95f), 2);
            var fill = Panel("Fill", bg.transform, fillColor, 2);
            Fill(fill.gameObject, bg.transform, 1.5f);
            var rt = fill.rectTransform;
            rt.anchorMin = Vector2.zero;
            rt.anchorMax = Vector2.one;
            return (bg, fill);
        }

        /// <summary>채움 비율 갱신 (anchorMax.x 스케일)</summary>
        public static void SetBar(Image fill, float ratio)
        {
            var rt = fill.rectTransform;
            rt.anchorMax = new Vector2(Mathf.Clamp01(ratio), 1f);
        }

        public static HudButton Button(string name, Transform parent, Action onClick, float cut = -1f)
        {
            if (cut < 0f) cut = UiTheme.CutButton;
            var img = Panel(name, parent, UiTheme.CardBg, cut);
            img.raycastTarget = true;
            var btn = img.gameObject.AddComponent<HudButton>();
            btn.Init(img, onClick, Mathf.RoundToInt(cut));
            return btn;
        }
    }

    /// <summary>
    /// 모서리 깎인 커맨드 버튼. uGUI Button 대신 직접 구현 — 상태를 색만이 아니라
    /// 테두리 발광 세기로도 표현하기 위해서다 (CSS hover가 아니라 '빛나는 슬롯').
    /// </summary>
    public sealed class HudButton : MonoBehaviour,
        IPointerEnterHandler, IPointerExitHandler, IPointerDownHandler, IPointerUpHandler,
        IPointerClickHandler
    {
        Image bg;
        Image outline;   // 테두리 링 — hover 시 액센트로 타오른다
        Image glow;      // 내부 발광 — hover 시 세진다
        Action onClick;
        bool hover;
        bool interactable = true;
        float pressScale = 1f;
        float shakeT;    // 좌우 흔들림 남은 시간 (비용부족 되돌림)
        Vector3 restPos; // 흔들림 시작 시점의 원위치
        float lit;       // 0=쉼, 1=hover. 프레임마다 목표로 수렴한다.
        Color accent = UiTheme.Accent;

        public TextMeshProUGUI Label { get; private set; }
        public TextMeshProUGUI Detail { get; private set; }
        Image chip;
        TextMeshProUGUI chipText;
        Image icon;      // 칸을 지배하는 글리프
        Color iconColor = Color.white;
        Image badge;             // 우하단 비용 배지 (지연 생성)
        TextMeshProUGUI badgeText;
        Image reasonMark;        // 좌하단 비활성 사유 글리프 (지연 생성)

        /// <summary>hover 폴링용 — 공용 툴팁이 이 값으로 대상 카드를 찾는다</summary>
        public bool Hovered => hover;

        /// <summary>좌우 흔들림 발화 — 비용부족을 눌렀을 때 되돌림 주스. 상한 세팅(중첩 방지).</summary>
        public void Shake(float strength)
        {
            shakeT = Mathf.Max(shakeT, 0.26f * strength);
            restPos = transform.localPosition;
        }

        /// <summary>우하단 비용/경고 배지 — 자원색 채움 + 흰 글자. 지연 생성.</summary>
        public void SetBadge(string text, Color col)
        {
            if (badge == null)
            {
                badge = UiKit.Panel("Badge", transform, new Color(col.r, col.g, col.b, 0.90f), 3);
                UiKit.Rect(badge.gameObject, transform, new Vector2(1, 0), new Vector2(1, 0),
                    new Vector2(-30f, 4f), new Vector2(-4f, 18f));
                badge.raycastTarget = false;
                badgeText = UiKit.Text("BadgeTxt", badge.transform, 9f, Color.white,
                    TextAlignmentOptions.Center, FontStyles.Bold);
                UiKit.Rect(badgeText.gameObject, badge.transform, Vector2.zero, Vector2.one,
                    Vector2.zero, Vector2.zero);
            }
            badge.gameObject.SetActive(true);
            badge.color = new Color(col.r, col.g, col.b, 0.90f);
            badgeText.text = text;
        }

        public void ClearBadge() { if (badge != null) badge.gameObject.SetActive(false); }

        /// <summary>좌하단 비활성 사유 글리프(자물쇠·시계 등) — 색 없이도 구분되게. 지연 생성.</summary>
        public void SetReasonMark(HudIcon id, Color col)
        {
            var s = HudIcons.Get(id);
            if (s == null) { ClearReasonMark(); return; }
            if (reasonMark == null)
            {
                var go = new GameObject("ReasonMark", typeof(RectTransform), typeof(Image));
                reasonMark = go.GetComponent<Image>();
                reasonMark.raycastTarget = false;
                reasonMark.preserveAspect = true;
                UiKit.Rect(go, transform, new Vector2(0, 0), new Vector2(0, 0),
                    new Vector2(4f, 4f), new Vector2(20f, 20f));
            }
            reasonMark.gameObject.SetActive(true);
            reasonMark.sprite = s;
            reasonMark.color = col;
        }

        public void ClearReasonMark() { if (reasonMark != null) reasonMark.gameObject.SetActive(false); }

        /// <summary>칸의 아이콘. HudIcon.None이면 숨긴다 (오버레이 카드처럼 글리프가 없는 버튼).</summary>
        public void SetIcon(HudIcon id, Color color)
        {
            if (icon == null) return;
            var sprite = HudIcons.Get(id);
            icon.gameObject.SetActive(sprite != null);
            if (sprite == null) return;
            icon.sprite = sprite;
            iconColor = color;
            Refresh();
        }

        /// <summary>좌상단 핫키 칩 — 액센트 채움 + 흰 글자. 버튼의 발광색도 이 색을 따른다.</summary>
        public void SetHotkey(string key, Color color)
        {
            accent = color;
            if (chip == null)
            {
                chip = UiKit.Panel("Chip", transform, color, 3);
                UiKit.Rect(chip.gameObject, transform, new Vector2(0, 1), new Vector2(0, 1),
                    new Vector2(5f, -19f), new Vector2(19f, -5f));
                chip.raycastTarget = false;
                chipText = UiKit.Text("Key", chip.transform, 9.5f, Color.white,
                    TextAlignmentOptions.Center, FontStyles.Bold);
                UiKit.Rect(chipText.gameObject, chip.transform, Vector2.zero, Vector2.one,
                    Vector2.zero, Vector2.zero);
            }
            chip.color = new Color(color.r, color.g, color.b, 0.92f);
            chipText.text = key;
            Refresh();
        }

        public void Init(Image background, Action handler, int cut)
        {
            bg = background;
            onClick = handler;

            glow = UiKit.Panel("Glow", transform, Color.clear, cut);
            glow.sprite = UiTheme.InnerGlow(cut, 10);
            glow.raycastTarget = false;
            UiKit.Rect(glow.gameObject, transform, Vector2.zero, Vector2.one,
                Vector2.zero, Vector2.zero);

            outline = UiKit.Panel("Outline", transform, UiTheme.SlotStroke, cut, 1);
            outline.raycastTarget = false;
            UiKit.Rect(outline.gameObject, transform, Vector2.zero, Vector2.one,
                Vector2.zero, Vector2.zero);

            // 글리프 — 칸 위쪽 가운데. 핫키 칩(좌상단)과 겹치지 않는다.
            var iconGo = new GameObject("Icon", typeof(RectTransform), typeof(Image));
            icon = iconGo.GetComponent<Image>();
            icon.raycastTarget = false;
            icon.preserveAspect = true;
            UiKit.Rect(iconGo, transform, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f),
                new Vector2(-12f, -30f), new Vector2(12f, -6f));
            iconGo.SetActive(false);

            Label = UiKit.Text("Label", transform, UiTheme.FontCaption + 0.5f, UiTheme.TextMain,
                TextAlignmentOptions.Center, FontStyles.Bold);
            Label.textWrappingMode = TextWrappingModes.NoWrap;
            Label.overflowMode = TextOverflowModes.Ellipsis;
            UiKit.Rect(Label.gameObject, transform, new Vector2(0f, 1f), new Vector2(1f, 1f),
                new Vector2(3f, -45f), new Vector2(-3f, -30f));

            Detail = UiKit.Text("Detail", transform, 9f, UiTheme.TextDim,
                TextAlignmentOptions.Center);
            Detail.textWrappingMode = TextWrappingModes.NoWrap;
            Detail.overflowMode = TextOverflowModes.Ellipsis;
            UiKit.Rect(Detail.gameObject, transform, Vector2.zero, new Vector2(1f, 0f),
                new Vector2(3f, 3f), new Vector2(-3f, 15f));

            Refresh();
        }

        public bool Interactable
        {
            get => interactable;
            set
            {
                interactable = value;
                Refresh();
            }
        }

        void Refresh()
        {
            if (bg == null) return;
            bg.color = !interactable ? UiTheme.CardDisabled : hover ? UiTheme.CardHover : UiTheme.CardBg;
            if (Label != null) Label.color = interactable ? UiTheme.TextMain : UiTheme.TextFaint;
            if (Detail != null) Detail.color = interactable ? UiTheme.TextDim : UiTheme.TextFaint;
            if (chip != null) chip.color = new Color(accent.r, accent.g, accent.b, interactable ? 0.92f : 0.28f);
            if (icon != null)
                icon.color = new Color(iconColor.r, iconColor.g, iconColor.b, interactable ? 1f : 0.3f);
        }

        void Update()
        {
            // 발광 수렴 — hover에서 테두리와 내부 빛이 액센트색으로 타오른다
            float target = interactable && hover ? 1f : 0f;
            if (!Mathf.Approximately(lit, target))
            {
                lit = Mathf.MoveTowards(lit, target, Time.unscaledDeltaTime * 6f);
                if (glow != null)
                    glow.color = new Color(accent.r, accent.g, accent.b, lit * 0.30f);
                if (outline != null)
                    outline.color = Color.Lerp(UiTheme.SlotStroke,
                        new Color(accent.r, accent.g, accent.b, 0.95f), lit);
            }

            // 눌림 반동 — 0.94에서 1.0으로 스프링백
            if (pressScale < 1f)
            {
                pressScale = Mathf.Min(1f, pressScale + Time.unscaledDeltaTime * 1.2f);
                float overshoot = 1f + Mathf.Sin((1f - pressScale) * Mathf.PI) * 0.02f;
                transform.localScale = Vector3.one * (pressScale * overshoot);
            }

            // 좌우 흔들림 — press(scale)와 축이 달라 공존한다
            if (shakeT > 0f)
            {
                shakeT -= Time.unscaledDeltaTime;
                float amp = shakeT > 0f ? Mathf.Sin(shakeT * 70f) * shakeT * 10f : 0f;
                transform.localPosition = restPos + new Vector3(amp, 0f, 0f);
                if (shakeT <= 0f) transform.localPosition = restPos;
            }
        }

        public void OnPointerEnter(PointerEventData e) { hover = true; Refresh(); }
        public void OnPointerExit(PointerEventData e) { hover = false; Refresh(); }

        public void OnPointerDown(PointerEventData e)
        {
            if (!interactable) return;
            transform.localScale = Vector3.one * 0.94f;
            pressScale = 0.94f;
            if (bg != null) bg.color = UiTheme.CardPress;
        }

        public void OnPointerUp(PointerEventData e) => Refresh();

        public void OnPointerClick(PointerEventData e)
        {
            if (interactable) onClick?.Invoke();
        }
    }
}
