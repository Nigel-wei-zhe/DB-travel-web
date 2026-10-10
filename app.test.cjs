const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync('app.js', 'utf8');
const weather = {
  current: { temperature_2m: 18.4, weather_code: 61, is_day: 1, time: '2026-10-09T15:00' },
  daily: { time: ['2026-10-09'], temperature_2m_max: [21.2], temperature_2m_min: [14.4], precipitation_probability_max: [65] }
};
const rate = { base: 'JPY', quote: 'TWD', rate: 0.218, date: '2026-10-09' };
async function setup({ fail = false, invalid = false, cached = false, storageBlocked = false } = {}) {
  const nodes = new Map();
  const storage = new Map();
  let requests = 0;
  function node(selector) {
    if (!nodes.has(selector)) nodes.set(selector, {
      value: selector === '#amount' ? '1000' : '', textContent: '', handlers: {}, attributes: {},
      classList: { add() {}, remove() {} },
      addEventListener(type, handler) { this.handlers[type] = handler; },
      setAttribute(name, value) { this.attributes[name] = value; }
    });
    return nodes.get(selector);
  }
  if (cached) {
    for (const [name, data] of Object.entries({ weather, exchange: rate })) {
      storage.set(`tabi-${name}-v1`, JSON.stringify({ data, fetchedAt: Date.now() - 24 * 60 * 60 * 1000 }));
    }
  }
  const context = vm.createContext({
    document: { querySelector: node, querySelectorAll: () => [] },
    location: { hash: '#home' }, window: { scrollTo() {}, addEventListener() {} },
    localStorage: {
      getItem: key => { if (storageBlocked) throw Error('blocked'); return storage.get(key) || null; },
      setItem: (key, value) => { if (storageBlocked) throw Error('blocked'); storage.set(key, value); }
    },
    fetch: async url => {
      requests++;
      if (fail) throw Error('offline');
      return { ok: true, json: async () => invalid ? { rate: 0 } : url.includes('open-meteo') ? weather : rate };
    },
    URL, URLSearchParams, AbortController, setTimeout, clearTimeout, Intl, Date
  });
  vm.runInContext(source, context);
  await new Promise(resolve => setImmediate(resolve));
  return { node, context, requests: () => requests };
}
test('live responses update weather, forward conversion and reciprocal conversion', async () => {
  const { node } = await setup();
  assert.equal(node('#weather-temp').textContent, 18);
  assert.equal(node('#weather-rain').textContent, '65%');
  assert.match(node('#weather-description').textContent, /有雨/);
  assert.equal(node('#result').textContent, '218');
  node('#amount').value = '218';
  node('#swap').handlers.click();
  assert.equal(node('#result').textContent, '1,000');
  node('#amount').value = '-1';
  node('#amount').handlers.input();
  assert.equal(node('#result').textContent, '請輸入有效金額');
});
test('failed requests without cache never use sample rates and enable retry', async () => {
  const { node } = await setup({ fail: true });
  assert.match(node('#exchange-status').textContent, /暫時無法/);
  node('#amount').handlers.input();
  assert.equal(node('#result').textContent, '—');
  assert.equal(node('#exchange-refresh').disabled, false);
  assert.equal(node('#weather-description').textContent, '天氣暫時無法載入');
});
test('failed refresh uses explicitly labelled old cached data', async () => {
  const { node } = await setup({ fail: true, cached: true });
  assert.match(node('#exchange-status').textContent, /更新失敗，顯示舊資料/);
  assert.match(node('#weather-status').textContent, /上次刷新時間/);
  assert.equal(node('#result').textContent, '218');
});
test('invalid API payload is rejected', async () => {
  const { node } = await setup({ invalid: true });
  assert.match(node('#exchange-status').textContent, /暫時無法/);
  assert.match(node('#weather-status').textContent, /暫時無法/);
});
test('blocked storage does not break API rendering', async () => {
  const { node } = await setup({ storageBlocked: true });
  assert.equal(node('#result').textContent, '218');
});
test('fresh cache avoids network requests; manual refresh bypasses cache', async () => {
  const { context, requests } = await setup();
  assert.equal(requests(), 2);
  await vm.runInContext("loadData('exchange')", context);
  assert.equal(requests(), 2);
  await vm.runInContext("loadData('exchange', true)", context);
  assert.equal(requests(), 3);
});
