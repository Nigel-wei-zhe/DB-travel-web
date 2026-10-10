const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
async function setup({ fail = false, hash = '#map' } = {}) {
  class Node {
    constructor(tag) { this.tag = tag; this.children = []; this.attributes = {}; this.handlers = {}; }
    append(...nodes) { this.children.push(...nodes); }
    replaceChildren(...nodes) { this.children = nodes; }
    setAttribute(name, value) { this.attributes[name] = value; }
    addEventListener(name, handler) { this.handlers[name] = handler; }
    scrollIntoView() {}
  }
  const nodes = new Map();
  const node = key => { if (!nodes.has(key)) nodes.set(key, new Node(key)); return nodes.get(key); };
  const events = {};
  let pins = [], fits = [], focused, requests = 0;
  const map = { setView(point) { focused = point; return this; }, invalidateSize() {}, on() {}, fitBounds(bounds) { fits.push(bounds); } };
  const tile = { hasError: false, handlers: {}, on(name, handler) { this.handlers[name] = handler; return this; }, addTo() {}, redraw() { this.redraws = (this.redraws || 0) + 1; } };
  const layer = { addTo() { return this; }, clearLayers() { pins = []; } };
  const context = vm.createContext({
    document: { querySelector: node, createElement: tag => new Node(tag) },
    location: { hash }, window: { L: true, addEventListener: (name, handler) => { events[name] = handler; } },
    HandDrawnIcons: { create: () => new Node('svg') }, TripData: require('./trip-data.js'),
    L: { map: () => map, control: { zoom: () => ({ addTo() {} }) }, tileLayer: () => tile, layerGroup: () => layer, divIcon: value => value,
      marker: (point, options) => {
        const element = new Node('marker');
        const marker = { point, options, popup: null, opened: false, getLatLng: () => point, getElement: () => element,
          bindPopup(content) { this.popup = content; return this; }, addTo() { pins.push(this); }, openPopup() { this.opened = true; } };
        return marker;
      }
    },
    fetch: async () => { requests++; if (fail) throw Error('offline'); return { ok: true, text: async () => fs.readFileSync('data/itinerary.jsonl', 'utf8') }; },
    AbortController, setTimeout, clearTimeout
  });
  vm.runInContext(fs.readFileSync('maps.js', 'utf8'), context);
  await new Promise(resolve => setImmediate(resolve));
  return { node, context, events, tile, pins: () => pins, fits: () => fits, focused: () => focused, requests: () => requests };
}
test('map lazily loads and filters dates including an empty day', async () => {
  const state = await setup({ hash: '#home' });
  assert.equal(state.requests(), 0);
  state.context.location.hash = '#map';
  await state.events.hashchange();
  assert.equal(state.pins().length, 8);
  assert.match(state.node('#map-summary').textContent, /2 項未設定座標/);
  state.context.location.hash = '#map/2026-11-13';
  await state.events.hashchange();
  assert.equal(state.pins().length, 3);
  state.context.location.hash = '#map/2026-11-15';
  await state.events.hashchange();
  assert.equal(state.pins().length, 0);
  assert.equal(state.node('#map-fit').disabled, true);
  assert.match(state.node('#map-places').children[0].textContent, /尚無行程/);
});
test('map deep link opens the selected place and uses encoded navigation', async () => {
  const state = await setup({ hash: '#map/2026-11-12/day1-asakusa' });
  const pin = state.pins().find(value => value.options.title.includes('雷門'));
  assert.equal(pin.opened, true);
  assert.deepEqual(Array.from(state.focused()), [35.71111111, 139.79638889]);
  assert.match(pin.popup.children.at(-1).href, /^https:\/\/www.google.com\/maps\/dir\/\?api=1&destination=Kaminarimon%20Tokyo$/);
  state.tile.handlers.tileerror();
  assert.equal(state.node('#map-retry').hidden, false);
  state.node('#map-retry').handlers.click();
  assert.equal(state.tile.redraws, 1);
});
test('map data failure gives retry and never substitutes sample pins', async () => {
  const state = await setup({ fail: true });
  assert.equal(state.pins().length, 0);
  assert.match(state.node('#map-status').textContent, /載入失敗/);
  assert.equal(state.node('#map-retry').hidden, false);
});
