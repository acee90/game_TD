# 실행 계획 — Web·Unity 공통 게임 런 로그

> 상태: **초안** (GitHub #12~#16 범위 검토 완료, 구현 전) · 작성일/최종 갱신: 2026-07-18
> 상위 이슈: [#12 게임 로그 기록 시스템 도입](https://github.com/acee90/game_TD/issues/12)
> 하위 이슈: [#13 P0 스키마](https://github.com/acee90/game_TD/issues/13) →
> [#15 P1 Web](https://github.com/acee90/game_TD/issues/15) →
> [#16 P2 Unity](https://github.com/acee90/game_TD/issues/16) →
> [#14 P3 분석·검증](https://github.com/acee90/game_TD/issues/14)
> 범위: 한 판의 빌드·점수·주요 의사결정을 코어 상태 변경 지점에서 JSONL로 기록하고,
> Web/Unity 로그를 같은 계약으로 검증·분석한다. 게임 규칙과 밸런스 수치는 바꾸지 않는다.

> 진행 기록 (2026-07-18): **P0 계약과 P1 Web 기준 구현 완료.** 공통 JSON Schema,
> `mulberry32-v1`, Core 이벤트 sink, IndexedDB 저장·재로드, 게임오버 JSONL/summary 다운로드와
> 관련 테스트 6개를 추가했다. Unity(P2), viewer·분석(P3), Cloudflare(P4)는 미착수다.

---

## 0. 결론

공통 시스템의 기준은 공유 런타임 코드가 아니라 **버전이 있는 JSON Schema와 이벤트 의미**다.
Web은 TypeScript, Unity는 C# 구현을 유지하되 두 구현이 루트의 같은 스키마와 fixture 검증을
통과하게 한다.

```text
Game의 성공한 상태 변경
        │
        ▼
공통 이벤트 계약 (schemas/game-run-log/v1.schema.json)
        │
        ├── Web Core sink ── IndexedDB ── JSONL/summary 다운로드
        │
        └── Unity Core sink ── 파일 writer ── persistentDataPath
                                  │
                                  ▼
                         공통 validator·분석 CLI
                                  │
                                  ├── runs.csv
                                  └── runs.md
```

우선순위는 다음과 같다.

1. **P0에서 의미와 스키마를 고정**한다. 시간·순서·종료 의미가 불명확하면 두 구현이
   문법만 같고 내용은 다른 로그를 만든다.
2. **P1 Web을 기준 구현**으로 만든다. DOM 없는 `Game` 테스트가 이미 많아 이벤트 위치와
   순서를 가장 빨리 검증할 수 있다.
3. **P2 Unity는 Core와 파일 I/O를 분리**해 미러한다. `Core`는 `UnityEngine`과 파일 경로를
   모르게 하고 View/Infrastructure가 실제 저장을 담당한다.
4. **P3에서 스키마 검증·집계 CLI·로컬 viewer를 함께 만든다.** 사람이 JSONL을 직접
   읽는 상태는 완료가 아니다.
5. **P4에서 Cloudflare Worker + D1 중앙 저장소를 붙인다.** 첫 클라우드 버전은 admin의
   수동 로그 업로드부터 시작하고, 게임 클라이언트 자동 업로드는 그 다음 게이트로 분리한다.

분석 SaaS, 일반 사용자 계정, 실시간 텔레메트리는 v1에 넣지 않는다. #12의 완료 범위는
로컬 저장·내보내기·viewer까지이며, Cloudflare 중앙 수집은 별도 P4 후속 이슈로 관리한다.

## 1. 현행 코드 감사

### 1.1 Web

- 코어 `Game`은 [`web/src/game/game.ts`](../../web/src/game/game.ts)에 있고 DOM 의존성이 없다.
- 생성자는 `Rand` 함수만 받는다. 실제 seed는 보존하지 않으므로 현재 상태로는 로그에 seed를
  적어도 판을 재현할 수 없다.
- 상태 변경 지점은 이미 `summonBoss`, `spawnUnit`, `resolveMerges`, `chooseAugment`,
  `rerollAugments`, `buyXp`, `grantXp`, `beginRound`, `onKilled`, `breakthrough`, `buyProbe`,
  `upgrade`에 집중되어 있다.
- Svelte 앱은 게임오버 순간 점수 스냅샷을 한 번만 만든다. 이 경로를 `run_finished`와
  다운로드 UI에 연결할 수 있다.
- 시작 오버레이와 메뉴에서는 `Game.update()`를 호출하지 않는다. 따라서 코어가 세는 시간은
  UI 대기 시간이 아닌 게임 시뮬레이션 시간으로 유지할 수 있다.

### 1.2 Unity

- [`unity/Assets/Scripts/Core/Game.cs`](../../unity/Assets/Scripts/Core/Game.cs)에 Web과 대응하는
  상태 변경 메서드가 있다.
- `GameView`가 `new Game()`으로 세션을 생성·재생성한다. 이 지점에서 run context와 파일
  기록기를 주입할 수 있다.
- 현재 Core에는 파일 I/O와 `UnityEngine` 의존성이 없다. 이 경계를 유지한다.
- `com.unity.test-framework`는 설치되어 있지만 JSON 객체 직렬화 라이브러리는 명시적으로
  설치되어 있지 않다.
- Web과 Unity에는 일부 기능 차이가 있다. v1의 목표는 **같은 이벤트 이름·필드·의미**이지,
  서로 다른 현행 기능에서 이벤트 개수와 순서까지 완전히 같게 만드는 것이 아니다.

### 1.3 문서 상태

로그 시스템은 아직 구현·검증되지 않았으므로 이 문서만 `초안`으로 둔다. 현행
`game-system-spec.md`에는 구현 전에 로그 규칙을 확정 사항처럼 추가하지 않는다. P1~P3 검증을
마치면 설계 결정 기록에 채택 결과를 추가한다.

## 2. P0에서 먼저 확정할 계약

### 2.1 저장 형식

- 이벤트 파일: UTF-8 **JSONL**, 한 줄에 이벤트 하나, 줄 끝 LF.
- 요약 파일: UTF-8 JSON 한 개.
- 스키마 버전: 정수 `v`; 첫 버전은 `1`.
- 숫자: 로케일과 무관한 JSON number. 시간은 초 단위이며 소수 허용.
- 이벤트 이름과 enum 값: 영문 `snake_case`.
- 표시명은 보조 필드다. 집계 키는 가능하면 기존 ID를 쓰고, 타워는 v1에서
  `name + tier + race`를 함께 기록해 빌드 SHA와 대조할 수 있게 한다.

머신 판독 계약은 `schemas/game-run-log/v1.schema.json` 하나를 기준으로 둔다. TypeScript와
C# 타입은 이를 구현하는 미러이며 어느 한쪽 타입만을 원본으로 보지 않는다.

### 2.2 공통 envelope

모든 줄은 다음 필드를 가진다.

| 필드 | 형식 | 의미 |
|---|---|---|
| `v` | integer | 로그 스키마 major 버전 |
| `runId` | string | 세션 UUID; 파일명과 summary 연결 키 |
| `seq` | integer | 1부터 시작해 이벤트마다 1 증가 |
| `elapsedSeconds` | number | pause·메뉴 시간을 제외한 누적 시뮬레이션 시간 |
| `round` | integer | 이벤트 직후의 현재 라운드; 오프닝은 0 |
| `roundTime` | number | 현재 라운드 시작 후 흐른 시뮬레이션 시간; 오프닝도 0부터 계산 |
| `score` | integer | 이벤트 직후 누적 점수 |
| `type` | string | 이벤트 카탈로그의 이름 |
| `data` | object | 이벤트별 payload |

예시:

```json
{"v":1,"runId":"019f...","seq":23,"elapsedSeconds":186.4,"round":8,"roundTime":10.4,"score":1240,"type":"hero_xp_bought","data":{"cost":20,"xp":20,"levelBefore":7,"levelAfter":8}}
```

시간은 벽시계가 아니라 `Game.update(dt)`에 들어간 **게임 시간**이다. Web의 2× 배속은 `dt`에
반영되므로 로그 시간도 2×로 흐른다. 증강 선택으로 `game.paused`인 동안, 시작 게이트와 메뉴로
`update`가 호출되지 않는 동안에는 흐르지 않는다. 실제 생성 시각은 `run_started.startedAt`
ISO-8601 필드로만 별도 보존한다.

현재 라운드는 고정 간격으로 겹칠 수 있다. 따라서 `round_cleared`는 “필드의 적을 모두 처치함”이
아니라 **고정 라운드 시간이 끝나 보상 정산 후 다음 라운드로 넘어감**을 뜻한다고 스키마 설명에
명시한다. 이름은 이슈와의 호환 때문에 v1에서 유지한다.

### 2.3 seed와 재현성

`run_started`의 seed는 장식용 메타데이터가 아니어야 한다.

- Web/Unity에 같은 명세의 32-bit seed PRNG(`rngAlgorithm` 버전 포함)를 추가한다.
- UI/시뮬레이터가 seed를 만들고 `Game`에 PRNG와 `RunContext`를 함께 주입한다.
- `run_started.data`에 `seed`, `rngAlgorithm`, `target`을 기록한다.
- 기존 테스트의 고정 `Rand` 주입은 유지한다. 이런 테스트 run은 명시적인 test seed/algorithm을
  쓰거나 로그 기록을 끈다.
- 동일 seed의 **각 런타임 내 재현**을 v1 게이트로 둔다. Web/Unity의 기능 차이까지 포함한
  완전한 cross-runtime replay는 비목표다.

### 2.4 성공 이벤트만 기록

코어 메서드가 `false`를 반환한 입력은 P0 로그에 넣지 않는다. 잔액 부족 클릭 수 같은 UX 분석은
별도 이벤트 버전에서 추가한다. 성공 이벤트는 상태 변경 직후 기록하며 다음 원칙을 지킨다.

- 타워 생성 이벤트를 먼저 기록한 뒤 연쇄 조합 이벤트를 순서대로 기록한다.
- XP 구매 이벤트 뒤에 그 구매로 발생한 `hero_leveled`를 기록한다.
- `grantXp`는 `purchase | mob_kill | boss_kill` source를 받아 레벨업 원인을 보존한다.
- 모든 증강 제안 묶음에 `offerId`를 부여해 제안 → 리롤 → 선택을 연결한다.
- `game_over`와 `run_finished`는 각각 정확히 한 번 기록한다.

### 2.5 종료와 summary

종료 사유는 `game_over | restart | quit | abandoned | test`로 제한한다.

- 라이프 0: Core가 `game_over`를 쓰고 곧바로 `run_finished`를 쓴다.
- 다시 시작: UI/View가 Core의 idempotent `finishRun('restart')`를 호출한 뒤 세션을 교체한다.
- 페이지/앱 종료: 저장 어댑터가 마지막 이벤트를 flush하고 가능한 경우
  `finishRun('quit')`를 호출한다. 브라우저 강제 종료는 보장할 수 없으므로 미종료 run도 분석기가
  읽되 `complete=false`로 표시한다.
- `run_finished.data.summary`와 별도 `summary.json`은 같은 `RunSummary`에서 생성한다.

`RunSummary` 최소 필드:

| 그룹 | 필드 |
|---|---|
| 식별 | `v`, `runId`, `complete`, `finishReason`, build info, seed |
| 결과 | `score`, `round`, `elapsedSeconds`, `kills`, `bossCleared`, `bossesKilled` |
| 영웅 | 최종 level, XP 구매 횟수·지출, 선택 증강 ID·등급·선택 시점 |
| 경제 | 최종 mineral/gas, probes, 병과별 upgrade level |
| 타워 | 최종 `name/tier/race/count`, 누적 생성·조합·판매·GOD 리롤 횟수 |
| 품질 | 첫/마지막 seq, 필수 이벤트 누락 여부는 분석 단계에서 파생 |

## 3. 이벤트 카탈로그 v1

### 3.1 #13과 #12의 필수 이벤트

| 이벤트 | 기록 위치 | 필수 payload |
|---|---|---|
| `run_started` | Game 세션 초기화 | `startedAt`, build info, `target`, `seed`, `rngAlgorithm`, 초기 재화 |
| `round_started` | `beginRound` | 시작 round, 적 수, wave type |
| `round_cleared` | 다음 `beginRound`의 직전 정산 | 완료 round, 보상 mineral/gas, `semantic: timer_elapsed` |
| `tower_spawned` | `spawnUnit`, 복제 성공 | `source: purchase/copy`, slot index, tower, cost |
| `tower_merged` | `resolveMerges`의 각 연쇄 단계 | consumed tower/count, produced tower, slot index, `isGod` |
| `tower_sold` | `sellSelected` | slot index, tower |
| `boss_summoned` | `summonBoss` 성공 | level, cooldown |
| `boss_killed` | `onKilled` boss 분기 | level, reward, 새 해금 여부·최고 해금 level |
| `augment_offered` | `offerAugmentIfPending` | `offerId`, 영웅 level, 카드 3장의 ID·등급 |
| `augment_rerolled` | `rerollAugments` 성공 | `offerId`, 횟수, cost, 새 카드 목록 |
| `augment_chosen` | `chooseAugment` 성공 | `offerId`, choice index, augment ID·등급 |
| `hero_xp_bought` | `buyXp` 성공 | cost, 구매 XP, 구매 전후 level·XP |
| `hero_leveled` | `grantXp` | from/to level, 실제 XP, source |
| `probe_bought` | `buyProbe` 성공 | cost, 구매 후 수량 |
| `race_upgraded` | `upgrade` 성공 | race index/name, from/to level, cost |
| `game_over` | `breakthrough`에서 라이프 0 | 원인, 마지막 누출 종류·보스 level, 최종 lives |
| `run_finished` | idempotent `finishRun` | reason, complete, `summary` |

### 3.2 코드 감사에서 확인된 v1 확장 이벤트

현행 플레이어 선택인데 필수 후보 목록에 없던 아래 이벤트도 v1에 포함한다. 누락하면 최종 빌드의
원인을 설명할 수 없다.

| 이벤트 | 기록 위치 | 이유 |
|---|---|---|
| `god_rerolled` | `rerollGod` | GOD 종류 교체와 누적 비용은 핵심 타워 빌드 결정 |
| `gas_skill_upgraded` | `buyGasSkill` | 병과 업그레이드와 같은 가스 지갑을 쓰는 경쟁 선택 |
| `tower_copy_marked` | `markCopyTarget` | 수동 예약·취소 여부와 자동 복제를 구분 |

`enemy_leaked`, 영웅 사망·부활, 자동 스킬 시전, 개별 공격·피해 샘플은 P0에서 제외한다.
이벤트 양과 분석 목적이 확인된 뒤 schema v1의 optional 확장 또는 v2로 다룬다.

## 4. P0 — 공통 스키마와 문서화 (#13)

### 작업

- [x] `schemas/game-run-log/v1.schema.json` 작성 — envelope, payload `oneOf`, summary 정의.
- [x] 이 문서 §2~§3의 이름·시간·종료 의미를 구현 계약으로 확정.
- [x] `run_started` build info 필드 확정:
  `gitSha`, `branch`, `builtAt`, `target`, `appVersion`, `engineVersion`, `dirty`, seed 정보.
- [x] 이벤트별 필수/선택 필드와 enum을 스키마에 기록.
- [x] 플레이어 입력 자유 텍스트를 payload에 넣지 않음.
- [x] 최소 lifecycle JSONL fixture와 strict Ajv 검증 테스트 작성.

### 통과 게이트

- JSON Schema 자체가 validator로 로드된다.
- 모든 P0 이벤트가 `data`의 허용·필수 필드를 가진다.
- 시간, `round_cleared`, 실패 입력, 연쇄 조합, 종료 중복의 의미가 문서로 결정되어 있다.
- Web/Unity 구현자가 추가 질문 없이 타입을 만들 수 있다.

규모: **M**. P1과 P2의 선행 조건이다.

## 5. P1 — Web 코어 기록과 내보내기 (#15)

### 5.1 Core 타입·시간·seed

예상 파일:

- `web/src/game/logging.ts` — `GameEvent`, payload union, `GameEventSink`, `RunSummary`,
  `RunContext`, no-op/memory sink.
- `web/src/game/random.ts` — 버전 고정 seed PRNG.
- `web/src/game/game.ts` — 시간·seq·`record()`·`finishRun()`과 성공 상태 변경 훅.

작업:

- [x] 기존 `new Game(rand)` 호출을 깨지 않는 선택적 logging session 설계.
- [x] 기록기를 생략하면 이벤트 객체를 만들지 않는 no-op 경로 유지.
- [x] `elapsedSeconds`와 `roundTime`은 pause/over 검사 뒤에 증가.
- [x] `run_started`를 첫 이벤트 `seq=1`로 보장.
- [x] `finishRun`을 idempotent로 만들고 종료 뒤 이벤트를 막는다.
- [x] summary는 최종 Game 상태와 누적 카운터에서 한 번 생성.
- [x] 모든 P0·§3.2 이벤트를 성공 경로에 삽입.

### 5.2 브라우저 저장·빌드 정보·UI

예상 파일:

- `web/src/logging/indexed-db-run-store.ts` — run/event/summary 저장.
- `web/src/logging/download-run.ts` — 정렬된 이벤트를 JSONL Blob으로 내보내기.
- `web/src/logging/build-info.ts` — Vite가 주입한 빌드 메타를 `RunContext`로 변환.
- `web/vite.config.ts` — package version, git/CI env, build timestamp를 `define`으로 주입.
- `web/src/App.svelte`, `GameOverOverlay.svelte` 또는 `MenuOverlay.svelte` — 현재 run 내보내기와
  마지막 run 내보내기 진입점.

프레임워크/라이브러리 선택:

- 코어: TypeScript만 사용. 브라우저 API를 import하지 않는다.
- 저장: 네이티브 IndexedDB. v1 규모에 Dexie 같은 추가 런타임 의존성은 넣지 않는다.
- 내보내기: `Blob` + object URL.
- 테스트: 기존 Vitest.

작업:

- [x] 이벤트는 `(runId, seq)` 복합 키로 저장하고 summary는 `runId`로 저장.
- [x] 저장 실패가 게임 진행을 중단하지 않게 recorder가 오류 상태만 보존.
- [x] 게임오버 시 자동 finalize, 메뉴 restart/pagehide 시 finalize·flush.
- [x] JSONL과 summary JSON을 각각 다운로드 가능하게 함.
- [ ] 미완료 run도 목록·내보내기가 가능하되 UI와 분석에서 표시.

### 5.3 Web 테스트

- [ ] 첫 이벤트/seq 단조 증가/공통 snapshot 필드.
- [ ] 실패한 구매·소환은 이벤트 0개.
- [ ] 생성 → 연쇄 조합의 이벤트 순서와 slot/tower payload.
- [ ] 증강 offer → reroll → choose의 같은 `offerId`.
- [ ] XP 구매와 kill/boss XP의 서로 다른 level-up source.
- [ ] pause 동안 두 시간 필드 불변.
- [ ] game over → `game_over` → `run_finished` 정확히 한 번.
- [ ] 같은 seed와 같은 입력으로 핵심 이벤트 payload가 동일.
- [ ] IndexedDB adapter는 fake 구현 또는 브라우저 독립 store contract로 단위 테스트.

통과 명령:

```bash
cd web
npx tsc --noEmit
npx vitest run
npm run build
```

규모: **L**. P0 완료 후 시작하며 P2의 참조 구현이다.

## 6. P2 — Unity 코어 기록과 파일 저장 (#16)

### 6.1 Core 미러

예상 파일:

- `unity/Assets/Scripts/Core/RunLogging.cs` — C# event DTO, payload DTO, `IRunEventSink`,
  `RunContext`, `RunSummary`, no-op sink.
- `unity/Assets/Scripts/Core/SeededRandom.cs` — Web과 같은 PRNG 명세.
- `unity/Assets/Scripts/Core/Game.cs` — 시간·seq·기록 훅·finalize.

원칙:

- Core는 `UnityEngine`, `Application.persistentDataPath`, JSON 라이브러리, 파일 I/O를 참조하지 않는다.
- 문자열 enum 값은 C# enum 이름 자동 변환에 맡기지 않고 계약의 `snake_case`를 명시한다.
- float 직렬화와 시간은 invariant culture를 사용한다.

### 6.2 Unity 저장 어댑터

예상 파일:

- `unity/Assets/Scripts/View/UnityRunFileStore.cs` — JSONL writer와 summary 저장.
- `unity/Assets/Scripts/View/UnityBuildInfo.cs` — Application/build/git 메타 구성.
- `unity/Assets/Scripts/View/GameView.cs` — 새 run 생성·재시작·종료 수명주기.
- `unity/Packages/manifest.json` — 필요 시 Unity 공식 Newtonsoft JSON 패키지 명시.

프레임워크/라이브러리 선택:

- 직렬화: `com.unity.nuget.newtonsoft-json`. payload가 이벤트별 객체이므로 `JsonUtility`의
  다형 object/dictionary 제약을 우회하기 위한 제한된 의존성이다.
- 파일: `System.IO.StreamWriter`.
- 경로: `Application.persistentDataPath/GameLogs/<runId>/events.jsonl`와 `summary.json`.
- 테스트: Unity Test Framework의 EditMode 테스트.

작업:

- [ ] Web과 같은 seed/PRNG 버전, envelope, payload 키를 구현.
- [ ] 한 이벤트를 완성된 한 줄로 append하고 주기적 flush; 종료 이벤트는 즉시 flush.
- [ ] 디렉터리 생성·쓰기 실패가 게임을 중단하지 않게 로깅 비활성화와 오류 메시지를 분리.
- [ ] Editor Play, standalone build, 재시작, 정상 종료 수명주기에서 writer를 한 번만 dispose.
- [ ] build info의 값을 얻지 못하면 키를 생략하지 않고 `unknown`과 `dirty` 상태를 명시.
- [ ] 개발용 토글로 저장을 끌 수 있게 하되 기본 플레이테스트 빌드는 켠다.

### 6.3 Unity 테스트·검수

- [ ] EditMode에서 memory sink로 Web과 같은 이벤트 시나리오 검증.
- [ ] JSON 직렬화 결과를 공통 schema validator에 입력.
- [ ] Play Mode 한 판에서 실제 두 파일 생성 확인.
- [ ] Unity MCP로 고정 seed의 생성/조합/보스/증강/XP 시나리오를 실행하고 로그 경로와
  Console 컴파일 오류 0을 캡처.
- [ ] Web과 Unity의 대표 sample을 P3 fixture로 승격.

규모: **L**. P1 이벤트 의미가 안정된 뒤 시작한다.

## 7. P3 — 분석 리포트·로컬 viewer·회귀 검증 (#14)

### 7.1 validator·분석 CLI

예상 파일:

- `web/tools/analyze-run-logs.ts`
- `web/src/logging/validate-run-log.ts` 또는 tools 전용 validator
- `web/tests/fixtures/game-logs/web-v1.jsonl`
- `web/tests/fixtures/game-logs/unity-v1.jsonl`
- `web/tests/game-run-log-schema.test.ts`
- `web/package.json`의 `logs:analyze` script
- `web/src/log-viewer/` — 파일 로더, run 비교, 타임라인, 빌드 요약 Svelte 컴포넌트
- `web/src/LogViewer.svelte`와 별도 진입 경로 — 게임 UI와 상태를 공유하지 않는 viewer shell

프레임워크/라이브러리 선택:

- 실행: 현재 도구 체계와 같은 `vite-node`.
- 파싱·CSV/Markdown 출력: Node `fs`와 작은 로컬 formatter.
- 스키마 검증: Ajv 2020. 분석 도구와 테스트의 dev dependency로만 둔다.
- viewer: 기존 Svelte 5. 차트 라이브러리는 v1에서 추가하지 않고 표·CSS·작은 SVG로 시작한다.

입력/출력 예:

```bash
cd web
npm run logs:analyze -- ../runs/*.jsonl --out ../tmp/run-report
```

출력:

- `runs.csv`: run당 한 행 — build, seed, finish 상태, 점수, 라운드, 보스, 영웅, 경제.
- `runs.md`: 사람 검수용 비교표 — 타워 조합, 증강 선택 시점, 보스 소환/처치, XP 구매 시점.
- stderr/exit code: schema 위반 파일과 `runId/seq/field`를 정확히 표시.

### 7.2 로컬 viewer

viewer는 서버 없이 정적 빌드만으로 작동하고, P4 admin 패널이 같은 표시 컴포넌트를 재사용한다.

- 입력: JSONL/summary 파일 선택·drag & drop, 여러 파일 동시 로드.
- run 목록: 생성 시각, target/build SHA, seed, 완료 상태, 점수, 라운드, 플레이 시간.
- run 상세: 최종 타워 빌드, 증강 선택과 시점, 보스 소환→처치 소요, 영웅 XP 구매·레벨업
  타임라인, 병과 업그레이드와 경제 요약.
- 필터: event type, round 범위, 시뮬레이션 시간 범위.
- 비교: 2개 이상 run의 점수·라운드·보스·영웅·타워·증강을 열 기준으로 나란히 표시.
- 품질 경고: schema 오류, seq gap, 미완료 run, build 혼합을 상단에 표시.
- 보안: 파일은 브라우저 메모리에서만 파싱하며 P4 전에는 어디에도 업로드하지 않는다.

viewer와 CLI가 서로 다른 계산을 하지 않도록 parser와 summary projector를
`web/src/logging/analysis/`의 DOM 없는 모듈로 공유한다. UI는 그 결과만 렌더링한다.

### 7.3 회귀 게이트

- [ ] JSON 파싱 실패, schema 위반, seq 중복/역행, runId 혼합을 실패 처리.
- [ ] 첫 `run_started`, 완료 run의 마지막 `run_finished`를 검증.
- [ ] `run_finished.summary`와 별도 summary/재집계 결과의 핵심 필드 일치.
- [ ] Web·Unity fixture 모두 같은 schema를 통과.
- [ ] 알려지지 않은 v major는 조용히 읽지 않고 명시적으로 거부.
- [ ] 미완료 run은 오류가 아니라 `complete=false` 경고와 부분 요약으로 출력.
- [ ] CLI와 viewer가 같은 fixture에서 같은 핵심 summary를 출력.
- [ ] viewer production build에서 로컬 파일 load·필터·2-run 비교가 동작.

### 7.4 리포트 사용 절차

분석 출력 자체는 근거 자료의 입력이다. 밸런스 결정을 할 때는 다음을 남긴다.

1. 대상 build SHA와 run 수, seed 범위, Web/Unity target.
2. `runs.csv`에서 계산한 정량 비교.
3. 같은 세션의 플레이테스트 관찰과 참가자 메모.
4. 채택한 변경은 `game-system-spec.md` 설계 결정 기록에 근거 링크와 함께 추가.

원본 JSONL은 개인정보가 없는 로컬 산출물로 보관한다. 의미 있는 측정 결과만
`docs/reports/`의 새 불변 스냅샷으로 커밋한다.

규모: **L**. 실제 Web/Unity 샘플이 준비된 뒤 완료할 수 있다.

## 8. P4 — Cloudflare 중앙 저장소와 admin viewer (후속 이슈)

### 8.1 왜 D1만 직접 연결하지 않는가

Cloudflare D1의 프로그램 접근은 Worker/Pages Function에 연결한 binding을 통해 이뤄진다.
브라우저나 Unity가 D1 자격증명을 들고 직접 SQL을 실행하는 구조가 아니다. 따라서 Cloudflare를
선택하면 **얇은 Worker API는 필수 경계**다. 이는 오히려 schema 검증, 인증, 요청 크기 제한,
중복 방지와 마이그레이션을 한곳에서 처리하게 해준다.

Supabase/Firebase처럼 클라이언트 SDK와 행 단위 보안 규칙으로 DB에 가까이 접근하는 서비스도
가능하지만, Web과 Unity 두 클라이언트의 인증·SDK·보안 규칙을 각각 관리해야 한다. 현재 규모와
Cloudflare 선호를 기준으로는 Worker+D1가 더 작은 장기 구조다.

공식 구조 근거: [Cloudflare D1 시작 가이드](https://developers.cloudflare.com/d1/get-started/)는
Worker를 생성하고 D1 binding을 연결한 뒤 Worker 안에서 query하는 흐름을 기준으로 한다.

### 8.2 P4-A — admin 수동 업로드 MVP

가장 먼저 만들 클라우드 버전이다. 게임 클라이언트 자동 전송보다 범위와 보안 위험이 작다.

```text
Web/Unity 로컬 로그 → admin 파일 업로드 → Worker schema 검증 → D1
                                               │
                                               └→ admin viewer 조회
```

예상 구성:

- `services/game-log-worker/` — TypeScript Worker와 Wrangler 설정.
- D1 migration — `runs`, `run_events` 두 테이블과 조회 index.
- 기존 Svelte viewer 컴포넌트를 쓰는 `/admin/logs`.
- Cloudflare Access로 admin route와 쓰기 API 보호.

최소 API:

| method/path | 역할 |
|---|---|
| `POST /api/admin/import` | JSONL 한 개를 검증하고 transaction/batch로 적재 |
| `GET /api/admin/runs` | build, 기간, 완료 상태, 점수/라운드 조건으로 run 목록 조회 |
| `GET /api/admin/runs/:runId` | summary와 event timeline 조회 |
| `DELETE /api/admin/runs/:runId` | 명시적 admin 삭제; audit 로그 또는 확인 UI 필요 |

D1 모델:

- `runs`: `run_id` PK, schema version, target/build/seed, 시작·종료, complete, score/round,
  summary JSON과 자주 거르는 열.
- `run_events`: `(run_id, seq)` 복합 PK, type, elapsed/round/score, payload JSON.
- index: `runs(started_at)`, `runs(build_sha, target)`, `runs(score)`,
  `run_events(run_id, type)`.
- 같은 `(run_id, seq)` 재업로드는 upsert하지 않고 동일 내용이면 idempotent 성공, 내용이 다르면
  conflict로 거부한다.

통과 게이트:

- [ ] Access 인증 없는 admin/API 접근 거부.
- [ ] 잘못된 schema·혼합 runId·seq 역행을 DB 쓰기 전에 거부.
- [ ] Web/Unity fixture 수동 업로드 후 같은 viewer에서 조회·비교.
- [ ] migration을 로컬 D1과 remote D1에 같은 명령으로 적용.
- [ ] 원본 로그 삭제·보관 기간 정책 문서화.

규모: **M**. #12 완료를 막지 않는 첫 클라우드 후속이다.

### 8.3 P4-B — 게임 클라이언트 자동 업로드

로컬 기록을 원본으로 유지하고, 업로드는 실패 가능한 동기화 계층으로 둔다. 네트워크 실패가
게임이나 로그 생성을 막아서는 안 된다.

추가 API:

| method/path | 역할 |
|---|---|
| `POST /api/v1/runs` | run metadata 등록, 업로드 세션 발급 |
| `POST /api/v1/runs/:runId/events` | 여러 이벤트 batch append |
| `PUT /api/v1/runs/:runId/finish` | summary 저장과 complete 전환 |

원칙:

- 이벤트마다 HTTP 요청하지 않고 개수/바이트 기준 batch로 전송.
- IndexedDB/Unity 파일에 먼저 쓴 뒤 업로드 성공 seq를 별도로 checkpoint.
- exponential backoff와 idempotent `(runId, seq)`로 재시도.
- Web/Unity 배포물 안의 고정 API key는 비밀이 아니므로 인증 수단으로 간주하지 않는다.
- 개인 플레이테스트 단계에서는 Web을 Access 뒤에 두거나 일회성 upload token을 발급한다.
  공개 배포 전에는 익명 세션 발급, rate limit, 요청 크기·run 길이 상한, abuse 대응을 별도
  threat model로 확정한다.

초기에는 D1에 events와 summary를 모두 둔다. 원본 JSONL 크기·보관 비용이 실제로 문제가 된다는
측정이 생기면 **R2에 압축 JSONL 원본, D1에 summary/index** 구조로 옮긴다. 측정 전에 D1+R2를
동시에 도입하지 않는다.

통과 게이트:

- [ ] 오프라인 플레이 후 재접속하면 누락 seq부터 업로드 재개.
- [ ] 중복 전송이 event 중복 행을 만들지 않음.
- [ ] 클라이언트 조작 payload가 schema·크기·rate limit을 우회하지 못함.
- [ ] admin viewer에서 upload 상태와 incomplete run을 구분.

규모: **L**. 인증 정책과 공개 범위 결정이 선행 조건이다.

## 9. 전체 검증 시나리오

한 개의 고정 seed 시나리오가 다음 순서를 포함해야 한다.

1. run 시작 → 오프닝 → R1 시작.
2. 타워 구매 2회 → 자동 조합 1회 → 판매 1회.
3. 보스 Lv1 소환 → 처치.
4. XP 구매로 레벨업 → 증강 제안 → 리롤 → 선택.
5. 광부 구매 → 병과 업그레이드 → 가능하면 스킬 개조/GOD 리롤.
6. 누출로 game over → run finish → summary 생성.

같은 입력을 Web memory sink와 Unity memory sink에서 실행해 다음을 비교한다.

- 공통 필드 타입과 event type.
- 성공 이벤트의 상대 순서.
- 이벤트별 필수 payload 키.
- summary 필드 집합.

현행 기능·밸런스 차이 때문에 점수와 전체 이벤트 수를 cross-runtime 동일성 조건으로 두지는
않는다. 대신 각 런타임에서 같은 seed 재실행의 결정성을 따로 검증한다.

## 10. 위험과 대응

| 위험 | 대응 |
|---|---|
| `record()`가 게임 규칙을 바꿈 | 성공 상태 변경 뒤 side-effect로만 호출, sink 예외 격리, no-op과 logger-on 시뮬 결과 비교 |
| seed를 적었지만 실제 RNG와 무관 | PRNG와 `RunContext`를 함께 주입하고 `rngAlgorithm` 버전 기록 |
| round 시간이 Web/Unity에서 다름 | pause 후 증가·라운드 reset 순서를 계약과 단위 테스트로 고정 |
| async IndexedDB 저장 유실 | seq 키 append, 메모리 버퍼, finish 시 flush; 강제 종료 run은 incomplete 허용 |
| Unity writer가 Core를 오염 | Core sink interface와 View file adapter 분리 |
| JSON 숫자/enum이 런타임마다 다름 | invariant number, 명시적 snake_case, 공통 schema fixture 검증 |
| 이벤트가 너무 많아짐 | v1은 의사결정·보상 이벤트만. 공격/피해는 집계 또는 후속 버전 |
| 타워 이름 변경으로 장기 집계 단절 | build SHA + tier/race/name 기록; 실제 rename이 발생하면 stable unit ID 도입 ADR |
| Web/Unity 기능 차이를 동기화 실패로 오판 | schema 동등성과 플레이 결과 동등성을 분리해 보고 |
| 클라이언트에 DB/API 비밀 노출 | D1은 Worker binding 뒤에 두고 공개 클라이언트의 고정 key를 인증으로 사용하지 않음 |
| 클라우드 장애로 로컬 로그도 유실 | local-first 저장 후 별도 upload checkpoint·retry |
| admin과 로컬 viewer가 다른 결과 계산 | parser/projector/UI 컴포넌트를 공유하고 fixture parity 테스트 |

## 11. 완료 순서와 이슈 종료 조건

| 순서 | 이슈 | 시작 조건 | 종료 증거 |
|---|---|---|---|
| 1 | #13 P0 | 이 계획 승인 | schema + 이벤트 카탈로그 + validator load 테스트 |
| 2 | #15 P1 | #13 계약 고정 | Web JSONL/summary 샘플, tsc/vitest/build 통과 |
| 3 | #16 P2 | P1 event semantics 안정 | Unity 실제 파일 2종, 컴파일·EditMode/Play 검증 |
| 4 | #14 P3 | 두 target fixture 확보 | CSV/Markdown, 로컬 viewer, schema parity 테스트 |
| 5 | #12 Parent | #13/#15/#16/#14 완료 | 한 세트의 재현 명령, viewer 검수, 근거 리포트 절차 확인 |
| 6 | P4-A 후속 | 로컬 viewer 안정 | Worker+D1 수동 import와 Access 보호 admin 조회 |
| 7 | P4-B 후속 | 인증·공개 범위 결정 | Web/Unity offline-first 자동 업로드 |

각 하위 이슈는 자신의 종료 증거 링크를 코멘트로 남긴 뒤 닫는다. Parent는 하위 이슈가 모두
닫힌 것만으로 닫지 않고, Web/Unity 샘플을 분석 CLI 한 번에 넣어 결과가 생성되는 end-to-end
검증 후 닫는다.

P3 viewer와 P4는 현재 하위 이슈 본문에 없다. 구현 전에 #14의 viewer 완료 기준을 보강하고,
P4-A/P4-B는 #12에 억지로 넣지 말고 별도 후속 이슈로 등록한다.

## 12. 문서 승격 규칙

- 이 문서: 구현 중 체크리스트와 발견 사항을 갱신하되 상태는 `초안` 유지.
- P0 계약: machine-readable schema가 원본. 이 문서에는 이유와 의미를 기록.
- P1~P3 완료: `game-system-spec.md` 설계 결정 기록에
  “코어 이벤트 + 공통 schema + 로컬 저장”을 무엇/왜/상태/검증 형식으로 추가.
- 측정 실행: `docs/reports/`에 build SHA, seed, run 수, 재현 명령이 있는 새 불변 리포트 작성.
- 범위 변경: P4의 인증·공개 범위가 확정되기 전까지 자동 업로드 세부안은 이 계획의
  실험 범위에 두고, 제품 기능으로 채택할 때 명세 ADR에 올린다.

## 13. 비목표

- #12 v1 안에서의 자동 원격 수집, 일반 사용자 로그인.
- 실시간 운영 대시보드와 범용 사용자 행동 추적 SDK.
- 모든 공격·피해·프레임 단위 로그.
- 기존 Hall of Fame 데이터 마이그레이션.
- 로그 도입과 동시에 밸런스 수치 변경.
- Web과 Unity의 현재 기능 차이 전체 해소.
- JSONL을 이용한 완전한 replay 엔진. v1은 seed와 의사결정 기록을 replay의 재료로 남기는 단계다.
