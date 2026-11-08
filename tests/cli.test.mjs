// 端到端：真跑命令、真看 PNG、真验幂等与降级
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadData, computeMetrics, CARD } from '../bin/report.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const BIN = path.join(ROOT, 'bin', 'report.mjs');
const DEMO = path.join(ROOT, 'data-demo');
const HAS_RSVG = spawnSync('rsvg-convert', ['--version'], { encoding: 'utf8' }).status === 0;

function run(args) {
  return spawnSync(process.execPath, [BIN].concat(args), { encoding: 'utf8' });
}

function tmpDir(prefix) {
  return mkdtempSync(path.join(tmpdir(), prefix));
}

function md5(file) {
  return createHash('md5').update(readFileSync(file)).digest('hex');
}

function pngSize(file) {
  const buf = readFileSync(file);
  assert.equal(buf.slice(1, 4).toString('ascii'), 'PNG', '不是 PNG 文件');
  assert.equal(buf.slice(12, 16).toString('ascii'), 'IHDR', '缺少 IHDR');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

test('演示数据里确实埋了 12% 退款日、掉粉账号、阻塞项目', async function () {
  const data = await loadData(DEMO);
  assert.ok(data.orders.length >= 14 * 3, '订单行数应覆盖 14 天以上');
  const m = computeMetrics(data, '2026-03-16');
  assert.ok(m.peak, '应有单日最高退款率');
  assert.equal(m.peak.rate.toFixed(2), '0.12');
  assert.equal(m.fans.dropped.length, 1);
  assert.ok(m.fans.net < 0);
  assert.ok(m.projects.blocked > 0);
});

test('端到端：一条命令产出 md / svg / 1080×1440 的 png', { skip: !HAS_RSVG && '本机没有 rsvg-convert' }, function () {
  const out = tmpDir('minidash-e2e-');
  const res = run(['--data', DEMO, '--out', out]);
  assert.equal(res.status, 0, res.stderr);
  const md = path.join(out, '2026-03-16.md');
  const svg = path.join(out, '2026-03-16.svg');
  const png = path.join(out, '2026-03-16.png');
  assert.ok(statSync(md).size > 0);
  assert.ok(statSync(svg).size > 0);
  const size = pngSize(png);
  assert.equal(size.width, 1080);
  assert.equal(size.height, 1440);
  assert.deepEqual([CARD.width, CARD.height], [1080, 1440]);
  const text = readFileSync(md, 'utf8');
  for (const kw of ['每日经营日报', '核心指标', '异常与提醒', '为什么', '口径说明', '全程在本机计算']) {
    assert.ok(text.indexOf(kw) >= 0, 'md 缺少小节：' + kw);
  }
  assert.ok(readFileSync(svg, 'utf8').indexOf('width="1080"') >= 0);
  rmSync(out, { recursive: true, force: true });
});

test('幂等：同一天连跑两次，md 逐字节一致且不产生多余文件', { skip: !HAS_RSVG && '本机没有 rsvg-convert' }, function () {
  const out = tmpDir('minidash-idem-');
  assert.equal(run(['--data', DEMO, '--out', out]).status, 0);
  const first = md5(path.join(out, '2026-03-16.md'));
  const firstSvg = md5(path.join(out, '2026-03-16.svg'));
  assert.equal(run(['--data', DEMO, '--out', out]).status, 0);
  assert.equal(md5(path.join(out, '2026-03-16.md')), first, '两次 md 内容不一致');
  assert.equal(md5(path.join(out, '2026-03-16.svg')), firstSvg, '两次 svg 内容不一致');
  assert.deepEqual(readdirSync(out).sort(), ['2026-03-16.md', '2026-03-16.png', '2026-03-16.svg']);
  rmSync(out, { recursive: true, force: true });
});

test('降级：只有 orders 时仍出日报，账号与项目段写明「未提供」，退出码 0', { skip: !HAS_RSVG && '本机没有 rsvg-convert' }, function () {
  const dataDir = tmpDir('minidash-data-');
  const out = tmpDir('minidash-out-');
  const rows = ['date,channel,orders,revenue,refunds'];
  for (let i = 0; i < 10; i++) {
    const d = new Date(Date.UTC(2026, 2, 7) + i * 86400000).toISOString().slice(0, 10);
    rows.push(d + ',淘宝店,10,1000,20');
  }
  writeFileSync(path.join(dataDir, 'orders-2026-03.csv'), rows.join(String.fromCharCode(10)) + String.fromCharCode(10));
  const res = run(['--data', dataDir, '--out', out]);
  assert.equal(res.status, 0, res.stderr);
  const text = readFileSync(path.join(out, '2026-03-16.md'), 'utf8');
  assert.ok(text.indexOf('未提供账号表') >= 0, '应提示账号缺失');
  assert.ok(text.indexOf('没有读到账号表') >= 0);
  assert.ok(text.indexOf('## 项目') >= 0);
  const projectSection = text.slice(text.indexOf('## 项目'), text.indexOf('## 账号'));
  assert.ok(projectSection.indexOf('未提供项目表') >= 0, '项目段应写明未提供项目表');
  const accountSection = text.slice(text.indexOf('## 账号'), text.indexOf('## 口径说明'));
  assert.ok(accountSection.indexOf('未提供账号表') >= 0, '账号段应写明未提供账号表');
  rmSync(dataDir, { recursive: true, force: true });
  rmSync(out, { recursive: true, force: true });
});

test('--day 可指定历史日期，窗口随之平移', { skip: !HAS_RSVG && '本机没有 rsvg-convert' }, function () {
  const out = tmpDir('minidash-day-');
  const res = run(['--data', DEMO, '--out', out, '--day', '2026-03-12']);
  assert.equal(res.status, 0, res.stderr);
  const text = readFileSync(path.join(out, '2026-03-12.md'), 'utf8');
  assert.ok(text.indexOf('2026-03-06 ~ 2026-03-12') >= 0, '窗口应为 03-06~03-12');
  rmSync(out, { recursive: true, force: true });
});

test('参数错误：缺 --data 退出码 2，非法 --day 也报错', function () {
  const missing = run(['--out', '/tmp/x']);
  assert.equal(missing.status, 2);
  assert.ok(missing.stderr.indexOf('--data') >= 0);
  const badDay = run(['--data', DEMO, '--out', '/tmp/x', '--day', '2026-3-6']);
  assert.equal(badDay.status, 2);
  assert.ok(badDay.stderr.indexOf('--day') >= 0);
});

test('数据目录不存在时给出可读错误，不抛栈', function () {
  const res = run(['--data', path.join(tmpdir(), 'no-such-dir-minidash'), '--out', tmpdir()]);
  assert.equal(res.status, 1);
  assert.ok(res.stderr.indexOf('数据目录读不到') >= 0, res.stderr);
  assert.equal(res.stderr.indexOf('at async'), -1, '不应输出调用栈');
});
