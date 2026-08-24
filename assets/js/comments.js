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
  function fmt(ts) {
    var d = new Date(ts); if (isNaN(d)) return "";
    function p(n) { return (n < 10 ? "0" : "") + n; }
    return d.getFullYear() + "." + p(d.getMonth() + 1) + "." + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes());
  }

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
          '<div class="cm-actions"><span class="cm-msg"></span><button type="submit" class="cm-submit">등록</button></div>' +
        "</form>" +
      "</div>";

    var toggle = box.querySelector(".cm-toggle");
    var panel = box.querySelector(".cm-panel");
    var listEl = box.querySelector(".cm-list");
    var countEl = box.querySelector(".cm-count");
    var form = box.querySelector(".cm-form");
    var loaded = false;

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
          countEl.textContent = "(" + rows.length + ")";
          listEl.innerHTML = rows.length ? rows.map(item).join("") : '<div class="cm-empty">첫 댓글을 남겨보세요.</div>';
        });
    }
    function item(r) {
      return '<div class="cm-item" data-id="' + r.id + '">' +
        '<div class="cm-meta"><b class="cm-who">' + esc(r.name) + "</b>" +
        '<span class="cm-when">' + esc(fmt(r.created_at)) + "</span>" +
        '<button type="button" class="cm-del" title="삭제">✕</button></div>' +
        '<div class="cm-text">' + nl2br(r.body) + "</div></div>";
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var name = form.querySelector(".cm-name").value.trim();
      var pass = form.querySelector(".cm-pass").value.trim();
      var body = form.querySelector(".cm-body").value.trim();
      var msg = form.querySelector(".cm-msg");
      if (!name || !pass || !body) { msg.textContent = "이름·암호·내용을 모두 입력하세요."; return; }
      var btn = form.querySelector(".cm-submit"); btn.disabled = true; msg.textContent = "등록 중…";
      c.rpc("add_comment", { p_news_id: news, p_name: name, p_body: body, p_passcode: pass }).then(function (res) {
        btn.disabled = false;
        if (res.error) { msg.textContent = /passcode/i.test(res.error.message) ? "암호가 올바르지 않습니다." : "등록 실패: " + res.error.message; return; }
        form.querySelector(".cm-body").value = ""; form.querySelector(".cm-pass").value = ""; msg.textContent = "";
        load();
      });
    });

    listEl.addEventListener("click", function (e) {
      var del = e.target.closest && e.target.closest(".cm-del"); if (!del) return;
      var it = del.closest(".cm-item"); var id = it && it.getAttribute("data-id"); if (!id) return;
      var pass = global.prompt("삭제하려면 연구실 암호를 입력하세요."); if (pass == null) return;
      c.rpc("delete_comment", { p_id: Number(id), p_passcode: pass.trim() }).then(function (res) {
        if (res.error) { global.alert(/passcode/i.test(res.error.message) ? "암호가 올바르지 않습니다." : "삭제 실패"); return; }
        load();
      });
    });
  }

  global.LitComments = { mount: mount };
})(window);
