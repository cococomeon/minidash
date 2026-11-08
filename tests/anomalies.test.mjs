// 异常规则：每条都要能触发，也要能不触发
import test from 'node:test';
import assert from 'node:assert/strict';
import { computeMetrics, detectAnomalies, THRESHOLDS } from '../bin/report.mjs';

const DAY = '2026-03-16';

function mkData(parts) {
  const data = { orders: [], accounts: [], projects: [], files: { orders: [], accounts: [], projects: [] }, rowCounts: { orders: 0, accounts: 0, projects: 0 }, skipped: { orders: 0, accounts: 0, projects: 0 }, warnings: [] };
  for (const k of ['orders', 'accounts', 'projects']) if (parts[k]) data[k] = parts[k];
  return data;
}

function days(count, startDay) {
  const out = [];
  for (let i = 0; i < count; i++) out.push(new Date(Date.UTC(Number(startDay.slice(0, 4)), Number(startDay.slice(5, 7)) - 1, Number(startDay.slice(8, 10))) + i * 86400000).toISOString().slice(0, 10));
  return out;
}

function ordersOf(dates, revenueFn, refundFn) {
  return dates.map(function (d, i) {
    return { date: d, channel: '淘宝店', orders: 10, revenue: revenueFn(i), refunds: refundFn(i) };
  });
}

function healthyData() {
  const ds = days(14, '2026-03-03');
  const orders = ordersOf(ds, function (i) { return i < 7 ? 100 : 110; }, function () { return 1; });
  const accounts = ds.map(function (d) {
    return { date: d, platform: '微信小店', account: '主店', followers: 1000 + ds.indexOf(d) * 5, interactions: 10 };
  });
  const projects = ds.map(function (d) {
    return { date: d, project: '包装优化', done: ds.indexOf(d), open: 3, blocked: 0 };
  });
  return mkData({ orders: orders, accounts: accounts, projects: projects });
}

test('规则1 周退款率 > 5% 触发，<= 5% 不触发', function () {
  const ds = days(7, '2026-03-10');
  const high = computeMetrics(mkData({ orders: ordersOf(ds, function () { return 100; }, function () { return 6; }) }), DAY);
  assert.equal(high.refundRate, 0.06);
  const highAnomalies = detectAnomalies(high);
  assert.ok(highAnomalies.some(function (a) { return a.id === 'refund-week' && a.level === 'high'; }));
  assert.ok(highAnomalies.find(function (a) { return a.id === 'refund-week'; }).why.length > 10);

  const low = computeMetrics(mkData({ orders: ordersOf(ds, function () { return 100; }, function () { return 5; }) }), DAY);
  assert.equal(low.refundRate, 0.05);
  assert.equal(detectAnomalies(low).some(function (a) { return a.id === 'refund-week'; }), false);
});

test('规则2 单日退款率 > 10% 触发并点名那一天，未超线不触发', function () {
  const ds = days(7, '2026-03-10');
  const bad = computeMetrics(
    mkData({ orders: ordersOf(ds, function () { return 100; }, function (i) { return i === 2 ? 12 : 1; }) }),
    DAY,
  );
  const found = detectAnomalies(bad).find(function (a) { return a.id === 'refund-day'; });
  assert.ok(found, '单日 12% 应触发');
  assert.ok(found.title.indexOf('03-12') >= 0);
  assert.ok(found.title.indexOf('12.0%') >= 0);

  const ok = computeMetrics(mkData({ orders: ordersOf(ds, function () { return 100; }, function (i) { return i === 2 ? 10 : 1; }) }), DAY);
  assert.equal(detectAnomalies(ok).some(function (a) { return a.id === 'refund-day'; }), false);
});

test('规则3 销售额环比跌幅 > 30% 触发，-20% 不触发', function () {
  const ds = days(14, '2026-03-03');
  const drop40 = computeMetrics(mkData({ orders: ordersOf(ds, function (i) { return i < 7 ? 200 : 120; }, function () { return 1; }) }), DAY);
  assert.equal(drop40.revenueChange, -0.4);
  assert.ok(detectAnomalies(drop40).some(function (a) { return a.id === 'revenue-drop'; }));

  const drop20 = computeMetrics(mkData({ orders: ordersOf(ds, function (i) { return i < 7 ? 200 : 160; }, function () { return 1; }) }), DAY);
  assert.equal(drop20.revenueChange, -0.2);
  assert.equal(detectAnomalies(drop20).some(function (a) { return a.id === 'revenue-drop'; }), false);
});

test('规则4 粉丝净增为负触发；净增为正但有账号掉粉走「单账号掉粉」', function () {
  const ds = days(9, '2026-03-08');
  const drop = ds.map(function (d, i) {
    return { date: d, platform: '抖音', account: '副号', followers: 900 - i * 10, interactions: 1 };
  });
  const netNegative = detectAnomalies(computeMetrics(mkData({ accounts: drop }), DAY));
  assert.ok(netNegative.some(function (a) { return a.id === 'fans-net-negative'; }));

  const mixed = [];
  ds.forEach(function (d, i) {
    mixed.push({ date: d, platform: '微信', account: '主店', followers: 1000 + i * 50, interactions: 1 });
    mixed.push({ date: d, platform: '抖音', account: '副号', followers: 900 - i * 10, interactions: 1 });
  });
  const mixedAnomalies = detectAnomalies(computeMetrics(mkData({ accounts: mixed }), DAY));
  assert.ok(mixedAnomalies.some(function (a) { return a.id === 'fans-single-drop'; }));
  assert.equal(mixedAnomalies.some(function (a) { return a.id === 'fans-net-negative'; }), false);
});

test('规则5 有阻塞项触发；健康数据一条异常都不报', function () {
  const ds = days(9, '2026-03-08');
  const blocked = ds.map(function (d, i) {
    return { date: d, project: '会员体系改版', done: i, open: 2, blocked: 1 };
  });
  assert.ok(detectAnomalies(computeMetrics(mkData({ projects: blocked }), DAY)).some(function (a) { return a.id === 'project-blocked'; }));

  const clean = detectAnomalies(computeMetrics(healthyData(), DAY));
  assert.equal(clean.length, 0);
});

test('缺文件时只报「提示」级，不误报业务异常', function () {
  const m = computeMetrics(mkData({}), DAY);
  const anomalies = detectAnomalies(m);
  assert.equal(anomalies.length, 3);
  assert.ok(anomalies.every(function (a) { return a.level === 'info'; }));
  assert.ok(anomalies.every(function (a) { return a.why && a.why.length > 0; }));
});

test('阈值集中在 THRESHOLDS，方便客户自己调', function () {
  assert.equal(THRESHOLDS.weekRefundRate, 0.05);
  assert.equal(THRESHOLDS.dayRefundRate, 0.1);
  assert.equal(THRESHOLDS.revenueDrop, 0.3);
});
