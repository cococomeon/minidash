// 指标算式：周窗口、退款率、环比、粉丝、项目
import test from 'node:test';
import assert from 'node:assert/strict';
import { computeMetrics, WINDOW_DAYS } from '../bin/report.mjs';

const DAY = '2026-03-16';

function mkData(parts) {
  const data = { orders: [], accounts: [], projects: [], files: { orders: [], accounts: [], projects: [] }, rowCounts: { orders: 0, accounts: 0, projects: 0 }, skipped: { orders: 0, accounts: 0, projects: 0 }, warnings: [] };
  for (const k of ['orders', 'accounts', 'projects']) if (parts[k]) data[k] = parts[k];
  return data;
}

function dayList(count, endDay, fn) {
  const out = [];
  const end = new Date(endDay + 'T00:00:00Z').getTime();
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(end - i * 86400000).toISOString().slice(0, 10);
    out.push(fn(d, i));
  }
  return out;
}

test('窗口是 day 及之前共 7 天，窗口外的行不计入', function () {
  const orders = dayList(20, DAY, function (d, i) {
    return { date: d, channel: '淘宝店', orders: 1, revenue: 100, refunds: 0 };
  });
  const m = computeMetrics(mkData({ orders: orders }), DAY);
  assert.equal(m.windowStart, '2026-03-10');
  assert.equal(m.windowEnd, DAY);
  assert.equal(WINDOW_DAYS, 7);
  assert.equal(m.revenue, 700);
  assert.equal(m.orders, 7);
  assert.equal(m.dayRows.length, 7);
});

test('退款率 = 退款额 / 销售额，并给出单日最高退款率所在日', function () {
  const orders = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(Date.UTC(2026, 2, 10) + i * 86400000).toISOString().slice(0, 10);
    const refunds = i === 3 ? 15 : 5;
    orders.push({ date: d, channel: '淘宝店', orders: 2, revenue: 100, refunds: refunds });
  }
  const m = computeMetrics(mkData({ orders: orders }), DAY);
  assert.equal(m.revenue, 700);
  assert.equal(m.refunds, 45);
  assert.equal(m.refundRate.toFixed(4), (45 / 700).toFixed(4));
  assert.equal(m.peak.date, '2026-03-13');
  assert.equal(m.peak.rate, 0.15);
  assert.equal(m.avgOrderValue, 50);
});

test('环比对比的是前 7 天，且只在有数据时给出', function () {
  const orders = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date(Date.UTC(2026, 2, 3) + i * 86400000).toISOString().slice(0, 10);
    const revenue = i < 7 ? 200 : 100;
    orders.push({ date: d, channel: '淘宝店', orders: 1, revenue: revenue, refunds: 0 });
  }
  const m = computeMetrics(mkData({ orders: orders }), DAY);
  assert.equal(m.prevRevenue, 1400);
  assert.equal(m.revenue, 700);
  assert.equal(m.revenueChange, -0.5);

  const onlyWeek = computeMetrics(mkData({ orders: orders.slice(7) }), DAY);
  assert.equal(onlyWeek.revenueChange, null);
});

test('粉丝净增按「窗口末日 - 窗口前一日」计算，并列出掉粉账号', function () {
  const accounts = [];
  for (let i = 0; i < 9; i++) {
    const d = new Date(Date.UTC(2026, 2, 8) + i * 86400000).toISOString().slice(0, 10);
    accounts.push({ date: d, platform: '微信小店', account: '主店', followers: 1000 + i * 10, interactions: 5 });
    accounts.push({ date: d, platform: '抖音小店', account: '副号', followers: 500 - i * 20, interactions: 3 });
  }
  const m = computeMetrics(mkData({ accounts: accounts }), DAY);
  assert.equal(m.fans.net, 70 - 140);
  assert.equal(m.fans.dropped.length, 1);
  assert.equal(m.fans.dropped[0].account, '副号');
  assert.equal(m.fans.dropped[0].delta, -140);
  assert.equal(m.fans.latestTotal, 1080 + 340);
});

test('项目完成取窗口内累计增量，阻塞取最新一天', function () {
  const projects = [];
  for (let i = 0; i < 9; i++) {
    const d = new Date(Date.UTC(2026, 2, 8) + i * 86400000).toISOString().slice(0, 10);
    projects.push({ date: d, project: '会员体系改版', done: 10 + i, open: 9, blocked: i >= 5 ? 2 : 0 });
    projects.push({ date: d, project: '包装优化', done: 3, open: 5, blocked: 0 });
  }
  const m = computeMetrics(mkData({ projects: projects }), DAY);
  assert.equal(m.projects.doneGain, 7);
  assert.equal(m.projects.open, 14);
  assert.equal(m.projects.blocked, 2);
  assert.equal(m.projects.blockedList.length, 1);
  assert.equal(m.projects.blockedList[0].project, '会员体系改版');
});

test('三类数据全缺时指标为 null，不抛异常', function () {
  const m = computeMetrics(mkData({}), DAY);
  assert.equal(m.hasOrders, false);
  assert.equal(m.revenue, null);
  assert.equal(m.refundRate, null);
  assert.equal(m.fans, null);
  assert.equal(m.projects, null);
  assert.equal(m.dayRows.length, 0);
});
