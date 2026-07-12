// ───────── uGUI 조립 도우미 ─────────
// 프리팹 없이 코드로 캔버스를 짓는다. 패널·텍스트·버튼·게이지 네 가지 원자와
// 버튼의 hover/press 상태 + 눌림 반동(주스)을 담당한다.

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

        public static Image Panel(string name, Transform parent, Color color, float radius,
            int stroke = 0)
        {
            var go = new GameObject(name, typeof(RectTransform), typeof(Image));
            var img = go.GetComponent<Image>();
            img.sprite = UiTheme.Rounded(Mathf.RoundToInt(radius), stroke);
            img.type = Image.Type.Sliced;
            img.color = color;
            go.transform.SetParent(parent, false);
            return img;
        }

        /// <summary>떠 있는 카드 패널 — 그림자 + 본체 + 상단 액센트 라인 + 제목</summary>
        public static (Image body, TextMeshProUGUI title) FloatingPanel(
            string name, Transform parent, Color accent, string titleText)
        {
            // 그림자 (본체보다 사방 8px 크게, 아래로 4px)
            var shadow = new GameObject(name + "Shadow", typeof(RectTransform), typeof(Image));
            var shImg = shadow.GetComponent<Image>();
            shImg.sprite = UiTheme.Shadow();
            shImg.type = Image.Type.Sliced;
            shImg.color = new Color(0f, 0f, 0f, 0.6f);
            shImg.raycastTarget = false;
            shadow.transform.SetParent(parent, false);

            var body = Panel(name, shadow.transform, UiTheme.PanelBg, UiTheme.RadiusPanel, 1);
            Rect(body.gameObject, shadow.transform, Vector2.zero, Vector2.one,
                new Vector2(8f, 12f), new Vector2(-8f, -4f));
            body.raycastTarget = true; // 패널 밑 보드 클릭 차단

            // 상단 액센트 라인
            var strip = Panel("Accent", body.transform, accent, 2);
            Rect(strip.gameObject, body.transform, new Vector2(0, 1), Vector2.one,
                new Vector2(10f, -3f), new Vector2(-10f, -1f));
            strip.raycastTarget = false;

            // 제목 — 액센트색, 자간 살짝
            var title = Text(name + "Title", body.transform, UiTheme.FontCaption + 1f, accent,
                TextAlignmentOptions.TopLeft, FontStyles.Bold);
            title.characterSpacing = 6f;
            title.text = titleText;
            Rect(title.gameObject, body.transform, new Vector2(0, 1), Vector2.one,
                new Vector2(UiTheme.Pad, -22f), new Vector2(-UiTheme.Pad, -6f));

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

        /// <summary>체력·XP·쿨타임 게이지 — 배경 + 채움 두 장</summary>
        public static (Image bg, Image fill) Bar(string name, Transform parent, Color fillColor)
        {
            var bg = Panel(name, parent, UiTheme.Hex("#080C16", 0.9f), 4);
            var fill = Panel("Fill", bg.transform, fillColor, 4);
            var rt = fill.rectTransform;
            rt.anchorMin = Vector2.zero;
            rt.anchorMax = new Vector2(1f, 1f);
            rt.offsetMin = new Vector2(1.5f, 1.5f);
            rt.offsetMax = new Vector2(-1.5f, -1.5f);
            return (bg, fill);
        }

        /// <summary>채움 비율 갱신 (anchorMax.x 스케일)</summary>
        public static void SetBar(Image fill, float ratio)
        {
            var rt = fill.rectTransform;
            rt.anchorMax = new Vector2(Mathf.Clamp01(ratio), 1f);
        }

        public static HudButton Button(string name, Transform parent, Action onClick,
            float radius = -1f)
        {
            if (radius < 0f) radius = UiTheme.RadiusButton;
            var img = Panel(name, parent, UiTheme.CardBg, radius, 1);
            img.raycastTarget = true;
            var btn = img.gameObject.AddComponent<HudButton>();
            btn.Init(img, onClick);
            return btn;
        }
    }

    /// <summary>
    /// hover/press 상태색 + 눌림 반동을 가진 버튼. uGUI Button 대신 직접 구현 —
    /// 상태색을 토큰으로 통제하고, 비활성 시각을 라벨 색까지 함께 바꾸기 위해서다.
    /// </summary>
    public sealed class HudButton : MonoBehaviour,
        IPointerEnterHandler, IPointerExitHandler, IPointerDownHandler, IPointerUpHandler,
        IPointerClickHandler
    {
        Image bg;
        Action onClick;
        bool hover;
        bool interactable = true;
        float pressScale = 1f;

        public TextMeshProUGUI Label { get; private set; }
        public TextMeshProUGUI Detail { get; private set; }
        Image chip;
        TextMeshProUGUI chipText;

        /// <summary>좌상단 핫키 칩 — 액센트 채움 + 흰 글자. 없으면 숨김.</summary>
        public void SetHotkey(string key, Color accent)
        {
            if (chip == null)
            {
                chip = UiKit.Panel("Chip", transform, accent, 4);
                UiKit.Rect(chip.gameObject, transform, new Vector2(0, 1), new Vector2(0, 1),
                    new Vector2(4f, -18f), new Vector2(18f, -4f));
                chip.raycastTarget = false;
                chipText = UiKit.Text("Key", chip.transform, 9f, Color.white,
                    TextAlignmentOptions.Center, FontStyles.Bold);
                UiKit.Rect(chipText.gameObject, chip.transform, Vector2.zero, Vector2.one,
                    Vector2.zero, Vector2.zero);
            }
            chip.color = new Color(accent.r, accent.g, accent.b, 0.9f);
            chipText.text = key;
        }

        public void Init(Image background, Action handler)
        {
            bg = background;
            onClick = handler;

            Label = UiKit.Text("Label", transform, UiTheme.FontSmall, UiTheme.TextMain,
                TextAlignmentOptions.Top, FontStyles.Bold);
            Label.textWrappingMode = TextWrappingModes.NoWrap;
            Label.overflowMode = TextOverflowModes.Ellipsis;
            UiKit.Rect(Label.gameObject, transform, Vector2.zero, Vector2.one,
                new Vector2(6f, 4f), new Vector2(-6f, -5f));

            Detail = UiKit.Text("Detail", transform, UiTheme.FontCaption, UiTheme.TextDim,
                TextAlignmentOptions.Bottom);
            Detail.textWrappingMode = TextWrappingModes.NoWrap;
            Detail.overflowMode = TextOverflowModes.Ellipsis;
            UiKit.Rect(Detail.gameObject, transform, Vector2.zero, Vector2.one,
                new Vector2(6f, 4f), new Vector2(-6f, -5f));
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
        }

        void Update()
        {
            // 눌림 반동 — 0.92에서 1.0으로 스프링백
            if (pressScale < 1f)
            {
                pressScale = Mathf.Min(1f, pressScale + Time.unscaledDeltaTime * 1.2f);
                float overshoot = 1f + Mathf.Sin((1f - pressScale) * Mathf.PI) * 0.02f;
                transform.localScale = Vector3.one * (pressScale * overshoot);
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
