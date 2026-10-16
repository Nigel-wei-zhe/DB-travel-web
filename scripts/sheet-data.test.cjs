'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { HEADERS, convertSheets } = require('./sheet-data.cjs');
const { parseCsv, spreadsheetIdFromUrl } = require('./sync-google-sheets.cjs');

const names = {
  trip: '旅程ID,旅程名稱,時區,貨幣,副標題,目的地名稱,目的地國家,目的地緯度,目的地經度',
  itinerary: '日期,當日標題,當日地點,當日緯度,當日經度,行程ID,時間,行程名稱,分類,備註,地圖搜尋文字,行程緯度,行程經度',
  shops: '區域ID,區域名稱,店家ID,店家名稱,類型標籤,備註,地圖搜尋文字',
};

function row(sheet, values = {}) {
  return HEADERS[sheet].map(key => values[key] ?? '');
}

function sample() {
  return {
    trip: [names.trip.split(','), row('trip', { trip_id: 'kyushu-2026', trip_title: '九州家族旅行', timezone: 'Asia/Tokyo', currency: 'JPY', destination_name: '福岡', destination_country: '日本', destination_latitude: '33.59', destination_longitude: '130.40' })],
    itinerary: [names.itinerary.split(','), row('itinerary', { date: '2026-11-12', day_title: '抵達', location_name: '福岡', location_latitude: '33.59', location_longitude: '130.40', item_id: 'airport', item_time: '09:05', item_title: '機場', item_category: 'transport', item_note: '第一行\n第二行', item_map_query: '福岡機場', item_latitude: '33.585', item_longitude: '130.45' }), row('itinerary', { date: '2026-11-13', day_title: '自由活動', location_name: '福岡', location_latitude: '33.59', location_longitude: '130.40' })],
    shops: [names.shops.split(','), row('shops', { group_id: 'hakata', group_title: '博多', shop_id: 'cafe', shop_name: '咖啡店', shop_tags: '咖啡|甜點', shop_note: '備註' })],
  };
}

test('三份範本的中文欄名與同步程式一致', () => {
  for (const [sheet, header] of Object.entries(names)) {
    const source = fs.readFileSync(path.join(__dirname, '..', 'templates', `${sheet}.csv`), 'utf8');
    assert.equal(source, `${header}\n`);
  }
});

test('中文欄名、空白日期、座標和標籤可轉成網站資料', () => {
  const result = convertSheets(sample());
  const days = result.itinerary.trim().split('\n').map(JSON.parse);
  const shops = result.shops.trim().split('\n').map(JSON.parse);
  assert.equal(days[0].destination.name, '福岡');
  assert.deepEqual(days[1].items[0].coordinates, { latitude: 33.585, longitude: 130.45 });
  assert.equal(days[1].items[0].note, '第一行\n第二行');
  assert.deepEqual(days[2].items, []);
  assert.deepEqual(shops[0].shops[0].tags, ['咖啡', '甜點']);
});

test('錯誤欄名、衝突空白列和缺半邊座標會阻止同步', () => {
  const wrongHeader = sample();
  wrongHeader.itinerary[0][0] = 'date';
  assert.throws(() => convertSheets(wrongHeader), /欄名/);
  const conflict = sample();
  conflict.itinerary.push(row('itinerary', { date: '2026-11-13', day_title: '自由活動', location_name: '福岡', location_latitude: '33.59', location_longitude: '130.40', item_id: 'extra', item_title: '散步' }));
  assert.throws(() => convertSheets(conflict), /衝突/);
  const point = sample();
  point.itinerary[1][12] = '';
  assert.throws(() => convertSheets(point), /座標須同時填/);
});

test('CSV 可處理引號、逗號和儲存格內換行', () => {
  assert.deepEqual(parseCsv('甲,乙\r\n"a,b","兩行\n文字"\r\n"雙""引號",3\r\n'), [['甲', '乙'], ['a,b', '兩行\n文字'], ['雙"引號', '3']]);
  assert.throws(() => parseCsv('"未結束'), /引號未結束/);
});

test('countChanges 統計行程項目與店家的新增、修改、刪除', () => {
  const { countChanges, deletionProblems } = require('./sheet-data.cjs');
  const day = items => JSON.stringify({ type: 'day', date: '2026-11-12', items }) + '\n';
  const group = shops => JSON.stringify({ id: 'g', title: 'G', shops }) + '\n';
  const before = {
    itinerary: day([{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }, { id: 'c', title: 'C' }]),
    shops: group([{ id: 's1', name: 'S1' }, { id: 's2', name: 'S2' }]),
  };
  const after = {
    itinerary: day([{ id: 'a', title: 'A2' }, { id: 'c', title: 'C' }, { id: 'd', title: 'D' }]),
    shops: group([{ id: 's1', name: 'S1' }]),
  };
  const counts = countChanges(before, after);
  assert.deepEqual(counts.items, { before: 3, after: 3, added: 1, changed: 1, removed: 1 });
  assert.deepEqual(counts.shops, { before: 2, after: 1, added: 0, changed: 0, removed: 1 });
  assert.deepEqual(deletionProblems(counts), []);
  assert.deepEqual(countChanges(before, before).items, { before: 3, after: 3, added: 0, changed: 0, removed: 0 });
  assert.equal(countChanges({ itinerary: '', shops: '' }, before).items.added, 3);
});

test('deletionProblems 依筆數與比例判斷大量刪除', () => {
  const { deletionProblems } = require('./sheet-data.cjs');
  const c = (before, removed) => ({ before, after: before - removed, added: 0, changed: 0, removed });
  assert.equal(deletionProblems({ items: c(100, 10), shops: c(5, 1) }).length, 0);
  assert.equal(deletionProblems({ items: c(100, 11), shops: c(5, 0) }).length, 1);
  assert.equal(deletionProblems({ items: c(10, 3), shops: c(10, 2) }).length, 1);
  assert.equal(deletionProblems({ items: c(100, 0), shops: c(10, 3) }).length, 1);
});

test('只接受 Google 試算表網址', () => {
  assert.equal(spreadsheetIdFromUrl('https://docs.google.com/spreadsheets/d/abc-123_X/edit#gid=0'), 'abc-123_X');
  assert.throws(() => spreadsheetIdFromUrl('https://example.com/spreadsheets/d/abc/edit'), /不是有效/);
});
