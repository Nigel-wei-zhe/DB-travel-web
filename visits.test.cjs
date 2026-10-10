const test = require('node:test');
const assert = require('node:assert/strict');
const { create } = require('./visits.js');
const journey = { trip: { id: 'test-trip' }, days: [{ items: [{ id: 'a' }, { id: 'b' }] }] };
function storage() { const values = new Map(); return { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) }; }
test('stamp toggle persists, survives reload, and can be undone', () => {
  const saved = storage();
  const first = create(saved); first.configure(journey);
  assert.equal(first.toggle('a'), true);
  const reload = create(saved); reload.configure(journey);
  assert.equal(reload.has('a'), true);
  assert.equal(reload.has('b'), false);
  assert.equal(reload.toggle('a'), false);
  const afterUndo = create(saved); afterUndo.configure(journey);
  assert.equal(afterUndo.has('a'), false);
});
test('stamps stay separate between trips and reject unknown IDs', () => {
  const visits = create(storage()); visits.configure(journey); visits.toggle('a');
  visits.configure({ ...journey, trip: { id: 'other-trip' } });
  assert.equal(visits.has('a'), false);
  assert.throws(() => visits.toggle('unknown'), /無效/);
  visits.configure(journey);
  assert.equal(visits.has('a'), true);
});
test('blocked storage keeps in-memory stamps and reports persistence failure', () => {
  const visits = create({ getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } });
  visits.configure(journey);
  assert.equal(visits.persistent, false);
  assert.equal(visits.toggle('a'), true);
  visits.configure(journey);
  assert.equal(visits.has('a'), true);
  assert.equal(visits.persistent, false);
});
test('malformed or stale saved IDs do not mark unrelated itinerary items', () => {
  for (const raw of ['{}', 'invalid', '["unknown", "a"]']) {
    const visits = create({ getItem: () => raw, setItem() {} }); visits.configure(journey);
    assert.equal(visits.has('unknown'), false);
    assert.equal(visits.has('a'), raw.includes('"a"'));
  }
});
