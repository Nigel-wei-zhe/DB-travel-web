#!/usr/bin/env node
// 檢查網站用到的字是否都收錄在 fonts/subset-chars.txt（不需任何套件）。
// 用法：node tools/check-font.cjs
//
// 字元收集規則必須與 tools/subset-font.py 的 collect() 一致，修改時兩邊一起改：
//   1. data/*.jsonl 的完整文字
//   2. index.html 的完整文字
//   3. 專案根目錄 *.js（不含 *.test.*、不含子資料夾）內的字串字面量
//      （'...'、"..." 與 `...`）裡的所有字元
//   控制字元與空白（<= U+0020、U+007F）不計。
//   固定補充字元（ASCII、標點、星期日期用字）只在產生子集時加入，這裡不檢查。
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const STRING_RE = /'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|`(?:\\.|[^`\\])*`/g;

const read = file => fs.readFileSync(path.join(root, file), 'utf8');
let text = '';
for (const file of fs.readdirSync(path.join(root, 'data')).filter(name => name.endsWith('.jsonl')).sort()) text += read(`data/${file}`);
text += read('index.html');
for (const file of fs.readdirSync(root).filter(name => name.endsWith('.js') && !name.includes('.test.')).sort()) {
  for (const match of read(file).matchAll(STRING_RE)) text += match[0];
}

const needed = new Set([...text].filter(c => c.codePointAt(0) > 0x20 && c.codePointAt(0) !== 0x7f));
let covered;
try {
  covered = new Set([...read('fonts/subset-chars.txt').replace(/\n$/, '')]);
} catch {
  console.error('找不到 fonts/subset-chars.txt。執行 python3 tools/subset-font.py 重新產生');
  process.exit(1);
}
const missing = [...needed].filter(c => !covered.has(c)).sort();
if (missing.length) {
  console.error(`有 ${missing.length} 個字沒收錄在字型子集：${missing.join('')}`);
  console.error('執行 python3 tools/subset-font.py 重新產生');
  process.exit(1);
}
console.log(`字型子集涵蓋全部 ${needed.size} 個用到的字（子集共 ${covered.size} 字）。`);
