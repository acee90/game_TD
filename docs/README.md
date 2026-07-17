# docs — 문서 지도

> 상태: **현행** (새 문서는 여기에 등록한다) · 최종 갱신: 2026-07-17
> 규칙: [documentation-rules.md](documentation-rules.md) · 상태가 **현행**인 문서만 기준으로 삼는다.

```
docs/
├── design/      비전·세계관 / 시스템 명세 / 백로그 ← 기준 문서 (고정 파일명, 최신 유지)
├── reports/     측정 리포트                        ← 불변 스냅샷 (실행 단위마다 새 버전)
├── reference/   원본(갓타디) · 외부 게임 분석 자료   ← [원본확정]의 출처
├── archive/     대체된 옛 방향 문서                 ← 기준으로 쓰지 않는다
├── balance/     밸런스 CSV                         ← 코드에서 자동 생성 (수정 금지)
├── exec-plans/  실행 계획                          ← 세션을 넘겨 이어하는 작업의 인수인계 문서
└── documentation-rules.md
```

## design/ — 기준 문서

| 문서 | 상태 | 역할 |
|---|---|---|
| [vision.md](design/vision.md) | 현행 | 한 줄 피치 · 판타지 · 타깃 · 하지 않을 것 · **코어 필러 4종** |
| [worldbuilding.md](design/worldbuilding.md) | 현행 | 창작 중세 판타지 · 방랑기사 · 아트/용어 기준 |
| [game-system-spec.md](design/game-system-spec.md) | 현행 | 코어 루프 + 시스템 명세 + 목표 지표 + 설계 결정 기록 |
| [backlog.md](design/backlog.md) | 현행 | 미확정 아이디어 대기실 (기각 사유 포함) |

## reports/ — 측정·플레이테스트 리포트 (정량·정성 근거)

| 문서 | 상태 | 내용 |
|---|---|---|
| [dopamine-design-review-v0.1.md](reports/dopamine-design-review-v0.1.md) | 현행 | 보상 리듬 측정, 증강 스케줄 80/20 |
| [ga-policy-validation-v0.1.md](reports/ga-policy-validation-v0.1.md) | 현행 | GA 운영정책 검증 v0.1/v0.2 |
| [hero-tower-power-balance-v0.1.md](reports/hero-tower-power-balance-v0.1.md) | 현행 | 영웅/타워 딜 지분·구간별 커브 실측 |
| [unity-hud-playtest-v0.1.md](reports/unity-hud-playtest-v0.1.md) | 현행 | Unity HUD 입력 안전·상태 가독성·영웅 이동 정성 관찰 6건 |

## reference/ — 원본·외부 게임 분석

| 문서 | 상태 | 내용 |
|---|---|---|
| [god-td-x-vz056-map-analysis-v1.0.md](reference/god-td-x-vz056-map-analysis-v1.0.md) | 현행 (참조) | 원본 맵파일 리버스엔지니어링 — [원본확정] 수치의 1차 출처 |
| [lol-arena-tft-augments-v1.0.md](reference/lol-arena-tft-augments-v1.0.md) | 현행 (참조) | LoL 아레나 226종 · TFT 세트17 275종 증강 전수 목록 (게임 클라이언트 데이터, 패치 16.13) |
| [augment-taxonomy-v1.0.md](reference/augment-taxonomy-v1.0.md) | 현행 (참조) | 위 501종의 기능별 분류 (스탯/특수능력/경제/시너지…) — 우리가 붙인 해석 |
| [kris-cooper-bran-the-breaker-kris-cooper.jpg](reference/kris-cooper-bran-the-breaker-kris-cooper.jpg) | 현행 (화풍 참조) | 외부 화풍 레퍼런스 — 선·면·팔레트만 참고, 출하 리소스 아님 |
| [wandering-knight-concept-v1.png](reference/wandering-knight-concept-v1.png) | 현행 (아트 기준) | Meshy용 방랑기사 정면 콘셉트 v1 |
| [wandering-archer-concept-v1.png](reference/wandering-archer-concept-v1.png) | 현행 (아트 기준) | Meshy용 방랑궁수 정면 콘셉트 v1 |
| [wandering-archer-chibi-tpose-concept-v1.png](reference/wandering-archer-chibi-tpose-concept-v1.png) | 현행 (모델링 기준) | Meshy용 치비 로우폴리 방랑궁수 T포즈 v1 |
| [god-td-system-notes-v0.1.md](reference/god-td-system-notes-v0.1.md) | 보관 | 초기 시스템 정리 (맵분석으로 대체) |
| [god-td-ops-layer-analysis-v0.1.md](reference/god-td-ops-layer-analysis-v0.1.md) | 보관 | 운영 레이어 초기 분석 |

## archive/ — 대체된 옛 방향

| 문서 | 상태 | 내용 |
|---|---|---|
| [merge-td-design-draft-v0.3.md](archive/merge-td-design-draft-v0.3.md) | 대체됨 → [vision.md](design/vision.md) | 옛 방향 (모바일 · 고정 40라운드) |
| [sequence-table-v0.1.md](archive/sequence-table-v0.1.md) | 대체됨 | 40라운드 레벨 디자인 (v0.3의 부속) |
| [tower-skill-sheet-v0.1.md](archive/tower-skill-sheet-v0.1.md) | 대체됨 | 8아키타입 스킬 시트 (v0.3의 부속) |

## exec-plans/ — 실행 계획

| 문서 | 상태 | 내용 |
|---|---|---|
| [unity-sync-plan.md](exec-plans/unity-sync-plan.md) | 진행 중 | Unity 동기화 이어하기 (미커밋 부분 반영 상태 포함) |
| [unity-hud-redesign.md](exec-plans/unity-hud-redesign.md) | 초안 | H1~H4 구현 이력 + H5 프로덕션 HUD 업그레이드 계획 |
| [unity-vfx-quality-plan.md](exec-plans/unity-vfx-quality-plan.md) | 초안 | 로우폴리·카툰 전투 VFX 스타일 통일, 버티컬 슬라이스·애셋 평가·검증 계획 |
| [hero-point-movement.md](exec-plans/hero-point-movement.md) | 초안 | 클릭 지점 영웅 이동 모델 + 목적지·경로 표시 |
| [economy-power-rebalance.md](exec-plans/economy-power-rebalance.md) | 구현됨 | 영웅 비용 스케일링 + 가스 업그레이드 개편 — 시뮬 검증 완료, 사람 플레이테스트 대기 |

## balance/ — 자동 생성 시트

`cd web && npm run gen:balance`로 생성. 손으로 고치지 않는다.
구글 시트 사본: [갓타디 밸런스시트](https://drive.google.com/drive/folders/1of5Pi467weNx7QtvwaEYSnbhEj-UGZII) (읽기 전용, 요청 시 갱신)

| 파일 | 내용 |
|---|---|
| augments.csv | 증강 26종 |
| synergies.csv | 특화/대특화 시너지 |
| rarities.csv | 등급 확률·배수 |
| skills.csv | 액티브 스킬 4종 |
| hero-constants.csv | 영웅 상수 (스탯·레벨·XP) |
| hero-power-curve.csv | 빌드×등급×레벨 파워 곡선 |
| augment-schedule.csv | 증강 획득 레벨 |
