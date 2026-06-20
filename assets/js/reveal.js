/* ==========================================================================
   LIT @ KAIST — 스크롤 인터랙션
   1) .reveal 요소: 화면에 들어오면 fade-in (아래에서 살짝 떠오름)
   2) #heroSlider: 스크롤을 내리면 히어로 텍스트가 fade-out
   의존성 없음. 동작 안 하는 환경/모션 최소화 설정에서는 그냥 보이게 처리.

   동적으로 추가된 요소에도 적용하려면:  LitReveal.observe(elementsOrNodeList)
   ========================================================================== */
(function () {
  var reduceMotion =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var io = null;
  if (!reduceMotion && "IntersectionObserver" in window) {
    io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) {
            en.target.classList.add("is-visible");
            io.unobserve(en.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
    );
  }

  function observe(els) {
    if (!els) return;
    var list = els.length !== undefined ? els : [els];
    Array.prototype.forEach.call(list, function (e) {
      if (!e) return;
      if (io) io.observe(e);
      else e.classList.add("is-visible"); // 폴백: 바로 표시
    });
  }

  // 노출 (people.js 등 동적 렌더링에서 사용)
  window.LitReveal = { observe: observe };

  /* ---- 1) 초기 .reveal 요소 ---- */
  observe(document.querySelectorAll(".reveal"));

  /* ---- 2) hero fade-out on scroll ---- */
  var hero = document.getElementById("heroSlider");
  if (hero && !reduceMotion) {
    var ticking = false;
    function update() {
      var h = hero.offsetHeight || 1;
      var p = Math.min(1, Math.max(0, window.pageYOffset / (h * 0.85)));
      hero.style.setProperty("--hero-fade", String(1 - p));
      ticking = false;
    }
    window.addEventListener(
      "scroll",
      function () {
        if (!ticking) {
          window.requestAnimationFrame(update);
          ticking = true;
        }
      },
      { passive: true }
    );
    update();
  }
})();
