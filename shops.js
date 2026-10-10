(() => {
  const content = document.querySelector('#shops-content');
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  async function loadShops() {
    content.textContent = '正在載入店家…';
    try {
      const response = await fetch('./data/shops.jsonl', { cache: 'no-cache' });
      if (!response.ok) throw Error('無法讀取店家資料檔');
      const groups = TripData.parseShops(await response.text());
      content.replaceChildren();
      if (!groups.length) content.append(el('p', 'journey-empty card', '尚無店家群組。'));
      for (const group of groups) {
        const section = el('section', 'shop-group');
        const heading = el('div', 'shop-group-heading');
        heading.append(el('h2', '', group.title), el('span', '', `${group.shops.length} 間`));
        section.append(heading);
        if (!group.shops.length) section.append(el('p', 'journey-empty card', '此群組尚未加入店家。'));
        for (const shop of group.shops) {
          const card = el('article', 'shop-card card');
          if (shop.tags?.length) {
            const tags = el('div', 'shop-tags');
            for (const tag of shop.tags) tags.append(el('span', 'shop-tag', tag));
            card.append(tags);
          }
          card.append(el('h3', '', shop.name));
          if (shop.note) card.append(el('p', '', shop.note));
          if (shop.mapQuery) {
            const map = el('a', 'stop-map', '查看地圖');
            map.append(HandDrawnIcons.create('pin'));
            map.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(shop.mapQuery)}`;
            map.target = '_blank';
            map.rel = 'noopener noreferrer';
            map.setAttribute('aria-label', `在 Google 地圖查看${shop.name}`);
            card.append(map);
          }
          section.append(card);
        }
        content.append(section);
      }
    } catch (error) {
      content.replaceChildren(el('p', 'load-error', `店家載入失敗：${error.message}`));
      const retry = el('button', 'back-home', '重新載入');
      retry.addEventListener('click', loadShops);
      content.append(retry);
    }
  }
  loadShops();
})();
