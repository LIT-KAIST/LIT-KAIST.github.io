/* ==========================================================================
   LIT @ KAIST — 공용 푸터 (모든 페이지의 <footer id="siteFooter"> 에 주입)
   여기 한 곳만 고치면 전 페이지 푸터에 반영됩니다.
   ========================================================================== */
(function (global) {
  // ▼ 외부 링크 — 값이 있으면 표시, 비우면 숨김.
  var LINKS = {
    email: "hcpark@kaist.ac.kr",
    tel: "+82-42-350-7520",
    coe: "https://engineering.kaist.ac.kr/",   // 공과대학
    ee: "https://ee.kaist.ac.kr/",             // 전기및전자공학부
    scholar: "https://scholar.google.com/citations?user=j9EJaOsAAAAJ&hl=en", // 지도교수
    github: "",                                // 연구실 GitHub URL (있으면 입력)
  };
  var V = "?v=20260623m";

  var f = document.getElementById("siteFooter");
  if (!f) return;

  // langCls: 언어 표시 제어(<a>에), sizeCls: KAIST 글자 크기 통일용 높이(<img>에)
  function logoLink(file, alt, langCls, sizeCls, href) {
    var im = '<img class="footer-logo ' + sizeCls + '" src="assets/' + file + V + '" alt="' + alt + '">';
    var c = langCls ? ' class="' + langCls + '"' : "";
    return href ? "<a" + c + ' href="' + href + '" target="_blank" rel="noopener">' + im + "</a>"
                : "<span" + c + ">" + im + "</span>";
  }

  var quick = [
    ["index.html", "Home"], ["about.html", "About"], ["people.html", "People"],
    ["journal.html", "Publications"], ["projects.html", "Projects"],
    ["news.html", "News"], ["contact.html", "Contact"],
  ];

  var ext = [];
  if (LINKS.tel) ext.push('<a href="tel:' + LINKS.tel.replace(/[^+\d]/g, "") + '" data-ko="전화 ' + LINKS.tel + '" data-en="Tel ' + LINKS.tel + '">전화 ' + LINKS.tel + "</a>");
  if (LINKS.email) ext.push('<a href="mailto:' + LINKS.email + '">' + LINKS.email + "</a>");
  if (LINKS.scholar) ext.push('<a href="' + LINKS.scholar + '" target="_blank" rel="noopener">Google Scholar</a>');
  if (LINKS.github) ext.push('<a href="' + LINKS.github + '" target="_blank" rel="noopener">GitHub</a>');

  f.innerHTML =
    '<div class="wrap footer-grid">' +
      '<div class="f-logos">' +
        logoLink("Kaist_COE_k2_RGB.png", "KAIST 공과대학", "lang-ko", "fl-coe-k", LINKS.coe) +
        logoLink("Kaist_DEE_k2_RGB.png", "KAIST 전기및전자공학부", "lang-ko", "fl-dee-k", LINKS.ee) +
        logoLink("Kaist_COE_e2_RGB.png", "KAIST College of Engineering", "lang-en", "fl-coe-e", LINKS.coe) +
        logoLink("Kaist_DEE_e3_RGB.png", "KAIST School of Electrical Engineering", "lang-en", "fl-dee-e", LINKS.ee) +
      "</div>" +
      '<nav class="f-links" aria-label="quick links">' +
        quick.map(function (l) { return '<a href="' + l[0] + '">' + l[1] + "</a>"; }).join("") +
      "</nav>" +
      '<div class="f-contact">' +
        '<div data-ko="대전광역시 유성구 대학로 291, 한국과학기술원 LG이노베이션홀(N24) 3111호" data-en="Room 3111, LG Innovation Hall (N24), KAIST, 291 Daehak-ro, Yuseong-gu, Daejeon">대전광역시 유성구 대학로 291, 한국과학기술원 LG이노베이션홀(N24) 3111호</div>' +
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
