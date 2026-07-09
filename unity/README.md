# 갓타워디펜스 프로토 — Unity 데스크탑 포팅

`web/src`의 웹 타워디펜스 프로토타입을 Unity 2022.3 LTS로 1:1 포팅한 것이다.
에셋·씬·프리팹이 전혀 없다 — 코드만으로 열자마자 실행된다.

## 여는 법

1. Unity Hub → **Add** → 이 `unity/` 폴더 선택
2. 에디터 버전 **2022.3 LTS** (2022.3.45f1 기준, 같은 2022.3.x면 됨)로 열기
3. 프로젝트가 열리면(기본 빈 씬 그대로) **Play** 누르기

### 빈 씬에서 Play만 누르면 되는 이유

`Assets/Scripts/View/Bootstrap.cs`가
`[RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]`로
씬 로드 직후 자동 실행되어, 카메라·맵·HUD를 코드로 조립한다.
씬에 아무것도 배치할 필요가 없고, 렌더링은 전부
`GameObject.CreatePrimitive`(큐브 = 타일/타워, 스피어 = 몹/영웅, 캡슐 = 보스)와
`LineRenderer`(경로·탄환·사거리 링), 색은 `Sprites/Default` 머티리얼 캐시로 처리한다.

## 조작

| 입력 | 동작 |
|---|---|
| 빈 타일 클릭 | 유닛 생성 (미네랄 12) |
| 유닛 타일 클릭 | 선택 (사거리 링 + 정보 표시) |
| 빈 곳 클릭 | 영웅 이동 — 클릭 좌표를 경로에 투영해 스냅 |
| P | 아무 빈 타일에 유닛 생성 |
| B | 열려 있는 최고 레벨 보스 소환 |
| R | 프로브 생산 |
| X | 선택 유닛 판매 |
| U | 골드 영웅 강화 |
| 1~4 | 종족 업그레이드 (테란/저그/플토/크리쳐) |

우측 패널에 같은 기능의 버튼(보스는 Lv1~6 개별)이 있다.

## 구조

```
unity/
├── Packages/manifest.json            # 기본 모듈만 (imgui, physics, textrendering)
├── ProjectSettings/ProjectVersion.txt
└── Assets/Scripts/
    ├── Core/    # 순수 C# 시뮬레이션 — UnityEngine 의존 없음, 테스트 가능
    │   ├── MapData.cs      # ← web/src/core/map.ts
    │   ├── Balance.cs      # ← web/src/data/balance.ts
    │   ├── Units.cs        # ← web/src/data/units.ts
    │   ├── HeroData.cs     # ← web/src/data/hero.ts (상수·커브)
    │   ├── Augments.cs     # ← web/src/data/hero.ts (증강·등급·시너지)
    │   ├── HeroClasses.cs  # ← web/src/data/hero-class.ts
    │   ├── Skills.cs       # ← web/src/data/skills.ts
    │   ├── Score.cs        # ← web/src/data/score.ts
    │   ├── GameTypes.cs    # ← web/src/game/types.ts
    │   ├── Combat.cs       # ← web/src/game/combat.ts
    │   ├── Economy.cs      # ← web/src/game/economy.ts
    │   ├── Merge.cs        # ← web/src/game/merge.ts
    │   ├── Hero.cs         # ← web/src/game/hero.ts
    │   ├── Game.cs         # ← web/src/game/game.ts
    │   └── Game.Skills.cs  # ← web/src/game/game.ts (스킬 시전 부분, partial)
    └── View/    # UnityEngine 레이어
        ├── Bootstrap.cs    # 진입점 (RuntimeInitializeOnLoadMethod)
        ├── GameView.cs     # ← web/src/render/render.ts + main.ts (렌더·입력)
        └── GameHud.cs      # ← web/src/ui/ui.ts (OnGUI 즉시모드 HUD)
```

- Core는 `System.Random` 주입(`Func<double>`)으로 난수를 받아 시드 고정 테스트가 가능하다.
- 상수는 웹 원본과 동일하며 `[원본확정]`/`[프로토]` 주석도 그대로 옮겼다.

## 웹 원본과 의도적으로 다른 것 하나 — Lv5 전직

웹은 게임 시작에 영웅 타입(전사/궁수/마법사)을 골랐지만, 이 포팅은 최신 설계대로
**영웅 Lv5에 "전직"을 고른다** (`HeroData.CLASS_CHANGE_LEVEL`).

- 전직 전에는 중립 스탯 — 배수 전부 1 (`HeroClasses.NEUTRAL`)
- Lv5 도달 시 증강 오버레이와 같은 방식으로 3장 카드가 뜨고, 고를 때까지 일시정지
- 첫 증강이 Lv9라 전직이 항상 먼저 온다 — 증강 가중치는 언제나 전직된 타입이 정한다

## 포팅 범위

포함 (웹 원본과 동일 로직·동일 상수):

- 십자 맵, 반시계 경로, 타일 41개(십자 17 + 모서리 24), 경로 투영(`NearestPathDistance`)
- 라운드 고정 간격 웨이브, 5라운드 사이클 HP·장갑 곡선, 스폰 큐
- 유닛 생성·자동 연쇄 조합(merge)·판매, 4종족 × 5티어 풀, GOD 풀 조기/확장 분기
- 태그 전투(파워/스플래시/스피드), 크리쳐 감속(최강 1개만), 종족 업그레이드 복리
- 경제: 미네랄/가스/프로브, 보스 처치 보상, 킬 마일스톤, 웨이브 보상, 누출 +5
- 보스 소환 Lv1~6 (쿨타임 45초, Lv N 처치 → Lv N+1 해금), 보스 누출 라이프 손실
- 영웅: 경로 위 이동, 어그로 블로킹, XP·레벨(선형 성장 + 지수 XP 비용), 부활,
  골드 강화(35×1.28ⁿ, 공×1.12/체×1.08)
- 증강 26종 · 등급(실버 1.0/골드 2.0/플래티넘 3.5, 대가 없음) ·
  시너지(특화 3 / 대특화 5) · AUGMENT_LEVELS=[9,16,24,30,35,42] + 이후 8레벨마다
- 액티브 스킬 4종(소용돌이/일제 사격/유성/허수아비) 자동 시전 + 개조(SkillMods/FoldMods)
- 피해 기여 집계(heroDamageDealt/towerDamageDealt/tankAssistDamage), 점수, 게임오버

미포팅:

- **명예의 전당 영속 저장** (web/src/ui/hall-of-fame.ts) — localStorage 기반이라 제외.
  게임오버 화면에 이번 판 점수·기록만 띄운다.
- 웹 HUD의 진행 바 연출 일부(반복 보상 바 등)는 텍스트로 축약
- 캔버스의 둥근 모서리·글로우 같은 시각 디테일 (프리미티브로 대체)

## 컴파일 검증

Unity 없이 검증하려면 (.NET 8 SDK):

```bash
# Core — 실제 컴파일 (UnityEngine 의존이 없으므로 netstandard2.1로 그대로 빌드된다)
dotnet build   # csproj에 Assets/Scripts/Core/*.cs 포함, TargetFramework netstandard2.1

# View — UnityEngine API 표면 스텁을 만들어 문법·타입 검증 가능
```

이 저장소 작성 시 검증 완료: Core/View 전 파일 0 에러 0 경고,
Core 헤드리스 스모크 런(봇 자동 플레이 R73, 전직·증강·보스·GOD 타워 전부 통과).
