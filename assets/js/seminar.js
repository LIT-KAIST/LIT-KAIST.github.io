/* ==========================================================================
   LIT @ KAIST — Internal Seminar (기록식)
   - data/seminars.csv : 세미나 목록 (slug,title,title_en,term,term_en,intro,
                          intro_en,syllabus,refs,status)
   - data/seminar_<slug>.csv : 주차별 (week,date,topic,topic_en,presenter,note)
   목록 → 상세(소개 + 참고자료 + Syllabus PDF + 주차별 표)
   ========================================================================== */
(function (global) {
  var P = global.Pubs;

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function lang() { return global.LitI18n ? global.LitI18n.get() : "ko"; }
  function pick(r, f) { return lang() === "en" ? ((r[f + "_en"] || "").trim() || (r[f] || "")) : (r[f] || ""); }
  function t(ko, en) { return lang() === "en" ? en : ko; }

  function init(cfg) {
    var mount = document.getElementById(cfg.mount);
    var seminars = [], weeksCache = {}, detailSlug = null;

    mount.innerHTML = '<p class="muted" style="padding:24px 0">불러오는 중…</p>';
    fetch(cfg.csv, { cache: "no-store" }).then(function (r) { return r.text(); })
      .then(function (txt) {
        seminars = P._rowsToObjects(P._parseCSV(txt))
          .filter(function (s) { return (s.status || "").trim() === "publish" && (s.title || "").trim(); });
        var hash = location.hash.replace(/^#/, "");
        detailSlug = seminars.some(function (s) { return s.slug === hash; }) ? hash : null;
        render();
        document.addEventListener("lit:lang", render);
      })
      .catch(function (e) {
        mount.innerHTML = '<div class="error">세미나를 불러오지 못했습니다. 로컬에서는 ' +
          "<code>python3 -m http.server</code> 로 열어주세요.<br>" + esc(e.message) + "</div>";
      });

    function render() {
      if (detailSlug) { renderDetail(detailSlug); return; }
      if (!seminars.length) {
        mount.innerHTML = '<p class="muted" style="padding:28px 0">' + t("등록된 세미나가 없습니다.", "No seminars yet.") + "</p>";
        return;
      }
      mount.innerHTML = '<div class="sem-list">' + seminars.map(function (s) {
        return '<article class="sem-card reveal">' +
          '<div class="sem-term">' + esc(pick(s, "term")) + "</div>" +
          '<h3 class="sem-title">' + esc(pick(s, "title")) + "</h3>" +
          (pick(s, "intro") ? '<p class="sem-intro">' + esc(pick(s, "intro")) + "</p>" : "") +
          '<button type="button" class="about-morelink sem-open" data-slug="' + esc(s.slug) + '">' +
          t("자세히 보기 →", "View →") + "</button>" +
        "</article>";
      }).join("") + "</div>";
      Array.prototype.forEach.call(mount.querySelectorAll(".sem-open"), function (b) {
        b.addEventListener("click", function () {
          detailSlug = b.getAttribute("data-slug"); render();
          if (history.replaceState) history.replaceState(null, "", "#" + detailSlug);
          window.scrollTo({ top: 0, behavior: "smooth" });
        });
      });
      if (global.LitReveal) global.LitReveal.observe(mount.querySelectorAll(".reveal"));
    }

    function refsHtml(s) {
      var raw = (s.refs || "").trim();
      if (!raw) return "";
      var items = raw.split("|").map(function (x) { return x.trim(); }).filter(Boolean).map(function (x) {
        var p = x.split("::"); var label = (p[0] || "").trim(), url = (p[1] || "").trim();
        return url ? '<li><a href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(label || url) + "</a></li>"
                   : "<li>" + esc(label) + "</li>";
      }).join("");
      return '<h3 class="sem-h">' + t("참고자료", "References") + "</h3><ul class=\"sem-refs\">" + items + "</ul>";
    }

    function weeksHtml(rows) {
      if (!rows.length) return '<p class="muted">' + t("주차 정보가 아직 없습니다.", "No sessions yet.") + "</p>";
      return '<div class="sem-weeks"><table><thead><tr>' +
        "<th>" + t("주차", "Week") + "</th><th>" + t("날짜", "Date") + "</th>" +
        "<th>" + t("주제", "Topic") + "</th><th>" + t("발표자", "Presenter") + "</th></tr></thead><tbody>" +
        rows.map(function (w) {
          return "<tr><td>" + esc(w.week || "") + "</td><td>" + esc((w.date || "").slice(0, 10)) + "</td>" +
            "<td>" + esc(pick(w, "topic")) + (w.note ? ' <span class="sem-note">· ' + esc(w.note) + "</span>" : "") + "</td>" +
            "<td>" + esc(w.presenter || "") + "</td></tr>";
        }).join("") + "</tbody></table></div>";
    }

    function renderDetail(slug) {
      var s = seminars.filter(function (x) { return x.slug === slug; })[0];
      if (!s) { detailSlug = null; render(); return; }
      var syll = (s.syllabus || "").trim();
      var head =
        '<button type="button" class="proj-back">' + t("← 목록으로", "← Back to list") + "</button>" +
        '<div class="sem-detail">' +
          '<div class="sem-term">' + esc(pick(s, "term")) + "</div>" +
          '<h2 class="sem-dtitle">' + esc(pick(s, "title")) + "</h2>" +
          (pick(s, "intro") ? '<p class="sem-dintro">' + esc(pick(s, "intro")) + "</p>" : "") +
          (syll ? '<p><a class="sem-pdf" href="' + esc(syll) + '" target="_blank" rel="noopener">📄 ' +
            t("Syllabus (PDF)", "Syllabus (PDF)") + "</a></p>" : "") +
          refsHtml(s) +
          '<h3 class="sem-h">' + t("주차별 일정", "Weekly schedule") + "</h3>" +
          '<div id="semWeeks"><p class="muted">' + t("불러오는 중…", "Loading…") + "</p></div>" +
        "</div>";
      mount.innerHTML = head;
      mount.querySelector(".proj-back").addEventListener("click", function () {
        detailSlug = null; render(); if (history.replaceState) history.replaceState(null, "", "#");
      });

      var wpath = "data/seminar_" + slug + ".csv";
      var put = function (rows) { var el = document.getElementById("semWeeks"); if (el) el.innerHTML = weeksHtml(rows); };
      if (weeksCache[slug]) { put(weeksCache[slug]); return; }
      fetch(wpath, { cache: "no-store" }).then(function (r) { return r.ok ? r.text() : ""; })
        .then(function (txt) { weeksCache[slug] = txt ? P._rowsToObjects(P._parseCSV(txt)).filter(function (w) { return (w.week || w.topic || "").trim(); }) : []; put(weeksCache[slug]); })
        .catch(function () { put([]); });
    }
  }

  global.Seminar = { init: init };
})(window);
