// 共用手繪圖示，只接受程式指定的 symbol 名稱。
(() => {
  const names = new Set(['home', 'calendar', 'bag', 'store', 'ticket', 'pin', 'arrow', 'refresh', 'yen-hand', 'swap-hand', 'close-hand', 'leaf-hand']);
  function create(name) {
    if (!names.has(name)) throw Error('未知的圖示');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    use.setAttribute('href', `#${name}`);
    svg.append(use);
    return svg;
  }
  window.HandDrawnIcons = { create };
})();
