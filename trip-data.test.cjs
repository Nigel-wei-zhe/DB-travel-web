const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { parseItinerary, parseChecklist, defaultSelection, today } = require('./trip-data.js');
const { parseShops } = require('./trip-data.js');
const { parseCoupons } = require('./trip-data.js');
// 測試只讀固定範例，不讀會隨試算表同步變動的 data/。
const fixture = name => fs.readFileSync(`${__dirname}/test-fixtures/${name}.jsonl`, 'utf8');
const itinerary = fixture('itinerary');
const checklist = fixture('checklist');
// 先確認要改的文字真的存在，避免範例改動後替換落空、斷言默默失效。
const swap = (source, from, to) => {
  assert.ok(source.includes(from), `fixture 找不到：${from}`);
  return source.replace(from, to);
};
test('sample files load with sorted dates and stable item IDs', () => {
  const journey = parseItinerary('\uFEFF' + itinerary.replaceAll('\n', '\r\n') + '\n');
  // 範例檔刻意把最後一天寫在前面，解析後必須依日期排序。
  assert.deepEqual(journey.days.map(day => day.date), ['2026-11-12', '2026-11-13', '2026-11-14', '2026-11-16']);
  assert.equal(journey.days[0].items[0].id, 't1-gate');
  assert.ok(parseChecklist(checklist).length > 0);
});
test('selection follows destination date before, during and after travel', () => {
  const { days } = parseItinerary(itinerary);
  assert.equal(defaultSelection(days, '2026-11-11'), 'pretrip');
  assert.equal(defaultSelection(days, '2026-11-14'), '2026-11-14');
  assert.equal(defaultSelection(days, '2026-11-15'), '2026-11-14');
  assert.equal(defaultSelection(days, '2026-11-20'), '2026-11-16');
  assert.equal(today('Asia/Tokyo', new Date('2026-11-11T15:30:00Z')), '2026-11-12');
});
test('home preview shows first day before, today during and last day after travel', () => {
  const { previewDay } = require('./trip-data.js');
  const days = ['2026-11-21', '2026-11-22', '2026-11-24'].map(date => ({ date }));
  assert.equal(previewDay(days, '2026-10-15').date, '2026-11-21');
  assert.equal(previewDay(days, '2026-11-22').date, '2026-11-22');
  assert.equal(previewDay(days, '2026-11-23').date, '2026-11-22');
  assert.equal(previewDay(days, '2026-12-01').date, '2026-11-24');
});
test('invalid dates and duplicated IDs are rejected', () => {
  assert.throws(() => parseItinerary(swap(itinerary, '2026-11-12', '2026-02-30')), /有效/);
  assert.throws(() => parseItinerary(swap(itinerary, 't1-lunch', 't1-gate')), /ID 重複/);
  assert.throws(() => parseChecklist(swap(checklist, 'tickets', 'passport')), /ID 重複/);
});
test('malformed JSONL reports its original line number', () => {
  assert.throws(() => parseChecklist('\n{"id":'), /第 2 行/);
});
test('optional fields and empty daily schedules are accepted', () => {
  const { days } = parseItinerary(itinerary);
  assert.deepEqual(days[2].items, []);
  assert.equal(parseChecklist('{"id":"one","group":"物品","title":"<script>文字</script>"}')[0].title, '<script>文字</script>');
});
test('shop groups accept empty lists and populated groups', () => {
  const sample = parseShops(fixture('shops'));
  assert.deepEqual(sample[0].shops[0].tags, ['咖啡', '甜點']);
  assert.deepEqual(sample[1].shops, []);
  assert.deepEqual(parseShops('{"id":"empty","title":"空群組","shops":[]}')[0].shops, []);
  const groups = parseShops('{"id":"food","title":"餐廳","shops":[{"id":"one","name":"店家","mapQuery":"東京 店家"}]}');
  assert.equal(groups[0].shops[0].name, '店家');
});
test('duplicate shop IDs and malformed groups are rejected', () => {
  assert.throws(() => parseShops('{"id":"food","title":"餐廳","shops":[{"id":"one","name":"A"},{"id":"one","name":"B"}]}'), /ID 重複/);
  assert.throws(() => parseShops('{"id":"food","title":"餐廳"}'), /shops/);
  assert.throws(() => parseShops('{"id":"area","title":"東京","shops":[{"id":"one","name":"A","tags":"咖啡"}]}'), /tags/);
});
test('coupon records load local images and allow an empty gallery', () => {
  assert.equal(parseCoupons(fixture('coupons'))[0].image, './assets/coupons/sample.svg');
  assert.deepEqual(parseCoupons(''), []);
});
test('coupon records reject remote images and duplicate IDs', () => {
  const record = { id: 'one', shop: '店家', image: './assets/coupons/a.png', alt: '優惠券' };
  assert.throws(() => parseCoupons(JSON.stringify({ ...record, image: 'https://example.com/a.png' })), /資料夾/);
  assert.throws(() => parseCoupons([record, record].map(JSON.stringify).join('\n')), /ID 重複/);
});

test('destination coordinates and optional subtitle are validated', () => {
  const { trip } = parseItinerary(itinerary);
  assert.equal(trip.destination.latitude, 33.5902);
  assert.equal(trip.subtitle, '測試副標題');
  assert.throws(() => parseItinerary(swap(itinerary, '33.5902', '133.5902')), /目的地/);
  assert.throws(() => parseItinerary(swap(itinerary, '130.4017', '230.4017')), /目的地/);
  assert.throws(() => parseItinerary(swap(itinerary, '"country":"測試國"', '"country":""')), /目的地/);
  assert.throws(() => parseItinerary(swap(itinerary, '"subtitle":"測試副標題"', '"subtitle":" "')), /副標題/);
  assert.doesNotThrow(() => parseItinerary(swap(itinerary, ',"subtitle":"測試副標題"', '')));
});

test('itinerary map coordinates accept zero and reject missing or out-of-range values', () => {
  const records = itinerary.trim().split(/\r?\n/).map(JSON.parse);
  const item = records[1].items[0];
  const encode = () => records.map(row => JSON.stringify(row)).join('\n');
  item.coordinates = { latitude: 0, longitude: 0 };
  assert.doesNotThrow(() => parseItinerary(encode()));
  for (const value of [null, {}, { latitude: 91, longitude: 0 }, { latitude: 0, longitude: -181 }, { latitude: '35', longitude: 139 }]) {
    item.coordinates = value;
    assert.throws(() => parseItinerary(encode()), /座標/);
  }
});