(function (root) {
  const categories = ['transport', 'sightseeing', 'food', 'shopping', 'stay', 'other'];
  const text = value => typeof value === 'string' && value.trim().length > 0;
  const optional = (record, key) => record[key] === undefined || text(record[key]);
  function parseJSONL(source, name) {
    return source.replace(/^\uFEFF/, '').split(/\r?\n/).flatMap((line, index) => {
      if (!line.trim()) return [];
      try {
        const value = JSON.parse(line);
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error();
        return [value];
      } catch { throw Error(`${name} 第 ${index + 1} 行不是有效的 JSON 物件`); }
    });
  }
  function validDate(date) {
    return typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
      && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;
  }
  function parseItinerary(source) {
    const records = parseJSONL(source, '行程檔');
    const trip = records[0];
    if (!trip || trip.type !== 'trip' || !['id', 'title', 'timezone', 'currency'].every(key => text(trip[key])) || !/^[A-Z]{3}$/.test(trip.currency)) throw Error('行程檔第一行必須是完整的 trip 資料');
    try { new Intl.DateTimeFormat('en', { timeZone: trip.timezone }); } catch { throw Error('旅行時區無效'); }
    if (trip.subtitle !== undefined && !text(trip.subtitle)) throw Error('旅行副標題無效');
    if (trip.destination !== undefined) {
      const place = trip.destination;
      if (!place || !text(place.name) || !text(place.country) || !Number.isFinite(place.latitude) || Math.abs(place.latitude) > 90 || !Number.isFinite(place.longitude) || Math.abs(place.longitude) > 180) throw Error('旅行目的地需有名稱、國家與有效座標');
    }
    const dates = new Set();
    const ids = new Set();
    const days = records.slice(1).map(day => {
      if (day.type !== 'day' || !validDate(day.date) || !text(day.title) || !Array.isArray(day.items)) throw Error('每日資料需有有效的 date、title 與 items');
      if (dates.has(day.date)) throw Error(`日期重複：${day.date}`);
      dates.add(day.date);
      const place = day.location;
      if (!place || !text(place.name) || !Number.isFinite(place.latitude) || Math.abs(place.latitude) > 90 || !Number.isFinite(place.longitude) || Math.abs(place.longitude) > 180) throw Error(`${day.date} 的城市座標無效`);
      for (const item of day.items) {
        if (!item || !text(item.id) || !text(item.title) || !['note', 'mapQuery'].every(key => optional(item, key)) || (item.time !== undefined && !/^([01]\d|2[0-3]):[0-5]\d$/.test(item.time)) || (item.category !== undefined && !categories.includes(item.category))) throw Error(`${day.date} 有無效的行程項目`);
        if (item.coordinates !== undefined && (!item.coordinates || !Number.isFinite(item.coordinates.latitude) || Math.abs(item.coordinates.latitude) > 90 || !Number.isFinite(item.coordinates.longitude) || Math.abs(item.coordinates.longitude) > 180)) throw Error('行程地點座標無效');
        if (ids.has(item.id)) throw Error(`行程 ID 重複：${item.id}`);
        ids.add(item.id);
      }
      return day;
    }).sort((a, b) => a.date.localeCompare(b.date));
    if (!days.length) throw Error('行程檔至少需要一天資料');
    return { trip, days };
  }
  function parseChecklist(source) {
    const items = parseJSONL(source, '檢查表');
    const ids = new Set();
    for (const item of items) {
      if (!['id', 'group', 'title'].every(key => text(item[key])) || !optional(item, 'note')) throw Error('檢查表項目需有 id、group、title');
      if (ids.has(item.id)) throw Error(`檢查項目 ID 重複：${item.id}`);
      ids.add(item.id);
    }
    return items;
  }
  function today(timezone, now = new Date()) {
    const parts = new Intl.DateTimeFormat('en', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
    const part = type => parts.find(entry => entry.type === type).value;
    return `${part('year')}-${part('month')}-${part('day')}`;
  }
  function defaultSelection(days, date) {
    if (date < days[0].date) return 'pretrip';
    return [...days].reverse().find(day => day.date <= date).date;
  }
  // 首頁預覽：出發前顯示第一天，旅行中顯示當天，結束後顯示最後一天。
  function previewDay(days, date) {
    return [...days].reverse().find(day => day.date <= date) || days[0];
  }
  function parseShops(source) {
    const groups = parseJSONL(source, '店家檔');
    const groupIds = new Set();
    const shopIds = new Set();
    for (const group of groups) {
      if (!text(group.id) || !text(group.title) || !Array.isArray(group.shops)) throw Error('店家群組需有 id、title 與 shops');
      if (groupIds.has(group.id)) throw Error(`群組 ID 重複：${group.id}`);
      groupIds.add(group.id);
      for (const shop of group.shops) {
        if (!shop || !text(shop.id) || !text(shop.name) || !['area', 'note', 'mapQuery'].every(key => optional(shop, key))) throw Error(`${group.title} 有無效的店家資料`);
        if (shop.tags !== undefined && (!Array.isArray(shop.tags) || !shop.tags.every(text))) throw Error(`${shop.name} 的 tags 必須是文字陣列`);
        if (shopIds.has(shop.id)) throw Error(`店家 ID 重複：${shop.id}`);
        shopIds.add(shop.id);
      }
    }
    return groups;
  }
  function parseCoupons(source) {
    const coupons = parseJSONL(source, '優惠券檔');
    const ids = new Set();
    for (const coupon of coupons) {
      if (!['id', 'shop', 'image', 'alt'].every(key => text(coupon[key])) || !optional(coupon, 'note')) throw Error('優惠券需有 id、shop、image、alt');
      if (!/^\.\/assets\/coupons\/[\p{L}\p{N}._ -]+\.(png|jpe?g|webp|gif|svg)$/iu.test(coupon.image)) throw Error('優惠券圖片需放在 assets/coupons 資料夾');
      if (ids.has(coupon.id)) throw Error(`優惠券 ID 重複：${coupon.id}`);
      ids.add(coupon.id);
    }
    return coupons;
  }
  const api = { parseItinerary, parseChecklist, parseShops, parseCoupons, today, defaultSelection, previewDay };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TripData = api;
})(globalThis);
