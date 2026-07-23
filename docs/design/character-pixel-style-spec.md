# Free Characters Animation Asset Pack — 캐릭터 픽셀 스타일·규격 추출

> 상태: **현행** · 최종 갱신: 2026-07-23
> 목적: `Human_Archer`, `Human_Mage`, `Human_Spearman`을 기존 레퍼런스와 같은 화풍·규격으로 다시 제작하기 위한 기준.
> 이 문서는 레퍼런스에서 측정한 사실과 새 캐릭터 제작을 위한 [프로토] 제약을 구분한다.

## 1. 기준 레퍼런스와 분석 범위

분석의 기준은 다음 두 캐릭터뿐이다.

| 구분 | 파일 |
|---|---|
| 인간형 기준 | [`Human_Soldier_Sword_Shield`](../../resources/FreeCharactersAnimationsAssetPack/SpriteSheets(96x96)/Human_Soldier_Sword_Shield/) |
| 몬스터형 기준 | [`Monster_Slime`](../../resources/FreeCharactersAnimationsAssetPack/SpriteSheets(96x96)/Monster_Slime/) |
| 원본 편집 파일 | [`AsepriteFiles/`](../../resources/FreeCharactersAnimationsAssetPack/AsepriteFiles/) |

분석 대상은 `No_Shadows`, `Only_Shadows`, `With_Shadows` 세 변형과 개별 애니메이션 PNG다. 기존에 생성된 궁수·마법사·창병은 스타일 기준에서 제외한다.

## 2. 스타일 판정

### 2.1 한 줄 정의

**96×96 셀 안에 약 20px 크기의 캐릭터를 배치하는, 제한 팔레트 기반의 하드 엣지 2D 픽셀 아트.** 시점은 정면에 가까운 3/4 탑다운이며, 실루엣과 장비의 방향만으로 병과가 읽힌다.

### 2.2 선과 픽셀

- 안티앨리어싱, 블러, 벡터 곡선, 소프트 그라디언트를 사용하지 않는다.
- 대각선과 곡선은 계단형 픽셀로 만든다. 선 굵기는 대부분 1px이며, 외곽선은 모든 곳을 균일하게 두르기보다 어두운 면과 틈새를 함께 사용한다.
- 한 픽셀 단위의 작은 색 덩어리와 2~3단계 명암이 형태를 설명한다. 면을 사진처럼 매끈하게 채우지 않는다.
- 투명 배경을 유지한다. 셀 안에 바닥·배경색을 굽지 않는다.
- 인간과 슬라임 모두 공통으로 아주 어두운 갈색-회색 `#302C2E`를 외곽선·틈새에 사용한다.

### 2.3 형태와 구도

- 인간 기준은 헬멧/머리, 몸통, 양쪽 장비가 작은 덩어리로 분리되는 압축된 실루엣이다.
- 인간 Idle 프레임의 실제 불투명 영역은 대략 `21×18~19px`이며, 96×96 셀의 가운데보다 약간 왼쪽에 놓인다. 측정 예: `21×19px @ x34, y39`.
- 슬라임 Idle 프레임은 대략 `15~17×9~11px`의 낮은 덩어리이며, 인간보다 작고 납작하다. 측정 예: `15×11px @ x40, y46`.
- 새 세 인간형은 슬라임의 크기를 따라 하지 말고, 인간 기준의 키·발 위치·시각적 무게를 따른다.
- 무기나 장신구가 실루엣 밖으로 튀어나오더라도 캐릭터 본체의 키와 발 위치는 인간 기준과 맞춘다. 한 프레임에서만 갑자기 커지는 장비는 금지한다.

### 2.4 명암과 소재

- 기본 소재는 1색 평면 + 어두운 면 + 밝은 면의 2~3단 구조로 표현한다.
- 광원 방향은 강하게 고정된 좌상단 규칙이라기보다, 각 물체의 읽기 쉬운 면에 선택적으로 하이라이트를 둔 방식이다. 새 캐릭터는 프레임마다 광원 방향을 바꾸지 않는다.
- 금속은 회청색 하이라이트, 가죽·나무는 갈색 계열, 피부는 따뜻한 살구색처럼 소재마다 작은 색군을 유지한다.
- 흰색은 넓은 본체색이 아니라 칼날·마법 효과·강한 반사광 같은 포인트에 사용한다.
- 슬라임은 초록 본체에 어두운 청록 면과 밝은 황록 하이라이트를 사용한다. 반투명 젤리나 광택을 사진식 그라디언트로 만들지 않는다.

## 3. 팔레트 추출

아래 색은 두 레퍼런스의 전체 `No_Shadows` 시트에서 실제로 확인된 대표 색이다. 새 캐릭터는 이 색을 우선 재사용하고, 색을 추가해야 할 때도 기존 명도 단계 사이에서만 추가한다.

### 3.1 공통·효과

| 용도 | 색 |
|---|---|
| 외곽선·틈새·가장 어두운 면 | `#302C2E` |
| 흰색 하이라이트·효과 | `#FFFFFF` |
| 차가운 강광·검기·마법 보조광 | `#CBDBFC` |
| 그림자 레이어 | `#302C2E` at 75% opacity (`#302C2EBF`) |

### 3.2 인간형 팔레트

| 용도 | 색 |
|---|---|
| 회청색 금속 중간값 | `#6F828D` |
| 금속 밝은 면 | `#9BADB7` |
| 금속 어두운 면 | `#425C6B` |
| 보라색 천·장비 중간값 | `#564064` |
| 보라색 천·장비 어두운 면 | `#39314B` |
| 피부 기본값 | `#F4CCA1` |
| 피부·따뜻한 하이라이트 | `#EEA160` |
| 나무 중간값 | `#946835` |
| 나무 어두운 면 | `#7B4E16` |
| 작은 상처·강조색 | `#D95763` |

### 3.3 슬라임 팔레트

| 용도 | 색 |
|---|---|
| 초록 본체 | `#397B44` |
| 청록색 어두운 면 | `#3C5956` |
| 황록색 하이라이트 | `#71AA34` |
| 작은 포인트 | `#CD6093` |

## 4. 제작 규격

### 4.1 프레임·시트

| 항목 | 기준값 |
|---|---|
| 단일 프레임 | `96×96px` |
| 전체 시트 | `960×768px`, 96px 셀 기준 10열×8행 |
| 배경 | 완전 투명 RGBA |
| 셀 간격·패딩 | 없음. 셀은 96px 단위로 연속 배치 |
| 출력 배율 | 원본 픽셀 유지. 리사이즈 시 nearest-neighbor만 사용 |
| 변형 | `No_Shadows`, `Only_Shadows`, `With_Shadows` |

### 4.2 애니메이션 프레임 수

개별 PNG의 파일명과 너비에서 확인한 프레임 수는 다음과 같다.

| 애니메이션 | 프레임 수 | 새 캐릭터 적용 규칙 |
|---|---:|---|
| `Idle` | 6 | 호흡·무게중심 변화는 작게 유지 |
| `Walk` | 8 | 발 교차와 몸의 상하 바운스 |
| `Jump_Fall` | 6 | 상승·하강의 실루엣 변화 |
| `Block` | 6 | 방어 자세와 장비가 먼저 읽혀야 함 |
| `Attack1` | 8 | 기본 공격의 준비→동작→회수 |
| `Attack2` | 8 | 두 번째 공격의 준비→동작→회수 |
| `Hurt` | 4 | 짧고 명확한 피격 반응 |
| `Death` | 10 | 넘어짐·붕괴를 단계적으로 표현 |

전체 시트의 행 순서는 레퍼런스와 동일하게 `Idle → Walk → Jump_Fall → Block → Attack1 → Attack2 → Hurt → Death`로 맞춘다. 개별 파일은 각 애니메이션의 프레임 수에 맞는 너비를 사용한다.

### 4.3 그림자

- `No_Shadows`에는 캐릭터 본체만 둔다.
- `Only_Shadows`에는 본체와 분리된 바닥 그림자만 둔다.
- `With_Shadows`는 두 결과를 합친다.
- 그림자는 흐린 브러시나 다중 알파 그라디언트가 아니라, `#302C2E` 75% 알파의 작고 계단형인 평면 덩어리다.
- 그림자는 캐릭터의 발/바닥 위치를 고정하는 용도이므로 애니메이션 중 캐릭터와 독립적으로 미끄러지지 않는다.

## 5. 새 캐릭터별 적용안 [프로토]

세 캐릭터 모두 `Human_Soldier_Sword_Shield`의 인간 본체 비율과 시트 규격을 공유한다. 병과 차이는 장비 실루엣과 공격 동작에서만 만든다.

| 캐릭터 | 실루엣·색 규칙 | 공격 읽힘 |
|---|---|---|
| `Human_Archer` | 같은 머리·몸통 높이. 활은 계단형 곡선과 얇은 장축으로 만들고, quiver는 몸 뒤 작은 덩어리로 제한. 회청색·갈색 장비군 유지 | `Attack1`은 활을 당기는 준비, `Attack2`는 발사와 짧은 활시위/화살 효과. 큰 광선·파티클 금지 |
| `Human_Mage` | 같은 인간 크기. 로브/후드 또는 지팡이 하나만 주 실루엣으로 선택하고, 머리·몸통을 크게 부풀리지 않음. 보라색 천 + `#CBDBFC`/흰색 효과 | `Attack1`은 시전 준비, `Attack2`는 작은 마법탄·룬 효과. 효과가 본체보다 넓어지지 않음 |
| `Human_Spearman` | 같은 갑주 크기. 창대는 한 방향의 긴 계단형 축으로 두되, 셀 가장자리를 찌르지 않음. 방패를 추가한다면 검방병보다 작게 | `Attack1`은 찌르기 준비, `Attack2`는 전진 찌르기와 회수. 무기 궤적은 흰색/연청색 몇 픽셀로만 표시 |

### 공통 금지사항

- 머리만 크게 만든 치비 비율, 3D 렌더링풍 명암, 매끈한 일러스트풍 외곽선
- 96×96 셀을 무시한 큰 캐릭터, 프레임마다 달라지는 발 위치·중심선
- 색 수가 과도하게 많은 그라디언트, 발광 블룸, 반투명 연기·흐림
- 기존 레퍼런스에 없는 과장된 무기 궤적이나 화면을 가득 채우는 마법 이펙트
- `Human_Soldier_Sword_Shield`와 다른 방향성의 카메라, 두께, 픽셀 밀도

## 6. 생성 프롬프트 기준문 [프로토]

다음 문장을 역할별 장비 설명 앞에 공통으로 붙인다.

> Match the exact visual language of the supplied `Human_Soldier_Sword_Shield` and `Monster_Slime` sprite sheets: hard-edged hand-pixeled 2D pixel art, native 96x96 transparent frame, compact roughly 20px character footprint, front-facing 3/4 top-down readability, stepped diagonals, limited palette, dark brown-gray pixel outline, 2–3 shade clusters per material, no anti-aliasing, no gradients, no blur, no bloom, no text, no background, consistent feet and ground anchor across all frames. Create a complete 8-row animation sheet with the exact frame counts Idle 6, Walk 8, Jump_Fall 6, Block 6, Attack1 8, Attack2 8, Hurt 4, Death 10, plus No_Shadows / Only_Shadows / With_Shadows variants.

생성 결과는 이미지 한 장의 분위기보다 다음 우선순위로 검수한다.

1. 96×96 셀과 프레임 수가 맞는가.
2. 인간 기준의 키·발 위치·픽셀 밀도를 지키는가.
3. `#302C2E` 외곽선과 제한 팔레트가 유지되는가.
4. 장비 실루엣만으로 궁수·마법사·창병이 즉시 구분되는가.
5. 모든 변형에서 본체·그림자·투명 배경이 분리되는가.

## 7. 측정 재현 방법

분석일 기준의 로컬 에셋을 대상으로 ImageMagick을 사용했다.

```sh
identify 'resources/FreeCharactersAnimationsAssetPack/SpriteSheets(96x96)/Human_Soldier_Sword_Shield/No_Shadows/*.png'
identify 'resources/FreeCharactersAnimationsAssetPack/SpriteSheets(96x96)/Monster_Slime/No_Shadows/*.png'
magick <sprite-sheet.png> -alpha on -format '%c' histogram:info:-
magick <sprite-sheet.png> -crop '96x96+<x>+<y>' +repage -alpha extract -threshold 0 -trim -format '%wx%h+%X+%Y\\n' info:
```

프레임 크기·파일 너비·팔레트는 위 명령으로 확인한 값이며, 역할별 장비 배치와 공격 동작은 새 캐릭터 제작을 위한 [프로토] 제안이다.
