/* =========================================================================
 * pubs.js — LIT publications renderer
 *
 * Loads WordPress-exported publications CSVs (journal / conference / patent,
 * each split into international + domestic), normalizes the messy fields, and
 * renders entries grouped by year with International/Domestic tabs, a live
 * text filter and expandable abstracts.
 *
 * To update the site, just replace the CSV files in /data — no build step.
 * ========================================================================= */
(function (global) {
  "use strict";

  /* ----------------------------- CSV parsing ----------------------------- *
   * RFC-4180 style parser. Handles:
   *   - a leading UTF-8 BOM
   *   - quoted fields containing commas, newlines and "" escapes
   *   - CRLF or LF line endings
   */
  function parseCSV(text) {
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // strip BOM
    const rows = [];
    let row = [];
    let field = "";
    let inQuotes = false;
    const n = text.length;
    for (let i = 0; i < n; i++) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }   // escaped quote
          else { inQuotes = false; }
        } else {
          field += c;
        }
      } else if (c === '"') {
        inQuotes = true;
      } else if (c === ",") {
        row.push(field); field = "";
      } else if (c === "\r") {
        /* ignore — CRLF handled by the \n branch */
      } else if (c === "\n") {
        row.push(field); rows.push(row); row = []; field = "";
      } else {
        field += c;
      }
    }
    if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
    return rows;
  }

  function rowsToObjects(rows) {
    if (!rows.length) return [];
    const headers = rows[0].map((h) => h.trim());
    const out = [];
    for (let r = 1; r < rows.length; r++) {
      const cells = rows[r];
      if (cells.length === 1 && cells[0].trim() === "") continue; // blank line
      const obj = {};
      for (let c = 0; c < headers.length; c++) {
        obj[headers[c]] = (cells[c] != null ? cells[c] : "").trim();
      }
      out.push(obj);
    }
    return out;
  }

  /* --------------------------- small helpers ----------------------------- */
  function esc(s) {
    return (s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function firstNonEmpty() {
    for (let i = 0; i < arguments.length; i++) {
      const v = arguments[i];
      if (v && v.trim()) return v.trim();
    }
    return "";
  }

  // Sortable date string (YYYY-MM-DD). Falls back to the "added" timestamp
  // when the publication date is missing or "0000-00-00".
  function sortKey(rec) {
    let d = rec.date || "";
    if (!/^\d{4}/.test(d) || d.slice(0, 4) === "0000") d = rec.added || "";
    return d || "0000-00-00";
  }

  function yearOf(rec) {
    const k = sortKey(rec);
    return /^\d{4}/.test(k) && k.slice(0, 4) !== "0000" ? k.slice(0, 4) : "기타";
  }

  // Build an https DOI / URL link from the doi or url column (may be empty).
  function linkOf(rec) {
    const doi = (rec.doi || "").trim();
    if (doi) {
      if (/^https?:\/\//i.test(doi)) return doi;
      return "https://doi.org/" + doi.replace(/^doi:\s*/i, "");
    }
    const url = (rec.url || "").trim();
    return /^https?:\/\//i.test(url) ? url : "";
  }

  // 영문 저자 목록을 "A, B, and C"(Oxford) 형식으로 정규화. 국문(한글 포함)은 원본 유지.
  function formatAuthors(str) {
    str = (str || "").trim();
    if (!str || /[가-힣]/.test(str)) return str;
    var parts = str.split(/\s*,\s*/).map(function (s) { return s.replace(/^and\s+/i, "").trim(); }).filter(Boolean);
    var out = [];
    parts.forEach(function (s) { if (/\s+and\s+/i.test(s)) out.push.apply(out, s.split(/\s+and\s+/i)); else out.push(s); });
    out = out.map(function (s) { return s.trim(); }).filter(function (s) { return s && s.toLowerCase() !== "and"; });
    if (out.length <= 1) return out[0] || "";
    if (out.length === 2) return out[0] + " and " + out[1];
    return out.slice(0, -1).join(", ") + ", and " + out[out.length - 1];
  }

  // Highlight the PI (H. Park / Hyuncheol Park / 박현철) in an author string.
  function highlightPI(escapedAuthors) {
    return escapedAuthors.replace(
      /(^|,\s*|and\s+)(H\.\s*Park|Hyuncheol\s+Park|박현철)(?=\s*(,|$))/g,
      "$1<strong>$2</strong>"
    );
  }

  function cleanAbstract(s) {
    return (s || "").replace(/\s+/g, " ").trim();
  }

  function lang() {
    if (global.LitI18n && global.LitI18n.get) return global.LitI18n.get();
    return document.documentElement.lang === "en" ? "en" : "ko";
  }
  // A leaf element whose text i18n.js swaps on the KO/EN toggle.
  function i18nSpan(cls, ko, en) {
    return '<span class="' + cls + '" data-ko="' + esc(ko) + '" data-en="' + esc(en) + '">' +
      esc(lang() === "en" ? en : ko) + "</span>";
  }

  /* ------------------------------- patents -------------------------------- *
   * One row = one patent. app_no/app_date (출원) are kept after it is granted;
   * reg_no/reg_date (등록) are filled in when it is. A row with reg_no is
   * "granted" and is filed under its registration year, otherwise "filed"
   * under its application year.
   */
  function prepPatent(r) {
    r._status = (r.reg_no || "").trim() ? "granted" : "filed";
    const d = r._status === "granted" ? r.reg_date : r.app_date;
    if (d && d.trim()) r.date = d.trim();
    // family: 같은 발명(국내 우선권 재출원 · PCT · 해외 출원)끼리 묶는 키 = 기준(최초 국내) 출원번호.
    // 기준 특허 자신은 family 를 비워 두므로 자기 출원번호가 곧 키.
    r._fkey = famKey(r.family || r.app_no);
    const nums = [r.app_no, r.reg_no].join(" ");
    r._hay = [r.title, r.author, r.editor, r.country, r.app_date, r.reg_date, nums,
      nums.replace(/[^0-9 ]/g, ""), r.abstract].join(" ").toLowerCase();
  }
  function famKey(s) { return (s || "").toUpperCase().replace(/[^0-9A-Z]/g, ""); }

  // 모든 탭의 특허를 한꺼번에 보고 family 별로 묶어, 각 항목에 '관련 출원' 목록(_related)을 붙임
  function linkFamilies(data) {
    const groups = {};
    Object.keys(data).forEach(function (src) {
      data[src].forEach(function (r) {
        r._src = src;
        if (r._fkey) (groups[r._fkey] = groups[r._fkey] || []).push(r);
      });
    });
    Object.keys(groups).forEach(function (k) {
      const g = groups[k];
      if (g.length < 2) return;
      g.sort(function (a, b) { return (a.app_date || a.date || "").localeCompare(b.app_date || b.date || ""); });
      g.forEach(function (r) { r._related = g.filter(function (o) { return o !== r; }); });
    });
  }

  function ccOf(rec) { return (rec.country || "").trim() || "KR"; }
  // 관련 출원 칩: 국내끼리는 '국내 우선권'(우선권 주장으로 이어진 출원), 해외·PCT 는 따로 묶어 표시
  function relatedLine(rec) {
    if (!rec._related || !rec._related.length) return "";
    function chips(list) {
      return list.map(function (o) {
        const reg = (o.reg_no || "").trim();
        return '<a class="pat-rel" href="#p' + esc(o.pub_id) + '" title="' + esc(o.title || "") + '">' +
          '<span class="pat-cc">' + esc(ccOf(o)) + "</span>" +
          '<span class="pat-no">' + esc(reg || (o.app_no || "").trim()) + "</span>" +
          (reg ? i18nSpan("pat-rel-st", "등록", "Registered") : i18nSpan("pat-rel-st", "출원", "Filed")) +
          "</a>";
      }).join("");
    }
    const kr = rec._related.filter(function (o) { return ccOf(o) === "KR"; });
    const fx = rec._related.filter(function (o) { return ccOf(o) !== "KR"; });
    let h = "";
    if (kr.length) h += '<span class="pat-rel-grp">' + (ccOf(rec) === "KR"
      ? i18nSpan("pat-rel-h", "국내 우선권", "Domestic priority")
      : i18nSpan("pat-rel-h", "국내 출원", "Korean application")) + chips(kr) + "</span>";
    if (fx.length) h += '<span class="pat-rel-grp">' + i18nSpan("pat-rel-h", "해외·PCT 출원", "Foreign & PCT filings") + chips(fx) + "</span>";
    return '<div class="pat-rel-row">' + h + "</div>";
  }

  function patentLine(rec) {
    function part(cls, ko, en, no, date) {
      return '<span class="' + cls + '">' + i18nSpan("pat-k", ko, en) +
        '<span class="pat-no">' + esc(no) + "</span>" +
        (date ? ' <span class="pat-d">(' + esc(date.replace(/-/g, ".")) + ")</span>" : "") + "</span>";
    }
    const parts = [];
    if ((rec.reg_no || "").trim()) parts.push(part("pat-reg", "등록", "Registered", rec.reg_no.trim(), (rec.reg_date || "").trim()));
    if ((rec.app_no || "").trim()) parts.push(part("pat-app", "출원", "Filed", rec.app_no.trim(), (rec.app_date || "").trim()));
    const cc = (rec.country || "").trim();
    return '<div class="pat-nums">' + (cc && cc !== "KR" ? '<span class="pat-cc">' + esc(cc) + "</span>" : "") +
      parts.join(" ") + "</div>";
  }

  /* --------------------------- citation builders ------------------------- */
  // Returns the inner HTML for one entry's citation line (already escaped).
  function citation(rec, type) {
    const authors = highlightPI(esc(formatAuthors(rec.author || rec.editor || "")));
    const title = esc(rec.title || "");
    let venue = "";
    let detail = "";

    if (type === "patent") {   // 번호·날짜는 patentLine() 이 아래 줄에 따로 표시
      return (authors ? '<span class="authors">' + authors + "</span>, " : "") +
        '&ldquo;<span class="title">' + title + '</span>.&rdquo;';
    }

    if (type === "journal") {
      venue = esc(rec.journal || "");
      const bits = [];
      if (rec.volume) bits.push("vol. " + esc(rec.volume));
      if (rec.number) bits.push("no. " + esc(rec.number));
      if (rec.pages) bits.push("pp. " + esc(rec.pages));
      detail = bits.join(", ");
    } else if (type === "conference") {
      venue = esc(firstNonEmpty(rec.booktitle, rec.note, rec.organization));
      const bits = [];
      if (rec.volume) bits.push("vol. " + esc(rec.volume));
      if (rec.pages) bits.push("pp. " + esc(rec.pages));
      detail = bits.join(", ");
    }

    let html = "";
    if (authors) html += '<span class="authors">' + authors + "</span>, ";
    html += '&ldquo;<span class="title">' + title + '</span>,&rdquo; ';
    if (venue) html += '<span class="venue">' + venue + "</span>";
    if (detail) html += ", " + detail;
    // append the year only when the venue/number string doesn't already carry it
    // (many conference booktitles end with ", YYYY"; patent numbers embed a year)
    const year = yearOf(rec);
    if (year && year !== "기타" && venue.indexOf(year) === -1) html += ", " + year;
    html += ".";
    return html;
  }

  // A lowercase haystack used by the search filter.
  function haystack(rec) {
    return [
      rec.title, rec.author, rec.editor, rec.journal, rec.booktitle,
      rec.note, rec.organization, rec.number, rec.date, rec.abstract,
    ].join(" ").toLowerCase();
  }

  /* ------------------------------- render -------------------------------- */
  function render(records, type, mount) {
    if (!records.length) {
      mount.innerHTML = '<p class="muted">표시할 항목이 없습니다.</p>';
      return;
    }

    // newest first
    records = records.slice().sort((a, b) => sortKey(b).localeCompare(sortKey(a)));

    // group by year
    const groups = new Map();
    for (const r of records) {
      const y = yearOf(r);
      if (!groups.has(y)) groups.set(y, []);
      groups.get(y).push(r);
    }
    const years = Array.from(groups.keys()).sort((a, b) => {
      if (a === "기타") return 1;
      if (b === "기타") return -1;
      return Number(b) - Number(a);
    });

    let html = "";
    let idx = records.length; // descending running index
    for (const y of years) {
      html += '<section class="year-group"><h2 class="year">' + esc(y) +
              ' <span class="year-count">(' + groups.get(y).length + ')</span></h2><ol class="pub-list">';
      for (const rec of groups.get(y)) {
        // status: forthcoming(게재 예정) · early access(DOI 로 온라인 선공개, 권·호 미배정) · 그 외 = 출판
        const status = (rec.status || "").toLowerCase().replace(/[\s_-]+/g, " ").trim();
        const abs = cleanAbstract(rec.abstract);
        const link = linkOf(rec);
        html += '<li class="pub" value="' + idx + '"' +
          (type === "patent" && rec.pub_id ? ' id="p' + esc(rec.pub_id) + '"' : "") + ">";
        html += '<div class="pub-cite">' + citation(rec, type);
        if (status === "forthcoming") html += ' <span class="badge badge-soon">forthcoming</span>';
        else if (status === "early access") html += ' <span class="badge badge-ea">early access</span>';
        html += "</div>";
        if (type === "patent") html += patentLine(rec) + relatedLine(rec);
        html += '<div class="pub-meta">';
        if (link) html += '<a class="link" href="' + esc(link) + '" target="_blank" rel="noopener">' +
                          (/doi\.org/.test(link) ? "DOI" : /patents\.google\./.test(link) ? "Google Patents" : "Link") + " ↗</a>";
        if (abs) html += '<button type="button" class="abs-toggle" aria-expanded="false">초록 ▾</button>';
        html += "</div>";
        if (abs) html += '<div class="abstract" hidden>' + esc(abs) + "</div>";
        html += "</li>";
        idx--;
      }
      html += "</ol></section>";
    }
    mount.innerHTML = html;
  }

  // expand/collapse abstracts via event delegation
  function wireAbstractToggle(mount) {
    mount.addEventListener("click", function (e) {
      const btn = e.target.closest && e.target.closest(".abs-toggle");
      if (!btn) return;
      const li = btn.closest(".pub");
      const box = li.querySelector(".abstract");
      const open = box.hasAttribute("hidden");
      if (open) { box.removeAttribute("hidden"); btn.textContent = "초록 ▴"; }
      else { box.setAttribute("hidden", ""); btn.textContent = "초록 ▾"; }
      btn.setAttribute("aria-expanded", String(open));
    });
  }

  function errorHtml(err) {
    return (
      '<p class="error">데이터를 불러오지 못했습니다 (' + esc(String(err && err.message)) +
      ").<br>로컬에서 미리 보려면 이 폴더에서 <code>python -m http.server</code> 를 실행한 뒤 " +
      '<code>http://localhost:8000</code> 로 접속하세요. ' +
      "(파일을 브라우저로 직접 여는 <code>file://</code> 방식은 보안정책상 CSV를 읽지 못합니다. " +
      "GitHub Pages에 배포하면 정상 동작합니다.)</p>"
    );
  }

  function loadCsv(path) {
    return fetch(path, { cache: "no-store" })
      .then((res) => { if (!res.ok) throw new Error("HTTP " + res.status + " — " + path); return res.text(); })
      .then((text) => {
        const recs = rowsToObjects(parseCSV(text)).filter((r) => (r.title || "").trim());
        recs.forEach((r) => { r._hay = haystack(r); });
        return recs;
      });
  }

  /* ------------------------- single-source init -------------------------- */
  // config: { csv, type, mount, count, search }
  function init(config) {
    const mount = document.getElementById(config.mount);
    const countEl = config.count ? document.getElementById(config.count) : null;
    const searchEl = config.search ? document.getElementById(config.search) : null;
    let all = [];
    wireAbstractToggle(mount);

    function apply() {
      const q = searchEl ? searchEl.value.trim().toLowerCase() : "";
      const filtered = q ? all.filter((r) => r._hay.indexOf(q) !== -1) : all;
      if (countEl) {
        countEl.textContent = q ? filtered.length + " / " + all.length + "건" : all.length + "건";
      }
      render(filtered, config.type, mount);
    }

    if (searchEl) {
      let t;
      searchEl.addEventListener("input", function () { clearTimeout(t); t = setTimeout(apply, 120); });
    }

    loadCsv(config.csv)
      .then((recs) => { all = recs; apply(); })
      .catch((err) => { mount.innerHTML = errorHtml(err); });
  }

  /* ----------------- tabbed category init (Int'l / Domestic) ------------- */
  // config: {
  //   type, mount, count, search, tabsEl,
  //   sources: [{ key, label, csv }, ...],
  //   default: key,
  //   split: { el, field, options: [{ key, ko, en }, ...] }   // optional second-level
  // }                                                          // filter inside each tab
  function initCategory(config) {
    const mount = document.getElementById(config.mount);
    const countEl = config.count ? document.getElementById(config.count) : null;
    const searchEl = config.search ? document.getElementById(config.search) : null;
    const tabsEl = config.tabsEl ? document.getElementById(config.tabsEl) : null;
    const sources = config.sources;
    const data = {};       // key -> records[]
    let active = null;
    wireAbstractToggle(mount);

    // e.g. patents: 등록 | 출원 inside International / Domestic (kept across tab switches)
    const split = config.split || null;
    const splitEl = split ? document.getElementById(split.el) : null;
    let sub = split ? split.options[0].key : null;
    if (splitEl) {
      splitEl.innerHTML = split.options.map(function (o) {
        return '<button type="button" class="seg-btn" data-sub="' + esc(o.key) + '" aria-pressed="' + (o.key === sub) + '">' +
          i18nSpan("seg-label", o.ko, o.en) + ' <span class="tab-count" data-subcount="' + esc(o.key) + '"></span></button>';
      }).join("");
      splitEl.addEventListener("click", function (e) {
        const b = e.target.closest && e.target.closest(".seg-btn");
        if (!b) return;
        sub = b.getAttribute("data-sub");
        Array.prototype.forEach.call(splitEl.querySelectorAll(".seg-btn"), function (x) {
          x.setAttribute("aria-pressed", String(x === b));
        });
        apply();
      });
    }

    // build the tab bar
    if (tabsEl) {
      tabsEl.innerHTML = sources
        .map((s) => '<button type="button" class="tab" data-key="' + esc(s.key) + '">' +
          esc(s.label) + ' <span class="tab-count" data-count="' + esc(s.key) + '"></span></button>')
        .join("");
      tabsEl.addEventListener("click", function (e) {
        const b = e.target.closest && e.target.closest(".tab");
        if (b) setActive(b.getAttribute("data-key"), true);
      });
    }

    function apply() {
      const q = searchEl ? searchEl.value.trim().toLowerCase() : "";
      let all = data[active] || [];
      let filtered = q ? all.filter((r) => r._hay.indexOf(q) !== -1) : all;
      if (split) {
        // 버튼 옆 숫자 = 지금 검색어에 맞는 건수 → 다른 쪽에 결과가 있는지 바로 보임
        split.options.forEach(function (o) {
          const c = splitEl && splitEl.querySelector('[data-subcount="' + o.key + '"]');
          if (c) c.textContent = "(" + filtered.filter((r) => r[split.field] === o.key).length + ")";
        });
        all = all.filter((r) => r[split.field] === sub);
        filtered = filtered.filter((r) => r[split.field] === sub);
      }
      if (countEl) {
        countEl.textContent = q ? filtered.length + " / " + all.length + "건" : all.length + "건";
      }
      render(filtered, config.type, mount);
    }

    function setActive(key, updateHash) {
      if (!data[key]) return;
      active = key;
      if (tabsEl) {
        Array.prototype.forEach.call(tabsEl.querySelectorAll(".tab"), function (b) {
          b.classList.toggle("active", b.getAttribute("data-key") === key);
        });
      }
      if (updateHash && global.history && history.replaceState) {
        history.replaceState(null, "", "#" + key);
      }
      apply();
    }

    if (searchEl) {
      let t;
      searchEl.addEventListener("input", function () { clearTimeout(t); t = setTimeout(apply, 120); });
    }

    function setSub(key) {
      if (!split || !key || key === sub) return;
      sub = key;
      if (splitEl) Array.prototype.forEach.call(splitEl.querySelectorAll(".seg-btn"), function (x) {
        x.setAttribute("aria-pressed", String(x.getAttribute("data-sub") === key));
      });
    }
    // #p<pub_id> (특허 '관련 출원' 링크): 그 항목이 있는 탭·등록/출원으로 바꾸고 스크롤 + 잠깐 강조
    function goTo(id) {
      let rec = null;
      Object.keys(data).some(function (k) {
        rec = data[k].filter(function (r) { return r.pub_id === id; })[0] || null;
        return !!rec;
      });
      if (!rec) return false;
      if (searchEl) searchEl.value = "";
      if (split) setSub(rec[split.field]);
      setActive(rec._src, false);
      const el = document.getElementById("p" + id);
      if (el) {
        // 긴 목록에서 부드러운 스크롤은 렌더·레이아웃 변화에 끊길 수 있어 바로 이동 + 강조로 눈길을 끎
        el.scrollIntoView({ block: "center", behavior: "auto" });
        el.classList.remove("pat-flash"); void el.offsetWidth; el.classList.add("pat-flash");
      }
      return true;
    }
    // 해시: #international/#domestic(메뉴 링크) → 탭 전환, #p123 → 그 특허로 이동
    function onHash() {
      const k = location.hash.replace(/^#/, "");
      if (data[k]) { if (k !== active) setActive(k, false); return true; }
      const m = /^p(\d+)$/.exec(k);
      return m && config.type === "patent" ? goTo(m[1]) : false;
    }

    Promise.all(sources.map(function (s) {
      return loadCsv(s.csv).then(function (recs) {
        if (config.type === "patent") recs.forEach(prepPatent);
        data[s.key] = recs;
        if (tabsEl) {
          const c = tabsEl.querySelector('[data-count="' + s.key + '"]');
          if (c) c.textContent = "(" + recs.length + ")";
        }
      });
    }))
      .then(function () {
        if (config.type === "patent") linkFamilies(data);
        if (!onHash()) setActive(config.default || sources[0].key, false);
        global.addEventListener("hashchange", onHash);
      })
      .catch(function (err) { mount.innerHTML = errorHtml(err); });
  }

  // expose
  global.Pubs = {
    init: init,
    initCategory: initCategory,
    _parseCSV: parseCSV,
    _rowsToObjects: rowsToObjects,
  };
})(window);
