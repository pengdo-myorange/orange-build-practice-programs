'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const C = require('../js/calc.js');

const dir = path.join(__dirname, '..', 'data', 'programs');
const read = n => ({ name: n, text: fs.readFileSync(path.join(dir, n), 'utf8') });
const normal = ['2024.csv', '2025.csv', '2026.csv'].map(read);
const errFiles = [read('errors.csv')];
let count = 0;
function t(name, fn) { fn(); count++; console.log('통과 - ' + name); }

const n = C.loadFiles(normal);
const all = n.valid;

t('정상 자료 18행, 제외 0, 오류 0', () => {
  assert.strictEqual(all.length, 18);
  assert.strictEqual(n.excluded.length, 0);
  assert.strictEqual(n.errors.length, 0);
  assert.deepStrictEqual(C.availableYears(all), [2024, 2025, 2026]);
});

t('정상 자료 요약 1,410/1,171/83%', () => {
  const s = C.summarize(all, 70);
  assert.strictEqual(s.participants, 1410);
  assert.strictEqual(s.completers, 1171);
  assert.strictEqual(C.formatPct(s.rate, 0), '83%');
  assert.strictEqual(C.formatPct(s.rate, 1), '83.0%');
  assert.strictEqual(s.programCount, 6);
  assert.strictEqual(s.yearCount, 3);
  assert.strictEqual(s.cautionCount, 1);
  assert.strictEqual(C.formatCount(s.participants), '1,410');
});

t('연도별', () => {
  const exp = [[2024, 400, 320, '80.0%'], [2025, 470, 388, '82.6%'], [2026, 540, 463, '85.7%']];
  const y = C.byYear(all);
  assert.strictEqual(y.length, 3);
  exp.forEach((e, i) => {
    assert.strictEqual(y[i].year, e[0]);
    assert.strictEqual(y[i].participants, e[1]);
    assert.strictEqual(y[i].completers, e[2]);
    assert.strictEqual(C.formatPct(y[i].rate, 1), e[3]);
  });
});

t('사업별', () => {
  const exp = [
    ['P01', '디지털 기초 교실', 270, 211, '78.1%'], ['P02', '청소년 진로 탐색', 240, 200, '83.3%'],
    ['P03', '경력 전환 지원', 180, 129, '71.7%'], ['P04', '사회적기업 인턴십', 345, 322, '93.3%'],
    ['P05', '마을 돌봄 연결', 225, 199, '88.4%'], ['P06', '자원봉사 성장학교', 150, 110, '73.3%']];
  const p = C.byProgram(all);
  assert.strictEqual(p.length, 6);
  exp.forEach((e, i) => {
    assert.deepStrictEqual([p[i].id, p[i].name, p[i].participants, p[i].completers, C.formatPct(p[i].rate, 1)], e);
  });
});

t('분야별', () => {
  const exp = [['교육', 510, 411, '36.2%'], ['일자리', 525, 451, '37.2%'], ['지역사회', 375, 309, '26.6%']];
  const f = C.byField(all);
  assert.strictEqual(f.length, 3);
  exp.forEach((e, i) => {
    assert.deepStrictEqual([f[i].field, f[i].participants, f[i].completers, C.formatPct(f[i].share, 1)], e);
  });
});

t('행별 수료율 소수 1자리', () => {
  const exp = { 2024: [75.0, 80.0, 68.0, 90.0, 85.7, 70.0], 2025: [77.8, 82.5, 71.7, 93.0, 88.0, 72.0], 2026: [81.0, 86.0, 74.3, 96.2, 91.3, 76.7] };
  all.forEach(r => {
    const i = Number(r.id.slice(1)) - 1;
    assert.strictEqual(C.formatPct(r.rate, 1), exp[r.year][i].toFixed(1) + '%');
    assert.strictEqual(r.note, '');
  });
});

t('주의 행 기준 70%', () => {
  const w = all.filter(r => C.judge(r, 70) === '주의');
  assert.deepStrictEqual(w.map(r => r.year + r.id), ['2024P03']);
  assert.strictEqual(C.judge(all.find(r => r.year === 2024 && r.id === 'P06'), 70), '정상');
});

t('주의 행 기준 80%', () => {
  const w = all.filter(r => C.judge(r, 80) === '주의').map(r => r.year + r.id).sort();
  assert.deepStrictEqual(w, ['2024P01', '2024P03', '2024P06', '2025P01', '2025P03', '2025P06', '2026P03', '2026P06']);
  assert.strictEqual(C.judge(all.find(r => r.year === 2024 && r.id === 'P02'), 80), '정상');
  const s = C.summarize(all, 80);
  assert.strictEqual(s.cautionCount, 8);
  assert.strictEqual([s.participants, s.completers].join('/'), '1410/1171');
});

t('연도 필터 예시', () => {
  const chk = (years, p, c, pct, ys, cau) => {
    const s = C.summarize(C.filterByYears(all, years), 70);
    assert.deepStrictEqual([s.participants, s.completers, C.formatPct(s.rate, 0), s.programCount, s.yearCount, s.cautionCount], [p, c, pct, 6, ys, cau]);
  };
  chk([2024], 400, 320, '80%', 1, 1);
  chk([2025], 470, 388, '83%', 1, 0);
  chk([2026], 540, 463, '86%', 1, 0);
  chk([2024, 2026], 940, 783, '83%', 2, 1);
  const none = C.summarize(C.filterByYears(all, []), 70);
  assert.strictEqual(none.participants, 0);
  assert.strictEqual(none.rate, null);
  assert.strictEqual(C.formatPct(none.rate, 0), '계산 불가');
});

const e = C.loadFiles(errFiles);
t('errors.csv 유효 2 / 제외 3 / 사유', () => {
  assert.strictEqual(e.valid.length, 2);
  assert.strictEqual(e.excluded.length, 3);
  assert.deepStrictEqual(e.excluded.map(x => [x.line, x.reason]), [[2, '중복'], [3, '숫자 누락'], [5, '수료자 초과']]);
  assert.strictEqual(e.excluded[0].values['사업ID'], 'X01');
  assert.strictEqual(e.excluded[1].values['참여자수'], '');
  const z = e.valid[1];
  assert.strictEqual(z.id, 'X03');
  assert.strictEqual(z.rate, null);
  assert.strictEqual(z.note, '참여자 0명');
  assert.strictEqual(C.judge(z, 70), '계산 불가');
});

t('errors.csv 요약 20/15/75%, 주의 0 (70) / 1 (80)', () => {
  const s = C.summarize(e.valid, 70);
  assert.deepStrictEqual([s.participants, s.completers, C.formatPct(s.rate, 0), s.programCount, s.yearCount, s.cautionCount], [20, 15, '75%', 2, 1, 0]);
  assert.strictEqual(C.summarize(e.valid, 80).cautionCount, 1);
  assert.strictEqual(C.judge(e.valid[0], 80), '주의');
});

t('중복은 무효 첫 행을 건너뛴다 / 열 이름 오류 / 여러 파일 중복', () => {
  const h = '연도,사업ID,사업명,분야,지역,참여자수,수료자수\n';
  const r = C.loadFiles([{ name: 'a.csv', text: h + '2024,A,x,교육,서울,,3\n2024,A,x,교육,서울,10,5\n\n  \n2024,A,x,교육,서울,10,5\n2024,B,x,교육,서울,1.5,1\n2024,C,x,교육,서울,5,-1\n' },
    { name: 'bad.csv', text: '연도,id\n1,2\n' },
    { name: 'b.csv', text: h + '2024,A,y,교육,서울,9,9\n' }]);
  assert.deepStrictEqual(r.valid.map(x => [x.file, x.line]), [['a.csv', 2]]);
  assert.deepStrictEqual(r.excluded.map(x => [x.file, x.line, x.reason]),
    [['a.csv', 1, '숫자 누락'], ['a.csv', 3, '중복'], ['a.csv', 4, '정수 아님'], ['a.csv', 5, '음수'], ['b.csv', 1, '중복']]);
  assert.strictEqual(r.errors.length, 1);
  assert.strictEqual(r.errors[0].file, 'bad.csv');
});

t('parseCsv 따옴표/BOM/CRLF', () => {
  const p = C.parseCsv('﻿a,b\r\n"x, ""y""",  z \r\n\r\n');
  assert.deepStrictEqual(p.header, ['a', 'b']);
  assert.deepStrictEqual(p.records, [['x, "y"', 'z']]);
});

t('toCsv 왕복 (정상/오류 자료, 쉼표·따옴표 값)', () => {
  const out = C.toCsv(all);
  assert.strictEqual(out.charCodeAt(0), 0xFEFF);
  assert.ok(out.startsWith('﻿' + C.COLUMNS.join(',') + '\r\n'));
  const back = C.loadFiles([{ name: 'out.csv', text: out }]);
  assert.strictEqual(back.excluded.length, 0);
  assert.strictEqual(back.valid.length, 18);
  const s = C.summarize(back.valid, 70);
  assert.deepStrictEqual([s.participants, s.completers], [1410, 1171]);
  const eb = C.loadFiles([{ name: 'e.csv', text: C.toCsv(e.valid) }]);
  assert.strictEqual(eb.excluded.length, 0);
  assert.strictEqual(eb.valid.length, 2);
  const odd = [Object.assign({}, all[0], { name: '가,"나"' })];
  assert.strictEqual(C.loadFiles([{ name: 'o.csv', text: C.toCsv(odd) }]).valid[0].name, '가,"나"');
});

t('formatPct half up / formatCount', () => {
  assert.strictEqual(C.formatPct(82.5, 0), '83%');
  assert.strictEqual(C.formatPct(0.05, 1), '0.1%');
  assert.strictEqual(C.formatPct(75, 1), '75.0%');
  assert.strictEqual(C.formatPct(null, 1), '계산 불가');
  assert.strictEqual(C.formatCount(0), '0');
  assert.strictEqual(C.formatCount(1234567), '1,234,567');
});

t('data.js 내장 텍스트가 원본 파일과 동일', () => {
  const ctx = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'data.js'), 'utf8'), ctx);
  assert.strictEqual(ctx.window.SAMPLE_FILES.map(f => f.name).join(), '2024.csv,2025.csv,2026.csv');
  ctx.window.SAMPLE_FILES.forEach((f, i) => assert.strictEqual(f.text, normal[i].text));
  assert.strictEqual(ctx.window.ERROR_SAMPLE_FILES.map(f => f.name).join(), 'errors.csv');
  assert.strictEqual(ctx.window.ERROR_SAMPLE_FILES[0].text, errFiles[0].text);
});

console.log('\n전체 ' + count + '개 테스트 통과');
