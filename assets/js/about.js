/* ==========================================================================
   LIT @ KAIST — About 페이지 동적 요소
   연구실 현황 인원수를 people_members.csv 에서 계산(방문연구원 제외)해
   #labStatus 에 채웁니다. 언어 토글 시 다시 그립니다.
   ========================================================================== */
(function (global) {
  var P = global.Pubs;
  // 표시 순서 + 한/영 라벨
  var ORDER = [
    { v: "박사", ko: "박사과정", en: "Ph.D." },
    { v: "석사", ko: "석사과정", en: "M.S." },
    { v: "박사후", ko: "박사후연구원", en: "Postdoc" },
    { v: "연구원", ko: "연구원", en: "Researcher" },
  ];
  var counts = null;
  function lang() { return global.LitI18n ? global.LitI18n.get() : "ko"; }

  function load() {
    fetch("data/people_members.csv", { cache: "no-store" })
      .then(function (r) { return r.text(); })
      .then(function (t) {
        var rows = P._rowsToObjects(P._parseCSV(t))
          .filter(function (x) { return ((x.name_english || "") + (x.name_korean || "")).trim(); })
          .filter(function (x) { return (x["학위"] || "").trim() !== "방문연구원"; });
        var by = {};
        rows.forEach(function (x) { var d = (x["학위"] || "").trim() || "기타"; by[d] = (by[d] || 0) + 1; });
        counts = { by: by, total: rows.length };
        paint();
        document.addEventListener("lit:lang", paint);
      })
      .catch(function () { var el = document.getElementById("labStatus"); if (el) el.textContent = "—"; });
  }

  function paint() {
    var el = document.getElementById("labStatus");
    if (!el || !counts) return;
    var en = lang() === "en", seen = {}, parts = [];
    ORDER.forEach(function (o) {
      if (counts.by[o.v]) { seen[o.v] = 1; parts.push(en ? counts.by[o.v] + " " + o.en : o.ko + " " + counts.by[o.v] + "명"); }
    });
    Object.keys(counts.by).forEach(function (k) {
      if (!seen[k]) parts.push(en ? counts.by[k] + " " + k : k + " " + counts.by[k] + "명");
    });
    var total = en ? " (" + counts.total + " total)" : " (총 " + counts.total + "명)";
    el.textContent = parts.join(" · ") + total;
    el.classList.remove("muted");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", load);
  else load();
})(window);
/* 패널 스크롤 애니메이션은 reveal.js, 이미지 확대는 zoom.js 로 분리되었습니다. */

/* ===== 대표 연구 성과: data/highlights.csv 가 가리키는 출판물을 자동 인용 ===== */
(function (global) {
  var P = global.Pubs;
  var mount = document.getElementById("highlightList");
  if (!mount || !P) return;

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function norm(s) { return String(s || "").toLowerCase().replace(/\s+/g, " ").trim(); }
  function year(r) { var d = (r.date || r.added || "").match(/(\d{4})/); return d ? d[1] : ""; }
  function venue(r, src) {
    if (src.indexOf("journal") === 0) return r.journal || "";
    if (src.indexOf("conference") === 0) return r.booktitle || r.note || r.organization || "";
    return r.note || r.number || ""; // patent
  }
  function cite(r, src) {
    var t = r.title || "";
    var doi = (r.doi || "").trim(), url = (r.url || "").trim();
    var href = doi ? "https://doi.org/" + doi : url;
    var titleHtml = href ? '<a href="' + esc(href) + '" target="_blank" rel="noopener">' + esc(t) + "</a>" : esc(t);
    var v = venue(r, src), y = year(r);
    return (r.author ? esc(r.author) + ", " : "") + '"' + titleHtml + '," ' +
      (v ? "<em>" + esc(v) + "</em>" : "") + (y ? (v ? ", " : "") + esc(y) : "") + ".";
  }

  fetch("data/highlights.csv", { cache: "no-store" })
    .then(function (r) { return r.ok ? r.text() : ""; })
    .then(function (t) {
      var picks = t ? P._rowsToObjects(P._parseCSV(t)).filter(function (x) { return (x.title || "").trim(); }) : [];
      if (!picks.length) { mount.innerHTML = ""; return; }
      var srcs = {};
      picks.forEach(function (p) { srcs[(p.source || "").trim()] = 1; });
      var keys = Object.keys(srcs).filter(Boolean);
      return Promise.all(keys.map(function (s) {
        return fetch("data/" + s + ".csv", { cache: "no-store" })
          .then(function (r) { return r.ok ? r.text() : ""; })
          .then(function (txt) {
            var map = {};
            if (txt) P._rowsToObjects(P._parseCSV(txt)).forEach(function (r) { if (r.title) map[norm(r.title)] = r; });
            srcs[s] = map;
          });
      })).then(function () {
        mount.innerHTML = picks.map(function (p) {
          var s = (p.source || "").trim();
          var rec = (srcs[s] && srcs[s][norm(p.title)]) || null;
          return "<li>" + (rec ? cite(rec, s) : esc(p.title)) + "</li>";
        }).join("");
      });
    })
    .catch(function () { mount.innerHTML = ""; });
})(window);
