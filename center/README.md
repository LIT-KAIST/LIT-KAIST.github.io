# I²SAC 센터 사이트 — 이전 준비본

LIT 사이트의 I²SAC 페이지(`i2sac.html`)를 **센터 독립 사이트로 옮길 때 쓰는 준비본**입니다.
빌드 도구 없는 정적 사이트라서, 이 폴더 **안의 파일들**을 새 저장소 맨 위에 그대로 올리면 동작합니다.

## 지금 상태

- 실제로 운영 중인 페이지는 아직 **LIT 사이트의 `i2sac.html`** 입니다.
- 이 폴더도 LIT 저장소 안에 있어서 `lit.kaist.ac.kr/center/` 로 미리 볼 수 있습니다.
  검색엔진에는 LIT의 `robots.txt` 로 제외해 두었습니다.
- 두 곳은 **따로 관리**됩니다. 옮기기 전에 LIT 쪽에서 바뀐 내용(참여연구원, 문구 등)이 있으면 이 폴더에도 반영하세요.

## 구성

```
index.html                 페이지 전체 (센터 개요 · 연구 목표·기간 · 연구 내용·체계 · 참여연구원)
data/i2sac_members.csv     참여연구원 (교수·기업)
assets/css/style.css       LIT 스타일 중 필요한 부분 + 로고 파란색 고정 색
assets/js/                 csv.js(CSV 읽기) · i18n.js(한/영) · reveal.js(스크롤 효과) · i2sac.js(참여연구원·타임라인) · site.js(푸터·맨 위로)
assets/img/                logo.svg(전체 로고) · mark.svg(헤더용) · favicon · scenario.png · partners/ · people/
.nojekyll                  GitHub Pages 가 파일을 가공하지 않게 하는 빈 파일
```

## 옮기는 순서

1. GitHub에서 센터용 계정(또는 조직)과 저장소를 만듭니다.
   저장소 이름을 `<계정>.github.io` 로 하면 `https://<계정>.github.io` 로 공개됩니다.
2. 이 폴더 **안의 파일들**(폴더 자체가 아님)을 저장소 맨 위에 복사해 커밋·푸시합니다. `.nojekyll` 도 같이.
3. 저장소 **Settings → Pages** 에서 Branch `main`, 폴더 `/ (root)` 를 고릅니다.
4. (선택) 자체 도메인: KAIST에 `i2sac.kaist.ac.kr` 같은 도메인을 신청하고, 저장소 맨 위에 도메인 한 줄만 적은 `CNAME` 파일을 둡니다.
5. 주소가 정해지면
   - `index.html` 의 `<head>` 에 `<link rel="canonical" href="새 주소">` 와 `og:url` 을 추가
   - 저장소 맨 위에 `robots.txt`, `sitemap.xml` 추가
6. LIT 사이트 정리 (같은 내용이 두 곳에 남지 않게)
   - 모든 페이지 상단 메뉴의 I²SAC → 새 주소로
   - `i2sac.html` → 새 주소로 넘어가는 페이지로 교체 (기존 링크·검색 결과 유지)
   - LIT 저장소의 `center/` 폴더 삭제, `robots.txt` 의 `Disallow: /center/` 줄 삭제

## 공개 전에 확인할 것

- **푸터 연락처**: 지금은 센터장 메일과 학부 주소입니다. 센터 사무실이나 대표 메일이 있으면 `index.html` 의 `<footer>` 에서 바꾸세요.
- **박현철 교수님 링크**: LIT 교수 소개(`https://lit.kaist.ac.kr/people.html#faculty`)로 연결됩니다.

## 내용 고치기

- **참여연구원**: `data/i2sac_members.csv`. GitHub 웹에서 파일을 열고 연필 아이콘으로 바로 고칠 수 있습니다.
  - `세부`(1~4)·`구분`(교수/기업)으로 묶여 표시되고, 같은 세부 안에서는 CSV 순서대로 나옵니다.
  - `링크` 가 `http` 로 시작하면 새 탭(↗), 비우면 링크가 숨겨집니다. `연구실` 칸이 링크 글자(비우면 "홈페이지").
  - 사진은 `assets/img/people/` 에 올리고 `photo_path` 칸에 경로를 적습니다.
- **나머지 글**: `index.html`. 글마다 `data-ko`(한국어)·`data-en`(영어)이 함께 있으니 둘 다 고치세요.
- **시나리오 그림**을 바꾸면, 그림 속 "(N세부)" 클릭 영역 좌표(`index.html` 의 `class="i2-hot"` 줄 `style`)도 다시 맞춰야 합니다.
- **색**: `assets/css/style.css` 맨 아래 `:root` (지금은 로고 파란색 `#104d95` 기준).
- **처음 보이는 언어**: LIT와 같이 영어입니다. 바꾸려면 `assets/js/i18n.js` 의 `getLang`.

## 미리보기

CSV를 읽기 때문에 `index.html` 을 더블클릭(file://)하면 참여연구원이 나오지 않습니다. 이 폴더에서

```
python3 -m http.server 8000
```

을 실행한 뒤 `http://localhost:8000` 을 여세요.
