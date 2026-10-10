const amount = document.querySelector('#amount');
const result = document.querySelector('#result');
let reversed = false;
let exchangeRate = null;
function convert() {
  const value = Number(amount.value);
  result.textContent = amount.value === '' || exchangeRate === null ? '—' : Number.isFinite(value) && value >= 0 && value <= 999999999
    ? new Intl.NumberFormat('zh-TW', { maximumFractionDigits: reversed ? 0 : 2 }).format(reversed ? value / exchangeRate : value * exchangeRate)
    : '請輸入有效金額';
}
amount.addEventListener('input', convert);
document.querySelector('#swap').addEventListener('click', () => {
  reversed = !reversed;
  document.querySelector('#from-label').innerHTML = reversed ? '台幣 <b>TWD</b>' : '日圓 <b>JPY</b>';
  document.querySelector('#to-label').innerHTML = reversed ? '日圓 <b>JPY</b>' : '台幣 <b>TWD</b>';
  convert();
});
const titles = { itinerary: '每日行程', shopping: '精選店家', offers: '優惠', map: '地圖' };
function navigate() {
  const route = location.hash.slice(1).split('/')[0];
  const page = Object.hasOwn(titles, route) ? route : 'home';
  document.querySelector('#home-page').hidden = page !== 'home';
  document.querySelector('#itinerary-page').hidden = page !== 'itinerary';
  document.querySelector('#shops-page').hidden = page !== 'shopping';
  document.querySelector('#map-page').hidden = page !== 'map';
  document.querySelector('#offers-page').hidden = page !== 'offers';
  document.querySelectorAll('.bottom-nav a').forEach(link => {
    if (link.dataset.page === page) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  document.title = `${titles[page] || '首頁'} · 旅日手帖`;
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', navigate);
navigate();

const services = {
  weather: { url: '', ttl: 30 * 60 * 1000, validate: validWeather, render: renderWeather },
  exchange: { url: 'https://api.frankfurter.dev/v2/rate/JPY/TWD', ttl: 6 * 60 * 60 * 1000, validate: validRate, render: renderRate }
};
const number = value => typeof value === 'number' && Number.isFinite(value);
const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value));
function validWeather(data) {
  return number(data?.current?.temperature_2m) && number(data.current.weather_code)
    && typeof data.current.time === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(data.current.time)
    && validDate(data.daily?.time?.[0])
    && ['temperature_2m_max', 'temperature_2m_min', 'precipitation_probability_max'].every(key => number(data.daily?.[key]?.[0]))
    && data.daily.precipitation_probability_max[0] >= 0 && data.daily.precipitation_probability_max[0] <= 100;
}
function validRate(data) {
  return data?.base === 'JPY' && data?.quote === 'TWD' && number(data.rate) && data.rate > 0 && validDate(data.date);
}
function weatherAppearance(code, isDay) {
  if (code === 0) return [isDay ? '晴朗' : '晴朗的夜晚', isDay ? 'sun' : 'moon'];
  if ([1, 2].includes(code)) return ['晴時多雲', isDay ? 'partly-day' : 'partly-night'];
  if (code === 3) return ['陰天', 'cloud'];
  if ([45, 48].includes(code)) return ['有霧，留意能見度', 'fog'];
  if ([51, 53, 55, 56, 57].includes(code)) return ['毛毛雨，記得帶傘', 'drizzle'];
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return ['有雨，記得帶傘', 'rain'];
  if ([71, 73, 75, 77, 85, 86].includes(code)) return ['下雪，注意保暖', 'snow'];
  if ([95, 96, 99].includes(code)) return ['雷雨，留意天氣變化', 'storm'];
  return ['天氣狀況暫無說明', 'cloud'];
}
function renderWeather(data) {
  document.querySelector('#weather-temp').textContent = Math.round(data.current.temperature_2m);
  const [description, icon] = weatherAppearance(data.current.weather_code, data.current.is_day);
  document.querySelector('#weather-description').textContent = description;
  const art = document.querySelector('#weather-icon');
  document.querySelector('#weather-glyph').setAttribute('href', `#weather-${icon}`);
  art.setAttribute('aria-label', description);
  document.querySelector('#weather-high').textContent = `${Math.round(data.daily.temperature_2m_max[0])}°`;
  document.querySelector('#weather-low').textContent = `${Math.round(data.daily.temperature_2m_min[0])}°`;
  document.querySelector('#weather-rain-chance').textContent = `${Math.round(data.daily.precipitation_probability_max[0])}%`;
}
function renderRate(data) {
  exchangeRate = data.rate;
  document.querySelector('#exchange-rate').textContent = `${new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 5 }).format(data.rate)} TWD`;
  convert();
}
function readCache(name) {
  try {
    const entry = JSON.parse(localStorage.getItem(services[name].cacheKey || `tabi-${name}-v1`));
    return entry && number(entry.fetchedAt) && entry.fetchedAt <= Date.now() && services[name].validate(entry.data) ? entry : null;
  } catch { return null; }
}
function fetchedTime(timestamp) {
  return new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(timestamp);
}
async function loadData(name, force = false) {
  const service = services[name];
  if (service.loading) return;
  const button = document.querySelector(`#${name}-refresh`);
  const status = document.querySelector(`#${name}-status`);
  const cached = service.last || readCache(name);
  if (!force && cached && Date.now() - cached.fetchedAt < service.ttl) {
    service.last = cached;
    status.classList.remove('data-error');
    service.render(cached.data);
    status.textContent = `刷新時間 ${fetchedTime(cached.fetchedAt)}（台灣時間）`;
    return;
  }
  service.loading = true;
  button.disabled = true;
  button.classList.add('is-loading');
  button.setAttribute('aria-busy', 'true');
  status.textContent = '正在取得最新資料…';
  status.classList.remove('data-error');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(service.url, { signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!service.validate(data)) throw new Error('Invalid API data');
    const entry = { data, fetchedAt: Date.now() };
    service.last = entry;
    try { localStorage.setItem(service.cacheKey || `tabi-${name}-v1`, JSON.stringify(entry)); } catch { /* Storage may be unavailable in private browsing. */ }
    service.render(data);
    status.textContent = `刷新時間 ${fetchedTime(entry.fetchedAt)}（台灣時間）`;
  } catch {
    status.classList.add('data-error');
    if (cached) {
      service.last = cached;
      service.render(cached.data);
      status.textContent = `更新失敗，顯示舊資料。上次刷新時間 ${fetchedTime(cached.fetchedAt)}（台灣時間），請稍後重試。`;
    } else {
      status.textContent = '暫時無法取得資料，請檢查網路並重新整理。';
      if (name === 'weather') {
        document.querySelector('#weather-description').textContent = '天氣暫時無法載入';
        document.querySelector('#weather-icon').setAttribute('aria-label', '天氣資料無法載入');
      }
    }
  } finally {
    clearTimeout(timeout);
    service.loading = false;
    button.disabled = false;
    button.classList.remove('is-loading');
    button.setAttribute('aria-busy', 'false');
  }
}
// 首頁目的地、日期與天氣共用旅行設定；舊資料缺少目的地時使用第一天位置。
let homeReady = false;
let homeLoading = false;
async function initializeHome() {
  if (homeLoading) return;
  homeLoading = true;
  const button = document.querySelector('#weather-refresh');
  button.disabled = true;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch('./data/itinerary.jsonl', { cache: 'no-cache', signal: controller.signal });
    if (!response.ok) throw Error('旅行設定讀取失敗');
    const { trip, days } = TripData.parseItinerary(await response.text());
    const destination = trip.destination || { ...days[0].location, country: '' };
    document.querySelector('#trip-title').textContent = trip.title;
    document.querySelector('#trip-place').textContent = [destination.name, destination.country].filter(Boolean).join('・');
    const first = days[0].date;
    const last = days[days.length - 1].date;
    document.querySelector('#trip-dates').textContent = `${first.replaceAll('-', '.')} — ${last.slice(5).replace('-', '.')}`;
    const nights = Math.round((Date.parse(last) - Date.parse(first)) / 86400000);
    document.querySelector('#trip-duration').textContent = `${nights + 1} 天 ${nights} 夜`;
    document.querySelector('#weather-place').textContent = `${destination.name}的天氣`;
    document.querySelector('#weather-description').textContent = `正在讀取${destination.name}天氣…`;
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.search = new URLSearchParams({ latitude: destination.latitude, longitude: destination.longitude, timezone: trip.timezone,
      current: 'temperature_2m,weather_code,is_day', daily: 'temperature_2m_max,temperature_2m_min,precipitation_probability_max', forecast_days: '1' }).toString();
    services.weather.url = url.href;
    services.weather.cacheKey = `tabi-weather-v2:${destination.latitude},${destination.longitude}:${trip.timezone}`;
    homeReady = true;
  } catch {
    document.querySelector('#trip-place').textContent = '旅行設定無法載入';
    document.querySelector('#weather-description').textContent = '目的地暫時無法載入';
    document.querySelector('#weather-status').textContent = '請檢查網路，按重新整理天氣重試。';
    document.querySelector('#weather-status').classList.add('data-error');
  } finally {
    clearTimeout(timeout);
    homeLoading = false;
    button.disabled = false;
  }
  if (homeReady) await loadData('weather');
}
document.querySelector('#weather-refresh').addEventListener('click', () => homeReady ? loadData('weather', true) : initializeHome());
document.querySelector('#exchange-refresh').addEventListener('click', () => loadData('exchange', true));
initializeHome();
loadData('exchange');
