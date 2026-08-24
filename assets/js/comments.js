/* ==========================================================================
   LIT @ KAIST — 뉴스 댓글 (공용 암호 방식 · Supabase 백엔드)
   - 읽기: 누구나 / 쓰기·삭제: '연구실 암호'가 맞아야 (서버 함수에서 검증)
   - 암호는 코드에 없음(사용자가 입력 → Supabase 함수가 확인). anon 키/URL 은 공개해도 안전.
   - 값(SUPABASE_URL / SUPABASE_ANON)을 채우면 활성화됩니다.
   ========================================================================== */
(function (global) {
  // ▼▼ Supabase 프로젝트 값 넣기 (둘 다 공개용 — 커밋 OK) ▼▼
  var SUPABASE_URL = "https://pvzpiunlnuxzkqhticvw.supabase.co";
  var SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB2enBpdW5sbnV4emtxaHRpY3Z3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc1Mzk1NjgsImV4cCI6MjEwMzExNTU2OH0.7ozGn3RoUhKHmWFIuXWFSn5weLG6P9zkQP01QgGlGY4";
  // ▲▲ 비어 있으면 댓글 UI 는 표시되지 않습니다 ▲▲

  var sb = null;
  function client() {
    if (sb) return sb;
    if (!global.supabase || !SUPABASE_URL || !SUPABASE_ANON) return null;
    try { sb = global.supabase.createClient(SUPABASE_URL, SUPABASE_ANON); } catch (e) { return null; }
    return sb;
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function nl2br(s) { return esc(s).replace(/\r?\n/g, "<br>"); }
  function initialOf(name) { var s = String(name || "").trim(); return s ? s.charAt(0).toUpperCase() : "?"; }
  // 첨부 사진: 브라우저에서 리사이즈+JPEG 압축 → data URI (용량 절감)
  function resizeImage(file, maxW, quality) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () {
        var scale = Math.min(1, maxW / img.width);
        var w = Math.round(img.width * scale), h = Math.round(img.height * scale);
        var c = document.createElement("canvas"); c.width = w; c.height = h;
        c.getContext("2d").drawImage(img, 0, 0, w, h);
        try { resolve(c.toDataURL("image/jpeg", quality)); } catch (e) { reject(e); }
        URL.revokeObjectURL(img.src);
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }
  function fmt(ts) {
    var d = new Date(ts); if (isNaN(d)) return "";
    function p(n) { return (n < 10 ? "0" : "") + n; }
    return d.getFullYear() + "." + p(d.getMonth() + 1) + "." + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes());
  }
  // 한 댓글의 사진 목록 (신규: images 배열 / 구버전: image 단일)
  function imagesOf(r) {
    if (Array.isArray(r.images) && r.images.length) return r.images.filter(Boolean);
    if (r.image) return [r.image];
    return [];
  }

  // 댓글 목록 아이템(아바타 + 이름/시간 + 본문) — 뉴스 댓글/사진 댓글 공용
  function commentItem(r) {
    return '<div class="cm-item" data-id="' + r.id + '">' +
      '<div class="cm-avatar">' + esc(initialOf(r.name)) + "</div>" +
      '<div class="cm-bodywrap">' +
        '<div class="cm-meta"><b class="cm-who">' + esc(r.name) + "</b>" +
        '<span class="cm-when">' + esc(fmt(r.created_at)) + "</span>" +
        '<button type="button" class="cm-del" title="삭제">✕</button></div>' +
        '<div class="cm-text">' + nl2br(r.body) + "</div>" +
      "</div></div>";
  }

  // 사진 확대 갤러리(라이트박스) + 사진별 댓글 — 페이지에 하나만 생성해 공유
  var lb = null, lbState = { imgs: [], idx: 0, parent: "" };
  function photoKey() { return lbState.parent + "#" + lbState.idx; }
  function ensureLightbox() {
    if (lb) return lb;
    lb = document.createElement("div");
    lb.className = "cm-lb"; lb.hidden = true;
    lb.innerHTML =
      '<div class="cm-lb-stage">' +
        '<button type="button" class="cm-lb-close" aria-label="닫기">✕</button>' +
        '<button type="button" class="cm-lb-nav prev" aria-label="이전">‹</button>' +
        '<img class="cm-lb-img" alt="첨부 이미지">' +
        '<button type="button" class="cm-lb-nav next" aria-label="다음">›</button>' +
        '<div class="cm-lb-count"></div>' +
      "</div>" +
      '<aside class="cm-lb-side">' +
        '<div class="cm-lb-title">이 사진의 댓글</div>' +
        '<div class="cm-lb-list"></div>' +
        '<form class="cm-form cm-lb-form">' +
          '<div class="cm-row">' +
            '<input class="cm-name" maxlength="40" placeholder="이름" autocomplete="off">' +
            '<input class="cm-pass" type="password" inputmode="numeric" maxlength="20" placeholder="연구실 암호" autocomplete="off">' +
          "</div>" +
          '<textarea class="cm-body" rows="2" maxlength="2000" placeholder="이 사진에 댓글 달기"></textarea>' +
          '<div class="cm-actions"><span class="cm-msg"></span><button type="submit" class="cm-submit">등록</button></div>' +
        "</form>" +
      "</aside>";
    document.body.appendChild(lb);

    var imgEl = lb.querySelector(".cm-lb-img");
    var countEl = lb.querySelector(".cm-lb-count");
    var listEl = lb.querySelector(".cm-lb-list");
    var form = lb.querySelector(".cm-lb-form");

    function show() {
      imgEl.src = lbState.imgs[lbState.idx] || "";
      countEl.textContent = lbState.imgs.length > 1 ? (lbState.idx + 1) + " / " + lbState.imgs.length : "";
      var multi = lbState.imgs.length > 1 ? "visible" : "hidden";
      lb.querySelector(".prev").style.visibility = multi;
      lb.querySelector(".next").style.visibility = multi;
      loadPC();
    }
    function close() { lb.hidden = true; document.body.style.overflow = ""; lbState.imgs = []; }
    function step(d) { if (lbState.imgs.length) { lbState.idx = (lbState.idx + d + lbState.imgs.length) % lbState.imgs.length; show(); } }

    function loadPC() {
      var c = client(); if (!c) { listEl.innerHTML = ""; return; }
      var key = photoKey();
      listEl.innerHTML = '<div class="cm-loading">불러오는 중…</div>';
      c.from("photo_comments").select("*").eq("photo_key", key).order("created_at", { ascending: true })
        .then(function (res) {
          if (photoKey() !== key || lb.hidden) return;   // 그새 사진 이동/닫힘
          var rows = res.data || [];
          listEl.innerHTML = rows.length ? rows.map(commentItem).join("") : '<div class="cm-empty">첫 댓글을 남겨보세요.</div>';
        });
    }

    lb.addEventListener("click", function (e) {
      if (e.target.closest(".cm-lb-close")) return close();
      if (e.target.closest(".prev")) return step(-1);
      if (e.target.closest(".next")) return step(1);
      if (e.target === lb || e.target.classList.contains("cm-lb-stage")) return close();
    });

    listEl.addEventListener("click", function (e) {
      var del = e.target.closest && e.target.closest(".cm-del"); if (!del) return;
      var it = del.closest(".cm-item"); var id = it && it.getAttribute("data-id"); if (!id) return;
      var pass = global.prompt("삭제하려면 연구실 암호를 입력하세요."); if (pass == null) return;
      var c = client(); if (!c) return;
      c.rpc("delete_photo_comment", { p_id: Number(id), p_passcode: pass.trim() }).then(function (res) {
        if (res.error) { global.alert(/invalid_passcode/i.test(res.error.message || "") ? "암호가 올바르지 않습니다." : "삭제 실패"); return; }
        loadPC();
      });
    });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var name = form.querySelector(".cm-name").value.trim();
      var pass = form.querySelector(".cm-pass").value.trim();
      var body = form.querySelector(".cm-body").value.trim();
      var msg = form.querySelector(".cm-msg");
      if (!name || !pass || !body) { msg.textContent = "이름·암호·내용을 입력하세요."; return; }
      var c = client(); if (!c) return;
      var btn = form.querySelector(".cm-submit"); btn.disabled = true; msg.textContent = "등록 중…";
      c.rpc("add_photo_comment", { p_photo_key: photoKey(), p_name: name, p_body: body, p_passcode: pass }).then(function (res) {
        btn.disabled = false;
        if (res.error) {
          var m = res.error.message || "";
          msg.textContent = /invalid_passcode/i.test(m) ? "암호가 올바르지 않습니다."
            : /schema cache|find the function|photo_comments/i.test(m) ? "사진 댓글은 아직 설정 전이에요(관리자: comments-photos.sql 실행 필요)."
            : "등록 실패: " + m;
          return;
        }
        form.querySelector(".cm-body").value = ""; msg.textContent = "";
        loadPC();
      });
    });

    global.addEventListener("keydown", function (e) {
      if (lb.hidden) return;
      var tag = (e.target && e.target.tagName || "").toLowerCase();
      if (e.key === "Escape") return close();
      if (tag === "input" || tag === "textarea") return;   // 입력 중엔 화살표로 넘기지 않음
      if (e.key === "ArrowLeft") step(-1);
      else if (e.key === "ArrowRight") step(1);
    });

    lb.openWith = function (list, start, parent) {
      lbState.imgs = list.slice(); lbState.idx = start || 0; lbState.parent = String(parent || "");
      form.querySelector(".cm-pass").value = ""; form.querySelector(".cm-body").value = "";
      form.querySelector(".cm-msg").textContent = "";
      lb.hidden = false; document.body.style.overflow = "hidden"; show();
    };
    return lb;
  }
  function openGallery(list, start, parent) { if (list && list.length) ensureLightbox().openWith(list, start, parent); }

  function mount(root) {
    var boxes = (root || document).querySelectorAll(".ni-comments[data-news]");
    Array.prototype.forEach.call(boxes, setup);
  }

  function setup(box) {
    var c = client();
    if (!c) { box.innerHTML = ""; return; }        // 미설정 시 아무것도 표시 안 함
    var news = box.getAttribute("data-news") || "";

    box.innerHTML =
      '<button type="button" class="cm-toggle">💬 댓글 <span class="cm-count"></span></button>' +
      '<div class="cm-panel" hidden>' +
        '<div class="cm-list"></div>' +
        '<form class="cm-form">' +
          '<div class="cm-row">' +
            '<input class="cm-name" maxlength="40" placeholder="이름" autocomplete="off" required>' +
            '<input class="cm-pass" type="password" inputmode="numeric" maxlength="20" placeholder="연구실 암호" autocomplete="off" required>' +
          "</div>" +
          '<textarea class="cm-body" rows="2" maxlength="2000" placeholder="댓글을 입력하세요" required></textarea>' +
          '<div class="cm-preview" hidden></div>' +
          '<div class="cm-actions">' +
            '<button type="button" class="cm-photo" title="사진 첨부">' +
              '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><path d="m21 15-5-5L5 21"></path></svg>' +
              "<span>사진</span></button>" +
            '<input type="file" class="cm-file" accept="image/*" multiple hidden>' +
            '<span class="cm-msg"></span>' +
            '<button type="submit" class="cm-submit">등록</button>' +
          "</div>" +
        "</form>" +
      "</div>";

    var toggle = box.querySelector(".cm-toggle");
    var panel = box.querySelector(".cm-panel");
    var listEl = box.querySelector(".cm-list");
    var countEl = box.querySelector(".cm-count");
    var form = box.querySelector(".cm-form");
    var loaded = false;
    var listRows = [];

    toggle.addEventListener("click", function () {
      panel.hidden = !panel.hidden;
      if (!panel.hidden && !loaded) { loaded = true; load(); }
    });
    updateCount();

    function updateCount() {
      c.from("comments").select("id", { count: "exact", head: true }).eq("news_id", news)
        .then(function (res) { if (res.count != null) countEl.textContent = "(" + res.count + ")"; });
    }
    function load() {
      listEl.innerHTML = '<div class="cm-loading">불러오는 중…</div>';
      c.from("comments").select("*").eq("news_id", news).order("created_at", { ascending: true })
        .then(function (res) {
          var rows = res.data || [];
          listRows = rows;
          countEl.textContent = "(" + rows.length + ")";
          listEl.innerHTML = rows.length ? rows.map(item).join("") : '<div class="cm-empty">첫 댓글을 남겨보세요.</div>';
        });
    }
    function item(r) {
      var imgs = imagesOf(r);
      var gallery = "";
      if (imgs.length) {
        gallery = '<div class="cm-imgwrap' + (imgs.length > 1 ? " multi" : "") + '" data-id="' + r.id + '" role="button" tabindex="0" title="사진 보기">' +
          '<img class="cm-img" src="' + esc(imgs[0]) + '" alt="첨부 이미지" loading="lazy">' +
          (imgs.length > 1 ? '<span class="cm-more-photos">+' + (imgs.length - 1) + " 더보기</span>" : "") +
          "</div>";
      }
      return '<div class="cm-item" data-id="' + r.id + '">' +
        '<div class="cm-avatar">' + esc(initialOf(r.name)) + "</div>" +
        '<div class="cm-bodywrap">' +
          '<div class="cm-meta"><b class="cm-who">' + esc(r.name) + "</b>" +
          '<span class="cm-when">' + esc(fmt(r.created_at)) + "</span>" +
          '<button type="button" class="cm-del" title="삭제">✕</button></div>' +
          (r.body && r.body.trim() ? '<div class="cm-text">' + nl2br(r.body) + "</div>" : "") +
          gallery +
        "</div>" +
      "</div>";
    }

    // ── 사진 첨부(여러 장): 버튼 → 파일 선택 → 리사이즈 → 미리보기 스트립 ──
    var MAX_PHOTOS = 6;
    var pendingImgs = [];
    var fileInput = form.querySelector(".cm-file");
    var photoBtn = form.querySelector(".cm-photo");
    var preview = form.querySelector(".cm-preview");
    var formMsg = form.querySelector(".cm-msg");
    photoBtn.addEventListener("click", function () { fileInput.click(); });
    fileInput.addEventListener("change", function () {
      var files = fileInput.files ? Array.prototype.slice.call(fileInput.files) : [];
      fileInput.value = "";
      if (!files.length) return;
      var room = MAX_PHOTOS - pendingImgs.length;
      if (room <= 0) { formMsg.textContent = "사진은 최대 " + MAX_PHOTOS + "장까지예요."; return; }
      if (files.length > room) formMsg.textContent = "최대 " + MAX_PHOTOS + "장까지만 담겼어요.";
      else formMsg.textContent = "사진 처리 중…";
      Promise.all(files.slice(0, room).map(function (f) {
        return resizeImage(f, 1000, 0.82)
          .then(function (uri) { return uri.length > 850000 ? resizeImage(f, 760, 0.72) : uri; })
          .catch(function () { return null; });
      })).then(function (uris) {
        var added = 0;
        uris.forEach(function (u) { if (u && u.length <= 850000) { pendingImgs.push(u); added++; } });
        if (!added && !pendingImgs.length) formMsg.textContent = "이미지를 처리하지 못했어요(JPG/PNG 권장).";
        else if (formMsg.textContent === "사진 처리 중…") formMsg.textContent = "";
        renderPreview();
      });
    });
    function renderPreview() {
      if (!pendingImgs.length) { preview.hidden = true; preview.innerHTML = ""; return; }
      preview.hidden = false;
      preview.innerHTML = pendingImgs.map(function (u, i) {
        return '<span class="cm-thumb"><img src="' + esc(u) + '"><button type="button" class="cm-imgdel" data-i="' + i + '" title="사진 제거">✕</button></span>';
      }).join("");
    }
    preview.addEventListener("click", function (e) {
      var del = e.target.closest && e.target.closest(".cm-imgdel"); if (!del) return;
      pendingImgs.splice(Number(del.getAttribute("data-i")), 1);
      renderPreview();
    });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var name = form.querySelector(".cm-name").value.trim();
      var pass = form.querySelector(".cm-pass").value.trim();
      var body = form.querySelector(".cm-body").value.trim();
      var msg = form.querySelector(".cm-msg");
      if (!name || !pass || (!body && !pendingImgs.length)) { msg.textContent = "이름·암호·내용(또는 사진)을 입력하세요."; return; }
      var btn = form.querySelector(".cm-submit"); btn.disabled = true; msg.textContent = "등록 중…";
      var params = { p_news_id: news, p_name: name, p_body: body, p_passcode: pass };
      if (pendingImgs.length) params.p_images = pendingImgs;   // 사진 있을 때만 전송(구버전 함수와도 호환)
      c.rpc("add_comment", params).then(function (res) {
        btn.disabled = false;
        if (res.error) {
          var m = res.error.message || "";
          msg.textContent = /invalid_passcode/i.test(m) ? "암호가 올바르지 않습니다."
            : /too_many_images/i.test(m) ? "사진은 최대 " + MAX_PHOTOS + "장까지예요."
            : /image_too_large/i.test(m) ? "사진 용량이 너무 큽니다. 더 작은 이미지를 사용하세요."
            : /p_image|schema cache|find the function/i.test(m) ? "사진 첨부는 아직 설정 전이에요(관리자: comments-photos.sql 실행 필요)."
            : "등록 실패: " + m;
          return;
        }
        form.querySelector(".cm-body").value = ""; form.querySelector(".cm-pass").value = ""; msg.textContent = "";
        pendingImgs = []; renderPreview();
        load();
      });
    });

    listEl.addEventListener("click", function (e) {
      var wrap = e.target.closest && e.target.closest(".cm-imgwrap");
      if (wrap) {
        var wid = wrap.getAttribute("data-id");
        var wr = listRows.filter(function (x) { return String(x.id) === wid; })[0];
        if (wr) openGallery(imagesOf(wr), 0, wr.id);
        return;
      }
      var del = e.target.closest && e.target.closest(".cm-del"); if (!del) return;
      var it = del.closest(".cm-item"); var id = it && it.getAttribute("data-id"); if (!id) return;
      var pass = global.prompt("삭제하려면 연구실 암호를 입력하세요."); if (pass == null) return;
      c.rpc("delete_comment", { p_id: Number(id), p_passcode: pass.trim() }).then(function (res) {
        if (res.error) { global.alert(/invalid_passcode/i.test(res.error.message || "") ? "암호가 올바르지 않습니다." : "삭제 실패"); return; }
        load();
      });
    });
  }

  global.LitComments = { mount: mount };
})(window);
