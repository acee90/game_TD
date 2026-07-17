# Medieval HUD asset provenance

> 상태: 현행 · 최종 갱신: 2026-07-16

## 생성 방식

- 생성 도구: Codex built-in `image_gen` (`gpt-image-2` 경로)
- 생성 원본: `originals/`
- 후처리: ImageMagick으로 크로마키 제거, 규격 리사이즈, 상태 파생 및 단순 장식 제작
- 외부 소스: 없음
- 용도: `unity/Assets/Resources/UI/Medieval/`의 Unity uGUI HUD 이미지

생성형 원본 세 장은 철 패널, 목재 슬롯, 양피지 패널의 재질 기준이다. 위험·hover·press·disabled·보스 상태는 동일 원본에서 색·명도·알파만 파생해 크기와 앵커가 어긋나지 않게 했다. 베젤, 게이지, 황동 코너, 밀랍 봉인, 자물쇠, 사슬은 ImageMagick 도형으로 저작했다.

## 파일 대응

| 원본 | 최종 자산 |
|---|---|
| `originals/panel-iron-source.png` | `frames/panel-iron*.png`, `frames/portrait-frame.png` |
| `originals/slot-wood-source.png` | `buttons/slot-wood*.png` |
| `originals/parchment-source.png` | `frames/parchment*.png` |
| 절차적 후처리 | `bars/`, `boss/`, `deco/` |

