# 갓타워디펜스 프로토 — Unity 데스크탑 포팅

`web/src`의 웹 타워디펜스 프로토타입을 Unity 2022.3 LTS로 1:1 포팅한 것이다.
에셋·씬·프리팹이 전혀 없다 — 코드만으로 열자마자 실행된다.

## 여는 법

1. Unity Hub → **Add** → 이 `unity/` 폴더 선택
2. 에디터 버전 **2022.3 LTS** (2022.3.45f1 기준, 같은 2022.3.x면 됨)로 열기
3. 프로젝트가 열리면(기본 빈 씬 그대로) **Play** 누르기

### 다른 버전(Unity 6 등)만 설치돼 있다면

`ProjectSettings/ProjectVersion.txt`가 2022.3.45f1로 적혀 있어 Hub가 그 버전을
찾는 것뿐이다. **정확히 그 버전이 필요한 건 아니다** — 이 프로젝트는 씬·에셋·
렌더파이프라인 설정이 없는 코드 전용이라 상위 버전에서 그대로 열린다.

- Hub 프로젝트 목록에서 이 프로젝트의 **에디터 버전 드롭다운**을 눌러 설치된
  버전(예: 6000.x / Unity 6.5)을 선택하고 열기
- "Upgrade project?" 다이얼로그가 뜨면 **Confirm** — 코드만 있는 프로젝트라
  마이그레이션 리스크가 없다 (버전을 올려 열면 ProjectVersion.txt가 자동 갱신된다)
- 사용 API(CreatePrimitive · OnGUI · LineRenderer · Physics.Raycast · Standard 셰이더 ·
  ParticleSystem · TrailRenderer · TextMesh)는 2022.3과 Unity 6 양쪽에서 동일하게 동작한다
  (렌더 파이프라인 패키지가 없어 빌트인 RP로 열린다)

### 빈 씬에서 Play만 누르면 되는 이유

`Assets/Scripts/View/Bootstrap.cs`가
`[RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]`로
씬 로드 직후 자동 실행되어, 카메라·조명·맵·HUD를 전부 코드로 조립한다.
씬에 아무것도 배치할 필요가 없고 에셋도 0이다.

### 렌더링 — 보드게임 디오라마 (프레젠테이션 패스)

웹 캔버스의 탑다운 복제가 아니라 Unity다운 3D 장면으로 그린다:

- **카메라**: 기울어진 원근(피치 55°·요 12°, FOV 42) + 부드러운 따라가기
  (포커스가 영웅 쪽으로 살짝 쏠린다). **마우스 휠 = 줌**.
- **조명·그림자**: Directional light(소프트 섀도) + Flat ambient,
  배경은 버텍스 컬러 그라데이션 메시.
- **머티리얼**: `Standard` 셰이더(메탈릭/스무스니스) 색별 캐시.
  GOD 타워·보스·제단·문은 **emissive 발광**, 타워는 티어가 오를수록 높이·발광 증가.
- **지오메트리**: `GameObject.CreatePrimitive`만 사용 — 큐브 = 타일(받침판 베벨)·타워,
  스피어 = 몹/영웅(보라 포인트 라이트), 캡슐 = 보스, 실린더 = 허수아비.
- **연출(GameViewFx.cs)**: 스폰 스케일 팝, 피격 화이트 플래시, 사망 파티클 버스트
  (보스는 전용 폭발+파문), 레벨업/부활 확장 링, 조합 시 골드 버스트+등장 플래시.
- **투사체**: Core 판정은 즉발 그대로 두고, 뷰에서 Shot의 (x,y)→(tx,ty)를 보간해
  발광 구 + `TrailRenderer`로 날아가는 연출만 얹는다. 광역은 바닥 파문(펄스).
- **월드 텍스트·HP바**: 데미지/보상/조합 플로팅 텍스트는 `TextMesh` 빌보드,
  몹/보스/영웅/허수아비 HP바는 월드 스페이스 쿼드 2장.
- **HUD**: OnGUI 즉시모드 유지 — 반투명 패널 + 계열색 액센트 라인으로 정돈.

## 조작

| 입력 | 동작 |
|---|---|
| 빈 타일 클릭 | 유닛 생성 (미네랄 12) |
| 유닛 타일 클릭 | 선택 (사거리 링 + 정보 표시) |
| 빈 곳 클릭 | 영웅 이동 — 클릭 좌표를 경로에 투영해 스냅 |
| 마우스 휠 | 카메라 줌 |
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
├── Packages/manifest.json            # 기본 모듈만 (imgui, physics, particlesystem, textrendering …)
├── ProjectSettings/ProjectVersion.txt
└── Assets/Scripts/
    ├── Core/    # 순수 C# 시뮬레이션 — UnityEngine 의존 없음, 테스트 가능
    │   ├── MapData.cs      # ← web/src/core/map.ts
    │   ├── Balance.cs      # ← web/src/data/balance.ts
    │   ├── Units.cs        # ← web/src/data/units.ts
    │   ├── HeroData.cs     # ← web/src/data/hero.ts (상수·커브)
    │   ├── Augments.cs     # ← web/src/data/hero.ts (증강·등급·시너지·적응형 가중치)
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
        ├── GameView.cs     # ← web/src/render/render.ts + main.ts (카메라·조명·씬·입력)
        ├── GameViewFx.cs   # 연출 — 파티클·투사체·펄스/링·TextMesh·월드 HP바
        └── GameHud.cs      # ← web/src/ui/ui.ts (OnGUI 즉시모드 HUD, 반투명 패널)
```

- Core는 `System.Random` 주입(`Func<double>`)으로 난수를 받아 시드 고정 테스트가 가능하다.
- 상수는 웹 원본과 동일하며 `[원본확정]`/`[프로토]` 주석도 그대로 옮겼다.

## 영웅 빌드 — 타입 없음, 적응형 드래프트

영웅 타입(전사/궁수/마법사)과 전직은 없다. 영웅은 하나의 스탯 라인으로 시작하고
(배수 없음 — 기본 상수 그대로), 빌드 방향은 **증강 드래프트의 관성**이 만든다.

- 뽑기 가중치는 적응형이다: `weight = 1 + ADAPTIVE_KIND_WEIGHT(0.9) × (그 계열 보유 수)`
  (`Augments.ADAPTIVE_KIND_WEIGHT`, `Hero.RollAugmentChoices`)
- 이미 든 계열일수록 더 잘 뜬다 — 특화(3개)·대특화(5개)는 강제가 아니라 관성으로 완성된다
- 남는 제약은 넷뿐: maxStacks / 대폭발은 충격파 필요(requiresSplash) /
  스킬은 하나만(skillGate) / 스킬 개조는 그 스킬 보유 시만
- 타입 배수가 사라져 단일 영웅 기준 DPS가 올랐기 때문에 `HERO_DAMAGE_PER_LEVEL`은
  26 → 22로 내려 초반 가드를 지킨다 (web/src/data/hero.ts와 동일)

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
  시너지(특화 3 / 대특화 5) · AUGMENT_LEVELS=[9,16,24,30,35,42] + 이후 8레벨마다 ·
  적응형 드래프트 가중치(ADAPTIVE_KIND_WEIGHT=0.9)
- 액티브 스킬 4종(소용돌이/일제 사격/유성/허수아비) 자동 시전 + 개조(SkillMods/FoldMods)
- 피해 기여 집계(heroDamageDealt/towerDamageDealt/tankAssistDamage), 점수, 게임오버

미포팅:

- **명예의 전당 영속 저장** (web/src/ui/hall-of-fame.ts) — localStorage 기반이라 제외.
  게임오버 화면에 이번 판 점수·기록만 띄운다.
- 웹 HUD의 진행 바 연출 일부(반복 보상 바 등)는 텍스트로 축약

## 컴파일 검증

Unity 없이 검증하려면 (.NET 8 SDK):

```bash
# Core — 실제 컴파일 (UnityEngine 의존이 없으므로 netstandard2.1로 그대로 빌드된다)
dotnet build   # csproj에 Assets/Scripts/Core/*.cs 포함, TargetFramework netstandard2.1

# View — UnityEngine API 표면 스텁을 만들어 문법·타입 검증 가능
```

이 저장소 작성 시 검증 완료: Core/View 전 파일 0 에러 0 경고,
Core 헤드리스 스모크 런(봇 자동 플레이 R79, 증강 드래프트·보스·GOD 타워 전부 통과,
적응형 가중치는 탱커 2개 보유 시 탱커 계열 출현 21.9% → 42.0%로 확인).
