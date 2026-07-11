// 원본: web/src/game/types.ts
// ───────── 게임 런타임 타입 ─────────

namespace GodTD.Core
{
    public sealed class Tower
    {
        public readonly UnitDef Def;
        public readonly int Tier;
        /// <summary>다음 공격까지 남은 시간(초)</summary>
        public float Cooldown;

        public Tower(UnitDef def, int tier, float cooldown = 0f)
        {
            Def = def;
            Tier = tier;
            Cooldown = cooldown;
        }
    }

    public sealed class Slot
    {
        public readonly float X;
        public readonly float Y;
        public Tower Tower;

        public Slot(float x, float y)
        {
            X = x;
            Y = y;
        }
    }

    public enum EnemyKind { Mob, Boss }

    /// <summary>적 스폰 명세 — 스폰 큐에 쌓이는 불변 데이터</summary>
    public sealed class EnemySpec
    {
        public readonly EnemyKind Kind;
        public readonly string Name;
        public readonly float MaxHp;
        public readonly float Armor;
        public readonly float Speed;
        public readonly float Radius;
        /// <summary>보스일 때만 의미가 있다 (몹이면 0)</summary>
        public readonly int BossLevel;

        public EnemySpec(EnemyKind kind, string name, float maxHp, float armor, float speed,
            float radius, int bossLevel = 0)
        {
            Kind = kind;
            Name = name;
            MaxHp = maxHp;
            Armor = armor;
            Speed = speed;
            Radius = radius;
            BossLevel = bossLevel;
        }
    }

    public sealed class Enemy
    {
        public readonly EnemySpec Spec;
        public float Hp;
        /// <summary>2열 레인: -1/+1, 보스 0. 표시 전용 — 판정은 Distance 1D</summary>
        public int Lane;
        /// <summary>입구에서 이동한 거리. PATH_LENGTH 도달 시 돌파</summary>
        public float Distance;
        public bool Dead;
        /// <summary>마지막으로 때린 게 영웅인가 — 막타 경험치 보너스 판정</summary>
        public bool LastHitByHero;
        /// <summary>스킬 감속 디버프 남은 시간 (0 이하 = 없음)</summary>
        public float SlowTimer;
        /// <summary>감속 중일 때의 이동속도 배수 (1 = 감속 없음)</summary>
        public float SlowFactor = 1f;
        /// <summary>이번 프레임에 영웅/허수아비에게 붙잡혀 있는가 — 탱킹 기여 집계용</summary>
        public bool Held;

        public Enemy(EnemySpec spec)
        {
            Spec = spec;
            Hp = spec.MaxHp;
            Distance = 0f;
        }

        public EnemyKind Kind => Spec.Kind;
        public string Name => Spec.Name;
        public float MaxHp => Spec.MaxHp;
        public float Armor => Spec.Armor;
        public float Speed => Spec.Speed;
        public float Radius => Spec.Radius;
        public int BossLevel => Spec.BossLevel;
    }

    /// <summary>영웅이 세운 미끼. 몹을 붙잡아 시간을 번다.</summary>
    public sealed class Decoy
    {
        /// <summary>경로 위 위치</summary>
        public float Distance;
        public float Hp;
        public float MaxHp;
        public float Life;
        /// <summary>주변 몹을 강제로 끌어당기는가</summary>
        public bool Taunts;
    }

    /// <summary>탄환 궤적 연출용. 색은 웹 원본 hex 문자열 그대로 둔다.</summary>
    public sealed class Shot
    {
        public float X;
        public float Y;
        public float Tx;
        public float Ty;
        public float Life;
        public string Color;
        public float SplashRadius;
    }

    public sealed class FloatText
    {
        public float X;
        public float Y;
        public string Text;
        public string Color;
        public float Life;
    }
}
