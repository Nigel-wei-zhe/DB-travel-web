'use strict';

const TripData = require('../trip-data.js');

const HEADERS = {
  trip: ['trip_id', 'trip_title', 'timezone', 'currency', 'subtitle', 'destination_name', 'destination_country', 'destination_latitude', 'destination_longitude'],
  itinerary: ['date', 'day_title', 'location_name', 'location_latitude', 'location_longitude', 'item_id', 'item_time', 'item_title', 'item_category', 'item_note', 'item_map_query', 'item_latitude', 'item_longitude'],
  shops: ['group_id', 'group_title', 'shop_id', 'shop_name', 'shop_tags', 'shop_note', 'shop_map_query'],
};
const COLUMN_NAMES = {
  trip: ['旅程ID', '旅程名稱', '時區', '貨幣', '副標題', '目的地名稱', '目的地國家', '目的地緯度', '目的地經度'],
  itinerary: ['日期', '當日標題', '當日地點', '當日緯度', '當日經度', '行程ID', '時間', '行程名稱', '分類', '備註', '地圖搜尋文字', '行程緯度', '行程經度'],
  shops: ['區域ID', '區域名稱', '店家ID', '店家名稱', '類型標籤', '備註', '地圖搜尋文字'],
};

function text(value) { return String(value ?? '').trim(); }

function readRows(values, sheet) {
  if (!Array.isArray(values) || !values.length) throw Error(`${sheet} 工作表沒有欄名`);
  const expected = HEADERS[sheet];
  const columnNames = COLUMN_NAMES[sheet];
  const header = values[0].map(text);
  header[0] = header[0]?.replace(/^\uFEFF/, '');
  if (header.length !== columnNames.length || header.some((cell, i) => cell !== columnNames[i])) {
    throw Error(`${sheet} 工作表欄名或順序與 templates/${sheet}.csv 不一致`);
  }
  return values.slice(1).flatMap((cells, index) => {
    if (!Array.isArray(cells)) throw Error(`${sheet} 第 ${index + 2} 列格式錯誤`);
    if (cells.slice(expected.length).some(cell => text(cell))) throw Error(`${sheet} 第 ${index + 2} 列有額外資料欄`);
    const row = Object.fromEntries(expected.map((key, i) => [key, text(cells[i])]));
    return Object.values(row).every(value => !value) ? [] : [{ ...row, line: index + 2 }];
  });
}

function required(row, keys, sheet) {
  for (const key of keys) if (!row[key]) throw Error(`${sheet} 第 ${row.line} 列缺少 ${key}`);
}

function coordinates(row, latitudeKey, longitudeKey, sheet, needed = false) {
  const latitude = row[latitudeKey];
  const longitude = row[longitudeKey];
  if (!latitude && !longitude && !needed) return undefined;
  if (!latitude || !longitude) throw Error(`${sheet} 第 ${row.line} 列座標須同時填緯度與經度`);
  const result = { latitude: Number(latitude), longitude: Number(longitude) };
  if (!Number.isFinite(result.latitude) || Math.abs(result.latitude) > 90 || !Number.isFinite(result.longitude) || Math.abs(result.longitude) > 180) {
    throw Error(`${sheet} 第 ${row.line} 列座標無效`);
  }
  return result;
}

function optional(row, key, target, name) {
  if (row[key]) target[name] = row[key];
}

function buildTrip(rows) {
  if (rows.length !== 1) throw Error('trip 工作表須恰有一列旅行設定');
  const row = rows[0];
  required(row, ['trip_id', 'trip_title', 'timezone', 'currency'], 'trip');
  const trip = { type: 'trip', id: row.trip_id, title: row.trip_title, timezone: row.timezone, currency: row.currency };
  optional(row, 'subtitle', trip, 'subtitle');
  const destinationKeys = ['destination_name', 'destination_country', 'destination_latitude', 'destination_longitude'];
  if (destinationKeys.some(key => row[key])) {
    required(row, destinationKeys, 'trip');
    trip.destination = { name: row.destination_name, country: row.destination_country,
      ...coordinates(row, 'destination_latitude', 'destination_longitude', 'trip', true) };
  }
  return trip;
}

function buildDays(rows) {
  if (!rows.length) throw Error('itinerary 工作表至少需要一天');
  const groups = new Map();
  for (const row of rows) {
    required(row, ['date', 'day_title', 'location_name', 'location_latitude', 'location_longitude'], 'itinerary');
    const location = { name: row.location_name, ...coordinates(row, 'location_latitude', 'location_longitude', 'itinerary', true) };
    let group = groups.get(row.date);
    if (!group) {
      group = { type: 'day', date: row.date, title: row.day_title, location, items: [], empty: false };
      groups.set(row.date, group);
    } else if (group.title !== row.day_title || JSON.stringify(group.location) !== JSON.stringify(location)) {
      throw Error(`itinerary 第 ${row.line} 列與同日標題或地點不一致`);
    }
    const itemKeys = HEADERS.itinerary.slice(5);
    if (itemKeys.every(key => !row[key])) {
      if (group.empty || group.items.length) throw Error(`itinerary 第 ${row.line} 列的空白行程與同日其他列衝突`);
      group.empty = true;
      continue;
    }
    if (group.empty) throw Error(`itinerary 第 ${row.line} 列的行程與同日空白列衝突`);
    required(row, ['item_id', 'item_title'], 'itinerary');
    const item = { id: row.item_id, title: row.item_title };
    optional(row, 'item_time', item, 'time');
    optional(row, 'item_category', item, 'category');
    optional(row, 'item_note', item, 'note');
    optional(row, 'item_map_query', item, 'mapQuery');
    const point = coordinates(row, 'item_latitude', 'item_longitude', 'itinerary');
    if (point) item.coordinates = point;
    group.items.push(item);
  }
  return [...groups.values()].map(({ empty, ...day }) => day).sort((a, b) => a.date.localeCompare(b.date));
}

function buildShops(rows) {
  const groups = new Map();
  for (const row of rows) {
    required(row, ['group_id', 'group_title'], 'shops');
    let group = groups.get(row.group_id);
    if (!group) {
      group = { id: row.group_id, title: row.group_title, shops: [], empty: false };
      groups.set(row.group_id, group);
    } else if (group.title !== row.group_title) {
      throw Error(`shops 第 ${row.line} 列與同群組名稱不一致`);
    }
    const shopKeys = HEADERS.shops.slice(2);
    if (shopKeys.every(key => !row[key])) {
      if (group.empty || group.shops.length) throw Error(`shops 第 ${row.line} 列的空白店家與同群組其他列衝突`);
      group.empty = true;
      continue;
    }
    if (group.empty) throw Error(`shops 第 ${row.line} 列的店家與同群組空白列衝突`);
    required(row, ['shop_id', 'shop_name'], 'shops');
    const shop = { id: row.shop_id, name: row.shop_name };
    if (row.shop_tags) {
      shop.tags = row.shop_tags.split('|').map(text);
      if (shop.tags.some(tag => !tag)) throw Error(`shops 第 ${row.line} 列的標籤有空值`);
    }
    optional(row, 'shop_note', shop, 'note');
    optional(row, 'shop_map_query', shop, 'mapQuery');
    group.shops.push(shop);
  }
  return [...groups.values()].map(({ empty, ...group }) => group);
}

function convertSheets(sheets) {
  const trip = buildTrip(readRows(sheets.trip, 'trip'));
  const days = buildDays(readRows(sheets.itinerary, 'itinerary'));
  const shops = buildShops(readRows(sheets.shops, 'shops'));
  const itinerary = [trip, ...days].map(value => JSON.stringify(value)).join('\n') + '\n';
  const shopData = shops.map(value => JSON.stringify(value)).join('\n') + (shops.length ? '\n' : '');
  TripData.parseItinerary(itinerary);
  TripData.parseShops(shopData);
  return { itinerary, shops: shopData };
}

module.exports = { HEADERS, convertSheets };
