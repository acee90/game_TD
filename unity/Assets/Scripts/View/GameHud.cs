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
        Rect bottomConsole;
        Rect rightPanel;
        Rect heroPanel;
        Rect messageBar;

        GUIStyle label;
        GUIStyle small;
        GUIStyle title;
        GUIStyle card;
        GUIStyle commandLabel;
        GUIStyle tiny;
        bool stylesReady;

        static readonly Color PANEL_BG = new Color(0.025f, 0.035f, 0.045f, 0.97f);
        static readonly Color FRAME = new Color(0.22f, 0.27f, 0.28f, 1f);
        static readonly Color FRAME_LIGHT = new Color(0.42f, 0.48f, 0.46f, 1f);
        static readonly Color INSET = new Color(0.018f, 0.026f, 0.032f, 1f);
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
            return topBar.Contains(p) || bottomConsole.Contains(p);
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
            commandLabel = new GUIStyle(GUI.skin.button)
            {
                richText = true, fontSize = 11, wordWrap = true,
                alignment = TextAnchor.MiddleCenter, padding = new RectOffset(4, 4, 4, 4),
            };
            tiny = new GUIStyle(GUI.skin.label)
            {
                richText = true, fontSize = 10, wordWrap = true,
                alignment = TextAnchor.MiddleCenter,
            };
        }

        void Fill(Rect rect, Color color)
        {
            GUI.color = color;
            GUI.DrawTexture(rect, Texture2D.whiteTexture);
            GUI.color = Color.white;
        }

        void Panel(Rect rect, Color accent)
        {
            Fill(rect, FRAME);
            Fill(new Rect(rect.x + 2, rect.y + 2, rect.width - 4, rect.height - 4), PANEL_BG);
            Fill(new Rect(rect.x + 4, rect.y + 4, rect.width - 8, 2), FRAME_LIGHT);
            Fill(new Rect(rect.x + 4, rect.y + 6, rect.width - 8, 2), accent);
        }

        void Inset(Rect rect, Color accent)
        {
            Fill(rect, new Color(0.005f, 0.008f, 0.01f, 1f));
            Fill(new Rect(rect.x + 2, rect.y + 2, rect.width - 4, rect.height - 4), INSET);
            Fill(new Rect(rect.x + 2, rect.y + 2, 2, rect.height - 4), accent);
        }

        void OnGUI()
        {
            EnsureStyles();
            var game = view.Game;

            DrawRtsTopBar(game);
            DrawRtsConsole(game);

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

        // ───────── RTS 상단 작전 바 + 하단 통합 콘솔 ─────────
        void DrawRtsTopBar(Game game)
        {
            float width = Mathf.Min(780f, Screen.width - 24f);
            topBar = new Rect((Screen.width - width) * 0.5f, 10, width, 48);
            Panel(topBar, ACCENT_GOLD);
            float cell = width / 6f;
            TopCell(0, cell, "ROUND", $"<b>{Mathf.Max(1, game.Round)}</b>  <size=11>{Mathf.CeilToInt(Mathf.Max(0, game.RoundTimer))}s</size>");
            TopCell(1, cell, "MINERAL", $"<color=#8fd6ff><b>{game.Mineral}</b></color>");
            TopCell(2, cell, "GAS", $"<color=#6fdc8c><b>{game.Gas}</b></color>");
            TopCell(3, cell, "LIVES", $"<color=#ff6b55><b>{game.Lives}</b></color>");
            TopCell(4, cell, "KILLS", $"<b>{game.Kills}</b>");
            TopCell(5, cell, "SCORE", $"<color=#ffd23f><b>{game.ScoreValue:N0}</b></color>");
        }

        void TopCell(int index, float width, string caption, string value)
        {
            float x = topBar.x + index * width;
            if (index > 0) Fill(new Rect(x, topBar.y + 10, 1, topBar.height - 16), FRAME);
            GUI.Label(new Rect(x + 6, topBar.y + 9, width - 12, 13), $"<color=#78878a>{caption}</color>", tiny);
            GUI.Label(new Rect(x + 6, topBar.y + 21, width - 12, 22), value,
                new GUIStyle(label) { alignment = TextAnchor.MiddleCenter });
        }

        void DrawRtsConsole(Game game)
        {
            float height = Mathf.Min(226f, Screen.height * 0.29f);
            bottomConsole = new Rect(0, Screen.height - height, Screen.width, height);
            Panel(bottomConsole, ACCENT_BLUE);
            Fill(new Rect(0, bottomConsole.y + 10, Screen.width, 1), FRAME_LIGHT);

            float commandWidth = Mathf.Clamp(Screen.width * 0.27f, 280f, 370f);
            Rect commands = new Rect(Screen.width - commandWidth - 10, bottomConsole.y + 18, commandWidth, height - 28);
            Rect info = new Rect(10, bottomConsole.y + 18,
                Mathf.Max(300f, commands.x - 20), height - 28);

            DrawSelectionPanel(game, info);
            DrawCommandGrid(game, commands);
        }

        void DrawSelectionPanel(Game game, Rect rect)
        {
            Inset(rect, ACCENT_HERO);
            GUI.Label(new Rect(rect.x + 12, rect.y + 7, rect.width - 24, 18),
                $"<color=#879698>{CommandCard.PageTitle(view.Selection, view.Page).ToUpper()}</color>", tiny);
            string heading;
            string body;
            var tower = game.Selected?.Tower;
            if (tower != null)
            {
                float damage = Combat.Damage(tower, game.Upgrades);
                float interval = Combat.AttackInterval(tower);
                heading = $"<color={Units.RACE_COLOR[(int)tower.Def.Race]}><b>{tower.Def.Name}</b></color>  {Units.TIER_LABEL[tower.Tier]}";
                body = $"공격 {damage:0}   DPS {damage / interval:0}\n속도 {interval:0.00}s   사거리 {Combat.Range(tower):0}\n【 {Units.TagLabel(tower.Def)} 】";
            }
            else if (view.Selection.IsHero)
            {
                var hero = game.Hero;
                var stats = hero.Stats;
                heading = $"<color=#c5a9ff><b>영웅  LV {hero.Level}</b></color>";
                body = hero.Alive
                    ? $"HP {Mathf.CeilToInt(hero.Hp)} / {stats.MaxHp:0}   XP {Mathf.FloorToInt(hero.Xp)} / {hero.XpNeeded}\n공격 {stats.Damage:0}   DPS {stats.Damage / stats.AttackInterval:0}   사거리 {stats.Range:0}"
                    : $"전투 불능   부활 {Mathf.CeilToInt(hero.RespawnTimer)}초";
            }
            else if (view.Selection.IsEnemy && view.Selection.Enemy != null)
            {
                var enemy = view.Selection.Enemy;
                string kind = enemy.Kind == EnemyKind.Boss ? $"보스  LV {enemy.BossLevel}" : "일반 유닛";
                string state = enemy.Held ? "저지됨" : enemy.SlowTimer > 0f ? $"감속 {enemy.SlowFactor * 100f:0}%" : "이동 중";
                heading = enemy.Kind == EnemyKind.Boss
                    ? $"<color=#ff6b55><b>{enemy.Name}</b></color>  {kind}"
                    : $"<color=#b9c2c9><b>{enemy.Name}</b></color>  {kind}";
                body = $"HP {Mathf.CeilToInt(enemy.Hp)} / {enemy.MaxHp:0}   방어 {enemy.Armor:0}\n이동속도 {enemy.Speed:0.0}   경로 {enemy.Distance:0}\n상태  {state}";
            }
            else
            {
                heading = view.Selection.IsEmptyTile ? "<b>빈 타일</b>" : "<b>작전 지휘</b>";
                body = "좌클릭  선택\n우클릭  영웅 이동\nQWE / ASD / ZXC  명령";
            }
            GUI.Label(new Rect(rect.x + 14, rect.y + 30, rect.width - 28, 26), heading, label);
            GUI.Label(new Rect(rect.x + 14, rect.y + 58, rect.width - 28, rect.height - 96), body, small);
            Fill(new Rect(rect.x + 12, rect.y + rect.height - 35, rect.width - 24, 1), FRAME);
            GUI.Label(new Rect(rect.x + 14, rect.y + rect.height - 31, rect.width - 28, 25), game.Message, tiny);
        }

        void DrawCommandGrid(Game game, Rect rect)
        {
            Inset(rect, ACCENT_BLUE);
            GUI.Label(new Rect(rect.x + 8, rect.y + 5, rect.width - 16, 18),
                $"<b>COMMAND</b>  <color=#728084>{CommandCard.PageTitle(view.Selection, view.Page)}</color>", tiny);
            float gap = 5f;
            float cellWidth = (rect.width - 20 - gap * 2) / 3f;
            float cellHeight = (rect.height - 34 - gap * 2) / 3f;
            var commands = CommandCard.Build(game, view.Selection, view.Page);
            for (int i = 0; i < CommandCard.SLOTS; i++)
            {
                int col = i % 3;
                int row = i / 3;
                Rect cell = new Rect(rect.x + 10 + col * (cellWidth + gap), rect.y + 25 + row * (cellHeight + gap), cellWidth, cellHeight);
                var command = commands[i];
                Fill(cell, command.IsEmpty ? GameView.Hex("#11191d") : (command.Enabled ? command.Accent : FRAME));
                Rect inner = new Rect(cell.x + 2, cell.y + 2, cell.width - 4, cell.height - 4);
                Fill(inner, command.IsEmpty ? GameView.Hex("#0b1114") : GameView.Hex("#182226"));
                GUI.Label(new Rect(cell.x + 4, cell.y + 3, 18, 15),
                    $"<color=#e1c878><b>{CommandCard.HOTKEY_LABELS[i]}</b></color>", tiny);
                if (command.IsEmpty) continue;
                string text = $"<b>{command.Label}</b>";
                if (command.Detail != null) text += $"\n<size=9><color=#92a0a3>{command.Detail}</color></size>";
                GUI.enabled = command.Enabled;
                GUI.backgroundColor = new Color(0f, 0f, 0f, 0f);
                if (GUI.Button(inner, text, commandLabel)) view.InvokeCommand(command);
            }
            GUI.enabled = true;
            GUI.backgroundColor = Color.white;
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
