#!/usr/bin/env node
// 用無頭 Chrome 截手機畫面（預設 360px 寬），改完畫面時用來確認。不需要安裝套件。
// 多個字級／主題用逗號隔開，會並排在同一張圖，一次比較。
//
// 用法（在專案根目錄執行）：
//   node tools/shot.mjs 行程 --day 2026-11-21 --fs 標準,特大 --theme 白天,夜間
//   node tools/shot.mjs 行程 --day 行前
//   node tools/shot.mjs 首頁 --open 設定
//   node tools/shot.mjs 行程 --scroll 600 --height 800
//   node tools/shot.mjs 首頁 --eval "document.querySelector('#amount').value = 5000; document.querySelector('#amount').dispatchEvent(new Event('input'))"
//
// 頁面（預設 首頁）：
//   首頁 home、行程 itinerary、店家 shopping、優惠 offers、地圖 map
//   對應網址 #home、#itinerary、#shopping、#offers、#map
// 選項：
//   --day <日期|行前>   行程頁與地圖頁選日期，例如 2026-11-21（地圖可用「全部」）。
//                       行程頁對應 #itinerary/2026-11-21、#itinerary/pretrip；地圖頁對應 #map/2026-11-21
//   --fs <字級>         標準、大、特大（預設 標準），可用逗號列出多個
//   --theme <主題>      白天、夜間（預設 白天），可用逗號列出多個；英文 day、night 也可
//   --open 設定         打開設定 sheet（點 [data-open-settings] 按鈕）
//   --scroll <px>       頁面往下捲幾 px
//   --height <px>       每個畫面的高度（預設 640）
//   --width <px>        每個畫面的寬度（預設 360）
//   --eval "<JS>"       截圖前在網站頁面裡執行的 JS（可用 await；window 為該頁面的 window）
//   --motion            保留動畫（預設關閉，無頭 Chrome 的動畫容易停在半途）
//   --out <路徑>        圖片存放位置（預設在系統暫存資料夾），完成後印出圖片路徑
// 多個字級×主題會依序並排，每張圖上方有標題。找不到元素、資料載入逾時或 --eval 出錯時，
// 不會中斷，訊息會寫在該圖的標題上。
// 找不到 Chrome 時，用環境變數 CHROME 指定路徑。總逾時 60 秒。
// 截圖用的伺服器不提供 .git、node_modules、.claude、tools，且 /sw.js 回 404（不註冊 Service Worker）。

import { createServer } from 'node:http';
import { readFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, extname, join, resolve, normalize, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PAGES = {
  首頁: 'home', home: 'home',
  行程: 'itinerary', itinerary: 'itinerary',
  店家: 'shopping', shopping: 'shopping',
  優惠: 'offers', offers: 'offers',
  地圖: 'map', map: 'map'
};
const FS = { 標準: 'standard', 大: 'large', 特大: 'xlarge', standard: 'standard', large: 'large', xlarge: 'xlarge' };
const THEMES = { 白天: 'day', 夜間: 'night', day: 'day', night: 'night' };
const BLOCKED = new Set(['.git', 'node_modules', '.claude', 'tools']);

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

// ---------- 參數 ----------
const opts = { page: '首頁', fs: '標準', theme: '白天', width: '360', height: '640' };
const VALUE_OPTS = new Set(['day', 'fs', 'theme', 'open', 'scroll', 'height', 'width', 'eval', 'out']);
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--help' || a === '-h') { console.log('用法請見 tools/shot.mjs 檔案開頭的說明。'); process.exit(0); }
  if (a === '--motion') opts.motion = true;
  else if (a.startsWith('--')) {
    const key = a.slice(2);
    if (!VALUE_OPTS.has(key)) fail(`看不懂選項「${a}」，可以用：--day --fs --theme --open --scroll --height --width --eval --motion --out`);
    if (i + 1 >= argv.length) fail(`選項「${a}」後面要接值`);
    opts[key] = argv[++i];
  } else opts.page = a;
}
const page = PAGES[opts.page];
if (!page) fail(`看不懂頁面「${opts.page}」，可以用：首頁、行程、店家、優惠、地圖`);
const variants = [];
for (const f of opts.fs.split(',')) {
  if (!FS[f]) fail(`看不懂字級「${f}」，可以用：標準、大、特大`);
  for (const t of opts.theme.split(',')) {
    if (!THEMES[t]) fail(`看不懂主題「${t}」，可以用：白天、夜間`);
    variants.push({ label: `${f}・${t}`, fontSize: FS[f], theme: THEMES[t] });
  }
}
const width = Number(opts.width), height = Number(opts.height);
if (!Number.isInteger(width) || width < 200 || width > 2000) fail(`--width 要是 200 到 2000 的整數，收到「${opts.width}」`);
if (!Number.isInteger(height) || height < 200 || height > 4000) fail(`--height 要是 200 到 4000 的整數，收到「${opts.height}」`);
const scroll = opts.scroll === undefined ? 0 : Number(opts.scroll);
if (!Number.isFinite(scroll) || scroll < 0) fail(`--scroll 要是 0 以上的數字，收到「${opts.scroll}」`);
if (opts.open !== undefined && opts.open !== '設定') fail(`--open 目前只支援「設定」，收到「${opts.open}」`);
let day = '';
if (opts.day !== undefined) {
  if (opts.day === '行前' || opts.day === 'pretrip') day = 'pretrip';
  else if (opts.day === '全部' || opts.day === 'all') day = 'all';
  else if (/^\d{4}-\d{2}-\d{2}$/.test(opts.day)) day = opts.day;
  else fail(`看不懂 --day「${opts.day}」，請用 2026-11-21 這種日期或「行前」`);
  if (page !== 'itinerary' && page !== 'map') console.error(`！--day 只對行程與地圖有用，${opts.page}會忽略它`);
  if (day === 'all' && page === 'itinerary') fail('行程頁沒有「全部」，請用日期或「行前」');
  if (day === 'pretrip' && page === 'map') fail('地圖頁沒有「行前」，請用日期或「全部」');
}
let hash = `#${page}`;
if (day && day !== 'all' && (page === 'itinerary' || page === 'map')) hash += `/${day}`;

const chrome = process.env.CHROME || [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium'
].find(existsSync);
if (!chrome || !existsSync(chrome)) fail('找不到 Chrome 或 Chromium，請安裝，或用環境變數 CHROME 指定執行檔路徑');
if (typeof WebSocket === 'undefined') fail('需要 Node 22 以上（內建 WebSocket）');

// ---------- 截圖用的頁面：每個組合一個 iframe，並排 ----------
// 先寫好 localStorage 再載入 iframe，網頁一開始就是指定的主題與字級
const cfg = { variants, page, hash, open: opts.open || '', scroll, eval: opts.eval || '', width, height };
const harness = `<!doctype html><meta charset="utf-8"><title>shot</title>
<style>body{margin:0;display:flex;gap:16px;padding:8px;background:#777;font:14px/1.4 sans-serif;width:max-content}
figure{margin:0}figcaption{color:#fff;padding:0 0 4px;max-width:${width}px}iframe{border:0;display:block;background:#fff}</style>
<body><script>
const C = ${JSON.stringify(cfg).replace(/</g, '\\u003c')};
window.addEventListener('error', (e) => { if (!document.title.startsWith('done')) document.title = 'error:' + e.message; });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const READY = {
  home: ['#home-preview', '#weather-description'],
  itinerary: ['#itinerary-content'],
  shopping: ['#shops-content'],
  offers: ['#coupons-content'],
  map: ['#map-places']
};
async function run(v, i) {
  localStorage.setItem('tabi-settings-v1', JSON.stringify({ fontSize: v.fontSize, theme: v.theme }));
  const fig = document.createElement('figure');
  const cap = document.createElement('figcaption');
  const notes = [];
  const render = () => { cap.textContent = v.label + (notes.length ? '（' + notes.join('；') + '）' : ''); };
  render();
  const f = document.createElement('iframe');
  f.width = C.width; f.height = C.height;
  fig.append(cap, f);
  document.body.append(fig);
  // 外部字型等資源可能很慢，load 事件最多等 10 秒
  await new Promise((r) => { f.onload = r; setTimeout(r, 10000); f.src = './index.html?shot=' + i + C.hash; });
  const w = f.contentWindow, d = w.document;
  // 等資料載入：目前頁面內沒有「正在…」字樣，最多 12 秒；失敗也繼續截圖
  const loading = () => (READY[C.page] || []).some((s) => { const e = d.querySelector(s); return e && /正在(載入|讀取)|載入中/.test(e.textContent); });
  let t = 0;
  while (t < 120 && (loading() || !d.querySelector('.bottom-nav'))) { await sleep(100); t++; }
  if (loading()) notes.push('資料載入逾時');
  else if (C.page === 'itinerary' && d.querySelector('#itinerary-content .load-error')) notes.push('行程載入失敗');
  else if (C.page === 'map') {
    for (let k = 0; k < 30 && !d.querySelector('#travel-map .leaflet-marker-icon'); k++) await sleep(100);
    if (!d.querySelector('#travel-map .leaflet-marker-icon')) notes.push('地圖沒有圖釘');
  }
  if (C.hash.includes('/')) {
    const want = C.hash.split('/')[1];
    if (C.page === 'itinerary' && !d.querySelector('#date-filters [data-date="' + want + '"]')) notes.push('找不到日期 ' + want);
    if (C.page === 'map') { const m = d.querySelector('#map-summary'); if (m && !m.textContent.includes(want)) notes.push('地圖沒有切到日期 ' + want); }
  }
  if (C.open === '設定') {
    const btn = d.querySelector('[data-open-settings]') || d.querySelector('[aria-label="設定"]');
    if (btn) { btn.click(); await sleep(600); } else notes.push('找不到設定按鈕');
  }
  if (C.eval) {
    try { await new w.Function('return (async () => {' + C.eval + '\\n})()')(); await sleep(300); }
    catch (e) { notes.push('eval 錯誤：' + e.message); }
  }
  if (C.scroll) { w.scrollTo(0, C.scroll); await sleep(200); }
  await sleep(300);
  render();
}
(async () => {
  try { for (let i = 0; i < C.variants.length; i++) await run(C.variants[i], i); }
  catch (e) { document.title = 'error:' + e.message; return; }
  document.title = 'done';
})();
</script>`;

// ---------- 本機伺服器 ----------
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.jsonl': 'text/plain; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.md': 'text/plain; charset=utf-8'
};
const server = createServer(async (req, res) => {
  let path;
  try { path = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400); return res.end(); }
  if (path === '/__shot.html') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    return res.end(harness);
  }
  if (path === '/sw.js') { res.writeHead(404); return res.end(); }
  if (path.split('/').some((p) => BLOCKED.has(p))) { res.writeHead(404); return res.end(); }
  const file = normalize(join(ROOT, path.endsWith('/') ? path + 'index.html' : path));
  if (file !== ROOT && !file.startsWith(ROOT + sep)) { res.writeHead(403); return res.end(); }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

// ---------- 啟動 Chrome，用 DevTools 協定截圖 ----------
const out = resolve(opts.out || join(tmpdir(), 'tabi-shots', `${Date.now()}.png`));
await mkdir(dirname(out), { recursive: true });
const profile = await mkdtemp(join(tmpdir(), 'tabi-shot-chrome-'));
const args = [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
  '--disable-extensions', '--disable-background-networking', '--mute-audio',
  `--user-data-dir=${profile}`, '--remote-debugging-port=0', 'about:blank'
];
if (!opts.motion) args.unshift('--force-prefers-reduced-motion');
const proc = spawn(chrome, args, { stdio: 'ignore' });
let finished = false;
async function cleanup() {
  if (finished) return;
  finished = true;
  proc.kill();
  server.close();
  await new Promise((r) => (proc.exitCode !== null ? r() : proc.once('exit', r)));
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
}
const deadline = Date.now() + 60000;
const timer = setTimeout(async () => { await cleanup(); fail('超過 60 秒仍未完成，已結束 Chrome'); }, 60000);
proc.on('error', async (e) => { await cleanup(); fail(`無法啟動 Chrome：${e.message}`); });

try {
  // 取得 DevTools 連線位址
  let wsUrl = '';
  while (!wsUrl) {
    if (Date.now() > deadline) throw new Error('Chrome 沒有及時啟動');
    if (proc.exitCode !== null) throw new Error(`Chrome 啟動後立刻結束（代碼 ${proc.exitCode}）`);
    try {
      const p = readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0];
      const list = await (await fetch(`http://127.0.0.1:${p}/json/list`)).json();
      wsUrl = list.find((t) => t.type === 'page')?.webSocketDebuggerUrl || '';
    } catch { await new Promise((r) => setTimeout(r, 100)); }
  }
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('DevTools 連線失敗')); });
  let seq = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); }
  };
  const send = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); });
  const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true })).result.value;

  const harnessWidth = variants.length * (width + 16) + 16;
  await send('Emulation.setDeviceMetricsOverride', { width: harnessWidth, height: height + 60, deviceScaleFactor: 2, mobile: false });
  await send('Page.enable');
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/__shot.html` });
  let state = '';
  while (!/^(done|error:)/.test(state)) {
    if (Date.now() > deadline) throw new Error('超過 60 秒仍未完成');
    await new Promise((r) => setTimeout(r, 200));
    state = (await evaluate('document.title').catch((e) => { if (process.env.SHOT_DEBUG) console.error(e.message); return ''; })) || '';
    if (process.env.SHOT_DEBUG) console.error('title:', state);
  }
  if (state.startsWith('error:')) throw new Error(`截圖頁面出錯：${state.slice(6)}`);
  const { w, h } = JSON.parse(await evaluate('JSON.stringify({w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight})'));
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: false });
  await new Promise((r) => setTimeout(r, 200));
  const shot = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: w, height: h, scale: 1 } });
  await writeFile(out, Buffer.from(shot.data, 'base64'));
  ws.close();
  clearTimeout(timer);
  await cleanup();
  console.log(out);
} catch (e) {
  clearTimeout(timer);
  await cleanup();
  fail(`截圖失敗：${e.message}`);
}
