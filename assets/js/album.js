/* ==========================================================================
   LIT @ KAIST — Album (연도별 썸네일 그리드 + 라이트박스 갤러리)
   - data/album.csv 를 pubs.js 파서로 읽습니다.
   - image_files 는 '|' 로 구분된 상대경로 (베이스: assets/img/album/)
   - status === 'publish' 만 표시합니다.
   ========================================================================== */
(function (global) {
  var P = global.Pubs;
  var BASE = "assets/img/album/";

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function imgList(row) {
    return (row.image_files || "")
      .split("|")
      .map(function (s) { return s.trim(); })
      .filter(Boolean);
  }

  function dateLabel(row) {
    // "2026-05-28 15:13:04" → "2026.05.28"
    var d = (row.date || "").trim().slice(0, 10);
    return d ? d.replace(/-/g, ".") : (row.year || "");
  }

  function init(cfg) {
    var mount = document.getElementById(cfg.mount);
    var filterEl = document.getElementById(cfg.filterEl);
    var albums = [];
    var years = [];
    var active = "all";

    mount.innerHTML = '<p class="muted" style="padding:24px 0">불러오는 중…</p>';

    fetch(cfg.csv)
      .then(function (r) {
        if (!r.ok) throw new Error(cfg.csv + " (HTTP " + r.status + ")");
        return r.text();
      })
      .then(function (t) {
        var rows = P._rowsToObjects(P._parseCSV(t));
        albums = rows
          .filter(function (r) { return (r.status || "").trim() === "publish"; })
          .filter(function (r) { return (r.title || "").trim() && imgList(r).length; })
          .sort(function (a, b) { return (b.date || "").localeCompare(a.date || ""); });
        years = [];
        albums.forEach(function (r) {
          var y = (r.year || "").trim();
          if (y && years.indexOf(y) < 0) years.push(y);
        });
        years.sort(function (a, b) { return b - a; });
        buildFilter();
        render();
        buildLightbox();
      })
      .catch(function (err) {
        mount.innerHTML =
          '<div class="error">앨범 데이터를 불러오지 못했습니다. 로컬에서는 ' +
          "<code>python3 -m http.server</code> 로 열어주세요.<br>" + esc(err.message) + "</div>";
      });

    /* ---------- 연도 필터 ---------- */
    function buildFilter() {
      filterEl.innerHTML = "";
      var all = ["all"].concat(years);
      all.forEach(function (y) {
        var b = document.createElement("button");
        b.className = "tab" + (y === active ? " active" : "");
        b.type = "button";
        b.textContent = y === "all" ? "All" : y;
        b.addEventListener("click", function () {
          active = y;
          Array.prototype.forEach.call(filterEl.querySelectorAll(".tab"), function (el) {
            el.classList.toggle("active", el === b);
          });
          render();
          if (history.replaceState) history.replaceState(null, "", y === "all" ? "#" : "#" + y);
        });
        filterEl.appendChild(b);
      });
    }

    /* ---------- 카드 / 연도 섹션 ---------- */
    function card(row, idx) {
      var thumb = (row.thumbnail_file || imgList(row)[0] || "").trim();
      var n = imgList(row).length;
      return (
        '<button class="album-card reveal" type="button" data-idx="' + idx + '">' +
          '<span class="ac-thumb">' +
            (thumb ? '<img src="' + esc(BASE + thumb) + '" alt="' + esc(row.title) +
              '" loading="lazy" onerror="this.classList.add(\'p-imgerr\')">' : "") +
            (n > 1 ? '<span class="ac-count">🖼 ' + n + "</span>" : "") +
          "</span>" +
          '<span class="ac-body">' +
            '<span class="ac-title">' + esc(row.title) + "</span>" +
            '<span class="ac-date">' + esc(dateLabel(row)) + "</span>" +
            (row.content ? '<span class="ac-desc">' + esc(row.content) + "</span>" : "") +
          "</span>" +
        "</button>"
      );
    }

    function gridHtml(list) {
      return '<div class="album-grid">' +
        list.map(function (r) { return card(r, albums.indexOf(r)); }).join("") + "</div>";
    }

    function render() {
      var html = "";
      if (active === "all") {
        years.forEach(function (y) {
          var list = albums.filter(function (r) { return (r.year || "").trim() === y; });
          if (!list.length) return;
          html += '<section class="album-year">' +
            '<h2 class="year">' + esc(y) +
            ' <span class="year-count">' + list.length + "</span></h2>" +
            gridHtml(list) + "</section>";
        });
      } else {
        var list = albums.filter(function (r) { return (r.year || "").trim() === active; });
        html = gridHtml(list);
      }
      mount.innerHTML = html || '<p class="muted" style="padding:24px 0">표시할 앨범이 없습니다.</p>';
      Array.prototype.forEach.call(mount.querySelectorAll(".album-card"), function (el) {
        el.addEventListener("click", function () {
          var im = el.querySelector(".ac-thumb img");
          openLightbox(+el.getAttribute("data-idx"), im ? im.getBoundingClientRect() : null);
        });
      });
      if (global.LitReveal) global.LitReveal.observe(mount.querySelectorAll(".reveal"));
    }

    /* ---------- 라이트박스 ---------- */
    var lb, lbImg, lbFig, lbCap, lbCounter, lbPrev, lbNext;
    var curImgs = [], curPos = 0, curRow = null;
    var reduceMotion = global.matchMedia &&
      global.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function buildLightbox() {
      if (lb) return;
      lb = document.createElement("div");
      lb.className = "lightbox";
      lb.setAttribute("aria-hidden", "true");
      lb.innerHTML =
        '<button class="lb-close" type="button" aria-label="닫기">&times;</button>' +
        '<button class="lb-nav lb-prev" type="button" aria-label="이전">&#10094;</button>' +
        '<figure class="lb-figure">' +
          '<img class="lb-img" alt="">' +
          '<figcaption class="lb-caption"></figcaption>' +
        "</figure>" +
        '<button class="lb-nav lb-next" type="button" aria-label="다음">&#10095;</button>' +
        '<div class="lb-counter"></div>';
      document.body.appendChild(lb);
      lbImg = lb.querySelector(".lb-img");
      lbFig = lb.querySelector(".lb-figure");
      lbCap = lb.querySelector(".lb-caption");
      lbCounter = lb.querySelector(".lb-counter");
      lbPrev = lb.querySelector(".lb-prev");
      lbNext = lb.querySelector(".lb-next");

      lb.querySelector(".lb-close").addEventListener("click", closeLightbox);
      lbPrev.addEventListener("click", function (e) { e.stopPropagation(); step(-1); });
      lbNext.addEventListener("click", function (e) { e.stopPropagation(); step(1); });
      lb.addEventListener("click", function (e) { if (e.target === lb) closeLightbox(); });
      document.addEventListener("keydown", function (e) {
        if (lb.getAttribute("aria-hidden") === "true") return;
        if (e.key === "Escape") closeLightbox();
        else if (e.key === "ArrowLeft") step(-1);
        else if (e.key === "ArrowRight") step(1);
      });
    }

    function openLightbox(idx, originRect) {
      curRow = albums[idx];
      if (!curRow) return;
      curImgs = imgList(curRow);
      curPos = 0;
      updateMeta();
      lb.setAttribute("aria-hidden", "false");
      document.body.style.overflow = "hidden";
      if (!reduceMotion && lb.animate) {
        lb.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 240, easing: "ease" });
      }
      showImg(originRect ? { type: "flip", rect: originRect } : { type: "zoom" });
    }

    function closeLightbox() {
      lb.setAttribute("aria-hidden", "true");
      document.body.style.overflow = "";
      lbImg.src = "";
      lbFig.classList.remove("is-stack");
    }

    function step(d) {
      if (curImgs.length < 2) return;
      curPos = (curPos + d + curImgs.length) % curImgs.length;
      updateMeta();
      showImg({ type: "slide", dir: d > 0 ? 1 : -1 });
    }

    // 제목/날짜/설명/카운터/네비/스택 표시 (이미지와 무관, 즉시)
    function updateMeta() {
      var multi = curImgs.length > 1;
      lbImg.alt = (curRow.title || "") + " (" + (curPos + 1) + ")";
      lbCap.innerHTML =
        "<strong>" + esc(curRow.title) + "</strong>" +
        '<span class="lb-date">' + esc(dateLabel(curRow)) + "</span>" +
        (curRow.content ? '<span class="lb-desc">' + esc(curRow.content) + "</span>" : "");
      lbCounter.textContent = multi ? (curPos + 1) + " / " + curImgs.length : "";
      lbPrev.style.display = multi ? "" : "none";
      lbNext.style.display = multi ? "" : "none";
    }

    // 이미지 교체 + 애니메이션 (flip=썸네일에서 다가옴, zoom=가운데서 확대, slide=좌우 이동)
    function showImg(anim) {
      var src = BASE + curImgs[curPos];

      if (reduceMotion || !lbImg.animate) { lbImg.src = src; return; }

      if (anim && anim.type === "slide") {
        lbFig.classList.remove("is-stack");
        lbImg.src = src;
        var x = anim.dir > 0 ? 64 : -64;
        lbImg.animate(
          [{ transform: "translateX(" + x + "px)", opacity: 0 },
           { transform: "none", opacity: 1 }],
          { duration: 480, easing: "cubic-bezier(.2,.7,.2,1)" }
        );
        return;
      }

      // flip / zoom 은 최종 크기를 알아야 하므로 로드 후 실행
      lbImg.style.visibility = "hidden";
      lbImg.onload = function () {
        lbImg.onload = null;
        lbImg.style.visibility = "";
        var f = lbImg.getBoundingClientRect();
        var a;
        if (anim && anim.type === "flip" && anim.rect && f.width) {
          var r = anim.rect;
          var dx = r.left + r.width / 2 - (f.left + f.width / 2);
          var dy = r.top + r.height / 2 - (f.top + f.height / 2);
          var s = Math.max(0.05, r.width / f.width);
          a = lbImg.animate(
            [{ transform: "translate(" + dx + "px," + dy + "px) scale(" + s + ")", opacity: 0.45 },
             { transform: "none", opacity: 1 }],
            { duration: 400, easing: "cubic-bezier(.2,.7,.2,1)" }
          );
        } else {
          a = lbImg.animate(
            [{ transform: "scale(.84)", opacity: 0 },
             { transform: "none", opacity: 1 }],
            { duration: 340, easing: "cubic-bezier(.2,.7,.2,1)" }
          );
        }
        // 다가오는 동안만 "뭉탱이", 도착하면 깔끔한 한 장으로
        if (curImgs.length > 1) {
          lbFig.classList.add("is-stack");
          if (a) a.onfinish = function () { lbFig.classList.remove("is-stack"); };
          else lbFig.classList.remove("is-stack");
        } else {
          lbFig.classList.remove("is-stack");
        }
      };
      lbImg.src = src;
      if (lbImg.complete && lbImg.naturalWidth && lbImg.onload) lbImg.onload();
    }
  }

  global.Album = { init: init };
})(window);
