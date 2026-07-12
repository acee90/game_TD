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
        public Color Accent = UiTheme.Build;

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
