# 투사체 VFX 에셋 작업 지시서

> 상태: **초안** · 최종 갱신: 2026-07-22
> 이미지 생성 AI 발주부터 Phaser 통합 전 검수까지의 실행 기준이다. 에셋 채택/반려가
> 끝나면 결정과 검증 결과만 `game-system-spec.md`에 기록하고 이 문서는 보관 처리한다.

## 배경과 범위

- 투사체 스타일은 병과(race)가 결정한다 (`phaser/src/BattleScene.ts`의 `RACE_PROJ`):
  정규군=화살(arrow), 포병=곡사 포탄(shell), 마법대=매직 볼트(bolt), 소환대=가시(seed).
- 현재 **화살만 전용 PNG**(`assets/sprites/arrow.png`, 32×10)이고, shell/bolt/seed는
  10×10 절차 생성 텍스처(`sprites.ts`)다. 트레일·글로우·폭발도 코드 생성이다.
- 이 작업은 본체와 착탄 연출의 품질 개선만 다룬다. 공격 판정·피해·사거리 등 게임 규칙은
  바꾸지 않는다.
- 원칙(기존 결정 유지):
  - **이펙트 절제** — 이미 말하는 채널이 있으면 채널을 추가하지 않고 기존 채널의 질을 높인다.
  - **격리 프리뷰 후 통합** — 모든 에셋은 `vfx-lab`에서 먼저 확인한 뒤 BattleScene에 통합한다.
  - 외부/생성 에셋은 고정 의미로만 채택한다(예: 눈꽃=냉기).

---

## 0. 공통 납품 규격

이미지 AI 결과는 완성 에셋이 아니라 **원본 후보**로 취급한다. 큰 캔버스(512~1024px)에
생성한 뒤 본체·도트 FX는 NEAREST, 볼류메트릭 VFX는 LINEAR로 축소하고 최종 해상도에서
실루엣·알파·프레임 중심을 정리한다. 자동 축소만 한 결과는 납품 완료로 보지 않는다.

| 항목 | 규격 |
|---|---|
| 포맷 | PNG, 투명 배경, 지정된 오브젝트만 포함 |
| 방향 | 진행 방향 **오른쪽(→)** 기준. 런타임에서 회전 |
| 프레임 배치 | 가로 스트립, 프레임 사이 여백 0px, 좌→우 재생 순서 |
| 정렬 | 모든 프레임의 중심점 고정. 회전축·폭발 중심은 프레임 정중앙 |
| 본체·도트 FX | 최종 해상도에서 1px 그리드 정리, 알파는 0 또는 255만 허용, NEAREST |
| 소프트 FX | 반투명 알파 허용, LINEAR. 재사용 광원은 흰색+ADD, 전용 화염·연기는 고유색+NORMAL/ADD 조합 |
| 아웃라인 | 순수 검정 대신 팔레트 안의 가장 어두운 색 사용 |
| 본체 팔레트 | 투명 제외 최대 8색. 인접한 중복색과 고립된 1px 노이즈 제거 |
| 파일 위치 | 본체·플립북 → `phaser/public/assets/sprites/`, 파티클 → `phaser/public/assets/fx/` |

### 색상과 틴트 계약

- `arrow.png`는 **예외적으로 무채색 본체**로 제작하고 런타임 `setTint(shot.color)`를 유지한다.
  정규군·영웅·치명타·다른 병과의 스피드 타워가 같은 화살 키를 공유하므로 색이 의미를 전달한다.
- `shell.png`, `bolt.png`, `spine.png`는 병과 고유색으로 제작하고 해당 스타일에만 본체 틴트를
  적용하지 않는다. 스타일별 분기 없이 공용 `setTint`를 제거하면 안 된다.
- 재사용 파티클·트레일·글로우는 흰색으로 제작하고 기존 틴트 파이프라인을 유지한다.
- `explosion.png`는 포병 전용이므로 주황 화염·회색 연기의 고유색을 사용하고 틴트하지 않는다.

병과 고유색 (`engine/src/data/units.ts` `RACE_COLOR`): 정규군 `#6d86ab` 청회,
포병 `#bf7a3a` 주황, 마법대 `#9a6ea6` 보라, 소환대 `#8a9a5b` 올리브.

### 공통 반려 기준

- 최종 크기에서 촉·몸통·핵 등 핵심 실루엣이 서로 붙어 구분되지 않는다.
- 프레임마다 중심이 흔들리거나 오브젝트가 캔버스 경계에 잘린다.
- 본체에 반투명 테두리, 생성 잔여 배경, 바닥 그림자 또는 불필요한 후광이 남는다.
- 프레임 크기·개수·전체 PNG 크기가 아래 표와 다르다.

---

## 1. 병과별 발주 목록

우선순위: **포병 폭발(1-B) > 마법대 본체(1-C) > 소환대(1-D) > 포병 본체 > 정규군 리파인**.
포병 폭발이 화면에서 가장 크고 자주 보여 체감 대비 효율이 가장 높다.

### 1-A. 정규군 — 화살 (리파인만)

| # | 에셋 | 파일명 | 프레임 크기 | 프레임 | 전체 PNG | 비고 |
|---|---|---|---:|---:|---:|---|
| A1 | 화살 본체 리파인 | `arrow.png` | 32×10 | 1 | 32×10 | 선택. 무채색 명암, 런타임 틴트 유지 |

프롬프트 예시 (A1):
> pixel art arrow projectile, side view facing right, neutral grayscale steel arrowhead and fletching, dark gray outline, clean long silhouette, transparent background, 16-bit game asset, no glow, no shadow

- 트레일(흰 리본)·착탄 섬광은 현행 코드 연출을 유지한다. 신규 채널을 추가하지 않는다.

### 1-B. 포병 — 곡사 포탄 + 폭발 (최우선)

| # | 에셋 | 파일명 | 프레임 크기 | 프레임 | 전체 PNG | 비고 |
|---|---|---|---:|---:|---:|---|
| B1 | 포탄 본체 | `shell.png` | 16×16 | 1 | 16×16 | 돌/무쇠 구체. 코드가 회전 처리 |
| B2 | 폭발 플립북 | `explosion.png` | 48×48 | 8 | 384×48 | 소형 3D 볼류메트릭 섬광→얇은 화염·연기, LINEAR |
| B3 | 연기 퍼프 | `smoke.png` | 64×64 | 1 | 64×64 | `assets/fx/`에 배치, 흰색 소프트 텍스처 |
| B4 | 돌 파편 3종 | `debris.png` | 8×8 | 3 | 24×8 | 애니메이션이 아닌 변형 3종 |

프롬프트 예시 (B2):
> restrained realistic 3D impact VFX flipbook, exactly 8 frames in one horizontal strip, tiny cannonball hit: brief pinpoint flash, a thin lick of orange flame and heat distortion, a small translucent dust-and-smoke wisp that clears immediately, fixed center, transparent background, HD-2D game VFX, top-down friendly, no pixel-art treatment, no spherical fireball, no mushroom-cloud silhouette, no ground shadow

- 피크 프레임의 주요 불투명 영역은 48×48 캔버스 안 지름 약 21px 이내로 둔다. 기존 후보 대비
  중심 기준 75% 크기이며, 캔버스 전체를
  채우는 화구·먹구름은 반려한다.
- 1× 재생은 24fps(약 0.33초)를 기준으로 하고, 후반 연기는 몬스터 실루엣을 읽을 수 있을 만큼
  얇고 반투명해야 한다. 이 기준은 “다발 착탄에서 몬스터를 가린다”는 사용자 프리뷰 관찰을 반영한다.
- 방사형 폭발 뒤 연기는 원점으로 다시 수축하지 않는다. 5프레임에서 잡힌 위치·크기·윤곽을
  6~8프레임까지 고정하고 알파만 단계적으로 낮춘다. 옆으로 흐르거나 중심으로 복귀하는 이동,
  2D 애니메이션처럼 보이는 역방향 실루엣 재생은 반려한다.

프롬프트 예시 (B3):
> soft white smoke puff, single centered wisp, white on transparent background, radial alpha falloff, no hard edge, no shadow, game particle texture

### 1-C. 마법대 — 매직 볼트

| # | 에셋 | 파일명 | 프레임 크기 | 프레임 | 전체 PNG | 비고 |
|---|---|---|---:|---:|---:|---|
| C1 | 볼트 코어 플리커 | `bolt.png` | 12×12 | 4 | 48×12 | 밝은 코어 + 보라 외곽, 중심 고정 |
| C2 | 착탄 버스트 | `magic-burst.png` | 32×32 | 5 | 160×32 | 수렴→터짐, 기존 `glow` 재사용 |

프롬프트 예시 (C1):
> pixel art magic bolt orb sprite sheet, exactly 4 frames in one horizontal strip, glowing white-violet core with purple arcane flicker, fixed center, subtle silhouette variation, transparent background, 16-bit fantasy game asset

- 헤일로·트레일은 기존 ADD 글로우 채널을 유지한다. 룬·별 등 신규 채널은 추가하지 않는다.

### 1-D. 소환대 — 가시

| # | 에셋 | 파일명 | 프레임 크기 | 프레임 | 전체 PNG | 비고 |
|---|---|---|---:|---:|---:|---|
| D1 | 가시 본체 | `spine.png` | 24×8 | 1 | 24×8 | 오른쪽 방향, 올리브·골색 |
| D2 | 착탄 스플랫 | `spine-hit.png` | 24×24 | 4 | 96×24 | 가시 파편이 튀며 소멸 |

프롬프트 예시 (D1):
> pixel art organic thorn spike projectile, side view facing right, bone and olive-green chitin, sharp tapered tip, dark colored outline, transparent background, 16-bit creature game asset, no glow, no shadow

---

## 2. 통합 계약

### 투사체·착탄 라우팅

| 발생원 | 비행 본체 | 착탄 연출 | 본체 틴트 |
|---|---|---|---|
| 정규군 타워 | `arrow` | 현행 `arrowImpact()` | 유지 |
| 영웅 평타·화살형 공격 | `arrow` | 현행 `arrowImpact()` | 유지(일반/치명타 색 구분) |
| 스피드 태그 타워 | `arrow` | 현행 `arrowImpact()` | 유지(원 병과색 구분) |
| 포병 타워 | `shell` | 신규 `artilleryImpact()` | 제거 |
| 마법대 타워 | `bolt` | 신규 `magicImpact()` | 제거 |
| 소환대 타워 | `spine` 에셋을 `seed` 키로 로드 | 신규 `spineImpact()` | 제거 |
| 스킬·제자리 범위 공격 | 현행 규칙 | 현행 공용 `explode()` | 현행 유지 |

- `explosion.png`는 **포병 타워에만** 재생한다. 공용 `explode()`를 포병 플립북으로 교체하지 않는다.
- 공용 `explode()`에서 범위 경계 링을 별도 헬퍼로 분리해 포병 착탄에서도 재사용할 수 있다.
  포병 플립북은 화염·연기만 담당하고 실제 범위 표시는 기존 경계 링이 담당한다.
- 스타일에 따른 착탄 분기는 `Proj.style`을 기준으로 한다. `splashRadius` 유무만으로 포병을
  판별하지 않는다.

### HD-2D 입체감 (코드 작업)

1. 곡사 포탄이 비행하는 동안 지면에 절차 생성 타원 그림자를 둔다. 높이에 따라 크기와
   투명도를 줄여 높이감을 표현한다.
2. 착탄 광 플래시는 기존 `zoneGlows` 방식을 재사용하고 짧게 감쇠한다.
3. 본체는 NEAREST, 볼류메트릭 폭발·글로우·연기는 LINEAR로 렌더링한다.

주변 스프라이트 라이팅과 상시 블룸은 범위에서 제외한다.

---

## 3. 통합·검증 순서

각 에셋은 **후처리 → vfx-lab 프리뷰 → 사용자 확인 → BattleScene 통합** 순으로 진행한다.

1. 원본 후보를 본체·도트 FX는 NEAREST, 볼류메트릭 VFX는 LINEAR로 축소하고 최종 해상도에서
   팔레트·알파·실루엣을 정리한다.
2. 표의 프레임 크기·개수·전체 PNG 크기와 프레임 중심을 자동 또는 수동으로 확인한다.
3. `preload()`에 로드한다. 시트는 `load.spritesheet(key, url, { frameWidth, frameHeight })`를 쓴다.
4. `vfx-lab`에서 정지 프레임, 0.5×/1×/2× 재생, 밝고 어두운 배경, 회전 상태를 비교한다.
5. 사용자 승인 뒤 위 라우팅 표대로 BattleScene에 통합한다.
6. `?bot`으로 4병과 동시 전투를 최소 3분 관찰한다. 일반 화살·치명타·스피드 타워의 색 구분과
   포병 외 공격에 포병 폭발이 나오지 않는지 확인한다.

### 성능 계측 선행 조건과 합격 기준

현재 `ParticlePool`은 활성 파티클이 240개면 새 생성을 조용히 버리므로 눈으로 캡 도달 여부를
판단할 수 없다. 통합 검증 전에 개발 모드 계측값 `active`, `peak`, `dropped`와 FPS를
`vfx-lab` 또는 디버그 HUD에 표시한다. 계측 UI는 프로덕션 화면에 노출하지 않는다.

- 데스크톱 Chrome, `?bot`, 2× 배속, 4병과 동시 전투, 3분을 기준 시나리오로 사용한다.
- 합격: `dropped = 0`, `peak < 240`, 3분 동안 지속적인 50 FPS 미만 구간이 없다.
- 실패하면 에셋 해상도를 먼저 낮추지 않고 파티클 수·수명·생성 간격 순으로 조정한다.
- 기능 검증은 `cd phaser && npm run build`와 `cd engine && npm run check && npx vitest run`을 실행한다.

## 범위 밖

티어별 scale·트레일·파티클 강화와 GOD 전용 변형은 아직 채택되지 않았다. 현재 에셋 발주와
shot 이벤트 계약에는 포함하지 않으며, 별도 실험과 사용자 승인 뒤 진행한다.
