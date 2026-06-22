/* ==========================================================================
   LIT @ KAIST — 공용 푸터 (모든 페이지의 <footer id="siteFooter"> 에 주입)
   여기 한 곳만 고치면 전 페이지 푸터에 반영됩니다.
   ========================================================================== */
(function (global) {
  // ▼ 외부 링크 — 값이 있으면 표시, 비우면 숨김. (Scholar/GitHub 는 URL 생기면 입력)
  var LINKS = {
    email: "hcpark@kaist.ac.kr",
    kaist: "https://www.kaist.ac.kr",
    ee: "https://ee.kaist.ac.kr",
    scholar: "",   // 지도교수 Google Scholar URL
    github: "",    // 연구실 GitHub URL
  };
  var V = "?v=20260620zx";

  var f = document.getElementById("siteFooter");
  if (!f) return;

  function logoLink(file, alt, cls, href) {
    var im = '<img class="footer-logo" src="assets/' + file + V + '" alt="' + alt + '">';
    var c = cls ? ' class="' + cls + '"' : "";
    return href ? "<a" + c + ' href="' + href + '" target="_blank" rel="noopener">' + im + "</a>"
                : (cls ? '<span class="' + cls + '">' + im + "</span>" : im);
  }

  var quick = [
    ["index.html", "Home"], ["about.html", "About"], ["people.html", "People"],
    ["journal.html", "Publications"], ["projects.html", "Projects"],
    ["news.html", "News"], ["contact.html", "Contact"],
  ];

  var ext = [];
  if (LINKS.email) ext.push('<a href="mailto:' + LINKS.email + '">' + LINKS.email + "</a>");
  if (LINKS.scholar) ext.push('<a href="' + LINKS.scholar + '" target="_blank" rel="noopener">Google Scholar</a>');
  if (LINKS.github) ext.push('<a href="' + LINKS.github + '" target="_blank" rel="noopener">GitHub</a>');
  if (LINKS.ee) ext.push('<a href="' + LINKS.ee + '" target="_blank" rel="noopener" data-ko="전기및전자공학부" data-en="School of EE">전기및전자공학부</a>');

  f.innerHTML =
    '<div class="wrap footer-grid">' +
      '<div class="f-logos">' +
        logoLink("kaist-logo.png", "KAIST", "", LINKS.kaist) +
        logoLink("Kaist_COE_k2_RGB.png", "KAIST 공과대학", "lang-ko", LINKS.kaist) +
        logoLink("Kaist_DEE_k2_RGB.png", "KAIST 전기및전자공학부", "lang-ko", LINKS.ee) +
        logoLink("Kaist_COE_e2_RGB.png", "KAIST College of Engineering", "lang-en", LINKS.kaist) +
        logoLink("Kaist_DEE_e3_RGB.png", "KAIST School of EE", "lang-en", LINKS.ee) +
      "</div>" +
      '<nav class="f-links" aria-label="quick links">' +
        quick.map(function (l) { return '<a href="' + l[0] + '">' + l[1] + "</a>"; }).join("") +
      "</nav>" +
      '<div class="f-contact">' +
        '<div data-ko="대전광역시 유성구 대학로 291, 한국과학기술원 우정연구동(W7) 101호" data-en="Room 101, Woojung Research Bldg (W7), KAIST, 291 Daehak-ro, Yuseong-gu, Daejeon">대전광역시 유성구 대학로 291, 한국과학기술원 우정연구동(W7) 101호</div>' +
        (ext.length ? '<div class="f-ext">' + ext.join(" · ") + "</div>" : "") +
      "</div>" +
      '<div class="f-copy">© <span id="yr"></span> LIT Laboratory, KAIST. All rights reserved.</div>' +
    "</div>";

  var y = f.querySelector("#yr");
  if (y) y.textContent = new Date().getFullYear();
  if (global.LitI18n) global.LitI18n.apply(global.LitI18n.get());

  /* 맨 위로 버튼 */
  var top = document.createElement("button");
  top.className = "to-top"; top.type = "button";
  top.setAttribute("aria-label", "맨 위로"); top.innerHTML = "↑";
  document.body.appendChild(top);
  top.addEventListener("click", function () { global.scrollTo({ top: 0, behavior: "smooth" }); });
  function onScroll() { top.classList.toggle("show", global.pageYOffset > 400); }
  global.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
})(window);
