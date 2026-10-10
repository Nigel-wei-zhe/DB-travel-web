(() => {
  const $ = selector => document.querySelector(selector);
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  let journey, map, layer, tiles, loading = false;
  let tileTimer;
  const markers = new Map();
  const names = { transport: '交通', sightseeing: '景點', food: '飲食', shopping: '購物', stay: '住宿', other: '其他' };
  const route = () => location.hash.split('/');
  const active = () => route()[0] === '#map';
  const places = () => journey.days.flatMap(day => day.items.map(item => ({ ...item, date: day.date })));
  const chosenDate = () => journey.days.some(day => day.date === route()[1]) ? route()[1] : 'all';
  function status(message, retry = false) {
    $('#map-status').textContent = message;
    $('#map-retry').hidden = !retry;
  }
  function navigation(item) {
    const link = el('a', 'stop-map', '導航');
    link.append(HandDrawnIcons.create('pin'));
    const query = item.mapQuery || `${item.coordinates.latitude},${item.coordinates.longitude}`;
    link.href = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(query)}`;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.setAttribute('aria-label', `用 Google 地圖導航至${item.title}`);
    return link;
  }
  function fit() {
    const pins = [...markers.values()].map(marker => marker.getLatLng());
    if (pins.length) map.fitBounds(pins, { padding: [32, 32], maxZoom: 15, animate: false });
  }
  function initMap() {
    if (map) return;
    if (!window.L) throw Error('地圖程式未載入，請重新整理頁面。');
    const center = journey.trip.destination || journey.days[0].location;
    map = L.map('travel-map', { zoomControl: false }).setView([center.latitude, center.longitude], 11);
    L.control.zoom({ position: 'bottomright', zoomInTitle: '放大地圖', zoomOutTitle: '縮小地圖' }).addTo(map);
    map.on('popupopen', event => {
      const close = event.popup.getElement().querySelector('.leaflet-popup-close-button');
      close.setAttribute('aria-label', '關閉地點資訊');
      close.title = '關閉地點資訊';
    });
    tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors'
    });
    tiles.on('loading', () => {
      clearTimeout(tileTimer);
      status('正在載入底圖…');
      tileTimer = setTimeout(() => status('底圖載入較慢，請檢查網路後重試。', true), 12000);
    });
    tiles.on('tileerror', () => {
      tiles.hasError = true;
      status('部分底圖載入失敗，請檢查網路後重試；仍可使用下方地點導航。', true);
    });
    tiles.on('load', () => {
      clearTimeout(tileTimer);
      if (!tiles.hasError) status('');
    });
    tiles.addTo(map);
    layer = L.layerGroup().addTo(map);
  }
  function focus(id) {
    const marker = markers.get(id);
    if (marker) {
      map.setView(marker.getLatLng(), 16, { animate: false });
      marker.openPopup();
      $('#travel-map').scrollIntoView({ block: 'start' });
    }
  }
  function render() {
    if (!journey || !active()) return;
    if (window.TripVisits) TripVisits.configure(journey);
    initMap();
    map.invalidateSize();
    const date = chosenDate();
    const all = places();
    const selected = all.filter(item => date === 'all' || item.date === date);
    const pins = selected.filter(item => item.coordinates);
    $('#map-days').replaceChildren();
    for (const value of ['all', ...journey.days.map(day => day.date)]) {
      const count = all.filter(item => item.coordinates && (value === 'all' || item.date === value)).length;
      const label = value === 'all' ? '全部' : `${Number(value.slice(5, 7))}/${Number(value.slice(8))}`;
      const button = el('button', 'date-chip', `${label} · ${count}`);
      button.type = 'button';
      button.setAttribute('aria-pressed', String(value === date));
      button.addEventListener('click', () => { location.hash = value === 'all' ? '#map' : `#map/${value}`; });
      $('#map-days').append(button);
    }
    const missing = selected.length - pins.length;
    $('#map-summary').textContent = `${date === 'all' ? '全部日期' : date} · ${pins.length} 個圖釘${missing ? ` · ${missing} 項未設定座標` : ''}`;
    $('#map-fit').disabled = !pins.length;
    layer.clearLayers();
    markers.clear();
    $('#map-places').replaceChildren();
    if (!selected.length) $('#map-places').append(el('p', 'journey-empty card', '當日尚無行程地點。'));
    selected.forEach((item, index) => {
      const label = `${item.date.slice(5).replace('-', '/')} ${item.time || '彈性'} · ${names[item.category] || '其他'}`;
      if (item.coordinates) {
        const pin = el('span', `map-pin pin-${item.category || 'other'}`, String(index + 1));
        if (window.TripVisits?.has(item.id)) pin.className += ' is-visited';
        const marker = L.marker([item.coordinates.latitude, item.coordinates.longitude], {
          title: item.title, alt: item.title,
          icon: L.divIcon({ className: 'map-pin-wrap', html: pin, iconSize: [44, 44], iconAnchor: [22, 44] })
        });
        const popup = el('div', 'map-popup');
        popup.append(el('p', 'map-meta', label), el('h3', '', item.title));
        if (item.note) popup.append(el('p', '', item.note));
        popup.append(navigation(item));
        marker.bindPopup(popup, { maxWidth: 240, autoPanPadding: [25, 25] });
        marker.addTo(layer);
        marker.getElement().setAttribute('aria-label', item.title);
        markers.set(item.id, marker);
      }
      const row = el('article', 'map-place card');
      row.append(el('p', 'map-meta', label), el('h3', '', item.title));
      if (window.TripVisits?.has(item.id)) row.append(el('p', 'map-meta visit-label', '已蓋章'));
      const actions = el('div', 'map-place-actions');
      if (item.coordinates) {
        const button = el('button', '', '看圖釘');
        button.type = 'button';
        button.setAttribute('aria-label', `在地圖查看${item.title}`);
        button.addEventListener('click', () => focus(item.id));
        actions.append(button);
      } else row.append(el('p', 'map-meta', '尚未設定地點座標'));
      if (item.mapQuery || item.coordinates) actions.append(navigation(item));
      row.append(actions);
      $('#map-places').append(row);
    });
    fit();
    let id;
    try { id = decodeURIComponent(route()[2] || ''); } catch { id = ''; }
    if (id) focus(id);
  }
  async function open() {
    if (!active() || loading) return;
    if (journey) {
      try { render(); } catch (error) { status(error.message, true); }
      return;
    }
    loading = true;
    status('正在載入行程地點…');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch('./data/itinerary.jsonl', { cache: 'no-cache', signal: controller.signal });
      if (!response.ok) throw Error('無法讀取行程資料。');
      journey = TripData.parseItinerary(await response.text());
      status('');
      render();
    } catch (error) {
      status(`地圖載入失敗：${error.name === 'AbortError' ? '連線逾時，請重試。' : error.message}`, true);
    } finally { clearTimeout(timer); loading = false; }
  }
  $('#map-fit').addEventListener('click', fit);
  $('#map-retry').addEventListener('click', () => {
    if (!map) { open(); return; }
    tiles.hasError = false;
    tiles.redraw();
  });
  window.addEventListener('hashchange', open);
  window.addEventListener('offline', () => { if (active()) status('目前沒有網路，底圖可能無法顯示；恢復連線後可重新載入。', true); });
  window.addEventListener('online', () => { if (active()) { if (tiles) { tiles.hasError = false; tiles.redraw(); } else open(); } });
  open();
})();
