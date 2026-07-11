// ───────── 커맨드 카드 (3×3 그리드) ─────────
// 선택 대상에 따라 9칸의 내용이 바뀐다. 칸 위치가 곧 단축키다 —
// 선택이 바뀌어도 같은 키가 같은 칸을 누른다 (SC2·Legion TD 2 방식).
//
//   ┌───┬───┬───┐
//   │ Q │ W │ E │   0 1 2
//   ├───┼───┼───┤
//   │ A │ S │ D │   3 4 5
//   ├───┼───┼───┤
//   │ Z │ X │ C │   6 7 8
//   └───┴───┴───┘
//
// 영웅 스킬은 자동 시전이라 버튼이 아니다 — 상세 열의 쿨타임 게이지로 표시한다.
// 이 파일은 "무엇을 그릴지"만 정한다. 그리는 것은 GameHud가 한다.

using System;
using System.Collections.Generic;
using GodTD.Core;
using UnityEngine;

namespace GodTD.View
{
    public readonly struct Command
    {
        public readonly string Label;
        /// <summary>비용·현황 등 부제. 없으면 null</summary>
        public readonly string Detail;
        public readonly bool Enabled;
        public readonly Action Invoke;
        /// <summary>계열색 — 기능군을 색으로 구분한다</summary>
        public readonly Color Accent;
        /// <summary>하위 메뉴로 들어가는 버튼인가</summary>
        public readonly bool OpensSubmenu;

        public Command(string label, string detail, bool enabled, Action invoke,
            Color accent, bool opensSubmenu = false)
        {
            Label = label;
            Detail = detail;
            Enabled = enabled;
            Invoke = invoke;
            Accent = accent;
            OpensSubmenu = opensSubmenu;
        }

        public bool IsEmpty => Label == null;
    }

    /// <summary>하위 메뉴 상태 — Esc로 Root로 돌아온다</summary>
    public enum CardPage { Root, BossSummon }

    public static class CommandCard
    {
        public const int SLOTS = 9;

        /// <summary>칸 인덱스 → 단축키. 위치가 곧 키다.</summary>
        public static readonly KeyCode[] HOTKEYS =
        {
            KeyCode.Q, KeyCode.W, KeyCode.E,
            KeyCode.A, KeyCode.S, KeyCode.D,
            KeyCode.Z, KeyCode.X, KeyCode.C,
        };

        public static readonly string[] HOTKEY_LABELS = { "Q", "W", "E", "A", "S", "D", "Z", "X", "C" };

        // 기능군 색 — 의미론적으로 쓴다
        static readonly Color BUILD = GameView.Hex("#4ea3ff");   // 생성·프로브 (미네랄)
        static readonly Color GAS = GameView.Hex("#6fdc8c");     // 가스 소비
        static readonly Color HERO = GameView.Hex("#b08cff");    // 영웅 강화
        static readonly Color DANGER = GameView.Hex("#ff5a3c");  // 보스·판매
        static readonly Color NEUTRAL = GameView.Hex("#8a93ad");

        /// <summary>선택과 페이지에 맞는 9칸을 만든다. 빈 칸은 Command.IsEmpty.</summary>
        public static Command[] Build(Game game, Selection sel, CardPage page)
        {
            var cmds = new Command[SLOTS];
            if (game.Over) return cmds;

            if (page == CardPage.BossSummon)
            {
                FillBossSummon(cmds, game);
                return cmds;
            }

            switch (sel.Kind)
            {
                case SelectionKind.Hero: FillHero(cmds, game); break;
                case SelectionKind.Tower: FillTower(cmds, game, sel.Slot); break;
                case SelectionKind.EmptyTile: FillEmptyTile(cmds, game, sel.Slot); break;
                default: FillGlobal(cmds, game); break;
            }
            return cmds;
        }

        // ── 영웅: 전부 '상점'이다. 명령이 아니다 (스킬은 자동 시전). ──
        static void FillHero(Command[] c, Game game)
        {
            var hero = game.Hero;
            // 스탯 배분은 레벨업 일시정지 카드가 맡는다 — 여기는 XP 구매와 스킬 개조만
            c[0] = new Command("XP 구매",
                $"+{HeroData.XP_BUY_AMOUNT} · {HeroData.XP_BUY_GOLD} 미네랄",
                game.CanBuyXp,
                () => game.BuyXp(), HERO);

            if (hero.Skill == null) return;   // 스킬 증강을 아직 못 뽑았다
            c[3] = new Command("스킬 피해",
                $"+8% · {game.GasSkillCost(GasSkillTrack.Damage)} 가스 ({hero.GasSkillDamage})",
                game.CanBuyGasSkill(GasSkillTrack.Damage),
                () => game.BuyGasSkill(GasSkillTrack.Damage), GAS);
            c[4] = new Command("쿨타임",
                $"-6% · {game.GasSkillCost(GasSkillTrack.Cdr)} 가스 ({hero.GasSkillCdr})",
                game.CanBuyGasSkill(GasSkillTrack.Cdr),
                () => game.BuyGasSkill(GasSkillTrack.Cdr), GAS);
        }

        // ── 타워: 판매뿐. GOD 타입 변경(미네랄 리롤)은 게임 시스템이라 보류 — c[1] 자리를 비워 둔다. ──
        static void FillTower(Command[] c, Game game, Slot slot)
        {
            c[0] = new Command("판매", "미네랄 환급", true, () => game.SellSelected(), DANGER);
        }

        static void FillEmptyTile(Command[] c, Game game, Slot slot)
        {
            bool altar = slot == game.AltarSlot;
            if (altar) return;   // 제단엔 유닛을 놓을 수 없다 (Game.cs:216)

            c[0] = new Command("유닛 생성",
                $"{game.SpawnCost} 미네랄",
                game.Mineral >= game.SpawnCost,
                () => game.SpawnUnit(slot), BUILD);
        }

        // ── 전역: 11칸이 필요해 보스를 하위 메뉴로 접었다 ──
        static void FillGlobal(Command[] c, Game game)
        {
            c[0] = new Command("프로브",
                $"{game.ProbeCost} 미네랄 ({game.Probes}/{Balance.PROBE_MAX})",
                game.Probes < Balance.PROBE_MAX && game.Mineral >= game.ProbeCost,
                () => game.BuyProbe(), BUILD);

            for (int i = 0; i < 4; i++)
            {
                var race = (Race)i;
                int cost = game.UpgradeCost(race);
                c[i + 1] = new Command(Units.RACES[i],
                    $"+{game.Upgrades[race]} · {cost} 가스",
                    game.Gas >= cost,
                    () => game.Upgrade(race), GAS);
            }

            string bossDetail = game.BossCooldown > 0f
                ? $"쿨타임 {Mathf.CeilToInt(game.BossCooldown)}s"
                : $"Lv1~Lv{game.MaxBossLevel} 열림";
            c[5] = new Command("보스 소환 ▸", bossDetail, true, null, DANGER, opensSubmenu: true);

            // 타일을 일일이 고르지 않고 아무 빈 타일에 짓는 편의 명령 (구 단축키 P)
            c[6] = new Command("유닛 생성",
                $"{game.SpawnCost} 미네랄 · 빈 타일 아무 곳",
                game.Mineral >= game.SpawnCost,
                () => game.SpawnUnitAnywhere(), BUILD);
        }

        static void FillBossSummon(Command[] c, Game game)
        {
            for (int level = 1; level <= Balance.BOSS_MAX_LEVEL; level++)
            {
                int captured = level;
                bool open = level <= game.MaxBossLevel;
                c[level - 1] = new Command(
                    $"Lv{level}",
                    open ? $"+{Balance.BOSS_KILL_MINERAL[level - 1]} 미네랄" : $"Lv{level - 1} 처치 시 해금",
                    game.CanSummonBossLevel(level),
                    () => game.SummonBoss(captured),
                    open ? DANGER : NEUTRAL);
            }
        }

        /// <summary>선택 컨텍스트의 이름 — 하단 바 좌측에 쓴다</summary>
        public static string PageTitle(Selection sel, CardPage page)
        {
            if (page == CardPage.BossSummon) return "보스 소환 (Esc 뒤로)";
            switch (sel.Kind)
            {
                case SelectionKind.Hero: return "영웅";
                case SelectionKind.Tower: return "타워";
                case SelectionKind.EmptyTile: return "빈 타일";
                default: return "전체";
            }
        }
    }
}
