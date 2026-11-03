/* ==========================================================================
   LIT @ KAIST — I²SAC(지능통감융합연구센터) 페이지
   - data/i2sac_members.csv 를 읽어 (1) 참여연구원 세부별 카드,
     (2) 연구 체계 세부 카드의 "참여" 줄, (3) 상단 참여교수 수를 채웁니다.
   - 링크: http(s) 는 새 탭(↗), 사이트 내부 경로는 같은 탭(→), 비어 있으면 버튼 숨김.
   - 연구 기간 로드맵에서 올해에 해당하는 차년도를 강조합니다.
   ========================================================================== */
(function (global) {
  var P = global.Pubs;
  var rows = null;

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function lang() { return global.LitI18n ? global.LitI18n.get() : "ko"; }
  // 한/영 칸 중 현재 언어 우선, 없으면 다른 언어로 폴백
  function pick(r, k) {
    var ko = r[k] || "", en = r[k + "_en"] || "";
    return lang() === "en" ? (en || ko) : (ko || en);
  }
  // [주 이름, 보조 이름] — 현재 언어 이름을 앞에
  function names(r) {
    var ko = r.name_korean || "", en = r.name_english || "";
    return lang() === "en" ? [en || ko, ko] : [ko || en, en];
  }
  function subLabel(n) { return lang() === "en" ? "Sub-project " + n : "제" + n + "세부"; }
  // 세부 제목은 연구 체계 카드(.i2-sub-title)의 문구를 그대로 사용 — 한 곳만 고치면 됨
  function subTitle(n) {
    var h = document.querySelector('.i2-sub[data-sub="' + n + '"] .i2-sub-title');
    return h ? (h.getAttribute("data-" + lang()) || h.textContent) : "";
  }

  function linkBtn(r) {
    var u = (r["링크"] || "").trim();
    if (!u) return "";
    var label = (r["연구실"] || "").trim() || (lang() === "en" ? "Homepage" : "홈페이지");
    return /^https?:\/\//i.test(u)
      ? '<a class="p-btn" href="' + esc(u) + '" target="_blank" rel="noopener">' + esc(label) + " ↗</a>"
      : '<a class="p-btn" href="' + esc(u) + '">' + esc(label) + " →</a>";
  }

  function card(r) {
    var company = (r["구분"] || "").trim() === "기업";
    var nm = names(r), aff = pick(r, "소속"), role = pick(r, "역할"), badge = pick(r, "배지");
    var tag = company ? (lang() === "en" ? "Company" : "참여기업") : "";
    var img = r.photo_path
      ? '<img src="' + esc(r.photo_path) + '" alt="' + esc(nm[0]) + '" loading="lazy">' : "";
    var btn = linkBtn(r);
    return '<article class="i2-pc' + (company ? " is-company" : "") + '">' +
      '<div class="i2-pc-photo">' + img + "</div>" +
      '<div class="i2-pc-info">' +
        (badge ? '<span class="i2-badge">' + esc(badge) + "</span>" : "") +
        (tag ? '<span class="i2-badge is-outline">' + esc(tag) + "</span>" : "") +
        '<h4 class="i2-pc-name">' + esc(nm[0]) +
          (nm[1] && nm[1] !== nm[0] ? ' <span class="p-name-ko">' + esc(nm[1]) + "</span>" : "") + "</h4>" +
        (aff ? '<p class="i2-pc-aff">' + esc(aff) + "</p>" : "") +
        (role ? '<p class="i2-pc-role">' + esc(role) + "</p>" : "") +
        (btn ? '<div class="i2-pc-links">' + btn + "</div>" : "") +
      "</div></article>";
  }

  function render() {
    if (!rows) return;
    var subs = [];
    rows.forEach(function (r) { var s = r["세부"]; if (s && subs.indexOf(s) < 0) subs.push(s); });
    subs.sort();

    var mount = document.getElementById("i2People");
    if (mount) {
      mount.innerHTML = subs.map(function (s) {
        var list = rows.filter(function (r) { return r["세부"] === s; });
        return '<section class="i2-group" id="i2-team-' + esc(s) + '">' +
          '<h3 class="i2-group-head"><span class="i2-group-no">' + esc(subLabel(s)) + "</span>" +
            "<span>" + esc(subTitle(s)) + "</span></h3>" +
          '<div class="i2-pc-grid">' + list.map(card).join("") + "</div></section>";
      }).join("");
    }

    // 연구 체계 세부 카드의 "참여" 줄 (교수 → 기업 순, CSV 순서 유지)
    Array.prototype.forEach.call(document.querySelectorAll(".i2-sub-people"), function (dd) {
      var s = dd.getAttribute("data-sub");
      var list = rows.filter(function (r) { return r["세부"] === s; });
      if (list.length) dd.textContent = list.map(function (r) { return names(r)[0]; }).join(" · ");
    });

    var cnt = document.getElementById("i2ProfCount");
    if (cnt) cnt.textContent = rows.filter(function (r) { return (r["구분"] || "").trim() === "교수"; }).length;
  }

  function markNow() {
    var y = String(new Date().getFullYear());
    Array.prototype.forEach.call(document.querySelectorAll(".i2-roadmap li"), function (li) {
      li.classList.toggle("is-now", li.getAttribute("data-year") === y);
    });
  }

  function load() {
    markNow();
    fetch("data/i2sac_members.csv", { cache: "no-store" })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.text(); })
      .then(function (t) {
        rows = P._rowsToObjects(P._parseCSV(t)).filter(function (r) {
          return ((r.name_korean || "") + (r.name_english || "")).trim();
        });
        render();
        document.addEventListener("lit:lang", render);
      })
      .catch(function () {
        var m = document.getElementById("i2People");
        if (m) m.innerHTML = '<p class="muted">—</p>';
      });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", load);
  else load();
})(window);
