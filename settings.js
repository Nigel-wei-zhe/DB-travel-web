// 共用 sheet 與設定（字級、日夜模式）。<head> 的 inline script 先套用同一份設定，避免閃爍。
(() => {
  const STORAGE_KEY = 'tabi-settings-v1';
  const FONT_SIZES = ['standard', 'large', 'xlarge'];
  const THEMES = ['system', 'day', 'night'];
  const root = document.documentElement;
  const darkQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  const reducedMotion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

  // ---- 共用 sheet ----
  let active = null;
  function lockScroll() {
    const y = window.scrollY;
    root.classList.add('sheet-locked');
    Object.assign(document.body.style, { position: 'fixed', top: `-${y}px`, left: '0', right: '0', width: '100%' });
    return y;
  }
  function unlockScroll(y) {
    root.classList.remove('sheet-locked');
    Object.assign(document.body.style, { position: '', top: '', left: '', right: '', width: '' });
    window.scrollTo(0, y);
  }
  function openSheet(sheet, trigger) {
    if (!sheet || sheet.open) return;
    if (active) closeSheet(active.sheet, true);
    active = { sheet, trigger: trigger || document.activeElement, scrollY: lockScroll() };
    clearTimeout(sheet._closeTimer);
    sheet.showModal();
    requestAnimationFrame(() => requestAnimationFrame(() => sheet.classList.add('is-open')));
    const focusTarget = sheet.querySelector('[data-sheet-autofocus]') || sheet.querySelector('.sheet-close');
    if (focusTarget) focusTarget.focus();
  }
  function closeSheet(sheet, immediate = false) {
    if (!sheet || !sheet.open || !active || active.sheet !== sheet) return;
    const { trigger, scrollY } = active;
    active = null;
    sheet.classList.remove('is-open');
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(sheet._closeTimer);
      sheet.close();
      // 先還原焦點再還原捲動，避免瀏覽器把觸發按鈕捲進畫面而跳回頂端。
      if (trigger && typeof trigger.focus === 'function') trigger.focus({ preventScroll: true });
      unlockScroll(scrollY);
      requestAnimationFrame(() => { if (!active) window.scrollTo(0, scrollY); });
    };
    if (immediate || reducedMotion?.matches) return finish();
    sheet.querySelector('.sheet-panel')?.addEventListener('transitionend', finish, { once: true });
    sheet._closeTimer = setTimeout(finish, 450);
  }
  function bindSheet(sheet, triggers) {
    if (!sheet) return;
    const list = triggers instanceof Element ? [triggers] : Array.from(triggers || []);
    for (const trigger of list) {
      trigger.addEventListener('click', () => openSheet(sheet, trigger));
    }
    sheet.querySelectorAll('[data-sheet-close]').forEach(button => button.addEventListener('click', () => closeSheet(sheet)));
    // 點背景（dialog 本身，不是內容面板）關閉。
    sheet.addEventListener('click', event => { if (event.target === sheet) closeSheet(sheet); });
    // Esc：取消原生立即關閉，改走關閉動畫與還原。
    sheet.addEventListener('cancel', event => { event.preventDefault(); closeSheet(sheet); });
  }
  window.TabiSheet = { openSheet, closeSheet, bindSheet };

  // ---- 設定 ----
  function readSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
      return {
        fontSize: FONT_SIZES.includes(saved.fontSize) ? saved.fontSize : 'standard',
        theme: THEMES.includes(saved.theme) ? saved.theme : 'system'
      };
    } catch { return { fontSize: 'standard', theme: 'system' }; }
  }
  let settings = readSettings();
  let saveFailed = false;
  function saveSettings() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); saveFailed = false; }
    catch { saveFailed = true; }
  }
  const resolvedTheme = () => settings.theme === 'system' ? (darkQuery?.matches ? 'night' : 'day') : settings.theme;
  function applySettings() {
    root.setAttribute('data-fs', settings.fontSize);
    root.setAttribute('data-theme', resolvedTheme());
    const meta = document.querySelector('meta[name="theme-color"]');
    const paper = getComputedStyle(root).getPropertyValue('--paper').trim();
    if (meta && paper) meta.setAttribute('content', paper);
    renderControls();
  }
  function renderControls() {
    document.querySelectorAll('[data-setting]').forEach(button => {
      button.setAttribute('aria-pressed', String(settings[button.dataset.setting] === button.dataset.value));
    });
    const note = document.querySelector('#settings-theme-note');
    if (note) {
      const current = resolvedTheme() === 'night' ? '夜間' : '白天';
      note.textContent = saveFailed ? '這台裝置無法保存設定，關閉網頁後會恢復預設。'
        : settings.theme === 'system' ? `依手機設定，目前是${current}。` : `目前是${current}。`;
    }
  }
  document.querySelectorAll('[data-setting]').forEach(button => {
    button.addEventListener('click', () => {
      settings = { ...settings, [button.dataset.setting]: button.dataset.value };
      saveSettings();
      applySettings();
    });
  });
  darkQuery?.addEventListener?.('change', () => { if (settings.theme === 'system') applySettings(); });

  const sheet = document.querySelector('#settings-sheet');
  bindSheet(sheet, document.querySelectorAll('[data-open-settings]'));
  if (sheet) sheet.addEventListener('close', () => sheet.classList.remove('is-open'));
  const version = document.querySelector('#settings-version');
  if (version && typeof APP_VERSION === 'string') version.textContent = `版本 ${APP_VERSION}`;
  applySettings();
})();
