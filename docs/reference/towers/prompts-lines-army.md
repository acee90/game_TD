# 정규군 계열 프롬프트 (race 0 · 강철슬레이트 `#6d86ab`)

> 근거: [컨셉 §3](../../design/tower-dot-modeling-concept.md). 화풍 앵커: [방랑기사](../wandering-knight-concept-v1.png).
> 각 프롬프트는 **자체 완결형**(공용 화풍 블록 포함) — 아래 코드블록을 그대로 외부 AI에 붙여넣는다.

---

## 1. 궁병 계열 (speed)

`army-apprentice-archer → army-archer → army-longbowman → army-master-archer`
(견습 궁병 → 궁병 → 장궁병 → 신궁)

**계열 표식(모든 티어 유지):** 손에 든 **활** + 등 **화살통**. 활이 짧은 나무 반곡궁 → 장궁 → 리컬브로 진화.
**기사와의 구분:** 당긴 활(원거리) 실루엣.

```
A horizontal character evolution sheet: ONE archer, four full-body figures in a single row,
tier 1 to tier 4 from left to right, front-facing idle pose. The SAME character, progressively
better equipped ("gear upgrade" progression), each figure a little taller and denser than the last.

STYLE: chibi low-poly fantasy character, 2–3 heads tall, chunky rounded proportions, angular
low-poly faceting with soft cel shading, bold clean readable silhouette. Muted material palette:
weathered blue-gray steel, brown leather, cream cloth, dark iron. Even soft studio lighting from
upper-left. Painted game-asset concept style.

FRAME: flat neutral mid-gray background, NO cast shadow, NO ground line, full body in frame,
identical foot baseline and camera height for every figure, evenly spaced. Absolutely no text,
no letters, no numbers, no UI, no icons, no watermark.

Figure 1 (Lv1, humblest, scrawny and poor): plain cloth hood, short simple wooden shortbow,
no quiver, worn leather shoes, no armor.
Figure 2 (Lv2): leather chest armor with a single shoulder pauldron, a standard bow, a quiver on
the back, a wrist bracer.
Figure 3 (Lv3): chainmail shirt, a body-height longbow, a bundle of fletched arrows, a small
triangular shoulder cape.
Figure 4 (Lv4, iconic and proud): ornate embossed armor with a short cape and a helmet crest, a
silver-inlaid recurve composite bow, a faint magical rune-glow on the nocked arrow.

CONSISTENCY: every figure keeps a bow held in one hand and arrows on the back; the bow evolves
short-wooden -> longbow -> recurve composite. Use the accent color ONLY on banner / trim / cloth
edges: steel-slate blue #6d86ab. Materials stay in the fixed palette; do not tint the whole body.
```

---

## 2. 기사 계열 (speed)

`army-squire → army-knight → army-sword-expert → army-sword-master`
(종자 → 기사 → 소드 엑스퍼트 → 소드마스터)

**계열 표식(모든 티어 유지):** **세운 검 + 정면 방패**. 갑옷이 누비옷 → 판금 → 풀플레이트 → 흑철 부조로 진화.
**궁병과의 구분:** 근접 방패+검 실루엣. 켈틱 트라이케트라 각인은 **정규군 한정 소품**으로 소량만.

```
A horizontal character evolution sheet: ONE knight, four full-body figures in a single row,
tier 1 to tier 4 from left to right, front-facing idle pose. The SAME character, progressively
better equipped ("gear upgrade" progression), each figure a little taller and denser than the last.

STYLE: chibi low-poly fantasy character, 2–3 heads tall, chunky rounded proportions, angular
low-poly faceting with soft cel shading, bold clean readable silhouette. Muted material palette:
weathered blue-gray steel, brown leather, cream cloth, dark iron. Even soft studio lighting from
upper-left. Painted game-asset concept style.

FRAME: flat neutral mid-gray background, NO cast shadow, NO ground line, full body in frame,
identical foot baseline and camera height for every figure, evenly spaced. Absolutely no text,
no letters, no numbers, no UI, no icons, no watermark.

Figure 1 (Lv1, humblest): quilted gambeson and a simple kettle helm, a short sword, a small round
buckler, minimal armor, poor squire look.
Figure 2 (Lv2): steel breastplate and a visored helm, a longsword, a kite shield, a cloth surcoat.
Figure 3 (Lv3): full plate armor, a two-handed sword, a heraldic shield, a shoulder cape.
Figure 4 (Lv4, iconic): embossed black-iron plate armor, a rune-engraved greatsword, a flowing
cape, a plumed helmet crest — commanding and heroic.

CONSISTENCY: every figure keeps an upright sword in hand and a shield facing forward; armor evolves
gambeson -> plate -> full plate -> embossed black iron. Use the accent color ONLY on surcoat /
banner / shield trim: steel-slate blue #6d86ab. A small Celtic triquetra engraving may appear as an
army-only motif on the shield or pommel. Materials stay in the fixed palette; do not tint the whole body.
```
