# AGENTS.md

이 저장소에서 작업하는 에이전트(와 사람)를 위한 규칙.

## 문서화

**[docs/documentation-rules.md](docs/documentation-rules.md)를 따른다.** 요약:

- 게임 디자인 문서는 계획서가 아니라 **결정 기록**이다. 프로토타입 → 측정 → 결정 → 기록 순서.
- 계층: 비전·필러([docs/design/vision.md](docs/design/vision.md)) / 명세([docs/design/game-system-spec.md](docs/design/game-system-spec.md)) / 근거 자료(정량 리포트+플레이테스트) / 시트([docs/balance/](docs/balance/)). 아이디어는 [docs/design/backlog.md](docs/design/backlog.md).
- 모든 문서에 상태 헤더(현행/초안/대체됨/보관) — **"현행"만 기준으로 삼는다.** 파일명은 영문 kebab-case.
- **수치의 원본은 코드다** (`web/src/data/*.ts`). 시트는 `cd web && npm run gen:balance`로
  생성하고 손으로 고치지 않는다. `tests/balance-csv.test.ts`가 일치를 강제한다.
- 원작 관련 수치는 **[원본확정]**(맵파일 근거 명시) / **[프로토]**(우리가 정한 값)를 구분한다.
  추측을 확정처럼 쓰지 않는다 — 확인 불가면 "미확인".
- 명세에는 구현·결정된 것만. 미확정 아이디어는 백로그로 분리.
- 시스템을 바꾸면 명세의 "설계 결정 기록"에 **무엇을 → 왜 → 상태 → 검증**을 추가한다.
- **근거 없는 수치 조정 금지.** 정량(시드 시뮬레이션)과 정성(플레이테스트 관찰) 모두 근거로 인정한다.

## 코드

- 현행 게임은 `web/` (Vite + TypeScript). `unity/`는 동일 로직의 C# 미러 —
  `web/src`가 바뀌면 Unity Core/도 동기화가 필요하다.
- 게임 로직(`web/src/game/`)은 DOM 없이 동작하며 시드 주입이 가능하다.
  밸런스 검증은 실제 `Game` 클래스로 시뮬레이션한다 (`npm run sim:ga`, 축소판 `-- --quick`).
- 검증: `cd web && npx tsc --noEmit && npx vitest run`. 일회성 측정 스크립트
  (`tests/scratch-*.test.ts`)는 커밋하지 않는다.
- 시뮬레이션에서 증강 대기는 `game.paused`로 확인한다 —
  놓치면 첫 증강에서 영구 일시정지되어 그 라운드가 사망처럼 보인다.
