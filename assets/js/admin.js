/* ==========================================================================
   LIT @ KAIST — 통합 관리자 (admin.html 전용)
   GitHub 개인 토큰으로 CSV/이미지를 직접 커밋해 사이트를 업데이트합니다.
   - Members / Alumni : 추가·수정·삭제, Member→Alumni 이동
   - Album : 글 추가·삭제 + 여러 장 사진 업로드(자동 리사이즈)
   - Publications : Journal/Conference/Patent × International/Domestic CRUD
   데이터(CSV)가 곧 DB이며, 모든 변경은 Git 이력으로 남습니다.
   ========================================================================== */
(function (global) {
  var P = global.Pubs;
  var FILE_BRANCH = "main";
  var MAXW = 1600;       // 사진 리사이즈 최대 폭(px)
  var JPEG_Q = 0.85;

  /* ---------------- 공통 유틸 ---------------- */
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function slug(s) {
    return String(s == null ? "" : s).trim().toLowerCase()
      .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "item";
  }
  function nowStamp() {
    var d = new Date();
    function p(n) { return (n < 10 ? "0" : "") + n; }
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) +
      " " + p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds());
  }
  function csvField(v) {
    v = String(v == null ? "" : v);
    return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }
  function b64encode(str) { return btoa(unescape(encodeURIComponent(str))); }
  function b64decode(b64) { return decodeURIComponent(escape(atob(String(b64).replace(/\s/g, "")))); }
  function colIndex(rows) {
    var ix = {};
    (rows[0] || []).forEach(function (name, i) { ix[String(name).replace(/^﻿/, "").trim()] = i; });
    return ix;
  }
  function serialize(rows) {
    return "﻿" + rows.map(function (r) { return r.map(csvField).join(","); }).join("\n") + "\n";
  }
  function repo() {
    var h = (global.location.hostname || "").toLowerCase();
    if (/\.github\.io$/.test(h)) return h.replace(/\.github\.io$/, "") + "/" + h;
    return "LIT-KAIST/LIT-KAIST.github.io";
  }
  function token() { return (localStorage.getItem("lit-gh-token") || "").trim(); }

  /* ---------------- 이미지 리사이즈 → base64(jpeg) ---------------- */
  function fileToB64(file, resize) {
    return new Promise(function (resolve, reject) {
      if (!resize) {
        var fr = new FileReader();
        fr.onload = function () { resolve(String(fr.result).split(",")[1]); };
        fr.onerror = reject; fr.readAsDataURL(file);
        return;
      }
      var img = new Image();
      img.onload = function () {
        var scale = Math.min(1, MAXW / img.width);
        var w = Math.round(img.width * scale), h = Math.round(img.height * scale);
        var c = document.createElement("canvas"); c.width = w; c.height = h;
        c.getContext("2d").drawImage(img, 0, 0, w, h);
        resolve(c.toDataURL("image/jpeg", JPEG_Q).split(",")[1]);
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }

  /* ---------------- GitHub API ---------------- */
  function ghHeaders() {
    return { Authorization: "token " + token(), Accept: "application/vnd.github+json" };
  }
  function apiUrl(path) {
    return "https://api.github.com/repos/" + repo() + "/contents/" + path;
  }
  function getFile(path) {
    return fetch(apiUrl(path) + "?ref=" + FILE_BRANCH, { headers: ghHeaders(), cache: "no-store" })
      .then(function (r) {
        if (r.status === 404) return null;
        if (r.status === 401) throw new Error("토큰이 유효하지 않습니다 (401).");
        if (!r.ok) throw new Error("파일 조회 실패 (" + r.status + ").");
        return r.json();
      });
  }
  function putFile(path, b64, message, sha) {
    var body = { message: message, branch: FILE_BRANCH, content: b64 };
    if (sha) body.sha = sha;
    return fetch(apiUrl(path), { method: "PUT", headers: ghHeaders(), body: JSON.stringify(body) })
      .then(function (r) {
        if (!r.ok) return r.json().then(function (e) {
          throw new Error("커밋 실패 (" + r.status + "): " + (e.message || ""));
        });
        return r.json();
      });
  }
  // 이미지 업로드 (있으면 덮어쓰기)
  function uploadImage(path, b64, message) {
    return getFile(path).then(function (cur) {
      return putFile(path, b64, message, cur && cur.sha);
    });
  }
  // CSV GET → transform(rows) → PUT
  // headerCols: 파일이 없을 때 새로 만들 헤더(예: 새 세미나의 주차 파일)
  function commitCsv(csvPath, message, transform, headerCols) {
    return getFile(csvPath).then(function (data) {
      var rows, sha;
      if (!data) {
        if (!headerCols) throw new Error("CSV를 찾을 수 없습니다: " + csvPath);
        rows = [headerCols.slice()]; sha = undefined; // 신규 파일
      } else {
        rows = P._parseCSV(b64decode(data.content)); sha = data.sha;
      }
      transform(rows);
      return putFile(csvPath, b64encode(serialize(rows)), message, sha);
    });
  }
  // 임의의 텍스트 파일 커밋 (있으면 덮어쓰기) — 프로젝트 상세 md 등
  function commitText(path, text, message) {
    return getFile(path).then(function (cur) {
      return putFile(path, b64encode(text), message, cur && cur.sha);
    });
  }

  /* ---------------- 컬렉션 정의 ---------------- */
  var DEGREE_M = ["박사", "석사", "연구원", "방문연구원"];
  var DEGREE_A = ["박사", "석사", "교환학생"];
  var STATUS_PUB = ["publish", "draft"];

  var COLLECTIONS = {
    members: {
      label: "Members", csv: "data/people_members.csv", idCol: "name_english",
      sub: function (r) { return r["직함"] || ""; },
      imgDir: "assets/img/people/members/",
      fields: [
        { name: "name_english", label: "Name (English)", required: true },
        { name: "name_korean", label: "이름 (한국어)" },
        { name: "직함", label: "직함 (예: Ph.D. course)" },
        { name: "학위", label: "학위", type: "select", options: DEGREE_M },
        { name: "랩장", label: "연구실 대표 학생 (랩장) — 이름 앞 왕관 + 배지 표시", type: "check" },
        { name: "관심분야", label: "관심 분야" },
        { name: "email", label: "이메일" },
        { name: "homepage", label: "Homepage URL" },
        { name: "scholar", label: "Google Scholar URL" },
        { name: "github", label: "GitHub URL" },
        { name: "cv", label: "CV URL" },
        { name: "photo_path", label: "사진", type: "image" },
      ],
      moveToAlumni: true,
    },
    alumni: {
      label: "Alumni", csv: "data/people_alumni.csv", idCol: "name_english",
      sub: function (r) { return (r["직함"] || "") + (r.current_position ? " · " + r.current_position : ""); },
      imgDir: "assets/img/people/alumni/",
      fields: [
        { name: "name_english", label: "Name (English)", required: true },
        { name: "name_korean", label: "이름 (한국어)" },
        { name: "직함", label: "직함 (예: Ph.D. (2026 August))" },
        { name: "학위", label: "학위", type: "select", options: DEGREE_A },
        { name: "current_position", label: "현 소속" },
        { name: "졸업논문", label: "졸업논문 제목" },
        { name: "email", label: "이메일" },
        { name: "homepage", label: "Homepage URL" },
        { name: "scholar", label: "Google Scholar URL" },
        { name: "photo_path", label: "사진", type: "image" },
      ],
    },
    album: {
      label: "Album", csv: "data/album.csv", idCol: "date",
      title: function (r) { return r.title || ""; },
      sub: function (r) { return (r.date || "").slice(0, 10); },
      auto: true, // date/year/이미지 자동 처리
      fields: [
        { name: "title", label: "제목", required: true },
        { name: "content", label: "설명", type: "textarea" },
        { name: "status", label: "상태", type: "select", options: STATUS_PUB },
        { name: "date", label: "날짜 (예: 2024-03-15 · 비우면 오늘 · 옛 사진은 실제 날짜를 넣으면 그 시점에 정렬됨)" },
        { name: "images", label: "사진·영상 (여러 개 가능 · 영상은 20초 이내·100MB 미만 권장 · 첫 장이 썸네일)", type: "images" },
        { name: "__thumbpick", label: "사진 순서 변경 · 대표(썸네일) 선택 — ◀▶로 순서 이동, '대표'로 지정(영상 지정 시 첫 프레임 캡처)", type: "thumbpick" },
      ],
    },
    publications: {
      label: "Publications", isPub: true, idCol: "title",
      targets: [
        { key: "journal_international", label: "Journal · International" },
        { key: "journal_domestic", label: "Journal · Domestic" },
        { key: "conference_international", label: "Conference · International" },
        { key: "conference_domestic", label: "Conference · Domestic" },
        { key: "patent_international", label: "Patent · International" },
        { key: "patent_domestic", label: "Patent · Domestic" },
      ],
      sub: function (r) { return (r.author || "").slice(0, 60); },
      fields: [
        { name: "title", label: "제목", required: true },
        { name: "author", label: "저자 (and 로 구분)" },
        { name: "date", label: "날짜 (YYYY-MM-DD)" },
        { name: "journal", label: "저널 (Journal)" },
        { name: "booktitle", label: "학술대회/Booktitle (Conference)" },
        { name: "volume", label: "Volume" },
        { name: "number", label: "Number / 출원·등록번호 (Patent)" },
        { name: "pages", label: "Pages" },
        { name: "note", label: "비고 (Patent 출원/등록 등)" },
        { name: "doi", label: "DOI" },
        { name: "abstract", label: "초록", type: "textarea" },
        { name: "status", label: "상태", type: "select", options: ["publish", "forthcoming"] },
      ],
    },
    news: {
      label: "News", csv: "data/news.csv", idCol: "date", auto: true,
      title: function (r) { return r.title || ""; },
      sub: function (r) { return (r.date || "").slice(0, 10); },
      fields: [
        { name: "title", label: "제목 (한국어)", required: true },
        { name: "title_en", label: "Title (English)" },
        { name: "content", label: "본문 (한국어)", type: "textarea" },
        { name: "content_en", label: "Content (English)", type: "textarea" },
        { name: "links", label: "링크 (| 로 구분)" },
        { name: "forum", label: "분류 (forum)" },
        { name: "status", label: "상태", type: "select", options: STATUS_PUB },
      ],
    },
    projects_current: {
      label: "Projects (진행중)", csv: "data/projects_current.csv", idCol: "과제명",
      sub: function (r) { return [r["지원기관"], (r["시작"] || "") + (r["종료"] ? "~" + r["종료"] : "")].filter(function (x) { return (x || "").trim(); }).join(" · "); },
      fields: [
        { name: "과제명", label: "과제명 (한국어)", required: true },
        { name: "과제명_en", label: "과제명 (English)" },
        { name: "지원기관", label: "지원기관" },
        { name: "유형", label: "유형" },
        { name: "시작", label: "시작 (예: 2026.04)" },
        { name: "종료", label: "종료 (예: 2030.12)" },
        { name: "종료연도", label: "종료연도 (예: 2030)" },
        { name: "slug", label: "상세 md 파일명 (예: I2SAC)" },
        { name: "소개", label: "한 줄 소개 (한국어)", type: "textarea" },
        { name: "소개_en", label: "한 줄 소개 (English)", type: "textarea" },
        { name: "본문_ko", label: "상세 본문 (한국어, 마크다운) — data/<slug>_ko.md", type: "md", mdLang: "ko" },
        { name: "본문_en", label: "상세 본문 (English, Markdown) — data/<slug>.md", type: "md", mdLang: "en" },
      ],
      // 기간 종료 시 완료(Past)로 이동: 공통 컬럼만 옮기고 현재 목록에서 제거
      moveTo: { csv: "data/projects_past.csv", label: "→ Past",
        cols: ["과제명", "과제명_en", "지원기관", "유형", "시작", "종료", "종료연도", "원본상태"] },
    },
    projects_past: {
      label: "Projects (완료)", csv: "data/projects_past.csv", idCol: "과제명",
      sub: function (r) { return [r["종료연도"], r["지원기관"]].filter(function (x) { return (x || "").trim(); }).join(" · "); },
      fields: [
        { name: "과제명", label: "과제명 (한국어)", required: true },
        { name: "과제명_en", label: "과제명 (English)" },
        { name: "지원기관", label: "지원기관" },
        { name: "유형", label: "유형" },
        { name: "시작", label: "시작" },
        { name: "종료", label: "종료" },
        { name: "종료연도", label: "종료연도" },
      ],
    },
    seminars: {
      label: "Seminar 목록", csv: "data/seminars.csv", idCol: "slug",
      title: function (r) { return r.title || r.slug || ""; },
      sub: function (r) { return [r.term, r.slug].filter(function (x) { return (x || "").trim(); }).join(" · "); },
      fields: [
        { name: "slug", label: "slug (영문·숫자, 예: isac-2026)", required: true },
        { name: "title", label: "제목 (한국어)" },
        { name: "title_en", label: "Title (English)" },
        { name: "term", label: "학기 (예: 2026 여름)" },
        { name: "term_en", label: "Term (English)" },
        { name: "intro", label: "소개 (한국어)", type: "textarea" },
        { name: "intro_en", label: "소개 (English)", type: "textarea" },
        { name: "refs", label: "참고자료 (라벨::URL, 여러 개는 | 로 구분)" },
        { name: "status", label: "상태", type: "select", options: STATUS_PUB },
        { name: "syllabus", label: "Syllabus PDF", type: "file", accept: ".pdf",
          dir: function () { return "assets/files/seminar/" + (slug(formVal("slug")) || "seminar"); },
          filename: function () { return "syllabus.pdf"; } },
      ],
    },
    seminar_weeks: {
      label: "Seminar 주차", targetsFrom: "data/seminars.csv", idCol: "week",
      title: function (r) { return "Week " + (r.week || "") + (r.topic ? " — " + r.topic : ""); },
      sub: function (r) { return [r.date, r.presenter].filter(function (x) { return (x || "").trim(); }).join(" · "); },
      fields: [
        { name: "week", label: "주차 (숫자)", required: true },
        { name: "date", label: "날짜 (YYYY-MM-DD)" },
        { name: "topic", label: "주제" },
        { name: "topic_en", label: "Topic (English)" },
        { name: "presenter", label: "발표자" },
        { name: "note", label: "비고" },
        { name: "material", label: "발표자료 (PDF/PPT)", type: "file", accept: ".pdf,.ppt,.pptx,.key",
          dir: function () { return "assets/files/seminar/" + (curPubTarget || "").replace(/^seminar_/, ""); },
          filename: function (file) { return safeName(file.name); } },
      ],
    },
    site_text: {
      label: "Site Text", csv: "data/site_text.csv", idCol: "key",
      title: function (r) { return r.key || ""; },
      sub: function (r) { return (r.ko || "").slice(0, 50); },
      fields: [
        { name: "key", label: "키 (코드와 연결 — 가급적 수정하지 마세요)", required: true },
        { name: "ko", label: "한국어", type: "textarea" },
        { name: "en", label: "English", type: "textarea" },
      ],
    },
    hero: {
      label: "Hero (홈 슬라이드)", csv: "data/hero.csv", idCol: "image",
      title: function (r) { return r.title || r.image || ""; },
      sub: function (r) { return r.image || ""; },
      fields: [
        { name: "image", label: "이미지 (넓은 가로형 권장)", type: "image", accept: "image/*",
          dir: function () { return "assets/img/hero"; },
          filename: function (file) { return safeName(file.name).replace(/\.\w+$/, "") + ".jpg"; } },
        { name: "title", label: "제목 (한국어)" },
        { name: "title_en", label: "Title (English)" },
        { name: "sub", label: "부제 (한국어)" },
        { name: "sub_en", label: "Subtitle (English)" },
      ],
    },
    contact: {
      label: "Contact (연락처·모집)", csv: "data/contact.csv", idCol: "key", singleton: true,
      title: function () { return "연구실 연락처 · 모집 정보"; },
      fields: [
        { name: "key", type: "hidden" },
        { name: "manager_ko", label: "학생 모집 담당자 (한국어)" },
        { name: "manager_en", label: "Recruitment manager (English)" },
        { name: "email", label: "담당자/연구실 이메일" },
        { name: "r_intern",  label: "현재 모집: 기간제연구원", type: "check" },
        { name: "r_urp",     label: "현재 모집: 학부연구생", type: "check" },
        { name: "r_msc",     label: "현재 모집: 석사 과정", type: "check" },
        { name: "r_phd",     label: "현재 모집: 박사 과정", type: "check" },
        { name: "r_msphd",   label: "현재 모집: 석박사통합과정", type: "check" },
        { name: "r_postdoc", label: "현재 모집: 박사후연구원", type: "check" },
        { name: "affil_ko", label: "소속 (한국어)" },
        { name: "affil_en", label: "Affiliation (English)" },
        { name: "address_ko", label: "주소 (한국어)" },
        { name: "address_en", label: "Address (English)" },
        { name: "office_ko", label: "연구실 위치 (한국어) — 예: LG이노베이션홀(N24) 3111호" },
        { name: "office_en", label: "Office (English)" },
        { name: "tel", label: "전화" },
        { name: "map_query", label: "지도 위치(Google Maps) — 정확히 찍으려면 좌표 입력 '위도,경도' (예: 36.3754069,127.3635082). 장소명도 가능하나 부정확할 수 있음" },
      ],
    },
    highlights: {
      label: "Highlights (대표성과·자동)", readonly: true,
    },
  };

  function safeName(n) {
    n = String(n || "file");
    var dot = n.lastIndexOf("."), ext = dot >= 0 ? n.slice(dot).toLowerCase() : "";
    return slug(dot >= 0 ? n.slice(0, dot) : n) + ext;
  }

  /* ---------------- UI ---------------- */
  var root, msgEl, listEl, curKey, curPubTarget;

  function setMsg(t, kind) {
    msgEl.textContent = t || "";
    msgEl.className = "adm-msg" + (kind ? " adm-" + kind : "");
  }
  function csvPathOf(col) {
    return (col.isPub || col.targetsFrom) ? "data/" + curPubTarget + ".csv" : col.csv;
  }

  function init(mountId) {
    root = document.getElementById(mountId);
    root.innerHTML =
      '<div class="adm-tokenbar">' +
        '<label>GitHub 토큰 <input type="password" id="admToken" placeholder="github_pat_… (이 브라우저에만 저장)" autocomplete="off"></label>' +
        '<button type="button" id="admSaveTok" class="adm-btn">저장</button>' +
        '<span id="admTokState" class="adm-tokstate"></span>' +
      "</div>" +
      '<div class="adm-tabs" id="admTabs"></div>' +
      '<div class="adm-msg" id="admMsg"></div>' +
      '<div class="adm-bar"><div id="admPubSel"></div>' +
        '<input type="search" id="admFilter" class="adm-filter" placeholder="검색…">' +
        '<button type="button" id="admAdd" class="adm-btn adm-add">+ 새 항목</button></div>' +
      '<div id="admList" class="adm-list"></div>' +
      '<div class="admin-modal" id="admModal" aria-hidden="true"><div class="am-panel">' +
        '<button type="button" class="am-close" id="admClose">&times;</button>' +
        '<h2 id="admFormTitle"></h2><div id="admForm"></div>' +
        '<div class="am-actions"><span></span><button type="button" class="am-submit" id="admSubmit">저장</button></div>' +
        '<div class="am-msg" id="admFormMsg"></div>' +
      "</div></div>";

    msgEl = document.getElementById("admMsg");
    listEl = document.getElementById("admList");

    var tok = token();
    if (tok) { document.getElementById("admToken").value = tok; verifyAccess(); }
    document.getElementById("admSaveTok").addEventListener("click", function () {
      var v = document.getElementById("admToken").value.trim();
      if (v) { localStorage.setItem("lit-gh-token", v); verifyAccess(); }
      else { localStorage.removeItem("lit-gh-token"); setTokState(false); }
    });

    // 탭
    var tabs = document.getElementById("admTabs");
    Object.keys(COLLECTIONS).forEach(function (k) {
      var b = document.createElement("button");
      b.className = "adm-tab"; b.type = "button"; b.textContent = COLLECTIONS[k].label;
      b.setAttribute("data-key", k);
      b.addEventListener("click", function () { selectTab(k); });
      tabs.appendChild(b);
    });

    document.getElementById("admFilter").addEventListener("input", renderList);
    document.getElementById("admAdd").addEventListener("click", function () { openForm(null); });
    document.getElementById("admClose").addEventListener("click", closeModal);
    document.getElementById("admModal").addEventListener("click", function (e) {
      if (e.target.id === "admModal") closeModal();
    });
    document.getElementById("admSubmit").onclick = onSubmit;

    selectTab("members");
  }

  function setTokState(ok) {
    var el = document.getElementById("admTokState");
    el.textContent = ok ? "✓ 저장됨" : "토큰 필요";
    el.className = "adm-tokstate" + (ok ? " ok" : "");
  }

  // 토큰 저장 시 저장소 쓰기 권한을 즉시 확인
  function verifyAccess() {
    var el = document.getElementById("admTokState");
    el.textContent = "확인 중…"; el.className = "adm-tokstate";
    fetch("https://api.github.com/repos/" + repo(), { headers: ghHeaders(), cache: "no-store" })
      .then(function (r) {
        if (r.status === 401) throw new Error("토큰이 유효하지 않습니다");
        if (r.status === 404) throw new Error("저장소를 찾지 못했습니다(권한 없음)");
        if (!r.ok) throw new Error("저장소 접근 불가 (" + r.status + ")");
        return r.json();
      })
      .then(function (d) {
        if (d.permissions && d.permissions.push) {
          el.textContent = "✓ 쓰기 권한 확인됨 (" + repo() + ")"; el.className = "adm-tokstate ok";
        } else {
          el.textContent = "✗ 이 저장소에 쓰기 권한이 없습니다"; el.className = "adm-tokstate err";
        }
      })
      .catch(function (e) { el.textContent = "✗ " + e.message; el.className = "adm-tokstate err"; });
  }

  function selectTab(key) {
    curKey = key;
    Array.prototype.forEach.call(document.querySelectorAll(".adm-tab"), function (b) {
      b.classList.toggle("active", b.getAttribute("data-key") === key);
    });
    var col = COLLECTIONS[key];
    var pubSel = document.getElementById("admPubSel");
    document.getElementById("admFilter").value = "";

    // 읽기 전용(자동) 탭: 추가 버튼/필터 숨기고 정보만 표시
    var addBtn = document.getElementById("admAdd"), filt = document.getElementById("admFilter");
    if (col.readonly) {
      pubSel.innerHTML = "";
      if (addBtn) addBtn.style.display = "none";
      if (filt) filt.style.display = "none";
      if (key === "highlights") renderHighlightsInfo();
      return;
    }
    // 단일 레코드(연락처 등): 추가/검색 숨기고 한 행만 편집
    if (col.singleton) {
      pubSel.innerHTML = "";
      if (addBtn) addBtn.style.display = "none";
      if (filt) filt.style.display = "none";
      loadList();
      return;
    }
    if (addBtn) addBtn.style.display = "";
    if (filt) filt.style.display = "";

    function buildSel(targets) {
      curPubTarget = targets[0].key;
      pubSel.innerHTML = '<select id="admPubTarget">' + targets.map(function (t) {
        return '<option value="' + esc(t.key) + '">' + esc(t.label) + "</option>";
      }).join("") + "</select>";
      document.getElementById("admPubTarget").addEventListener("change", function () {
        curPubTarget = this.value; loadList();
      });
    }

    if (col.isPub) { buildSel(col.targets); loadList(); return; }
    if (col.targetsFrom) {
      pubSel.innerHTML = '<span class="muted" style="font-size:.9rem">세미나 불러오는 중…</span>';
      fetch(col.targetsFrom + "?z=" + Math.round(performance.now()), { cache: "no-store" })
        .then(function (r) { return r.text(); })
        .then(function (txt) {
          var recs = P._rowsToObjects(P._parseCSV(txt)).filter(function (s) { return (s.slug || "").trim(); });
          if (!recs.length) { pubSel.innerHTML = ""; curPubTarget = ""; listEl.innerHTML = '<p class="muted">먼저 Seminar 목록에서 세미나를 추가하세요.</p>'; return; }
          buildSel(recs.map(function (s) { return { key: "seminar_" + s.slug.trim(), label: (s.title || s.slug) + " (" + s.slug.trim() + ")" }; }));
          loadList();
        })
        .catch(function () { pubSel.innerHTML = ""; });
      return;
    }
    pubSel.innerHTML = "";
    loadList();
  }

  // 대표성과(자동·읽기전용): 현재 표시 5편 + 전체 후보 보기
  function renderHighlightsInfo() {
    listEl.innerHTML = '<p class="muted">불러오는 중…</p>';
    var VENUES = [/vehicular technology/i, /selected areas in communications/i, /wireless communications/i, /transactions on communications/i];
    var now = new Date(), Y = now.getFullYear(), minY = Y - 5, maxY = Y - 1;
    function yr(r) { var d = (r.date || r.added || "").match(/(\d{4})/); return d ? d[1] : ""; }
    function cite(r) {
      var doi = (r.doi || "").trim(), href = doi ? "https://doi.org/" + doi : (r.url || "").trim();
      var t = esc(r.title || ""), tl = href ? '<a href="' + esc(href) + '" target="_blank" rel="noopener">' + t + "</a>" : t;
      return (r.author ? esc(r.author) + ", " : "") + '"' + tl + '," ' + (r.journal ? "<em>" + esc(r.journal) + "</em>" : "") + (yr(r) ? ", " + esc(yr(r)) : "") + ".";
    }
    function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
    fetch("data/journal_international.csv?z=" + Math.round(performance.now()), { cache: "no-store" })
      .then(function (r) { return r.ok ? r.text() : ""; })
      .then(function (t) {
        var rows = t ? P._rowsToObjects(P._parseCSV(t)) : [], seen = {}, pool = [];
        rows.forEach(function (r) {
          var title = (r.title || "").trim();
          if (!title || (r.status || "").toLowerCase() === "draft") return;
          if (!VENUES.some(function (re) { return re.test(r.journal || ""); })) return;
          var y = parseInt(yr(r), 10); if (!(y >= minY && y <= maxY)) return;
          var k = title.toLowerCase(); if (seen[k]) return; seen[k] = 1; pool.push(r);
        });
        if (!pool.length) { listEl.innerHTML = '<p class="muted">조건에 맞는 후보 논문이 없습니다 (최근 5년 · TVT/TCOM/JSAC/TWC).</p>'; return; }
        var shuffled = pool.slice(), rand = rng(Y * 100 + (now.getMonth() + 1));
        for (var i = shuffled.length - 1; i > 0; i--) { var j = Math.floor(rand() * (i + 1)); var tmp = shuffled[i]; shuffled[i] = shuffled[j]; shuffled[j] = tmp; }
        var picks = shuffled.slice(0, 5), mm = ("0" + (now.getMonth() + 1)).slice(-2);
        listEl.innerHTML =
          '<p class="muted" style="margin:.2em 0 1em">최근 5년(' + minY + '~' + maxY + ') · TVT/TCOM/JSAC/TWC 중 <b>매월 무작위 5편</b>이 자동 선택됩니다(수정 불가). 아래는 현재 상태입니다.</p>' +
          '<h4 class="adm-hl-h">현재 표시 중 — ' + Y + '.' + mm + ' · ' + picks.length + '편</h4>' +
          '<ol class="adm-hl">' + picks.map(function (r) { return "<li>" + cite(r) + "</li>"; }).join("") + "</ol>" +
          '<h4 class="adm-hl-h">전체 후보 — ' + pool.length + '편</h4>' +
          '<ol class="adm-hl">' + pool.map(function (r) { return "<li>" + cite(r) + "</li>"; }).join("") + "</ol>";
      })
      .catch(function (e) { listEl.innerHTML = '<div class="error">로드 실패: ' + esc(e.message) + "</div>"; });
  }

  var rowsCache = [];
  function loadList() {
    var col = COLLECTIONS[curKey];
    listEl.innerHTML = '<p class="muted">목록 불러오는 중…</p>';
    fetch(csvPathOf(col) + "?z=" + Math.round(performance.now()), { cache: "no-store" })
      .then(function (r) { return r.ok ? r.text() : ""; })
      .then(function (t) {
        rowsCache = t ? P._rowsToObjects(P._parseCSV(t)) : [];
        renderList();
      })
      .catch(function (e) { listEl.innerHTML = '<div class="error">목록 로드 실패: ' + esc(e.message) + "</div>"; });
  }

  function renderList() {
    var col = COLLECTIONS[curKey];
    var q = (document.getElementById("admFilter").value || "").trim().toLowerCase();
    var list = rowsCache.filter(function (r) { return (r[col.idCol] || "").trim() || (r.title || "").trim(); });
    if (q) list = list.filter(function (r) {
      return JSON.stringify(r).toLowerCase().indexOf(q) !== -1;
    });
    // 앨범: 작성 순이 아니라 적힌 날짜 기준 최신→과거 정렬
    if (col.auto) list = list.slice().sort(function (a, b) { return (b.date || "").localeCompare(a.date || ""); });
    listEl.innerHTML = '<div class="adm-count">' + list.length + "개</div>" +
      list.map(function (r) {
        var id = r[col.idCol] || r.title || "";
        var disp = col.title ? (col.title(r) || id) : id;
        return '<div class="adm-row">' +
          '<div class="adm-row-main"><span class="adm-row-title">' + esc(disp) + "</span>" +
          '<span class="adm-row-sub">' + esc(col.sub ? col.sub(r) : "") + "</span></div>" +
          '<div class="adm-row-act">' +
            (col.moveToAlumni ? '<button type="button" class="adm-mini" data-act="move" data-id="' + esc(id) + '">→ Alumni</button>' : "") +
            (col.moveTo ? '<button type="button" class="adm-mini" data-act="move2" data-id="' + esc(id) + '">' + esc(col.moveTo.label || "→ 이동") + "</button>" : "") +
            '<button type="button" class="adm-mini" data-act="edit" data-id="' + esc(id) + '">수정</button>' +
            (col.singleton ? "" : '<button type="button" class="adm-mini adm-danger" data-act="del" data-id="' + esc(id) + '">삭제</button>') +
          "</div></div>";
      }).join("");
    Array.prototype.forEach.call(listEl.querySelectorAll(".adm-mini"), function (b) {
      var id = b.getAttribute("data-id"), act = b.getAttribute("data-act");
      b.addEventListener("click", function () {
        if (act === "edit") openForm(findRow(id));
        else if (act === "del") doDelete(id);
        else if (act === "move") openMove(findRow(id));
        else if (act === "move2") doMoveTo(findRow(id));
      });
    });
  }
  function findRow(id) {
    var col = COLLECTIONS[curKey];
    return rowsCache.filter(function (r) { return (r[col.idCol] || r.title) === id; })[0];
  }

  /* ---------------- 폼(추가/수정) ---------------- */
  var editingId = null, pendingFiles = {};

  function openForm(row) {
    if (!token()) { setMsg("먼저 GitHub 토큰을 저장하세요.", "err"); return; }
    var col = COLLECTIONS[curKey];
    editingId = row ? (row[col.idCol] || row.title) : null;
    pendingFiles = {};
    document.getElementById("admSubmit").onclick = onSubmit; // 이동 폼에서 바뀐 핸들러 복구
    document.getElementById("admFormTitle").textContent =
      (row ? "수정" : "추가") + " — " + col.label + ((col.isPub || col.targetsFrom) ? " (" + curPubTarget + ")" : "");
    var f = document.getElementById("admForm");
    f.innerHTML = col.fields.map(function (fd) { return fieldHtml(fd, row); }).join("");
    // 이미지 입력 미리보기 핸들러
    Array.prototype.forEach.call(f.querySelectorAll("input[type=file]"), function (inp) {
      inp.addEventListener("change", function () {
        pendingFiles[inp.getAttribute("data-name")] = inp.files;
      });
    });
    // 미디어 매니저: 라디오(대표) 표시 토글 + ◀▶ 순서 이동
    var tp = f.querySelector(".am-thumbpick");
    if (tp) {
      tp.addEventListener("change", function () {
        Array.prototype.forEach.call(tp.querySelectorAll(".tp-item"), function (it) {
          it.classList.toggle("on", !!it.querySelector('input[name="__thumb"]:checked'));
        });
      });
      tp.addEventListener("click", function (e) {
        if (!e.target.closest) return;
        var del = e.target.closest(".tp-del");
        if (del) {
          var it = del.closest(".tp-item");
          if (it && global.confirm("이 사진을 이 앨범에서 제거할까요? (저장 시 반영)")) it.parentNode.removeChild(it);
          return;
        }
        var btn = e.target.closest(".tp-mv");
        if (!btn) return;
        var item = btn.closest(".tp-item");
        if (btn.classList.contains("tp-l") && item.previousElementSibling) tp.insertBefore(item, item.previousElementSibling);
        else if (btn.classList.contains("tp-r") && item.nextElementSibling) tp.insertBefore(item.nextElementSibling, item);
      });
    }
    // 상세 본문(md): 편집 시 기존 파일 내용을 textarea 에 채움 (slug 기준)
    var mds = col.fields.filter(function (fd) { return fd.type === "md"; });
    if (mds.length && row && (row.slug || "").trim()) {
      var sv = row.slug.trim();
      mds.forEach(function (fd) {
        var path = "data/" + sv + (fd.mdLang === "en" ? "" : "_ko") + ".md";
        getFile(path).then(function (d) {
          var ta = f.querySelector('textarea[data-name="' + fd.name + '"]');
          if (ta && d) ta.value = b64decode(d.content);
        }).catch(function () {});
      });
    }
    document.getElementById("admFormMsg").textContent = "";
    openModal();
  }

  function fieldHtml(fd, row) {
    var v = row ? (row[fd.name] || "") : "";
    var lab = '<span>' + esc(fd.label) + (fd.required ? " *" : "") + "</span>";
    if (fd.type === "hidden") {
      return '<input type="hidden" data-name="' + fd.name + '" value="' + esc(v) + '">';
    }
    if (fd.type === "select") {
      return '<label class="am-field">' + lab + '<select data-name="' + fd.name + '">' +
        fd.options.map(function (o) {
          return '<option value="' + esc(o) + '"' + (o === v ? " selected" : "") + ">" + esc(o) + "</option>";
        }).join("") + "</select></label>";
    }
    if (fd.type === "textarea") {
      return '<label class="am-field">' + lab + '<textarea data-name="' + fd.name + '" rows="4">' + esc(v) + "</textarea></label>";
    }
    if (fd.type === "check") {
      var on = /^(y|yes|1|true|o|예|✓)$/i.test(String(v).trim());
      return '<label class="am-field am-check"><input type="checkbox" data-name="' + fd.name + '"' +
        (on ? " checked" : "") + "><span>" + esc(fd.label) + "</span></label>";
    }
    if (fd.type === "md") {
      // 값은 CSV가 아니라 md 파일에서 openForm 이 비동기로 채움
      return '<label class="am-field">' + lab +
        '<textarea class="am-md" data-name="' + fd.name + '" rows="14" ' +
        'placeholder="마크다운으로 작성:  # 큰제목   ## 소제목   **굵게**   - 목록   ![설명](assets/img/projects/그림.png)   [링크텍스트](URL)"></textarea></label>';
    }
    if (fd.type === "image") {
      return '<label class="am-field">' + lab +
        (v ? '<span class="am-cur">현재: ' + esc(v) + "</span>" : "") +
        '<input type="file" accept="image/*" data-name="' + fd.name + '">' +
        '<input type="hidden" data-name="' + fd.name + '" value="' + esc(v) + '"></label>';
    }
    if (fd.type === "images") {
      return '<label class="am-field">' + lab +
        '<input type="file" accept="image/*,video/*" multiple data-name="' + fd.name + '"></label>';
    }
    if (fd.type === "file") {
      return '<label class="am-field">' + lab +
        (v ? '<span class="am-cur">현재: ' + esc(v) + "</span>" : "") +
        '<input type="file"' + (fd.accept ? ' accept="' + fd.accept + '"' : "") + ' data-name="' + fd.name + '">' +
        '<input type="hidden" data-name="' + fd.name + '" value="' + esc(v) + '"></label>';
    }
    if (fd.type === "thumbpick") {
      var imgs = (((row && row.image_files) || "")).split("|").map(function (s) { return s.trim(); }).filter(Boolean);
      if (!imgs.length) {
        return '<label class="am-field">' + lab +
          '<span class="am-cur">사진·영상을 올리고 저장한 뒤, 다시 이 항목을 수정하면 순서 변경·대표(썸네일) 선택을 할 수 있어요. (기본: 첫 사진)</span></label>';
      }
      var cur = row ? (row.thumbnail_file || "").trim() : "";
      var base = "assets/img/album/";
      var items = imgs.map(function (p) {
        var on = (p === cur) || (!!cur && cur === p.replace(/\.[^.]+$/, "") + "-thumb.jpg");
        var media = isVid(p)
          ? '<video src="' + esc(base + p) + '#t=0.1" muted preload="metadata"></video><span class="tp-vid">▶</span>'
          : '<img src="' + esc(base + p) + '" loading="lazy">';
        return '<div class="tp-item' + (on ? " on" : "") + '" data-path="' + esc(p) + '">' +
          media +
          '<button type="button" class="tp-del" title="이 사진 삭제">✕</button>' +
          '<div class="tp-ctl">' +
            '<button type="button" class="tp-mv tp-l" title="앞으로 이동">◀</button>' +
            '<label class="tp-pick"><input type="radio" name="__thumb" value="' + esc(p) + '"' + (on ? " checked" : "") + ">대표</label>" +
            '<button type="button" class="tp-mv tp-r" title="뒤로 이동">▶</button>' +
          "</div>" +
        "</div>";
      }).join("");
      return '<label class="am-field">' + lab +
        '<div class="am-thumbpick" data-curthumb="' + esc(cur) + '">' + items + "</div></label>";
    }
    return '<label class="am-field">' + lab + '<input type="text" data-name="' + fd.name + '" value="' + esc(v) + '"></label>';
  }

  function formVal(name) {
    var el = document.querySelector('#admForm [data-name="' + name + '"]:not([type=file])');
    return el ? el.value.trim() : "";
  }

  // 앨범 날짜 결정: 입력값이 있으면 사용(날짜만이면 현재 시각을 붙여 고유성 확보), 없으면 편집중 값/지금
  function albumStamp() {
    var d = formVal("date");
    if (!d) return editingId || nowStamp();
    d = d.replace("T", " ").trim();
    return /^\d{4}-\d{2}-\d{2}[ ]\d{2}:\d{2}/.test(d) ? d : (d.slice(0, 10) + " " + nowStamp().slice(11));
  }

  function isVid(p) { return /\.(mp4|webm|mov|m4v)$/i.test(p || ""); }

  // 동영상 첫 프레임 캡처 → jpeg base64 (실패 시 null). url 은 로컬 objectURL 또는 서버 경로.
  function captureFrame(url) {
    return new Promise(function (resolve) {
      var v = document.createElement("video");
      v.muted = true; v.preload = "auto";
      try { v.crossOrigin = "anonymous"; } catch (e) {}
      var done = false, to = setTimeout(function () { finish(null); }, 10000);
      function finish(b64) { if (done) return; done = true; clearTimeout(to); resolve(b64); }
      function grab() {
        try {
          var w = v.videoWidth, h = v.videoHeight;
          if (!w || !h) { finish(null); return; }
          var scale = Math.min(1, MAXW / w);
          var c = document.createElement("canvas");
          c.width = Math.round(w * scale); c.height = Math.round(h * scale);
          c.getContext("2d").drawImage(v, 0, 0, c.width, c.height);
          finish(c.toDataURL("image/jpeg", JPEG_Q).split(",")[1]);
        } catch (e) { finish(null); }
      }
      v.addEventListener("loadeddata", function () {
        try { v.currentTime = Math.min(0.1, (v.duration || 1) / 2); } catch (e) { grab(); }
      });
      v.addEventListener("seeked", grab);
      v.addEventListener("error", function () { finish(null); });
      v.src = url;
    });
  }

  // 캡처 still 을 <영상경로>-thumb.jpg 로 업로드 → (앨범 베이스 기준) 상대경로 반환
  function uploadVideoStill(b64, videoRel) {
    var still = videoRel.replace(/\.[^.]+$/, "") + "-thumb.jpg";
    return uploadImage("assets/img/album/" + still, b64, "Album video first-frame thumbnail").then(function () { return still; });
  }

  // 미디어 매니저의 현재 순서(경로 배열) 반환. 위젯 없으면 null.
  function readMediaOrder() {
    var tp = document.querySelector("#admForm .am-thumbpick");
    if (!tp) return null;
    var items = tp.querySelectorAll(".tp-item[data-path]");
    if (!items.length) return null;
    return Array.prototype.map.call(items, function (it) { return it.getAttribute("data-path"); });
  }

  // 앨범 썸네일 해석. 변경 없으면 undefined. (영상 대상이면 첫 프레임 캡처 still)
  // 우선순위: 사용자가 '대표'로 고른 것 > (기존 썸네일이 아직 유효하면 유지) > 첫 이미지
  function resolvePickedThumb(col, imgVals) {
    if (!col.auto || imgVals.__thumbset) return Promise.resolve(undefined); // 새 앨범은 업로드가 지정
    var widget = document.querySelector('#admForm .am-thumbpick');
    if (!widget) return Promise.resolve(undefined);
    var all = (imgVals.image_files || "").split("|").map(function (s) { return s.trim(); }).filter(Boolean);
    var cur = widget.getAttribute("data-curthumb") || "";
    var picked = document.querySelector('#admForm input[name="__thumb"]:checked');
    function stillOf(v) { return v.replace(/\.[^.]+$/, "") + "-thumb.jpg"; }
    function valid(t) { // 현재 썸네일이 최종 목록에서 유효한가
      if (!t) return false;
      if (all.indexOf(t) >= 0) return true;
      // 영상 캡처 still(<video>-thumb.jpg)이고 원본 영상이 목록에 있으면 유효
      return all.some(function (p) { return isVid(p) && stillOf(p) === t; });
    }
    var target = picked ? picked.value : null;
    if (!target) {
      if (valid(cur)) return Promise.resolve(undefined);        // 기존 썸네일 유지
      target = all.filter(function (p) { return !isVid(p); })[0] || all[0]; // 폴백: 첫 이미지/첫 항목
    }
    if (!target) return Promise.resolve(undefined);
    if (!isVid(target)) return Promise.resolve(target === cur ? undefined : target);
    if (cur === stillOf(target)) return Promise.resolve(undefined); // 이미 캡처됨
    return captureFrame("assets/img/album/" + target).then(function (b64) {
      return b64 ? uploadVideoStill(b64, target) : target;
    });
  }

  function openModal() { document.getElementById("admModal").setAttribute("aria-hidden", "false"); document.body.style.overflow = "hidden"; }
  function closeModal() { document.getElementById("admModal").setAttribute("aria-hidden", "true"); document.body.style.overflow = ""; }
  function setFormMsg(t, kind) {
    var m = document.getElementById("admFormMsg"); m.textContent = t || "";
    m.className = "am-msg" + (kind ? " am-" + kind : "");
  }

  /* ---------------- 저장 (추가/수정) ---------------- */
  function onSubmit() {
    var col = COLLECTIONS[curKey];
    var reqf = col.fields.filter(function (f) { return f.required; })[0];
    if (reqf && !formVal(reqf.name)) { setFormMsg(reqf.label + "은(는) 필수입니다.", "err"); return; }

    setFormMsg("저장 중… (사진이 있으면 업로드 후 커밋)", "");
    // 1) 이미지 업로드 → 경로 결정
    uploadFormImages(col).then(function (imgVals) {
      // 2) row 객체 구성
      var row = {};
      col.fields.forEach(function (fd) {
        if (fd.type === "image" || fd.type === "images" || fd.type === "file" || fd.type === "md" || fd.type === "thumbpick") return;
        if (fd.type === "check") {
          var cb = document.querySelector('#admForm input[type=checkbox][data-name="' + fd.name + '"]');
          row[fd.name] = cb && cb.checked ? "Y" : "";
          return;
        }
        row[fd.name] = formVal(fd.name);
      });
      Object.keys(imgVals).forEach(function (k) { row[k] = imgVals[k]; });
      // 출판물 제목은 Title Case 규칙 자동 적용
      if (col.isPub && row.title && global.TitleCase) row.title = global.TitleCase(row.title);

      var msgName = row[col.idCol] || row.title || "item";
      if (col.auto) { // album — 입력 날짜(있으면) 기준
        var stamp = albumStamp();
        row.date = stamp; row.year = stamp.slice(0, 4);
      }

      var headerCols = col.fields
        .filter(function (fd) { return fd.type !== "images" && fd.type !== "md" && fd.type !== "thumbpick"; })
        .map(function (fd) { return fd.name; });
      // 앨범 썸네일 선택(영상이면 첫 프레임 캡처) 반영 후 커밋
      return resolvePickedThumb(col, imgVals).then(function (picked) {
        if (picked !== undefined) row.thumbnail_file = picked;
        return commitCsv(csvPathOf(col), (editingId ? "Update " : "Add ") + col.label + ": " + msgName, function (rows) {
          var ix = colIndex(rows);
          if (editingId) {
            var idi = ix[col.idCol], hit = false;
            for (var i = 1; i < rows.length; i++) {
              if ((rows[i][idi] || "").trim() === editingId) {
                setCells(rows[i], ix, row, col); hit = true; break;
              }
            }
            if (!hit) throw new Error("수정할 항목을 찾지 못했습니다.");
          } else {
            var cells = new Array((rows[0] || []).length).fill("");
            setCells(cells, ix, row, col);
            rows.splice(1, 0, cells); // 맨 위(최신)
          }
        }, headerCols).then(function () { return commitDetailMd(col); });
      });
    }).then(function () {
      setFormMsg("저장 완료! 1~2분 후 사이트에 반영됩니다.", "ok");
      setTimeout(function () { closeModal(); loadList(); }, 900);
    }).catch(function (e) { setFormMsg(e.message, "err"); });
  }

  // row 객체의 값을 cells(배열)에 헤더 위치대로 기록 (정의된 필드만; 나머지 보존)
  function setCells(cells, ix, row, col) {
    col.fields.forEach(function (fd) {
      var name = fd.type === "images" ? null : fd.name;
      if (name && ix[name] != null) cells[ix[name]] = row[name] || "";
    });
    // album: image_files / thumbnail_file
    if (row.image_files != null && ix.image_files != null) cells[ix.image_files] = row.image_files;
    if (row.thumbnail_file != null && ix.thumbnail_file != null) cells[ix.thumbnail_file] = row.thumbnail_file;
    if (col.auto) {
      if (ix.date != null) cells[ix.date] = row.date;
      if (ix.year != null) cells[ix.year] = row.year;
    }
  }

  // 프로젝트 상세 본문(md) 커밋: 본문_ko → data/<slug>_ko.md, 본문_en → data/<slug>.md
  function commitDetailMd(col) {
    var mds = col.fields.filter(function (fd) { return fd.type === "md"; });
    var slugVal = formVal("slug");
    if (!mds.length || !slugVal) return Promise.resolve();
    return mds.reduce(function (chain, fd) {
      return chain.then(function () {
        var ta = document.querySelector('#admForm textarea[data-name="' + fd.name + '"]');
        if (!ta || !ta.value.trim()) return; // 비어 있으면 건너뜀(기존 파일 보존)
        var text = ta.value.replace(/\s+$/, "") + "\n";
        var path = "data/" + slugVal + (fd.mdLang === "en" ? "" : "_ko") + ".md";
        return commitText(path, text, "Update project detail: " + slugVal + " (" + fd.mdLang + ")");
      });
    }, Promise.resolve());
  }

  // 폼의 이미지 필드들을 업로드하고 경로 값 반환
  function uploadFormImages(col) {
    var jobs = [];
    var result = {};
    col.fields.forEach(function (fd) {
      var files = pendingFiles[fd.name];
      if (fd.type === "image") {
        if (files && files[0]) {
          var base = fd.dir
            ? fd.dir().replace(/\/$/, "") + "/" + (fd.filename ? fd.filename(files[0]) : safeName(files[0].name))
            : col.imgDir + slug(formVal("name_english") || formVal("title") || "photo") + ".jpg";
          jobs.push(fileToB64(files[0], true).then(function (b64) {
            return uploadImage(base, b64, "Upload image: " + base).then(function () { result[fd.name] = base; });
          }));
        } else {
          var keep = document.querySelector('#admForm input[type=hidden][data-name="' + fd.name + '"]');
          result[fd.name] = keep ? keep.value : "";
        }
      } else if (fd.type === "images") {
        // 위젯에 남은 기존 미디어(삭제·순서 반영). 새 앨범엔 위젯이 없어 [].
        var existing = readMediaOrder() || [];
        if (files && files.length) {
          var stamp = albumStamp();   // 입력 날짜 기준 폴더(연/월)
          var ym = stamp.slice(0, 4) + "/" + stamp.slice(5, 7);
          var paths = [];
          var chain = Promise.resolve();
          Array.prototype.forEach.call(files, function (file, i) {
            chain = chain.then(function () {
              var isVidF = /\.(mp4|webm|mov|m4v)$/i.test(file.name) || /^video\//.test(file.type || "");
              var ext = isVidF ? ((file.name.match(/\.[a-z0-9]+$/i) || [".mp4"])[0].toLowerCase()) : ".jpg";
              var p = "assets/img/album/" + ym + "/" + slug(formVal("title")) + "-" +
                Math.round(performance.now()) + "-" + (i + 1) + ext;
              return fileToB64(file, !isVidF).then(function (b64) {  // 영상은 리사이즈 없이 원본
                return uploadImage(p, b64, "Upload album media").then(function () { paths.push(p.replace("assets/img/album/", "")); });
              });
            });
          });
          jobs.push(chain.then(function () {
            result.image_files = existing.concat(paths).join("|");   // 기존 유지 + 추가
            if (existing.length) return;                             // 편집: 썸네일은 picker/유지 로직이 처리
            // 새 앨범: 기본 썸네일(이미지 우선, 전부 영상이면 첫 프레임 캡처)
            var firstImg = paths.filter(function (p) { return !isVid(p); })[0];
            if (firstImg) { result.thumbnail_file = firstImg; result.__thumbset = true; return; }
            if (paths[0] && files[0]) {
              return captureFrame(URL.createObjectURL(files[0])).then(function (b64) {
                result.thumbnail_file = b64 ? null : paths[0]; result.__thumbset = true;
                if (b64) return uploadVideoStill(b64, paths[0]).then(function (s) { result.thumbnail_file = s; });
              });
            }
            result.thumbnail_file = paths[0] || ""; result.__thumbset = true;
          }));
        } else if (existing.length) {
          // 새 업로드 없음 → 위젯의 현재 순서/삭제만 반영
          result.image_files = existing.join("|");
        }
      } else if (fd.type === "file") {
        if (files && files[0]) {
          var f0 = files[0];
          var dir = (fd.dir ? fd.dir() : "assets/files").replace(/\/$/, "");
          var fn = fd.filename ? fd.filename(f0) : safeName(f0.name);
          var fpath = dir + "/" + fn;
          jobs.push(fileToB64(f0, false).then(function (b64) {
            return uploadImage(fpath, b64, "Upload file: " + fpath).then(function () { result[fd.name] = fpath; });
          }));
        } else {
          var keepF = document.querySelector('#admForm input[type=hidden][data-name="' + fd.name + '"]');
          result[fd.name] = keepF ? keepF.value : "";
        }
      }
    });
    return Promise.all(jobs).then(function () { return result; });
  }

  /* ---------------- 삭제 ---------------- */
  function doDelete(id) {
    if (!token()) { setMsg("먼저 GitHub 토큰을 저장하세요.", "err"); return; }
    var col = COLLECTIONS[curKey];
    if (!global.confirm("삭제할까요?\n\n" + id)) return;
    setMsg("삭제 중…", "");
    commitCsv(csvPathOf(col), "Delete " + col.label + ": " + id, function (rows) {
      var idi = colIndex(rows)[col.idCol], hit = false;
      for (var i = 1; i < rows.length; i++) {
        if ((rows[i][idi] || "").trim() === id) { rows.splice(i, 1); hit = true; break; }
      }
      if (!hit) throw new Error("삭제할 항목을 찾지 못했습니다.");
    }).then(function () {
      setMsg("삭제 완료! 1~2분 후 반영됩니다.", "ok"); loadList();
    }).catch(function (e) { setMsg(e.message, "err"); });
  }

  /* ---------------- 다른 CSV로 이동 (예: 현재 과제 → 완료) ---------------- */
  function doMoveTo(row) {
    if (!token()) { setMsg("먼저 GitHub 토큰을 저장하세요.", "err"); return; }
    if (!row) return;
    var col = COLLECTIONS[curKey];
    var mv = col.moveTo;
    var id = (row[col.idCol] || "").trim();
    if (!global.confirm((mv.label || "이동") + " : " + id + " ?\n완료(Past) 목록으로 옮기고 현재 목록에서 제거합니다.")) return;
    setMsg("이동 중…", "");
    var endYear = (row["종료연도"] || "").trim();
    if (!endYear) { var m = (row["종료"] || "").match(/(\d{4})/); endYear = m ? m[1] : ""; }
    // 1) 대상(완료)에 추가
    commitCsv(mv.csv, "Move project to past: " + id, function (rows) {
      var ix = colIndex(rows);
      var cells = new Array((rows[0] || []).length).fill("");
      mv.cols.forEach(function (c) {
        if (ix[c] == null) return;
        cells[ix[c]] = c === "종료연도" ? endYear : (row[c] || "");
      });
      rows.splice(1, 0, cells);
    })
      // 2) 현재에서 제거
      .then(function () {
        return commitCsv(col.csv, "Remove project from current: " + id, function (rows) {
          var idi = colIndex(rows)[col.idCol], hit = false;
          for (var i = 1; i < rows.length; i++) {
            if ((rows[i][idi] || "").trim() === id) { rows.splice(i, 1); hit = true; break; }
          }
          if (!hit) throw new Error("현재 목록에서 항목을 찾지 못했습니다.");
        });
      })
      .then(function () { setMsg("완료(Past)로 이동했습니다! 1~2분 후 반영됩니다.", "ok"); loadList(); })
      .catch(function (e) { setMsg("이동 실패: " + e.message, "err"); });
  }

  /* ---------------- Member → Alumni 이동 ---------------- */
  function openMove(member) {
    if (!token()) { setMsg("먼저 GitHub 토큰을 저장하세요.", "err"); return; }
    if (!member) return;
    editingId = null; pendingFiles = {};
    document.getElementById("admFormTitle").textContent = "Alumni로 이동 — " + (member.name_english || "");
    document.getElementById("admForm").innerHTML =
      '<p class="am-note">아래 졸업 정보를 입력하면 members에서 빼고 alumni로 옮깁니다. (사진도 함께 이동)</p>' +
      field("이름 (한국어)", "mv_ko", member.name_korean) +
      field("Name (English)", "mv_en", member.name_english) +
      '<label class="am-field"><span>학위</span><select data-name="mv_deg">' +
        DEGREE_A.map(function (o) { return '<option' + (o === member["학위"] ? " selected" : "") + ">" + o + "</option>"; }).join("") +
      "</select></label>" +
      field("직함 (예: Ph.D. (2026 August))", "mv_title", member["직함"]) +
      field("현 소속", "mv_pos", "") +
      field("졸업논문 제목", "mv_thesis", "") +
      field("이메일", "mv_email", member.email);
    document.getElementById("admSubmit").onclick = function () { doMove(member); };
    document.getElementById("admFormMsg").textContent = "";
    openModal();
  }
  function field(label, name, v) {
    return '<label class="am-field"><span>' + esc(label) + '</span><input type="text" data-name="' + name + '" value="' + esc(v || "") + '"></label>';
  }
  function mv(name) { var el = document.querySelector('#admForm [data-name="' + name + '"]'); return el ? el.value.trim() : ""; }

  function doMove(member) {
    var en = mv("mv_en");
    if (!en) { setFormMsg("Name (English)는 필수입니다.", "err"); return; }
    setFormMsg("이동 중… (사진 복사 → alumni 추가 → members 삭제)", "");
    var newPhoto = "assets/img/people/alumni/" + slug(en) + ".jpg";
    var oldPhoto = (member.photo_path || "").trim();

    // 1) 사진 복사 (있으면)
    var step = Promise.resolve();
    if (oldPhoto) {
      step = getFile(oldPhoto).then(function (img) {
        if (img && img.content) return uploadImage(newPhoto, img.content.replace(/\s/g, ""), "Move photo to alumni: " + en);
      });
    }
    var aRow = {
      name_korean: mv("mv_ko"), name_english: en, "직함": mv("mv_title"), "학위": mv("mv_deg"),
      "졸업논문": mv("mv_thesis"), email: mv("mv_email"), homepage: member.homepage || "",
      scholar: member.scholar || "", current_position: mv("mv_pos"),
      photo_path: oldPhoto ? newPhoto : "",
    };
    // 2) alumni 추가
    step = step.then(function () {
      return commitCsv("data/people_alumni.csv", "Add alumni (moved): " + en, function (rows) {
        var ix = colIndex(rows);
        var cells = new Array((rows[0] || []).length).fill("");
        Object.keys(aRow).forEach(function (k) { if (ix[k] != null) cells[ix[k]] = aRow[k]; });
        rows.splice(1, 0, cells);
      });
    });
    // 3) members 삭제
    step = step.then(function () {
      return commitCsv("data/people_members.csv", "Remove member (moved to alumni): " + en, function (rows) {
        var idi = colIndex(rows).name_english;
        for (var i = 1; i < rows.length; i++) {
          if ((rows[i][idi] || "").trim() === (member.name_english || "")) { rows.splice(i, 1); break; }
        }
      });
    });
    step.then(function () {
      setFormMsg("이동 완료! 1~2분 후 반영됩니다.", "ok");
      document.getElementById("admSubmit").onclick = onSubmit;
      setTimeout(function () { closeModal(); loadList(); }, 1000);
    }).catch(function (e) { setFormMsg(e.message, "err"); });
  }

  global.Admin = { init: init };
})(window);
