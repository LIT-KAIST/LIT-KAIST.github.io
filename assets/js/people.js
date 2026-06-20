/* ==========================================================================
   LIT @ KAIST — People 페이지 (Faculty / Members / Alumni 탭)
   - CSV 는 pubs.js 의 파서(Pubs._parseCSV / _rowsToObjects)를 재사용합니다.
   - Faculty / Members: 좌측 사진 + 우측 정보(이름·이메일·링크 버튼) 가로 카드
   - Alumni: 사진 카드 그리드
   - 링크 버튼(Homepage/Scholar/GitHub/CV)은 CSV 해당 칸에 값이 있을 때만 표시됩니다.
   ========================================================================== */
(function (global) {
  var P = global.Pubs;

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function loadCsv(path) {
    return fetch(path)
      .then(function (r) {
        if (!r.ok) throw new Error(path + " (HTTP " + r.status + ")");
        return r.text();
      })
      .then(function (t) {
        return P._rowsToObjects(P._parseCSV(t)).filter(function (x) {
          return ((x.name_english || "") + (x.name_korean || "")).trim();
        });
      });
  }

  function loadMd(path) {
    return fetch(path).then(function (r) {
      if (!r.ok) throw new Error(path + " (HTTP " + r.status + ")");
      return r.text();
    });
  }

  /* ---- 아주 작은 마크다운 → HTML 변환기 (faculty.md 형식에 필요한 만큼만) ---- */
  function inlineMd(t) {
    t = esc(t);
    t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    t = t.replace(/\*([^*]+)\*/g, "<em>$1</em>");
    t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener">$1</a>');
    return t;
  }

  function mdToHtml(md) {
    var lines = String(md || "").replace(/\r/g, "").split("\n");
    var out = [];
    var i = 0;
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
          if (/^\s*[-*]\s+/.test(lines[i])) {
            items.push("<li>" + inlineMd(lines[i].replace(/^\s*[-*]\s+/, "")) + "</li>");
            i++;
          } else if (/^\s+\S/.test(lines[i]) && items.length) {
            // 들여쓰기된 줄 = 직전 항목의 이어쓰기
            items[items.length - 1] =
              items[items.length - 1].replace(/<\/li>$/, " " + inlineMd(lines[i].trim()) + "</li>");
            i++;
          } else break;
        }
        out.push("<ul>" + items.join("") + "</ul>");
        continue;
      }
      var para = [];
      while (i < lines.length && !/^\s*$/.test(lines[i]) &&
             !/^\s*[-*]\s+/.test(lines[i]) && !/^#{1,6}\s/.test(lines[i]) &&
             !/^\s*!\[/.test(lines[i])) {
        para.push(lines[i]); i++;
      }
      out.push("<p>" + inlineMd(para.join(" ")) + "</p>");
    }
    return out.join("\n");
  }

  // faculty.md → { name, photo, alt, metaHtml, aHtml(요약), bHtml(전문) }
  function parseProfile(md) {
    md = String(md || "").replace(/\r/g, "");
    var parts = md.split(/^\s*---\s*$/m);
    var header = parts[0] || "", a = parts[1] || "", b = parts[2] || "";
    // "# A. 구조화 버전 …" / "# B. 원문 버전 …" 같은 버전 라벨 제목 제거 (토글로 대체)
    a = a.replace(/^\s*#\s*[A-Za-z]\.\s.*$/m, "");
    b = b.replace(/^\s*#\s*[A-Za-z]\.\s.*$/m, "");
    var img = header.match(/!\[([^\]]*)\]\(([^)]+)\)/);
    var nameM = header.match(/^#\s+(.+)$/m);
    var name = nameM ? nameM[1].trim() : "";
    var meta = header.replace(/^#\s+.+$/m, "").replace(/!\[[^\]]*\]\([^)]+\)/, "");
    return {
      name: name,
      photo: img ? img[2].trim() : "",
      alt: img ? (img[1] || name) : name,
      metaHtml: mdToHtml(meta),
      aHtml: mdToHtml(a),
      bHtml: mdToHtml(b),
    };
  }

  // 표시할 링크 버튼 (칸에 값이 있는 것만 렌더)
  var LINKS = [
    { key: "homepage", label: "Homepage" },
    { key: "scholar", label: "Scholar" },
    { key: "github", label: "GitHub" },
    { key: "cv", label: "CV" },
  ];

  function linkBtns(p) {
    var html = LINKS.filter(function (l) { return (p[l.key] || "").trim(); })
      .map(function (l) {
        return '<a class="p-btn p-btn-' + l.key + '" href="' + esc(p[l.key].trim()) +
          '" target="_blank" rel="noopener">' + l.label + "</a>";
      }).join("");
    return html;
  }

  function photoTag(p, cls) {
    var src = (p.photo_path || "").trim();
    var alt = esc(p.name_english || p.name_korean || "");
    if (src) {
      return '<img class="' + cls + '" src="' + esc(src) + '" alt="' + alt +
        '" loading="lazy" onerror="this.classList.add(\'p-imgerr\')">';
    }
    return '<div class="' + cls + ' p-noimg" aria-hidden="true"></div>';
  }

  function nameBlock(p) {
    var en = esc(p.name_english || "");
    var ko = esc(p.name_korean || "");
    return en + (ko ? ' <span class="p-name-ko">' + ko + "</span>" : "");
  }

  // 좌측 사진 + 우측 정보 (Faculty / Members)
  function rowCard(p) {
    var email = (p.email || "").trim();
    var emailHtml = email
      ? '<a class="p-email" href="mailto:' + esc(email) + '">' + esc(email) + "</a>"
      : "";
    var links = linkBtns(p);
    return (
      '<article class="person-row reveal">' +
        '<div class="pr-photo">' + photoTag(p, "pr-img") + "</div>" +
        '<div class="pr-info">' +
          '<h3 class="pr-name">' + nameBlock(p) + "</h3>" +
          ((p["직함"] || "").trim() ? '<div class="pr-title">' + esc(p["직함"]) + "</div>" : "") +
          ((p["관심분야"] || "").trim()
            ? '<div class="pr-interest"><span class="pr-interest-label" data-ko="관심 분야" data-en="Research interests">관심 분야</span>' +
              esc(p["관심분야"].trim()) + "</div>"
            : "") +
          (emailHtml ? '<div class="pr-email">' + emailHtml + "</div>" : "") +
          (links ? '<div class="pr-links">' + links + "</div>" : "") +
        "</div>" +
      "</article>"
    );
  }

  // 사진 카드 그리드 (Alumni)
  function gridCard(p) {
    var pos = (p.current_position || "").trim();
    var thesis = (p["졸업논문"] || "").trim();
    var links = linkBtns(p);
    return (
      '<article class="person-card reveal">' +
        '<div class="pc-photo">' + photoTag(p, "pc-img") + "</div>" +
        '<h3 class="pc-name">' + nameBlock(p) + "</h3>" +
        ((p["직함"] || "").trim() ? '<div class="pc-title">' + esc(p["직함"]) + "</div>" : "") +
        (pos
          ? '<div class="pc-pos"><span class="pc-label" data-ko="현 소속" data-en="Now">현 소속</span>' +
            esc(pos) + "</div>"
          : "") +
        (thesis
          ? '<div class="pc-thesis"><span class="pc-label" data-ko="학위논문" data-en="Thesis">학위논문</span>' +
            '<span class="pc-thesis-t">' + esc(thesis) + "</span></div>"
          : "") +
        (links ? '<div class="pc-links">' + links + "</div>" : "") +
      "</article>"
    );
  }

  // 학위(또는 임의 칸) 기준으로 섹션을 나눠 렌더 (row / grid 둘 다 지원)
  function sectionHtml(ko, en, items, layout) {
    var body = layout === "grid"
      ? '<div class="people-grid">' + items.map(gridCard).join("") + "</div>"
      : '<div class="people-rows">' + items.map(rowCard).join("") + "</div>";
    return (
      '<section class="ppl-section">' +
        '<h2 class="ppl-section-title">' +
          '<span data-ko="' + esc(ko) + '" data-en="' + esc(en) + '">' + esc(ko) + "</span>" +
          ' <span class="ppl-section-count">' + items.length + "</span>" +
        "</h2>" +
        body +
      "</section>"
    );
  }

  function renderGrouped(rows, g) {
    var key = g.groupBy;
    var html = "";
    g.order.forEach(function (sec) {
      var items = rows.filter(function (r) { return (r[key] || "").trim() === sec.value; });
      if (items.length) html += sectionHtml(sec.ko, sec.en, items, g.layout);
    });
    // order 에 없는 값들은 "기타"로 모음
    var rest = rows.filter(function (r) {
      return !g.order.some(function (s) { return s.value === (r[key] || "").trim(); });
    });
    if (rest.length) html += sectionHtml("기타", "Others", rest, g.layout);
    return html;
  }

  function init(cfg) {
    var mount = document.getElementById(cfg.mount);
    var tabsEl = document.getElementById(cfg.tabsEl);
    var groups = cfg.groups;
    var store = {};
    var facultyView = "a"; // 'a' = 요약, 'b' = 전문

    mount.innerHTML = '<p class="muted" style="padding:24px 0">불러오는 중…</p>';

    Promise.all(
      groups.map(function (g) {
        if (g.type === "profile") {
          return Promise.all([loadMd(g.md.ko), loadMd(g.md.en)])
            .then(function (r) {
              store[g.key] = { ko: parseProfile(r[0]), en: parseProfile(r[1]) };
            })
            .catch(function (e) { store[g.key] = null; console.error(e); });
        }
        return loadCsv(g.csv)
          .then(function (rows) { store[g.key] = rows; })
          .catch(function (e) { store[g.key] = null; console.error(e); });
      })
    ).then(function () {
      buildTabs();
      var hash = location.hash.replace(/^#/, "");
      var valid = groups.some(function (g) { return g.key === hash; });
      setActive(valid ? hash : cfg.default || groups[0].key, false);
    });

    // 언어 토글 시: 활성 탭이 마크다운 프로필이면 다시 렌더 (md 내용이 언어별로 다름)
    document.addEventListener("lit:lang", function () {
      var active = tabsEl.querySelector(".tab.active");
      if (!active) return;
      var g = groups.filter(function (x) { return x.key === active.getAttribute("data-key"); })[0];
      if (g && g.type === "profile") render(g);
    });

    function buildTabs() {
      tabsEl.innerHTML = "";
      groups.forEach(function (g) {
        var b = document.createElement("button");
        b.className = "tab";
        b.type = "button";
        b.setAttribute("data-key", g.key);
        if (g.type === "profile") {
          b.innerHTML = esc(g.label);
        } else {
          var rows = store[g.key];
          var n = rows ? rows.length : "?";
          b.innerHTML = esc(g.label) + ' <span class="tab-count">' + n + "</span>";
        }
        b.addEventListener("click", function () { setActive(g.key, true); });
        tabsEl.appendChild(b);
      });
    }

    function setActive(key, push) {
      Array.prototype.forEach.call(tabsEl.querySelectorAll(".tab"), function (btn) {
        btn.classList.toggle("active", btn.getAttribute("data-key") === key);
      });
      var g = groups.filter(function (x) { return x.key === key; })[0] || groups[0];
      render(g);
      if (push && history.replaceState) history.replaceState(null, "", "#" + key);
    }

    function render(g) {
      if (g.type === "profile") { renderFaculty(g); return; }
      var rows = store[g.key];
      if (rows === null) {
        mount.innerHTML =
          '<div class="error">' + esc(g.label) +
          " 데이터를 불러오지 못했습니다. 로컬에서는 <code>python3 -m http.server</code> 로 열어주세요.</div>";
        return;
      }
      if (g.groupBy && g.order) {
        mount.innerHTML = renderGrouped(rows, g);
      } else if (g.layout === "grid") {
        mount.innerHTML =
          '<div class="people-grid">' + rows.map(gridCard).join("") + "</div>";
      } else {
        mount.innerHTML =
          '<div class="people-rows">' + rows.map(rowCard).join("") + "</div>";
      }
      if (global.LitI18n) global.LitI18n.apply(global.LitI18n.get());
      if (global.LitReveal) global.LitReveal.observe(mount.querySelectorAll(".reveal"));
    }

    // Faculty: 큰 사진 + 프로필, 요약/전문 토글 (md 기반)
    function renderFaculty(g) {
      var data = store[g.key];
      if (!data) {
        mount.innerHTML = '<div class="error">교수 정보를 불러오지 못했습니다.</div>';
        return;
      }
      var lang = global.LitI18n ? global.LitI18n.get() : "ko";
      var prof = data[lang] || data.ko || data.en;
      var bodyHtml = facultyView === "b" ? prof.bHtml : prof.aHtml;
      var photo = prof.photo
        ? '<img src="' + esc(prof.photo) + '" alt="' + esc(prof.alt) + '" loading="lazy">'
        : "";
      mount.innerHTML =
        '<div class="faculty-profile reveal">' +
          '<div class="fp-head">' +
            '<div class="fp-photo">' + photo + "</div>" +
            '<div class="fp-meta">' +
              (prof.name ? '<h2 class="fp-name">' + esc(prof.name) + "</h2>" : "") +
              prof.metaHtml +
            "</div>" +
          "</div>" +
          '<div class="fp-toggle" role="tablist">' +
            '<button type="button" class="fp-tab' + (facultyView === "a" ? " active" : "") +
              '" data-view="a" data-ko="요약" data-en="Summary">요약</button>' +
            '<button type="button" class="fp-tab' + (facultyView === "b" ? " active" : "") +
              '" data-view="b" data-ko="전문" data-en="Full">전문</button>' +
          "</div>" +
          '<div class="fp-body">' + bodyHtml + "</div>" +
        "</div>";
      Array.prototype.forEach.call(mount.querySelectorAll(".fp-tab"), function (btn) {
        btn.addEventListener("click", function () {
          facultyView = btn.getAttribute("data-view");
          renderFaculty(g);
        });
      });
      if (global.LitI18n) global.LitI18n.apply(global.LitI18n.get());
      if (global.LitReveal) global.LitReveal.observe(mount.querySelectorAll(".reveal"));
    }
  }

  global.People = { init: init };
})(window);
