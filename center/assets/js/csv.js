/* ==========================================================================
   I²SAC — CSV 읽기 (LIT 사이트 pubs.js 의 파서만 옮겨 온 것)
   i2sac.js 가 window.Pubs._parseCSV / _rowsToObjects 이름으로 사용합니다.
   ========================================================================== */
(function (global) {
  "use strict";

  // RFC-4180 방식: 맨 앞 BOM, 따옴표 안의 쉼표·줄바꿈·"" 이스케이프, CRLF/LF 모두 처리
  function parseCSV(text) {
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // strip BOM
    var rows = [], row = [], field = "", inQuotes = false;
    for (var i = 0, n = text.length; i < n; i++) {
      var c = text[i];
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
        /* CRLF 는 아래 \n 에서 처리 */
      } else if (c === "\n") {
        row.push(field); rows.push(row); row = []; field = "";
      } else {
        field += c;
      }
    }
    if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
    return rows;
  }

  // 첫 줄을 머리글로 삼아 객체 배열로 (빈 줄은 건너뜀)
  function rowsToObjects(rows) {
    if (!rows.length) return [];
    var headers = rows[0].map(function (h) { return h.trim(); });
    var out = [];
    for (var r = 1; r < rows.length; r++) {
      var cells = rows[r];
      if (cells.length === 1 && cells[0].trim() === "") continue;
      var obj = {};
      for (var c = 0; c < headers.length; c++) obj[headers[c]] = (cells[c] != null ? cells[c] : "").trim();
      out.push(obj);
    }
    return out;
  }

  global.Pubs = { _parseCSV: parseCSV, _rowsToObjects: rowsToObjects };
})(window);
