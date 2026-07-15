# resources — 아트 생성 원본·프롬프트 보관소

**상태: 현행** · 최종 수정 2026-07-15

AI로 생성한 2D 콘셉트 원본과 그 **생성 프롬프트**를 여기 둔다. Unity는 `Assets/` 밑만
임포트하므로 이 폴더는 엔진이 건드리지 않는다. 3D 중간물(.blend, Meshy zip, Mixamo FBX)은
[`art-source/`](../art-source/README.md), 엔진용 최종 산출물은 `unity/Assets/Art/`.

규격 근거: [worldbuilding.md §7 아트 디렉션](../docs/design/worldbuilding.md).

## 구조

```
resources/
  source/       생성 원본 (green chroma 배경, 1024×1536). 손대지 않은 출력물.
  characters/   영웅 등 인간형 사용본
  weapons/      무기·장비 사용본
```

- `source/`의 파일은 원본이고, `characters/`·`weapons/`는 용도별로 분류한 사용본이다.
- 배경은 **green chroma (#0f0 계열)** — Meshy 투입 전 크로마키로 배경 제거해 사용한다.

## 현재 애셋 — 방랑궁수 (wandering-archer)

| 파일 | 내용 | 용도 |
|---|---|---|
| `characters/wandering-archer-t-pose.png` | 빈손 **T포즈** 몸통, 팔 수평 | Meshy image-to-3D → Mixamo 리깅 |
| `weapons/wandering-archer-bow-and-quiver.png` | 활 + 화살통(화살 3) 측면 | 별도 모델 → 본 소켓 부착 |
| `source/wandering-archer-t-pose-chroma.png` | 몸통 생성 원본 | 보관 |
| `source/wandering-archer-weapons-chroma.png` | 무기 생성 원본 | 보관 |

기준 앵커: [`docs/reference/wandering-archer-concept-v1.png`](../docs/reference/wandering-archer-concept-v1.png)
(팔 내린 A포즈 원안 — 리깅용이 아니라 비율·재질·팔레트 기준).

### 파이프라인 상 다음 단계

1. 크로마키로 배경 제거.
2. 몸통 PNG → Meshy image-to-3D → Mixamo 오토리깅 (빈손 T포즈라 마커 인식 통과).
3. 활·화살통은 별도 모델로 만들어 손 본(hand)·등 본(spine) 소켓에 부착.
   현재 무기 PNG는 활+화살통이 한 장에 있으니, 개별 모델이 필요하면 크롭해 각각 투입한다.
4. Meshy zip은 `art-source/meshy/`, 리깅 FBX 원본은 `art-source/mixamo/`,
   최종 산출물만 `unity/Assets/Art/`.

---

## 생성 규격 — 공통 골격과 파이프라인

아트 방향(화풍 DNA·팔레트·형태 원칙)의 근거는
[worldbuilding.md §7 아트 디렉션](../docs/design/worldbuilding.md)에 있고, 그 원칙을
실제 생성으로 옮기는 프롬프트·파이프라인·판정 규격은 여기서 관리한다.

### 공통 프롬프트 골격

아래 골격에서 `[대상]`, `[고유 실루엣]`, `[핵심 재질]`, `[강조색]`만 바꾼다.

```text
Production concept art for a stylized medieval fantasy tower-defense game.
[대상], with [고유 실루엣], built from 3–5 large readable shape masses.
Bold dark contour lines, flat graphic color shapes, subtle paper-and-gouache texture,
restrained Nordic illuminated-manuscript mood, stylized low-poly game design language.
Materials: [핵심 재질]. Muted charcoal, slate blue, aged silver, dark brown,
and moss gray palette, with one restrained [강조색] accent.
Strict orthographic view, centered, entire subject visible, even diffuse lighting,
plain warm light-gray background, generous padding.
Designed to remain readable from a 55-degree top-down game camera.
No text, logo, watermark, scenery, decorative frame, photorealism,
dramatic perspective, tiny ornaments, neon overload, or copied heraldry.
```

추가 문구는 종류에 따라 붙인다.

- **인간형:** `relaxed neutral A-pose, arms and legs clearly separated, hands visible`
- **타워:** `three-quarter orthographic view showing the front, side, base, and attack direction`
- **적:** `single creature, neutral locomotion pose, clear forward direction, no base platform`
- **소품:** `isolated prop, one material story, no character, no environmental scene`

### Meshy 입력용 콘셉트 규격

- 인간형은 T포즈가 필수는 아니다. **느슨한 A포즈**를 기본으로 하고 팔·다리를 몸에서 분리한다.
- 정면 직교 시점, 눈높이, 전신, 단색의 밝은 배경, 균일한 조명을 사용한다.
- 무기·방패·활·화살통은 몸에 겹치지 않게 옆에 따로 배치해 형태 참고 자료로 삼는다.
- 첫 생성은 정면 단독 이미지로 하고, 디자인 확정 후 측면·후면 턴어라운드를 별도로 만든다.
- 긴 털, 가는 활시위, 사슬, 천 조각은 3D 자동 생성 결과를 확인한 뒤 Blender에서 단순화한다.
- 생성된 3D는 완성품이 아니라 베이스 메시다. 리토폴로지, 무기 분리, 손, 관절, 리깅을 검수한다.

### 리깅 대비 생성 전략 — 몸과 무기를 처음부터 분리한다 (Mixamo 경로)

Meshy image-to-3D는 **입력 이미지의 포즈를 그대로 복제**하고, 손에 쥔 무기를 몸에
**융합(fuse)** 시켜 단일 메시로 출력한다. 따라서 무기를 든 A/T포즈 한 장으로 생성하면
(1) 팔이 몸에 붙어 Mixamo 오토리거가 손목·팔꿈치 마커를 못 찾고, (2) 활이 손에 용접돼
사후 분리가 구멍 메우기까지 동반하는 수작업 서저리가 된다. 그래서 **생성 단계에서부터
몸과 무기를 별도 이미지·별도 모델로 나눈다.**

- **몸통:** 빈손, **T포즈**(또는 팔을 30~45° 확실히 벌린 A포즈)로 생성한다. 손·무기를
  들리지 않는다. 팔·다리가 몸통·서로에서 떨어져야 Mixamo 마커 인식이 통과한다.
- **무기:** 활, 화살통(+화살)을 **각각 별도 이미지 → 별도 모델**로 생성한다. 측면
  정직교(profile), 단색 배경, 여백 넉넉히 — 활은 옆모습이 형태가 가장 잘 읽힌다.
- **조립:** 리깅 후 무기를 본 소켓에 부착한다 — 활은 손 본(hand), 화살통은 등/척추
  본(spine). Unity에서 해당 본 하위에 소켓(Empty)을 두고 무기를 child로 붙인다.
- **뭉툭한 손**은 Mixamo에서 "no fingers" 옵션으로 처리한다.

### 생성 후 판정 체크리스트

1. 흑백 실루엣만 보아도 역할이 구분되는가?
2. 100px 안팎으로 축소했을 때 머리·무기·공격 방향이 남는가?
3. 큰 형태가 3~5개로 설명되는가?
4. 외부 레퍼런스의 인물·문장·구도를 그대로 복제하지 않았는가?
5. 방랑기사·방랑궁수와 선 굵기, 팔레트, 재질 표현이 같은 세계로 보이는가?
6. Meshy용이면 팔다리와 장비가 서로 겹치거나 붙어 있지 않은가?
7. 최종 채택 전 Unity 55° 부감 캡처로 타워·영웅·적을 함께 비교했는가?

---

## 생성 프롬프트 기록

재생성·변형 시 아래 프롬프트를 기준으로 삼는다. 공통 골격은
위 [§공통 프롬프트 골격](#공통-프롬프트-골격)을 따른다.

### 몸통 — 빈손 T포즈

반드시: **빈손**(무기 별도), **T포즈**(팔 수평·손바닥 정면), 팔·다리 분리, 정면 정직교,
단색 배경, 여백 넉넉히. 손은 뭉툭해도 됨(Mixamo "no fingers" 처리).

```text
Production concept art for a stylized medieval fantasy tower-defense game.
A rugged unaffiliated mercenary ranger, empty-handed, with a bulky fur-collared
shoulder cape over layered leather-and-plate armor and a soft hood at the neck,
built from 3–5 large readable shape masses.
Bold dark contour lines, flat graphic color shapes, subtle paper-and-gouache texture,
restrained Nordic illuminated-manuscript mood, stylized low-poly game design language.
Materials: worn brown leather, dark aged plate, thick fur collar, coarse cloth.
Muted charcoal, slate blue, aged silver, dark brown, and moss gray palette,
with one restrained slate-blue accent on the tunic and scarf.
Strict orthographic front view, symmetric T-pose with both arms raised horizontally
to shoulder height and palms facing forward, arms and legs clearly separated from the
body and from each other, hands visible, no weapon and no held object of any kind.
Centered, entire subject visible, even diffuse lighting,
plain warm light-gray background, generous padding.
Designed to remain readable from a 55-degree top-down game camera.
No text, logo, watermark, scenery, decorative frame, photorealism,
dramatic perspective, tiny ornaments, neon overload, or copied heraldry.
No bow, no arrows, no quiver, no sword, no held prop.
```

### 무기 — 활 + 화살통

반드시: 캐릭터·손 없음, 측면 정직교(활은 옆모습이 형태가 가장 잘 읽힘), 단색 배경.
얇은 활시위는 굵게 단순화하거나 생략 후 Blender에서 추가.

```text
Production concept art for a stylized medieval fantasy tower-defense game.
A recurved longbow and a separate leather arrow quiver holding three arrows,
laid out side by side without touching, each built from 3–5 large readable shape masses,
the bow with a thick wrapped grip and reinforced limb tips.
Bold dark contour lines, flat graphic color shapes, subtle paper-and-gouache texture,
restrained Nordic illuminated-manuscript mood, stylized low-poly game design language.
Materials: dark stained wood, aged silver metal caps, worn leather, cross-laced seams.
Muted charcoal, slate blue, aged silver, dark brown, and moss gray palette,
with one restrained slate-blue accent.
Strict orthographic side profile view, thick simplified or omitted bowstring,
isolated props, one material story, no character, no hand, no environmental scene.
Centered, both objects fully visible, even diffuse lighting,
plain warm light-gray background, generous padding.
Designed to remain readable from a 55-degree top-down game camera.
No text, logo, watermark, scenery, decorative frame, photorealism,
dramatic perspective, tiny ornaments, neon overload.
```

> 배경을 `plain warm light-gray` 대신 green chroma로 뽑으면 크로마키 제거가 쉽다 —
> 현재 애셋이 그렇게 생성돼 있다.
