/* ==========================================================================
   LIT @ KAIST — 홈 전용 동작
   1) 연구 분야 토글 탭 (상단 버튼 → 아래 내용/이미지 전환)
   2) 갤러리: album.csv 의 최신 앨범 썸네일 3개 자동 표시
   ========================================================================== */
(function (global) {
  var P = global.Pubs;

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  /* 1) 연구 분야 토글 */
  var tabs = Array.prototype.slice.call(document.querySelectorAll(".rt-tab"));
  var rpanels = Array.prototype.slice.call(document.querySelectorAll(".rt-panel"));
  tabs.forEach(function (b) {
    b.addEventListener("click", function () {
      var i = b.getAttribute("data-rt");
      tabs.forEach(function (x) { x.classList.toggle("active", x === b); });
      rpanels.forEach(function (p) { p.classList.toggle("active", p.getAttribute("data-rt") === i); });
    });
  });

  /* 2) 갤러리 — 최신 앨범 썸네일 3개 */
  var g = document.getElementById("homeGallery");
  if (g && P) {
    fetch("data/album.csv", { cache: "no-store" })
      .then(function (r) { return r.text(); })
      .then(function (t) {
        var rows = P._rowsToObjects(P._parseCSV(t))
          .filter(function (x) {
            return (x.status || "").trim() === "publish" &&
                   (x.thumbnail_file || x.image_files || "").trim();
          })
          .sort(function (a, b) { return (b.date || "").localeCompare(a.date || ""); })
          .slice(0, 3);
        g.innerHTML = rows.map(function (r) {
          var th = (r.thumbnail_file || (r.image_files || "").split("|")[0] || "").trim();
          return '<a class="hg-item" href="album.html" title="' + esc(r.title) + '">' +
            '<img src="assets/img/album/' + esc(th) + '" alt="' + esc(r.title) +
            '" loading="lazy" onerror="this.closest(\'.hg-item\').style.display=\'none\'"></a>';
        }).join("");
      })
      .catch(function () { g.innerHTML = ""; });
  }
})(window);
