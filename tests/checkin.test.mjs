import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function run(response) {
  const dir = mkdtempSync(join(tmpdir(), 'checkin-test-'));
  const output = join(dir, 'output');
  try {
    const code = `globalThis.fetch = async (url, options) => {
      const fixture = ${JSON.stringify(response)};
      return new Response(fixture.body, {status: fixture.status, headers: fixture.headers});
    }; await import('./main.js');`;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], {
      cwd: new URL('..', import.meta.url), encoding: 'utf8',
      env: {...process.env, ACCOUNTS: JSON.stringify([{name: '测试账号', cookie: 'fake-cookie'}]),
        HOST: 'example.com', GITHUB_OUTPUT: output},
    });
    let summary = '';
    try { summary = readFileSync(output, 'utf8'); } catch {}
    return {...result, summary};
  } finally { rmSync(dir, {recursive: true, force: true}); }
}

test('登录重定向明确报告 Cookie 失效，不解析登录 HTML', () => {
  const result = run({status: 302, body: '', headers: {location: '/auth/login'}});
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Cookie.*失效/);
});

test('非 JSON 响应报告站点页面类型，不输出页面正文', () => {
  const result = run({status: 200, body: '<html>private-body</html>', headers: {'content-type': 'text/html'}});
  assert.equal(result.status, 1);
  assert.match(result.stderr, /返回.*HTML/);
  assert.doesNotMatch(result.stderr, /private-body/);
});

test('签到成功写入合法 GitHub 多行输出', () => {
  const result = run({status: 200, body: JSON.stringify({ret: 1, msg: '获得 100MB'}), headers: {'content-type': 'application/json'}});
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /获得 100MB/);
  assert.match(result.summary, /^result<<[^\n]+\n测试账号: ✅ 获得 100MB\n[^\n]+\n$/);
});
