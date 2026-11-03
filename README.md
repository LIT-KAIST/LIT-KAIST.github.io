# LIT @ KAIST — 연구실 웹사이트

KAIST 정보전송연구실(LIT) 웹사이트입니다. **빌드 도구 없이 동작하는 순수 정적 사이트**로,
브라우저가 `data/`의 CSV/MD를 직접 읽어 렌더링합니다. GitHub Pages로 배포됩니다.

> 대부분의 콘텐츠는 **관리자 페이지(`admin.html`)에서 직접** 추가·수정·삭제할 수 있습니다.
> (아래 [관리자 페이지로 수정하기](#2-관리자-페이지로-수정하기-권장) 참고)

---

## 1. 페이지 구성

| 페이지 | 내용 | 데이터 소스 |
|---|---|---|
| `index.html` | 홈 (히어로 + 최신 소식 카드, 연구분야, 갤러리) — 첫 화면 왼쪽 아래 카드에 `news.csv` 최신 4건을 제목 전체로 자동 표시(**부고 유형은 제외**, 뉴스 페이지엔 그대로) | `news.csv`, `album.csv`, `assets/img/research/` |
| `about.html` | 소개 (소개·비전, 현황, 연구 분야, 대표 성과) | HTML 직접 작성 + `assets/img/research/` |
| `people.html` | 구성원 (Faculty / Members / Alumni 탭) | `faculty(_ko).md`, `people_members.csv`, `people_alumni.csv` |
| `journal/conferences/patents.html` | 출판물 (International / Domestic 탭) | `*_international.csv`, `*_domestic.csv` |
| `projects.html` | 연구 과제 (Current / Past 탭) | `projects_current.csv`(+상세 md), `projects_past.csv` |
| `seminar.html` | 내부 세미나 (목록 → 상세) | `seminars.csv` + `seminar_<slug>.csv` |
| `news.html` | 소식/게시판 (한·영) | `news.csv` |
| `album.html` | 앨범 (연도별, 라이트박스) | `album.csv` + `assets/img/album/` |
| `i2sac.html` | 지능통감융합연구센터(I²SAC) 소개 — 센터 개요·연구 목표·기간·연구 내용·체계·참여연구원(세부별 교수·기업) | HTML 직접 작성 + `i2sac_members.csv` + `assets/img/i2sac/` |
| `center/` | **I²SAC 센터 사이트 이전 준비본** — 독립 사이트로 옮길 때 폴더 안 파일을 새 저장소에 그대로 올림 (`lit.kaist.ac.kr/center/` 미리보기, 검색 제외). 자세한 순서는 `center/README.md` | `center/data/i2sac_members.csv` (LIT 쪽과 따로 관리) |
| `contact.html` | 연락처·오시는 길·모집 안내 (지도) | HTML 직접 작성 |
| `admin.html` | 관리자 (토큰 기반 데이터 편집) | — |

**상단 메뉴**: Home · About · People▾ · Publications▾ · Projects · **Activities▾**(Seminar/News/Album) · **I²SAC▾** · Contact
(메뉴를 줄이기 위해 News·Album·Seminar는 **Activities** 드롭다운으로 묶여 있습니다.)

```
assets/
├── css/style.css
├── js/  (pubs, people, album, news, projects, seminar, about, i2sac,
│         i18n, reveal, zoom, sitetext, admin, …)
├── img/
│   ├── people/{faculty,members,alumni}/   인물 사진
│   ├── album/<year>/<month>/              앨범 사진
│   ├── research/{isac,mimo,drl}.png        연구분야 그림(홈·About)
│   └── projects/{i2sac,nearfield,token}.png 과제 상세 그림
├── files/seminar/<slug>/                  세미나 syllabus·발표자료(PDF/PPT)
├── favicon.svg  · og.jpg  · lit-logo.png · kaist-logo.png · logo_bu.jpg
data/   CSV/MD (사실상의 DB)
```

---

## 2. 관리자 페이지로 수정하기 (권장)

`https://<사이트>/admin.html` → **GitHub 토큰** 입력 → 탭에서 추가·수정·삭제.
변경은 GitHub에 자동 커밋되고 **1~2분 뒤 사이트에 반영**됩니다.

관리 탭: **Members · Alumni · Album · Publications · News · Projects(진행중) · Projects(완료) · I²SAC 참여연구원 · Seminar 목록 · Seminar 주차 · Site Text · Hero · Highlights · Contact(연락처·모집)**

- **사진 업로드**: 폼에서 파일 선택 → 자동으로 폭 1600px 리사이즈 후 커밋
- **PDF/PPT 업로드**: Seminar의 syllabus·발표자료는 리사이즈 없이 그대로 업로드(같은 경로면 덮어쓰기)
- **Members → Alumni 이동**: 졸업 처리(사진까지 이동)
- **랩장(연구실 대표 학생) 지정**: Members 폼의 체크박스를 켜면 People 목록에서 이름 앞 **👑 왕관 + "연구실 대표 학생 / Lab Coordinator" 배지**가 붙고, 소속 그룹(박사/석사) 맨 위로 정렬됩니다. (보통 한 명만)
- **Publications 저자**: 구성원은 버튼으로, 외부 저자는 **영문 풀네임 + 한글 이름**으로 입력하면 약어가 항상 **K. Han 형식**(이름 첫 글자. 성)으로 자동 생성됩니다.
  국제 논문엔 약어(`K. Han`, A, B, and C 형식), 국내 논문엔 한글 이름(쉼표 구분)으로 저장되고, ⭐ 저장한 공저자는 `author_favorites.csv`(`name`=약어, `name_english`, `name_korean`)에 공유됩니다.
  새 논문 저장 시 자동 뉴스: 제목은 한국어 칸 "○○ 논문이 게재되었습니다!" / 영어 칸 "○○ paper is accepted!".
  본문은 영어 논문이면 한국어 칸에도 `"제목 by 저자(영문 풀네임)"`를 영어 그대로 두고 나머지 문장만 한국어로, 한글 논문이면 `"제목" 논문(한글 이름)`으로 작성됩니다. (약어가 겹치는 직접 입력 이름은 그대로 둠)
- **I²SAC 참여연구원**: 센터 페이지(`i2sac.html`) 참여연구원 카드(`i2sac_members.csv`). 세부(1~4)·구분(교수/기업)으로 묶여 표시되고, 같은 세부 안에서는 CSV 순서대로 나옵니다. 링크가 `http`로 시작하면 새 탭(↗), `people.html#faculty`처럼 사이트 내부 경로면 같은 탭(→), 비우면 버튼이 숨겨집니다. 버튼 이름은 '연구실' 칸(비우면 '홈페이지').
- **영어 자동 번역 (뉴스·앨범)**: 한국어만 쓰고 영어 칸을 비워 저장하면, 1~3분 뒤 GitHub Actions(`translate.yml`)가 Claude로 번역해 영어 칸을 채웁니다(2025년 이후 글). 이미 영어가 있는 칸은 덮어쓰지 않으니, 번역이 어색하면 영어 칸을 직접 고치면 되고, 한국어를 고친 뒤 다시 번역하려면 영어 칸을 비우고 저장하세요. 실패하거나 남은 빈칸은 매일 09:30에 다시 시도합니다. 구성원 이름은 Members/Alumni 명단의 영문명(번역 전에 미리 바꿔 넣음), 용어는 `.github/scripts/translate.py`의 `TERMS`를 따르며, 제목에서는 '김현우 박사과정'처럼 이름에 붙은 과정명을 빼고 이름만 씁니다(입학·졸업·학위논문·임용처럼 과정 자체가 소식이면 유지).
  - 인증: 저장소 Secret `CLAUDE_CODE_OAUTH_TOKEN` (`claude setup-token`으로 만든 **1년짜리** Claude 구독 토큰, 2026-11 등록). 만료·졸업 등으로 Actions의 "Translate Korean to English"가 실패하면, 담당자가 `claude setup-token`으로 새 토큰을 만들어 같은 이름으로 바꿔 넣으면 됩니다.
- **Projects 진행중 → 완료(→ Past)**: 기간 종료 과제를 완료 목록으로 이동
- **Projects 상세 본문(md)**: 진행중 폼의 **"상세 본문(한국어/English)"** 칸에 마크다운을 쓰면 메타데이터(CSV)와 함께 `data/<slug>_ko.md`·`data/<slug>.md` 로 한 번에 저장됩니다. (지원: `#`제목 · `**굵게**` · `*기울임*` · `- 목록` · `![설명](경로)` · `[글자](URL)`) ⚠️ **slug 는 파일명과 대소문자까지 일치**해야 상세가 열립니다(예: `I2SAC`, `SINC`).
- **Seminar 주차**: 상단에서 세미나를 고르면 그 세미나(`seminar_<slug>.csv`)의 주차를 관리. 새 세미나의 주차 파일은 첫 주차 추가 시 자동 생성됩니다.
- **Site Text**: 홈 환영 문구·About 소개 등 자유 텍스트(`site_text.csv`)를 한/영으로 편집. (키는 코드와 연결되니 값만 수정)
- **Hero**: 홈 히어로 슬라이드(`hero.csv`) 추가·삭제 + 이미지 업로드(순서 = CSV 순서)
- **Highlights**: About 대표 성과(`highlights.csv`). 출처(출판물 종류) + 논문 제목만 넣으면 해당 출판물 CSV에서 저자·게재지·연도·DOI를 자동으로 가져와 인용 표시
- **Publications 상태 바로 변경**: 목록의 각 논문 옆 선택칸(publish · early access · forthcoming)을 바꾸면 수정 창 없이 즉시 저장(커밋)됩니다.
- **국내 학술대회 양식** (Publications → Conference · Domestic): 학회명은 **`학회, 행사명, 개최지, 대한민국, 연도`** 로 통일 (예: `KICS, 추계종합학술발표회, 경주, 대한민국, 2025`).
  폼에서 행사(KICS 하계·추계·동계종합학술발표회 / JCCI 통신정보합동학술대회)를 고르고 개최지만 넣으면 자동 작성되며 연도는 날짜 칸에서 가져옵니다. 목록에 없는 학회는 '직접 입력'(학회·행사명만 쓰면 개최지·대한민국·연도는 자동). 개최지를 모르면 그 자리만 비움(`KICS, 하계종합학술발표회, 대한민국, 2019`).
  저자는 한글 이름 `박성민, 박현철` 형식(구성원 버튼). 자동 뉴스 제목은 `KICS Fall Conference 2025` / `JCCI 2025`, 본문은 `2025년도 한국통신학회 추계종합학술발표회(KICS Fall Conference 2025)`.
  ※ 기존 항목은 수정 창을 열어도 학회명이 **그대로 저장**됩니다. 행사·개최지를 바꾸거나 **'양식으로 바꾸기'** 를 눌렀을 때만 양식으로 바뀌며, 바뀔 값은 미리보기에 먼저 표시됩니다.
  학회 표시 없이 `…종합학술대회`만 적힌 옛 항목은 대한전자공학회 행사와 이름이 같아 학회를 추정하지 않습니다(이름은 그대로, 개최지·연도만 붙음).

### GitHub 토큰 발급 (최초 1회)
1. GitHub → Settings → Developer settings → **Fine-grained tokens → Generate**
2. Repository access: 이 저장소만 · Permissions → **Contents: Read and write**
3. `github_pat_…` 를 admin 토큰칸에 입력 → "✓ 쓰기 권한 확인됨" 확인

> ⚠️ 토큰은 비밀번호와 같습니다. 브라우저(localStorage)에만 저장되며 사이트엔 올라가지 않습니다.
> 공용 PC에서는 "토큰 기억"을 끄고, 유출되면 GitHub에서 즉시 **Revoke** 하세요.
> 여러 명이 편집하려면 저장소 **Settings → Collaborators** 로 초대(Write) 후 각자 본인 토큰을 사용하세요.

---

## 3. CSV / MD 직접 편집 (대안)

`data/` 파일을 직접 고치고 commit & push 해도 됩니다. **UTF-8** 저장, 쉼표·줄바꿈 값은 큰따옴표로 감싸세요.

### 데이터별 주요 컬럼
| 파일 | 핵심 컬럼 |
|---|---|
| `people_members.csv` | `name_korean`,`name_english`,`직함`,`학위`,`관심분야`,`email`,`homepage`,`scholar`,`github`,`cv`,`photo_path`,`랩장`(`Y`=랩장) |
| `people_alumni.csv` | …`학위`,`졸업논문`,`current_position`,`photo_path` |
| `journal/conference/patent_*.csv` | `title`,`author`,`journal`/`booktitle`,`volume`,`number`,`pages`,`date`,`doi`,`abstract`,`status`(`forthcoming`·`early access` 시 배지, 아래 7-1 자동 업데이트 대상),`note` |
| `album.csv` | `date`,`year`,`title`,`content`,`status`,`thumbnail_file`,`image_files`(`\|` 구분) |
| `news.csv` | `date`,`year`,`forum`,`title`,`title_en`,`content`,`content_en`,`links`,`status` |
| `projects_current.csv` | `과제명`,`지원기관`,`유형`,`시작`,`종료`,`종료연도`,`원본상태`,`slug`,`소개`,`소개_en` · 상세 본문은 `data/<slug>_ko.md`/`<slug>.md` (slug=파일명, 대소문자 일치) |
| `projects_past.csv` | `과제명`,`지원기관`,`유형`,`시작`,`종료`,`종료연도`,`원본상태` |
| `seminars.csv` | `slug`,`title`,`title_en`,`term`,`term_en`,`intro`,`intro_en`,`syllabus`(pdf 경로),`refs`(`라벨::URL\|…`),`status` |
| `seminar_<slug>.csv` | `week`,`date`,`topic`,`topic_en`,`presenter`,`material`(pdf/ppt 경로),`note` |
| `hero.csv` | `image`(경로),`title`,`title_en`,`sub`,`sub_en` — 홈 히어로 슬라이드(행 순서 = 표시 순서) |
| `highlights.csv` | `source`(예: journal_international),`title` — About 대표 성과로 띄울 논문 |
| `site_text.csv` | `key`,`ko`,`en` — 홈/About 자유 텍스트(키는 HTML의 `data-st` 와 연결) |

- **Faculty 소개**는 CSV가 아니라 `faculty.md`(영)/`faculty_ko.md`(한). `---` 로 나뉜 3부분(헤더/요약/전문) 유지.
- **현재 과제 상세**는 `projects_current.csv`의 `slug` → `data/<slug>_ko.md`/`<slug>.md`(예: `I2SAC_ko.md`). md 안에 `![설명](assets/img/projects/xxx.png)` 로 이미지를 넣으면 자동 표시됩니다.
- **About·Contact 본문**은 각 HTML 안의 `data-ko`/`data-en` 속성을 직접 수정.
- 사진/문서 경로는 가급적 **`.jpg`/`.pdf`** 로 유지(브라우저 호환).

---

## 4. 다국어 (한/영)
- 우상단 토글로 전환, 선택은 브라우저에 저장. 번역 대상 요소엔 `data-ko`/`data-en`(입력창은 `data-ko-placeholder` 등). 뉴스·프로젝트·세미나는 CSV의 `*_en` 컬럼이 영어판.

## 5. 이미지 확대 / 그림 배치
- 홈 연구토글·About 연구분야·과제 상세의 그림은 **클릭하면 크게(라이트박스)** 보입니다 (`zoom.js`).
- 연구분야 그림: `assets/img/research/{isac,mimo,drl}.png` (홈·About 공용). 과제 상세 그림: `assets/img/projects/`.

## 6. 로컬 미리보기
```bash
python3 -m http.server 8000   # http://localhost:8000
```
`file://` 직접 열기는 CSV를 못 읽으니 위 서버로 확인하세요.

## 7. 배포 (GitHub Pages)
`main` 에 push → 자동 반영(1~2분). 저장소 이름이 `<계정>.github.io` 여야 사용자 페이지로 동작.
- 다른 계정 이전 시: 저장소를 `<새계정>.github.io` 로 만들면 admin이 저장소를 **자동 감지**(코드 수정 불필요).
- **커스텀 도메인(lit.kaist.ac.kr)** 사용 시: 호스트명 자동감지가 안 되므로 `admin.js`·`news.js` 의 폴백 저장소(`LIT-KAIST/LIT-KAIST.github.io`)가 쓰입니다(이미 설정됨). 새 OG 도메인도 반영 완료.

### 7-1. 논문 출판 정보 자동 업데이트 (Crossref)
억셉 직후엔 제목·저자·저널만 넣고 `status`를 **forthcoming** 으로 두면 됩니다. 매일 09:00(KST) GitHub Actions(`update-pubs.yml`)가 Crossref 에서 찾아 채우고 main 에 커밋합니다.
- **상태는 올라가기만 함**: `forthcoming`(게재 예정) → `early access`(DOI 로 온라인 선공개, 권·호 미배정) → `published`(권 배정). 학회 논문은 Crossref 에 등록되면 바로 published.
- **채우는 칸**: `doi`·`abstract`, 저널이 published 가 되면 `volume`·`number`·`pages` — **비어 있는 칸만** 채우고 직접 넣은 값·`date` 는 건드리지 않음.
- 상태를 직접 **publish** 로 바꿔 두고 DOI·권·쪽수를 비워 둔 **올해·작년 논문**도 같은 확인을 거쳐 빈칸만 채움(상태는 그대로).
- **같은 논문인지 엄격히 확인**: 종류(저널/학회) · 제목(단어 단위로 동일, 대소문자·하이픈·a/the 같은 작은 단어만 허용) · 저자 성(순서·인원 모두 동일) · 게재처 이름 · 연도(-1~+2년) · 후보가 하나뿐 — 전부 맞아야 반영. 하나라도 어긋나면 **반영하지 않고** '확인 필요'로만 보고.
- **결과 확인**: 커밋 메시지에 논문별 DOI 링크와 검사 결과, Actions → *Update publications from Crossref* 실행 화면 Summary 에 반영/확인 필요/대기 목록.
- 제목에 한글이 있는 논문(국내 학회·저널)은 Crossref 에 보통 없어 건너뜁니다 → 직접 수정. 수동 실행: Actions 탭 → *Run workflow*. 로컬 점검: `python3 .github/scripts/update_pubs.py --dry-run`

## 8. 캐시 / 이미지 메모
- CSS·JS는 `?v=YYYYMMDDx` 쿼리로 캐시 관리. **CSS/JS를 수정해 배포할 땐 모든 HTML의 `?v=` 값을 새 값으로** 바꿔야 방문자에게 적용됩니다. (데이터 CSV/MD·업로드 파일은 `no-store`라 버전 안 바꿔도 반영)
- 큰 원본 이미지는 `sips -Z 1600 파일.jpg` 등으로 줄여 올리세요(admin 업로드는 자동 리사이즈).

## 9. 다른 컴퓨터에서 수정하기

- **내용(데이터) 수정**: 설치 없이 **어느 컴퓨터에서나 `admin.html` 접속 → 토큰 입력**이면 됩니다.
  토큰은 그 브라우저에만 저장되므로, 새 컴퓨터에선 토큰을 한 번 다시 입력하면 끝.
  (토큰은 GitHub Settings에서 새로 발급하거나 기존 것을 재사용)
- **코드/구조 수정**(HTML·CSS·JS): 그 컴퓨터에 저장소를 한 번 받아오세요.
  ```bash
  git clone https://github.com/LIT-KAIST/LIT-KAIST.github.io.git
  cd LIT-KAIST.github.io
  # 수정 후
  git add -A && git commit -m "..." && git push
  ```
  여러 곳에서 작업할 땐 시작 전 `git pull` 로 최신본을 받고 작업하세요(admin으로 올린 변경도 여기에 포함됨).
- 두 사람이 동시에 같은 파일을 고치면 push 시 충돌이 날 수 있어요 → 한 번에 한 곳에서, 또는 작업 전 `git pull` 습관화.

## 10. 주의사항
- 프로젝트 폴더가 **iCloud Drive(데스크톱) 동기화** 위치면 `… 2.jpg` 복제본이 생길 수 있으니 동기화 밖 폴더 권장.
- 출판물 저자 중 PI(`Hyuncheol Park`/`박현철`)는 자동으로 굵게 강조(`assets/js/pubs.js` 의 `highlightPI`).
