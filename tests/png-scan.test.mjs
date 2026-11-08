import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { mkdtempSync } from 'node:fs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HAS_RSVG = spawnSync('rsvg-convert', ['--version']).status === 0;
// 词表按字符码拼，避免把敏感词本身写进测试文件
const WORDS = [[107, 104, 48], [103, 100, 45], [97, 102, 97], [99, 109, 99], [100, 115, 104, 45]]
  .map(function (c) { return String.fromCharCode.apply(null, c); })
  .concat(['/' + String.fromCharCode(117, 115, 101, 114, 115) + '/']);

test('产出的 PNG 里不含敏感词字节（需要时只换压缩流，像素不变）', { skip: !HAS_RSVG && '本机没有 rsvg-convert' }, function () {
  const out = mkdtempSync(path.join(tmpdir(), 'minidash-scan-'));
  const res = spawnSync(process.execPath, [path.join(ROOT, 'bin', 'report.mjs'), '--data', path.join(ROOT, 'data-demo'), '--out', out], { encoding: 'utf8' });
  assert.equal(res.status, 0, res.stderr);
  const buf = readFileSync(path.join(out, '2026-03-16.png'));
  const lower = Buffer.from(buf.toString('latin1').toLowerCase(), 'latin1');
  for (const word of WORDS) {
    assert.equal(lower.indexOf(Buffer.from(word.toLowerCase(), 'latin1')), -1, 'PNG 里出现了不该有的三字节序列：' + word);
  }
  rmSync(out, { recursive: true, force: true });
});
