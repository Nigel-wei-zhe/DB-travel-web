// 首頁行程預覽：讀取行程資料，顯示當天（出發前為第一天、結束後為最後一天）的前三項行程。
(() => {
  const section = document.querySelector('#home-preview');
  const link = document.querySelector('#home-preview-link');
  const LIMIT = 3;
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const dateFormat = new Intl.DateTimeFormat('zh-TW', { timeZone: 'UTC', month: 'long', day: 'numeric', weekday: 'long' });
  function mapLink(day, item) {
    if (!item.coordinates && !item.mapQuery) return null;
    const anchor = el('a');
    anchor.append(HandDrawnIcons.create('pin'));
    if (item.coordinates) {
      anchor.href = `#map/${day.date}/${encodeURIComponent(item.id)}`;
      anchor.setAttribute('aria-label', `在網站地圖查看${item.title}`);
    } else {
      anchor.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.mapQuery)}`;
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
      anchor.setAttribute('aria-label', `在 Google 地圖查看${item.title}`);
    }
    return anchor;
  }
  function render({ trip, days }) {
    const day = TripData.previewDay(days, TripData.today(trip.timezone));
    link.href = `#itinerary/${day.date}`;
    const heading = el('div', 'day-heading');
    const badge = el('div', 'day-badge', 'DAY');
    badge.append(el('span', '', String(days.indexOf(day) + 1).padStart(2, '0')));
    const words = el('div');
    const meta = el('p', '', `${dateFormat.format(new Date(day.date))} `);
    meta.append(el('span', '', day.location.name));
    words.append(el('h3', '', day.title), meta);
    heading.append(badge, words);
    section.setAttribute('aria-label', `第 ${days.indexOf(day) + 1} 天行程預覽`);
    if (!day.items.length) {
      section.replaceChildren(heading, el('p', 'data-note', '當日尚無行程。'));
      return;
    }
    const list = el('ol', 'timeline');
    for (const item of day.items.slice(0, LIMIT)) {
      const row = el('li');
      const copy = el('div');
      copy.append(el('h4', '', item.title));
      if (item.note) copy.append(el('p', '', item.note));
      row.append(el('time', '', item.time || '彈性'), copy);
      const anchor = mapLink(day, item);
      if (anchor) row.append(anchor);
      list.append(row);
    }
    section.replaceChildren(heading, list);
    if (day.items.length > LIMIT) {
      const more = el('a', 'preview-more', `看當天全部 ${day.items.length} 項行程`);
      more.href = `#itinerary/${day.date}`;
      section.append(more);
    }
  }
  async function load() {
    section.replaceChildren(el('p', 'data-note', '正在載入行程…'));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch('./data/itinerary.jsonl', { cache: 'no-cache', signal: controller.signal });
      if (!response.ok) throw Error();
      render(TripData.parseItinerary(await response.text()));
    } catch {
      const retry = el('button', 'back-home', '重新載入行程');
      retry.type = 'button';
      retry.addEventListener('click', load);
      section.replaceChildren(el('p', 'load-error', '行程暫時無法載入，請檢查網路後重試。'), retry);
    } finally {
      clearTimeout(timeout);
    }
  }
  load();
})();
