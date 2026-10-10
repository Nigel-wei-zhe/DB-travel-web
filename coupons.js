(() => {
  const content = document.querySelector('#coupons-content');
  const viewer = document.querySelector('#coupon-viewer');
  const fullImage = document.querySelector('#coupon-full-image');
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  document.querySelector('#coupon-close').addEventListener('click', () => viewer.close());
  window.addEventListener('hashchange', () => { if (viewer.open) viewer.close(); });
  fullImage.addEventListener('error', () => { fullImage.alt = '圖片無法載入，請關閉後重試。'; });
  async function load() {
    content.textContent = '正在載入優惠券…';
    try {
      const response = await fetch('./data/coupons.jsonl', { cache: 'no-cache' });
      if (!response.ok) throw Error('無法讀取優惠券資料');
      const coupons = TripData.parseCoupons(await response.text());
      content.replaceChildren();
      if (!coupons.length) content.append(el('p', 'journey-empty card', '尚未加入優惠券。'));
      for (const coupon of coupons) {
        const card = el('article', 'coupon-card card');
        card.append(el('h2', '', coupon.shop));
        const button = el('button', 'coupon-thumbnail');
        button.type = 'button';
        button.setAttribute('aria-label', `放大查看${coupon.shop}`);
        button.setAttribute('aria-haspopup', 'dialog');
        const image = el('img');
        image.alt = coupon.alt;
        image.loading = 'lazy';
        const error = el('p', 'load-error', '圖片無法載入，請確認圖檔。');
        error.hidden = true;
        image.addEventListener('error', () => { button.hidden = true; error.hidden = false; });
        image.src = coupon.image;
        button.append(image);
        button.addEventListener('click', () => {
          document.querySelector('#coupon-viewer-title').textContent = coupon.shop;
          fullImage.alt = coupon.alt;
          fullImage.src = coupon.image;
          document.querySelector('#coupon-original').href = coupon.image;
          viewer.showModal();
        });
        card.append(button, error);
        if (coupon.note) card.append(el('p', 'coupon-note', coupon.note));
        content.append(card);
      }
    } catch (error) {
      content.replaceChildren(el('p', 'load-error', `優惠券載入失敗：${error.message}`));
      const retry = el('button', 'back-home', '重新載入');
      retry.addEventListener('click', load);
      content.append(retry);
    }
  }
  load();
})();
