(function () {
  'use strict';

  var PC = window.ProgramCalc;
  var $ = function (id) { return document.getElementById(id); };

  if (!PC) {
    var eb = $('errorBox');
    eb.hidden = false;
    eb.textContent = '계산 모듈(js/calc.js)을 불러오지 못했습니다. 파일 위치를 확인하세요.';
    return;
  }

  var FIELD_COLORS = { '교육': '#eb6225', '일자리': '#2f6db5', '지역사회': '#3a9a5b' };
  var EXTRA_PALETTE = ['#7c3aed', '#0e7490', '#b45309', '#be185d', '#4d7c0f', '#6b7280'];
  var COLOR_PART = '#4b5563';
  var COLOR_COMP = '#eb6225';

  var state = {
    mode: 'sample',      // sample | error | upload
    uploadName: '',
    result: { valid: [], excluded: [], errors: [] },
    years: [],           // 자료의 모든 연도
    selected: [],        // 선택된 연도
    threshold: 70
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function fieldColor(name) {
    if (FIELD_COLORS[name]) return FIELD_COLORS[name];
    var h = 0;
    for (var i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return EXTRA_PALETTE[h % EXTRA_PALETTE.length];
  }

  function trunc(s, n) {
    s = String(s);
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
  }

  function niceMax(v) {
    if (v <= 0) return 10;
    var p = Math.pow(10, Math.floor(Math.log(v) / Math.LN10));
    var f = v / p;
    var m = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
    return m * p;
  }

  /* ---------- 자료 로드 ---------- */
  function loadCurrent(files) {
    state.result = PC.loadFiles(files);
    state.years = PC.availableYears(state.result.valid);
    state.selected = state.years.slice();
    renderYearBoxes();
    renderAll();
  }

  function useSource() {
    if (state.mode === 'sample') {
      loadCurrent(window.SAMPLE_FILES || []);
    } else if (state.mode === 'error') {
      loadCurrent(window.ERROR_SAMPLE_FILES || []);
    }
  }

  function readFile(f) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve({ name: f.name, text: String(r.result) }); };
      r.onerror = function () { reject(new Error(f.name + ' 파일을 읽지 못했습니다.')); };
      r.readAsText(f, 'UTF-8');
    });
  }

  function sourceLabel() {
    if (state.mode === 'sample') {
      return '기본 샘플 (' + (window.SAMPLE_FILES || []).map(function (f) { return f.name; }).join(', ') + ')';
    }
    if (state.mode === 'error') return '오류 사례 샘플 (errors.csv)';
    return state.uploadName ? '직접 선택한 파일 (' + state.uploadName + ')' : '선택한 파일 없음';
  }

  /* ---------- 필터 ---------- */
  function renderYearBoxes() {
    var box = $('yearBoxes');
    if (!state.years.length) {
      box.innerHTML = '<span class="hint">선택할 연도가 없습니다.</span>';
      return;
    }
    box.innerHTML = state.years.map(function (y) {
      var on = state.selected.indexOf(y) >= 0;
      return '<label><input type="checkbox" class="yr" value="' + y + '"' + (on ? ' checked' : '') + '> ' + y + '년</label>';
    }).join('');
  }

  function readThreshold() {
    var raw = $('threshold').value;
    var n = parseFloat(raw);
    if (raw === '' || isNaN(n)) return { value: state.threshold, msg: '주의 기준값은 0~100 사이 숫자로 입력하세요. 이전 값(' + state.threshold + ')을 사용합니다.' };
    if (n < 0 || n > 100) {
      var c = n < 0 ? 0 : 100;
      return { value: c, msg: '주의 기준값은 0~100 사이여야 하므로 ' + c + '으로 적용했습니다.' };
    }
    return { value: n, msg: '' };
  }

  function filtered() {
    return PC.filterByYears(state.result.valid, state.selected);
  }

  /* ---------- 렌더링 ---------- */
  function renderAll() {
    $('sourceName').textContent = sourceLabel();
    renderErrors();

    var th = readThreshold();
    state.threshold = th.value;
    var msgs = [];
    if (th.msg) msgs.push(th.msg);
    if (state.years.length && !state.selected.length) msgs.push('연도를 하나 이상 선택하세요.');
    var fm = $('filterMsg');
    fm.hidden = !msgs.length;
    fm.innerHTML = msgs.map(esc).join('<br>');

    var rows = filtered();
    renderSummary(rows);
    renderPie(rows);
    renderBar(rows);
    renderLine(rows);
    renderDetail(rows);
    renderExcluded();
    $('csvBtn').disabled = !rows.length;
  }

  function renderErrors() {
    var box = $('errorBox');
    var errs = state.result.errors || [];
    if (!errs.length) { box.hidden = true; box.innerHTML = ''; return; }
    box.hidden = false;
    box.innerHTML = '<ul>' + errs.map(function (e) {
      return '<li><strong>' + esc(e.file) + '</strong>: ' + esc(e.message) + '</li>';
    }).join('') + '</ul>';
  }

  function sumCard(label, valueHtml, sub, cls) {
    return '<div class="sum-card ' + (cls || '') + '"><div class="lbl">' + esc(label) + '</div>' +
      valueHtml + '<div class="sub">' + sub + '</div></div>';
  }

  function renderSummary(rows) {
    var s = PC.summarize(rows, state.threshold);
    var noYear = state.years.length && !state.selected.length;
    var html = '';
    html += sumCard('참여자 합계', '<div class="val">' + PC.formatCount(s.participants) + '<small>명</small></div>', '선택한 연도의 참여자수 합');
    html += sumCard('수료자 합계', '<div class="val">' + PC.formatCount(s.completers) + '<small>명</small></div>', '선택한 연도의 수료자수 합');
    var rateVal, rateSub;
    if (s.rate == null) {
      rateVal = '<div class="val na">계산 불가</div>';
      rateSub = noYear ? '이유: 연도를 하나 이상 선택하세요.' : '이유: 참여자 합계가 0명입니다.';
    } else {
      rateVal = '<div class="val">' + PC.formatPct(s.rate, 0) + '</div>';
      rateSub = '계산식: 합산 수료자 ÷ 합산 참여자 (' + PC.formatCount(s.completers) + ' ÷ ' + PC.formatCount(s.participants) + ')';
    }
    html += sumCard('전체 수료율', rateVal, rateSub, 'accent');
    html += sumCard('사업 수', '<div class="val">' + s.programCount + '<small>개</small></div>', '고유 사업ID 개수');
    html += sumCard('선택 연도 수', '<div class="val">' + s.yearCount + '<small>개</small></div>', '유효 행이 있는 연도');
    html += sumCard('주의 항목 수', '<div class="val">' + s.cautionCount + '<small>건</small></div>', '수료율 ' + esc(state.threshold) + '% 미만 (계산 불가 제외)', 'accent');
    $('summary').innerHTML = html;
  }

  function emptyReason(rows, what) {
    if (state.years.length && !state.selected.length) return '표시할 자료 없음 - 연도를 하나 이상 선택하세요.';
    if (rows.length) return '표시할 자료 없음 - 참여자 합계가 0명이라 ' + what + '을(를) 계산할 수 없습니다.';
    return '표시할 자료 없음 - 선택한 연도에 유효한 행이 없습니다.';
  }

  function emptyBox(msg) { return '<div class="chart-empty">' + esc(msg) + '</div>'; }

  /* 파이 */
  function renderPie(rows) {
    var list = PC.byField(rows);
    var total = list.reduce(function (a, f) { return a + f.participants; }, 0);
    var head = '<h3 class="chart-card-title">분야별 참여자 비중</h3><p class="chart-unit">단위: 명, %</p>';
    if (!total) { $('pieCard').innerHTML = head + emptyBox(emptyReason(rows, '비중')); return; }

    var cx = 130, cy = 130, r = 88, ang = -Math.PI / 2, svg = '';
    var shown = list.filter(function (f) { return f.participants > 0; });
    shown.forEach(function (f) {
      var frac = f.participants / total;
      var col = fieldColor(f.field);
      var pct = PC.formatPct(f.share, 1);
      var a2 = ang + frac * 2 * Math.PI;
      var mid = (ang + a2) / 2;
      if (shown.length === 1) {
        svg += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="' + col + '"><title>' + esc(f.field) + ' ' + pct + '</title></circle>';
      } else {
        var x1 = cx + r * Math.cos(ang), y1 = cy + r * Math.sin(ang);
        var x2 = cx + r * Math.cos(a2), y2 = cy + r * Math.sin(a2);
        svg += '<path d="M' + cx + ' ' + cy + ' L' + x1.toFixed(2) + ' ' + y1.toFixed(2) + ' A' + r + ' ' + r + ' 0 ' +
          (frac > 0.5 ? 1 : 0) + ' 1 ' + x2.toFixed(2) + ' ' + y2.toFixed(2) + ' Z" fill="' + col + '" stroke="#fff" stroke-width="2"><title>' +
          esc(f.field) + ' ' + pct + '</title></path>';
      }
      var inside = frac >= 0.08 || shown.length === 1;
      var lr = shown.length === 1 ? 0 : (inside ? r * 0.62 : r + 22);
      var lx = cx + lr * Math.cos(mid), ly = cy + lr * Math.sin(mid);
      svg += '<text x="' + lx.toFixed(1) + '" y="' + (ly + 4).toFixed(1) + '" text-anchor="middle" font-size="13" font-weight="700" fill="' +
        (inside ? '#fff' : '#1f2937') + '">' + pct + '</text>';
      ang = a2;
    });

    var legend = list.map(function (f) {
      var pct = PC.formatPct(f.share, 1);
      return '<li><span class="sw" style="background:' + fieldColor(f.field) + '"></span><div><div class="nm">' + esc(f.field) +
        '</div><div class="dt">' + pct + ' · ' + PC.formatCount(f.participants) + '명</div></div></li>';
    }).join('');

    var top = list.slice().sort(function (a, b) { return b.participants - a.participants; })[0];
    var guide = '조각이 클수록 해당 분야 참여자가 많습니다. 현재 가장 큰 분야는 ' + top.field + '(' +
      PC.formatPct(top.share, 1) + ', ' + PC.formatCount(top.participants) + '명)입니다.';

    $('pieCard').innerHTML = head +
      '<div class="pie-wrap"><div class="pie-svg"><svg viewBox="0 0 260 260" role="img" aria-label="분야별 참여자 비중 파이 차트">' + svg + '</svg></div>' +
      '<ul class="legend">' + legend + '</ul></div><p class="chart-guide">' + esc(guide) + '</p>';
  }

  /* 막대 */
  function renderBar(rows) {
    var list = PC.byProgram(rows);
    var head = '<h3 class="chart-card-title">사업별 참여자·수료자</h3><p class="chart-unit">단위: 명 (선택한 연도 합산)</p>';
    if (!list.length) { $('barCard').innerHTML = head + emptyBox(emptyReason(rows, '수료율')); return; }

    var n = list.length, gw = 100, bw = 30;
    var L = 56, R = 16, T = 28, B = 74, H = 340;
    var W = Math.max(520, n * gw + L + R);
    var ph = H - T - B;
    var max = niceMax(Math.max.apply(null, list.map(function (p) { return Math.max(p.participants, p.completers || 0); })));
    var svg = '';
    for (var i = 0; i <= 5; i++) {
      var v = max * i / 5, y = T + ph - ph * i / 5;
      svg += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y + '" y2="' + y + '" stroke="#e5e7eb"/>' +
        '<text x="' + (L - 8) + '" y="' + (y + 4) + '" text-anchor="end" font-size="11" fill="#4b5563">' + PC.formatCount(Math.round(v)) + '</text>';
    }
    svg += '<text x="12" y="' + (T + ph / 2) + '" transform="rotate(-90 12 ' + (T + ph / 2) + ')" text-anchor="middle" font-size="12" fill="#4b5563">인원(명)</text>';
    var gx0 = L + ((W - L - R) - n * gw) / 2;
    list.forEach(function (p, k) {
      var gx = gx0 + k * gw + (gw - (bw * 2 + 4)) / 2;
      [[p.participants, COLOR_PART, '참여자'], [p.completers, COLOR_COMP, '수료자']].forEach(function (b, j) {
        var h = ph * b[0] / max, x = gx + j * (bw + 4), y = T + ph - h;
        svg += '<rect x="' + x + '" y="' + y.toFixed(1) + '" width="' + bw + '" height="' + h.toFixed(1) + '" fill="' + b[1] + '"><title>' +
          esc(p.id + ' ' + p.name + ' ' + b[2] + ' ' + PC.formatCount(b[0]) + '명') + '</title></rect>' +
          '<text x="' + (x + bw / 2) + '" y="' + (y - 5).toFixed(1) + '" text-anchor="middle" font-size="11" font-weight="700" fill="#1f2937">' + PC.formatCount(b[0]) + '</text>';
      });
      var cxm = gx0 + k * gw + gw / 2;
      svg += '<text x="' + cxm + '" y="' + (T + ph + 18) + '" text-anchor="middle" font-size="12" font-weight="700" fill="#1f2937">' + esc(p.id) + '</text>' +
        '<text x="' + cxm + '" y="' + (T + ph + 34) + '" text-anchor="middle" font-size="11" fill="#374151">' + esc(trunc(p.name, 7)) + '<title>' + esc(p.name) + '</title></text>';
    });
    svg += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + (T + ph) + '" y2="' + (T + ph) + '" stroke="#9ca3af"/>';

    var best = list.slice().sort(function (a, b) { return b.participants - a.participants; })[0];
    var guide = '사업마다 회색 막대(참여자)와 주황 막대(수료자)를 비교합니다. 두 막대 높이 차이가 작을수록 수료가 많이 이뤄진 사업입니다. 참여자가 가장 많은 사업은 ' +
      best.id + ' ' + best.name + '(' + PC.formatCount(best.participants) + '명)입니다.';
    $('barCard').innerHTML = head +
      '<ul class="legend-inline"><li><span class="sw" style="background:' + COLOR_PART + '"></span>참여자(명)</li><li><span class="sw" style="background:' + COLOR_COMP + '"></span>수료자(명)</li></ul>' +
      '<div class="chart-scroll"><svg viewBox="0 0 ' + W + ' ' + H + '" style="min-width:' + Math.min(W, 520) + 'px" role="img" aria-label="사업별 참여자와 수료자 묶음 막대 차트">' + svg + '</svg></div>' +
      '<p class="chart-guide">' + esc(guide) + '</p>';
  }

  /* 꺾은선 */
  function renderLine(rows) {
    var list = PC.byYear(rows);
    var head = '<h3 class="chart-card-title">연도별 합산 수료율</h3><p class="chart-unit">단위: % (합산 수료자 ÷ 합산 참여자)</p>';
    if (!list.length) { $('lineCard').innerHTML = head + emptyBox(emptyReason(rows, '수료율')); return; }

    var W = 760, H = 340, L = 56, R = 28, T = 36, B = 52;
    var pw = W - L - R, ph = H - T - B;
    var n = list.length;
    function X(i) { return n === 1 ? L + pw / 2 : L + pw * (0.08 + 0.84 * i / (n - 1)); }
    function Y(v) { return T + ph - ph * v / 100; }
    var svg = '';
    for (var i = 0; i <= 5; i++) {
      var v = i * 20, y = Y(v);
      svg += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y + '" y2="' + y + '" stroke="#e5e7eb"/>' +
        '<text x="' + (L - 8) + '" y="' + (y + 4) + '" text-anchor="end" font-size="11" fill="#4b5563">' + v + '%</text>';
    }
    svg += '<text x="12" y="' + (T + ph / 2) + '" transform="rotate(-90 12 ' + (T + ph / 2) + ')" text-anchor="middle" font-size="12" fill="#4b5563">수료율(%)</text>';
    var ty = Y(Math.max(0, Math.min(100, state.threshold)));
    svg += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + ty + '" y2="' + ty + '" stroke="#b91c1c" stroke-width="2" stroke-dasharray="6 5"/>';

    var seg = [], cur = [];
    list.forEach(function (p, k) {
      if (p.rate == null) { if (cur.length) seg.push(cur); cur = []; }
      else cur.push([X(k), Y(p.rate)]);
    });
    if (cur.length) seg.push(cur);
    seg.forEach(function (s) {
      if (s.length > 1) svg += '<polyline fill="none" stroke="#eb6225" stroke-width="3" points="' + s.map(function (q) { return q[0].toFixed(1) + ',' + q[1].toFixed(1); }).join(' ') + '"/>';
    });
    list.forEach(function (p, k) {
      var x = X(k);
      if (p.rate == null) {
        svg += '<text x="' + x + '" y="' + (T + ph / 2) + '" text-anchor="middle" font-size="12" fill="#92400e">계산 불가</text>';
      } else {
        var y = Y(p.rate);
        svg += '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="5" fill="#eb6225" stroke="#fff" stroke-width="2"><title>' + p.year + ' ' + PC.formatPct(p.rate, 1) + '</title></circle>' +
          '<text x="' + x.toFixed(1) + '" y="' + (y - 12).toFixed(1) + '" text-anchor="middle" font-size="12" font-weight="700" fill="#1f2937">' + PC.formatPct(p.rate, 1) + '</text>';
      }
      svg += '<text x="' + x + '" y="' + (T + ph + 24) + '" text-anchor="middle" font-size="12" fill="#1f2937">' + p.year + '년</text>';
    });
    svg += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + (T + ph) + '" y2="' + (T + ph) + '" stroke="#9ca3af"/>';

    var valid = list.filter(function (p) { return p.rate != null; });
    var guide = '선이 위로 올라가면 수료율이 높아진 것이고, 빨간 점선(기준값 ' + state.threshold + '%)보다 아래면 주의 수준입니다.';
    if (valid.length > 1) {
      var a = valid[0], b = valid[valid.length - 1];
      guide += ' ' + a.year + '년 ' + PC.formatPct(a.rate, 1) + '에서 ' + b.year + '년 ' + PC.formatPct(b.rate, 1) + '로 변했습니다.';
    }
    if (valid.length < list.length) guide += ' 참여자가 0명인 연도는 계산 불가여서 점을 비우고 선을 잇지 않았습니다.';
    $('lineCard').innerHTML = head +
      '<ul class="legend-inline"><li><span class="sw" style="background:#eb6225"></span>연도별 수료율(%)</li><li><span class="dash"></span>주의 기준값 ' + esc(state.threshold) + '%</li></ul>' +
      '<div class="chart-scroll"><svg viewBox="0 0 ' + W + ' ' + H + '" style="min-width:480px" role="img" aria-label="연도별 합산 수료율 꺾은선 차트">' + svg + '</svg></div>' +
      '<p class="chart-guide">' + esc(guide) + '</p>';
  }

  /* 상세 표 */
  function renderDetail(rows) {
    var box = $('detailTable');
    if (!rows.length) {
      box.innerHTML = '<p class="empty">' + (state.years.length && !state.selected.length ? '연도를 하나 이상 선택하세요.' : '표시할 유효 행이 없습니다.') + '</p>';
      return;
    }
    var s = PC.summarize(rows, state.threshold);
    var body = rows.map(function (r) {
      var j = PC.judge(r, state.threshold);
      var badge = j === '주의' ? '<span class="badge badge-caution">주의</span>' :
        j === '정상' ? '<span class="badge badge-ok">정상</span>' : '<span class="badge badge-na">계산 불가</span>';
      var reason = r.note ? '<span class="reason">' + esc(r.note) + '</span>' : '';
      return '<tr' + (j === '주의' ? ' class="caution"' : '') + '><td>' + esc(r.year) + '</td><td>' + esc(r.id) + '</td><td>' + esc(r.name) +
        '</td><td>' + esc(r.field) + '</td><td>' + esc(r.region) + '</td><td class="num">' + PC.formatCount(r.participants) +
        '</td><td class="num">' + PC.formatCount(r.completers) + '</td><td class="num">' + PC.formatPct(r.rate, 1) + '</td><td>' + badge + reason + '</td></tr>';
    }).join('');
    box.innerHTML = '<table><thead><tr><th>연도</th><th>사업ID</th><th>사업명</th><th>분야</th><th>지역</th><th class="num">참여자수</th><th class="num">수료자수</th><th class="num">수료율</th><th>판정</th></tr></thead><tbody>' +
      body + '</tbody><tfoot><tr><td colspan="5">합계 (합산 수료율 = 합산 수료자 ÷ 합산 참여자)</td><td class="num">' + PC.formatCount(s.participants) +
      '</td><td class="num">' + PC.formatCount(s.completers) + '</td><td class="num">' + PC.formatPct(s.rate, 1) + '</td><td></td></tr></tfoot></table>';
  }

  function renderExcluded() {
    var ex = state.result.excluded || [];
    var box = $('excludedTable');
    if (!ex.length) { box.innerHTML = '<p class="empty">제외된 행 없음</p>'; return; }
    box.innerHTML = '<table><thead><tr><th>파일</th><th class="num">줄</th><th>원본 값</th><th>제외 사유</th></tr></thead><tbody>' +
      ex.map(function (e) {
        var vals = PC.COLUMNS.map(function (c) {
          var v = e.values ? e.values[c] : '';
          return c + ': ' + (v === '' || v == null ? '(빈 값)' : v);
        }).join(' / ');
        return '<tr><td>' + esc(e.file) + '</td><td class="num">' + esc(e.line) + '</td><td>' + esc(vals) + '</td><td><span class="badge badge-caution">' + esc(e.reason) + '</span></td></tr>';
      }).join('') + '</tbody></table>';
  }

  /* CSV */
  function csvName() {
    var ys = state.selected.slice().sort(function (a, b) { return a - b; });
    var tag;
    if (!ys.length) tag = 'none';
    else if (ys.length === 1) tag = String(ys[0]);
    else if (ys[ys.length - 1] - ys[0] === ys.length - 1) tag = ys[0] + '-' + ys[ys.length - 1];
    else tag = ys.join('_');
    return 'programs_filtered_' + tag + '.csv';
  }

  function downloadCsv() {
    var rows = filtered();
    if (!rows.length) return;
    var blob = new Blob([PC.toCsv(rows)], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = csvName();
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  /* ---------- 이벤트 ---------- */
  document.querySelectorAll('input[name=source]').forEach(function (el) {
    el.addEventListener('change', function () {
      state.mode = el.value;
      if (state.mode === 'upload') {
        state.result = { valid: [], excluded: [], errors: [] };
        state.years = []; state.selected = []; state.uploadName = '';
        $('fileInput').value = '';
        renderYearBoxes();
        renderAll();
      } else {
        useSource();
      }
    });
  });

  $('fileInput').addEventListener('change', function (e) {
    var files = Array.prototype.slice.call(e.target.files || []);
    if (!files.length) return;
    e.target.value = '';
    Promise.all(files.map(readFile)).then(function (list) {
      state.mode = 'upload';
      state.uploadName = list.map(function (f) { return f.name; }).join(', ');
      document.querySelector('input[name=source][value=upload]').checked = true;
      loadCurrent(list);
    }, function (err) {
      var eb = $('errorBox');
      eb.hidden = false;
      eb.textContent = err.message;
    });
  });

  $('yearBoxes').addEventListener('change', function () {
    var sel = [];
    document.querySelectorAll('.yr').forEach(function (c) { if (c.checked) sel.push(Number(c.value)); });
    state.selected = sel;
    renderAll();
  });

  $('threshold').addEventListener('input', renderAll);
  $('csvBtn').addEventListener('click', downloadCsv);

  state.uploadName = '';
  useSource();
})();
