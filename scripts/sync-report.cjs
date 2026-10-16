'use strict';

// 同步後比對 git HEAD（dev）與工作目錄的資料，輸出變動統計與摘要。
// 用法：node scripts/sync-report.cjs <摘要輸出檔> [--allow-delete]
// 結束代碼：0 正常（含無變動）、2 刪除量超過門檻且未允許（門檻見 sheet-data.cjs）。
// 是否有變動寫入 GITHUB_OUTPUT 的 changed=true/false。

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { countChanges, deletionProblems } = require('./sheet-data.cjs');

const FILES = ['data/itinerary.jsonl', 'data/shops.jsonl'];

function gitShow(file) {
  try { return execFileSync('git', ['show', `HEAD:${file}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); }
  catch { return ''; }
}

function row(label, c) {
  return `| ${label} | ${c.before} → ${c.after} | ${c.added} | ${c.changed} | ${c.removed} |`;
}

function write(file, lines) { if (file) fs.writeFileSync(file, lines.join('\n') + '\n', 'utf8'); }
function setOutput(key, value) { if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`); }

function main() {
  const args = process.argv.slice(2);
  const summaryPath = args.find(arg => !arg.startsWith('--'));
  const allowDelete = args.includes('--allow-delete');
  const root = path.join(__dirname, '..');
  const before = { itinerary: gitShow(FILES[0]), shops: gitShow(FILES[1]) };
  const after = {
    itinerary: fs.readFileSync(path.join(root, FILES[0]), 'utf8'),
    shops: fs.readFileSync(path.join(root, FILES[1]), 'utf8'),
  };
  const pairs = [[FILES[0], before.itinerary, after.itinerary], [FILES[1], before.shops, after.shops]];
  const changedFiles = pairs.filter(([, a, b]) => a !== b).map(([file]) => file);
  if (!changedFiles.length) {
    write(summaryPath, ['### 沒有變動', '', '試算表與 dev 的資料相同，沒有推送任何分支。']);
    setOutput('changed', 'false');
    return;
  }
  const counts = countChanges(before, after);
  const out = [
    '### 變動統計', '',
    '| 項目 | 筆數 | 新增 | 修改 | 刪除 |', '| --- | --- | --- | --- | --- |',
    row('行程項目', counts.items), row('店家', counts.shops), '',
    '變動的檔案：', ...changedFiles.map(file => `- \`${file}\``), '',
  ];
  const problems = deletionProblems(counts);
  setOutput('changed', 'true');
  if (problems.length && !allowDelete) {
    write(summaryPath, ['### 已停止：刪除量過大', '', ...problems.map(text => `- ${text}`), '',
      '若試算表內容正確，請重新執行並勾選「allow_delete」。本次沒有推送任何分支。', '', ...out]);
    process.stderr.write(`同步停止：${problems.join('；')}。確認試算表正確後，勾選 allow_delete 重新執行。\n`);
    process.exitCode = 2;
    return;
  }
  if (problems.length) out.push(`注意：已勾選 allow_delete，${problems.join('；')}。`, '');
  write(summaryPath, out);
}

main();
