// Yerel geliştirme sunucusu.
//
//   node scriptler/gelistirme_sunucusu.mjs               → site/ klasörünü http://127.0.0.1:8080 adresinde sunar
//   node scriptler/gelistirme_sunucusu.mjs --sahte-api   → ayrıca 127.0.0.1:54321'de BELLEKTE çalışan
//                                                          sahte bir Supabase API'si açar (scriptler/sahte_api.mjs)
//   ... --sahte-api --sahte-veri=120                     → panel için 120 sahte katılımcıyla başlar
//
// Sahte API yalnızca Docker / yerel Supabase yokken arayüzü denemek içindir:
// veriyi saklamaz, güvenlik kurallarını yalnızca kısmen taklit eder. Asıl testler yerel Supabase'e
// karşı koşar (npm run test:vt). Yerel Supabase çalışıyorsa --sahte-api
// KULLANMAYIN (aynı portu kullanır).

import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sahte_api_olustur } from './sahte_api.mjs';

const kok = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// SITE_KOKU: başka bir klasörü sunmak için (ör. damgalı _site/ ile e2e).
const site = path.resolve(kok, process.env.SITE_KOKU ?? 'site');
const PORT = Number(process.env.PORT ?? 8080);

const TURLER = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.txt': 'text/plain; charset=utf-8',
};

// ---- Statik dosya sunucusu ----
http.createServer(async (istek, yanit) => {
  try {
    const adres = new URL(istek.url, 'http://yerel');
    let yol = path.normalize(path.join(site, decodeURIComponent(adres.pathname)));
    if (!yol.startsWith(site)) { yanit.writeHead(403).end(); return; }
    if ((await stat(yol).catch(() => null))?.isDirectory()) yol = path.join(yol, 'index.html');
    const icerik = await readFile(yol);
    yanit.writeHead(200, {
      'Content-Type': TURLER[path.extname(yol)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    yanit.end(icerik);
  } catch {
    yanit.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Bulunamadı');
  }
}).listen(PORT, '127.0.0.1', () => console.log(`Site: http://127.0.0.1:${PORT}/`));

// ---- Sahte API ----
if (process.argv.includes('--sahte-api')) {
  const deney = JSON.parse(readFileSync(path.join(site, 'yapilandirma', 'deney.json'), 'utf8'));
  const veri = process.argv.find((a) => a.startsWith('--sahte-veri='));
  sahte_api_olustur({ deney, sahte_veri: veri ? Number(veri.split('=')[1]) : 0 });
}
