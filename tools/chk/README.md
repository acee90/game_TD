# CHK 추출 도구

스타크래프트: 브루드워 유즈맵(`.scx` = MPQ 아카이브)에서 시나리오 데이터(`staredit\scenario.chk`)를
꺼내 사람이 읽을 수 있는 JSON/텍스트로 덤프한다. `docs/reference/god-td-x-vz056-map-analysis-v1.0.md`가
이 도구의 출력만을 근거로 작성되었다.

## 설치

```bash
brew install stormlib     # PKWARE implode 압축을 푸는 데 필요 (mpyq로는 안 됨)
```

## 사용

```bash
./fetch_map.sh hVdqGx49 out_gtdx     # 갓 타워 디펜스X VZ056
```

`scmscx.com`의 맵 ID는 맵 상세 페이지 URL 끝부분이다 (`https://scmscx.com/map/hVdqGx49`).

## 산출물

| 파일 | 내용 |
|---|---|
| `map.scx` | 원본 MPQ 아카이브 |
| `scenario.chk` | 추출된 시나리오 청크 |
| `map.json` | DIM/ERA/OWNR/SIDE/FORC, 로케이션, 배치 유닛, UNIx 유닛 스탯, UPGx 업그레이드 |
| `mtxm.json` | 128×128 지형 타일 ID 격자 |
| `strings.json` | STRx 문자열 전체 |
| `triggers.txt` | TRIG 섹션을 사람이 읽는 형태로 디코드 |
| `triggers.json` | 같은 내용의 구조화 버전 |

## 파서가 지키는 두 가지 규칙

**1. 트리거는 첫 종료 슬롯에서 자른다.** 트리거 하나는 고정 2,400바이트(조건 16칸 × 20B +
액션 64칸 × 32B + 실행 플래그)다. 갓타디는 EUD 맵이라(`set_death_euds=409`) 종료 슬롯 뒤의
빈 칸에 EUD 페이로드가 채워져 있다. 이걸 액션으로 읽으면 존재하지 않는 게임 로직이 만들어진다.
VZ056 기준으로 종료 슬롯 이후에 3,063바이트의 비영(非零) 값이 있고, 실제 액션은 3,501건뿐이다.

**2. 문자열은 UTF-8로 읽는다.** cp949가 아니다.

## 읽을 때 주의

- `unit_settings`의 `usesDefault=1`인 유닛은 hp/armor/cost가 **무시**되고 스타크래프트 기본값이
  적용된다. 그 수치를 스탯으로 인용하면 안 된다.
- 액션 opcode는 0~59, 조건 opcode는 0~23만 유효하다. 그 밖의 값(`A225`, `C63` 등)은 EUD 데이터이며
  게임플레이 의미가 없다.
- `SetDeaths`의 플레이어 번호가 12를 넘거나 값이 수백만이면 EUD 메모리 조작이다.
