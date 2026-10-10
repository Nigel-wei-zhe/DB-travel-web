const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = __dirname;
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.jsonl': 'text/plain; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' };
http.createServer((req, res) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch { res.writeHead(400); return res.end(); }
  const target = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  const relative = path.relative(root, target);
  const allowed = ['index.html', 'styles.css', 'app.js', 'icons.js', 'trip-data.js', 'itinerary.js', 'shops.js', path.join('data', 'itinerary.jsonl'), path.join('data', 'checklist.jsonl'), path.join('data', 'shops.jsonl')];
  allowed.push(path.join('assets', 'stamps', 'kuromi-maple.png'), 'visits.js', 'maps.js', path.join('vendor', 'leaflet', 'leaflet.js'), path.join('vendor', 'leaflet', 'leaflet.css'), 'coupons.js', path.join('data', 'coupons.jsonl'));
  const couponImage = path.dirname(relative) === path.join('assets', 'coupons') && ['.svg', '.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(path.extname(relative).toLowerCase());
  if (relative.startsWith('..') || path.isAbsolute(relative) || (!allowed.includes(relative) && !couponImage)) { res.writeHead(404); return res.end('Not found'); }
  fs.readFile(target, (error, data) => {
    if (error) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': types[path.extname(target)], 'Cache-Control': 'no-store' });
    res.end(data);
  });
}).listen(5173, '0.0.0.0', () => console.log('Travel preview: http://localhost:5173 (LAN access enabled)'));
