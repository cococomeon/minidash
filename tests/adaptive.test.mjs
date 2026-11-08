import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildData,
  computeMetrics,
  detectAnomalies,
  kpiCells,
  chartSpec,
  pickDay,
  renderSvg,
  renderMarkdown,
} from '../bin/report.mjs';

const NL = String.fromCharCode(10);

function csv(name, header, rows) {
  return { name: name, text: [header].concat(rows).join(NL) + NL };
}

function days(count) {
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push(new Date(Date.UTC(2026, 3, 1) + i * 86400000).toISOString().slice(0, 10));
  }
  return out;
}

function ordersOnly() {
  const rows = days(10).map(function (d) {
    return d + ',淘宝店,10,1000,20';
  });
  return buildData({ orders: [csv('orders-2026-04.csv', 'date,channel,orders,revenue,refunds', rows)] });
}

function accountsOnly() {
  const rows = [];
  for (const d of days(10)) {
    rows.push(d + ',小红书,主号,' + (5000 + days(10).indexOf(d) * 30) + ',120');
    rows.push(d + ',抖音,副号,' + (3000 + days(10).indexOf(d) * 10) + ',80');
  }
  return buildData({ accounts: [csv('accounts-2026-04.csv', 'date,platform,account,followers,interactions', rows)] });
}

function both() {
  const data = ordersOnly();
  const acc = accountsOnly();
  data.accounts = acc.accounts;
  data.files.accounts = acc.files.accounts;
  data.rowCounts.accounts = acc.rowCounts.accounts;
  return data;
}

function metricsOf(data) {
  const day = pickDay(data);
  return computeMetrics(data, day);
}

function withoutMissing(text) {
  return text.indexOf('无数据') === -1;
}

test('自适应：只有 accounts 时 KPI 换成内容侧四项，图表换成粉丝净增', function () {
  const m = metricsOf(accountsOnly());
  const cells = kpiCells(m);
  assert.equal(cells.length, 4);
  assert.deepEqual(
    cells.map(function (c) {
      return c.label;
    }),
    ['粉丝净增', '粉丝总数', '本周互动量', '掉粉账号']
  );
  assert.equal(chartSpec(m).kind, 'fans');
  assert.equal(chartSpec(m).title, '近 7 天粉丝净增');
});

test('自适应：只有 orders 时 KPI 三项（第三项拉满整行），图表仍是销售额', function () {
  const m = metricsOf(ordersOnly());
  const cells = kpiCells(m);
  assert.equal(cells.length, 3);
  assert.deepEqual(
    cells.map(function (c) {
      return c.label;
    }),
    ['本周销售额', '本周订单', '本周退款率']
  );
  assert.equal(chartSpec(m).kind, 'revenue');
});

test('自适应：orders + accounts 时 KPI 四项，退款率与粉丝净增同时在', function () {
  const m = metricsOf(both());
  const cells = kpiCells(m);
  assert.equal(cells.length, 4);
  assert.deepEqual(
    cells.map(function (c) {
      return c.label;
    }),
    ['本周销售额', '本周订单', '本周退款率', '粉丝净增']
  );
  assert.equal(chartSpec(m).kind, 'revenue');
});

test('自适应：三种数据组合渲染出的卡片与日报都不再出现「无数据」', function () {
  const cases = [ordersOnly(), accountsOnly(), both()];
  for (const data of cases) {
    const m = metricsOf(data);
    const anomalies = detectAnomalies(m);
    assert.ok(withoutMissing(renderSvg(m, anomalies)), 'SVG 里不应再出现「无数据」');
    assert.ok(withoutMissing(renderMarkdown(m, anomalies)), 'Markdown 里不应再出现「无数据」');
  }
});

test('自适应：缺表仍然在「提示」级异常里点名，便于排查', function () {
  const m = metricsOf(accountsOnly());
  const anomalies = detectAnomalies(m);
  const hints = anomalies.filter(function (a) {
    return a.level === 'info';
  });
  const titles = hints.map(function (a) {
    return a.title;
  }).join(' | ');
  assert.ok(titles.indexOf('没有读到订单表') >= 0, '应提示缺订单表：' + titles);
  assert.ok(titles.indexOf('没有读到项目表') >= 0, '应提示缺项目表：' + titles);
});
