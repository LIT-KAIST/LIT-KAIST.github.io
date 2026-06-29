/* ==========================================================================
   LIT @ KAIST — Contact 페이지 동적 렌더
   data/contact.csv (단일 설정 행) → 모집 담당자 · 현재 모집 중 · 오시는 길
   admin.html 의 Contact 탭에서 편집합니다.
   ========================================================================== */
(function (global) {
  var P = global.Pubs;
  // 모집 카테고리: CSV 컬럼 → [한국어, English]
  var CATS = [
    ["r_intern",  "기간제연구원",   "Research staff (fixed-term)"],
    ["r_urp",     "학부연구생",     "Undergraduate researchers"],
    ["r_msc",     "석사 과정",      "M.S. students"],
    ["r_phd",     "박사 과정",      "Ph.D. students"],
    ["r_msphd",   "석박사통합과정", "Integrated M.S.–Ph.D. students"],
    ["r_postdoc", "박사후연구원",   "Postdoctoral researchers"],
  ];
  var YES = /^(y|yes|1|true|o|예|✓)$/i;

  function setBi(el, ko, en) {
    if (!el) return;
    el.setAttribute("data-ko", ko || "");
    el.setAttribute("data-en", en || ko || "");
    el.textContent = ko || "";
  }
  function $(id) { return document.getElementById(id); }

  function render(r) {
    // 1) 현재 모집 중
    var ul = $("recruitList");
    if (ul) {
      var on = CATS.filter(function (c) { return YES.test(String(r[c[0]] || "").trim()); });
      if (!on.length) on = [["", "현재 공고 없음", "No open positions at the moment"]];
      ul.innerHTML = on.map(function (c) {
        return '<li data-ko="' + esc(c[1]) + '" data-en="' + esc(c[2]) + '">' + esc(c[1]) + "</li>";
      }).join("");
    }
    // 2) 모집 담당자
    setBi($("ccName"), r.manager_ko, r.manager_en);
    var mail = (r.email || "").trim();
    if (mail) {
      var a = $("ccMail"); if (a) { a.href = "mailto:" + mail; a.textContent = mail; }
      var al = $("ccMailLink"); if (al) al.href = "mailto:" + mail;
      var ml = $("mailLoc"); if (ml) { ml.href = "mailto:" + mail; ml.textContent = mail; }
    }
    // 3) 오시는 길
    setBi($("affilSpan"), r.affil_ko, r.affil_en);
    setBi($("addressSpan"), r.address_ko, r.address_en);
    setBi($("officeSpan"), r.office_ko, r.office_en);
    var tel = (r.tel || "").trim();
    var ts = $("telSpan"); if (ts && tel) ts.textContent = tel;
    // 4) 지도
    var q = (r.map_query || "").trim();
    if (q) {
      var enc = encodeURIComponent(q);
      var fr = $("mapFrame");
      if (fr) { fr.src = "https://www.google.com/maps?q=" + enc + "&hl=ko&z=17&output=embed"; fr.title = q + " 지도"; }
      var lk = $("mapLink");
      if (lk) lk.href = "https://www.google.com/maps/search/?api=1&query=" + enc;
    }
    // i18n 재적용(추가된 data-ko/data-en 반영)
    if (global.LitI18n) global.LitI18n.apply(global.LitI18n.get());
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function load() {
    fetch("data/contact.csv?z=" + Date.now(), { cache: "no-store" })
      .then(function (r) { return r.ok ? r.text() : ""; })
      .then(function (t) {
        if (!t || !P) return;
        var rows = P._rowsToObjects(P._parseCSV(t));
        if (rows && rows[0]) render(rows[0]);
      })
      .catch(function () { /* 정적 폴백 유지 */ });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", load);
  else load();
})(window);
