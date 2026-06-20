/* ==========================================================================
   LIT @ KAIST — 홈 히어로 슬라이드 (자동 전환 + 화살표 + 점 네비)
   의존성 없음. index.html 의 #heroSlider 구조에 맞춰 동작합니다.

   - 슬라이드 추가/삭제: index.html 의 .slides 안에서 .slide 블록을 늘리거나 줄이면
     점(dot) 개수와 순환이 자동으로 맞춰집니다.
   - 전환 간격: 아래 INTERVAL(ms) 수정.
   ========================================================================== */
(function () {
  var INTERVAL = 5000; // 슬라이드 자동 전환 간격(ms)

  var root = document.getElementById("heroSlider");
  if (!root) return;

  var slides = Array.prototype.slice.call(root.querySelectorAll(".slide"));
  if (slides.length === 0) return;

  var dotsWrap = root.querySelector(".slider-dots");
  var prevBtn = root.querySelector(".slider-arrow.prev");
  var nextBtn = root.querySelector(".slider-arrow.next");

  var index = slides.findIndex(function (s) {
    return s.classList.contains("is-active");
  });
  if (index < 0) index = 0;

  // 점(dot) 생성
  var dots = slides.map(function (_, i) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "slider-dot";
    b.setAttribute("aria-label", i + 1 + "번 슬라이드");
    b.addEventListener("click", function () { go(i); restart(); });
    if (dotsWrap) dotsWrap.appendChild(b);
    return b;
  });

  function go(n) {
    slides[index].classList.remove("is-active");
    if (dots[index]) dots[index].classList.remove("is-active");
    index = (n + slides.length) % slides.length;
    slides[index].classList.add("is-active");
    if (dots[index]) dots[index].classList.add("is-active");
  }

  function next() { go(index + 1); }
  function prev() { go(index - 1); }

  // 단일 슬라이드면 컨트롤 숨김
  if (slides.length < 2) {
    if (prevBtn) prevBtn.style.display = "none";
    if (nextBtn) nextBtn.style.display = "none";
    if (dotsWrap) dotsWrap.style.display = "none";
    go(index);
    return;
  }

  if (dots[index]) dots[index].classList.add("is-active");

  var timer = null;
  function start() { timer = setInterval(next, INTERVAL); }
  function stop() { if (timer) { clearInterval(timer); timer = null; } }
  function restart() { stop(); start(); }

  if (nextBtn) nextBtn.addEventListener("click", function () { next(); restart(); });
  if (prevBtn) prevBtn.addEventListener("click", function () { prev(); restart(); });

  // 마우스 오버 시 일시정지
  root.addEventListener("mouseenter", stop);
  root.addEventListener("mouseleave", start);

  start();
})();
