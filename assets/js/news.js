/* ==========================================================================
   LIT @ KAIST — News / Board
   - data/news.csv (date,year,forum,title,title_en,content,content_en,links,status)
   - 이중언어: 현재 언어(LitI18n)에 따라 _en 필드 사용, 언어 토글 시 재렌더
   - News.initPage(): 뉴스 목록 페이지 (+ GitHub 토큰 기반 관리자 등록)
   - News.renderRecent(): 홈페이지 최근 N개 제목 블록
   ========================================================================== */
(function (global) {
  var P = global.Pubs;

  // ▼ 저장소 정보 (관리자 등록이 커밋할 대상)
  // 보통은 자동 감지되므로 손댈 필요 없습니다.
  // 커스텀 도메인(예: lit.kaist.ac.kr)을 쓰면 아래 REPO_OVERRIDE 에 "owner/repo" 를 적어주세요.
  var REPO_OVERRIDE = ""; // 예: "litlab/litlab.github.io"
  var FILE = "data/news.csv";
  var BRANCH = "main";

  // <계정>.github.io 호스팅이면 호스트명에서 저장소를 자동 추론.
  // (다른 연구실 공용 계정으로 옮겨도 코드 수정 없이 그대로 동작)
  function resolveRepo() {
    if (REPO_OVERRIDE) return REPO_OVERRIDE;
    var h = (global.location.hostname || "").toLowerCase();
    if (/\.github\.io$/.test(h)) return h.replace(/\.github\.io$/, "") + "/" + h;
    return "LIT-KAIST/LIT-KAIST.github.io"; // 로컬/커스텀도메인 fallback
  }
  var COLS = ["date", "year", "forum", "title", "title_en", "content", "content_en", "links", "status"];

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function lang() { return global.LitI18n ? global.LitI18n.get() : "ko"; }
  function pick(row, field) {
    if (lang() === "en") return (row[field + "_en"] || "").trim() || row[field] || "";
    return row[field] || "";
  }
  function slug(date) {
    return "n-" + String(date || "").replace(/[^0-9]/g, "");
  }
  function dateLabel(row) {
    var d = (row.date || "").trim().slice(0, 10);
    return d ? d.replace(/-/g, ".") : (row.year || "");
  }
  function nl2br(s) { return esc(s).replace(/\r?\n/g, "<br>"); }

  // 뉴스 유형 자동 분류 (forum 값이 유형키와 같으면 우선, 아니면 제목 키워드로 추정)
  var TYPES = [
    { key: "obituary", ko: "부고", en: "Obituary", emoji: "🕯", re: /부고|별세|영면|조의|조문|부친상|모친상|빙모상|빈소|passed\s*away|obituary|condolence|funeral|in\s*memoriam/i },
    { key: "award", ko: "수상", en: "Award", emoji: "🏆", re: /수상|우승|입상|대상|최우수|우수상|장려상|금상|은상|동상|챌린지|공모전|선정.*(우수|최우수)|award|prize|best\s*paper|honorable/i },
    { key: "paper", ko: "논문 게재", en: "Publication", emoji: "📄", re: /논문|게재|채택|등재|accept|\bpaper\b|journal|conference|proceedings/i },
    { key: "people", ko: "인사·축하", en: "People", emoji: "🎉", re: /축하|진급|임용|임관|조교수|부교수|정교수|취임|합격|졸업|입학|학위|수료|입사|취업|joined|graduat|professor|faculty|appoint/i },
    { key: "event", ko: "행사·활동", en: "Event", emoji: "📅", re: /세미나|워크숍|워크샵|엠티|\bMT\b|행사|회식|체육대회|개최|참가|참석|발표회|튜토리얼|탐방|현장|방문|간담회|모임|workshop|seminar|retreat|event/i },
  ];
  function newsType(row) {
    var f = (row.forum || "").trim().toLowerCase();
    for (var i = 0; i < TYPES.length; i++) { if (f === TYPES[i].key) return TYPES[i]; }
    var hay = (row.forum || "") + " " + (row.title || "") + " " + (row.title_en || "") + " " + (row.content || "");
    for (var j = 0; j < TYPES.length; j++) { if (TYPES[j].re.test(hay)) return TYPES[j]; }
    return { key: "news", ko: "소식", en: "News", emoji: "📰" };
  }
  function tagHtml(row) {
    var t = newsType(row);
    return '<span class="ni-tag">' + t.emoji + " " + esc(lang() === "en" ? t.en : t.ko) + "</span>";
  }

  // 대표 이미지(1장) + 관련 앨범 연동 링크
  function imageHtml(row) {
    var img = (row.image || "").trim();
    if (!img) return "";
    var alb = (row.album || "").trim();
    var im = '<img class="ni-img" src="' + esc(img) + '" alt="' + esc(pick(row, "title")) + '" loading="lazy">';
    if (alb) {
      var more = lang() === "en" ? "See more photos →" : "사진 더 보기 →";
      return '<div class="ni-media"><a class="ni-imglink album" href="album.html?a=' + encodeURIComponent(alb) + '">' + im +
        '<span class="ni-more">' + more + "</span></a></div>";
    }
    return '<div class="ni-media"><a class="ni-imglink" href="' + esc(img) + '" target="_blank" rel="noopener">' + im + "</a></div>";
  }
  // 카드용 이미지(링크 없이 — 카드 클릭이 모달을 열도록)
  function cardImageHtml(row) {
    var img = (row.image || "").trim();
    if (!img) return "";
    return '<div class="ni-media"><img class="ni-img" src="' + esc(img) + '" alt="' + esc(pick(row, "title")) + '" loading="lazy"></div>';
  }
  function linksHtml(row) {
    var raw = (row.links || "").trim();
    if (!raw) return "";
    var items = raw.split("|").map(function (s) { return s.trim(); }).filter(Boolean);
    return items.map(function (u) {
      var label = u.replace(/^https?:\/\//, "").replace(/\/$/, "");
      if (label.length > 40) label = label.slice(0, 38) + "…";
      return '<a class="ni-link" href="' + esc(u) + '" target="_blank" rel="noopener">🔗 ' + esc(label) + "</a>";
    }).join("");
  }

  function loadNews(csv) {
    return fetch(csv, { cache: "no-store" })
      .then(function (r) { if (!r.ok) throw new Error(csv + " (HTTP " + r.status + ")"); return r.text(); })
      .then(function (t) {
        return P._rowsToObjects(P._parseCSV(t))
          .filter(function (x) { return (x.status || "").trim() === "publish" && (x.title || "").trim(); })
          .sort(function (a, b) { return (b.date || "").localeCompare(a.date || ""); });
      });
  }

  /* ====================== 뉴스 목록 페이지 ====================== */
  function initPage(cfg) {
    var mount = document.getElementById(cfg.mount);
    var news = [];
    var adminMode = false;   // 관리 모드(수정/삭제 버튼 표시) 토글
    var editTarget = null;   // 수정 중인 항목의 date (null = 새 등록)
    mount.innerHTML = '<p class="muted" style="padding:24px 0">불러오는 중…</p>';

    loadNews(cfg.csv)
      .then(function (rows) {
        news = rows;
        render();
        if (cfg.admin) buildAdmin();
        focusHash();
      })
      .catch(function (err) {
        mount.innerHTML = '<div class="error">뉴스를 불러오지 못했습니다. 로컬에서는 ' +
          "<code>python3 -m http.server</code> 로 열어주세요.<br>" + esc(err.message) + "</div>";
      });

    function itemHtml(row) {
      return (
        '<article class="news-item reveal" data-type="' + newsType(row).key + '" id="' + slug(row.date) + '">' +
          cardImageHtml(row) +
          '<div class="ni-head">' +
            tagHtml(row) +
            '<span class="ni-date">' + esc(dateLabel(row)) + "</span>" +
          "</div>" +
          '<h3 class="ni-title">' + esc(pick(row, "title")) + "</h3>" +
          '<div class="ni-content">' + nl2br(pick(row, "content")) + "</div>" +
          '<div class="ni-foot">' +
            '<span class="ni-cmt" data-news="' + esc(slug(row.date)) + '"></span>' +
            '<span class="ni-like" data-key="news:' + esc(slug(row.date)) + '"></span>' +
          "</div>" +
          (adminMode
            ? '<div class="ni-admin">' +
                '<button type="button" class="ni-edit" data-date="' + esc(row.date) + '">수정</button>' +
                '<button type="button" class="ni-del" data-date="' + esc(row.date) + '">삭제</button>' +
              "</div>"
            : "") +
        "</article>"
      );
    }

    function render() {
      var years = [];
      news.forEach(function (r) { var y = (r.year || "").trim(); if (y && years.indexOf(y) < 0) years.push(y); });
      years.sort(function (a, b) { return b - a; });
      var html = years.map(function (y) {
        var list = news.filter(function (r) { return (r.year || "").trim() === y; });
        return '<section class="news-year"><h2 class="year">' + esc(y) +
          ' <span class="year-count">' + list.length + "</span></h2>" +
          '<div class="news-grid">' + list.map(itemHtml).join("") + "</div></section>";
      }).join("");
      mount.innerHTML = html || '<p class="muted">뉴스가 없습니다.</p>';
      if (global.LitReveal) global.LitReveal.observe(mount.querySelectorAll(".reveal"));
      if (global.LitLikes) {
        Array.prototype.forEach.call(mount.querySelectorAll(".ni-like[data-key]"), function (el) {
          global.LitLikes.mount(el, el.getAttribute("data-key"));
        });
      }
      if (global.LitComments && global.LitComments.newsCount) {
        Array.prototype.forEach.call(mount.querySelectorAll(".ni-cmt[data-news]"), function (el) {
          global.LitComments.newsCount(el, el.getAttribute("data-news"));
        });
      }
    }

    function focusHash() {
      var id = location.hash.replace(/^#/, "");
      if (!id) return;
      var row = news.filter(function (r) { return slug(r.date) === id; })[0];
      if (row) { openNews(row); return; }
      var el = document.getElementById(id);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ni-flash");
      setTimeout(function () { el.classList.remove("ni-flash"); }, 2200);
    }

    // 카드 클릭 → 확대 모달 (좋아요·수정·삭제·링크 클릭은 제외)
    mount.addEventListener("click", function (e) {
      if (e.target.closest(".ni-like") || e.target.closest(".ni-edit") || e.target.closest(".ni-del") || e.target.closest("a")) return;
      var art = e.target.closest(".news-item"); if (!art) return;
      var row = news.filter(function (r) { return slug(r.date) === art.id; })[0];
      if (row) openNews(row);
    });

    // 언어 토글 시 재렌더 (제목·본문이 언어별로 다름)
    document.addEventListener("lit:lang", function () { render(); });

    /* ---------------- 관리자(깃허브 토큰) 등록/수정/삭제 ---------------- */
    var amModal = null;

    function buildAdmin() {
      var bar = document.createElement("div");
      bar.className = "admin-launch";
      bar.innerHTML =
        '<button type="button" class="admin-btn" id="adminNew">✎ 새 뉴스</button>' +
        '<button type="button" class="admin-btn" id="adminMode">관리 모드</button>';
      mount.parentNode.insertBefore(bar, mount);

      amModal = document.createElement("div");
      amModal.className = "admin-modal";
      amModal.setAttribute("aria-hidden", "true");
      amModal.innerHTML =
        '<div class="am-panel">' +
          '<button type="button" class="am-close" aria-label="닫기">&times;</button>' +
          '<h2 id="amHeading">뉴스 등록 (관리자)</h2>' +
          '<p class="am-note">GitHub 개인 토큰(권한: 이 저장소 Contents 읽기/쓰기)이 필요합니다. ' +
          "토큰은 이 브라우저에만 저장되며 사이트에 올라가지 않습니다.</p>" +
          '<label class="am-field"><span>GitHub 토큰</span>' +
            '<input type="password" id="amToken" placeholder="ghp_… 또는 github_pat_…" autocomplete="off"></label>' +
          '<div class="am-row">' +
            '<label class="am-field"><span>분류(forum)</span><input id="amForum" value="Board"></label>' +
            '<label class="am-field"><span>상태</span><select id="amStatus"><option value="publish">publish</option><option value="draft">draft</option></select></label>' +
          "</div>" +
          '<label class="am-field"><span>제목 (한국어)</span><input id="amTitle"></label>' +
          '<label class="am-field"><span>Title (English)</span><input id="amTitleEn"></label>' +
          '<label class="am-field"><span>본문 (한국어)</span><textarea id="amContent" rows="4"></textarea></label>' +
          '<label class="am-field"><span>Content (English)</span><textarea id="amContentEn" rows="4"></textarea></label>' +
          '<label class="am-field"><span>링크 (선택, 여러 개는 | 로 구분)</span><input id="amLinks" placeholder="https://…"></label>' +
          '<div class="am-actions">' +
            '<label class="am-remember"><input type="checkbox" id="amRemember" checked> 토큰 기억</label>' +
            '<button type="button" class="am-submit" id="amSubmit">등록</button>' +
          "</div>" +
          '<div class="am-msg" id="amMsg"></div>' +
        "</div>";
      document.body.appendChild(amModal);

      var saved = localStorage.getItem("lit-gh-token");
      if (saved) amModal.querySelector("#amToken").value = saved;

      amModal.querySelector(".am-close").addEventListener("click", closeModal);
      amModal.addEventListener("click", function (e) { if (e.target === amModal) closeModal(); });
      amModal.querySelector("#amSubmit").addEventListener("click", submitNews);

      document.getElementById("adminNew").addEventListener("click", function () { openAdd(); });
      document.getElementById("adminMode").addEventListener("click", function () {
        adminMode = !adminMode;
        this.classList.toggle("on", adminMode);
        render();
      });

      // 항목의 수정/삭제 버튼 (위임)
      mount.addEventListener("click", function (e) {
        var ed = e.target.closest && e.target.closest(".ni-edit");
        var dl = e.target.closest && e.target.closest(".ni-del");
        if (ed) { openEdit(ed.getAttribute("data-date")); }
        else if (dl) { doDelete(dl.getAttribute("data-date")); }
      });
    }

    function openModal() { amModal.setAttribute("aria-hidden", "false"); document.body.style.overflow = "hidden"; }
    function closeModal() { amModal.setAttribute("aria-hidden", "true"); document.body.style.overflow = ""; }
    function field(id) { return amModal.querySelector("#" + id); }
    function setMsg(text, kind) {
      var m = field("amMsg"); m.textContent = text; m.className = "am-msg" + (kind ? " am-" + kind : "");
    }

    function openAdd() {
      editTarget = null;
      field("amHeading").textContent = "뉴스 등록 (관리자)";
      field("amSubmit").textContent = "등록";
      ["amTitle", "amTitleEn", "amContent", "amContentEn", "amLinks"].forEach(function (id) { field(id).value = ""; });
      field("amForum").value = "Board"; field("amStatus").value = "publish";
      setMsg("");
      openModal();
    }
    function openEdit(date) {
      var row = news.filter(function (r) { return r.date === date; })[0];
      if (!row) return;
      editTarget = date;
      field("amHeading").textContent = "뉴스 수정";
      field("amSubmit").textContent = "수정 저장";
      field("amTitle").value = row.title || ""; field("amTitleEn").value = row.title_en || "";
      field("amContent").value = row.content || ""; field("amContentEn").value = row.content_en || "";
      field("amLinks").value = row.links || "";
      field("amForum").value = row.forum || "Board"; field("amStatus").value = row.status || "publish";
      setMsg("");
      openModal();
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

    // GET → transform(rows) → PUT (rows = 헤더 포함 2차원 배열)
    function commitCsv(token, message, transform) {
      var api = "https://api.github.com/repos/" + resolveRepo() + "/contents/" + FILE;
      var headers = { Authorization: "token " + token, Accept: "application/vnd.github+json" };
      return fetch(api + "?ref=" + BRANCH, { headers: headers, cache: "no-store" })
        .then(function (r) {
          if (r.status === 401) throw new Error("토큰이 유효하지 않습니다 (401).");
          if (!r.ok) throw new Error("파일 조회 실패 (" + r.status + ").");
          return r.json();
        })
        .then(function (data) {
          var rows = global.Pubs._parseCSV(b64decode(data.content));
          transform(rows);
          var out = "﻿" + rows.map(function (r) {
            return r.map(csvField).join(",");
          }).join("\n") + "\n";
          return fetch(api, {
            method: "PUT", headers: headers,
            body: JSON.stringify({ message: message, branch: BRANCH, content: b64encode(out), sha: data.sha }),
          });
        })
        .then(function (r) {
          if (!r.ok) return r.json().then(function (e) {
            throw new Error("커밋 실패 (" + r.status + "): " + (e.message || ""));
          });
          return r.json();
        });
    }

    function submitNews() {
      var token = field("amToken").value.trim();
      var title = field("amTitle").value.trim();
      var content = field("amContent").value.trim();
      if (!token) { setMsg("GitHub 토큰을 입력하세요.", "err"); return; }
      if (!title || !content) { setMsg("제목과 본문(한국어)은 필수입니다.", "err"); return; }
      if (field("amRemember").checked) localStorage.setItem("lit-gh-token", token);
      else localStorage.removeItem("lit-gh-token");

      var isEdit = !!editTarget;
      var stamp = isEdit ? editTarget : nowStamp();
      var row = {
        date: stamp, year: stamp.slice(0, 4),
        forum: field("amForum").value.trim() || "Board",
        title: title, title_en: field("amTitleEn").value.trim(),
        content: content, content_en: field("amContentEn").value.trim(),
        links: field("amLinks").value.trim(),
        status: field("amStatus").value,
      };

      setMsg(isEdit ? "수정 중…" : "등록 중…", "");
      commitCsv(token, (isEdit ? "Update news: " : "Add news: ") + title, function (rows) {
        var ix = colIndex(rows);
        if (isEdit) {
          var di = ix["date"], hit = false;
          for (var i = 1; i < rows.length; i++) {
            if ((rows[i][di] || "").trim() === editTarget) {
              COLS.forEach(function (c) { if (ix[c] != null) rows[i][ix[c]] = row[c] || ""; });
              hit = true; break;
            }
          }
          if (!hit) throw new Error("수정할 항목을 찾지 못했습니다.");
        } else {
          var cells = new Array((rows[0] || COLS).length).fill("");
          COLS.forEach(function (c) { if (ix[c] != null) cells[ix[c]] = row[c] || ""; });
          rows.splice(1, 0, cells);
        }
      })
        .then(function () {
          setMsg((isEdit ? "수정" : "등록") + " 완료! 1~2분 후 사이트에 완전히 반영됩니다.", "ok");
          // 즉시 화면 반영 (낙관적 업데이트)
          if (isEdit) {
            var t = news.filter(function (r) { return r.date === editTarget; })[0];
            if (t) Object.keys(row).forEach(function (k) { t[k] = row[k]; });
          } else if (row.status === "publish") {
            news.unshift(row);
          }
          editTarget = null;
          render();
          setTimeout(closeModal, 900);
        })
        .catch(function (err) { setMsg(err.message, "err"); });
    }

    function doDelete(date) {
      var row = news.filter(function (r) { return r.date === date; })[0];
      var title = row ? (row.title || "") : "";
      if (!global.confirm("이 뉴스를 삭제할까요?\n\n" + title)) return;
      var token = (localStorage.getItem("lit-gh-token") || "").trim();
      if (!token) {
        global.alert("먼저 '✎ 새 뉴스'를 열어 GitHub 토큰을 입력(기억)해 주세요.");
        return;
      }
      commitCsv(token, "Delete news: " + title, function (rows) {
        var di = colIndex(rows)["date"], hit = false;
        for (var i = 1; i < rows.length; i++) {
          if ((rows[i][di] || "").trim() === date) { rows.splice(i, 1); hit = true; break; }
        }
        if (!hit) throw new Error("삭제할 항목을 찾지 못했습니다.");
      })
        .then(function () {
          news = news.filter(function (r) { return r.date !== date; });
          render();
          global.alert("삭제 완료! 1~2분 후 사이트에 완전히 반영됩니다.");
        })
        .catch(function (err) { global.alert("삭제 실패: " + err.message); });
    }
  }

  /* ====================== 홈페이지 최근 뉴스 블록 ====================== */
  function renderRecent(cfg) {
    var mount = document.getElementById(cfg.mount);
    if (!mount) return;
    var count = cfg.count || 6;
    loadNews(cfg.csv).then(function (rows) {
      var recent = rows.slice(0, count);
      function paint() {
        mount.innerHTML = recent.map(function (r) {
          return '<li class="rn-item"><a class="rn-link" href="news.html#' + slug(r.date) + '">' +
            '<span class="rn-date">' + esc(dateLabel(r)) + "</span>" +
            '<span class="rn-title">' + esc(pick(r, "title")) + "</span></a></li>";
        }).join("");
        if (global.LitReveal) global.LitReveal.observe(mount.querySelectorAll(".reveal"));
      }
      paint();
      document.addEventListener("lit:lang", paint);
    }).catch(function () {
      mount.innerHTML = '<li class="muted">뉴스를 불러오지 못했습니다.</li>';
    });
  }

  /* ====================== 뉴스 확대 모달 ====================== */
  var TYPE_COLORS = { paper: "#2563eb", award: "#d97706", event: "#059669", people: "#7c3aed", obituary: "#64748b", news: "#475569" };
  var newsModal = null;
  function buildNewsModal() {
    if (newsModal) return newsModal;
    newsModal = document.createElement("div");
    newsModal.className = "news-modal";
    newsModal.setAttribute("aria-hidden", "true");
    newsModal.innerHTML =
      '<div class="nm-backdrop"></div>' +
      '<div class="nm-panel"><button class="nm-close" type="button" aria-label="닫기">&times;</button><div class="nm-body"></div></div>';
    document.body.appendChild(newsModal);
    function close() {
      newsModal.setAttribute("aria-hidden", "true");
      document.body.style.overflow = "";
      newsModal.querySelector(".nm-body").innerHTML = "";
    }
    newsModal.querySelector(".nm-close").addEventListener("click", close);
    newsModal.querySelector(".nm-backdrop").addEventListener("click", close);
    global.addEventListener("keydown", function (e) {
      if (newsModal.getAttribute("aria-hidden") === "false" && e.key === "Escape") close();
    });
    return newsModal;
  }
  function openNews(row) {
    var m = buildNewsModal();
    var t = newsType(row);
    var panel = m.querySelector(".nm-panel");
    panel.setAttribute("data-type", t.key);
    panel.style.setProperty("--nt", TYPE_COLORS[t.key] || "#475569");
    var body = m.querySelector(".nm-body");
    var img = (row.image || "").trim();
    var alb = (row.album || "").trim();
    var newsId = slug(row.date);
    body.innerHTML =
      (img ? '<img class="nm-banner" src="' + esc(img) + '" alt="' + esc(pick(row, "title")) + '">' : "") +
      '<div class="nm-inner">' +
        '<div class="ni-head">' + tagHtml(row) + '<span class="ni-date">' + esc(dateLabel(row)) + "</span></div>" +
        '<h2 class="nm-title">' + esc(pick(row, "title")) + "</h2>" +
        '<div class="nm-content">' + nl2br(pick(row, "content")) + "</div>" +
        (linksHtml(row) ? '<div class="ni-links">' + linksHtml(row) + "</div>" : "") +
        (alb ? '<p class="nm-albumlink"><a href="album.html?a=' + encodeURIComponent(alb) + '">' + (lang() === "en" ? "See related album →" : "관련 앨범 보기 →") + "</a></p>" : "") +
        '<div class="nm-foot"><span class="nm-foot-label">' + (lang() === "en" ? "Like & comments" : "좋아요 · 댓글") + '</span><span class="ni-like" data-key="news:' + esc(newsId) + '"></span></div>' +
        '<div class="ni-comments" data-news="' + esc(newsId) + '"></div>' +
      "</div>";
    if (global.LitLikes) { var lk = body.querySelector(".ni-like"); if (lk) global.LitLikes.mount(lk, lk.getAttribute("data-key")); }
    if (global.LitComments) { global.LitComments.mount(body); var tg = body.querySelector(".cm-toggle"); if (tg) tg.click(); }
    m.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    body.scrollTop = 0;
  }

  global.News = { initPage: initPage, renderRecent: renderRecent };
})(window);
