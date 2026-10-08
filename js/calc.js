/* 프로그램 실적 계산 모듈 (UMD, 외부 의존성 없음). 기준: docs/CRITERIA.md */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ProgramCalc = api;
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  var COLUMNS = ['연도', '사업ID', '사업명', '분야', '지역', '참여자수', '수료자수'];
  var FIELD_ORDER = ['교육', '일자리', '지역사회'];
  var REASONS = {
    MISSING: '숫자 누락', NOT_INT: '정수 아님', NEGATIVE: '음수',
    OVER: '수료자 초과', DUP: '중복', ZERO: '참여자 0명'
  };
  var INT_RE = /^-?\d+$/;

  // 큰따옴표 규칙 CSV 파서. 빈 줄 무시, 셀 trim, BOM 제거.
  function parseCsv(text) {
    text = String(text == null ? '' : text);
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    var rows = [], row = [], cell = '', inQ = false, i = 0, n = text.length, c;
    function endCell() { row.push(cell.trim()); cell = ''; }
    function endRow() {
      endCell();
      var blank = row.length === 1 && row[0] === '';
      if (!blank) rows.push(row);
      row = [];
    }
    while (i < n) {
      c = text[i];
      if (inQ) {
        if (c === '"') {
          if (text[i + 1] === '"') { cell += '"'; i += 2; continue; }
          inQ = false; i++; continue;
        }
        cell += c; i++; continue;
      }
      if (c === '"') { inQ = true; i++; }
      else if (c === ',') { endCell(); i++; }
      else if (c === '\r') { endRow(); i += (text[i + 1] === '\n') ? 2 : 1; }
      else if (c === '\n') { endRow(); i++; }
      else { cell += c; i++; }
    }
    if (cell !== '' || row.length > 0) endRow();
    return { header: rows.length ? rows[0] : [], records: rows.slice(1) };
  }

  function loadFiles(files) {
    var valid = [], excluded = [], errors = [], seen = {};
    (files || []).forEach(function (file) {
      var parsed = parseCsv(file.text);
      var idx = COLUMNS.map(function (c) { return parsed.header.indexOf(c); });
      if (idx.some(function (k) { return k < 0; })) {
        errors.push({ file: file.name, message: '열 이름이 올바르지 않습니다' });
        return;
      }
      parsed.records.forEach(function (rec, k) {
        var line = k + 1, v = {};
        COLUMNS.forEach(function (c, j) { v[c] = rec[idx[j]] === undefined ? '' : rec[idx[j]]; });
        var reason = null, p, q;
        if (v['연도'] === '' || v['사업ID'] === '' || v['참여자수'] === '' || v['수료자수'] === '') reason = REASONS.MISSING;
        else if (!INT_RE.test(v['연도']) || !INT_RE.test(v['참여자수']) || !INT_RE.test(v['수료자수'])) reason = REASONS.NOT_INT;
        else {
          p = Number(v['참여자수']); q = Number(v['수료자수']);
          if (p < 0 || q < 0) reason = REASONS.NEGATIVE;
          else if (q > p) reason = REASONS.OVER;
          else if (seen[v['연도'] + '\u0000' + v['사업ID']]) reason = REASONS.DUP;
        }
        if (reason) { excluded.push({ file: file.name, line: line, values: v, reason: reason }); return; }
        seen[v['연도'] + '\u0000' + v['사업ID']] = true;
        valid.push({
          file: file.name, line: line, year: Number(v['연도']), id: v['사업ID'], name: v['사업명'],
          field: v['분야'], region: v['지역'], participants: p, completers: q,
          rate: p === 0 ? null : q / p * 100, note: p === 0 ? REASONS.ZERO : ''
        });
      });
    });
    return { valid: valid, excluded: excluded, errors: errors };
  }

  function availableYears(valid) {
    var s = {};
    valid.forEach(function (r) { s[r.year] = true; });
    return Object.keys(s).map(Number).sort(function (a, b) { return a - b; });
  }

  function filterByYears(valid, years) {
    return valid.filter(function (r) { return years.indexOf(r.year) >= 0; });
  }

  function judge(row, threshold) {
    if (row.participants === 0) return '계산 불가';
    return row.completers * 100 < threshold * row.participants ? '주의' : '정상';
  }

  function sum(rows, key) { return rows.reduce(function (a, r) { return a + r[key]; }, 0); }
  function ratio(c, p) { return p === 0 ? null : c / p * 100; }

  function summarize(rows, threshold) {
    var p = sum(rows, 'participants'), c = sum(rows, 'completers'), ids = {}, ys = {}, caution = 0;
    rows.forEach(function (r) {
      ids[r.id] = true; ys[r.year] = true;
      if (judge(r, threshold) === '주의') caution++;
    });
    return {
      participants: p, completers: c, rate: ratio(c, p),
      programCount: Object.keys(ids).length, yearCount: Object.keys(ys).length, cautionCount: caution
    };
  }

  function byField(rows) {
    var map = {}, order = [], total = sum(rows, 'participants');
    FIELD_ORDER.forEach(function (f) { map[f] = { field: f, participants: 0, completers: 0 }; order.push(f); });
    rows.forEach(function (r) {
      if (!map[r.field]) { map[r.field] = { field: r.field, participants: 0, completers: 0 }; order.push(r.field); }
      map[r.field].participants += r.participants;
      map[r.field].completers += r.completers;
    });
    return order.map(function (f) {
      var o = map[f];
      o.share = total === 0 ? null : o.participants / total * 100;
      return o;
    });
  }

  function byProgram(rows) {
    var map = {};
    rows.forEach(function (r) {
      var o = map[r.id] || (map[r.id] = { id: r.id, name: r.name, field: r.field, participants: 0, completers: 0 });
      o.participants += r.participants; o.completers += r.completers;
    });
    return Object.keys(map).sort(function (a, b) { return a < b ? -1 : a > b ? 1 : 0; }).map(function (k) {
      var o = map[k]; o.rate = ratio(o.completers, o.participants); return o;
    });
  }

  function byYear(rows) {
    var map = {};
    rows.forEach(function (r) {
      var o = map[r.year] || (map[r.year] = { year: r.year, participants: 0, completers: 0 });
      o.participants += r.participants; o.completers += r.completers;
    });
    return Object.keys(map).map(Number).sort(function (a, b) { return a - b; }).map(function (k) {
      var o = map[k]; o.rate = ratio(o.completers, o.participants); return o;
    });
  }

  function csvCell(v) {
    v = String(v);
    return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }

  function toCsv(rows) {
    var lines = [COLUMNS.map(csvCell).join(',')];
    rows.forEach(function (r) {
      lines.push([r.year, r.id, r.name, r.field, r.region, r.participants, r.completers].map(csvCell).join(','));
    });
    return '﻿' + lines.join('\r\n') + '\r\n';
  }

  // 반올림(half up). 부동소수 잡음은 유효숫자 12자리로 정리한 뒤 처리.
  function formatPct(value, digits) {
    if (value === null || value === undefined || isNaN(value)) return '계산 불가';
    digits = digits || 0;
    var f = Math.pow(10, digits);
    var scaled = Number((value * f).toPrecision(12));
    return (Math.floor(scaled + 0.5) / f).toFixed(digits) + '%';
  }

  function formatCount(n) {
    return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  return {
    COLUMNS: COLUMNS, FIELD_ORDER: FIELD_ORDER, REASONS: REASONS,
    parseCsv: parseCsv, loadFiles: loadFiles, availableYears: availableYears,
    filterByYears: filterByYears, judge: judge, summarize: summarize,
    byField: byField, byProgram: byProgram, byYear: byYear,
    toCsv: toCsv, formatPct: formatPct, formatCount: formatCount
  };
});
