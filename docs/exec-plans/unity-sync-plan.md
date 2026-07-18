# 실행 계획 — Unity 동기화 (세션 이어하기용)

> 상태: **완료** (2026-07-10 검수 후 커밋 — 보관) · 최종 갱신: 2026-07-10
> 목적: 이 문서만 읽으면 새 세션(사람이든 에이전트든)이 Unity 동기화를 이어받을 수 있다.
> 완료되면 이 문서 상태를 "완료"로 바꾸고 진행 기록을 남긴 채 보관한다.

---

## 배경과 원칙

- **web/이 원본이다.** `unity/Assets/Scripts/Core/`는 web/src의 1:1 C# 미러,
  `View/`는 Unity 전용 표현층. 로직·상수를 Unity에서 독자적으로 바꾸지 않는다.
- 동기화 작업 시 **web/ 수정 금지, 커밋 금지** (커밋은 코디네이터가 검수 후 수행).
- 에디터가 열려 있을 수 있으므로 **파일 단위로 완결되게** 저장한다 (중간 상태 금지).
- 상수 값은 web/src/data/*.ts에서 **직접 읽어** 옮긴다 — 이 문서의 수치도 스냅샷일 뿐이다.

## 현재 상태 (2026-07-10, 커밋 0d3b566 기준)

- **마지막 완전 동기화 커밋**: `d009de2` (스탯 시스템 도입)까지는 Unity에 커밋돼 있음.
- **작업트리(미커밋)**: `13b5be6` 동기화가 에이전트 세션 한도로 중단된 채 남아 있다.
  - Core는 대부분 반영됨 — 확인됨: `STAT_GRANT_EVERY=20`, `HP_LEVEL_MULT_GROWTH=1.0`,
    `BossHP 1150`, BoughtStats=구매 횟수 구조.
  - **GameHud.cs의 스탯 버튼(보유 포인트 + 다음 지급량 표시) 작업 도중 중단** — 미완 가능성.
  - 보스 어그로(저지 불가) 반영 여부 **미검증**.
- **미착수 웹 커밋**: `f74d907`, `e75e246` (아래 목록).

## 동기화 대상 (오래된 것부터)

### 1. `13b5be6` — 보스 뽑기 운·스탯 성장 곡선·보스 저지 불가 (작업트리에 부분 반영)

- [x] `HeroData.cs`: STAT_GRANT_EVERY=20, StatGrant/StatPointsFor
      (HP_LEVEL_MULT_GROWTH는 e75e246이 2.4로 되돌림 — 아래 3번 참고)
- [x] `Balance.cs`: BossHP = 1150 × 2.15^(lvl-1)
- [x] **검증 완료**: `Game.cs` advanceEnemies — 보스 저지 불가(`Kind != Boss` 조건),
      허수아비는 도발(Taunts)일 때만 보스를 잡는다. 웹과 일치 확인.
- [x] **검증 완료**: `Hero.cs` — Bought는 구매 횟수, Points는 파생(get), ComputeStats에 포인트 입력.
- [x] **확인 결과 이미 완료**: `GameHud.cs` 스탯 버튼 — 웹 원본(ui.ts:199)은
      `{라벨} {구매횟수} · {비용}`만 표시한다(지급량 표시 없음). Unity가 이미 일치.

### 2. `f74d907` — 가스 경제 개편 (미착수)

원본: `web/src/data/balance.ts`, `web/src/data/skills.ts`, `web/src/data/hero.ts`,
`web/src/game/game.ts`, `web/src/game/hero.ts`, `web/src/ui/ui.ts`.

- [x] 프로브: `Balance.ProbeCost = round(30 × 1.3^owned)`, `PROBE_MAX = 16`, BuyProbe가 지수 비용 차감
- [x] 증강 리롤: `Augments.AUGMENT_REROLL_MAX = 2`, `AugmentRerollCost(used) = 12 × (used+1)`,
      `Game.RerollsUsed`(새 선택지마다 0으로), `RerollCost/CanReroll/RerollAugments()`
- [x] 가스 스킬 개조: `Skills.GAS_SKILL_DAMAGE_MULT = 1.08`, `GAS_SKILL_CDR_MULT = 0.94`,
      `GasSkillCost = round(30 × 1.35^n)`, `Hero.GasSkillDamage/GasSkillCdr`,
      Skill 게터에 가스 개조 패치 합성,
      `Game.GasSkillCost/CanBuyGasSkill/BuyGasSkill(GasSkillTrack.Damage|Cdr)`
- [x] HUD: 프로브 버튼에 지수 비용 표시, 증강 오버레이에 리롤 버튼(비용·남은 횟수·보유 가스),
      스킬 보유 시 영웅 패널에 개조 2버튼(피해 +8% / 쿨 -6%, 패널 높이 가변)

### 3. `e75e246` — 영웅 몫 재조정 (완료, 상수는 2개가 아니라 **3개**였다)

- [x] `SKILL_PER_INT` 0.06 → **0.035**
- [x] `STAT_COST_GROWTH` 8 → **14**
- [x] `HP_LEVEL_MULT_GROWTH` 1.0 → **2.4** — 계획서에 없던 항목. e75e246 diff에서 발견
      (13b5be6이 1.0으로 내렸다가 e75e246이 2.4로 되돌림). "계획서 수치는 스냅샷일 뿐,
      코드에서 직접 읽는다" 원칙이 실제로 작동한 사례.

### 4. 이후 웹 커밋 확인

- [x] `git log d009de2..HEAD -- web/src` 확인 — 13b5be6·f74d907·e75e246 외에는
      `083ad93`, `0d3b566`(문서 경로 주석 변경뿐 — Core 로직 무관)만 있음. 추가 대상 없음.

## 검증 절차 (전 단계 공통)

1. **컴파일**: dotnet 8로 Core를 netstandard2.1/C#9 빌드 → 0 에러 0 경고.
   View는 UnityEngine 스텁(이전 세션에서 /tmp에 만들었음 — 없으면 재생성)과 함께 빌드.
2. **상수 스팟체크**: web/src/data와 값 대조 (특히 이 계획서의 수치가 아니라 **코드**와).
3. **헤드리스 스모크 런**: 시드 봇으로 R70+ 완주. 추가 확인:
   - 55골드 4유닛 + Lv1 보스: 조합 없으면 대체로 실패, 있으면 대체로 성공 (시드 몇 개)
   - 리롤: 가스 차감, 선택당 2회 상한, 새 선택지에서 리셋
   - 가스 개조: 구매 후 스킬 피해/쿨 변화
4. **README**: `unity/README.md` 포팅 범위 절 갱신.

## 검증 결과 (2026-07-10)

- 컴파일: dotnet 8, netstandard2.1/C#9 — Core·View(스텁) 모두 **0 에러 0 경고**
  (검증 프로젝트 `/tmp/godtd-verify/` — core/view/smoke.csproj + UnityStubs.cs + SmokeRun.cs)
- 상수 스팟체크: web/src/data 현재 코드와 대조 — 전부 일치
- 헤드리스 스모크 런 (시드 봇): **R76 완주**, 킬 1291, 보스 Lv6 클리어(36기), GOD 타워 R18
  - Lv1 보스 기준선: 75미네랄(6기) 12/12 킬, 55미네랄(4기) 9/12 — 뽑기 운 확인
  - 리롤: 가스 차감·2회 상한·새 선택지 리셋·가스 부족 거부 전부 통과
  - 가스 개조: 피해 ×1.08 곱, 쿨 ×0.94 곱(하한 1초), 업그레이드와 같은 지갑 확인
  - 적응형 드래프트: 탱커 2개 보유 시 탱커 계열 출현 21.9% → 42.0%
- README: 포팅 범위·영웅 빌드 수치·검증 절 갱신 완료

## 완료 기준

- [x] 위 1~4 전 항목 체크
- [x] 코디네이터 검수 → 커밋 (메시지에 동기화한 웹 커밋 해시 명시: 13b5be6·f74d907·e75e246)
- [x] 이 문서 상태를 "완료"로 갱신

## 재개 방법

에이전트에게 이 문서 경로를 주고 시작시킨다. 프롬프트에 반드시 포함:
**"web/ 수정 금지, 커밋 금지, 원본은 web/src 정독, 파일 단위 완결 저장,
완료 시 바뀐 파일 목록과 검증 결과 보고."**
작업트리의 미커밋 unity/ 변경은 이전 세션의 부분 동기화이므로 **버리지 말고 이어서** 작업한다.

## 진행 기록

| 날짜 | 세션 | 한 일 |
|---|---|---|
| 2026-07-09 | 초기 | d009de2까지 완전 동기화 (전직 삭제·적응형 드래프트·스탯 시스템) + 프레젠테이션 패스 |
| 2026-07-10 | 이어짐 | 13b5be6 동기화 중 세션 한도로 중단 (Core 대부분 반영, HUD 미완) — 작업트리에 미커밋 상태로 보존 |
| 2026-07-10 | 재개 | 13b5be6 잔여 검증(전부 이미 반영 확인) + f74d907 가스 경제 전체 + e75e246 상수 3개(HP_LEVEL_MULT_GROWTH 2.4 복원 포함) 동기화. 빌드 0에러·스모크 런 R76 통과. 검수·커밋 대기 |
| 2026-07-17 | 7차 | **웹 전용 개편 시작 — Unity 미러 부채 발생** (사용자 지시: "일단 기획문서 + 웹버전만"). 아래 항목이 Unity에 **없다**: ① `MANA_PER_ATTACK` 6 / `MANA_ON_DAMAGED` 14 (Unity는 10/8) ② `bossHP` base 700 + Lv6+ 완만 성장(Unity는 800×3.4 균일) ③ `SPAWN_COST_GROWTH` 0.30 (Unity 0.40) ④ `XP_COST_GROWTH` 1.08 (Unity 1.10) ⑤ `effectSummary`/`rarityScales` (등급 표기 정직화) ⑥ 웹 증강 기록 오버레이(Unity는 F4로 기존 제공 — 단 실제 수치 표기는 없음). 6차까지의 항목(강타 대상 3명·GOD 리롤·복제 자동화)은 Unity에 반영돼 있으나 **컴파일 미확인**(에디터 세션 끊김). 재개 시 이 표를 기준으로 되맞출 것. |
