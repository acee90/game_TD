# 갓타워디펜스 프로토 — Unity 데스크탑 포팅

`web/src`의 웹 타워디펜스 프로토타입을 Unity 2022.3 LTS로 1:1 포팅한 것이다.
에셋·씬·프리팹이 전혀 없다 — 코드만으로 열자마자 실행된다.

## 여는 법

1. Unity Hub → **Add** → 이 `unity/` 폴더 선택
2. 에디터 버전 **Unity 6.5** (6000.5.3f1 기준, 같은 6000.x면 됨)로 열기
3. 프로젝트가 열리면(기본 빈 씬 그대로) **Play** 누르기

### 버전·패키지 메모 (Unity 6.5 기준)

- 처음엔 2022.3 LTS로 작성됐고 6000.5.3f1로 열어 업그레이드했다. 코드 전용
  프로젝트라 마이그레이션 이슈는 없었다 — 다른 6000.x로 열어도 된다.
- `Packages/manifest.json`은 6.5가 스스로 추가한 기본 패키지(멀티플레이어 센터·
  접근성·적응형 성능 등) + 코드가 쓰는 모듈(imgui·physics·particlesystem)이다.
  `com.unity.modules.textrendering`은 **6.5에서 패키지가 삭제**됐다(TextMesh API는
  엔진에 항상 포함으로 바뀜) — 매니페스트에 다시 넣으면 열 때마다 resolve 에러가 난다.
- 사용 API(CreatePrimitive · OnGUI · LineRenderer · Physics.Raycast · Standard 셰이더 ·
  ParticleSystem · TrailRenderer · TextMesh)는 2022.3과 Unity 6 양쪽에서 동일하게 동작한다.
- **Hub의 "Built-in Render Pipeline deprecated" 배지**: 이 프로젝트는 SRP(URP/HDRP)
  에셋이 없어 빌트인 RP로 렌더링한다. 6.x에서 빌트인 RP는 deprecated지만 **정상 동작**
  한다 — 배지는 경고일 뿐 에러가 아니다. URP 전환은 Standard 셰이더 → URP/Lit 교체가
  필요한 별도 프레젠테이션 작업이라 백로그로 둔다.

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

**좌클릭 = 선택 · 우클릭 = 영웅 이동** (Warcraft II 이후 RTS 표준).
명령은 선택한 대상에 따라 바뀌는 **커맨드 카드 3×3**에 뜬다.

| 입력 | 동작 |
|---|---|
| 좌클릭 — 영웅 | 영웅 선택 → 스탯 강화·스킬 개조 명령이 열린다 |
| 좌클릭 — 타워 타일 | 타워 선택 (사거리 링 + 정보) → 판매 |
| 좌클릭 — 빈 타일 | 타일 선택 → 유닛 생성 |
| 좌클릭 — 빈 곳 | 선택 해제 |
| 우클릭 — 아무 곳 | 영웅 이동 (클릭 좌표를 경로에 투영해 스냅) |
| 마우스 휠 | 카메라 줌 |
| Esc | 선택 해제 / 하위 메뉴에서 뒤로 |

### 커맨드 카드 — 위치가 곧 단축키

```
┌───┬───┬───┐
│ Q │ W │ E │   선택 대상이 바뀌어도
├───┼───┼───┤   같은 키가 같은 칸을 누른다
│ A │ S │ D │   (SC2 · Legion TD 2 방식)
├───┼───┼───┤
│ Z │ X │ C │
└───┴───┴───┘
```

| 선택 | 카드 내용 |
|---|---|
| **영웅** | `Q`XP 구매(20미네랄) / `A`스킬 피해 `S`쿨타임 개조. **스탯 배분은 레벨업 시 일시정지 카드**(증강처럼 힘/민/지 택1) |
| **타워** | `Q`판매 |
| **빈 타일** | `Q`유닛 생성 |
| **없음 (전역)** | `Q`프로브 `W`테란 `E`저그 / `A`플토 `S`크리쳐 `D`보스 소환▸ / `Z`아무 빈 타일에 생성 |
| └ 보스 하위 | `Q`~`D` = Lv1~Lv6 · `Esc` 뒤로 |

**영웅 스킬은 자동 시전이라 버튼이 없다** — 쿨타임 게이지로만 표시한다.
구 단축키(P·B·R·X·1~7)는 그리드 방식으로 대체되어 사라졌다.

## 구조

```
unity/
├── Packages/manifest.json            # 기본 모듈만 (imgui, physics, particlesystem + 6.5 기본 패키지)
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

## 영웅 빌드 — 골드→XP→레벨업 택1 + 적응형 드래프트 (2안, 2026-07-11)

영웅 타입(전사/궁수/마법사)과 전직은 없다. **파워 = 스탯(레벨업 택1 적립) ×
증강 배수(선택)** — 레벨 배수는 폐지됐다.

- **XP는 골드로 산다** (1골드=1XP, 버튼당 20 — TFT식). 킬 XP(0.3/기, 막타 ×2)는 부축
- **레벨업마다 focus 스탯에 포인트 적립**: `2 + L/10`포인트.
  힘(공격 +6/체력 +70 per pt) · 민첩(공속 +4%/pt, 간격 하한 0.25초) ·
  지능(스킬 피해 +3.5%/pt). focus 선택은 무료·즉시 — 기본값은 마지막 선택 반복
- **증강 드래프트**: 뽑기 가중치는 적응형 —
  `weight = 1 + ADAPTIVE_KIND_WEIGHT(0.9) × (그 계열 보유 수)`.
  특화(3개)·대특화(5개)는 강제가 아니라 관성으로 완성된다
- 남는 제약은 넷뿐: maxStacks / 대폭발은 충격파 필요(requiresSplash) /
  스킬은 하나만(skillGate) / 스킬 개조는 그 스킬 보유 시만

## 포팅 범위

포함 (웹 원본과 동일 로직·동일 상수):

- 십자 맵, 반시계 경로, 타일 41개(십자 17 + 모서리 24), 경로 투영(`NearestPathDistance`)
- 라운드 고정 간격 웨이브, 5라운드 사이클 HP·장갑 곡선, 스폰 큐
- 유닛 생성·자동 연쇄 조합(merge)·판매, 4종족 × 5티어 풀, GOD 풀 조기/확장 분기
- 태그 전투(파워/스플래시/스피드), 크리쳐 감속(최강 1개만), 종족 업그레이드 복리
- 경제: 미네랄/가스/프로브(지수 비용 100×1.5^n, 상한 16), 보스 처치 보상, 킬 마일스톤,
  웨이브 보상, 누출 +5. 가스 싱크 3종 경쟁 — 종족 업그레이드 / 증강 리롤 / 스킬 개조
- 증강 리롤: 선택지 3장을 가스로 다시 뽑는다 (12가스, 두 번째 24, 선택당 최대 2회)
- 가스 스킬 개조: 피해 +8%/구매(곱)·쿨타임 -6%/구매(곱, 하한 1초), 비용 30×1.35^n,
  스킬 증강 보유 시만
- 보스 소환 Lv1~6 (쿨타임 45초, Lv N 처치 → Lv N+1 해금), 보스 누출 라이프 손실,
  보스는 영웅에게 저지되지 않음(도발 허수아비만 잡는다)
- 영웅: 경로 위 이동, 어그로 블로킹, 부활. 골드 XP 구매(20골드=20XP) + 킬 XP →
  레벨업마다 focus 스탯 포인트 적립(2+L/10, XP 비용은 지수 14×1.06^L) × 증강 배수,
  스킬 피해에 지능 반영(+3.5%/pt)
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

Unity 없이 검증한다 (.NET 8 SDK 필요). 스텁과 csproj는 `tools/unity-typecheck/`에 커밋돼 있다:

```bash
cd tools/unity-typecheck
dotnet build core.csproj   # Core — UnityEngine 의존이 없어 그대로 빌드된다
dotnet build view.csproj   # View — UnityStubs.cs가 UnityEngine API 표면을 흉내낸다
```

스텁에 없는 UnityEngine API를 쓰면 여기서 먼저 걸린다 — 스텁을 보강하면 된다.
**이건 문법·타입 검증일 뿐 런타임 동작 검증이 아니다.** 클릭·렌더·프레임률은 에디터에서 봐야 한다.

마지막 동기화(웹 커밋 e75e246) 시 검증 완료: Core/View 전 파일 0 에러 0 경고,
Core 헤드리스 스모크 런(봇 자동 플레이 R76 완주, 상수 스팟체크·가스 경제(리롤·개조·
프로브 지수 비용)·Lv1 보스 기준선(75미네랄 12/12, 55미네랄 9/12)·증강 드래프트 전부 통과,
적응형 가중치는 탱커 2개 보유 시 탱커 계열 출현 21.9% → 42.0%로 확인).
