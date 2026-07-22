# 실행 계획 — 홈페이지 셸과 타워 Wiki 프리뷰

> 상태: **초안** · 최종 갱신: 2026-07-22
> 범위: 공개 홈페이지 뼈대, 게임 진입, 대시보드·랭킹 자리, Wiki 타워 목록·상세,
> Phaser 투사체/착탄 프리뷰

## 1. 배경

선행 재편 완료(2026-07-22): `web/`이 `engine/`으로 rename되고 웹 프로토타입 앱은
은퇴·삭제됐다. `engine/`은 규칙·데이터·HUD 컴포넌트·테스트·시뮬 도구의 헤드리스 원본이며,
`phaser/`가 유일한 플레이 가능 앱이다 (명세 §11 설계 결정 기록 참조).

현재 프로덕션 앱 `phaser/`는 `App.svelte` 하나가 게임 인스턴스와 HUD를 즉시 생성하는 단일
화면이다. 별도 라우터가 없고 개발자용 랩 진입점 `vfx-lab.html`·`projectile-vfx-lab.html`이
추가 Vite HTML 진입점으로 존재한다.

목표 구조에서는 홈페이지가 최상위 제품이고 Phaser 게임은 그 안의 `/game` 기능이 된다.
첫 번째 완성 콘텐츠는 `Wiki > 타워 정보`로 잡는다. 타워 상세 페이지는 실제 코드의 수치를
표시하고, 작은 Phaser 프리뷰에서 해당 타워의 투사체 비행과 착탄 효과를 반복 재생한다.

## 2. 목표와 비목표

### 목표

- 랜딩, 게임, 대시보드, 랭킹, Wiki로 이동할 수 있는 반응형 사이트 셸을 만든다.
- 기존 Phaser 게임을 기능 손실 없이 `/game`에 포함한다.
- Wiki 타워 정보가 `engine/src`의 현행 데이터와 전투 계산을 그대로 사용한다.
- 타워 상세에서 실제 게임과 동일한 투사체·트레일·곡사·착탄 VFX를 확인한다.
- 상세 URL을 직접 열거나 새로고침해도 정상 진입한다.

### 비목표

- 이번 단계에서 계정, 서버 DB, 온라인 랭킹, 관리자 CMS를 구현하지 않는다.
- Wiki 문구를 별도 데이터베이스에 복제하거나 게임 밸런스를 Wiki에서 수정하지 않는다.
- 몬스터·보스·영웅 도감은 만들지 않는다. 타워 상세 구조를 검증한 뒤 같은 패턴으로 확장한다.
- `vfx-lab`의 개발자용 비교·계측 기능을 Wiki에 모두 노출하지 않는다.

## 3. 제안 아키텍처

### 3.1 사이트 셸

`phaser/`를 Svelte 5 + Vite 단일 화면에서 **SvelteKit + `adapter-static` 정적 사이트**로
확장한다. 새 `site/` 패키지를 만들지 않고 현행 프로덕션 렌더러의 위치와 `@engine` alias를
유지한다.

이 구성을 택하는 이유:

- 랜딩과 Wiki를 빌드 시 HTML로 생성할 수 있어 직접 URL, 공유, 검색 노출에 유리하다.
- 페이지별 번들 분리가 가능해 홈페이지 방문자가 Phaser 전체 번들을 먼저 받지 않는다.
- 알려진 타워 ID를 빌드 시 열거해 정적 상세 페이지를 만들 수 있다.
- 게임 규칙은 계속 `engine/src`를 import하므로 로직 이중화가 생기지 않는다.

`/game`과 타워 상세(프리뷰 포함), 랩 라우트는 **CSR 전용**(`ssr = false`)으로 못 박는다 —
Phaser는 물론 HUD Svelte 컴포넌트(`engine/src/lib`)도 SSR 안전성이 보장되지 않기 때문이다.
Phaser를 import하는 모듈은 클라이언트 컴포넌트가 `onMount` 안에서 동적 import하고,
언마운트 시 반드시 `phaser.destroy(true)`를 호출한다.

SvelteKit은 `build.rollupOptions.input`을 자체 소유하므로 지금의 다중 HTML 진입점
(`vfx-lab.html`, `projectile-vfx-lab.html`)은 유지할 수 없다. 두 랩은 내비게이션에
노출하지 않는 `/dev/vfx-lab`, `/dev/projectile-vfx-lab` 라우트(CSR 전용)로 이전한다.

현행 `phaser/vite.config.ts`의 커스텀 설정은 SvelteKit vite 설정으로 이관해야 한다:
`__GAME_BUILD_INFO__` define(git SHA 포함 런 로깅 — 빠뜨리면 로깅이 조용히 깨진다),
`@engine` alias, `server.fs.allow`. `target: 'phaser'`는 재편 때 수정 완료.

### 3.2 정보 구조와 라우트

| 경로 | MVP 내용 | 데이터 |
|---|---|---|
| `/` | 게임 소개, 핵심 특징, 최근 업데이트 자리, 게임 시작 CTA | 정적 콘텐츠 |
| `/game` | 현행 Phaser 게임 + HUD | `Game`, `BattleScene`, 현행 HUD |
| `/dashboard` | 내 최고 기록·최근 플레이 요약 자리 | 현행 localStorage/IndexedDB |
| `/ranking` | 우선 내 브라우저의 명예의 전당 | `hall-of-fame.ts` |
| `/wiki` | Wiki 카테고리와 타워 바로가기 | 카탈로그 파생 데이터 |
| `/wiki/towers` | 병과·티어 필터가 있는 타워 카드 목록 | `units.ts` |
| `/wiki/towers/[id]` | 타워 정보표 + Phaser 전투 프리뷰 | `units.ts`, `combat.ts` |

온라인 랭킹이 붙기 전 `/ranking`에는 **내 브라우저 기록**이라고 명확히 표시한다. 서버 랭킹인
것처럼 보이는 샘플 사용자명이나 가짜 점수는 넣지 않는다. hall-of-fame(localStorage)과 런
로그(IndexedDB)는 origin별 저장이므로 다른 기기·브라우저의 기록은 보이지 않는다 — 이것이
"내 브라우저 기록" 표기의 근거다.

### 3.3 컴포넌트 경계

| 영역 | 책임 |
|---|---|
| `SiteShell` | 전역 헤더·내비게이션·모바일 메뉴·푸터 |
| `GameClient` | 현행 `App.svelte`의 게임 생성·HUD·종료 정리 |
| `TowerCatalog` | 병과/티어 필터와 상세 링크 |
| `TowerInfoPanel` | 코드에서 계산한 수치와 태그 설명 표시 |
| `TowerPreview` | Phaser 미니 캔버스 생성·일시정지·정리 |
| `TowerPreviewScene` | 타워→허수아비 발사 루프와 카메라 구성 |
| `ProjectileFxController` | BattleScene과 PreviewScene이 공유하는 비행·트레일·착탄 렌더링 |

`TowerPreviewScene`에 BattleScene의 투사체 코드를 복사하지 않는다. `BattleScene`의 시각 전용
투사체 로직을 `ProjectileFxController`로 추출하고 두 씬이 같은 API를 호출한다. 이 모듈은
피해 계산이나 타깃 선택을 하지 않고, 시작점·도착점·스타일·색·스플래시 반경 같은 렌더 데이터만
받는다.

## 4. 타워 데이터 계약

### 4.1 안정적인 상세 ID

`UnitDef`에 표시명과 독립적인 영문 `id`를 추가한다. Wiki URL과 Svelte keyed each는 이 ID를
사용한다. 표시명이 바뀌어도 기존 링크가 깨지지 않아야 한다.

- 예: `army-apprentice-archer`, `artillery-mangonel`, `magic-archmage`
- 모든 `TIER_POOLS`, `GOD_POOL_EARLY`, `GOD_POOL_LATE` 항목에서 ID가 유일해야 한다.
- GOD 초기/확장 풀의 spread로 같은 객체가 재등장해도 카탈로그에서는 ID로 한 번만 노출한다.
- 중복 ID와 상세 조회 실패를 단위 테스트로 막는다.

### 4.2 표시 수치

Wiki는 타워를 `{ def, tier, cooldown: 0 }` 형태로 구성하고 병과 업그레이드 `[0,0,0,0]` 기준으로
현행 전투 함수를 호출한다. 화면에 **업그레이드 0 기준**임을 표기한다. `UnitDef`에는 tier
필드가 없으므로 카탈로그가 `TIER_POOLS` 인덱스와 GOD 풀 소속에서 tier를 파생해 함께 든다.

| 표시 항목 | 원본 |
|---|---|
| 이름·병과·티어·태그 | `engine/src/data/units.ts` |
| 공격력 | `combat.damage()` |
| 공격 간격·초당 공격 횟수 | `combat.attackInterval()` 파생 |
| 표시 DPS | `damage / attackInterval` 단순 파생 |
| 사거리 | `combat.range()` |
| 스플래시 범위 | 스플래시 태그일 때 `combat.splashRadius()` |
| 감속 | 소환대일 때 `combat.slowFactor()` |

표시 문자열과 반올림은 Wiki view-model 한 곳에서 처리한다. 원본 상수나 계산식을 Wiki
컴포넌트에 다시 적지 않는다. 표시 DPS는 방어력·스플래시 감쇠·실전 가동률을 제외한 비교값이라고
툴팁에 밝힌다.

### 4.3 프리뷰 입력

프리뷰는 선택한 `UnitDef`와 `tier`로 다음 값을 파생한다.

- 본체 외형: 병과색, 태그, 티어 스케일
- 투사체 스타일: 현행 `RACE_PROJ`와 스피드 태그 우선 규칙
- 발사 주기: `attackInterval()`을 프리뷰 가독성 범위에서만 제한
- 착탄: 실제 스타일별 impact 함수와 실제 `splashRadius()` 비율

프리뷰는 허수아비 HP나 피해 판정을 시뮬레이션하지 않는다. 수치표는 엔진 계산을 사용하고,
캔버스는 동일 VFX의 시각 확인만 담당한다.

## 5. Wiki 타워 상세 UX

데스크톱은 왼쪽에 프리뷰, 오른쪽에 정보 패널을 배치하고 모바일은 프리뷰 위·정보 아래로 쌓는다.

프리뷰 기본 동작:

- 타워 한 기와 허수아비 한 기가 자동으로 반복 전투한다.
- 투사체가 화면 밖으로 잘리지 않는 고정 카메라와 병과별 충분한 비행 거리를 둔다.
- `다시 보기`, `일시정지`, `0.5×/1×`만 사용자에게 제공한다.
- 탭이 백그라운드로 가거나 프리뷰가 뷰포트 밖이면 애니메이션을 멈춘다.
- `prefers-reduced-motion`에서는 자동 재생하지 않고 사용자가 재생하도록 한다.

정보 패널은 이름, 병과, 티어, 태그, 기본 전투 수치, 태그 효과 설명을 표시한다. 이전/다음
타워와 같은 병과 목록으로 이동할 수 있어야 한다.

개발자용 속도 2×, 밝은/어두운 배경 비교, FPS·파티클 카운터는 기존 `vfx-lab`에 남긴다.

## 6. 구현 단계

### M0. 기준선 고정 · 규모 S

- 미커밋 상태의 `phaser/src/fx.ts`·`public/assets/fx/`·`projectile-vfx-lab` 진입점을 먼저
  커밋해 회귀 기준선을 확정한다 (M4 VFX 추출의 비교 기준).
- 현행 `/` 게임 시작, `?bot`, 게임오버, 로그 저장, 두 랩 진입점 동작을 확인한다.
- `phaser` 빌드 산출 크기와 첫 로드 시 Phaser 청크 크기를 기록한다.
- **게이트:** 마이그레이션 전 기준 동작과 수치가 재현 가능하다.
- **기록 (2026-07-22, 완료):** 기준선 커밋 `764491f`. 검증: svelte-check 0 에러 ·
  Vitest 348 통과 · phaser 빌드 통과. 산출: dist 1.8 MB, `phaser` 청크
  1,482.54 kB(gzip 340.17 kB), `game` 청크 170.64 kB(gzip 59.18 kB) —
  첫 로드에 둘 다 포함(코드 분할 없음, M1 비교 기준). 브라우저 확인: `/` 시작 화면,
  `?bot` 자동 플레이 + FX 계측 HUD, 두 랩 진입점, IndexedDB 런 로그의
  `run_started.build`(gitSha·target='phaser') 기록 — 콘솔 에러 0건(favicon 404 제외).
  SparkSet 팩 원본은 라이선스(독립 재배포 금지)로 .gitignore 등록, 통합 사용분만 커밋.

### M1. SvelteKit 정적 셸 전환 · 규모 L

- 배포 대상(호스팅·도메인·서브패스 여부)을 먼저 결정한다 — `paths.base`와 Phaser 에셋
  경로에 영향을 주므로 게이트 판정의 전제다.
- SvelteKit과 `adapter-static`을 설정하고 §3.1의 vite 설정 이관 체크리스트
  (`__GAME_BUILD_INFO__` define, `@engine` alias, `fs.allow`)를 적용한다.
- 공통 레이아웃, 메타데이터, 오류 페이지, 반응형 내비게이션을 만든다.
- 위 라우트를 만들되 `/game` 외 페이지는 우선 실제 구조를 가진 빈 상태로 둔다.
- `vfx-lab`·`projectile-vfx-lab`을 내비게이션 비노출 `/dev/*` 라우트(CSR 전용)로 이전하고
  HTML 진입점을 제거한다.
- 정적 호스팅의 fallback에 의존하지 않고 모든 알려진 경로를 prerender한다.
- **게이트:** 각 URL 직접 접근·새로고침이 성공하고 홈페이지 번들에 Phaser가 포함되지
  않으며, 런 로그의 빌드 정보(git SHA·target)가 전환 전과 동일하게 기록된다.
- **기록 (2026-07-22, 완료):** 배포 대상은 **루트 경로 정적 호스팅을 기본**으로 확정
  (`paths.base = BASE_PATH ?? ''` — 서브패스 배포가 결정되면 env 하나로 전환).
  `trailingSlash: 'always'`로 경로마다 `index.html`을 생성해 어떤 정적 호스트에서도
  직접 URL이 동작한다. 게이트 검증: 8개 경로 전부 200 · 홈에서 Phaser 청크(1.48MB)
  미로드 · `run_started.build` 동일 기록 · `?bot`·두 랩 회귀 없음 · 콘솔 에러 0.
  구조 결정: 루트 레이아웃은 비우고 사이트 크롬은 `(site)` 그룹에만 — `/game`·`/dev/*`는
  자기 전역 CSS(app.css·랩 스타일)를 갖는 별도 세계라 `data-sveltekit-reload` 전체 로드
  경계로 격리했다 (SPA 내비게이션 시 전역 CSS 누적 오염 방지). Phaser 씬의 상대 에셋
  경로는 `load.setBaseURL('/')`로 루트 고정 (트레일링 슬래시 경로에서 깨지지 않게).

### M2. 게임 페이지 격리 · 규모 M

- 현행 `App.svelte`를 `/game`의 `GameClient`로 이동한다.
- 게임 객체, Phaser 인스턴스, 키보드·pagehide 리스너의 생성과 정리를 컴포넌트 생명주기에 묶는다.
- 다른 페이지로 나갔다 돌아왔을 때 중복 캔버스·중복 RAF·중복 로그가 생기지 않게 한다.
- **게이트:** 현행 게임 기능 회귀가 없고 `/game ↔ /wiki`를 10회 왕복해도 Phaser 캔버스가 1개다.
- **기록 (2026-07-22, 완료):** GameClient 이동은 M1에서 처리(git mv). `/game` 진입·이탈이
  전체 로드 경계라 문서가 매번 새로 시작 — 10회 왕복 자동화 검증: /game 캔버스 항상 1,
  사이트 페이지 0, 진입당 런 1개(중복 로그 없음). SPA 언마운트 경로에도 finishRun('quit')
  +flush를 정리 코드에 보강. **기존 한계 관찰(회귀 아님):** pagehide 시점의
  `run_finished`/summary IndexedDB 쓰기는 비동기 큐라 문서 파기로 유실된다(11회 이탈
  전부 미저장, 은퇴한 웹 프로토와 동일 배선). 게임오버 마감은 문서 생존 중이라 정상 커밋
  — M6 대시보드는 완주 런 summary와 명예의 전당(localStorage 동기)만 신뢰할 것.

### M3. 타워 카탈로그와 view-model · 규모 M

- `UnitDef.id`를 추가하고 전체 풀의 ID 유일성 테스트를 만든다.
- GOD 중복을 제거한 카탈로그와 ID 조회 함수를 만든다. 카탈로그는 `TIER_POOLS`
  인덱스·GOD 풀 소속에서 각 타워의 tier를 파생해 함께 담는다.
- 업그레이드 0 기준 정보 view-model과 표시 포맷 테스트를 만든다.
- **게이트:** Wiki 숫자가 같은 입력의 `combat.ts` 결과와 일치하고 하드코딩된 밸런스 수치가 없다.
- **기록 (2026-07-22, 완료):** `UnitDef.id` 39종 부여(`병과접두사-영문명`, 예:
  `artillery-mangonel`) — 접두사=병과 일치도 테스트로 고정. `data/tower-catalog.ts`
  (GOD 중복 제거 39종, tier·godUnlock(early/late) 파생, `towerById`),
  `lib/tower-wiki.ts`(업그레이드 0 기준 view-model — 원시 수치 + 게임 내 패널과 동일한
  반올림의 표시 문자열). 테스트 11개 추가: ID 유일성·형식·접두사, 카탈로그 파생,
  전 타워 combat.ts 전수 일치, 포맷 규칙. 359 테스트 통과 · 타입 검사 0 에러 ·
  balance-csv 영향 없음 · phaser 빌드 통과.

### M4. 공용 투사체 VFX 추출 · 규모 L

- `BattleScene`의 투사체 생성·업데이트·착탄 코드를 시각 전용 컨트롤러로 추출한다.
- [투사체 VFX 에셋 지시서](projectile-vfx-asset-brief.md)의 스타일·틴트·착탄 라우팅 계약을 적용한다.
- BattleScene 회귀와 독립적인 PreviewScene fixture를 만든다.
- **게이트:** 동일 렌더 입력에 게임과 프리뷰가 같은 본체·궤적·착탄 함수를 사용한다.
- **기록 (2026-07-22, 완료):** `phaser/src/projectile-fx.ts`의 `ProjectileFxController`로
  추출 (기존 `fx.ts`와 폴더명 충돌을 피해 단일 모듈). BattleScene의 Proj·RACE_PROJ·TRAIL·
  spawn(구 consumeShots 본문)·update(구 stepProjectiles)·리본·arrow/artillery 임팩트·
  경계 링·explode를 **코드 그대로 이동** — 파라미터는 scene·ParticlePool·depth만 주입.
  입력 타입은 엔진 `Shot`의 시각 필드 부분집합(`ProjectileShot`) — 피해·타깃 계산 없음.
  플립북 로드·등록은 static `preload`/`createAnimations`로 두 씬이 공유. BattleScene은
  seenShots 중복 제거 후 `spawn()` 위임만 남음. 검증: 빌드·tsc 0 에러, `?bot` 런타임에서
  투사체·트레일·착탄·FX 계측 정상. PreviewScene fixture는 M5의 TowerPreviewScene이 겸한다.

### M5. 타워 목록·상세와 Phaser 프리뷰 · 규모 L

- 병과·티어 필터, 타워 카드, 상세 정보 패널을 구현한다.
- 알려진 모든 타워 ID를 상세 페이지 정적 엔트리로 생성한다.
- `TowerPreview`와 `TowerPreviewScene`을 연결하고 가시성·reduced-motion 일시정지를 구현한다.
- **게이트:** 모든 타워 상세가 열리고 네 병과의 투사체와 착탄이 올바르게 구분된다.

### M6. 대시보드·랭킹 뼈대 · 규모 S

- 대시보드는 현행 브라우저 저장소에서 읽을 수 있는 최고 기록과 최근 플레이 상태만 표시한다.
- 랭킹은 현행 명예의 전당을 읽기 전용으로 표시하고 로컬 기록임을 명시한다.
- 데이터가 없을 때 실제 빈 상태와 게임 시작 CTA를 제공한다.
- **게이트:** 가짜 데이터 없이 빈 상태와 로컬 기록 상태가 모두 읽힌다.

### M7. 통합 검증과 공개 준비 · 규모 M

- 데스크톱·모바일에서 내비게이션, 게임 FIT, 타워 상세 레이아웃을 확인한다.
- 키보드 탐색, 포커스 표시, 색 대비, reduced-motion, 캔버스 대체 설명을 확인한다.
- 초기 페이지와 Wiki에서 Phaser가 지연 로드되는지 네트워크 패널로 확인한다.
- 검증 결과와 채택된 구조만 `game-system-spec.md`의 설계 결정 기록에 추가한다.
- **게이트:** 아래 완료 기준을 모두 만족한다.

## 7. 예상 변경 영역

| 영역 | 예상 파일/폴더 |
|---|---|
| 사이트 설정 | `phaser/package.json`, `phaser/svelte.config.js`, `phaser/vite.config.ts` |
| 페이지 | `phaser/src/routes/` |
| 사이트 UI | `phaser/src/lib/site/` |
| 게임 래퍼 | `phaser/src/lib/game/GameClient.svelte` |
| Wiki UI | `phaser/src/lib/wiki/` |
| Phaser 프리뷰 | `phaser/src/scenes/TowerPreviewScene.ts` |
| 공용 VFX | `phaser/src/fx/projectile/` 또는 동등한 단일 모듈 |
| 데이터 원본 | `engine/src/data/units.ts`, `engine/src/game/combat.ts` |
| 테스트 | `engine/tests/`, `phaser` 컴포넌트·브라우저 테스트 |

진행 중인 투사체 VFX 작업(`fx.ts`, `projectile-vfx-lab`, `public/assets/fx/`)은 M0에서
커밋한 기준선을 기준으로 삼고, 공용 VFX 추출(M4) 전에 해당 변경과의 경계를 다시 확인한다.

## 8. 완료 기준

- `/`, `/game`, `/dashboard`, `/ranking`, `/wiki`, `/wiki/towers`, 모든 타워 상세 URL이 직접 열린다.
- 홈페이지와 텍스트 Wiki 최초 로드에 Phaser 청크가 포함되지 않는다.
- `/game`의 전투·HUD·시작 안내·저장·게임오버가 현행과 동일하게 동작한다.
- Wiki의 공격력·공속·사거리·스플래시·감속 수치가 코드 계산과 일치한다.
- 타워 프리뷰와 실게임이 같은 투사체 VFX 구현을 사용한다.
- 페이지 이동 후 WebGL 컨텍스트, 캔버스, 이벤트 리스너가 누적되지 않는다.
- 모바일 360px 폭에서 가로 스크롤 없이 탐색·정보 확인·게임 진입이 가능하다.
- `cd engine && npm run check && npx vitest run`과 `cd phaser && npm run build`가 통과한다.

## 9. 후속 후보

- 서버 계정·온라인 랭킹·부정 기록 방지
- 플레이 기록 상세와 빌드 통계 대시보드
- 영웅·몬스터·보스 Wiki
- Wiki 검색과 태그 비교
- 콘텐츠가 안정된 뒤 다국어 및 공유 카드 이미지

후속 후보는 이번 구현 범위에 포함하지 않는다. 필요가 확인되면 별도 계획 또는 백로그 항목으로
승격한다.
