(() => {
  const filters = document.querySelector('#date-filters');
  const content = document.querySelector('#itinerary-content');
  let journey;
  let checklist = [];
  let checklistError = '';
  let checked = new Set();
  let storageAvailable = true;
  const categoryNames = { transport: '交通', sightseeing: '景點', food: '飲食', shopping: '購物', stay: '住宿', other: '其他' };
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const storageKey = () => `tabi-checklist:${encodeURIComponent(journey.trip.id)}`;
  function loadChecks() {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey()) || '[]');
      checked = new Set(Array.isArray(saved) ? saved.filter(id => typeof id === 'string') : []);
    } catch { storageAvailable = false; }
  }
  function progressText() {
    return `${checklist.filter(item => checked.has(item.id)).length} / ${checklist.length} 已完成`;
  }
  function renderChecklist() {
    content.replaceChildren();
    const heading = el('div', 'journey-heading');
    const words = el('div');
    words.append(el('h2', '', '行前檢查表'));
    heading.append(words);
    content.append(heading);
    if (checklistError) {
      content.append(el('p', 'load-error', checklistError));
      return;
    }
    const overview = el('div', 'check-overview');
    const progress = el('span', '', progressText());
    progress.setAttribute('role', 'status');
    const bar = el('progress');
    bar.max = checklist.length || 1;
    bar.value = checklist.filter(item => checked.has(item.id)).length;
    bar.setAttribute('aria-label', '行前準備完成進度');
    overview.append(progress, bar);
    content.append(overview);
    if (!checklist.length) content.append(el('p', 'journey-empty', '尚無行前檢查項目。'));
    const note = el('p', 'journey-storage-note', storageAvailable ? '勾選紀錄保存在這台裝置。' : '此瀏覽器無法保存紀錄，關閉頁面後可能遺失。');
    const groups = new Map();
    for (const item of checklist) {
      if (!groups.has(item.group)) {
        const section = el('section', 'check-group card');
        section.append(el('h3', '', item.group));
        groups.set(item.group, section);
        content.append(section);
      }
      const label = el('label', 'check-item');
      const box = el('input');
      box.type = 'checkbox';
      box.checked = checked.has(item.id);
      const copy = el('span', 'check-copy');
      copy.append(el('span', 'check-title', item.title));
      if (item.note) copy.append(el('span', 'check-note', item.note));
      box.addEventListener('change', () => {
        if (box.checked) checked.add(item.id); else checked.delete(item.id);
        try { localStorage.setItem(storageKey(), JSON.stringify([...checked])); }
        catch { storageAvailable = false; }
        progress.textContent = progressText();
        bar.value = checklist.filter(entry => checked.has(entry.id)).length;
        note.textContent = storageAvailable ? '勾選紀錄保存在這台裝置。' : '此瀏覽器無法保存紀錄，關閉頁面後可能遺失。';
      });
      label.append(box, copy);
      groups.get(item.group).append(label);
    }
    content.append(note);
  }
  function renderDay(day) {
    content.replaceChildren();
    const heading = el('div', 'journey-heading');
    const words = el('div');
    words.append(el('span', 'eyebrow', `DAY ${String(journey.days.indexOf(day) + 1).padStart(2, '0')} / ${day.location.name}`), el('h2', '', day.title));
    heading.append(words);
    content.append(heading, el('p', 'journey-intro', new Intl.DateTimeFormat('zh-TW', { timeZone: 'UTC', year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }).format(new Date(day.date))));
    if (!day.items.length) {
      content.append(el('div', 'journey-empty card', '當日尚無行程。'));
      return;
    }
    const visitedProgress = el('p', 'visit-progress');
    visitedProgress.setAttribute('role', 'status');
    const visitNote = el('p', 'visit-storage-note');
    const updateProgress = () => {
      visitedProgress.textContent = `已蓋章 ${day.items.filter(item => TripVisits.has(item.id)).length} / ${day.items.length}`;
      visitNote.textContent = TripVisits.persistent ? '蓋章紀錄保存在這台裝置。' : '此瀏覽器無法保存蓋章紀錄，重新整理後可能遺失。';
    };
    updateProgress();
    content.append(visitedProgress);
    const list = el('ol', 'day-timeline');
    for (const item of day.items) {
      const row = el('li', 'day-stop');
      row.append(el('time', '', item.time || '彈性'));
      const card = el('article', 'stop-card card');
      const stopHeading = el('div', 'stop-heading');
      if (item.category) stopHeading.append(el('span', `stop-category cat-${item.category}`, categoryNames[item.category]));
      stopHeading.append(el('h3', '', item.title));
      card.append(stopHeading);
      if (item.note) card.append(el('p', '', item.note));
      const actions = el('div', 'stop-actions');
      const stamp = el('button', 'stamp-button');
      stamp.type = 'button';
      const updateStamp = () => {
        const done = TripVisits.has(item.id);
        stamp.setAttribute('aria-pressed', String(done));
        stamp.setAttribute('aria-label', `${done ? '取消' : ''}${item.title}的蓋章`);
        const artwork = done ? el('img', 'stamp-art') : HandDrawnIcons.create('stamp-hand');
        if (done) {
          artwork.src = './assets/stamps/kuromi-maple.png';
          artwork.alt = '';
          artwork.width = 52;
          artwork.height = 52;
          artwork.setAttribute('aria-hidden', 'true');
        }
        stamp.replaceChildren(artwork, el('span', '', done ? '取消蓋章' : '蓋章'));
        card.classList.toggle('is-visited', done);
      };
      updateStamp();
      stamp.addEventListener('click', () => {
        const done = TripVisits.toggle(item.id);
        updateStamp();
        updateProgress();
        stamp.classList.remove('just-stamped');
        if (done) {
          stamp.classList.add('just-stamped');
          setTimeout(() => stamp.classList.remove('just-stamped'), 350);
        }
      });
      if (item.mapQuery || item.coordinates) {
        const map = el('a', 'stop-map', '查看地圖');
        map.append(HandDrawnIcons.create('pin'));
        map.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.mapQuery)}`;
        map.target = '_blank';
        map.rel = 'noopener noreferrer';
        map.setAttribute('aria-label', `在 Google 地圖查看${item.title}`);
        if (item.coordinates) {
          map.href = `#map/${day.date}/${encodeURIComponent(item.id)}`;
          map.removeAttribute('target');
          map.setAttribute('aria-label', `在網站地圖查看${item.title}`);
        }
        actions.append(map);
      }
      card.append(stamp);
      card.append(actions);
      row.append(card);
      list.append(row);
    }
    content.append(list, visitNote);
  }
  function renderSelection() {
    if (!journey) return;
    const requested = location.hash.split('/')[1];
    const selected = requested === 'pretrip' || journey.days.some(day => day.date === requested)
      ? requested : TripData.defaultSelection(journey.days, TripData.today(journey.trip.timezone));
    for (const button of filters.querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.dataset.date === selected));
    if (selected === 'pretrip') renderChecklist();
    else renderDay(journey.days.find(day => day.date === selected));
  }
  async function readFile(path) {
    const response = await fetch(path, { cache: 'no-cache' });
    if (!response.ok) throw Error('無法讀取資料檔，請稍後重試。');
    return response.text();
  }
  async function load() {
    content.textContent = '正在載入行程…';
    filters.replaceChildren();
    const [tripResult, checkResult] = await Promise.allSettled([
      readFile('./data/itinerary.jsonl').then(TripData.parseItinerary),
      readFile('./data/checklist.jsonl').then(TripData.parseChecklist)
    ]);
    if (tripResult.status === 'rejected') {
      content.replaceChildren(el('p', 'load-error', `行程載入失敗：${tripResult.reason.message}`));
      const retry = el('button', 'back-home', '重新載入');
      retry.addEventListener('click', load);
      content.append(retry);
      return;
    }
    journey = tripResult.value;
    checklistError = checkResult.status === 'rejected' ? `檢查表載入失敗：${checkResult.reason.message} 請重新整理頁面重試。` : '';
    checklist = checkResult.status === 'fulfilled' ? checkResult.value : [];
    loadChecks();
    TripVisits.configure(journey);
    const monthFormat = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' });
    const entries = [{ date: 'pretrip', label: '行前' }, ...journey.days.map((day, i) => ({ date: day.date, month: monthFormat.format(new Date(day.date)), label: String(Number(day.date.slice(8))), subtitle: `Day ${i + 1}` }))];
    for (const entry of entries) {
      const button = el('button', 'date-chip');
      button.type = 'button';
      button.dataset.date = entry.date;
      if (entry.month) button.append(el('span', 'date-month', entry.month));
      button.append(el('span', entry.month ? 'date-number' : 'date-pretrip', entry.label));
      if (entry.subtitle) button.append(el('small', '', entry.subtitle));
      button.addEventListener('click', () => { location.hash = `itinerary/${entry.date}`; });
      filters.append(button);
    }
    renderSelection();
    const active = filters.querySelector('[aria-pressed="true"]');
    if (active) filters.scrollLeft = Math.max(0, active.offsetLeft - filters.offsetLeft - 8);
  }
  window.addEventListener('hashchange', renderSelection);
  load();
})();
