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

  /* --------------------------- citation builders ------------------------- */
  // Returns the inner HTML for one entry's citation line (already escaped).
  function citation(rec, type) {
    const authors = highlightPI(esc(rec.author || rec.editor || ""));
    const title = esc(rec.title || "");
    let venue = "";
    let detail = "";

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
    } else if (type === "patent") {
      // For patents: 출원(Filed) vs 등록(Registered/Granted), plus the number.
      const note = rec.note || "";
      const kind = note.indexOf("등록") !== -1 ? "등록"
                 : note.indexOf("출원") !== -1 ? "출원" : "";
      const num = esc(firstNonEmpty(rec.number, rec.isbn));
      venue = (kind ? kind + " " : "") + num;
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
        const forthcoming = (rec.status || "").toLowerCase() === "forthcoming";
        const abs = cleanAbstract(rec.abstract);
        const link = linkOf(rec);
        html += '<li class="pub" value="' + idx + '">';
        html += '<div class="pub-cite">' + citation(rec, type);
        if (forthcoming) html += ' <span class="badge badge-soon">to appear</span>';
        html += "</div>";
        html += '<div class="pub-meta">';
        if (link) html += '<a class="link" href="' + esc(link) + '" target="_blank" rel="noopener">' +
                          (/doi\.org/.test(link) ? "DOI" : "Link") + " ↗</a>";
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
  //   default: key
  // }
  function initCategory(config) {
    const mount = document.getElementById(config.mount);
    const countEl = config.count ? document.getElementById(config.count) : null;
    const searchEl = config.search ? document.getElementById(config.search) : null;
    const tabsEl = config.tabsEl ? document.getElementById(config.tabsEl) : null;
    const sources = config.sources;
    const data = {};       // key -> records[]
    let active = null;
    wireAbstractToggle(mount);

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
      const all = data[active] || [];
      const filtered = q ? all.filter((r) => r._hay.indexOf(q) !== -1) : all;
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
    // nav dropdown links like journal.html#domestic switch the tab
    global.addEventListener("hashchange", function () {
      const k = location.hash.replace(/^#/, "");
      if (data[k] && k !== active) setActive(k, false);
    });

    Promise.all(sources.map(function (s) {
      return loadCsv(s.csv).then(function (recs) {
        data[s.key] = recs;
        if (tabsEl) {
          const c = tabsEl.querySelector('[data-count="' + s.key + '"]');
          if (c) c.textContent = "(" + recs.length + ")";
        }
      });
    }))
      .then(function () {
        const hashKey = location.hash.replace(/^#/, "");
        const start = data[hashKey] ? hashKey : (config.default || sources[0].key);
        setActive(start, false);
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
