// ───────── 선택 모델 (View 전용) ─────────
// Core의 Game.Selected는 Slot만 가리킨다 — 영웅을 고른다는 개념이 없다.
// 커맨드 패널은 "무엇을 골랐는가"에 따라 하단 바를 통째로 바꾸므로,
// 영웅·타워·빈 타일·없음을 구분하는 선택 상태가 필요하다.
//
// Core는 건드리지 않는다. 타워를 고를 때만 Game.Selected를 함께 갱신한다 —
// SellSelected()가 그것을 보기 때문이다 (Game.cs:284).

using GodTD.Core;

namespace GodTD.View
{
    public enum SelectionKind
    {
        /// <summary>아무것도 고르지 않음 — 전역 명령이 뜬다</summary>
        None,
        Hero,
        Tower,
        /// <summary>타워가 없는 타일. 제단도 여기 속하지만 유닛을 놓을 수 없다.</summary>
        EmptyTile,
        /// <summary>일반 몹과 보스. 정보 열람만 가능하고 명령은 없다.</summary>
        Enemy,
    }

    public readonly struct Selection
    {
        public readonly SelectionKind Kind;
        /// <summary>Tower · EmptyTile일 때만 non-null</summary>
        public readonly Slot Slot;
        public readonly Enemy Enemy;

        Selection(SelectionKind kind, Slot slot, Enemy enemy = null)
        {
            Kind = kind;
            Slot = slot;
            Enemy = enemy;
        }

        public static readonly Selection None = new Selection(SelectionKind.None, null);
        public static Selection Hero() => new Selection(SelectionKind.Hero, null);
        public static Selection Of(Enemy enemy) => new Selection(SelectionKind.Enemy, null, enemy);

        /// <summary>슬롯의 타워 유무를 보고 Tower / EmptyTile을 정한다</summary>
        public static Selection Of(Slot slot) =>
            new Selection(slot.Tower != null ? SelectionKind.Tower : SelectionKind.EmptyTile, slot);

        public bool IsHero => Kind == SelectionKind.Hero;
        public bool IsTower => Kind == SelectionKind.Tower;
        public bool IsEmptyTile => Kind == SelectionKind.EmptyTile;
        public bool IsNone => Kind == SelectionKind.None;
        public bool IsEnemy => Kind == SelectionKind.Enemy;

        /// <summary>선택이 여전히 유효한가 — 타워가 조합·판매로 사라졌을 수 있다</summary>
        public bool StillValid(Game game)
        {
            switch (Kind)
            {
                case SelectionKind.Tower: return Slot != null && Slot.Tower != null;
                case SelectionKind.EmptyTile: return Slot != null && Slot.Tower == null;
                case SelectionKind.Hero: return true;
                case SelectionKind.Enemy: return Enemy != null && !Enemy.Dead && game.Enemies.Contains(Enemy);
                default: return true;
            }
        }
    }
}
