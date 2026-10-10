(function (root) {
  function create(storage) {
    let key, allowed = new Set(), visited = new Set(), persistent = true;
    return {
      configure(journey) {
        const nextKey = `tabi-visited:${encodeURIComponent(journey.trip.id)}`;
        allowed = new Set(journey.days.flatMap(day => day.items.map(item => item.id)));
        if (nextKey === key) return;
        key = nextKey;
        visited = new Set();
        persistent = true;
        try {
          const saved = JSON.parse(storage.getItem(key) || '[]');
          if (Array.isArray(saved)) visited = new Set(saved.filter(id => allowed.has(id)));
        } catch { persistent = false; }
      },
      has(id) { return visited.has(id); },
      toggle(id) {
        if (!key || !allowed.has(id)) throw Error('無效的蓋章項目');
        if (visited.has(id)) visited.delete(id); else visited.add(id);
        try { storage.setItem(key, JSON.stringify([...visited])); persistent = true; }
        catch { persistent = false; }
        return visited.has(id);
      },
      get persistent() { return persistent; }
    };
  }
  if (typeof module === 'object' && module.exports) module.exports = { create };
  else root.TripVisits = create({ getItem: key => root.localStorage.getItem(key), setItem: (key, value) => root.localStorage.setItem(key, value) });
})(typeof window === 'object' ? window : globalThis);
