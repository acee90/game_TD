# 타워 컨셉아트 생성 프롬프트

> 상태: **초안** · 최종 갱신: 2026-07-23
> 근거: [`docs/design/tower-dot-modeling-concept.md`](../../design/tower-dot-modeling-concept.md) (§8 화풍 앵커·§3~7 계열 컨셉).
> 화풍 앵커: [방랑기사 비주얼 아이덴티티](../hero/hero-knight-visual-identity.md),
> [방랑기사 치비](../wandering-knight-concept-v1.png), [방랑궁수 치비](../wandering-archer-chibi-tpose-concept-v1.png).
> 목적: **외부 이미지 AI에 그대로 붙여넣어 컨셉아트를 생성**하기 위한 완결형 프롬프트 모음.
> 이 저장소/Claude는 이미지를 생성하지 않는다 — 프롬프트/아트 디렉션만 쓴다
> (메모리: 컨셉아트 먼저→도트, Claude는 이미지 생성 안 함).

---

## 파이프라인 위치

```
[여기] 컨셉아트 프롬프트 작성  →  외부 AI가 컨셉아트 생성  →  사용자 리뷰·계열 룩 확정
                                                              ↓
        게임 통합(BattleScene·Wiki)  ←  격리 프리뷰 검수  ←  도트 변환(앞면·뒷면)
```

지금 단계는 **계열의 룩을 확정하기 위한 컬러 컨셉 시트**를 만드는 것이다(컨셉 문서 §9-1).
도트 변환·애니메이션은 승인 후 별도 단계(§8.3, D5) — 여기 프롬프트는 그걸 만들지 않는다.

**우선순위:** 계열 진화 시트 7종 → 사용자 확정 → GOD 11종 → 도트 변환 프롬프트.

---

## 파일

| 파일 | 내용 | 시트 수 |
|---|---|---|
| [prompts-lines-army.md](prompts-lines-army.md) | 정규군 — 궁병·기사 계열 | 2 |
| [prompts-lines-artillery.md](prompts-lines-artillery.md) | 포병 — 투석기·노포 계열 | 2 |
| [prompts-lines-magic.md](prompts-lines-magic.md) | 마법대 — 마법사·정령술사 계열 | 2 |
| [prompts-lines-summon.md](prompts-lines-summon.md) | 소환대 — 골렘 계열 | 1 |
| [prompts-god.md](prompts-god.md) | GOD 11종 (초기 4 + 확장 7) | 11 |

---

## 공용 화풍 블록 (모든 프롬프트에 이미 포함됨)

외부 AI는 붙여넣은 텍스트만 읽으므로 **각 프롬프트는 자체 완결형**으로 이 블록을 이미 품고 있다.
아래는 참고용 원본이다 — 개별 프롬프트를 손볼 때 이 기준을 지킨다.

**STYLE (화풍 — 고정):**
> chibi low-poly fantasy character, 2–3 heads tall, chunky rounded proportions, angular
> low-poly faceting with soft cel shading, bold clean readable silhouette. Muted material
> palette: weathered blue-gray steel, brown leather, cream cloth, dark iron. Even soft studio
> lighting from upper-left. Painted game-asset concept style.

**FRAME (구도 — 고정):**
> flat neutral mid-gray background, NO cast shadow, NO ground line, full body in frame,
> identical foot baseline and camera height for every figure, evenly spaced left→right.
> Absolutely no text, no letters, no numbers, no UI, no icons, no watermark.

**색 규칙 (D1 하이브리드):**
재질은 고정 소팔레트(강철 회청·나무 갈색·천 미색·흑철)로 그려 재질 대비를 살린다.
**병과색은 배너·트림·천 가장자리·발광 액센트로만** 쓴다(전신 물들이기 금지).

| 병과 | 액센트색 | 재질 기조 |
|---|---|---|
| 정규군 (race 0) | 강철슬레이트 블루 `#6d86ab` | 판금·사슬·나무활 + 천 서코트 |
| 포병 (race 1) | 청동 `#bf7a3a` | 목재 + 청동 + 로프 |
| 마법대 (race 2) | 자수정 `#9a6ea6` | 로브 + 룬 + 부양 결정 (마광) |
| 소환대 (race 3) | 이끼 `#8a9a5b` | 돌·룬 재질 + 이끼/룬 발광 |

**상승을 읽히는 4축 (컨셉 §2.2):** ① 실루엣 밀도(성글다→촘촘) ② 무기 수·크기 ③ 규모 ④ 마광.
Lv1은 **초라하게**, Lv4는 **아이코닉하게**. 한 계열은 "같은 병사가 장비를 업그레이드"로 읽혀야 한다.

**금지 (컨셉 §8.1):** 다크판타지 과잉, 화면 덮는 장식, 태그(파워/스플래시/스피드) 표식,
글자·숫자·라벨, 재질 팔레트+병과 액센트 외의 잡색, 배경 소품.

---

## 네거티브 프롬프트 (도구가 지원하면)

```
text, letters, numbers, words, watermark, signature, UI, HUD, health bar, background scenery,
cast shadow, drop shadow, ground plane, photorealistic, gritty dark fantasy, oversaturated,
extra colors, cluttered ornament, multiple art styles, inconsistent scale, blurry
```

## 권장 산출 규격

- **비율**: 계열 시트는 가로로 긴 4열(예: 16:9 또는 2:1). GOD은 개별 1:1 또는 3:4.
- **해상도**: 도트 추출이 목적이라 실루엣이 또렷하면 충분. 배경 완전 무지(회색) 유지.
- **버전 관리**: 생성물은 이 폴더에 `<line>-concept-vN.png`로 저장하고, 확정본은 컨셉 문서
  §8.4/§9에 "무엇을→왜→상태" 한 줄로 남긴다. 파일명은 영문 kebab-case.
