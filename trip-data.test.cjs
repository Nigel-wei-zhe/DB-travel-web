const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { parseItinerary, parseChecklist, defaultSelection, today } = require('./trip-data.js');
const { parseShops } = require('./trip-data.js');
const { parseCoupons } = require('./trip-data.js');
const itinerary = fs.readFileSync('data/itinerary.jsonl', 'utf8');
const checklist = fs.readFileSync('data/checklist.jsonl', 'utf8');
test('sample files load with sorted dates and stable item IDs', () => {
  const journey = parseItinerary('\uFEFF' + itinerary.replaceAll('\n', '\r\n') + '\n');
  assert.equal(journey.days.length, 5);
  assert.equal(journey.days[0].items[0].id, 'day1-airport');
  assert.equal(parseChecklist(checklist).length, 8);
});
test('selection follows destination date before, during and after travel', () => {
  const { days } = parseItinerary(itinerary);
  assert.equal(defaultSelection(days, '2026-11-11'), 'pretrip');
  assert.equal(defaultSelection(days, '2026-11-14'), '2026-11-14');
  assert.equal(defaultSelection(days, '2026-11-20'), '2026-11-16');
  assert.equal(today('Asia/Tokyo', new Date('2026-11-11T15:30:00Z')), '2026-11-12');
});
test('invalid dates and duplicated IDs are rejected', () => {
  assert.throws(() => parseItinerary(itinerary.replace('2026-11-12', '2026-02-30')), /有效/);
  assert.throws(() => parseItinerary(itinerary.replace('day1-asakusa', 'day1-airport')), /ID 重複/);
  assert.throws(() => parseChecklist(checklist.replace('tickets', 'passport')), /ID 重複/);
});
test('malformed JSONL reports its original line number', () => {
  assert.throws(() => parseChecklist('\n{"id":'), /第 2 行/);
});
test('optional fields and empty daily schedules are accepted', () => {
  const { days } = parseItinerary(itinerary);
  assert.deepEqual(days[3].items, []);
  assert.equal(parseChecklist('{"id":"one","group":"物品","title":"<script>文字</script>"}')[0].title, '<script>文字</script>');
});
test('shop groups accept empty lists and populated groups', () => {
  const sample = parseShops(fs.readFileSync('data/shops.jsonl', 'utf8'));
  assert.equal(sample.length, 3);
  assert.equal(sample.flatMap(group => group.shops).length, 6);
  assert.equal(sample[0].title, '東京・表參道');
  assert.deepEqual(sample[0].shops[0].tags, ['咖啡', '甜點']);
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
  assert.equal(parseCoupons(fs.readFileSync('data/coupons.jsonl', 'utf8'))[0].image, './assets/coupons/sample.svg');
  assert.deepEqual(parseCoupons(''), []);
});
test('coupon records reject remote images and duplicate IDs', () => {
  const record = { id: 'one', shop: '店家', image: './assets/coupons/a.png', alt: '優惠券' };
  assert.throws(() => parseCoupons(JSON.stringify({ ...record, image: 'https://example.com/a.png' })), /資料夾/);
  assert.throws(() => parseCoupons([record, record].map(JSON.stringify).join('\n')), /ID 重複/);
});

test('destination coordinates and optional subtitle are validated', () => {
  assert.equal(parseItinerary(itinerary).trip.destination.name, '福岡');
  assert.throws(() => parseItinerary(itinerary.replace('33.5902', '133.5902')), /目的地/);
  assert.throws(() => parseItinerary(itinerary.replace('130.4017', '230.4017')), /目的地/);
  assert.throws(() => parseItinerary(itinerary.replace('"country":"日本"', '"country":""')), /目的地/);
});

test('itinerary map coordinates accept zero and reject missing or out-of-range values', () => {
  const source = fs.readFileSync('data/itinerary.jsonl', 'utf8');
  const records = source.trim().split(/\r?\n/).map(JSON.parse);
  const item = records[1].items[0];
  const encode = () => records.map(row => JSON.stringify(row)).join('\n');
  item.coordinates = { latitude: 0, longitude: 0 };
  assert.doesNotThrow(() => parseItinerary(encode()));
  for (const value of [null, {}, { latitude: 91, longitude: 0 }, { latitude: 0, longitude: -181 }, { latitude: '35', longitude: 139 }]) {
    item.coordinates = value;
    assert.throws(() => parseItinerary(encode()), /座標/);
  }
});