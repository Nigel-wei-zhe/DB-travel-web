const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { VERSION, CORE_FILES, NETWORK_FIRST } = require('./sw.js');
const html = fs.readFileSync('index.html', 'utf8');

test('CORE_FILES use relative paths and every file exists', () => {
  assert.ok(VERSION);
  for (const file of [...CORE_FILES, ...NETWORK_FIRST]) {
    assert.ok(file.startsWith('./'), `${file} 必須以 ./ 開頭`);
    assert.ok(!file.startsWith('/') && !/^[a-z]+:/i.test(file), `${file} 不可是絕對路徑`);
  }
  assert.equal(new Set(CORE_FILES).size, CORE_FILES.length, 'CORE_FILES 有重複項目');
  for (const file of CORE_FILES) {
    if (file === './') continue;
    assert.ok(fs.statSync(path.join(__dirname, file)).isFile(), `${file} 不存在`);
  }
});

test('local files referenced by index.html are in CORE_FILES', () => {
  const refs = [...html.matchAll(/\b(?:src|href)="([^"#]+)"/g)].map(match => match[1]).filter(ref => !/^[a-z]+:|^\/\//i.test(ref));
  assert.ok(refs.length > 5);
  for (const ref of refs) {
    assert.ok(!ref.startsWith('/'), `${ref} 不可用 / 開頭`);
    assert.ok(CORE_FILES.includes(ref), `${ref} 未列入 CORE_FILES`);
  }
});

test('data, assets and manifest icons are covered by CORE_FILES', () => {
  const manifest = JSON.parse(fs.readFileSync('manifest.webmanifest', 'utf8'));
  for (const icon of manifest.icons) assert.ok(CORE_FILES.includes(icon.src), `${icon.src} 未列入 CORE_FILES`);
  assert.ok(manifest.start_url.startsWith('./') && manifest.scope.startsWith('./'));
  for (const file of fs.readdirSync('data').filter(name => name.endsWith('.jsonl'))) assert.ok(CORE_FILES.includes(`./data/${file}`), `data/${file} 未列入`);
  for (const dir of ['assets/coupons', 'assets/stamps']) {
    for (const file of fs.readdirSync(dir)) assert.ok(CORE_FILES.includes(`./${dir}/${file}`), `${dir}/${file} 未列入`);
  }
  assert.ok(NETWORK_FIRST.includes('./data/') && NETWORK_FIRST.includes('./index.html'));
});

test('fonts referenced by @font-face in styles.css are in CORE_FILES', () => {
  const css = fs.readFileSync('styles.css', 'utf8');
  assert.ok(!/fonts\.googleapis|fonts\.gstatic|@import/.test(css), 'styles.css 不可再載入外部字型');
  const urls = [...css.matchAll(/@font-face\s*{[^}]*?url\(['"]?([^'")]+)['"]?\)/g)].map(match => match[1]);
  assert.ok(urls.length >= 2);
  for (const url of urls) {
    assert.ok(url.startsWith('./fonts/'), `${url} 必須是 ./fonts/ 相對路徑`);
    assert.ok(CORE_FILES.includes(url), `${url} 未列入 CORE_FILES`);
  }
});
