// CSV 解析与基础工具：边界情况
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, csvToRecords, parseAmount, parseDate, addDays, weekdayCN, formatNumber, formatMoney } from '../bin/report.mjs';

const CRLF = String.fromCharCode(13, 10);
const NL = String.fromCharCode(10);

test('parseCsv：BOM、CRLF、引号包裹与字段内逗号、双引号转义', function () {
  const raw = '\uFEFFdate,channel,revenue' + CRLF + '2026-03-10,"淘宝店, 旗舰",' + '"¥15,200"' + CRLF + '2026-03-11,"他说""很好""",100' + CRLF;
  const rows = parseCsv(raw);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0], ['date', 'channel', 'revenue']);
  assert.deepEqual(rows[1], ['2026-03-10', '淘宝店, 旗舰', '¥15,200']);
  assert.deepEqual(rows[2], ['2026-03-11', '他说"很好"', '100']);
});

test('parseCsv：末尾空行被丢弃，引号内换行保留', function () {
  const raw = 'a,b' + NL + '"x' + NL + 'y",2' + NL + NL;
  const rows = parseCsv(raw);
  assert.equal(rows.length, 2);
  assert.equal(rows[1][0], 'x' + NL + 'y');
});

test('csvToRecords：表头小写化、缺列补空、空行跳过', function () {
  const recs = csvToRecords('Date,Channel' + NL + '2026-03-10,淘宝店' + NL + NL + '2026-03-11,' + NL);
  assert.equal(recs.length, 2);
  assert.equal(recs[0].date, '2026-03-10');
  assert.equal(recs[1].channel, '');
});

test('parseAmount：¥ 符号、千分位、元后缀、括号负数、空值与非数字', function () {
  assert.equal(parseAmount('¥15,200'), 15200);
  assert.equal(parseAmount('￥1,234,567.5'), 1234567.5);
  assert.equal(parseAmount(' 888 元 '), 888);
  assert.equal(parseAmount('(300)'), -300);
  assert.equal(parseAmount(''), 0);
  assert.equal(parseAmount(null), 0);
  assert.equal(parseAmount('abc'), 0);
});

test('parseDate：多种写法归一，越界与非法返回 null', function () {
  assert.equal(parseDate('2026-03-16'), '2026-03-16');
  assert.equal(parseDate('2026/3/6'), '2026-03-06');
  assert.equal(parseDate('2026年3月6日'), '2026-03-06');
  assert.equal(parseDate('20260316'), '2026-03-16');
  assert.equal(parseDate('2026-02-30'), null);
  assert.equal(parseDate('2026-13-01'), null);
  assert.equal(parseDate(''), null);
  assert.equal(parseDate('昨天'), null);
});

test('日期与数字格式化工具', function () {
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(addDays('2026-03-16', -6), '2026-03-10');
  assert.equal(weekdayCN('2026-03-16'), '周一');
  assert.equal(formatNumber(1234567), '1,234,567');
  assert.equal(formatNumber(-42), '-42');
  assert.equal(formatMoney(207855.4), '¥207,855');
  assert.equal(formatMoney(null), '无数据');
});
