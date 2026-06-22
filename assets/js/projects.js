/* ==========================================================================
   LIT @ KAIST — Research Projects (Current / Past 토글)
   - Past    : data/projects_past.csv  → 종료연도별 간결한 목록
   - Current : data/projects_current.csv (…,slug) → 카드 → slug 의 상세 md 전문
               (data/<slug>_ko.md / data/<slug>.md, 한/영)
   ========================================================================== */
(function (global) {
  var P = global.Pubs;

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function lang() { return global.LitI18n ? global.LitI18n.get() : "ko"; }

  /* ---- 작은 마크다운 → HTML 변환기 (제목/굵게/이탤릭/목록/이미지/링크/문단) ---- */
  function inlineMd(t) {
    t = esc(t);
    t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    t = t.replace(/\*([^*]+)\*/g, "<em>$1</em>");
    t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    return t;
  }
  function mdToHtml(md) {
    var lines = String(md || "").replace(/\r/g, "").split("\n");
    var out = [], i = 0;
    while (i < lines.length) {
      var line = lines[i];
      if (/^\s*$/.test(line)) { i++; continue; }
      var im = line.match(/^\s*!\[([^\]]*)\]\(([^)]+)\)\s*$/);
      if (im) { out.push('<img src="' + esc(im[2]) + '" alt="' + esc(im[1]) + '">'); i++; continue; }
      var h = line.match(/^(#{1,6})\s+(.*)$/);
      if (h) { out.push("<h" + h[1].length + ">" + inlineMd(h[2]) + "</h" + h[1].length + ">"); i++; continue; }
      if (/^\s*[-*]\s+/.test(line)) {
        var items = [];
        while (i < lines.length) {
          if (/^\s*[-*]\s+/.test(lines[i])) { items.push("<li>" + inlineMd(lines[i].replace(/^\s*[-*]\s+/, "")) + "</li>"); i++; }
          else if (/^\s+\S/.test(lines[i]) && items.length) {
            items[items.length - 1] = items[items.length - 1].replace(/<\/li>$/, " " + inlineMd(lines[i].trim()) + "</li>"); i++;
          } else break;
        }
        out.push("<ul>" + items.join("") + "</ul>");
        continue;
      }
      var para = [];
      while (i < lines.length && !/^\s*$/.test(lines[i]) && !/^\s*[-*]\s+/.test(lines[i]) &&
             !/^#{1,6}\s/.test(lines[i]) && !/^\s*!\[/.test(lines[i])) { para.push(lines[i]); i++; }
      out.push("<p>" + inlineMd(para.join(" ")) + "</p>");
    }
    return out.join("\n");
  }

  var SOURCES = {
    current: {
      csv: "data/projects_current.csv",
      rows: function (recs) {
        return recs.filter(function (r) { return (r["과제명"] || "").trim(); }).map(function (r) {
          var s = (r["시작"] || "").trim(), e = (r["종료"] || "").trim();
          var intro = lang() === "en" ? ((r["소개_en"] || "").trim() || (r["소개"] || "").trim()) : (r["소개"] || "").trim();
          var title = lang() === "en" ? ((r["과제명_en"] || "").trim() || (r["과제명"] || "").trim()) : (r["과제명"] || "").trim();
          return { title: title, agency: (r["지원기관"] || "").trim(),
                   period: s && e ? s + " ~ " + e : (e || s || ""), slug: (r["slug"] || "").trim(), intro: intro };
        });
      },
    },
    past: {
      csv: "data/projects_past.csv",
      rows: function (recs) {
        return recs.filter(function (r) { return (r["과제명"] || "").trim(); }).map(function (r) {
          var s = (r["시작"] || "").trim(), e = (r["종료"] || "").trim();
          var title = lang() === "en" ? ((r["과제명_en"] || "").trim() || (r["과제명"] || "").trim()) : (r["과제명"] || "").trim();
          return { title: title, agency: (r["지원기관"] || "").trim(),
                   period: s && e ? s + "–" + e : (e || s || ""), year: (r["종료연도"] || "").trim() };
        });
      },
    },
  };

  function init(cfg) {
    var mount = document.getElementById(cfg.mount);
    var tabsEl = document.getElementById(cfg.tabsEl);
    var cache = {}, mdCache = {};
    var active = cfg.default || "current";
    var detailSlug = null; // Current 상세 보기 중인 slug
    var TABS = [
      { key: "current", ko: "진행 중", en: "Current" },
      { key: "past", ko: "완료", en: "Past" },
    ];

    buildTabs();
    var hash = location.hash.replace(/^#/, "");
    setActive(TABS.some(function (t) { return t.key === hash; }) ? hash : active);
    document.addEventListener("lit:lang", function () { buildTabs(); render(); });

    function buildTabs() {
      var en = lang() === "en";
      tabsEl.innerHTML = "";
      TABS.forEach(function (t) {
        var b = document.createElement("button");
        b.className = "tab" + (t.key === active ? " active" : "");
        b.type = "button"; b.textContent = en ? t.en : t.ko;
        b.addEventListener("click", function () { detailSlug = null; setActive(t.key); });
        tabsEl.appendChild(b);
      });
    }
    function setActive(key) {
      active = key;
      Array.prototype.forEach.call(tabsEl.querySelectorAll(".tab"), function (b, i) {
        b.classList.toggle("active", TABS[i].key === key);
      });
      render();
      if (history.replaceState) history.replaceState(null, "", "#" + key);
    }

    function loadCsv(src, cb) {
      if (cache[src.csv]) { cb(src.rows(cache[src.csv])); return; }
      fetch(src.csv, { cache: "no-store" }).then(function (r) { return r.ok ? r.text() : ""; })
        .then(function (t) { cache[src.csv] = t ? P._rowsToObjects(P._parseCSV(t)) : []; cb(src.rows(cache[src.csv])); })
        .catch(function () { cb([]); });
    }

    function render() {
      if (active === "current" && detailSlug) { renderDetail(detailSlug); return; }
      mount.innerHTML = '<p class="muted" style="padding:24px 0">불러오는 중…</p>';
      if (active === "current") {
        loadCsv(SOURCES.current, function (list) {
          if (!list.length) { mount.innerHTML = empty(); return; }
          mount.innerHTML = list.map(function (p) {
            return '<article class="curproj reveal">' +
              '<h3 class="cp-title">' + esc(p.title) + "</h3>" +
              (p.agency || p.period ? '<div class="cp-meta">' + esc([p.agency, p.period].filter(Boolean).join(" · ")) + "</div>" : "") +
              (p.intro ? '<p class="cp-intro">' + esc(p.intro) + "</p>" : "") +
              (p.slug ? '<button type="button" class="about-morelink cp-more" data-slug="' + esc(p.slug) + '">' +
                (lang() === "en" ? "Read more →" : "자세히 보기 →") + "</button>" : "") +
              "</article>";
          }).join("");
          Array.prototype.forEach.call(mount.querySelectorAll(".cp-more"), function (b) {
            b.addEventListener("click", function () { detailSlug = b.getAttribute("data-slug"); render(); if (history.replaceState) history.replaceState(null, "", "#current"); window.scrollTo({ top: 0, behavior: "smooth" }); });
          });
          if (global.LitReveal) global.LitReveal.observe(mount.querySelectorAll(".reveal"));
        });
      } else {
        loadCsv(SOURCES.past, function (list) {
          if (!list.length) { mount.innerHTML = empty(); return; }
          var years = [];
          list.forEach(function (p) { if (p.year && years.indexOf(p.year) < 0) years.push(p.year); });
          years.sort(function (a, b) { return b - a; });
          var html = years.map(function (y) {
            var items = list.filter(function (p) { return p.year === y; });
            return '<section class="proj-year-group"><h2 class="year">' + esc(y) +
              ' <span class="year-count">' + items.length + "</span></h2><ul class=\"proj-list\">" +
              items.map(function (p) {
                var meta = [p.agency, p.period].filter(Boolean).join(" · ");
                return '<li class="proj-item"><span class="pi-title">' + esc(p.title) + "</span>" +
                  (meta ? '<span class="pi-meta">' + esc(meta) + "</span>" : "") + "</li>";
              }).join("") + "</ul></section>";
          }).join("");
          mount.innerHTML = html;
        });
      }
    }

    function renderDetail(slug) {
      var path = "data/" + slug + (lang() === "en" ? "" : "_ko") + ".md";
      mount.innerHTML = '<p class="muted" style="padding:24px 0">불러오는 중…</p>';
      var show = function (md) {
        mount.innerHTML =
          '<button type="button" class="proj-back">' + (lang() === "en" ? "← Back to list" : "← 목록으로") + "</button>" +
          '<article class="md-body">' + mdToHtml(md) + "</article>";
        mount.querySelector(".proj-back").addEventListener("click", function () {
          detailSlug = null; render();
        });
        if (global.LitReveal) global.LitReveal.observe(mount.querySelectorAll(".reveal"));
      };
      if (mdCache[path]) { show(mdCache[path]); return; }
      fetch(path, { cache: "no-store" }).then(function (r) {
        if (!r.ok) throw new Error(path);
        return r.text();
      }).then(function (t) { mdCache[path] = t; show(t); })
        .catch(function () { mount.innerHTML = '<button type="button" class="proj-back">← 목록으로</button>' +
          '<div class="error">상세 내용을 불러오지 못했습니다: ' + esc(path) + "</div>";
          mount.querySelector(".proj-back").addEventListener("click", function () { detailSlug = null; render(); }); });
    }

    function empty() {
      return '<p class="muted" style="padding:28px 0">' +
        (lang() === "en" ? "No projects yet." : "등록된 과제가 없습니다.") + "</p>";
    }
  }

  global.Projects = { init: init };
})(window);
