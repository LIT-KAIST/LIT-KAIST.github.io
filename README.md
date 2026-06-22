# LIT @ KAIST — 연구실 웹사이트

KAIST 정보전송연구실(LIT) 웹사이트입니다. **빌드 도구 없이 동작하는 순수 정적 사이트**로,
브라우저가 `data/`의 CSV/MD를 직접 읽어 렌더링합니다. GitHub Pages로 배포됩니다.

> 대부분의 콘텐츠는 **관리자 페이지(`admin.html`)에서 직접** 추가·수정·삭제할 수 있습니다.
> (아래 [관리자 페이지로 수정하기](#2-관리자-페이지로-수정하기-권장) 참고)

---

## 1. 페이지 구성

| 페이지 | 내용 | 데이터 소스 |
|---|---|---|
| `index.html` | 홈 (히어로 슬라이드, 연구분야 토글, 최근 소식+갤러리) | `news.csv`, `album.csv`, `assets/img/research/` |
| `about.html` | 소개 (소개·비전, 현황, 연구 분야, 대표 성과) | HTML 직접 작성 + `assets/img/research/` |
| `people.html` | 구성원 (Faculty / Members / Alumni 탭) | `faculty(_ko).md`, `people_members.csv`, `people_alumni.csv` |
| `journal/conferences/patents.html` | 출판물 (International / Domestic 탭) | `*_international.csv`, `*_domestic.csv` |
| `projects.html` | 연구 과제 (Current / Past 탭) | `projects_current.csv`(+상세 md), `projects_past.csv` |
| `seminar.html` | 내부 세미나 (목록 → 상세) | `seminars.csv` + `seminar_<slug>.csv` |
| `news.html` | 소식/게시판 (한·영) | `news.csv` |
| `album.html` | 앨범 (연도별, 라이트박스) | `album.csv` + `assets/img/album/` |
| `contact.html` | 연락처·오시는 길·모집 안내 (지도) | HTML 직접 작성 |
| `admin.html` | 관리자 (토큰 기반 데이터 편집) | — |

**상단 메뉴**: Home · About · People▾ · Publications▾ · Projects · **Activities▾**(Seminar/News/Album) · Contact
(메뉴를 줄이기 위해 News·Album·Seminar는 **Activities** 드롭다운으로 묶여 있습니다.)

```
assets/
├── css/style.css
├── js/  (pubs, people, album, news, projects, seminar, about, home,
│         i18n, reveal, hero, zoom, admin)
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

관리 탭: **Members · Alumni · Album · Publications · News · Projects(진행중) · Projects(완료) · Seminar 목록 · Seminar 주차**

- **사진 업로드**: 폼에서 파일 선택 → 자동으로 폭 1600px 리사이즈 후 커밋
- **PDF/PPT 업로드**: Seminar의 syllabus·발표자료는 리사이즈 없이 그대로 업로드(같은 경로면 덮어쓰기)
- **Members → Alumni 이동**: 졸업 처리(사진까지 이동)
- **Projects 진행중 → 완료(→ Past)**: 기간 종료 과제를 완료 목록으로 이동
- **Seminar 주차**: 상단에서 세미나를 고르면 그 세미나(`seminar_<slug>.csv`)의 주차를 관리. 새 세미나의 주차 파일은 첫 주차 추가 시 자동 생성됩니다.

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
| `people_members.csv` | `name_korean`,`name_english`,`직함`,`학위`,`관심분야`,`email`,`homepage`,`scholar`,`github`,`cv`,`photo_path` |
| `people_alumni.csv` | …`학위`,`졸업논문`,`current_position`,`photo_path` |
| `journal/conference/patent_*.csv` | `title`,`author`,`journal`/`booktitle`,`volume`,`number`,`pages`,`date`,`doi`,`abstract`,`status`(forthcoming 시 배지),`note` |
| `album.csv` | `date`,`year`,`title`,`content`,`status`,`thumbnail_file`,`image_files`(`\|` 구분) |
| `news.csv` | `date`,`year`,`forum`,`title`,`title_en`,`content`,`content_en`,`links`,`status` |
| `projects_current.csv` | `과제명`,`지원기관`,`유형`,`시작`,`종료`,`종료연도`,`원본상태`,`slug`,`소개`,`소개_en` |
| `projects_past.csv` | `과제명`,`지원기관`,`유형`,`시작`,`종료`,`종료연도`,`원본상태` |
| `seminars.csv` | `slug`,`title`,`title_en`,`term`,`term_en`,`intro`,`intro_en`,`syllabus`(pdf 경로),`refs`(`라벨::URL\|…`),`status` |
| `seminar_<slug>.csv` | `week`,`date`,`topic`,`topic_en`,`presenter`,`material`(pdf/ppt 경로),`note` |

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
- **커스텀 도메인(lit.kaist.ac.kr)** 사용 시: `assets/js/admin.js` 의 `REPO_OVERRIDE` 에 `"owner/repo"` 입력 + 각 HTML의 `og:url`/`og:image` 도메인 교체.

## 8. 캐시 / 이미지 메모
- CSS·JS는 `?v=YYYYMMDDx` 쿼리로 캐시 관리. **CSS/JS를 수정해 배포할 땐 모든 HTML의 `?v=` 값을 새 값으로** 바꿔야 방문자에게 적용됩니다. (데이터 CSV/MD·업로드 파일은 `no-store`라 버전 안 바꿔도 반영)
- 큰 원본 이미지는 `sips -Z 1600 파일.jpg` 등으로 줄여 올리세요(admin 업로드는 자동 리사이즈).

## 9. 주의사항
- 프로젝트 폴더가 **iCloud Drive(데스크톱) 동기화** 위치면 `… 2.jpg` 복제본이 생길 수 있으니 동기화 밖 폴더 권장.
- 출판물 저자 중 PI(`Hyuncheol Park`/`박현철`)는 자동으로 굵게 강조(`assets/js/pubs.js` 의 `highlightPI`).
