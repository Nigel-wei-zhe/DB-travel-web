const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const script = path.join(__dirname, 'tools', 'check-data.cjs');
const fixtures = path.join(__dirname, 'test-fixtures');
const run = dir => {
  const result = spawnSync(process.execPath, [script, dir], { encoding: 'utf8' });
  return { code: result.status, out: result.stdout + result.stderr };
};
// 在暫存資料夾建立 <tmp>/data（複製範例資料）與 <tmp>/assets，回傳 data 路徑。
function workspace(change = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'check-data-'));
  const dir = path.join(root, 'data');
  fs.mkdirSync(dir);
  for (const name of ['itinerary', 'checklist', 'shops', 'coupons']) {
    const source = fs.readFileSync(path.join(fixtures, `${name}.jsonl`), 'utf8');
    fs.writeFileSync(path.join(dir, `${name}.jsonl`), change[name] ? change[name](source) : source);
  }
  fs.mkdirSync(path.join(root, 'assets', 'coupons'), { recursive: true });
  fs.copyFileSync(path.join(__dirname, 'assets', 'coupons', 'sample.svg'), path.join(root, 'assets', 'coupons', 'sample.svg'));
  return dir;
}

test('範例資料通過並印出摘要', () => {
  const { code, out } = run(fixtures);
  assert.equal(code, 0, out);
  assert.match(out, /摘要/);
  assert.match(out, /優惠券：1 張/);
});
test('暫存複製的正常資料結束代碼 0', () => {
  assert.equal(run(workspace()).code, 0);
});
test('行程項目 ID 重複結束代碼 1 並指出行號', () => {
  const { code, out } = run(workspace({ itinerary: s => s.replace('t1-lunch', 't1-gate') }));
  assert.equal(code, 1);
  assert.match(out, /itinerary\.jsonl 第 \d+ 行：行程 ID 重複：t1-gate/);
});
test('壞 JSON 結束代碼 1 並指出行號', () => {
  const { code, out } = run(workspace({ checklist: s => s.replace(/\r?\n$/, '') + '\n{"id":\n' }));
  assert.equal(code, 1);
  const total = fs.readFileSync(path.join(fixtures, 'checklist.jsonl'), 'utf8').replace(/\r?\n$/, '').split('\n').length;
  assert.match(out, new RegExp(`checklist\\.jsonl 第 ${total + 1} 行`));
});
test('優惠券圖片檔案不存在結束代碼 1', () => {
  const { code, out } = run(workspace({ coupons: s => s.replace('sample.svg', 'missing.svg') }));
  assert.equal(code, 1);
  assert.match(out, /找不到圖片 \.\/assets\/coupons\/missing\.svg/);
});
test('以 / 開頭或網址的圖片路徑結束代碼 1', () => {
  let result = run(workspace({ coupons: s => s.replace('./assets', '/assets') }));
  assert.equal(result.code, 1);
  assert.match(result.out, /不可以 \/ 開頭/);
  result = run(workspace({ coupons: s => s.replace('./assets/coupons/sample.svg', 'https://example.com/a.png') }));
  assert.equal(result.code, 1);
  assert.match(result.out, /不可使用網址/);
});
test('缺少檔案結束代碼 1；空店家群組只提醒', () => {
  const dir = workspace();
  fs.rmSync(path.join(dir, 'shops.jsonl'));
  assert.equal(run(dir).code, 1);
  fs.writeFileSync(path.join(dir, 'shops.jsonl'), '{"id":"empty","title":"空群組","shops":[]}\n');
  const { code, out } = run(dir);
  assert.equal(code, 0, out);
  assert.match(out, /提醒.*空群組/);
});
