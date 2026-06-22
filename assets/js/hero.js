/* ==========================================================================
   LIT @ KAIST — 홈 히어로 슬라이드 (data/hero.csv 기반, 자동 전환 + 화살표 + 점)
   - 슬라이드 추가/삭제: data/hero.csv (image,title,title_en,sub,sub_en)
     또는 admin "Hero" 탭에서 관리. CSV가 없거나 비면 index.html 의 정적 슬라이드 사용.
   - 전환 간격: 아래 INTERVAL(ms).
   ========================================================================== */
(function (global) {
  var INTERVAL = 5000;
  var root = document.getElementById("heroSlider");
  if (!root) return;
  var slidesWrap = root.querySelector(".slides");
  var P = global.Pubs;

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function buildFromCsv(done) {
    if (!slidesWrap || !P) { done(); return; }
    fetch("data/hero.csv", { cache: "no-store" })
      .then(function (r) { return r.ok ? r.text() : ""; })
      .then(function (t) {
        if (!t) { done(); return; }
        var rows = P._rowsToObjects(P._parseCSV(t)).filter(function (x) { return (x.image || "").trim(); });
        if (!rows.length) { done(); return; }
        slidesWrap.innerHTML = rows.map(function (x, i) {
          var title = (x.title || "").trim(), titleEn = (x.title_en || x.title || "").trim();
          var sub = (x.sub || "").trim(), subEn = (x.sub_en || x.sub || "").trim();
          return '<div class="slide' + (i === 0 ? " is-active" : "") +
            '" style="background-image: url(\'' + esc(x.image.trim()) + '\');"><div class="slide-inner">' +
            (title || titleEn ? '<h1 class="slide-title" data-ko="' + esc(title) + '" data-en="' + esc(titleEn) + '">' + esc(title || titleEn) + "</h1>" : "") +
            (sub || subEn ? '<p class="slide-sub" data-ko="' + esc(sub) + '" data-en="' + esc(subEn) + '">' + esc(sub || subEn) + "</p>" : "") +
            "</div></div>";
        }).join("");
        if (global.LitI18n) global.LitI18n.apply(global.LitI18n.get());
        done();
      })
      .catch(function () { done(); });
  }

  function initSlider() {
    var slides = Array.prototype.slice.call(root.querySelectorAll(".slide"));
    if (!slides.length) return;
    var dotsWrap = root.querySelector(".slider-dots");
    if (dotsWrap) dotsWrap.innerHTML = "";
    var prevBtn = root.querySelector(".slider-arrow.prev");
    var nextBtn = root.querySelector(".slider-arrow.next");
    var index = slides.findIndex(function (s) { return s.classList.contains("is-active"); });
    if (index < 0) index = 0;
    var dots = slides.map(function (_, i) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "slider-dot"; b.setAttribute("aria-label", (i + 1) + "번 슬라이드");
      b.addEventListener("click", function () { go(i); restart(); });
      if (dotsWrap) dotsWrap.appendChild(b);
      return b;
    });
    function go(n) {
      slides[index].classList.remove("is-active"); if (dots[index]) dots[index].classList.remove("is-active");
      index = (n + slides.length) % slides.length;
      slides[index].classList.add("is-active"); if (dots[index]) dots[index].classList.add("is-active");
    }
    function next() { go(index + 1); } function prev() { go(index - 1); }
    if (slides.length < 2) {
      if (prevBtn) prevBtn.style.display = "none";
      if (nextBtn) nextBtn.style.display = "none";
      if (dotsWrap) dotsWrap.style.display = "none";
      go(index); return;
    }
    if (dots[index]) dots[index].classList.add("is-active");
    var timer = null;
    function start() { timer = setInterval(next, INTERVAL); }
    function stop() { if (timer) { clearInterval(timer); timer = null; } }
    function restart() { stop(); start(); }
    if (nextBtn) nextBtn.addEventListener("click", function () { next(); restart(); });
    if (prevBtn) prevBtn.addEventListener("click", function () { prev(); restart(); });
    root.addEventListener("mouseenter", stop);
    root.addEventListener("mouseleave", start);
    start();
  }

  buildFromCsv(initSlider);
})(window);
