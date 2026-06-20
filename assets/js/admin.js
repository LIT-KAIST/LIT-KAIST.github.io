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
    return "12-Season/12-Season.github.io";
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
  function commitCsv(csvPath, message, transform) {
    return getFile(csvPath).then(function (data) {
      if (!data) throw new Error("CSV를 찾을 수 없습니다: " + csvPath);
      var rows = P._parseCSV(b64decode(data.content));
      transform(rows);
      return putFile(csvPath, b64encode(serialize(rows)), message, data.sha);
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
        { name: "images", label: "사진 (여러 장 가능, 첫 장이 썸네일)", type: "images" },
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
    projects: {
      label: "Projects", csv: "data/projects.csv", idCol: "title",
      sub: function (r) { return (r.status || "") + (r.period ? " · " + r.period : ""); },
      fields: [
        { name: "title", label: "제목 (한국어)", required: true },
        { name: "title_en", label: "Title (English)" },
        { name: "status", label: "상태", type: "select", options: ["current", "past"] },
        { name: "period", label: "기간 (예: 2023.07–2030.12)" },
        { name: "agency", label: "지원/주관 기관" },
        { name: "role", label: "역할 (주관/공동 등)" },
        { name: "description", label: "설명 (한국어)", type: "textarea" },
        { name: "description_en", label: "Description (English)", type: "textarea" },
        { name: "url", label: "링크 URL" },
      ],
    },
  };

  /* ---------------- UI ---------------- */
  var root, msgEl, listEl, curKey, curPubTarget;

  function setMsg(t, kind) {
    msgEl.textContent = t || "";
    msgEl.className = "adm-msg" + (kind ? " adm-" + kind : "");
  }
  function csvPathOf(col) {
    return col.isPub ? "data/" + curPubTarget + ".csv" : col.csv;
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
    if (col.isPub) {
      curPubTarget = col.targets[0].key;
      pubSel.innerHTML = '<select id="admPubTarget">' + col.targets.map(function (t) {
        return '<option value="' + t.key + '">' + esc(t.label) + "</option>";
      }).join("") + "</select>";
      document.getElementById("admPubTarget").addEventListener("change", function () {
        curPubTarget = this.value; loadList();
      });
    } else {
      pubSel.innerHTML = "";
    }
    document.getElementById("admFilter").value = "";
    loadList();
  }

  var rowsCache = [];
  function loadList() {
    var col = COLLECTIONS[curKey];
    listEl.innerHTML = '<p class="muted">목록 불러오는 중…</p>';
    fetch(csvPathOf(col) + "?z=" + Math.round(performance.now()), { cache: "no-store" })
      .then(function (r) { return r.text(); })
      .then(function (t) {
        rowsCache = P._rowsToObjects(P._parseCSV(t));
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
    listEl.innerHTML = '<div class="adm-count">' + list.length + "개</div>" +
      list.map(function (r) {
        var id = r[col.idCol] || r.title || "";
        var disp = col.title ? (col.title(r) || id) : id;
        return '<div class="adm-row">' +
          '<div class="adm-row-main"><span class="adm-row-title">' + esc(disp) + "</span>" +
          '<span class="adm-row-sub">' + esc(col.sub ? col.sub(r) : "") + "</span></div>" +
          '<div class="adm-row-act">' +
            (col.moveToAlumni ? '<button type="button" class="adm-mini" data-act="move" data-id="' + esc(id) + '">→ Alumni</button>' : "") +
            '<button type="button" class="adm-mini" data-act="edit" data-id="' + esc(id) + '">수정</button>' +
            '<button type="button" class="adm-mini adm-danger" data-act="del" data-id="' + esc(id) + '">삭제</button>' +
          "</div></div>";
      }).join("");
    Array.prototype.forEach.call(listEl.querySelectorAll(".adm-mini"), function (b) {
      var id = b.getAttribute("data-id"), act = b.getAttribute("data-act");
      b.addEventListener("click", function () {
        if (act === "edit") openForm(findRow(id));
        else if (act === "del") doDelete(id);
        else if (act === "move") openMove(findRow(id));
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
      (row ? "수정" : "추가") + " — " + col.label + (col.isPub ? " (" + curPubTarget + ")" : "");
    var f = document.getElementById("admForm");
    f.innerHTML = col.fields.map(function (fd) { return fieldHtml(fd, row); }).join("");
    // 이미지 입력 미리보기 핸들러
    Array.prototype.forEach.call(f.querySelectorAll("input[type=file]"), function (inp) {
      inp.addEventListener("change", function () {
        pendingFiles[inp.getAttribute("data-name")] = inp.files;
      });
    });
    document.getElementById("admFormMsg").textContent = "";
    openModal();
  }

  function fieldHtml(fd, row) {
    var v = row ? (row[fd.name] || "") : "";
    var lab = '<span>' + esc(fd.label) + (fd.required ? " *" : "") + "</span>";
    if (fd.type === "select") {
      return '<label class="am-field">' + lab + '<select data-name="' + fd.name + '">' +
        fd.options.map(function (o) {
          return '<option value="' + esc(o) + '"' + (o === v ? " selected" : "") + ">" + esc(o) + "</option>";
        }).join("") + "</select></label>";
    }
    if (fd.type === "textarea") {
      return '<label class="am-field">' + lab + '<textarea data-name="' + fd.name + '" rows="4">' + esc(v) + "</textarea></label>";
    }
    if (fd.type === "image") {
      return '<label class="am-field">' + lab +
        (v ? '<span class="am-cur">현재: ' + esc(v) + "</span>" : "") +
        '<input type="file" accept="image/*" data-name="' + fd.name + '">' +
        '<input type="hidden" data-name="' + fd.name + '" value="' + esc(v) + '"></label>';
    }
    if (fd.type === "images") {
      return '<label class="am-field">' + lab +
        '<input type="file" accept="image/*" multiple data-name="' + fd.name + '"></label>';
    }
    return '<label class="am-field">' + lab + '<input type="text" data-name="' + fd.name + '" value="' + esc(v) + '"></label>';
  }

  function formVal(name) {
    var el = document.querySelector('#admForm [data-name="' + name + '"]:not([type=file])');
    return el ? el.value.trim() : "";
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
        if (fd.type === "image" || fd.type === "images") return;
        row[fd.name] = formVal(fd.name);
      });
      Object.keys(imgVals).forEach(function (k) { row[k] = imgVals[k]; });

      var msgName = row[col.idCol] || row.title || "item";
      if (col.auto) { // album
        var stamp = editingId || nowStamp();
        row.date = stamp; row.year = stamp.slice(0, 4);
      }

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

  // 폼의 이미지 필드들을 업로드하고 경로 값 반환
  function uploadFormImages(col) {
    var jobs = [];
    var result = {};
    col.fields.forEach(function (fd) {
      var files = pendingFiles[fd.name];
      if (fd.type === "image") {
        if (files && files[0]) {
          var base = col.imgDir + slug(formVal("name_english") || formVal("title") || "photo") + ".jpg";
          jobs.push(fileToB64(files[0], true).then(function (b64) {
            return uploadImage(base, b64, "Upload image: " + base).then(function () { result[fd.name] = base; });
          }));
        } else {
          var keep = document.querySelector('#admForm input[type=hidden][data-name="' + fd.name + '"]');
          result[fd.name] = keep ? keep.value : "";
        }
      } else if (fd.type === "images") {
        if (files && files.length) {
          var stamp = (editingId || nowStamp());
          var ym = stamp.slice(0, 4) + "/" + stamp.slice(5, 7);
          var paths = [];
          // 순차 업로드
          var chain = Promise.resolve();
          Array.prototype.forEach.call(files, function (file, i) {
            chain = chain.then(function () {
              var p = "assets/img/album/" + ym + "/" + slug(formVal("title")) + "-" +
                Math.round(performance.now()) + "-" + (i + 1) + ".jpg";
              return fileToB64(file, true).then(function (b64) {
                return uploadImage(p, b64, "Upload album image").then(function () { paths.push(p.replace("assets/img/album/", "")); });
              });
            });
          });
          jobs.push(chain.then(function () {
            result.image_files = paths.join("|");
            result.thumbnail_file = paths[0] || "";
          }));
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
