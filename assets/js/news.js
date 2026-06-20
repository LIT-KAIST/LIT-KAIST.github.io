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
    return "12-Season/12-Season.github.io"; // 로컬/커스텀도메인 fallback
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
        '<article class="news-item reveal" id="' + slug(row.date) + '">' +
          '<div class="ni-head">' +
            '<span class="ni-date">' + esc(dateLabel(row)) + "</span>" +
            '<h3 class="ni-title">' + esc(pick(row, "title")) + "</h3>" +
          "</div>" +
          '<div class="ni-content">' + nl2br(pick(row, "content")) + "</div>" +
          (linksHtml(row) ? '<div class="ni-links">' + linksHtml(row) + "</div>" : "") +
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
          list.map(itemHtml).join("") + "</section>";
      }).join("");
      mount.innerHTML = html || '<p class="muted">뉴스가 없습니다.</p>';
      if (global.LitReveal) global.LitReveal.observe(mount.querySelectorAll(".reveal"));
    }

    function focusHash() {
      var id = location.hash.replace(/^#/, "");
      if (!id) return;
      var el = document.getElementById(id);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ni-flash");
      setTimeout(function () { el.classList.remove("ni-flash"); }, 2200);
    }

    // 언어 토글 시 재렌더 (제목·본문이 언어별로 다름)
    document.addEventListener("lit:lang", function () { render(); });

    /* ---------------- 관리자(깃허브 토큰) 등록 ---------------- */
    function buildAdmin() {
      var bar = document.createElement("div");
      bar.className = "admin-launch";
      bar.innerHTML = '<button type="button" class="admin-btn" id="adminOpen">✎ 관리자</button>';
      mount.parentNode.insertBefore(bar, mount);

      var modal = document.createElement("div");
      modal.className = "admin-modal";
      modal.setAttribute("aria-hidden", "true");
      modal.innerHTML =
        '<div class="am-panel">' +
          '<button type="button" class="am-close" aria-label="닫기">&times;</button>' +
          "<h2>뉴스 등록 (관리자)</h2>" +
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
      document.body.appendChild(modal);

      var saved = localStorage.getItem("lit-gh-token");
      if (saved) modal.querySelector("#amToken").value = saved;

      function open() { modal.setAttribute("aria-hidden", "false"); document.body.style.overflow = "hidden"; }
      function close() { modal.setAttribute("aria-hidden", "true"); document.body.style.overflow = ""; }
      document.getElementById("adminOpen").addEventListener("click", open);
      modal.querySelector(".am-close").addEventListener("click", close);
      modal.addEventListener("click", function (e) { if (e.target === modal) close(); });

      modal.querySelector("#amSubmit").addEventListener("click", function () {
        submitNews(modal, close);
      });
    }

    function setMsg(modal, text, kind) {
      var m = modal.querySelector("#amMsg");
      m.textContent = text;
      m.className = "am-msg" + (kind ? " am-" + kind : "");
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

    function submitNews(modal, close) {
      var token = modal.querySelector("#amToken").value.trim();
      var title = modal.querySelector("#amTitle").value.trim();
      var content = modal.querySelector("#amContent").value.trim();
      if (!token) { setMsg(modal, "GitHub 토큰을 입력하세요.", "err"); return; }
      if (!title || !content) { setMsg(modal, "제목과 본문(한국어)은 필수입니다.", "err"); return; }

      if (modal.querySelector("#amRemember").checked) localStorage.setItem("lit-gh-token", token);
      else localStorage.removeItem("lit-gh-token");

      var stamp = nowStamp();
      var row = {
        date: stamp, year: stamp.slice(0, 4),
        forum: modal.querySelector("#amForum").value.trim() || "Board",
        title: title, title_en: modal.querySelector("#amTitleEn").value.trim(),
        content: content, content_en: modal.querySelector("#amContentEn").value.trim(),
        links: modal.querySelector("#amLinks").value.trim(),
        status: modal.querySelector("#amStatus").value,
      };
      var newLine = COLS.map(function (c) { return csvField(row[c]); }).join(",");

      setMsg(modal, "등록 중…", "");
      var api = "https://api.github.com/repos/" + resolveRepo() + "/contents/" + FILE;
      var headers = { Authorization: "token " + token, Accept: "application/vnd.github+json" };

      fetch(api + "?ref=" + BRANCH, { headers: headers })
        .then(function (r) {
          if (r.status === 401) throw new Error("토큰이 유효하지 않습니다 (401).");
          if (!r.ok) throw new Error("파일 조회 실패 (" + r.status + ").");
          return r.json();
        })
        .then(function (data) {
          var text = b64decode(data.content);
          var nl = text.indexOf("\n"); // 헤더 줄 끝
          if (nl < 0) throw new Error("CSV 형식 오류.");
          var updated = text.slice(0, nl + 1) + newLine + "\n" + text.slice(nl + 1);
          return fetch(api, {
            method: "PUT", headers: headers,
            body: JSON.stringify({
              message: "Add news: " + title, branch: BRANCH,
              content: b64encode(updated), sha: data.sha,
            }),
          });
        })
        .then(function (r) {
          if (!r.ok) return r.json().then(function (e) {
            throw new Error("커밋 실패 (" + r.status + "): " + (e.message || ""));
          });
          return r.json();
        })
        .then(function () {
          setMsg(modal, "등록 완료! 1~2분 후 사이트에 반영됩니다.", "ok");
          ["amTitle", "amTitleEn", "amContent", "amContentEn", "amLinks"].forEach(function (id) {
            modal.querySelector("#" + id).value = "";
          });
        })
        .catch(function (err) { setMsg(modal, err.message, "err"); });
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

  global.News = { initPage: initPage, renderRecent: renderRecent };
})(window);
