#!/usr/bin/env node
// 檢查旅行資料：node tools/check-data.cjs [資料夾]（預設 data/）。
// 有錯誤結束代碼 1；只有提醒為 0。優惠券圖片路徑以「資料夾的上一層」為網站根目錄。
const fs = require('node:fs');
const path = require('node:path');
const { parseItinerary, parseChecklist, parseShops, parseCoupons } = require('../trip-data.js');

const dir = path.resolve(process.argv[2] || path.join(__dirname, '..', 'data'));
const siteRoot = path.dirname(dir);
const errors = [];
const warnings = [];
const read = name => {
  const file = path.join(dir, name);
  if (!fs.existsSync(file)) { errors.push(`${name}：找不到檔案。請建立 ${file}（空檔也可以）。`); return null; }
  return fs.readFileSync(file, 'utf8');
};
const lines = source => source.replace(/^﻿/, '').split(/\r?\n/);
// 逐行讀出紀錄，附原始行號；壞行略過（壞行由 parse 回報）。
const records = source => lines(source).flatMap((line, i) => {
  if (!line.trim()) return [];
  try { return [{ line: i + 1, value: JSON.parse(line) }]; } catch { return []; }
});
// 依錯誤訊息裡的行號、ID 或日期，找出資料所在的行。
function locate(source, message) {
  const direct = /第 (\d+) 行/.exec(message);
  if (direct) return Number(direct[1]);
  const token = /：(.+)$/.exec(message)?.[1] || /\d{4}-\d{2}-\d{2}/.exec(message)?.[0];
  if (!token) return null;
  const rows = lines(source);
  const first = rows.findIndex(row => row.includes(`"${token}"`));
  const second = message.includes('重複') && first >= 0 ? rows.findIndex((row, i) => i > first && row.includes(`"${token}"`)) : -1;
  const hit = second >= 0 ? second : first;
  return hit >= 0 ? hit + 1 : null;
}
function run(name, parser, hint) {
  const source = read(name);
  if (source === null) return null;
  try { return { source, data: parser(source) }; } catch (error) {
    const line = locate(source, error.message);
    errors.push(`${name}${line ? ` 第 ${line} 行` : ''}：${error.message}。${hint}`);
    return null;
  }
}

const fixHint = '請對照 data/FORMAT.md 修正該行。';
const itinerary = run('itinerary.jsonl', parseItinerary, fixHint);
const checklist = run('checklist.jsonl', parseChecklist, fixHint);
const shops = run('shops.jsonl', parseShops, fixHint);

// 優惠券：先檢查路徑寫法，再交給 parseCoupons，最後確認圖檔存在。
const couponSource = read('coupons.jsonl');
let coupons = null;
if (couponSource !== null) {
  let pathProblem = false;
  for (const { line, value } of records(couponSource)) {
    const image = value && value.image;
    if (typeof image !== 'string') continue;
    if (/^https?:\/\//i.test(image) || image.startsWith('//')) {
      errors.push(`coupons.jsonl 第 ${line} 行：圖片不可使用網址（${image}）。請把圖檔放進 assets/coupons/，改寫成 ./assets/coupons/檔名。`);
      pathProblem = true;
    } else if (image.startsWith('/')) {
      errors.push(`coupons.jsonl 第 ${line} 行：圖片路徑不可以 / 開頭（${image}）。請改成 ./assets/coupons/檔名，才能在 GitHub Pages 子路徑運作。`);
      pathProblem = true;
    }
  }
  if (!pathProblem) {
    const result = run('coupons.jsonl', parseCoupons, '圖片須是 ./assets/coupons/ 內的 png、jpg、webp、gif 或 svg。');
    if (result) {
      coupons = result.data;
      for (const { line, value } of records(couponSource)) {
        if (!fs.existsSync(path.join(siteRoot, value.image))) {
          errors.push(`coupons.jsonl 第 ${line} 行：找不到圖片 ${value.image}。請把圖檔放到 ${path.join(siteRoot, path.dirname(value.image))}，或修正檔名。`);
        }
      }
    }
  }
}

// 行程與店家提醒（不是錯誤）。
if (itinerary) {
  const rows = records(itinerary.source);
  let previous = null;
  for (const day of itinerary.data.days) {
    const at = rows.find(row => row.value.date === day.date)?.line;
    const where = `itinerary.jsonl${at ? ` 第 ${at} 行` : ''}`;
    if (!day.items.length) warnings.push(`${where}：${day.date} 沒有任何行程項目。`);
    const missing = day.items.filter(item => !item.coordinates).length;
    if (missing) warnings.push(`${where}：${day.date} 有 ${missing} 個項目沒有座標，地圖不會顯示圖釘。`);
    const time = Date.parse(day.date);
    if (previous !== null && time - previous > 86400000) {
      warnings.push(`${where}：${day.date} 與前一天之間缺 ${Math.round((time - previous) / 86400000) - 1} 天。若是刻意安排可忽略。`);
    }
    previous = time;
  }
}
if (shops) {
  const rows = records(shops.source);
  for (const group of shops.data) {
    if (!group.shops.length) warnings.push(`shops.jsonl 第 ${rows.find(row => row.value.id === group.id)?.line ?? '?'} 行：群組「${group.title}」沒有店家。`);
  }
}

// 輸出。
console.log(`檢查資料夾：${path.relative(process.cwd(), dir) || '.'}`);
for (const message of errors) console.log(`錯誤  ${message}`);
for (const message of warnings) console.log(`提醒  ${message}`);
console.log('--- 摘要 ---');
if (itinerary) {
  const items = itinerary.data.days.flatMap(day => day.items);
  console.log(`旅程：${itinerary.data.trip.title}，${itinerary.data.days.length} 天，${items.length} 個項目（${items.filter(item => item.coordinates).length} 個有座標）`);
}
if (checklist) console.log(`行前清單：${checklist.data.length} 項`);
if (shops) console.log(`精選店家：${shops.data.length} 個群組、${shops.data.reduce((sum, group) => sum + group.shops.length, 0)} 家店`);
if (coupons) console.log(`優惠券：${coupons.length} 張`);
console.log(errors.length ? `結果：${errors.length} 個錯誤、${warnings.length} 個提醒，請修正後再合併。` : `結果：沒有錯誤，${warnings.length} 個提醒。`);
process.exit(errors.length ? 1 : 0);
