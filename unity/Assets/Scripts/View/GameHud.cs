// 원본: web/src/ui/ui.ts의 정보 구성 — uGUI + TMP 재구현 (2026-07-12, HUD 재설계 §3)
// ───────── 서비스 룩 HUD: 모서리 패널 ─────────
// 상단 얇은 자원 바 + 좌하단 '정보' 카드 + 우하단 3×3 커맨드 카드 (스타/워크 모서리식).
// 하단 전폭 바를 없애 보드가 화면 대부분을 차지한다. 두 카드는 그림자를 깔고 떠 있다.
// 스탯·증강·게임오버는 전면 오버레이. 프리팹 없음 — UiTheme·UiKit으로 코드 조립.

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

        // ── 상단 바 ──
        RectTransform topBar;
        TextMeshProUGUI topLeft;    // 라운드 · 타이머 · 다음 웨이브
        TextMeshProUGUI topCenter;  // 자원
        TextMeshProUGUI topRight;   // 라이프 · 킬 · 점수

        // ── 좌하단: 선택 정보 ──
        RectTransform infoRoot;      // 그림자 루트 (배치 단위)
        Image infoAccent;
        TextMeshProUGUI infoEyebrow;
        TextMeshProUGUI selTitle;
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

        TextMeshProUGUI msgText;     // 하단 중앙 시스템 메시지 (패널 없음)

        // ── 오버레이 ──
        Image overlayDim;
        TextMeshProUGUI overlayTitle;
        TextMeshProUGUI overlaySub;
        readonly List<HudButton> overlayCards = new List<HudButton>();
        HudButton overlayAction;     // 리롤 / 다시 시작

        int builtW, builtH;
        float displayMineral;        // 카운트업 주스
        float infoW, infoH, cardW, cardH; // IsPointerOverHud용 — ApplyLayout에서 계산

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
            BuildCardPanel();
            BuildMessage();
            BuildOverlay();
            ApplyLayout();
        }

        static float CellW() => Mathf.Clamp(Screen.height * 0.135f, 64f, 84f);
        static float CellH() => Mathf.Clamp(Screen.height * 0.088f, 42f, 54f);
        const float TOP_H = 34f;
        const float CARD_HEADER = 24f;

        void BuildTopBar()
        {
            var panel = UiKit.Panel("TopBar", root, UiTheme.PanelBg, 0);
            topBar = panel.rectTransform;

            // 하단 헤어라인 — 바가 보드 위에 '얹혀' 보이게
            var line = UiKit.Panel("Hairline", topBar, UiTheme.PanelStroke, 0);
            UiKit.Rect(line.gameObject, topBar, Vector2.zero, new Vector2(1, 0),
                Vector2.zero, new Vector2(0, 1f));
            line.raycastTarget = false;

            topLeft = UiKit.Text("Left", topBar, UiTheme.FontSmall, UiTheme.TextMain,
                TextAlignmentOptions.Left);
            UiKit.Rect(topLeft.gameObject, topBar, new Vector2(0, 0), new Vector2(0.34f, 1),
                new Vector2(UiTheme.Pad, 0), Vector2.zero);

            topCenter = UiKit.Text("Center", topBar, UiTheme.FontSmall, UiTheme.TextMain,
                TextAlignmentOptions.Center);
            UiKit.Rect(topCenter.gameObject, topBar, new Vector2(0.34f, 0), new Vector2(0.66f, 1),
                Vector2.zero, Vector2.zero);

            topRight = UiKit.Text("Right", topBar, UiTheme.FontSmall, UiTheme.TextMain,
                TextAlignmentOptions.Right);
            UiKit.Rect(topRight.gameObject, topBar, new Vector2(0.66f, 0), new Vector2(1, 1),
                Vector2.zero, new Vector2(-UiTheme.Pad, 0));
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

        /// <summary>우하단 커맨드 카드 — 헤더 + 3×3 그리드, 핫키 칩</summary>
        void BuildCardPanel()
        {
            var (body, eyebrow) = UiKit.FloatingPanel("Card", root, UiTheme.Build, "커맨드");
            cardRoot = body.transform.parent.GetComponent<RectTransform>();
            cardBody = body.rectTransform;
            cardTitle = eyebrow;

            for (int i = 0; i < CommandCard.SLOTS; i++)
            {
                // 소켓 — 커맨드가 비어도 3×3 구조가 읽힌다 (스타크래프트식)
                cardSockets[i] = UiKit.Panel($"Socket{i}", cardBody,
                    UiTheme.Hex("#0E1526", 0.85f), UiTheme.RadiusButton);
                cardSockets[i].raycastTarget = false;

                int captured = i;
                var btn = UiKit.Button($"Cmd{i}", cardBody, () => InvokeCard(captured));
                // 칩 아래 중앙 라벨 + 하단 세부 — 그리드 배치는 ApplyLayout에서
                btn.Label.alignment = TextAlignmentOptions.Center;
                btn.Label.fontSize = UiTheme.FontCaption + 1.5f;
                UiKit.Rect(btn.Label.gameObject, btn.transform, Vector2.zero, Vector2.one,
                    new Vector2(2f, 12f), new Vector2(-2f, -16f));
                btn.Detail.fontSize = 8.5f;
                UiKit.Rect(btn.Detail.gameObject, btn.transform, Vector2.zero, Vector2.one,
                    new Vector2(2f, 3f), new Vector2(-2f, -3f));
                cardButtons[i] = btn;
            }
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
            overlayDim = UiKit.Panel("Overlay", root, new Color(0.02f, 0.03f, 0.07f, 0.86f), 0);
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
                btn.Label.alignment = TextAlignmentOptions.Top;
                btn.Label.fontSize = UiTheme.FontLabel;
                btn.Detail.alignment = TextAlignmentOptions.Center;
                btn.Detail.fontSize = UiTheme.FontCaption;
                overlayCards.Add(btn);
            }

            overlayAction = UiKit.Button("Action", overlayDim.transform, ClickOverlayAction, 10f);
            UiKit.Rect(overlayAction.gameObject, overlayDim.transform,
                new Vector2(0.40f, 0.24f), new Vector2(0.60f, 0.30f), Vector2.zero, Vector2.zero);

            overlayDim.gameObject.SetActive(false);
        }

        void ApplyLayout()
        {
            builtW = Screen.width;
            builtH = Screen.height;

            UiKit.Rect(topBar.gameObject, root, new Vector2(0, 1), Vector2.one,
                new Vector2(0, -TOP_H), Vector2.zero);

            // 우하단 커맨드 카드 — 셀 크기에서 패널 크기를 역산
            float cw = CellW(), ch = CellH();
            float gap = UiTheme.Gap;
            cardW = cw * 3f + gap * 2f + UiTheme.Pad * 2f;
            cardH = ch * 3f + gap * 2f + CARD_HEADER + UiTheme.Pad;
            // 그림자 여백(8,12,-8,-4)을 감안해 루트를 카드보다 크게 잡는다
            UiKit.Rect(cardRoot.gameObject, root, new Vector2(1, 0), new Vector2(1, 0),
                new Vector2(-(cardW + 24f), 0f), new Vector2(0f, cardH + 16f));

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
            infoW = Mathf.Clamp(Screen.width * 0.30f, 280f, 360f);
            infoH = 128f;
            UiKit.Rect(infoRoot.gameObject, root, Vector2.zero, Vector2.zero,
                new Vector2(0f, 0f), new Vector2(infoW + 24f, infoH + 16f));
        }

        // ───────── GameView 연동 ─────────

        /// <summary>보드 클릭과 HUD 클릭을 가른다 — 상단 바, 두 모서리 카드, 오버레이</summary>
        public bool IsPointerOverHud(Vector2 mouseScreenPos)
        {
            if (overlayDim != null && overlayDim.gameObject.activeSelf) return true;
            if (mouseScreenPos.y >= Screen.height - TOP_H) return true;
            if (mouseScreenPos.x <= infoW + 16f && mouseScreenPos.y <= infoH + 12f) return true;
            if (mouseScreenPos.x >= Screen.width - cardW - 16f && mouseScreenPos.y <= cardH + 12f) return true;
            return false;
        }

        void InvokeCard(int index)
        {
            var cmds = CommandCard.Build(view.Game, view.Selection, view.Page);
            view.InvokeCommand(cmds[index]);
        }

        // ───────── 매 프레임 갱신 ─────────

        void Update()
        {
            var game = view.Game;
            if (builtW != Screen.width || builtH != Screen.height) ApplyLayout();

            RefreshTop(game);
            RefreshSelection(game);
            RefreshCard(game);
            RefreshOverlay(game);
        }

        void RefreshTop(Game game)
        {
            // 미네랄 카운트업 — 벌었을 때 숫자가 굴러 올라가는 주스
            displayMineral = Mathf.Abs(displayMineral - game.Mineral) < 1.5f
                ? game.Mineral
                : Mathf.Lerp(displayMineral, game.Mineral, Time.unscaledDeltaTime * 9f);

            var waveType = Balance.WaveTypeOf(Mathf.Max(1, game.Round) + 1);
            string notice = waveType.Id == Balance.WaveTypeId.Normal
                ? ""
                : $" · <color=#FF5A3C>다음: {waveType.Label}!</color>";
            topLeft.text =
                $"<b>R{Mathf.Max(1, game.Round)}</b>" +
                $" <color=#5A6480>다음 {Mathf.CeilToInt(Mathf.Max(0, game.RoundTimer))}s</color>{notice}";

            topCenter.text =
                $"<color=#8FD6FF>◆ {Mathf.RoundToInt(displayMineral)}</color>   " +
                $"<color=#6FDC8C>● {game.Gas}</color>   " +
                $"<color=#B08CFF>프로브 {game.Probes}</color>";

            topRight.text =
                $"<color=#FF5A3C>♥ {game.Lives}</color>  " +
                $"<color=#5A6480>킬 {game.Kills}</color>  " +
                $"<color=#FFD23F>{game.ScoreValue:N0}</color>";

            msgText.text = $"<color=#5A6480>{game.Message}</color>";
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
                selTitle.text = $"영웅 <color=#B08CFF>Lv{hero.Level}</color>" + (hero.Alive
                    ? $"  <size=11><color=#8A93AD>HP {Mathf.CeilToInt(hero.Hp)}/{stats.MaxHp:0} · XP {Mathf.FloorToInt(hero.Xp)}/{hero.XpNeeded}</color></size>"
                    : $"  <size=11><color=#FF5A3C>부활 {Mathf.CeilToInt(hero.RespawnTimer)}s</color></size>");
                hpVisible = xpVisible = true;
                UiKit.SetBar(selHpBar.fill, hero.Alive ? hero.Hp / stats.MaxHp : 0f);
                UiKit.SetBar(selXpBar.fill, hero.Xp / Mathf.Max(1f, hero.XpNeeded));

                float dps = stats.Damage / stats.AttackInterval;
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
                    skillLine = $"\n스킬 <color=#7CE7FF>{skill.Def.Name}</color> — 자동 시전";
                }
                selBody.text =
                    $"공격력 <color=#E8ECF6>{stats.Damage:0}</color> · DPS <color=#E8ECF6>{dps:0}</color>" +
                    $" · 사거리 {stats.Range:0} · 힘 {hero.Bought.Str} 민첩 {hero.Bought.Agi} 지능 {hero.Bought.Int}" +
                    $"\n{augs}{skillLine}";
            }
            else if (sel.IsTower && sel.Slot?.Tower != null)
            {
                var tower = sel.Slot.Tower;
                var raceColor = UiTheme.Hex(Units.RACE_COLOR[(int)tower.Def.Race]);
                SetInfoAccent(raceColor, "타워");
                selTitle.text =
                    $"<color={Units.RACE_COLOR[(int)tower.Def.Race]}>{tower.Def.Name}</color> " +
                    $"<size=12><color=#8A93AD>{Units.TIER_LABEL[tower.Tier]}</color></size>";
                float dmg = Combat.Damage(tower, game.Upgrades);
                float interval = Combat.AttackInterval(tower);
                selBody.text =
                    $"공격력 <color=#E8ECF6>{dmg:0}</color> · 간격 {interval:0.00}s" +
                    $" · DPS <color=#E8ECF6>{dmg / interval:0}</color> · 사거리 {Combat.Range(tower):0}" +
                    $"\n【 {Units.TagLabel(tower.Def)} 】";
            }
            else if (sel.IsEmptyTile)
            {
                SetInfoAccent(UiTheme.Build, "건설");
                selTitle.text = "빈 타일";
                selBody.text = $"유닛 생성 <color=#8FD6FF>{game.SpawnCost} 미네랄</color>";
            }
            else
            {
                SetInfoAccent(UiTheme.TextDim, "전장");
                selTitle.text = "<color=#8A93AD>전체</color>";
                selBody.text =
                    $"좌클릭 선택 · 우클릭 영웅 이동" +
                    $"\n웨이브 클리어 → <color=#8FD6FF>+{Balance.WaveReward(Mathf.Max(1, game.Round))}</color>" +
                    $" · 영웅딜 {game.HeroDamageDealt:N0} · 타워딜 {game.TowerDamageDealt:N0}";
            }

            selHpBar.bg.gameObject.SetActive(hpVisible);
            selXpBar.bg.gameObject.SetActive(xpVisible);
            skillBar.bg.gameObject.SetActive(skillVisible);

            // 게이지가 없으면 본문을 제목 바로 아래로 당긴다
            var bodyRt = selBody.rectTransform;
            bodyRt.offsetMax = new Vector2(bodyRt.offsetMax.x, hpVisible ? -84f : -52f);
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
                btn.Label.text = cmd.Label;
                btn.Detail.text = cmd.Detail ?? "";
                btn.Interactable = cmd.Enabled;
            }
        }

        // ───────── 오버레이 (스탯 / 증강 / 게임오버) ─────────

        enum OverlayMode { None, Stat, Augment, GameOver }
        OverlayMode overlayMode;

        void RefreshOverlay(Game game)
        {
            OverlayMode mode =
                game.Over ? OverlayMode.GameOver
                : game.PendingStatPoints > 0 ? OverlayMode.Stat
                : game.AugmentChoices.Count > 0 ? OverlayMode.Augment
                : OverlayMode.None;

            overlayMode = mode;
            overlayDim.gameObject.SetActive(mode != OverlayMode.None);
            if (mode == OverlayMode.None) return;

            switch (mode)
            {
                case OverlayMode.Stat: RefreshStatOverlay(game); break;
                case OverlayMode.Augment: RefreshAugmentOverlay(game); break;
                case OverlayMode.GameOver: RefreshGameOver(game); break;
            }
        }

        void RefreshStatOverlay(Game game)
        {
            int points = game.PendingStatPoints;
            int queued = game.Hero.PendingStatPoints.Count;
            overlayTitle.text = "레벨 업!";
            overlaySub.text = $"스탯 하나에 +{points}포인트" + (queued > 1 ? $"  (대기 {queued}회)" : "");

            string[] desc =
            {
                $"공격력 +{HeroData.DMG_PER_STR} · 체력 +{HeroData.HP_PER_STR}",
                $"공격 속도 +{HeroData.AS_PER_AGI * 100f:0}%",
                $"스킬 피해 +{HeroData.SKILL_PER_INT * 100f:0.#}%",
            };
            for (int i = 0; i < 3; i++)
            {
                var stat = HeroData.STAT_IDS[i];
                var btn = overlayCards[i];
                btn.gameObject.SetActive(true);
                string last = game.Hero.Focus == stat ? " <color=#FFD23F>●</color>" : "";
                btn.Label.text = $"{HeroData.StatLabel(stat)} +{points}{last}";
                btn.Detail.text = $"{desc[i]}\n보유 {game.Hero.Bought.Of(stat)}pt";
                btn.Interactable = true;
            }
            overlayAction.gameObject.SetActive(false);
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
            overlayAction.Label.text = left > 0 ? $"리롤 — {game.RerollCost} 가스 ({left}회)" : "리롤 소진";
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
            if (overlayMode == OverlayMode.Stat) game.ChooseStat(HeroData.STAT_IDS[index]);
            else if (overlayMode == OverlayMode.Augment) game.ChooseAugment(index);
        }

        void ClickOverlayAction()
        {
            var game = view.Game;
            if (overlayMode == OverlayMode.Augment) game.RerollAugments();
            else if (overlayMode == OverlayMode.GameOver) view.Restart();
        }
    }
}
