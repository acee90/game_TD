// 원본: web/src/ui/ui.ts + web/index.html의 패널 구성 — 프레젠테이션 패스
// ───────── OnGUI 즉시모드 HUD ─────────
// 자원/라운드/점수 · 버튼(유닛 생성, 보스 Lv1~6, 프로브, 종족 업그레이드, 영웅 강화, 판매)
// · 영웅 패널 · 증강 선택 오버레이 · 게임오버.
// 반투명 패널 + 계열색 액센트 라인으로 정돈 (UI Toolkit 전환은 다음 단계).
// 월드 위 HP바·플로팅 텍스트는 GameViewFx(월드 스페이스)가 맡는다.

using GodTD.Core;
using UnityEngine;

namespace GodTD.View
{
    public sealed class GameHud : MonoBehaviour
    {
        GameView view;

        // HUD 판 영역 — 월드 클릭과 겹치지 않게 GameView가 조회한다
        Rect topBar;
        Rect rightPanel;
        Rect heroPanel;
        Rect messageBar;

        GUIStyle label;
        GUIStyle small;
        GUIStyle title;
        GUIStyle card;
        bool stylesReady;

        static readonly Color PANEL_BG = new Color(0.03f, 0.045f, 0.09f, 0.74f);
        static readonly Color ACCENT_GOLD = new Color(1f, 0.82f, 0.25f, 0.85f);
        static readonly Color ACCENT_BLUE = new Color(0.31f, 0.64f, 1f, 0.85f);
        static readonly Color ACCENT_HERO = new Color(0.69f, 0.55f, 1f, 0.85f);
        static readonly Color ACCENT_DIM = new Color(0.35f, 0.4f, 0.6f, 0.6f);

        void Awake()
        {
            view = GetComponent<GameView>();
            view.Hud = this;
        }

        public bool IsPointerOverHud(Vector2 mouseScreenPos)
        {
            var p = new Vector2(mouseScreenPos.x, Screen.height - mouseScreenPos.y);
            return topBar.Contains(p) || rightPanel.Contains(p) ||
                   heroPanel.Contains(p) || messageBar.Contains(p);
        }

        void EnsureStyles()
        {
            if (stylesReady) return;
            stylesReady = true;
            label = new GUIStyle(GUI.skin.label) { richText = true, fontSize = 14 };
            small = new GUIStyle(GUI.skin.label) { richText = true, fontSize = 12, wordWrap = true };
            title = new GUIStyle(GUI.skin.label)
            {
                richText = true, fontSize = 24, fontStyle = FontStyle.Bold,
                alignment = TextAnchor.MiddleCenter,
            };
            card = new GUIStyle(GUI.skin.button)
            {
                richText = true, fontSize = 13, wordWrap = true,
                alignment = TextAnchor.UpperLeft, padding = new RectOffset(12, 12, 10, 10),
            };
        }

        /// <summary>반투명 패널 + 상단 액센트 라인</summary>
        void Panel(Rect rect, Color accent)
        {
            GUI.color = PANEL_BG;
            GUI.DrawTexture(rect, Texture2D.whiteTexture);
            GUI.color = accent;
            GUI.DrawTexture(new Rect(rect.x, rect.y, rect.width, 2f), Texture2D.whiteTexture);
            GUI.color = Color.white;
        }

        void OnGUI()
        {
            EnsureStyles();
            var game = view.Game;

            DrawTopBar(game);
            DrawRightPanel(game);
            DrawHeroPanel(game);
            DrawMessage(game);

            if (game.PendingStatPoints > 0) DrawStatOverlay(game);
            else if (game.AugmentChoices.Count > 0) DrawAugmentOverlay(game);
            if (game.Over) DrawGameOver(game);
        }

        // ───────── 상단 자원 바 ─────────
        void DrawTopBar(Game game)
        {
            topBar = new Rect(12, 12, 350, 156);
            Panel(topBar, ACCENT_GOLD);
            GUILayout.BeginArea(new Rect(topBar.x + 10, topBar.y + 8, topBar.width - 20, topBar.height - 16));

            GUILayout.Label(
                $"<b>R{Mathf.Max(1, game.Round)}</b> · 다음 {Mathf.CeilToInt(Mathf.Max(0, game.RoundTimer))}s" +
                $" · <color=#8fd6ff>미네랄 {game.Mineral}</color>" +
                $" · <color=#6fdc8c>가스 {game.Gas}</color>", label);
            GUILayout.Label(
                $"라이프 <color=#ff5a3c>{game.Lives}</color> · 킬 {game.Kills}" +
                $" · 점수 <color=#ffd23f>{game.ScoreValue:N0}</color>", label);

            // 보상 현황 — 원본 §8.2의 세 소득 계열
            GUILayout.Label($"웨이브 클리어 → +{Balance.WaveReward(Mathf.Max(1, game.Round))}", small);
            var milestone = Economy.NextMilestone(game.Kills);
            GUILayout.Label(milestone.HasValue
                ? $"킬 마일스톤 {game.Kills}/{milestone.Value.kills} → +{milestone.Value.reward}"
                : "킬 마일스톤 전부 달성", small);

            string bossState = game.BossCooldown > 0f
                ? $"보스 쿨타임 {Mathf.CeilToInt(game.BossCooldown)}s"
                : $"보스 소환 가능 Lv1~Lv{game.MaxBossLevel}";
            var live = game.LiveBossLevels;
            if (live.Count > 0) bossState = $"교전 중 Lv{string.Join(" Lv", live)} · " + bossState;
            GUILayout.Label(bossState, small);

            GUILayout.Label(
                $"영웅딜 {game.HeroDamageDealt:N0} · 타워딜 {game.TowerDamageDealt:N0}" +
                $" · 탱킹기여 {game.TankAssistDamage:N0}", small);

            GUILayout.EndArea();
        }

        // ───────── 우측 버튼 패널 ─────────
        void DrawRightPanel(Game game)
        {
            rightPanel = new Rect(Screen.width - 240, 12, 228, 486);
            Panel(rightPanel, ACCENT_BLUE);
            GUILayout.BeginArea(new Rect(rightPanel.x + 10, rightPanel.y + 10,
                rightPanel.width - 20, rightPanel.height - 20));

            // H1: 커맨드 카드(3×3, QWE/ASD/ZXC)가 실제 명령 경로다. 이 패널은 H2에서
            // 하단 커맨드 바로 대체된다 — 지금은 카드를 그대로 세로로 펼쳐 보여준다.
            GUILayout.Label($"<b>{CommandCard.PageTitle(view.Selection, view.Page)}</b>", small);

            var cmds = CommandCard.Build(game, view.Selection, view.Page);
            for (int i = 0; i < CommandCard.SLOTS; i++)
            {
                var cmd = cmds[i];
                if (cmd.IsEmpty) continue;
                GUI.enabled = cmd.Enabled;
                GUI.backgroundColor = cmd.Accent;
                string text = $"[{CommandCard.HOTKEY_LABELS[i]}] {cmd.Label}";
                if (cmd.Detail != null) text += $"\n<size=10>{cmd.Detail}</size>";
                if (GUILayout.Button(text, card)) view.InvokeCommand(cmd);
            }
            GUI.enabled = true;
            GUI.backgroundColor = Color.white;

            if (view.Page != CardPage.Root)
                GUILayout.Label("<size=11>Esc — 뒤로</size>", small);

            GUILayout.EndArea();
        }

        // ───────── 영웅 패널 ─────────
        void DrawHeroPanel(Game game)
        {
            // 스킬이 있으면 가스 개조 버튼 줄만큼 패널이 커진다
            float height = game.Hero.Skill != null ? 208f : 176f;
            heroPanel = new Rect(12, Screen.height - 40 - height, 410, height);
            Panel(heroPanel, ACCENT_HERO);
            GUILayout.BeginArea(new Rect(heroPanel.x + 10, heroPanel.y + 8,
                heroPanel.width - 20, heroPanel.height - 16));

            var hero = game.Hero;
            var stats = hero.Stats;
            GUILayout.Label($"<b>영웅 Lv{hero.Level}</b>", label);

            string hpText = hero.Alive
                ? $"HP {Mathf.CeilToInt(hero.Hp)}/{stats.MaxHp:0}"
                : $"부활 {Mathf.CeilToInt(hero.RespawnTimer)}s";
            GUILayout.Label($"{hpText} · XP {Mathf.FloorToInt(hero.Xp)}/{hero.XpNeeded}", small);
            Bar(hero.Alive ? hero.Hp / stats.MaxHp : 0f, new Color(0.44f, 0.86f, 0.55f));
            Bar(hero.Xp / (float)hero.XpNeeded, new Color(1f, 0.82f, 0.25f));

            float dps = stats.Damage / stats.AttackInterval;
            string statLine = $"공격력 {stats.Damage:0} · DPS {dps:0} · 사거리 {stats.Range:0}";
            if (stats.SplashRadius > 0f) statLine += $" · 광역 {stats.SplashRadius:0}";
            if (stats.DamageReduction > 0f) statLine += $" · 피해감소 {stats.DamageReduction * 100f:0}%";
            if (stats.Regen > 0f) statLine += $" · 재생 {stats.Regen:0}/s";
            GUILayout.Label(statLine, small);

            // 증강 목록 + 발동한 시너지
            var augs = new System.Text.StringBuilder();
            foreach (var c in hero.AugmentCards)
                augs.Append($"<color={Augments.RARITIES[c.Rarity].Color}>[{c.Augment.Name}]</color> ");
            foreach (var s in Augments.ActiveSynergies(hero.AugmentCards))
                augs.Append($"<color=#ffd23f>★{s.Name}</color> ");
            if (augs.Length > 0) GUILayout.Label(augs.ToString(), small);

            var skill = hero.Skill;
            if (skill != null)
            {
                string state = game.CanUseSkill
                    ? game.ShouldAutoCastSkill ? "시전!" : "대기 중"
                    : $"{Mathf.Max(0f, hero.SkillCooldown):0.0}s";
                string extra = skill.DamageMult > 0f
                    ? $" · 피해 {Mathf.RoundToInt(stats.Damage * skill.DamageMult)}"
                    : "";
                if (skill.Targets > 0) extra += $" · {skill.Targets}발";
                // 스킬은 자동 시전이라 버튼이 아니다 — 쿨타임 게이지로만 보여준다
                GUILayout.Label($"스킬 {skill.Def.Name}{extra} · {state} (자동 시전)", small);
                Bar(1f - Mathf.Max(0f, hero.SkillCooldown) / skill.Cooldown, new Color(0.49f, 0.91f, 1f));
            }

            // 스탯 구매·스킬 개조는 영웅을 선택하면 커맨드 카드에 뜬다
            if (!view.Selection.IsHero)
                GUILayout.Label("<size=11>영웅을 클릭하면 강화·개조 명령이 열립니다</size>", small);

            GUILayout.EndArea();
        }

        void Bar(float ratio, Color color)
        {
            var rect = GUILayoutUtility.GetRect(200f, 6f);
            GUI.color = new Color(0.05f, 0.06f, 0.1f);
            GUI.DrawTexture(rect, Texture2D.whiteTexture);
            GUI.color = color;
            rect.width *= Mathf.Clamp01(ratio);
            GUI.DrawTexture(rect, Texture2D.whiteTexture);
            GUI.color = Color.white;
        }

        // ───────── 메시지 + 선택 정보 ─────────
        void DrawMessage(Game game)
        {
            messageBar = new Rect(434, Screen.height - 108, Mathf.Max(240f, Screen.width - 690), 96);
            Panel(messageBar, ACCENT_DIM);
            GUILayout.BeginArea(new Rect(messageBar.x + 10, messageBar.y + 8,
                messageBar.width - 20, messageBar.height - 16));

            var tower = game.Selected?.Tower;
            if (tower != null)
            {
                float dmg = Combat.Damage(tower, game.Upgrades);
                float interval = Combat.AttackInterval(tower);
                GUILayout.Label(
                    $"<color={Units.RACE_COLOR[(int)tower.Def.Race]}><b>{tower.Def.Name}</b></color>" +
                    $" {Units.TIER_LABEL[tower.Tier]} 【 {Units.TagLabel(tower.Def)} 】 — " +
                    $"공격력 {dmg:0} · 간격 {interval:0.00}s · DPS {dmg / interval:0} · 사거리 {Combat.Range(tower):0}",
                    small);
            }
            else
            {
                GUILayout.Label("<b>좌클릭</b> 선택 (영웅·타워·타일) · <b>우클릭</b> 영웅 이동 · <b>Esc</b> 선택 해제 · 휠 = 줌\n" +
                    "명령은 <b>QWE / ASD / ZXC</b> — 고른 대상에 따라 바뀝니다. 같은 유닛 2기가 모이면 자동 조합됩니다.", small);
            }
            GUILayout.Label(game.Message, small);
            GUILayout.EndArea();
        }

        // ───────── 오버레이 공통 카드 배치 ─────────
        Rect OverlayCardRect(int index, int count)
        {
            float w = 240f, h = 190f, gap = 16f;
            float totalW = count * w + (count - 1) * gap;
            float x = (Screen.width - totalW) / 2f + index * (w + gap);
            float y = (Screen.height - h) / 2f;
            return new Rect(x, y, w, h);
        }

        void DimScreen()
        {
            GUI.color = new Color(0f, 0f, 0f, 0.72f);
            GUI.DrawTexture(new Rect(0, 0, Screen.width, Screen.height), Texture2D.whiteTexture);
            GUI.color = Color.white;
        }

        // ───────── 레벨업 스탯 선택 오버레이 — 증강과 같은 일시정지 카드 ─────────
        void DrawStatOverlay(Game game)
        {
            DimScreen();
            int points = game.PendingStatPoints;
            int queued = game.Hero.PendingStatPoints.Count;
            string tail = queued > 1 ? $" (대기 {queued}회)" : "";
            GUI.Label(new Rect(0, Screen.height / 2f - 160, Screen.width, 30),
                $"<color=#ffd23f>레벨 업!</color> — 스탯 하나에 +{points}포인트{tail}", title);

            for (int i = 0; i < HeroData.STAT_IDS.Length; i++)
            {
                var stat = HeroData.STAT_IDS[i];
                string last = game.Hero.Focus == stat ? " <color=#ffd23f>(직전 선택)</color>" : "";
                string text = $"<b>{HeroData.StatLabel(stat)} +{points}</b>{last}\n\n" +
                    $"보유 {game.Hero.Bought.Of(stat)}pt";
                if (GUI.Button(OverlayCardRect(i, HeroData.STAT_IDS.Length), text, card))
                    game.ChooseStat(stat);
            }
        }

        // ───────── 증강 선택 오버레이 ─────────
        void DrawAugmentOverlay(Game game)
        {
            DimScreen();
            GUI.Label(new Rect(0, Screen.height / 2f - 160, Screen.width, 30),
                $"<color=#ffd23f>증강 선택</color> — 영웅 Lv{game.Hero.Level}, 하나를 고르세요", title);

            for (int i = 0; i < game.AugmentChoices.Count; i++)
            {
                var choice = game.AugmentChoices[i];
                var rarity = Augments.RARITIES[choice.Rarity];
                string text =
                    $"<color={Augments.KindColor(choice.Augment.Kind)}>{Augments.KindLabel(choice.Augment.Kind)}</color>" +
                    $"  <color={rarity.Color}><b>{rarity.Label}</b></color>\n\n" +
                    $"<b>{choice.Augment.Name}</b>\n\n{choice.Augment.Description}";
                GUI.backgroundColor = GameView.Hex(rarity.Color);
                if (GUI.Button(OverlayCardRect(i, game.AugmentChoices.Count), text, card))
                    game.ChooseAugment(i);
            }
            GUI.backgroundColor = Color.white;

            // 증강 리롤 (가스) — 선택지 3장을 다시 뽑는다
            int left = Augments.AUGMENT_REROLL_MAX - game.RerollsUsed;
            string rerollText = left > 0
                ? $"리롤 {game.RerollCost}가스 · {left}회 남음 (보유 {game.Gas})"
                : "리롤 소진";
            GUI.enabled = game.CanReroll;
            if (GUI.Button(new Rect(Screen.width / 2f - 140, Screen.height / 2f + 115, 280, 34), rerollText))
                game.RerollAugments();
            GUI.enabled = true;
        }

        // ───────── 게임오버 ─────────
        void DrawGameOver(Game game)
        {
            DimScreen();
            float cx = Screen.width / 2f;
            float cy = Screen.height / 2f;
            GUI.Label(new Rect(0, cy - 90, Screen.width, 40),
                $"<color=#ffd23f>{game.ScoreValue:N0}점</color>", title);
            GUI.Label(new Rect(0, cy - 44, Screen.width, 30),
                $"{game.Round}라운드 · {game.Kills}킬 · 보스 Lv{game.BossCleared} · 영웅 Lv{game.Hero.Level}",
                new GUIStyle(label) { alignment = TextAnchor.MiddleCenter });
            if (GUI.Button(new Rect(cx - 80, cy + 10, 160, 40), "다시 시작"))
                view.Restart();
        }
    }
}
