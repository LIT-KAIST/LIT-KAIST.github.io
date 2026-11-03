/* ==========================================================================
   I²SAC — 푸터 연도 · 맨 위로 버튼
   ========================================================================== */
(function (global) {
  var y = document.getElementById("yr");
  if (y) y.textContent = new Date().getFullYear();

  var top = document.createElement("button");
  top.className = "to-top"; top.type = "button";
  top.setAttribute("aria-label", "맨 위로"); top.innerHTML = "↑";
  document.body.appendChild(top);
  top.addEventListener("click", function () { global.scrollTo({ top: 0, behavior: "smooth" }); });
  function onScroll() { top.classList.toggle("show", global.pageYOffset > 400); }
  global.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
})(window);
