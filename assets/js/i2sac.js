/* ==========================================================================
   LIT @ KAIST — I²SAC(지능통감융합연구센터) 페이지
   - data/i2sac_members.csv 를 읽어 (1) 참여연구원 세부별 목록,
     (2) 연구 체계 세부 항목의 "참여" 줄, (3) 상단 참여교수 수를 채웁니다.
   - 링크: http(s) 는 새 탭(↗), 사이트 내부 경로는 같은 탭(→), 비어 있으면 숨김.
   - 연구 기간 파노라마: 지난 차년도/올해/남은 차년도를 구분하고, 좌우 버튼으로
     넘기며, 처음에는 올해(진행 중) 차년도가 보이도록 스크롤해 둡니다.
   ========================================================================== */
(function (global) {
  var P = global.Pubs;
  var rows = null;
  var reduceMotion = global.matchMedia && global.matchMedia("(prefers-reduced-motion: reduce)").matches;

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
  // 세부 제목은 연구 체계 항목(.i2-sub-title)의 문구를 그대로 사용 — 한 곳만 고치면 됨
  function subTitle(n) {
    var h = document.querySelector('.i2-sub[data-sub="' + n + '"] .i2-sub-title');
    return h ? (h.getAttribute("data-" + lang()) || h.textContent) : "";
  }

  function link(r) {
    var u = (r["링크"] || "").trim();
    if (!u) return "";
    var label = (r["연구실"] || "").trim() || (lang() === "en" ? "Homepage" : "홈페이지");
    var ext = /^https?:\/\//i.test(u);
    return '<a class="i2-link" href="' + esc(u) + '"' + (ext ? ' target="_blank" rel="noopener"' : "") + ">" +
      esc(label) + '<span aria-hidden="true">' + (ext ? " ↗" : " →") + "</span></a>";
  }

  function card(r) {
    var company = (r["구분"] || "").trim() === "기업";
    var nm = names(r), aff = pick(r, "소속"), role = pick(r, "역할");
    var tag = pick(r, "배지") || (company ? (lang() === "en" ? "Participating company" : "참여기업") : "");
    var img = r.photo_path
      ? '<img src="' + esc(r.photo_path) + '" alt="' + esc(nm[0]) + '" loading="lazy">' : "";
    return '<article class="i2-pc' + (company ? " is-company" : "") + '">' +
      '<div class="i2-pc-photo">' + img + "</div>" +
      '<div class="i2-pc-info">' +
        (tag ? '<p class="i2-pc-tag">' + esc(tag) + "</p>" : "") +
        '<h4 class="i2-pc-name">' + esc(nm[0]) +
          (nm[1] && nm[1] !== nm[0] ? '<span class="i2-pc-alt">' + esc(nm[1]) + "</span>" : "") + "</h4>" +
        (aff ? '<p class="i2-pc-aff">' + esc(aff) + "</p>" : "") +
        (role ? '<p class="i2-pc-role">' + esc(role) + "</p>" : "") +
        link(r) +
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
          '<h3 class="i2-group-head"><span class="i2-kicker">' + esc(subLabel(s)) + "</span>" +
            "<span>" + esc(subTitle(s)) + "</span></h3>" +
          '<div class="i2-pc-grid">' + list.map(card).join("") + "</div></section>";
      }).join("");
    }

    // 연구 체계 세부 항목의 "참여" 줄 (CSV 순서 유지)
    Array.prototype.forEach.call(document.querySelectorAll(".i2-sub-people"), function (dd) {
      var s = dd.getAttribute("data-sub");
      var list = rows.filter(function (r) { return r["세부"] === s; });
      if (list.length) dd.textContent = list.map(function (r) { return names(r)[0]; }).join(" · ");
    });

    var cnt = document.getElementById("i2ProfCount");
    if (cnt) cnt.textContent = rows.filter(function (r) { return (r["구분"] || "").trim() === "교수"; }).length;
  }

  /* ---- 연구 기간 파노라마 ---- */
  function initPano() {
    var track = document.getElementById("i2Roadmap");
    if (!track) return;
    var today = new Date(), y = today.getFullYear(), now = null;
    Array.prototype.forEach.call(track.children, function (li) {
      var ly = parseInt(li.getAttribute("data-year"), 10);
      li.classList.toggle("is-past", ly < y);
      li.classList.toggle("is-now", ly === y);
      if (ly === y) now = li;
    });
    // 올해 차년도의 선은 올해가 지난 만큼만 채움
    if (now) {
      var p = (today - new Date(y, 0, 1)) / (new Date(y + 1, 0, 1) - new Date(y, 0, 1));
      now.style.setProperty("--p", Math.round(p * 100) + "%");
    }

    var btns = document.querySelectorAll(".i2-pano-btn");
    function stepWidth() {
      var li = track.firstElementChild;
      var gap = parseFloat(global.getComputedStyle(track).columnGap) || 0;
      return li ? li.getBoundingClientRect().width + gap : track.clientWidth;
    }
    function sync() {
      var max = track.scrollWidth - track.clientWidth - 2;
      Array.prototype.forEach.call(btns, function (b) {
        b.disabled = b.getAttribute("data-step") === "-1" ? track.scrollLeft <= 2 : track.scrollLeft >= max;
      });
    }
    Array.prototype.forEach.call(btns, function (b) {
      b.addEventListener("click", function () {
        var dir = parseInt(b.getAttribute("data-step"), 10) || 1;
        track.scrollBy({ left: dir * stepWidth(), behavior: reduceMotion ? "auto" : "smooth" });
      });
    });
    var tick = false;
    track.addEventListener("scroll", function () {
      if (!tick) { global.requestAnimationFrame(function () { sync(); tick = false; }); tick = true; }
    }, { passive: true });
    global.addEventListener("resize", sync);

    // 처음 화면: 진행 중인 차년도가 온전히 보이게. 자리가 되면 바로 앞 차년도부터 보여 줌(넓은 화면)
    if (now) {
      var prev = now.previousElementSibling;
      var lead = prev && (now.offsetLeft + now.offsetWidth - prev.offsetLeft) <= track.clientWidth ? prev : now;
      track.scrollLeft = lead.offsetLeft - track.firstElementChild.offsetLeft;
    }
    sync();
  }

  function load() {
    initPano();
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
