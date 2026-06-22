/* ==========================================================================
   LIT @ KAIST — 간단한 한/영 전환 (빌드 도구 없이 동작)

   사용법:
   - 텍스트를 바꾸고 싶은 요소에 data-ko / data-en 속성을 답니다.
       <h2 data-ko="연구실 소개" data-en="Overview">연구실 소개</h2>
   - input/textarea의 placeholder는 data-ko-placeholder / data-en-placeholder 사용:
       <input data-ko-placeholder="검색…" data-en-placeholder="Search…">
   - 전환 버튼은 어디든 data-lang-toggle 속성만 달면 됩니다:
       <button data-lang-toggle></button>

   주의: data-ko/data-en 가 적용되면 그 요소의 "텍스트 전체"가 교체됩니다.
   따라서 자식 태그가 있는 요소에는 달지 말고, 말단(텍스트만 있는) 요소에 다세요.
   ========================================================================== */
(function () {
  var KEY = "lit-lang";

  function getLang() {
    return localStorage.getItem(KEY) === "en" ? "en" : "ko";
  }

  function apply(lang) {
    document.documentElement.lang = lang;

    document.querySelectorAll("[data-ko],[data-en]").forEach(function (el) {
      var v = el.getAttribute("data-" + lang);
      if (v !== null) el.textContent = v;
    });

    document
      .querySelectorAll("[data-ko-placeholder],[data-en-placeholder]")
      .forEach(function (el) {
        var v = el.getAttribute("data-" + lang + "-placeholder");
        if (v !== null) el.placeholder = v;
      });

    document.querySelectorAll("[data-lang-toggle]").forEach(function (btn) {
      btn.setAttribute(
        "aria-label",
        lang === "ko" ? "Switch to English" : "한국어로 전환"
      );
      // 슬라이드 스위치(.lt-switch) 가 없을 때만 텍스트 라벨로 폴백
      if (!btn.querySelector(".lt-switch")) {
        btn.textContent = lang === "ko" ? "EN" : "한국어";
      }
    });
  }

  function setLang(lang) {
    localStorage.setItem(KEY, lang);
    apply(lang);
    // 언어가 바뀌면 알림 (people.js 의 마크다운 프로필 재렌더 등에서 사용)
    try {
      document.dispatchEvent(new CustomEvent("lit:lang", { detail: { lang: lang } }));
    } catch (e) {
      var ev = document.createEvent("Event");
      ev.initEvent("lit:lang", true, true);
      document.dispatchEvent(ev);
    }
  }

  document.addEventListener("click", function (e) {
    var btn = e.target.closest && e.target.closest("[data-lang-toggle]");
    if (!btn) return;
    e.preventDefault();
    setLang(getLang() === "ko" ? "en" : "ko");
  });

  // 초기 적용 (스크립트가 body 끝에서 로드되면 이미 DOM 준비됨)
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      apply(getLang());
    });
  } else {
    apply(getLang());
  }

  window.LitI18n = { apply: apply, get: getLang, set: setLang };
})();
