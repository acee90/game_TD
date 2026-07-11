// 원본: web/src/ui/ui.ts의 정보 구성 — uGUI + TMP 재구현 (2026-07-12, HUD 재설계 §3)
// ───────── 서비스 룩 HUD ─────────
// 상단 얇은 자원 바 + 하단 커맨드 바(선택 정보 | 상세 | 3×3 커맨드 카드).
// 보드 위 오버레이 픽셀 0 (HUD 재설계 §1). 스탯·증강·게임오버는 전면 오버레이 카드.
// 프리팹 없음 — UiTheme(토큰·스프라이트)·UiKit(원자)로 코드 조립. 폰트만 커밋 에셋.

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

        // ── 하단 바 ──
        RectTransform bottomBar;
        TextMeshProUGUI selTitle;    // 좌: 선택 대상
        TextMeshProUGUI selBody;
        (Image bg, Image fill) selHpBar;
        (Image bg, Image fill) selXpBar;
        TextMeshProUGUI detailBody;  // 중: 상세
        (Image bg, Image fill) skillBar;
        TextMeshProUGUI cardTitle;   // 우: 커맨드 카드
        readonly HudButton[] cardButtons = new HudButton[CommandCard.SLOTS];

        // ── 오버레이 ──
        Image overlayDim;
        TextMeshProUGUI overlayTitle;
        TextMeshProUGUI overlaySub;
        readonly List<HudButton> overlayCards = new List<HudButton>();
        HudButton overlayAction;     // 리롤 / 다시 시작

        int builtW, builtH;
        float displayMineral;        // 카운트업 주스

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
            BuildBottomBar();
            BuildOverlay();
            ApplyLayout();
        }

        static float CellSize() => Mathf.Clamp(Screen.height * 0.052f, 40f, 60f);
        static float BottomHeight() => CellSize() * 3f + 20f;
        const float TOP_H = 34f;

        void BuildTopBar()
        {
            var panel = UiKit.Panel("TopBar", root, UiTheme.PanelBg, 0);
            topBar = panel.rectTransform;

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

        void BuildBottomBar()
        {
            var panel = UiKit.Panel("BottomBar", root, UiTheme.PanelBg, 0);
            bottomBar = panel.rectTransform;

            // 좌 22%: 선택 대상
            var sel = UiKit.Panel("Selection", bottomBar, UiTheme.Hex("#0A101F", 0.6f), UiTheme.RadiusPanel, 1);
            UiKit.Rect(sel.gameObject, bottomBar, new Vector2(0, 0), new Vector2(0.22f, 1),
                new Vector2(UiTheme.Pad, UiTheme.Pad), new Vector2(-UiTheme.Gap / 2f, -UiTheme.Pad));
            sel.raycastTarget = false;

            selTitle = UiKit.Text("Title", sel.transform, UiTheme.FontLabel, UiTheme.TextMain,
                TextAlignmentOptions.TopLeft, FontStyles.Bold);
            UiKit.Rect(selTitle.gameObject, sel.transform, new Vector2(0, 0.72f), Vector2.one,
                new Vector2(UiTheme.Pad, 0), new Vector2(-UiTheme.Pad, -6f));

            selHpBar = UiKit.Bar("Hp", sel.transform, UiTheme.Hex("#70DC8C"));
            UiKit.Rect(selHpBar.bg.gameObject, sel.transform, new Vector2(0, 0.60f), new Vector2(1, 0.68f),
                new Vector2(UiTheme.Pad, 0), new Vector2(-UiTheme.Pad, 0));
            selXpBar = UiKit.Bar("Xp", sel.transform, UiTheme.Gold);
            UiKit.Rect(selXpBar.bg.gameObject, sel.transform, new Vector2(0, 0.48f), new Vector2(1, 0.56f),
                new Vector2(UiTheme.Pad, 0), new Vector2(-UiTheme.Pad, 0));

            selBody = UiKit.Text("Body", sel.transform, UiTheme.FontCaption, UiTheme.TextDim,
                TextAlignmentOptions.TopLeft);
            UiKit.Rect(selBody.gameObject, sel.transform, Vector2.zero, new Vector2(1, 0.46f),
                new Vector2(UiTheme.Pad, 6f), new Vector2(-UiTheme.Pad, 0));

            // 중 48%: 상세
            var det = UiKit.Panel("Details", bottomBar, UiTheme.Hex("#0A101F", 0.6f), UiTheme.RadiusPanel, 1);
            UiKit.Rect(det.gameObject, bottomBar, new Vector2(0.22f, 0), new Vector2(0.70f, 1),
                new Vector2(UiTheme.Gap / 2f, UiTheme.Pad), new Vector2(-UiTheme.Gap / 2f, -UiTheme.Pad));
            det.raycastTarget = false;

            detailBody = UiKit.Text("Body", det.transform, UiTheme.FontSmall, UiTheme.TextDim,
                TextAlignmentOptions.TopLeft);
            UiKit.Rect(detailBody.gameObject, det.transform, new Vector2(0, 0.2f), Vector2.one,
                new Vector2(UiTheme.Pad, 4f), new Vector2(-UiTheme.Pad, -8f));

            skillBar = UiKit.Bar("Skill", det.transform, UiTheme.Hex("#7CE7FF"));
            UiKit.Rect(skillBar.bg.gameObject, det.transform, new Vector2(0, 0.06f), new Vector2(1, 0.16f),
                new Vector2(UiTheme.Pad, 0), new Vector2(-UiTheme.Pad, 0));

            // 우 30%: 커맨드 카드 3×3
            var card = UiKit.Panel("Card", bottomBar, UiTheme.Hex("#0A101F", 0.6f), UiTheme.RadiusPanel, 1);
            UiKit.Rect(card.gameObject, bottomBar, new Vector2(0.70f, 0), Vector2.one,
                new Vector2(UiTheme.Gap / 2f, UiTheme.Pad), new Vector2(-UiTheme.Pad, -UiTheme.Pad));
            card.raycastTarget = false;

            cardTitle = UiKit.Text("Title", card.transform, UiTheme.FontCaption, UiTheme.TextFaint,
                TextAlignmentOptions.TopRight);
            UiKit.Rect(cardTitle.gameObject, card.transform, new Vector2(0, 0.9f), Vector2.one,
                new Vector2(6f, 0), new Vector2(-8f, -2f));

            for (int i = 0; i < CommandCard.SLOTS; i++)
            {
                int captured = i;
                var btn = UiKit.Button($"Cmd{i}", card.transform, () => InvokeCard(captured));
                int col = i % 3, row = i / 3;
                float x0 = 0.03f + col * 0.3166f, x1 = x0 + 0.30f;
                float y1 = 0.90f - row * 0.2933f, y0 = y1 - 0.28f;
                UiKit.Rect(btn.gameObject, card.transform,
                    new Vector2(x0, y0), new Vector2(x1, y1), Vector2.zero, Vector2.zero);
                cardButtons[i] = btn;
            }
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
            float bottom = BottomHeight();

            UiKit.Rect(topBar.gameObject, root, new Vector2(0, 1), Vector2.one,
                new Vector2(0, -TOP_H), Vector2.zero);
            UiKit.Rect(bottomBar.gameObject, root, Vector2.zero, new Vector2(1, 0),
                Vector2.zero, new Vector2(0, bottom));
        }

        // ───────── GameView 연동 ─────────

        /// <summary>보드 클릭과 HUD 클릭을 가른다 — 상·하단 바와 오버레이 영역</summary>
        public bool IsPointerOverHud(Vector2 mouseScreenPos)
        {
            if (overlayDim != null && overlayDim.gameObject.activeSelf) return true;
            return mouseScreenPos.y >= Screen.height - TOP_H || mouseScreenPos.y <= BottomHeight();
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
        }

        void RefreshSelection(Game game)
        {
            var sel = view.Selection;
            bool hpVisible = false, xpVisible = false;

            if (sel.IsHero)
            {
                var hero = game.Hero;
                var stats = hero.Stats;
                selTitle.text = $"영웅 <color=#B08CFF>Lv{hero.Level}</color>";
                hpVisible = xpVisible = true;
                UiKit.SetBar(selHpBar.fill, hero.Alive ? hero.Hp / stats.MaxHp : 0f);
                UiKit.SetBar(selXpBar.fill, hero.Xp / Mathf.Max(1f, hero.XpNeeded));
                selBody.text = hero.Alive
                    ? $"HP {Mathf.CeilToInt(hero.Hp)}/{stats.MaxHp:0} · XP {Mathf.FloorToInt(hero.Xp)}/{hero.XpNeeded}"
                    : $"부활 {Mathf.CeilToInt(hero.RespawnTimer)}s";
            }
            else if (sel.IsTower && sel.Slot?.Tower != null)
            {
                var tower = sel.Slot.Tower;
                selTitle.text =
                    $"<color={Units.RACE_COLOR[(int)tower.Def.Race]}>{tower.Def.Name}</color> " +
                    $"<size=11><color=#8A93AD>{Units.TIER_LABEL[tower.Tier]}</color></size>";
                selBody.text = $"【 {Units.TagLabel(tower.Def)} 】";
            }
            else if (sel.IsEmptyTile)
            {
                selTitle.text = "빈 타일";
                selBody.text = $"유닛 생성 {game.SpawnCost} 미네랄";
            }
            else
            {
                selTitle.text = "<color=#8A93AD>전체</color>";
                selBody.text = "좌클릭 선택 · 우클릭 영웅 이동";
            }

            selHpBar.bg.gameObject.SetActive(hpVisible);
            selXpBar.bg.gameObject.SetActive(xpVisible);
            RefreshDetails(game);
        }

        void RefreshDetails(Game game)
        {
            var sel = view.Selection;
            bool skillVisible = false;

            if (sel.IsHero)
            {
                var hero = game.Hero;
                var stats = hero.Stats;
                float dps = stats.Damage / stats.AttackInterval;
                string line1 =
                    $"공격력 <color=#E8ECF6>{stats.Damage:0}</color> · DPS <color=#E8ECF6>{dps:0}</color>" +
                    $" · 사거리 {stats.Range:0}" +
                    $" · 힘 {hero.Bought.Str} 민첩 {hero.Bought.Agi} 지능 {hero.Bought.Int}";

                var augs = new System.Text.StringBuilder();
                foreach (var c in hero.AugmentCards)
                    augs.Append($"<color={Augments.RARITIES[c.Rarity].Color}>[{c.Augment.Name}]</color> ");
                foreach (var s in Augments.ActiveSynergies(hero.AugmentCards))
                    augs.Append($"<color=#FFD23F>★{s.Name}</color> ");

                var skill = hero.Skill;
                string line3 = "";
                if (skill != null)
                {
                    skillVisible = true;
                    UiKit.SetBar(skillBar.fill,
                        1f - Mathf.Max(0f, hero.SkillCooldown) / Mathf.Max(0.01f, skill.Cooldown));
                    line3 = $"\n스킬 <color=#7CE7FF>{skill.Def.Name}</color> — 자동 시전";
                }
                detailBody.text = line1 + "\n" + augs + line3;
            }
            else if (sel.IsTower && sel.Slot?.Tower != null)
            {
                var tower = sel.Slot.Tower;
                float dmg = Combat.Damage(tower, game.Upgrades);
                float interval = Combat.AttackInterval(tower);
                detailBody.text =
                    $"공격력 <color=#E8ECF6>{dmg:0}</color> · 간격 {interval:0.00}s" +
                    $" · DPS <color=#E8ECF6>{dmg / interval:0}</color> · 사거리 {Combat.Range(tower):0}" +
                    $"\n<color=#5A6480>{game.Message}</color>";
            }
            else
            {
                detailBody.text =
                    $"웨이브 클리어 → <color=#8FD6FF>+{Balance.WaveReward(Mathf.Max(1, game.Round))}</color>" +
                    $" · 영웅딜 {game.HeroDamageDealt:N0} · 타워딜 {game.TowerDamageDealt:N0}" +
                    $"\n<color=#5A6480>{game.Message}</color>";
            }

            skillBar.bg.gameObject.SetActive(skillVisible);
        }

        void RefreshCard(Game game)
        {
            cardTitle.text = CommandCard.PageTitle(view.Selection, view.Page) +
                (view.Page != CardPage.Root ? " · Esc 뒤로" : "");
            var cmds = CommandCard.Build(game, view.Selection, view.Page);
            for (int i = 0; i < CommandCard.SLOTS; i++)
            {
                var btn = cardButtons[i];
                var cmd = cmds[i];
                bool active = !cmd.IsEmpty;
                btn.gameObject.SetActive(active);
                if (!active) continue;

                string hex = ColorUtility.ToHtmlStringRGB(cmd.Accent);
                btn.Label.text =
                    $"<size=9><color=#{hex}>{CommandCard.HOTKEY_LABELS[i]}</color></size>  {cmd.Label}";
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
