// Yayın öncesi sürüm damgası. site/ klasörünü _site/ klasörüne kopyalar ve
// kopyada şunları yapar (site/ değişmez):
//
//   1. yapilandirma/surum.js → UYGULAMA_SURUMU = "<kısa commit> <tarih> <commit özeti>" (en çok 64 karakter;
//      veritabanında katilimcilar.uygulama_surumu alanına yazılır).
//   2. HTML'deki yerel betik ve stil bağlantılarına ve JS modüllerinin göreli
//      import yollarına ?v=<kısa commit> eklenir; böylece GitHub Pages ve tarayıcı
//      önbelleği yeni sürümde eski dosyayı kullanmaz. (Yazı tipleri damgalanmaz:
//      önyükleme bağlantısı CSS'teki adresle birebir aynı kalmalı.)
//   3. index.html ve admin/index.html'deki CSP connect-src, yapilandirma/supabase.js
//      dosyasındaki SUPABASE_ADRESI'nin kökeniyle değiştirilir.
//   4. Güvenlik denetimi: gizli anahtar (sb_secret_ / service_role) izine
//      rastlanırsa, ya da adres yerel / anahtar yer tutucu ise yayın durur.
//
//   node scriptler/surum_damgala.mjs              (GitHub Actions'ta)
//   node scriptler/surum_damgala.mjs --yerel-izin (yerelde deneme: yerel adrese izin verir)

import { cp, rm, readFile, writeFile, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const kok = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arguman = (ad, varsayilan) => process.argv.find((a) => a.startsWith(`--${ad}=`))?.slice(ad.length + 3) ?? varsayilan;
const KAYNAK = path.resolve(kok, arguman('kaynak', 'site'));
const HEDEF = path.resolve(kok, arguman('hedef', '_site'));
const YEREL_IZIN = process.argv.includes('--yerel-izin');

function dur(mesaj) {
  console.error(`HATA: ${mesaj}`);
  process.exit(1);
}

// ---- Sürüm bilgisi ----
function git(...a) {
  try { return execFileSync('git', a, { cwd: kok, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return null; }
}
const tam_sha = git('rev-parse', 'HEAD') ?? process.env.GITHUB_SHA ?? null;
const kisa = tam_sha ? tam_sha.slice(0, 7) : `yerel${Date.now().toString(36)}`;
const tarih = git('log', '-1', '--format=%cs') ?? new Date().toISOString().slice(0, 10);
const ozet = (git('log', '-1', '--format=%s') ?? '').replace(/\s+/g, ' ');
const SURUM = `${kisa} ${tarih} ${ozet}`.trim().slice(0, 64);

// ---- Kopya ----
if (HEDEF === KAYNAK || !HEDEF.startsWith(kok)) dur(`Geçersiz hedef: ${HEDEF}`);
await rm(HEDEF, { recursive: true, force: true });
await cp(KAYNAK, HEDEF, { recursive: true });

async function dosyalar(klasor) {
  const sonuc = [];
  for (const g of await readdir(klasor, { withFileTypes: true })) {
    const yol = path.join(klasor, g.name);
    if (g.isDirectory()) sonuc.push(...await dosyalar(yol));
    else sonuc.push(yol);
  }
  return sonuc;
}
const butun = await dosyalar(HEDEF);

// ---- Supabase bağlantı bilgileri (yalnızca kopyaya yazılır) ----
// Canlı adres ve yayınlanabilir anahtar depoda tutulmaz; GitHub Actions'ta
// depo sırlarından (Settings > Secrets and variables > Actions) ortam
// değişkeni olarak gelir ve yalnızca _site/ kopyasına yazılır.
// Değişkenler yoksa site/ içindeki dosya olduğu gibi kalır (yerel deneme).
if (process.env.SUPABASE_ADRESI || process.env.SUPABASE_YAYINLANABILIR_ANAHTAR) {
  const adres = (process.env.SUPABASE_ADRESI ?? '').trim();
  const anahtar = (process.env.SUPABASE_YAYINLANABILIR_ANAHTAR ?? '').trim();
  if (!adres || !anahtar) dur('SUPABASE_ADRESI ve SUPABASE_YAYINLANABILIR_ANAHTAR birlikte verilmeli.');
  if (!/^[A-Za-z0-9:/._-]+$/.test(adres) || !/^[A-Za-z0-9_-]+$/.test(anahtar)) dur('Supabase adresi veya anahtarında beklenmeyen karakter var.');
  await writeFile(path.join(HEDEF, 'yapilandirma', 'supabase.js'),
    '// Yayın sırasında üretildi (scriptler/surum_damgala.mjs). Yayınlanabilir anahtar herkese açıktır;\n'
    + '// güvenlik veritabanındaki erişim kurallarından gelir.\n'
    + `export const SUPABASE_ADRESI = '${adres}';\n`
    + `export const SUPABASE_YAYINLANABILIR_ANAHTAR = '${anahtar}';\n`);
}

// ---- Supabase adresi ve anahtar denetimi ----
const { SUPABASE_ADRESI, SUPABASE_YAYINLANABILIR_ANAHTAR } = await import(pathToFileURL(path.join(HEDEF, 'yapilandirma', 'supabase.js')).href);
let koken;
try { koken = new URL(SUPABASE_ADRESI).origin; } catch { dur(`SUPABASE_ADRESI geçerli bir adres değil: ${SUPABASE_ADRESI}`); }
const yerel = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(koken);
if (yerel && !YEREL_IZIN) dur('site/yapilandirma/supabase.js hâlâ yerel adresi gösteriyor. Canlı proje adresini yazın (README > Canlıya alma).');
if (!yerel && !koken.startsWith('https://')) dur('Canlı Supabase adresi https ile başlamalı.');
if (!YEREL_IZIN && !/^sb_publishable_/.test(SUPABASE_YAYINLANABILIR_ANAHTAR)) {
  dur('SUPABASE_YAYINLANABILIR_ANAHTAR bir yayınlanabilir anahtar (sb_publishable_...) değil.');
}
for (const d of butun) {
  if (!/\.(js|mjs|html|json|css|txt)$/.test(d)) continue;
  const metin = await readFile(d, 'utf8');
  if (/sb_secret_[A-Za-z0-9]/.test(metin) || /service_role/.test(metin.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, ''))) {
    if (!d.includes(`${path.sep}kutuphaneler${path.sep}`)) dur(`Gizli anahtar izi: ${path.relative(HEDEF, d)}`);
  }
}

// ---- 1. surum.js ----
await writeFile(path.join(HEDEF, 'yapilandirma', 'surum.js'),
  `// Bu dosya yayın sırasında scriptler/surum_damgala.mjs ile yazıldı.\nexport const UYGULAMA_SURUMU = ${JSON.stringify(SURUM)};\n`);

// ---- 2. Önbellek damgası ----
const damga = `?v=${kisa}`;
let js_sayisi = 0;
for (const d of butun.filter((x) => x.endsWith('.js') && !x.includes(`${path.sep}kutuphaneler${path.sep}`))) {
  const once = await readFile(d, 'utf8');
  const sonra = once
    // import ... from './x.js'  /  export ... from './x.js'
    .replace(/(\bfrom\s*)(['"])(\.{1,2}\/[^'"?]+\.js)\2/g, `$1$2$3${damga}$2`)
    // import('./x.js')
    .replace(/(\bimport\s*\(\s*)(['"])(\.{1,2}\/[^'"?]+\.js)\2/g, `$1$2$3${damga}$2`)
    // dinamik olarak eklenen stil dosyası (ör. demo.css)
    .replace(/(['"])(css\/[^'"?]+\.css)\1/g, `$1$2${damga}$1`);
  if (sonra !== once) { await writeFile(d, sonra); js_sayisi += 1; }
}

// ---- 3. HTML: bağlantılar ve CSP ----
const CSP_DESENI = /(connect-src 'self')( [^;"]*)?(;)/;
for (const d of butun.filter((x) => x.endsWith('.html'))) {
  let metin = await readFile(d, 'utf8');
  metin = metin.replace(/((?:src|href)=")((?:\.\.\/)?(?:css|js|kutuphaneler)\/[^"?]+\.(?:js|css))(")/g, `$1$2${damga}$3`);
  if (metin.includes('Content-Security-Policy')) {
    if (!CSP_DESENI.test(metin)) dur(`${path.relative(HEDEF, d)}: CSP connect-src bulunamadı.`);
    metin = metin.replace(CSP_DESENI, `$1 ${koken}$3`);
  }
  await writeFile(d, metin);
}

console.log(`Sürüm: ${SURUM}`);
console.log(`Supabase kökeni (connect-src): ${koken}`);
console.log(`${path.relative(kok, HEDEF)}/ hazır (${butun.length} dosya, ${js_sayisi} JS dosyasında import damgalandı).`);
