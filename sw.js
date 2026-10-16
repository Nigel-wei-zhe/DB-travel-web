// 旅日手帖 Service Worker。VERSION 由 tools/merge-dev.sh 在合回 dev 時設為與 APP_VERSION 相同，功能分支不用手動遞增。
const VERSION = '2';

// 離線需要的本機檔案，一律用相對路徑；新增檔案要同步加入。
const CORE_FILES = [
  './',
  './index.html',
  './styles.css',
  './icons.js',
  './trip-data.js',
  './app.js',
  './settings.js',
  './home-preview.js',
  './visits.js',
  './itinerary.js',
  './shops.js',
  './coupons.js',
  './maps.js',
  './vendor/leaflet/leaflet.js',
  './vendor/leaflet/leaflet.css',
  './fonts/NotoSansTC-subset.woff2',
  './fonts/NotoSerifTC-subset.woff2',
  './data/itinerary.jsonl',
  './data/checklist.jsonl',
  './data/shops.jsonl',
  './data/coupons.jsonl',
  './assets/coupons/sample.svg',
  './assets/stamps/kuromi-maple.png',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png'
];

// 網路優先（逾時退回快取）：頁面、旅行與資訊資料。結尾是 / 的代表整個資料夾。
const NETWORK_FIRST = ['./', './index.html', './manifest.webmanifest', './data/'];
const NETWORK_TIMEOUT_MS = 4000;
const CACHE_PREFIX = 'travel-journal|';

if (typeof self !== 'undefined' && self.registration) {
  const SCOPE = self.registration.scope;
  const CACHE_NAME = `${CACHE_PREFIX}${SCOPE}|${VERSION}`;
  const scopeUrl = path => new URL(path, SCOPE).href;
  const networkFirstUrls = NETWORK_FIRST.map(scopeUrl);
  const isNetworkFirst = url => networkFirstUrls.some(item => (item.endsWith('/') && item !== SCOPE) ? url.startsWith(item) : url === item);

  self.addEventListener('install', event => {
    // 不自動 skipWaiting，等使用者在頁面按「更新」。
    event.waitUntil(caches.open(CACHE_NAME).then(cache => Promise.all(CORE_FILES.map(async path => {
      const response = await fetch(new Request(scopeUrl(path), { cache: 'reload' }));
      if (!response.ok) throw Error(`${path} ${response.status}`);
      await cache.put(scopeUrl(path), response);
    }))));
  });

  self.addEventListener('activate', event => {
    // 只清掉同一個 scope 的舊版本，不動其他預覽路徑的快取。
    const prefix = `${CACHE_PREFIX}${SCOPE}|`;
    event.waitUntil(caches.keys()
      .then(names => Promise.all(names.filter(name => name.startsWith(prefix) && name !== CACHE_NAME).map(name => caches.delete(name))))
      .then(() => self.clients.claim()));
  });

  self.addEventListener('message', event => {
    if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
  });

  async function store(request, response) {
    if (response.ok && response.type === 'basic') {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request.url, response.clone());
    }
    return response;
  }

  async function networkFirst(request) {
    const cache = await caches.open(CACHE_NAME);
    const key = request.mode === 'navigate' ? scopeUrl('./index.html') : request.url;
    const cached = await cache.match(key);
    const network = fetch(request, { cache: 'no-cache' }).then(response => store(request.mode === 'navigate' ? new Request(key) : request, response));
    if (!cached) return network;
    const timeout = new Promise(resolve => setTimeout(() => resolve(cached), NETWORK_TIMEOUT_MS));
    // 網路失敗或逾時就用快取。
    return Promise.race([network.catch(() => cached), timeout]);
  }

  async function cacheFirst(request) {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request.url);
    if (cached) return cached;
    return store(request, await fetch(request));
  }

  self.addEventListener('fetch', event => {
    const { request } = event;
    if (request.method !== 'GET') return;
    const url = new URL(request.url);
    // 跨網域（天氣、匯率、字型、地圖圖磚）直接交給瀏覽器，不快取。
    if (url.origin !== self.location.origin || !request.url.startsWith(SCOPE)) return;
    const clean = url.origin + url.pathname;
    if (request.mode === 'navigate' || isNetworkFirst(clean)) {
      event.respondWith(networkFirst(request));
    } else {
      event.respondWith(cacheFirst(request));
    }
  });
}

if (typeof module !== 'undefined') module.exports = { VERSION, CORE_FILES, NETWORK_FIRST };
