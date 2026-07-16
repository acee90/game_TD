// 원본: web/src/ui/ui.ts의 정보 구성 — uGUI + TMP 재구현 (2026-07-12, HUD 재설계 §3)
// ───────── 중세 전장 HUD: 철제 프레임 · 양피지 글자 · 황동 장식 ─────────
// 상단 얇은 자원 바 + 좌하단 '정보' 카드 + 우하단 3×3 커맨드 카드 (스타/워크 모서리식).
// 하단 전폭 바를 없애 보드가 화면 대부분을 차지한다. 두 카드는 그림자를 깔고 떠 있다.
// 증강·게임오버는 전면 오버레이. 프리팹 없음 — UiTheme·UiKit으로 코드 조립.

using System.Collections.Generic;
using GodTD.Core;
using TMPro;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace GodTD.View
{
    public sealed class GameHud : MonoBehaviour
    {
        GameView view;
        Canvas canvas;
        RectTransform root;

        // ── 상단: 떠 있는 플레이트 3장 (전폭 바 폐기 — 그건 웹 네비게이션 바다) ──
        RectTransform statusRoot, resourceRoot, scoreRoot;
        TextMeshProUGUI topLeft;                          // 라운드 · 타이머 · 다음 웨이브
        TextMeshProUGUI mineralText, gasText, probeText;  // 자원 — 각자 글리프를 단다
        TextMeshProUGUI lifeText, killText, scoreText;
        // 각 스탯 그룹 컨테이너 — 흔들림/광택 훅 대상
        RectTransform mineralGroup, gasGroup, probeGroup, lifeGroup, killGroup, scoreGroup;

        // ── 좌하단: 선택 정보 ──
        RectTransform infoRoot;      // 그림자 루트 (배치 단위)
        Image infoAccent;
        TextMeshProUGUI infoEyebrow;
        TextMeshProUGUI selTitle;
        TextMeshProUGUI selMeta;   // 제목 줄 우측 — HP/XP 등 부가 수치
        TextMeshProUGUI selStats;  // 핵심수치 3개 (굵게)
        TextMeshProUGUI selBody;
        (Image bg, Image fill) selHpBar;
        (Image bg, Image fill) selXpBar;
        (Image bg, Image fill) skillBar;

        // ── 우하단: 커맨드 카드 ──
        RectTransform cardRoot;      // 그림자 루트
        RectTransform cardBody;
        TextMeshProUGUI cardTitle;
        readonly HudButton[] cardButtons = new HudButton[CommandCard.SLOTS];
        readonly Image[] cardSockets = new Image[CommandCard.SLOTS]; // 빈 슬롯 소켓 — 그리드가 항상 보이게

        // ── 우하단: 단계별 보스 소환대 (커맨드 카드 위) ──
        RectTransform bossRoot;
        RectTransform bossBody;
        readonly HudButton[] bossButtons = new HudButton[Balance.BOSS_MAX_LEVEL];
        float bossStackTop;          // IsPointerOverHud용 — 카드+보스 소환대 스택의 상단 y
        static readonly Color BOSS_COL = UiTheme.Hex("#A94832");
        (Image bg, Image fill) bossCd;   // 소환대 전폭 공용 쿨타임 게이지(칸별 숫자 대체)
        static readonly string[] ROMAN = { "I", "II", "III", "IV", "V", "VI" };

        // ── 공용 툴팁 (선택정보 위) ──
        RectTransform tooltipRoot;
        TextMeshProUGUI tooltipText;
        Command[] lastCmds;          // RefreshCard가 만든 마지막 9칸 — 툴팁 폴링용
        readonly string[] lastBossCmds = new string[Balance.BOSS_MAX_LEVEL]; // 보스 버튼 툴팁

        TextMeshProUGUI msgText;     // 하단 중앙 시스템 메시지 (패널 없음)

        // ── 오버레이 ──
        Image overlayDim;
        TextMeshProUGUI overlayTitle;
        TextMeshProUGUI overlaySub;
        readonly List<HudButton> overlayCards = new List<HudButton>();
        HudButton overlayAction;     // 리롤 / 다시 시작

        int builtW, builtH;
        float displayMineral;        // 카운트업 주스
        float displayGas, displayScore;
        float infoW, infoH, cardW, cardH; // IsPointerOverHud용 — ApplyLayout에서 계산

        // ── 피드백·모션(주스, §7.8) — 전부 unscaled 수렴, 발화는 Max 상한 ──
        int lastLives = int.MinValue, lastRound = int.MinValue, lastMaxBoss = int.MinValue;
        float resGlint, statusGlint, bossGlint, lifeVignetteE; // 0→1 감쇠 envelope
        Image resourceGlow, statusGlow, bossGlow, lifeVignette; // 플래시 대상
        readonly Dictionary<RectTransform, float> shakeT =
            new Dictionary<RectTransform, float>(); // 스탯 그룹별 남은 흔들림 시간

        void Awake()
        {
            view = GetComponent<GameView>();
            view.Hud = this;
            BuildCanvas();
        }

        // ───────── 조립 ─────────

        void BuildCanvas()
        {
            if (Object.FindObjectOfType<EventSystem>() == null)
            {
                new GameObject("EventSystem", typeof(EventSystem), typeof(StandaloneInputModule));
            }

            var go = new GameObject("HudCanvas", typeof(Canvas), typeof(GraphicRaycaster));
            canvas = go.GetComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            canvas.sortingOrder = 100;
            root = go.GetComponent<RectTransform>();

            BuildTopBar();
            BuildInfoPanel();
            BuildTooltip();
            BuildCardPanel();
            BuildBossButtons();
            BuildMessage();
            BuildOverlay();
            ApplyLayout();
        }

        // 칸은 글리프(24) + 라벨 + 세부를 담아야 해서 예전 텍스트 버튼보다 키가 크다
        static float CellW() => Mathf.Clamp(Screen.height * 0.145f, 74f, 92f);
        static float CellH() => Mathf.Clamp(Screen.height * 0.112f, 58f, 70f);
        const float CARD_HEADER = 24f;

        // 상단 플레이트 — 여백 / 높이 / 각 판의 폭
        const float TOP_M = 9f;
        const float TOP_H = 38f;
        const float W_STATUS = 236f, W_RESOURCE = 288f, W_SCORE = 288f;

        /// <summary>
        /// 화면 상단에 떠 있는 유리판 하나. 앵커(0=좌, 0.5=중앙, 1=우) 기준으로 폭 w를 잡고,
        /// 그림자 여백(좌우 8 · 위 4 · 아래 12)을 감안해 루트를 본체보다 크게 잡는다.
        /// </summary>
        (RectTransform plateRoot, Transform body) TopPlate(string name, float anchorX, float w)
        {
            var img = UiKit.GlassPlate(name, root, 4);
            var plateRoot = img.transform.parent.GetComponent<RectTransform>();

            // 본체가 놓일 x 구간 — 앵커에 상대적
            float bodyL = anchorX <= 0f ? 10f : anchorX >= 1f ? -10f - w : -w * 0.5f;
            var anchor = new Vector2(anchorX, 1f);
            UiKit.Rect(plateRoot.gameObject, root, anchor, anchor,
                new Vector2(bodyL - 8f, -TOP_M - TOP_H - 12f),
                new Vector2(bodyL + w + 8f, -TOP_M + 4f));

            return (plateRoot, img.transform);
        }

        /// <summary>
        /// 판 안의 '글리프 + 수치' 한 벌. 판을 x0~x1(0~1) 구간으로 나눠 차지한다.
        /// 아이콘을 텍스트에 인라인으로 박지 않는 이유: 정렬이 폰트 메트릭에 끌려다닌다.
        /// </summary>
        (RectTransform group, TextMeshProUGUI text) StatGroup(
            Transform plate, HudIcon id, Color tint, float x0, float x1,
            float fontSize = UiTheme.FontLabel, float iconHalf = 9f,
            FontStyles style = FontStyles.Bold)
        {
            var group = new GameObject($"Stat{id}", typeof(RectTransform)).GetComponent<RectTransform>();
            UiKit.Rect(group.gameObject, plate, new Vector2(x0, 0f), new Vector2(x1, 1f),
                Vector2.zero, Vector2.zero);

            // 아이콘: 컨테이너 좌측, iconHalf로 크기 차등(1순위 크게)
            var go = new GameObject($"Icon{id}", typeof(RectTransform), typeof(Image));
            var img = go.GetComponent<Image>();
            img.sprite = HudIcons.Get(id);
            img.color = tint;
            img.raycastTarget = false;
            img.preserveAspect = true;
            UiKit.Rect(go, group, new Vector2(0, 0.5f), new Vector2(0, 0.5f),
                new Vector2(6f, -iconHalf), new Vector2(6f + iconHalf * 2f, iconHalf));

            var t = UiKit.Text($"Val{id}", group, fontSize, tint,
                TextAlignmentOptions.Left, style);
            UiKit.Rect(t.gameObject, group, Vector2.zero, Vector2.one,
                new Vector2(iconHalf * 2f + 12f, 0f), new Vector2(-2f, 0f));
            return (group, t);
        }

        void BuildTopBar()
        {
            var (sRoot, sBody) = TopPlate("Status", 0f, W_STATUS);
            statusRoot = sRoot;
            statusGlow = sBody.Find("Glow").GetComponent<Image>();
            topLeft = UiKit.Text("Text", sBody, UiTheme.FontSmall, UiTheme.TextMain,
                TextAlignmentOptions.Left);
            UiKit.Rect(topLeft.gameObject, sBody, Vector2.zero, Vector2.one,
                new Vector2(UiTheme.Pad + 2f, 0f), new Vector2(-UiTheme.Pad - 2f, 0f));

            var (rRoot, rBody) = TopPlate("Resource", 0.5f, W_RESOURCE);
            resourceRoot = rRoot;
            resourceGlow = rBody.Find("Glow").GetComponent<Image>();
            (mineralGroup, mineralText) = StatGroup(rBody, HudIcon.Mineral, UiTheme.Mineral, 0f,   0.42f, UiTheme.FontStatBig,   11f);
            (gasGroup,     gasText)     = StatGroup(rBody, HudIcon.Gas,     UiTheme.Gas,     0.42f, 0.78f, UiTheme.FontStatBig,   11f);
            (probeGroup,   probeText)   = StatGroup(rBody, HudIcon.Probe,   UiTheme.HeroCol, 0.78f, 1f,    UiTheme.FontStatSmall, 7f);

            var (cRoot, cBody) = TopPlate("Score", 1f, W_SCORE);
            scoreRoot = cRoot;
            (lifeGroup,  lifeText)  = StatGroup(cBody, HudIcon.Life,  UiTheme.Danger,  0f,    0.34f, UiTheme.FontStatBig,   11f);
            (killGroup,  killText)  = StatGroup(cBody, HudIcon.Kill,  UiTheme.TextDim, 0.34f, 0.60f, UiTheme.FontStatSmall, 7f);
            (scoreGroup, scoreText) = StatGroup(cBody, HudIcon.Score, UiTheme.Gold,    0.60f, 1f,    UiTheme.FontStatSmall, 7f);
        }

        /// <summary>상단 플레이트의 화면 좌표 사각형 (원점 좌하단 — 마우스 좌표계와 같다)</summary>
        static UnityEngine.Rect TopPlateScreenRect(float anchorX, float w)
        {
            float bodyL = anchorX <= 0f ? 10f : anchorX >= 1f ? -10f - w : -w * 0.5f;
            float x = anchorX * Screen.width + bodyL;
            return new UnityEngine.Rect(x, Screen.height - TOP_M - TOP_H, w, TOP_H);
        }

        /// <summary>좌하단 정보 카드 — 눈썹(대상 종류) + 제목 + 게이지 + 본문 2~3줄</summary>
        void BuildInfoPanel()
        {
            var (body, eyebrow) = UiKit.FloatingPanel("Info", root, UiTheme.HeroCol, "전장");
            infoRoot = body.transform.parent.GetComponent<RectTransform>();
            infoEyebrow = eyebrow;
            infoAccent = body.transform.Find("Accent").GetComponent<Image>();
            var t = body.transform;

            selTitle = UiKit.Text("Title", t, UiTheme.FontLabel + 2f, UiTheme.TextMain,
                TextAlignmentOptions.TopLeft, FontStyles.Bold);
            selTitle.textWrappingMode = TextWrappingModes.NoWrap;
            selTitle.overflowMode = TextOverflowModes.Ellipsis;
            UiKit.Rect(selTitle.gameObject, t, new Vector2(0, 1), Vector2.one,
                new Vector2(UiTheme.Pad, -48f), new Vector2(-UiTheme.Pad, -24f));

            // 제목 줄 우측 정렬 — HP/XP 부가 수치
            selMeta = UiKit.Text("Meta", t, UiTheme.FontCaption, UiTheme.TextDim,
                TextAlignmentOptions.TopRight);
            UiKit.Rect(selMeta.gameObject, t, new Vector2(0, 1), Vector2.one,
                new Vector2(UiTheme.Pad, -48f), new Vector2(-UiTheme.Pad, -24f));

            // 핵심수치 3개 — 게이지 아래, 본문 위
            selStats = UiKit.Text("Stats", t, UiTheme.FontLabel, UiTheme.TextMain,
                TextAlignmentOptions.TopLeft, FontStyles.Bold);
            UiKit.Rect(selStats.gameObject, t, new Vector2(0, 1), Vector2.one,
                new Vector2(UiTheme.Pad, -100f), new Vector2(-UiTheme.Pad, -82f));

            // 방패 두께감 — InfoPanel InnerGlow depth 강화 (에셋 없이 캐시 키만 추가)
            var infoGlow = body.transform.Find("Glow").GetComponent<Image>();
            infoGlow.sprite = UiTheme.InnerGlow(UiTheme.CutPanel, 22);

            selHpBar = UiKit.Bar("Hp", t, UiTheme.Hex("#70DC8C"));
            UiKit.Rect(selHpBar.bg.gameObject, t, new Vector2(0, 1), Vector2.one,
                new Vector2(UiTheme.Pad, -60f), new Vector2(-UiTheme.Pad, -52f));
            selXpBar = UiKit.Bar("Xp", t, UiTheme.Gold);
            UiKit.Rect(selXpBar.bg.gameObject, t, new Vector2(0, 1), Vector2.one,
                new Vector2(UiTheme.Pad, -70f), new Vector2(-UiTheme.Pad, -64f));
            skillBar = UiKit.Bar("Skill", t, UiTheme.Hex("#7CE7FF"));
            UiKit.Rect(skillBar.bg.gameObject, t, new Vector2(0, 1), Vector2.one,
                new Vector2(UiTheme.Pad, -80f), new Vector2(-UiTheme.Pad, -74f));

            selBody = UiKit.Text("Body", t, UiTheme.FontCaption, UiTheme.TextDim,
                TextAlignmentOptions.TopLeft);
            UiKit.Rect(selBody.gameObject, t, Vector2.zero, Vector2.one,
                new Vector2(UiTheme.Pad, 8f), new Vector2(-UiTheme.Pad, -84f));
        }

        /// <summary>선택정보 위에 뜨는 작은 유리판 — hover된 커맨드/보스 버튼의 설명을 보여준다.</summary>
        void BuildTooltip()
        {
            var (body, _) = UiKit.FloatingPanel("Tooltip", root, UiTheme.Accent, "정보");
            tooltipRoot = body.transform.parent.GetComponent<RectTransform>();
            tooltipText = UiKit.Text("Tip", body.transform, UiTheme.FontCaption, UiTheme.TextMain,
                TextAlignmentOptions.TopLeft);
            tooltipText.textWrappingMode = TextWrappingModes.Normal;
            UiKit.Rect(tooltipText.gameObject, body.transform, Vector2.zero, Vector2.one,
                new Vector2(UiTheme.Pad, 8f), new Vector2(-UiTheme.Pad, -24f));
            tooltipRoot.gameObject.SetActive(false);
        }

        /// <summary>우하단 커맨드 카드 — 헤더 + 3×3 그리드, 핫키 칩</summary>
        void BuildCardPanel()
        {
            var (body, eyebrow) = UiKit.FloatingPanel("Card", root, UiTheme.Build, "명령");
            cardRoot = body.transform.parent.GetComponent<RectTransform>();
            cardBody = body.rectTransform;
            cardTitle = eyebrow;

            for (int i = 0; i < CommandCard.SLOTS; i++)
            {
                // 소켓 — 커맨드가 비어도 3×3 구조가 읽힌다 (스타크래프트식)
                cardSockets[i] = UiKit.Panel($"Socket{i}", cardBody,
                    UiTheme.SocketBg, UiTheme.CutButton);
                cardSockets[i].raycastTarget = false;

                int captured = i;
                // 칸 내부(글리프 · 라벨 · 세부)는 HudButton이 직접 배치한다.
                cardButtons[i] = UiKit.Button($"Cmd{i}", cardBody, () => InvokeCard(captured));
            }
        }

        /// <summary>큰 단일 소환 버튼 대신 1~6단계를 항상 직접 고르는 보스 소환대.</summary>
        void BuildBossButtons()
        {
            var (body, eyebrow) = UiKit.FloatingPanel("Boss", root, BOSS_COL, "봉인된 적장 소환");
            bossRoot = body.transform.parent.GetComponent<RectTransform>();
            bossBody = body.rectTransform;
            bossGlow = body.transform.Find("Glow").GetComponent<Image>();
            for (int i = 0; i < bossButtons.Length; i++)
            {
                int level = i + 1;
                // §7.7 아이콘 반복 제거 — 패널 제목이 이미 보스임을 말한다. 칸은 로마숫자로.
                bossButtons[i] = UiKit.Button($"BossLv{level}", bossBody,
                    () => view.Game.SummonBoss(level), 5f);
                bossButtons[i].Label.fontSize = 13f;
                bossButtons[i].Detail.fontSize = 8f;
            }

            // 공용 쿨타임 게이지 — 칸별 숫자 대신 소환대 전폭 봉인 바 하나
            bossCd = UiKit.Bar("BossCd", bossBody, UiTheme.Hex("#C6A15B"));
        }

        void BuildMessage()
        {
            msgText = UiKit.Text("Message", root, UiTheme.FontCaption, UiTheme.TextDim,
                TextAlignmentOptions.Bottom);
            UiKit.Rect(msgText.gameObject, root, new Vector2(0.25f, 0), new Vector2(0.75f, 0),
                new Vector2(0, 6f), new Vector2(0, 26f));
        }

        void BuildOverlay()
        {
            // 적색 비네트 — 라이프 감소 시 짧게 번쩍(평면 적색 알파 펄스). dim 아래 · board 위.
            lifeVignette = UiKit.Panel("LifeVignette", root, UiTheme.Hex("#A94832", 0f), 0);
            UiKit.Rect(lifeVignette.gameObject, root, Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero);
            lifeVignette.raycastTarget = false; // 입력 관통 방지: 클릭 막지 않음

            overlayDim = UiKit.Panel("Overlay", root, UiTheme.Hex("#0D0A07", 0.90f), 0);
            UiKit.Rect(overlayDim.gameObject, root, Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero);
            overlayDim.raycastTarget = true; // 아래 클릭 차단

            overlayTitle = UiKit.Text("Title", overlayDim.transform, UiTheme.FontTitle, UiTheme.Gold,
                TextAlignmentOptions.Center, FontStyles.Bold);
            UiKit.Rect(overlayTitle.gameObject, overlayDim.transform,
                new Vector2(0, 0.68f), new Vector2(1, 0.80f), Vector2.zero, Vector2.zero);

            overlaySub = UiKit.Text("Sub", overlayDim.transform, UiTheme.FontSmall, UiTheme.TextDim,
                TextAlignmentOptions.Center);
            UiKit.Rect(overlaySub.gameObject, overlayDim.transform,
                new Vector2(0, 0.62f), new Vector2(1, 0.68f), Vector2.zero, Vector2.zero);

            for (int i = 0; i < 3; i++)
            {
                int captured = i;
                var btn = UiKit.Button($"Card{i}", overlayDim.transform, () => ClickOverlayCard(captured), 12f);
                float x0 = 0.5f + (captured - 1.5f) * 0.19f + 0.01f;
                UiKit.Rect(btn.gameObject, overlayDim.transform,
                    new Vector2(x0, 0.33f), new Vector2(x0 + 0.17f, 0.60f), Vector2.zero, Vector2.zero);

                // 전면 카드는 커맨드 칸과 배치가 다르다 — HudButton의 기본(글리프용 좁은 띠)을 덮어쓴다.
                btn.Label.alignment = TextAlignmentOptions.Top;
                btn.Label.fontSize = UiTheme.FontLabel;
                UiKit.Rect(btn.Label.gameObject, btn.transform, Vector2.zero, Vector2.one,
                    new Vector2(10f, 10f), new Vector2(-10f, -12f));

                btn.Detail.alignment = TextAlignmentOptions.Center;
                btn.Detail.fontSize = UiTheme.FontCaption;
                btn.Detail.textWrappingMode = TextWrappingModes.Normal; // 증강 설명은 여러 줄이다
                btn.Detail.overflowMode = TextOverflowModes.Truncate;
                UiKit.Rect(btn.Detail.gameObject, btn.transform, Vector2.zero, Vector2.one,
                    new Vector2(10f, 10f), new Vector2(-10f, -62f));

                overlayCards.Add(btn);
            }

            overlayAction = UiKit.Button("Action", overlayDim.transform, ClickOverlayAction, 10f);
            UiKit.Rect(overlayAction.gameObject, overlayDim.transform,
                new Vector2(0.40f, 0.24f), new Vector2(0.60f, 0.30f), Vector2.zero, Vector2.zero);
            overlayAction.Label.alignment = TextAlignmentOptions.Center;
            UiKit.Rect(overlayAction.Label.gameObject, overlayAction.transform,
                Vector2.zero, Vector2.one, new Vector2(8f, 4f), new Vector2(-8f, -4f));

            overlayDim.gameObject.SetActive(false);
        }

        void ApplyLayout()
        {
            builtW = Screen.width;
            builtH = Screen.height;

            // 상단 플레이트 3장은 화면 모서리/중앙에 앵커돼 있어 리사이즈를 알아서 따라간다.

            // 우하단 커맨드 카드 — 셀 크기에서 패널 크기를 역산
            float cw = CellW(), ch = CellH();
            float gap = UiTheme.Gap;
            cardW = cw * 3f + gap * 2f + UiTheme.Pad * 2f;
            cardH = ch * 3f + gap * 2f + CARD_HEADER + UiTheme.Pad;
            // 그림자 여백(8,12,-8,-4)을 감안해 루트를 카드보다 크게 잡는다
            UiKit.Rect(cardRoot.gameObject, root, new Vector2(1, 0), new Vector2(1, 0),
                new Vector2(-(cardW + 24f), 0f), new Vector2(0f, cardH + 16f));

            // 단계별 보스 소환대 — 6개 버튼을 같은 폭으로 나란히 둔다
            float bossRootH = 56f + CARD_HEADER + UiTheme.Pad;
            float bossY0 = cardH + 20f;
            UiKit.Rect(bossRoot.gameObject, root, new Vector2(1, 0), new Vector2(1, 0),
                new Vector2(-(cardW + 24f), bossY0), new Vector2(0f, bossY0 + bossRootH));
            bossStackTop = bossY0 + bossRootH;

            float bossGap = 4f;
            float bossW = (cardW - UiTheme.Pad * 2f - bossGap * (bossButtons.Length - 1)) /
                bossButtons.Length;
            for (int i = 0; i < bossButtons.Length; i++)
            {
                float x0 = UiTheme.Pad + i * (bossW + bossGap);
                UiKit.Rect(bossButtons[i].gameObject, bossBody,
                    new Vector2(0, 1), new Vector2(0, 1),
                    new Vector2(x0, -CARD_HEADER - 52f), new Vector2(x0 + bossW, -CARD_HEADER));
            }

            // 공용 쿨타임 게이지 — 소환대 하단 전폭 (칸별 숫자 대체)
            UiKit.Rect(bossCd.bg.gameObject, bossBody, new Vector2(0, 0), new Vector2(1, 0),
                new Vector2(UiTheme.Pad, 3f), new Vector2(-UiTheme.Pad, 9f));

            for (int i = 0; i < CommandCard.SLOTS; i++)
            {
                int col = i % 3, row = i / 3;
                float x0 = UiTheme.Pad + col * (cw + gap);
                float y1 = -CARD_HEADER - row * (ch + gap);
                UiKit.Rect(cardSockets[i].gameObject, cardBody, new Vector2(0, 1), new Vector2(0, 1),
                    new Vector2(x0, y1 - ch), new Vector2(x0 + cw, y1));
                UiKit.Rect(cardButtons[i].gameObject, cardBody, new Vector2(0, 1), new Vector2(0, 1),
                    new Vector2(x0, y1 - ch), new Vector2(x0 + cw, y1));
            }

            // 좌하단 정보 카드 — 내용에 딱 맞는 컴팩트 높이 (빈 슬라브 금지)
            infoW = Mathf.Clamp(Screen.width * 0.30f, 290f, 372f);
            infoH = 136f;
            UiKit.Rect(infoRoot.gameObject, root, Vector2.zero, Vector2.zero,
                new Vector2(0f, 0f), new Vector2(infoW + 24f, infoH + 16f));

            // 공용 툴팁 — 정보 카드 바로 위
            UiKit.Rect(tooltipRoot.gameObject, root, Vector2.zero, Vector2.zero,
                new Vector2(0f, infoH + 20f), new Vector2(infoW + 24f, infoH + 108f));
        }

        // ───────── GameView 연동 ─────────

        /// <summary>보드 클릭과 HUD 클릭을 가른다 — 상단 플레이트 3장, 두 모서리 카드, 오버레이</summary>
        public bool IsPointerOverHud(Vector2 mouseScreenPos)
        {
            if (overlayDim != null && overlayDim.gameObject.activeSelf) return true;
            // 전폭 바가 아니므로 판 사이 틈으로는 보드를 클릭할 수 있다
            if (TopPlateScreenRect(0f, W_STATUS).Contains(mouseScreenPos)) return true;
            if (TopPlateScreenRect(0.5f, W_RESOURCE).Contains(mouseScreenPos)) return true;
            if (TopPlateScreenRect(1f, W_SCORE).Contains(mouseScreenPos)) return true;
            if (mouseScreenPos.x <= infoW + 16f && mouseScreenPos.y <= infoH + 12f) return true;
            // 우하단 = 커맨드 카드 + 그 위 보스 소환대 스택 전체
            if (mouseScreenPos.x >= Screen.width - cardW - 16f && mouseScreenPos.y <= bossStackTop + 12f) return true;
            return false;
        }

        void InvokeCard(int index)
        {
            var cmds = CommandCard.Build(view.Game, view.Selection, view.Page);
            var cmd = cmds[index];
            // 비용부족을 누르면 카드 + 부족 자원 그룹을 흔들어 되돌려준다(주스)
            if (!cmd.Enabled && cmd.Reason == DisableReason.Cost)
            {
                cardButtons[index].Shake(1f);
                FireShake(cmd.Accent == UiTheme.Gas ? gasGroup : mineralGroup);
                return;
            }
            view.InvokeCommand(cmd);
        }

        // ───────── 매 프레임 갱신 ─────────

        void Update()
        {
            var game = view.Game;
            if (builtW != Screen.width || builtH != Screen.height) ApplyLayout();

            RefreshTop(game);
            RefreshSelection(game);
            RefreshCard(game);
            RefreshBoss(game);
            RefreshOverlay(game);
            TickFeedback();
        }

        /// <summary>스탯 그룹 흔들림 발화 — 남은 시간을 상한으로 세팅(중첩 방지).</summary>
        void FireShake(RectTransform g) { if (g != null) shakeT[g] = 0.28f; }

        /// <summary>매 실프레임 피드백 감쇠·적용. 전부 Time.unscaledDeltaTime(히트스톱·일시정지 무관).</summary>
        void TickFeedback()
        {
            float dt = Time.unscaledDeltaTime;

            // 광택 감쇠 + 적용 — 기본은 AccentGlow로 복귀
            resGlint = Mathf.MoveTowards(resGlint, 0f, dt * 3f);
            if (resourceGlow != null)
                resourceGlow.color = Color.Lerp(UiTheme.AccentGlow, UiTheme.Hex("#D6B56E", 0.55f), resGlint);
            statusGlint = Mathf.MoveTowards(statusGlint, 0f, dt * 2f);
            if (statusGlow != null)
                statusGlow.color = Color.Lerp(UiTheme.AccentGlow, UiTheme.Hex("#D6B56E", 0.65f), statusGlint);
            bossGlint = Mathf.MoveTowards(bossGlint, 0f, dt * 2f);
            if (bossGlow != null)
                bossGlow.color = Color.Lerp(UiTheme.AccentGlow, UiTheme.Hex("#A94832", 0.55f), bossGlint);
            lifeVignetteE = Mathf.MoveTowards(lifeVignetteE, 0f, dt * 2.5f);
            if (lifeVignette != null)
            {
                var c = lifeVignette.color;
                c.a = lifeVignetteE * 0.22f;
                lifeVignette.color = c;
            }

            // 스탯 그룹 흔들림 — x축만 감쇠, 종료 시 0 복원
            if (shakeT.Count > 0)
            {
                var keys = new List<RectTransform>(shakeT.Keys);
                foreach (var g in keys)
                {
                    float tt = shakeT[g] - dt;
                    if (tt <= 0f)
                    {
                        g.anchoredPosition = new Vector2(0f, g.anchoredPosition.y);
                        shakeT.Remove(g);
                    }
                    else
                    {
                        shakeT[g] = tt;
                        float amp = Mathf.Sin(tt * 60f) * tt * 14f;
                        g.anchoredPosition = new Vector2(amp, g.anchoredPosition.y);
                    }
                }
            }
        }

        void RefreshBoss(Game game)
        {
            bossRoot.gameObject.SetActive(!game.Over);
            if (game.Over) return;

            bool cd = game.BossCooldown > 0f;
            int summonable = -1; // 소환 가능한 최고 단계
            for (int i = 0; i < bossButtons.Length; i++)
                if (game.CanSummonBossLevel(i + 1)) summonable = i;
            float pulse = 0.5f + 0.5f * Mathf.Sin(Time.unscaledTime * 4f);

            for (int i = 0; i < bossButtons.Length; i++)
            {
                int level = i + 1;
                bool unlocked = level <= game.MaxBossLevel;
                var b = bossButtons[i];
                b.Label.text = i < ROMAN.Length ? ROMAN[i] : $"Lv{level}";

                if (!unlocked)
                {
                    // 잠금 = 자물쇠 형태(색 제거 캡처에서도 구분) + 세부 비움
                    b.Detail.text = "";
                    b.SetReasonMark(HudIcon.Lock, UiTheme.TextFaint);
                    lastBossCmds[i] = $"Lv{level - 1}을 처치하면 해금됩니다.";
                }
                else if (cd)
                {
                    // 쿨타임 = 전폭 게이지가 담당 → 칸은 남은 초만
                    b.Detail.text = $"{Mathf.CeilToInt(game.BossCooldown)}s";
                    b.ClearReasonMark();
                    lastBossCmds[i] = $"Lv{level} 적장 · 소환 쿨타임 {Mathf.CeilToInt(game.BossCooldown)}초.";
                }
                else
                {
                    b.Detail.text = $"+{Balance.BOSS_KILL_MINERAL[i]}";
                    b.ClearReasonMark();
                    lastBossCmds[i] = $"Lv{level} 적장 소환 · 처치 보상 +{Balance.BOSS_KILL_MINERAL[i]} 금화.";
                }
                b.Interactable = game.CanSummonBossLevel(level);

                // 최고 소환가능 단계만 맥동(주스), 나머지는 안정. Interactable 세팅 다음에 색 지정.
                b.Label.color = (i == summonable && !cd)
                    ? Color.Lerp(UiTheme.TextMain, BOSS_COL, pulse)
                    : UiTheme.TextMain;
            }

            // 공용 쿨타임 게이지 — 봉인이 풀리는 진행도
            bossCd.bg.gameObject.SetActive(cd);
            if (cd)
                UiKit.SetBar(bossCd.fill,
                    1f - game.BossCooldown / Mathf.Max(0.01f, Balance.BOSS_COOLDOWN_SECONDS));
        }

        void RefreshTop(Game game)
        {
            // 자원 획득 → 베젤 광택(표시값보다 목표가 크게 앞서면). Max 상한으로 폭주 방지.
            if (game.Mineral > displayMineral + 2f || game.Gas > displayGas + 1f)
                resGlint = Mathf.Max(resGlint, 1f);

            // 금화·마정석·점수 카운트업 — 벌었을 때 숫자가 굴러 올라가는 주스 (전부 unscaled)
            displayMineral = Mathf.Abs(displayMineral - game.Mineral) < 1.5f
                ? game.Mineral
                : Mathf.Lerp(displayMineral, game.Mineral, Time.unscaledDeltaTime * 9f);
            displayGas = Mathf.Abs(displayGas - game.Gas) < 1.5f
                ? game.Gas
                : Mathf.Lerp(displayGas, game.Gas, Time.unscaledDeltaTime * 9f);
            displayScore = Mathf.Abs(displayScore - game.ScoreValue) < 8f
                ? game.ScoreValue
                : Mathf.Lerp(displayScore, game.ScoreValue, Time.unscaledDeltaTime * 9f);

            var waveType = Balance.WaveTypeOf(Mathf.Max(1, game.Round) + 1);
            string notice = waveType.Id == Balance.WaveTypeId.Normal
                ? ""
                : $" · <color=#A94832>다음: {waveType.Label}!</color>";
            topLeft.text =
                $"<size=12><color=#B9A98B>R{Mathf.Max(1, game.Round)}</color></size>  " +
                $"<b><size=17>{Mathf.CeilToInt(Mathf.Max(0, game.RoundTimer))}s</size></b>{notice}";

            // 수치만 찍는다 — 자원의 정체는 옆의 글리프가 말한다 (유니코드 때우기 폐기)
            mineralText.text = Mathf.RoundToInt(displayMineral).ToString();
            gasText.text = Mathf.RoundToInt(displayGas).ToString();
            probeText.text = game.Probes.ToString();

            lifeText.text = game.Lives.ToString();
            killText.text = game.Kills.ToString();
            scoreText.text = Mathf.RoundToInt(displayScore).ToString("N0");

            msgText.text = $"<color=#756A58>{game.Message}</color>";

            // 델타 감지 발화 — 첫 프레임은 int.MinValue 캐시로 오발화를 막는다
            if (lastLives != int.MinValue && game.Lives < lastLives)
            {
                lifeVignetteE = Mathf.Max(lifeVignetteE, 1f);
                FireShake(lifeGroup);
            }
            lastLives = game.Lives;
            if (lastRound != int.MinValue && game.Round > lastRound)
                statusGlint = Mathf.Max(statusGlint, 1f);
            lastRound = game.Round;
            if (lastMaxBoss != int.MinValue && game.MaxBossLevel > lastMaxBoss)
                bossGlint = Mathf.Max(bossGlint, 1f);
            lastMaxBoss = game.MaxBossLevel;
        }

        void SetInfoAccent(Color accent, string eyebrow)
        {
            infoAccent.color = accent;
            infoEyebrow.color = accent;
            infoEyebrow.text = eyebrow;
        }

        void RefreshSelection(Game game)
        {
            var sel = view.Selection;
            bool hpVisible = false, xpVisible = false, skillVisible = false;

            if (sel.IsHero)
            {
                var hero = game.Hero;
                var stats = hero.Stats;
                SetInfoAccent(UiTheme.HeroCol, "영웅");
                selTitle.text = $"영웅 <color=#B08CFF>Lv{hero.Level}</color>";
                selMeta.text = hero.Alive
                    ? $"<color=#8A93AD>HP {Mathf.CeilToInt(hero.Hp)}/{stats.MaxHp:0} · XP {Mathf.FloorToInt(hero.Xp)}/{hero.XpNeeded}</color>"
                    : $"<color=#FF5A3C>부활 {Mathf.CeilToInt(hero.RespawnTimer)}s</color>";
                hpVisible = xpVisible = true;
                UiKit.SetBar(selHpBar.fill, hero.Alive ? hero.Hp / stats.MaxHp : 0f);
                UiKit.SetBar(selXpBar.fill, hero.Xp / Mathf.Max(1f, hero.XpNeeded));

                float dps = stats.Damage / stats.AttackInterval;
                selStats.text =
                    $"공격력 <color=#E8ECF6>{stats.Damage:0}</color> · DPS <color=#E8ECF6>{dps:0}</color> · 사거리 {stats.Range:0}";

                var augs = new System.Text.StringBuilder();
                foreach (var c in hero.AugmentCards)
                    augs.Append($"<color={Augments.RARITIES[c.Rarity].Color}>[{c.Augment.Name}]</color> ");
                foreach (var s in Augments.ActiveSynergies(hero.AugmentCards))
                    augs.Append($"<color=#FFD23F>★{s.Name}</color> ");

                var skill = hero.Skill;
                string skillLine = "";
                if (skill != null)
                {
                    skillVisible = true;
                    UiKit.SetBar(skillBar.fill,
                        1f - Mathf.Max(0f, hero.SkillCooldown) / Mathf.Max(0.01f, skill.Cooldown));
                    skillLine = $"스킬 <color=#7CE7FF>{skill.Def.Name}</color> · ";
                }
                selBody.text = $"{skillLine}{augs}";
            }
            else if (sel.IsTower && sel.Slot?.Tower != null)
            {
                var tower = sel.Slot.Tower;
                var raceColor = UiTheme.Hex(Units.RACE_COLOR[(int)tower.Def.Race]);
                SetInfoAccent(raceColor, "타워");
                selTitle.text =
                    $"<color={Units.RACE_COLOR[(int)tower.Def.Race]}>{tower.Def.Name}</color>";
                selMeta.text = $"<color=#8A93AD>{Units.TIER_LABEL[tower.Tier]}</color>";
                float dmg = Combat.Damage(tower, game.Upgrades);
                float interval = Combat.AttackInterval(tower);
                selStats.text =
                    $"공격력 <color=#E8ECF6>{dmg:0}</color> · DPS <color=#E8ECF6>{dmg / interval:0}</color> · 사거리 {Combat.Range(tower):0}";
                selBody.text = $"【 {Units.TagLabel(tower.Def)} 】";
            }
            else if (sel.IsEmptyTile)
            {
                SetInfoAccent(UiTheme.Build, "건설");
                selTitle.text = "빈 타일";
                selMeta.text = "";
                selStats.text = "";
                selBody.text = $"유닛 생성 <color=#8FD6FF>{game.SpawnCost} 금화</color>";
            }
            else
            {
                SetInfoAccent(UiTheme.TextDim, "전장");
                selTitle.text = "<color=#8A93AD>전체</color>";
                selMeta.text = "";
                selStats.text = "";
                selBody.text =
                    $"좌클릭 선택 · 우클릭 영웅 이동" +
                    $"\n웨이브 클리어 → <color=#8FD6FF>+{Balance.WaveReward(Mathf.Max(1, game.Round))}</color>" +
                    $"\n영웅딜 {game.HeroDamageDealt:N0} · 타워딜 {game.TowerDamageDealt:N0}";
            }

            selHpBar.bg.gameObject.SetActive(hpVisible);
            selXpBar.bg.gameObject.SetActive(xpVisible);
            skillBar.bg.gameObject.SetActive(skillVisible);
            selStats.gameObject.SetActive(selStats.text.Length > 0);

            // 게이지·핵심수치 유무에 따라 본문 시작 위치를 당긴다
            var bodyRt = selBody.rectTransform;
            bodyRt.offsetMax = new Vector2(bodyRt.offsetMax.x, hpVisible ? -100f : -68f);
        }

        void RefreshCard(Game game)
        {
            cardTitle.text = CommandCard.PageTitle(view.Selection, view.Page) +
                (view.Page != CardPage.Root ? " · Esc" : "");
            var cmds = CommandCard.Build(game, view.Selection, view.Page);
            for (int i = 0; i < CommandCard.SLOTS; i++)
            {
                var btn = cardButtons[i];
                var cmd = cmds[i];
                bool active = !cmd.IsEmpty;
                btn.gameObject.SetActive(active);
                if (!active) continue;

                btn.SetHotkey(CommandCard.HOTKEY_LABELS[i], cmd.Accent);
                btn.SetIcon(cmd.Icon, cmd.IconTint);
                btn.Label.text = cmd.Label;
                btn.Detail.text = cmd.Detail ?? "";
                btn.Interactable = cmd.Enabled;

                // 비활성 사유 시각화 — 색 없이도 배지/글리프로 구분 (§7.10 게이트)
                if (!cmd.Enabled && (cmd.Reason == DisableReason.Cost || cmd.Reason == DisableReason.Capped))
                {
                    btn.SetBadge("!", UiTheme.Danger);
                    btn.ClearReasonMark();
                }
                else if (!cmd.Enabled && cmd.Reason == DisableReason.Locked)
                {
                    btn.ClearBadge();
                    btn.SetReasonMark(HudIcon.Lock, UiTheme.TextFaint);
                }
                else if (!cmd.Enabled && cmd.Reason == DisableReason.Cooldown)
                {
                    btn.ClearBadge();
                    btn.SetReasonMark(HudIcon.Cooldown, UiTheme.TextDim);
                }
                else
                {
                    btn.ClearBadge();
                    btn.ClearReasonMark();
                }
            }
            lastCmds = cmds;

            RefreshTooltip();
        }

        /// <summary>hover된 커맨드/보스 버튼을 폴링해 공용 툴팁을 띄운다 (이벤트 배선 없이).</summary>
        void RefreshTooltip()
        {
            string tip = null;
            for (int i = 0; i < cardButtons.Length; i++)
            {
                var b = cardButtons[i];
                if (b.gameObject.activeSelf && b.Hovered && lastCmds != null && lastCmds[i].Tooltip != null)
                {
                    tip = lastCmds[i].Tooltip;
                    break;
                }
            }
            if (tip == null && lastBossCmds != null)
            {
                for (int i = 0; i < bossButtons.Length; i++)
                {
                    var b = bossButtons[i];
                    if (b.gameObject.activeSelf && b.Hovered && lastBossCmds[i] != null)
                    {
                        tip = lastBossCmds[i];
                        break;
                    }
                }
            }
            bool show = tip != null;
            if (tooltipRoot.gameObject.activeSelf != show) tooltipRoot.gameObject.SetActive(show);
            if (show) tooltipText.text = tip;
        }

        // ───────── 오버레이 (증강 / 게임오버) ─────────

        enum OverlayMode { None, Augment, GameOver }
        OverlayMode overlayMode;

        void RefreshOverlay(Game game)
        {
            OverlayMode mode =
                game.Over ? OverlayMode.GameOver
                : game.AugmentChoices.Count > 0 ? OverlayMode.Augment
                : OverlayMode.None;

            overlayMode = mode;
            overlayDim.gameObject.SetActive(mode != OverlayMode.None);
            if (mode == OverlayMode.None) return;

            switch (mode)
            {
                case OverlayMode.Augment: RefreshAugmentOverlay(game); break;
                case OverlayMode.GameOver: RefreshGameOver(game); break;
            }
        }

        void RefreshAugmentOverlay(Game game)
        {
            overlayTitle.text = "증강 선택";
            overlaySub.text = $"영웅 Lv{game.Hero.Level} — 하나를 고르세요";

            for (int i = 0; i < 3; i++)
            {
                var btn = overlayCards[i];
                bool active = i < game.AugmentChoices.Count;
                btn.gameObject.SetActive(active);
                if (!active) continue;
                var choice = game.AugmentChoices[i];
                var rarity = Augments.RARITIES[choice.Rarity];
                btn.Label.text =
                    $"<color={Augments.KindColor(choice.Augment.Kind)}><size=10>{Augments.KindLabel(choice.Augment.Kind)}</size></color>" +
                    $"  <color={rarity.Color}>{rarity.Label}</color>\n<b>{choice.Augment.Name}</b>";
                btn.Detail.text = choice.Augment.Description;
                btn.Interactable = true;
            }

            int left = Augments.AUGMENT_REROLL_MAX - game.RerollsUsed;
            overlayAction.gameObject.SetActive(true);
            overlayAction.Label.text = left > 0 ? $"리롤 — {game.RerollCost} 마정석 ({left}회)" : "리롤 소진";
            overlayAction.Detail.text = "";
            overlayAction.Interactable = game.CanReroll;
        }

        void RefreshGameOver(Game game)
        {
            overlayTitle.text = $"{game.ScoreValue:N0}점";
            overlaySub.text =
                $"{game.Round}라운드 · {game.Kills}킬 · 보스 Lv{game.BossCleared} · 영웅 Lv{game.Hero.Level}";
            foreach (var c in overlayCards) c.gameObject.SetActive(false);
            overlayAction.gameObject.SetActive(true);
            overlayAction.Label.text = "다시 시작";
            overlayAction.Detail.text = "";
            overlayAction.Interactable = true;
        }

        void ClickOverlayCard(int index)
        {
            var game = view.Game;
            if (overlayMode == OverlayMode.Augment) game.ChooseAugment(index);
        }

        void ClickOverlayAction()
        {
            var game = view.Game;
            if (overlayMode == OverlayMode.Augment) game.RerollAugments();
            else if (overlayMode == OverlayMode.GameOver) view.Restart();
        }
    }
}
