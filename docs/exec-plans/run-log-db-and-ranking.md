# 실행 계획 — 게임 로그 DB 저장과 온라인 랭킹

> 상태: **초안** · 작성일: 2026-07-22
> 선행: [game-run-logging.md](game-run-logging.md) P0~P3 완료 (로컬 JSONL·IndexedDB·분석 CLI),
> [website-shell-tower-wiki.md](website-shell-tower-wiki.md) M0~M7 완료 (SvelteKit 정적 사이트, `/ranking` 로컬 전용 뼈대)
> 범위: 플레이한 판의 런 로그를 Cloudflare Worker+D1에 저장하고, 그 저장분을 원본으로
> 공개 랭킹을 만든다. **게임 규칙·밸런스 수치·로그 스키마는 바꾸지 않는다.**

---

## 1. 배경

로컬 로깅은 이미 돌아간다. `IndexedDbRunStore`가 이벤트를 순서대로 쌓고, 게임오버 시
JSONL·summary를 내려받을 수 있으며, 공통 JSON Schema(`schemas/game-run-log/v1.schema.json`)와
분석 CLI가 있다. 빠진 것은 **서버 저장소**와 **여러 사람의 기록을 한자리에서 비교하는 화면**이다.

현재 `/ranking`은 `hallOfFame.load()`(localStorage)를 읽어 "내 브라우저 기록"임을 명시하는
뼈대다. 이 계획이 끝나면 같은 화면이 서버 랭킹을 보여주고, 로컬 기록은 "내 기록" 축으로 남는다.

선행 계획([game-run-logging.md](game-run-logging.md)) §8의 P4-A·P4-B 설계를 **대체하지 않고
이어받는다.** 그 문서의 D1 모델·API 골격을 쓰되, 이 계획은 거기에 없던 **랭킹 공개**와
**모든 판 수집**을 추가한다.

## 2. 범위 결정 (2026-07-22, 사용자 결정)

| 항목 | 결정 | 귀결 |
|---|---|---|
| 리플레이 재현 검증 | **하지 않는다** | 점수의 진위를 증명할 수 없다 → 화면에 한계를 표기한다(§5.3) |
| 저장 범위 | **모든 판** (중단 포함) | 밸런스·이탈 분석 근거를 얻는다. 대신 pagehide 유실 회피가 핵심 과제가 된다(§4.1) |
| 부정 기록 대응 | **기본 검사만** | 점수 재계산을 하지 않으므로 **엔진·스키마를 건드릴 필요가 없다**(§3.2) |
| 신원 | 익명 표시명 + 브라우저 토큰 | 계정은 도입하지 않되 DB에 `user_id` 열을 비워 예약한다 |

### 2.1 목표

- 플레이한 판의 이벤트 로그와 summary를 서버 DB에 남긴다 — 여러 기기·여러 사람의 기록이 한곳에 모인다.
- `/ranking`이 서버 기록 기준의 공개 랭킹을 보여준다.
- 랭킹 항목에서 그 판의 **선택 기록**(증강·골드 사용처·타워 배치)을 열어볼 수 있다.
- 네트워크가 끊겨도 게임과 로컬 기록은 영향받지 않는다 — 업로드는 실패해도 되는 계층이다.
- 명백한 형식 위반·중복·스팸을 서버에서 거른다.

### 2.2 비목표

- 결정론적 리플레이 재현 검증, 점수 서버 재계산.
- 사용자 계정·로그인. 익명 표시명 + 클라이언트 토큰까지만.
- 실시간 랭킹 갱신(웹소켓), 시즌·리그·보상 체계, 리플레이 뷰어.
- Unity 클라이언트 연동 (동면 중 — 스키마 호환만 깨지 않는다).

## 3. 이미 있는 것 / 새로 만들 것

### 3.1 원하는 "선택 정보"는 v1 스키마에 이미 다 있다

| 알고 싶은 것 | 담고 있는 이벤트 |
|---|---|
| 증강 선택 | `augment_offered`(제시된 3장) + `augment_chosen`(고른 index) · 리롤은 `augment_rerolled` |
| 골드 소비 | `tower_spawned.cost` · `hero_xp_bought.cost` · `probe_bought.cost` · `race_upgraded.cost` · `god_rerolled.cost` · `skill_rerolled.cost` · `augment_upgraded.cost` |
| 어떤 타워가 어느 지점에 | `tower_spawned{slotIndex, tower}` · `tower_merged{slotIndex, produced}` · `tower_sold{slotIndex}` |
| 보스 도전 | `boss_summoned{level}` · `boss_killed{level, reward}` |
| 최종 결과 | `RunSummary`(score·round·kills·towers·augments…) |

### 3.2 그래서 엔진과 스키마는 손대지 않는다

"기본 검사만" 결정으로 서버 점수 재계산이 빠졌다. 재계산을 하려면 누락 이벤트
(`enemy_leaked` — 현재 `game.ts:1588`의 감점이 로깅되지 않는다)를 추가하고
`GAME_LOG_VERSION`을 올려야 했지만, **이번 범위에서는 불필요하다.**

- `GAME_LOG_VERSION`은 **1 그대로**, JSON Schema 무수정.
- `engine/src/game/`·`engine/src/data/` **무수정** — 게임 로직에 손대지 않는다.
- 유일한 엔진 변경은 `engine/src/logging/indexed-db-run-store.ts`의 **업로드 상태 추적**뿐이다.

### 3.3 새로 만들 것

- `services/game-log-worker/` — Cloudflare Worker(TypeScript) + D1 + Wrangler 설정
- D1 스키마와 migration
- 클라이언트 업로드·동기화 계층
- `/ranking` 서버 연동과 랭킹 상세(선택 기록) 화면

## 4. 아키텍처

```text
브라우저 (phaser/)
  Game ──> IndexedDbRunStore (로컬 원본, 기존 + 업로드 상태)
              │
              ├─ 완주: 게임오버 화면에서 즉시 ─┐
              │                              ├─> POST /api/v1/runs
              └─ 중단: 다음 방문 때 동기화 ────┘        │
                                          Cloudflare Worker (형식 검사)
                                                       │
                                                      D1
                                                       │
                                GET /api/v1/ranking ───┴─── GET /api/v1/runs/:id
                                          │                        │
                                     /ranking 화면            랭킹 상세(선택 기록)
```

### 4.1 "모든 판 저장"의 관문 — pagehide 유실 회피

기존 측정으로 확인된 한계가 이 계획의 핵심 리스크다:
**pagehide 시점의 IndexedDB 쓰기는 비동기 큐라 문서 파기로 유실된다**
([website-shell-tower-wiki.md](website-shell-tower-wiki.md) M2 기록 — 11회 이탈 전부 미저장).
따라서 **이탈하는 순간에 업로드하려는 시도는 신뢰할 수 없다.**

해법은 이탈 시점에 보내지 않는 것이다:

- **완주 판**(`game_over`·`cleared`) — 문서가 살아 있으므로 게임오버 화면에서 즉시 업로드.
- **중단 판**(`quit`·`restart`·`abandoned`) — 이벤트는 플레이 중 이미 IndexedDB에 쌓여 있다.
  **다음 방문 때** 미업로드 런을 스캔해 업로드하고, `run_finished`가 없으면 `complete=false`로 적재한다.

이 구조는 pagehide 경합을 우회하고 오프라인 플레이도 자연히 커버한다.
다만 "이벤트는 남고 summary만 유실"이라는 전제 자체를 M0에서 **먼저 실측**한다 — 전제가 틀리면
`navigator.sendBeacon` 병용을 검토한다.

### 4.2 D1 모델

선행 계획 §8.2의 2테이블을 그대로 쓰고 랭킹·신원용 열만 더한다.

- `runs` — `run_id` PK, schema version, build(sha/target/dirty), seed, 시작·종료 시각,
  `finish_reason`, `complete`, `score`, `round`, `kills`, `elapsed_seconds`, `cleared`,
  `display_name`, `client_token_hash`, **`user_id`(NULL — 계정 도입 대비 예약)**, `summary_json`
- `run_events` — `(run_id, seq)` 복합 PK, `type`, `elapsed_seconds`, `round`, `score`, `payload_json`
- index: `runs(score DESC)`(랭킹), `runs(started_at)`, `runs(build_sha, target)`,
  `runs(client_token_hash, started_at)`(스팸 탐지), `run_events(run_id, type)`
- 같은 `(run_id, seq)` 재업로드는 내용이 같으면 idempotent 성공, 다르면 conflict 거부.

## 5. 부정 기록 대응 — 기본 검사와 정직한 표기

### 5.1 서버가 거부하는 것

- JSON Schema 위반, `runId` 혼재, `seq` 역행·중복
- `run_started` 부재
- 요청 크기·이벤트 수 상한 초과 (수치는 M0 실측으로 확정)
- 미래 시각, 음수 `elapsedSeconds`, 시각 역행
- 같은 `client_token`의 rate limit 초과

### 5.2 랭킹에서 제외하는 것 (저장은 하되 노출 안 함)

- `build.dirty === true` (개발 빌드) 또는 알 수 없는 `gitSha`
- `complete = false` (중단 판 — 분석용으로 저장하되 랭킹 대상 아님)

### 5.3 표기 원칙

기존 "가짜 데이터 금지" 원칙을 유지한다. 랭킹 화면에 다음을 명시한다:

- 이 랭킹은 클라이언트가 보낸 기록을 **형식 검사만 거쳐** 표시한 것이며, 점수 재현 검증은 하지 않는다.
- 표시명은 자기 신고값이며 계정 인증이 없다.

점수 위조는 이 수준의 검사로 막지 못한다(§9 위험). 실제 문제가 발생하면
**점수 재계산 → 리플레이** 순으로 승격한다(§10).

## 6. 신원 — 계정 없이 시작한다

- 최초 완주 시 표시명을 입력받는다(선택, 미입력이면 익명 표기).
- 브라우저에 무작위 `client_token`(UUID)을 localStorage에 저장하고 서버에는 **해시만** 남긴다.
  용도는 rate limit과 "내 기록 표시"이며 인증 수단이 아니다.
- 표시명은 길이·문자 제한과 금칙어 필터를 서버에서 적용한다.
- 개인 식별 정보를 수집하지 않는다. IP는 rate limit 목적의 단기 보관만 한다.
- `runs.user_id`를 NULL로 예약해 **나중에 계정을 붙일 때 마이그레이션이 쉽게** 한다.

## 7. API

| method/path | 역할 | 인증 |
|---|---|---|
| `POST /api/v1/runs` | 런 1건(이벤트+summary) 업로드·검사·적재 | client_token + rate limit |
| `GET /api/v1/ranking` | 상위 N개 랭킹 (기간·빌드 필터) | 공개 |
| `GET /api/v1/runs/:runId` | 그 판의 summary와 선택 기록 타임라인 | 공개 |
| `GET /api/v1/runs/mine` | 내 client_token의 기록 | client_token |
| `DELETE /api/admin/runs/:runId` | 관리자 삭제 | Cloudflare Access |

## 8. 구현 단계

### M0. 실측과 계약 확정 · 규모 S

- 완주 런 1건의 JSONL 실제 크기·이벤트 수를 측정한다 (업로드 payload 상한 근거).
- **중단 런이 IndexedDB에 어디까지 남는지 실측한다** — §4.1 전제 검증. 이 계획의 핵심 리스크.
- 랭킹 대상 조건과 표시 항목을 확정한다.
- **게이트:** payload 상한·rate limit 수치가 실측에 근거해 정해졌고, 중단 런 잔존 범위가 확인됐다.

### M1. Worker + D1 적재 · 규모 L

- `services/game-log-worker/` 신설, D1 migration, `POST /api/v1/runs`(§5.1 검사 포함).
- 로컬 D1과 remote D1에 같은 명령으로 migration 적용.
- **게이트:** fixture 업로드가 D1에 정확히 적재되고, 위반 payload가 DB 쓰기 전에 거부된다.
  같은 런 재업로드가 중복 행을 만들지 않는다.
- **기록 (2026-07-22, 코드 완료 · remote 미적용):** `services/game-log-worker/`
  (Worker + `migrations/0001_init.sql` + `src/{index,validate,db}.ts`). tsc 0에러, 검사
  테스트 21개 통과. **로컬 D1 실측 검증:**
  ① fixture 업로드 → `201`, `runs=1`·`run_events=3` 정확 적재(값 대조 완료)
  ② 같은 내용 재업로드 → `200 duplicate`, 행 수 불변 (idempotent)
  ③ 같은 runId·조작 내용 → `409 run_conflict` (조용한 덮어쓰기 없음)
  ④ seq 역행 → `400`, **DB 쓰기 없음**
  ⑤ 중단 런(run_finished 없음) → `201`, `complete=0`·summary NULL로 저장 (§4.1 "모든 판")
  ⑥ 랭킹 필터(`complete=1 AND build_dirty=0`)가 중단 런을 제외, 저장은 2건 모두 유지.
  재업로드 동일성은 이벤트 열 지문(seq·type·score·round)으로 판정하므로 **표시명만 바꾼
  재전송은 conflict가 아니다.** client_token은 원문을 저장하지 않고 SHA-256 해시만 남긴다.
  **미완료:** remote D1 생성·`database_id` 기입·remote 마이그레이션은 계정 소유자 작업으로 남음.

### M2. 클라이언트 업로드·동기화 · 규모 M

- `IndexedDbRunStore`에 업로드 상태(uploaded/pending/failed) 추적 추가.
- 완주 시 즉시 업로드, 중단·실패분은 **다음 방문 시 동기화**(§4.1).
- `client_token` 발급·보관, 게임오버 오버레이에 표시명 입력.
- **게이트:** 오프라인 완주 후 재접속하면 업로드된다. 중단한 판이 다음 방문에 올라간다.
  네트워크 실패가 게임오버 화면과 게임 흐름을 막지 않는다.

### M3. 랭킹 화면 · 규모 M

- `/ranking`을 서버 랭킹으로 전환하고 "내 기록"(localStorage)은 별도 축으로 유지.
- 랭킹 행에서 그 판의 선택 기록(증강·골드 사용처·타워 배치)을 여는 상세 화면.
- 서버 응답이 없거나 비어 있을 때 **가짜 데이터 없이** 빈 상태를 보여준다.
- **게이트:** 랭킹 수치가 D1 값과 일치하고, 빈·정상·오류 상태가 모두 읽히며,
  모바일 360px에서 가로 스크롤이 없다.

### M4. 공개 준비 · 규모 S

- rate limit·크기 상한·금칙어 필터 실동작 확인, 관리자 삭제 경로 점검.
- 보관 기간·삭제 정책 문서화.
- 명세(`game-system-spec.md`) §11에 채택 구조와 검증 결과를 기록한다.
- **게이트:** 아래 완료 기준을 모두 만족한다.

## 9. 예상 변경 영역

| 영역 | 예상 파일/폴더 |
|---|---|
| 서버 (신규) | `services/game-log-worker/`, D1 migration |
| 업로드 클라이언트 | `engine/src/logging/indexed-db-run-store.ts`(상태 추적), `phaser/src/lib/game/`(업로드·토큰) |
| 랭킹 UI | `phaser/src/routes/(site)/ranking/`, `phaser/src/lib/ranking/`(신규) |
| 표시명 입력 | `phaser/src/lib/game/GameOverOverlay.svelte` |
| 테스트 | `engine/tests/`, `phaser/tests/`, Worker 테스트 |

**게임 로직(`engine/src/game/`, `engine/src/data/`)과 로그 스키마는 수정하지 않는다.**

## 10. 완료 기준

- 완주·중단 판이 모두 서버에 저장되고, 같은 판을 두 번 보내도 중복되지 않는다.
- `/ranking`이 서버 기준 상위 기록을 보여주고, 각 기록의 선택 정보를 열 수 있다.
- 개발 빌드(`dirty`)·미완료 런이 공개 랭킹에 섞이지 않는다.
- 네트워크 실패·오프라인이 게임 플레이와 로컬 기록을 방해하지 않는다.
- 랭킹 화면이 검증 수준의 한계를 정직하게 표기한다.
- `engine` tsc·테스트와 `phaser` svelte-check·테스트·정적 빌드가 통과한다.

## 11. 위험과 대응

| 위험 | 대응 |
|---|---|
| **점수 위조** (근본적 한계) | 기본 검사로는 막지 못한다. 한계를 표기한다(§5.3). 실제 문제 발생 시 점수 재계산 → 리플레이 순으로 승격 |
| **중단 런 동기화 실패** | M0에서 IndexedDB 잔존 범위를 먼저 실측하고 진행. 전제가 틀리면 `sendBeacon` 병용 검토 |
| D1 용량·비용 (모든 판 저장) | M0 실측 기반. 부담되면 summary만 D1 + 원본 JSONL은 R2. **측정 전에 둘 다 도입하지 않는다** |
| 스팸·봇 업로드 | client_token rate limit + 크기 상한 + 관리자 삭제. 심해지면 Turnstile 검토 |
| 표시명 악용 | 서버측 길이·문자 제한과 금칙어 필터, 관리자 삭제 경로 |

## 12. 후속 후보

이번 범위 밖. 필요가 확인되면 별도 계획으로 승격한다.

- **점수 재계산 검사** — `enemy_leaked` 이벤트 추가 + 스키마 v2가 선행 조건.
  점수 산식(`engine/src/data/score.ts`)이 전부 순수 함수라 Worker가 같은 코드로 대조할 수 있다.
- **결정론적 리플레이 검증** — 추가로 `moveHero`(명세상 "유일한 직접 조작") 로깅과
  고정 스텝 시뮬레이션 모드가 필요하다. 현재 `BattleScene`이 `game.update()`에 **가변 프레임 델타**
  (`Math.min(deltaMs/1000, 0.05) × speed`)를 넘겨 입력만으로는 tick 열을 재현할 수 없다.
- 계정 로그인·기기 간 기록 이전 (DB `user_id` 열 예약됨)
- 시즌·리그·주간 랭킹, 시드 고정 챌린지 모드, 리플레이 뷰어
- 랭킹 기록을 밸런스 근거로 쓰는 집계 대시보드 (실제 플레이 분포 vs 시뮬 예측)
