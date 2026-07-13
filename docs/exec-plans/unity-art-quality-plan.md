# 실행 계획 — Unity 뷰 디자인 퀄리티 향상

> 상태: **초안** (승인 대기) · 작성일 2026-07-10
> 범위: `unity/Assets/Scripts/View/` + 신규 커밋 에셋. **Core/는 건드리지 않는다.**
> 이 문서는 계획까지다. 구현은 승인 후 별도 진행한다.

---

## 0. 왜 지금 천장에 부딪혔나

유니티 뷰는 **에셋 0 원칙** 위에 서 있다. `Bootstrap.cs`가 `RuntimeInitializeOnLoadMethod`로
빈 씬에 카메라·조명·맵·HUD를 코드로 조립하고, 지오메트리는 `GameObject.CreatePrimitive`
(큐브·스피어·캡슐·실린더)뿐이다. 커밋된 에셋은 0개다.

이 원칙은 포팅 단계에서 옳았다 — 열자마자 실행되고 마이그레이션 이슈가 없었다.
하지만 시각 감사 결과, 화면이 "프로토타입처럼" 보이는 원인은 셋으로 압축된다:

1. **발광이 발광으로 안 보인다.** `GameView.cs:690`이 emission을 잔뜩 쓰지만 후처리가 없어
   그냥 밝은 알베도로 보인다. 게다가 발광체(GOD·보스·문·제단)에 실제 광원이 없다 —
   영웅만 Point Light를 갖는다(`GameView.cs:596-601`). 빛나는 물체가 주변을 밝히지 않으니
   평면 스티커처럼 보인다.
2. **40개 타일 위에서 유닛이 안 읽힌다.** 타워는 전부 큐브고 종족은 색으로만 구분된다
   (`GameView.cs:483`). 몹은 전부 같은 회색 구체다(`GameView.cs:568`).
   **그런데 웹 렌더러에는 있던 인월드 라벨 — 타워 티어 숫자, 입구/출구, 제단 —
   이 유니티에서 통째로 빠졌다.** 가독성이 웹보다 퇴보한 회귀다.
3. **OnGUI 기본 회색 버튼이 화면 절반을 차지한다.** 기능이 달라도 전부 같은 회색 사각형이다
   (`GameHud.cs:135,138,142,151,163,176`). Unity 기본 IMGUI 룩이 곧 "프로토타입"의 정의다.

**그리고 빌드가 깨질 급소가 하나 숨어 있다.** `GameViewFx.cs:437-448`의 `UiFont()`는
`LegacyRuntime.ttf` → `Arial.ttf` → OS `Helvetica` 순으로 폴백하는데 **셋 다 한글 글리프가 없다.**
에디터에서는 OS 폰트를 잡아 우연히 보이지만, 스탠드얼론 빌드에서는 한글이 사라진다.
HUD의 GUIStyle도 기본 폰트라 같은 문제를 공유한다.

즉 **에셋 0 폐기는 스타일 선택이 아니라 선결 조건**이다. 다만 폐기가 "코드 조립을 버려라"는
뜻은 아니다. `Bootstrap`의 런타임 조립은 잘 작동하며 유지한다.
폐기의 실질은 **자산이어야만 하는 것(폰트, 이후 URP 에셋·메시)을 커밋하기 시작한다**는 것이다.

---

## 1. 결정 사항과 미결 사항

**확정 (사용자 결정, 2026-07-10):**
1. 에셋 0 원칙 폐기 — 정식 Unity 프로젝트로 전환.
2. 아트 방향은 **미정** — 프리뷰를 보고 고른다.
3. 범위는 계획 수립까지.

**해소 (2026-07-13, [세계관 문서](../design/worldbuilding.md) 확정으로):**
- **최종 아트 방향 — 네온 디오라마 탈락.** 세계관 §8이 "네온 발광 최소화 · 목재·철·가죽 물성"을
  못 박았다. 미니어처 보드게임 쪽이다. **§4의 3안 비교는 이 항목에 한해 종결됐다.**
  → P3의 빌트인 블룸은 예정된 부채였는데, **청산 시점이 앞당겨졌다** (발광 자체가 줄어든다).
- **색을 어디에 싣는가.** 세계관 §8: 몸체는 물성색, **병과 식별색은 군기·기치에만**,
  발광은 물리 광원(횃불·불화살)만. §2.6이 실측한 "종족색 탈색" 문제의 처방이기도 하다 —
  색을 몸 전체에 칠하는 대신 작고 채도 높은 깃발에 몰면 부감에서 더 잘 읽힌다.
- **외부 애셋 정책.** 세계관 §9: **CC0(Kenney·Quaternius)만.** 이 저장소는 공개라
  Asset Store EULA(원본 파일 재배포 금지)상 무료 팩도 커밋할 수 없다.
  소품(바위·나무·수풀)만 가져오고 **전력 유닛과 맵 타일은 자체 제작·절차적 생성을 유지**한다.
- **프로토타입 애셋 예외 (2026-07-13).** 타워 가독성·티어 구분을 먼저 측정하기 위해
  **Kenney Tower Defense Kit 원본을 임시 타워 애셋으로 사용**한다. 모델 변형과 최종 채택은
  이 실험 뒤에 결정하며, 현 단계에서는 원본 메시를 수정하지 않는다.
  - **구현:** `KenneyTowerCatalog`가 FBX를 직접 참조하고, 런타임에는 받침+무기를 조립한다.
    카탈로그 누락 시 기존 `LowPoly.Tower`로 폴백한다.
  - **병과:** 궁노=`weapon-ballista`, 보창=`weapon-cannon`, 공성=`weapon-catapult`,
    군략=`weapon-turret`.
  - **티어:** `wood-structure` → `tower-round-build-a` → `tower-round-build-c` →
    `tower-square-build-c` → `tower-square-build-f`.
  - **검증:** Play 모드에서 12기 생성·재편 후 남은 8기 모두 Kenney 받침/무기 생성 확인.
    동일 카메라 캡처에서 텍스처와 병과별 무기 실루엣이 렌더됨.

**미결:**
- HUD를 OnGUI에 둘지 UI Toolkit으로 옮길지 → §2.3, P6에서 판단.
- Unity MCP 도입 여부 → §5.

---

## 2. 기술 기반

이 절의 "확정"은 전부 1차 출처(Unity 공식 문서·URP 셰이더 소스·이 저장소 코드)로 확인했고,
**적대적 검증을 거쳐 원 조사의 주장 3개가 정정됐다.** 정정 내역을 명시한다.

### 2.1 렌더 파이프라인

| 사실 | 근거 |
|---|---|
| 빌트인 RP deprecation은 6.5에서 **시작**되지만, 6.7 LTS까지 제공되고 지원은 ~2028년(Enterprise ~2029). **확정 제거일 없음** | [Unity Render Pipelines strategy for 2026](https://discussions.unity.com/t/render-pipelines-strategy-for-2026/1710004) |
| 따라서 **URP 전환은 6.5 시점에 강제되지 않는다** | 위와 동일 |
| **빌트인 RP에서도 Bloom을 켤 수 있다.** 6.5 매뉴얼이 여전히 PPv2(`com.unity.postprocessing`)를 빌트인 RP 후처리 경로로 안내한다 | [Introduction to post-processing (6000.5)](https://docs.unity3d.com/6000.5/Documentation/Manual/PostProcessingOverview.html) |
| `Camera.OnRenderImage`는 6.5 스크립팅 API에 존재. **단 SRP(URP/HDRP)에서는 호출되지 않는다** — 빌트인 RP 전용 | [Camera.OnRenderImage (6000.5)](https://docs.unity3d.com/6000.5/Documentation/ScriptReference/Camera.OnRenderImage.html) |
| 현재 렌더는 빌트인 RP. `GraphicsSettings.asset`의 `m_CustomRenderPipeline: {fileID: 0}`, `manifest.json`에 URP 없음 | 저장소 |

> **정정 ①** — 원 조사는 "Bloom을 보려면 URP로 가야 한다"고 했다. **거짓이다.**
> 이 정정이 계획의 단계 순서를 바꿨다: URP 전환을 앞으로 당길 이유가 사라졌다.
>
> **다만 두 경로 모두 레거시다.** PPv2는 유지보수 패키지이고 URP와 호환되지 않는다.
> `OnRenderImage`는 SRP에서 죽는다. 즉 빌트인 Bloom은 **URP로 가기 전까지의 임시방편**이며,
> 나중에 URP로 가면 이 코드는 버려진다. 그 비용을 감수하고 앞단계에 둔다(P3 참조).

### 2.2 URP 전환 비용 — 예상보다 좁다

| 사실 | 근거 |
|---|---|
| URP/Lit의 메인 색은 `_BaseColor`, 광택은 `_Smoothness`(`_Metallic`·`_EmissionColor`는 동일). 구식 `_Color`·`_Glossiness`는 hidden 호환 프로퍼티라 **렌더에 영향 없음** | URP `Lit.shader` 소스 ([Unity-Technologies/Graphics](https://github.com/Unity-Technologies/Graphics)) |
| **그러나 `Material.color`는 URP/Lit에서 정상 동작한다** — `_BaseColor`에 `[MainColor]` 어트리뷰트가 붙어 매핑된다 | [Material.color (6000.5)](https://docs.unity3d.com/6000.5/Documentation/ScriptReference/Material-color.html), [SL-Properties](https://docs.unity3d.com/6000.5/Documentation/Manual/SL-Properties.html) |
| `UniversalRenderPipelineAsset.Create(rendererData)`는 public static이고 `#if UNITY_EDITOR`로 감싸여 있지 않다 — **런타임 호출 가능** | [URP 17 API 레퍼런스](https://docs.unity3d.com/Packages/com.unity.render-pipelines.universal@17.0/api/UnityEngine.Rendering.Universal.UniversalRenderPipelineAsset.html) |
| `GraphicsSettings.defaultRenderPipeline`에 코드로 대입하는 것은 공식 지원 | [Setting the render pipeline asset (6000.5)](https://docs.unity3d.com/6000.5/Documentation/Manual/srp-setting-render-pipeline-asset.html) |
| Unity 6000.5 번들 URP는 `com.unity.render-pipelines.universal` **17.5** | [6000.5 URP 매뉴얼](https://docs.unity3d.com/6000.5/Documentation/Manual/com.unity.render-pipelines.universal.html) |

> **정정 ②** — 원 조사는 "URP는 .asset 2개가 사실상 필수이고, 런타임 `CreateInstance`는
> `rendererDataList`가 비어 `CreatePipeline()`이 실패한다"고 했다. **반증됐다.**
> `Create()` 팩토리가 정확히 그 리스트를 채워 준다.
>
> **하지만 결론은 바뀌지 않는다.** `Create()`는 내부에서 `ResourceReloader.ReloadAllNullIn`
> (AssetDatabase 의존 = 에디터 전용)을 호출한다. 에디터에서는 완전히 돌지만 스탠드얼론
> 빌드에서는 셰이더 참조가 URP Global Settings(빌드 시 베이크)에서 와야 한다.
> **→ .asset 2개를 커밋하는 것이 여전히 옳다. 단 "API가 강제해서"가 아니라 "빌드가 안전해서"다.**
>
> **정정 ③** — 원 조사는 "`Material.color` 세터가 URP/Lit에서 무시된다"고 했다. **틀렸다.**
> 고쳐야 할 것은 하드코딩된 문자열 `SetFloat("_Glossiness", ...)`(`GameView.cs:677,689`)뿐이고,
> `new Material(shader){ color = c }`는 그대로 동작한다. **전환 비용이 "프로퍼티 접근 전면 수정"에서
> "문자열 두 개 교체"로 줄었다.**

**URP 전환 시 실제로 깨지는 것:**
- `Shader.Find("Standard")` 기반 머티리얼 → 마젠타. `Universal Render Pipeline/Lit`로 교체 필요
  (`GameView.cs:116-120, 675-691`).
- `SetFloat("_Glossiness")` → `_Smoothness`로 (`GameView.cs:677,689`).
- `Sprites/Default`는 URP에서 렌더된다(트레일·링·HP바·파티클이 이걸 직접 할당하므로 상대적으로 안전).
  단 LineRenderer 환경별 미렌더 사례가 보고돼 있어 **URP/Unlit 명시 교체가 안전**하다.
- OnGUI(IMGUI)는 SRP와 독립적으로 그려지므로 **URP에서 그대로 동작한다.**
- 레거시 `TextMesh`의 URP 렌더 여부는 **미확인** — 실측 필요.

### 2.3 한글 폰트 — 진짜 급소

| 사실 | 근거 |
|---|---|
| Unity 기본 폰트는 에디터에서 OS 폰트를 잡아 한글이 보이지만, **빌드에서는 ASCII만** 남는다. 폴백 폰트 Liberation Sans는 라틴만 포함 | [Customize IMGUI controls](https://docs.unity3d.com/Manual/gui-Customization.html), [class-Font](https://docs.unity3d.com/2021.2/Documentation/Manual/class-Font.html) |
| `GUIStyle.font`에 커밋한 `Font` 에셋을 대입할 수 있다 | [GUIStyle.font (6000.5)](https://docs.unity3d.com/6000.5/Documentation/ScriptReference/GUIStyle-font.html) |
| `TextMesh.font`도 동일 | [class-TextMesh (6000.5)](https://docs.unity3d.com/6000.5/Documentation/Manual/class-TextMesh.html) |
| 다이내믹 폰트는 요청 글리프를 런타임에 아틀라스로 채운다 — **소스 폰트가 그 글리프를 담고 있어야만** 한다 | [Create meshes from text strings (6000.5)](https://docs.unity3d.com/6000.5/Documentation/Manual/create-meshes-text-strings.html) |
| `TextMesh`는 "Legacy / limited functionality"로 표기. **"deprecated"라는 단어는 문서에 없다** | 위와 동일 |
| `TMP_FontAsset.CreateFontAsset(font)`로 **런타임에** 다이내믹 FontAsset 생성 가능 | [TMP_FontAsset API](https://docs.unity3d.com/Packages/com.unity.ugui@2.0/api/TMPro.TMP_FontAsset.html) |

**결론: HUD를 OnGUI에 두든 UI Toolkit으로 옮기든, 한글 .ttf 커밋은 무조건 해야 한다.**
전환이 폰트 문제를 대신 풀어 주지 않는다.

### 2.4 UI Toolkit — 유혹과 한계

USS가 **지원하는 것**: `border-radius`, `transition`, `transform`/`scale`/`rotate`, `opacity`,
반투명 배경, `filter: blur()`.
USS가 **지원하지 않는 것**: `box-shadow`, `drop-shadow` 필터, `backdrop-filter`, 배경 `linear-gradient`.

> 출처: [USS built-in filters (6000.5)](https://docs.unity3d.com/6000.5/Documentation/Manual/ui-systems/built-in-filters.html),
> [USS Properties Reference (6000.5)](https://docs.unity3d.com/6000.5/Documentation/Manual/UIE-USS-Properties-Reference.html)

즉 **"패널 뒤 게임플레이를 프로스티드로 블러하는" 정통 글래스모피즘은 네이티브로 불가능하다.**
반투명 + 둥근 모서리 + 요소 자체 블러 + 트랜지션까지가 상한이다.

`PanelSettings`는 ScriptableObject라 런타임 생성이 기술적으로 가능하나, 공식 워크플로는 에셋이다.
UI Toolkit에서도 한글은 `PanelTextSettings` + FontAsset 폴백 목록을 구성해야 나온다.

**OnGUI의 상한**: 커스텀 `Texture2D` 배경, `GUI.backgroundColor`, 상태별 GUIStyle, 커스텀 폰트,
9-slice로 둥근 모서리 흉내까지는 된다. 넘을 수 없는 벽은 **트랜지션·transform·블러·실제 그림자**다.
즉시모드라 구조적으로 없다.

### 2.5 Unity MCP 실증 결과 (2026-07-10, 이 저장소에서 직접 확인)

`CoplayDev/unity-mcp`를 붙여 **실측했다.** 조사의 미확인 두 건이 해소됐고, 새 제약 하나를 발견했다.

| 확인된 사실 | 근거 |
|---|---|
| **Unity 6.5(6000.5.3f1)에서 게임뷰 캡처가 인라인 base64 PNG로 돌아온다.** `manage_camera(action=screenshot, include_image=true)` | 실측 — 이 세션에서 5장 캡처 |
| `view_position`/`view_target`으로 임의 시점 캡처도 된다 | 실측 |
| `execute_code`로 Play 중인 `GameView.Game`에 리플렉션 접근해 상태를 조작할 수 있다 | 실측 (자원·라운드·보스 주입) |
| **⚠ 에디터가 포커스를 잃으면 Play 모드 프레임이 진행되지 않는다.** Play 진입 후 `Time.frameCount == 3`에서 멈췄다. `Application.runInBackground = true`도, `EditorApplication.QueuePlayerLoopUpdate()`도 이를 되돌리지 못했다 | 실측 |
| 결과적으로 **`PopScale`이 `Awake`에서 `localScale = 0`으로 두고 `Update`에서 키우므로**(`GameViewFx.cs:24-27`), 비포커스 상태에서 새로 생성된 타워·몹은 **전부 스케일 0으로 보이지 않는다** | 실측 — 타워 18기 중 24개 오브젝트가 zeroScale |
| MCP 도입으로 `unity/Packages/manifest.json`에 `com.coplaydev.unity-mcp` git 의존성이 추가된다. 캡처는 `unity/Assets/Screenshots/`에 쌓인다(→ `.gitignore` 처리함) | 저장소 |

**함의:** MCP 캡처는 **정적 스냅샷 도구**다. "게임을 돌려 놓고 흘러가는 화면을 관찰"하는 용도로는
쓸 수 없다 — 사람이 에디터 창에 포커스를 줘야 게임이 흐른다. 시각 검증 루프는
`execute_code`로 원하는 상태를 **주입한 뒤** 캡처하는 방식으로 짜야 한다. `PopScale`처럼
`Update`에 의존하는 연출은 캡처 전에 강제 완료시켜야 한다.

### 2.6 실측으로 드러난 것 — 감사가 놓친 발견

R41 · 타워 18기 · 보스 1기 상태를 주입해 캡처한 결과:

- **코드의 딥네이비 팔레트가 화면에 재현되지 않는다.** `BG #090c16`·`BOARD #101526`으로 적혀 있지만
  실제 화면은 회청색이다. `AmbientMode.Flat`(0.30, 0.33, 0.46) + Directional 1.15가 어두운 색을
  씻어냈다. **→ "네온 방향이 현행과 가장 가깝다"는 §4의 전제는 코드상 사실이지 화면상 사실이 아니다.**
- **종족색이 파스텔로 탈색된다.** `RACE_COLOR`는 `#4ea3ff`·`#c065e0`·`#ffd23f`·`#6fdc8c`로 진하지만
  화면에서는 채도가 죽어 서로 비슷하게 보인다.
- **영웅이 흰 구체로 보인다.** `HERO #b08cff` 보라인데 emission 1.1이 색을 날렸다.
- **타워 18기의 티어를 구분할 수 없다.** 크기 차이가 미미하고 라벨이 없다. GOD이 어디인지 모른다.
- 문(입구·출구)은 흰색·노란색 작은 조각이라 서로 구분되지 않는다.

이 발견들은 §0의 감사 결과를 뒤집지 않고 **강화한다.** 다만 P2의 우선순위를 바꾼다 —
**조명·앰비언트 재조정이 팔레트 문제의 근원**이므로 가장 먼저 손대야 한다.

### 2.7 여전히 미확인

| 미확인 | 확인 방법 |
|---|---|
| 레거시 `TextMesh`가 URP에서 정상 렌더되는가 | P5 착수 시 에디터 실측 |
| 데스크톱 스탠드얼론에서 기본 폰트가 한글을 렌더하는가 | 신뢰 불가로 간주하고 폰트 커밋 (P1). **에디터에서는 렌더됨을 실측 확인** — 정확히 이것이 위험 신호다 |
| `UIDocument.rootVisualElement`에 UXML 없이 코드로만 트리 구성 — 공식 문서 직인용 근거 미확보 | P6 착수 시 |

---

## 3. 단계별 계획

원칙: **각 단계는 독립 커밋 가능하고, 그 단계만으로 화면이 눈에 띄게 좋아진다.**
"기반 공사 3단계 후 아무것도 안 보임"은 실패한 계획이다.

시각 감사가 찾은 **high impact · low effort** 항목이 P1~P2에 모여 있다 — 전부 URP도 에셋도 필요 없다.

### 트랙 A — 공통 기반 (아트 방향과 무관, 프리뷰 결정 전)

#### P0. 시각 검증 루프 확보 · 규모 S · **✅ 완료 (2026-07-10)**
- **목표:** 스크린샷을 보면서 고칠 수 있게 만든다. 이게 없으면 이후 모든 단계가 눈 감고 하는 작업이다.
- **결과:** Unity MCP(`CoplayDev/unity-mcp`) 도입, **6.5에서 게임뷰 인라인 캡처 확인**(§2.5).
  `execute_code` + 캡처로 임의 게임 상태를 렌더해 보는 루프가 열렸다. 이 루프로 §2.6을 발견했다.
- **남은 일:** `UnityEngine` 스텁을 `/tmp/godtd-verify/`에서 저장소로 옮겨 커밋 (아직 미수행).
- **알려진 제약:** 에디터 비포커스 시 프레임이 안 돈다 → 상태 주입 후 정적 캡처 방식으로 쓴다.
  `PopScale` 같은 `Update` 의존 연출은 캡처 전 강제 완료 필요.

#### P1. 한글 폰트 커밋 — 빌드 급소 제거 · 규모 S · **착수 (2026-07-12, TMP로 — HUD 재설계 §3과 통합)**
- **목표:** 스탠드얼론에서 한글이 깨지는 버그를 없애고, 첫 에셋을 커밋해 에셋 파이프라인을 연다.
- **파일:** `GameHud.cs`(`EnsureStyles`의 모든 GUIStyle에 `.font`), `GameViewFx.cs`(`UiFont()` 교체).
- **새 에셋:** OFL 한글 폰트 1종 → `Assets/Art/Fonts/`. 빈 씬 `Assets/Scenes/Main.unity`.
  `.gitignore`가 `Library/`를 제외하는지 확인, 신규 `.meta` 커밋.
- **완료 판정:** (기계) 스텁 빌드 0에러, `.meta` 커밋됨. (사람) **빌드에서** 한글 렌더 확인.
- **왜 최전방인가:** 타이포는 디자인 품질의 축이고, 이건 버그다. RP·아트 방향과 완전히 독립.

#### P2. 저비용 고효과 묶음 — 조명·라벨·연출·HUD · 규모 M · 의존 P1(선택)
감사가 찾은 high-impact/low-effort를 한 덩어리로. **에셋 0, URP 0, 코드만.**
순서는 §2.6 실측을 반영해 조정했다 — **앰비언트·조명이 팔레트 탈색의 근원이므로 맨 앞.**
- **① 앰비언트·조명 재조정 (근원 처방).** `AmbientMode.Flat`(0.30,0.33,0.46) → `Trilight`로 낮추고,
  Directional 1.15를 재조정 (`GameView.cs:263`). 코드의 딥네이비·종족색이 화면에 살아나야 한다.
  **완료 판정: 캡처한 화면의 `BOARD` 픽셀이 `#101526`에 근접하고, 종족 4색이 서로 구별된다.**
- **발광체에 실제 광원.** GOD 타워·보스·문에 영웅과 같은 Point Light(range 5~8, intensity 1~2)를
  자식으로 추가 (`GameView.cs:407, 480, 562`). 빛이 바닥에 번져 즉시 씬이 살아난다.
  단 영웅의 emission 1.1이 보라를 흰색으로 날리고 있으니(§2.6) **강도를 낮추고 색을 되살린다.**
- **인월드 라벨 복원.** `GameViewFx`의 `TextMesh` 빌보드 인프라를 재사용해 타워 티어 숫자(GOD='G'),
  입구/출구, 제단 라벨을 되살린다. **웹에 있던 정보를 되찾는 것이다** (`render.ts:39,43,93,128`).
- **가산 블렌드 파티클.** 현재 `Sprites/Default` 알파 블렌드 흰 사각형이라 폭발이 에너지가 아니라
  회색 파편으로 읽힌다 (`GameViewFx.cs:180,537`). SrcAlpha/One 블렌드 + 코드 생성 원형 그라데이션 텍스처.
- **필·림 라이트.** `AmbientMode.Flat` → `Trilight`, 태양 반대편에 저강도 차가운 필 Directional
  (`GameView.cs:263`). 40+ 유닛의 실루엣이 어두운 판에서 분리된다.
- **스크린 셰이크 + 히트스톱.** 보스 사망(`GameView.cs:541`)·GOD 조합(`:472`)에 이미 훅이 있다.
  `camFocus`에 감쇠 노이즈, `Time.timeScale` 0.05→1 복귀.
- **접지 그림자 블롭.** 동적 유닛 아래 반투명 원형 쿼드. 유닛이 판에 붙는다.
- **HUD 의미론적 색.** `GUI.backgroundColor`를 기능군별로(생성=청, 가스=녹, 보스=적, 판매=회색),
  커스텀 GUIStyle에 padding·비활성 dim 색 (`GameHud.cs:59`).
- **완료 판정:** (기계) 스텁 빌드 0에러. (사람) 동일 카메라 프레임 before/after 스크린샷.

#### P3. 빌트인 RP Bloom — 임시방편 · 규모 M · 의존 P2
- **목표:** URP 없이 발광을 발광으로 보이게 한다. §2.1 정정 ①로 가능해진 단계.
- **방법:** PPv2 패키지 또는 `OnRenderImage` 기반 밝기 임계 블러.
- **⚠ 명시적 기술 부채:** 두 경로 모두 레거시이며 **URP로 가면 버려진다**(`OnRenderImage`는
  SRP에서 호출조차 안 된다). 그럼에도 앞에 두는 이유는 P4 프리뷰의 충실도 때문이다 —
  Bloom 없이 세 방향을 비교하면 잘못된 선택을 하게 된다.
- **대안:** P5(URP)를 P4 앞으로 당기고 P3를 건너뛴다. 되돌리기 어려운 전환을 먼저 하는 대신
  버릴 코드를 안 쓴다. **승인 시 이 트레이드오프를 결정해야 한다.**

#### P4. 프리뷰 쇼케이스 — 3안 프로파일 토글 · 규모 M · 의존 P3
- **목표:** 세 방향을 런타임 전환 가능한 프로파일(팔레트 + 라이트 리그 + 머티리얼 파라미터)로
  만들어 **사용자가 엔진 안에서 토글하며 고른다.** 결정 2의 실행 도구.
- **새 파일:** `View/ArtProfiles.cs`. `GameView`가 팔레트·라이트를 프로파일에서 주입받도록 소폭 리팩터.
- **완료 판정:** 키 하나로 3안 전환. **사용자가 이 화면을 보고 방향을 고를 수 있으면 완료.**
- **참고:** 브라우저 근사 프리뷰는 이미 있다 → [아트 방향 3안 쇼케이스](https://claude.ai/code/artifact/688d4d14-e924-46ca-983a-1f4940b2261e)
  (캔버스 근사일 뿐 유니티 렌더가 아니다. 팔레트·실루엣·시선 유도 판단용).

### 트랙 B — 방향 결정 후

#### P5. URP 전환 · 규모 L · 의존 P4 결정 · **되돌리기 어려움**
- **선행 게이트:** ①롤백 태그 생성. ②`TextMesh`의 URP 렌더 실측(§2.5). ③스텁에 
  `UnityEngine.Rendering.Universal` 추가.
- **할 일:** URP 17.5 패키지, `URP-Pipeline.asset` + `URP-Renderer.asset` 커밋
  (§2.2 정정 ②대로 API 강제는 아니나 빌드 안전을 위해), `Shader.Find("Standard")` →
  `Universal Render Pipeline/Lit`, `_Glossiness` → `_Smoothness`, `Sprites/Default` → URP/Unlit,
  P3의 빌트인 Bloom 코드 제거 후 Volume으로 대체.
- **완료 판정:** (사람·필수) **마젠타 없음.** 발광체에 Bloom. 프레임률 유지.

#### P6. 선택 방향 심화 · 규모 L · 의존 P5
머티리얼 저작·메시·UI 스킨·팔레트를 프로덕션 품질로. 방향에 따라 크게 갈린다(§4).
UI Toolkit 전환 여부는 여기서 판단한다 — §2.4의 한계(box-shadow·backdrop-filter 부재)를 감안해서.

---

## 4. 아트 방향 3안

| | 네온 디오라마 | 미니어처 보드게임 | 종족 시각 언어 |
|---|---|---|---|
| 핵심 | 발광 홀로그램, 젖은 바닥 반사 | 유리 진열장 속 실물 보드게임 | 4종족을 물성으로 분화 |
| 현행에서의 거리 | **가장 가깝다** (팔레트 이미 일치) | 멀다 (따뜻한 팔레트·물성) | 가장 멀다 (메시 4벌) |
| 지오메트리 | 프리미티브 + 실루엣 다듬기 | 실물 말 실루엣 (부분 메시) | 종족별 메시 키트 |
| 머티리얼 | 무광 흡수 + 발광체 대비 | PBR 3종 + 디테일 노멀 | 종족 4종 물성 |
| 후처리 의존 | Bloom · SSR | DoF · SSAO · Grain | Bloom · SSAO |
| 비용 | medium | high | high |
| 위험 | 차별화 약함. Bloom 과용 시 가독성 뭉갬 | 텍스처 저작량. DoF가 후반 가독성 저해 | 아트 4벌의 작업량. 색 충돌. IP 톤 |
| 레퍼런스 | Rez, Tron: Legacy | Hitman GO, Bad North | StarCraft II, Dawn of War II |

**세 방향의 하부 공사(P0~P3)는 동일하다.** 갈리는 것은 팔레트·물성 저작량·메시 유무뿐이다.
팔레트 hex 10종과 조명·머티리얼 사양은 [쇼케이스](https://claude.ai/code/artifact/688d4d14-e924-46ca-983a-1f4940b2261e)에 담았다.

---

## 5. 검증 전략

**방법론적 전환을 먼저 인정한다.** Core 동기화는 헤드리스 시뮬레이션(시드 봇 R76 완주)으로
완전 검증됐다. **뷰 작업은 그렇게 검증되지 않는다** — 렌더 결과·Bloom·물성·프레임률은
헤드리스로 못 본다. 그래서 각 단계의 완료 판정을 둘로 쪼갰다.

**기계로 검증 가능 (에디터 없이):**
- `dotnet build`로 Core 컴파일 — 기존대로.
- `UnityEngine` API 스텁으로 View 문법·타입 체크. **단 스텁을 먼저 커밋해야 한다**(P0).
- `.meta`/GUID 커밋 여부, `Library/` 미추적.

**사람·에디터 필수 (기계로 불가):**
- 실제 렌더, 후처리 출력, 마젠타 부재, 셰이더 컴파일, 프레임률.
- **빌드에서의 한글 렌더** (P1의 핵심 판정 — 에디터에서는 통과하고 빌드에서 깨지는 종류의 버그다).
- P4는 그 자체가 사람 판정이다.

**판정 도구 — Unity MCP 캡처 루프 (P0에서 확보 완료):**

1. `manage_editor(play)` → Play 모드 진입
2. `execute_code`로 원하는 상태를 주입 (자원·라운드·타워·보스). 리플렉션으로 `Game`의 필드 접근
3. **`PopScale`을 강제 완료시킨다** — 비포커스라 `Update`가 안 돌아 새 오브젝트가 스케일 0이다(§2.5)
4. `manage_camera(screenshot, include_image=true, view_position=..., view_target=...)`
5. `manage_editor(stop)`

고정 프레임(`view_position=[21,24,-44]`, `view_target=[21,0,-25]`)을 단계마다 before/after로 남긴다.
`unity/Assets/Screenshots/`는 `.gitignore` 처리했다.

**이 루프로 확인할 수 없는 것:** 움직이는 연출(파티클 궤적·투사체·히트스톱·스크린셰이크)과
프레임률. 에디터 프레임이 안 돌기 때문이다. **이것들은 사람이 에디터에 포커스를 주고 봐야 한다.**
P2의 셰이크·히트스톱 항목이 여기 걸린다 — 계획에 명시해 둔다.

---

## 6. 리스크와 롤백

- **URP 전환 실패 (P5).** 가장 큰 위험. 착수 전 빌트인 RP 상태를 태그로 고정.
  실패 판정 = 마젠타, 셰이더 컴파일 실패, 프레임 급락. **P1~P4는 URP와 독립이라 롤백해도 살아남는다.**
- **P3의 기술 부채.** 빌트인 Bloom 코드는 URP 전환 시 버려진다. 의도된 낭비이며,
  P4 프리뷰의 충실도와 맞바꾼다. 승인 시 재검토 대상.
- **폰트 라이선스·글리프 누락 (P1).** OFL 폰트를 기본으로. 폰트가 막혀도 P1은 씬 커밋·위생
  확립만으로 독립 커밋 가치가 있다.
- **성능.** Bloom·다수 Point Light는 후반 넓은 판 + 다수 몹에서 프레임을 갉는다.
  **측정 없이 값 조정 금지**(프로젝트 원칙). 최악 시나리오(보스 Lv6 + 다수 몹)에서 측정.
- **Unity MCP 미동작 (P0).** 6.5 지원이 문서로 확인되지 않았다. 실패 시 수동 스크린샷으로 강등,
  계획은 그대로 진행된다.

---

## 7. 하지 않는 것 (명시적 비목표)

- **Core 수정 금지.** `unity/Assets/Scripts/Core/`는 `web/src`의 1:1 미러다. View/만 바꾼다.
- **웹 렌더러(`web/src/render/`, `web/src/ui/`) 변경 금지.** 이 작업은 Unity 뷰 한정이다.
- **게임 로직·밸런스 수치 변경 금지.**
- **런타임 코드 조립을 갈아엎지 않는다.** `Bootstrap`의 코드 생성 씬은 잘 작동한다.
  "에셋 0 폐기"를 "프리팹 전면 이관"으로 오독하지 않는다 — 자산이어야만 하는 것만 에셋화한다.
- **방향별 저작(메시·물성·UI 스킨)을 P4 결정 전에 시작하지 않는다.**
- **§2.5의 미확인을 확정처럼 쓰지 않는다.**

---

## 진행 기록

| 날짜 | 내용 |
|---|---|
| 2026-07-10 | 계획 수립. 시각 감사 + URP/UI 조사 후 적대적 검증으로 주장 3건 정정(§2.1·§2.2). 아트 3안 브라우저 프리뷰 게시. |
| 2026-07-10 | Unity MCP 도입, **P0 완료**. 6.5 게임뷰 캡처 실증(§2.5). 에디터 비포커스 시 프레임 정지 제약 발견. R41·타워 18기 상태를 주입해 캡처 → **팔레트 탈색·종족색 소실·티어 구분 불가를 실물로 확인**(§2.6). P2 순서를 조명 우선으로 조정. **승인 대기.** |
| 2026-07-12 | **월드 로우폴리 1차 — 프리미티브 로스터 전면 교체.** HUD 시각 스킨 완료 후에도 "여전히 프로토타입 같다"는 피드백. 씬 인벤토리를 뽑아 원인 확정: `Sphere×24 + Cube×91 + Quad×48`, **커스텀 메시 0 · 텍스처 0** — 전부 `CreatePrimitive`. 로우폴리 스타일이 아니라 플레이스홀더였다. 구현: `LowPolyLit.shader`(정점색 알베도 + 플랫셰이딩 + 림라이트 + **정점 알파=발광 마스크**) / `LowPoly.cs`(부품 빌더 + 레시피). 유닛 하나 = 메시 하나 = **드로우콜 하나**(파트별 머티리얼 분리 없이 색을 정점에 굽는다). 크립 120tri(구체는 768tri). 로스터: 잡몹·사냥꾼·보스·영웅·타워 4종족×티어·GOD. 타워 조형은 **HUD 종족 아이콘과 같은 언어**(테란 프레임·저그 발톱·플토 결정·크리쳐 세포) — UI와 월드를 한 세계로 묶는다. 적은 경로 접선으로 **진행 방향을 바라본다**(구체는 앞이 없었다). |
| 2026-07-13 | **타워를 SD 병사로 재조각 + Tripo3D 생성 실험(2회, 채택 안 함).** 진지·병기 덩어리로 만든 1차 타워가 부감에서 "나무 상자 더미"로 읽혀 폐기하고, **병과별 대표 병사 1기(SD)** 로 전환했다. 캡처가 잡아낸 버그 3건: ①**모든 병사가 카메라에 등을 돌리고 있었다** — 메시 정면이 +Z인데 게임 카메라도 +Z를 본다. 병기(쇠뇌·대방패·포신)가 전부 안 보였다 → `BuildTowerBody`에 Y 180° 회전. ②티어 라벨이 가슴에 박혔다(메시를 밑면 기준으로 바꿨는데 라벨 오프셋은 중심 기준 그대로였다). ③깃발이 몸보다 커서 병사를 덮었다. **SD의 정의를 틀렸던 것도 캡처로 잡았다** — 1차는 머리 0.30 · 몸통 0.36으로 **머리가 더 좁아** 캐릭터가 아니라 상자 기둥으로 읽혔다. SD는 "작다"가 아니라 **머리가 몸통보다 넓다**이다 (현재 0.44 vs 0.30). |
| 2026-07-13 | **Tripo3D 텍스트→3D 실험 — 2회 생성, 채택 안 함.** 1차 프롬프트가 스스로를 배신했다: `chibi/SD`라고 해놓고 `Qin dynasty`·`lamellar`·`chu-ko-nu` 같은 **고증 어휘**를 깔아 사실적 레퍼런스를 끌어왔다. 결과는 **거대 투구 돔이 얼굴·팔·쇠뇌를 전부 삼킨 "버섯"**(6면 오빗 캡처로 확인 — 어느 각도에서도 병기가 안 보였다). 원인은 전부 프롬프트의 특정 단어였다: ①`small crossbow` — **SD에서 병기는 과장되게 커야** 90px에서 읽힌다. 정반대를 지시했다. ②`head as big as the whole body` — 모델이 머리 대신 **투구**를 키웠다. ③얼굴 노출을 명시하지 않았다. 고친 프롬프트로 뽑은 2차도 활 파지가 어색해 채택하지 않았다. **남은 구조적 문제(조형과 무관):** 출력이 스무스 셰이딩이고(6,818tri, vert/tri=0.92) 회색이라, 플랫셰이딩·물성 팔레트와 둘 다 안 맞는다 → 쓰려면 **Blender 후처리(Shade Flat + 데시메이트 + 정점색 베이크)가 16~40종 전부에 필수**다. **결론: 현행 출하 경로는 절차적 SD(`LowPoly.cs`).** Tripo FBX 2점은 `Assets/Art/Tripo/`에 근거로 남기되 씬에서 쓰지 않는다. |
| 2026-07-13 | **폴리곤 예산 — 측정으로 확정.** 게임 카메라(거리 43, FOV 42°)에서 타워 1기는 **1080p 기준 87×92px**다 (1440p 116×123 · 4K 174×185). 현행 절차적 메시는 306tri. **5,000tri는 필요량의 5~10배**이며 삼각형 절반이 서브픽셀이 된다 — 실루엣을 뭉갤 뿐이다. **적정 500~1,500tri.** 그리고 실제 비용은 삼각형이 아니라 **드로우콜**이다: 현행은 정점색을 구워 전 유닛이 머티리얼 1개를 공유하지만, 임포트 에셋은 각자 텍스처·머티리얼을 들고 온다(80+ 드로우콜). Kenney CC0 소품도 같은 문제를 갖는다. |
| 2026-07-13 | **세계관 확정 → 아트 방향 결정, 로스터 재조각 착수.** [세계관 문서](../design/worldbuilding.md)가 초한지(진말·초한전쟁) 대체역사로 확정되면서 §1의 미결 "아트 방향 3안"이 **네온 디오라마 탈락**으로 종결. 검토에서 구멍 3개를 메웠다: ①병과는 `race` 축이고 전투 태그는 **직교하는 별개 축**(군략만 태그가 섞인다 — 코드 확인). ②**적이 정의돼 있지 않았다** — 현행 메시는 뿔 달린 갑각 괴수라 세계관 §3과 정면 충돌. `WAVE_TYPES`(일반/사냥꾼)+보스를 **보병/기병/적장**으로 1:1 치환. 사냥꾼=기병은 연출이 아니라 사양이다(접촉 피해 ×6·영웅 전담). ③**§8 물성 팔레트가 §2.6의 가독성 실측과 충돌** → 색을 몸에서 **군기**로 옮겨 해소. 명장은 부대 없이 **인물+군기+토단**(타일 발자국 2.2 < Lv4의 2.3이라 부대원을 넣으면 뭉개진다). 애셋: 저장소가 공개라 **Asset Store EULA상 무료 팩도 커밋 불가** → CC0(Kenney·Quaternius) 소품만, 타일은 절차적 유지. |
| 2026-07-12 | **측정이 뒤집은 판단 2건 (기록해 둔다 — 눈으로 판단하면 또 틀린다).** ① *실루엣은 카메라에 종속된다.* 옆에서 본 실루엣(엄니·주둥이)으로 조각했더니 **55° 부감**에서는 등판만 보여 상자 덩어리로 읽혔다. 부감의 단서는 셋뿐 — 위에서 본 발자국(→가시를 **옆으로**), 수직 높이(→등뿔), 바닥과의 명암 대비(→발광 눈). ② *"팔레트가 뭉개져 대비가 없다"는 진단은 **틀렸다**.* 픽셀 실측: 타일 61 · 흰 구체 **184** — 구체는 이미 3배로 튀고 있었다. 대비를 죽인 건 팔레트가 아니라 **내가 갑각을 어둡게 눌러(92) 배경에 묻히게 만든 것**. 유닛은 보드보다 밝아야 한다는 기존 팔레트 설계가 옳았다. 최종: 크립 등판 160 · 몸통 142 · 눈 218 — 구체(152)와 같은 가독성 대역. |
