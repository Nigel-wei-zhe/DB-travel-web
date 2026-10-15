'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { convertSheets } = require('./sheet-data.cjs');

function spreadsheetIdFromUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw Error('sheet_url 不是有效的 Google 試算表網址'); }
  const match = /^\/spreadsheets\/d\/([A-Za-z0-9_-]+)(?:\/|$)/.exec(url.pathname);
  if (url.hostname !== 'docs.google.com' || !match) throw Error('sheet_url 不是有效的 Google 試算表網址');
  return match[1];
}

function parseCsv(source) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  let closed = false;
  const input = source.replace(/^\uFEFF/, '');
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') { field += '"'; i++; }
      else if (char === '"') { quoted = false; closed = true; }
      else field += char;
    } else if (char === ',' || char === '\n' || char === '\r') {
      row.push(field);
      field = '';
      closed = false;
      if (char !== ',') {
        rows.push(row);
        row = [];
        if (char === '\r' && input[i + 1] === '\n') i++;
      }
    } else if (char === '"' && !field && !closed) quoted = true;
    else if (closed || char === '"') throw Error('下載的 CSV 引號格式錯誤');
    else field += char;
  }
  if (quoted) throw Error('下載的 CSV 引號未結束');
  if (field || row.length || closed) rows.push([...row, field]);
  return rows;
}

async function sheetValues(spreadsheetId, name) {
  const url = new URL(`https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq`);
  url.searchParams.set('tqx', 'out:csv');
  url.searchParams.set('sheet', name);
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw Error(`${name} 工作表下載失敗（HTTP ${response.status}）`);
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('csv') && !contentType.includes('text/plain')) {
    throw Error(`${name} 回傳的不是 CSV；請確認試算表已設為知道連結者可檢視，且工作表名稱正確`);
  }
  return parseCsv(await response.text());
}

async function main() {
  const spreadsheetId = spreadsheetIdFromUrl(process.env.SHEET_URL || '');
  const [trip, itinerary, shops] = await Promise.all(['trip', 'itinerary', 'shops'].map(name => sheetValues(spreadsheetId, name)));
  const result = convertSheets({ trip, itinerary, shops });
  const dataDir = path.join(__dirname, '..', 'data');
  await fs.writeFile(path.join(dataDir, 'itinerary.jsonl'), result.itinerary, 'utf8');
  await fs.writeFile(path.join(dataDir, 'shops.jsonl'), result.shops, 'utf8');
  process.stdout.write('已驗證並更新行程與精選店家資料。\n');
}

if (require.main === module) main().catch(error => {
  process.stderr.write(`同步失敗：${error.message}\n`);
  process.exitCode = 1;
});

module.exports = { spreadsheetIdFromUrl, parseCsv };
