// Gönderim kuyruğu.
//
// Her deneme bittiğinde paket önce localStorage'daki kuyruğa yazılır, sonra
// gönderilmeye çalışılır. Kurallar:
//  - DENEME SÜRERKEN AĞ İSTEĞİ YOK: olcum_basladi() çağrılınca süren istek
//    iptal edilir ve olcum_bitti() çağrılana kadar yeni istek atılmaz.
//  - Geçici hatada (ağ yok, 429, 5xx) artan aralıkla yeniden denenir:
//    2, 4, 8, 16, 32, 60, 60 … saniye. Bağlantı geri gelince hemen denenir.
//  - Kota dolarsa paket izleri atılarak yazılır ve iz_eksik = true işaretlenir.
//  - Veritabanının kalıcı olarak reddettiği paket (girdi hatası) silinmez;
//    "reddedilenler" listesine taşınır. Katılımcının bitişi kilitlenmesin diye
//    aynı deneme için yedek paketler denenir (önce olaysız/izsiz, sonra yalnızca
//    sonuç). Bu bir proje kararıdır.
//  - Sayfa gizlenirken/kapanırken (deneme sürmüyorsa) kuyruğun başındaki paket
//    izleri çıkarılmış olarak keepalive ile bir kez gönderilir (≈64 KB sınırı).
//    sendBeacon kullanılmaz (apikey başlığı gönderilemez).
//
// Sunucu deneme_kaydet'i parça parça idempotent işlediği için aynı paketin
// birden çok kez gitmesi veri bozmaz.

import { deneme_kaydet, tercih_kaydet, ApiHatasi } from './api.js';

const anahtar = (demo) => (demo ? 'sepete_ekle_demo_kuyruk_v1' : 'sepete_ekle_kuyruk_v1');
const red_anahtari = (demo) => (demo ? 'sepete_ekle_demo_reddedilen_v1' : 'sepete_ekle_reddedilen_v1');

export const KEEPALIVE_MAKS_BAYT = 60000;
const BEKLEME_ADIMLARI_MS = [2000, 4000, 8000, 16000, 32000, 60000];

function oku(k) {
  try { return JSON.parse(localStorage.getItem(k) ?? '[]'); } catch { return []; }
}
function yaz(k, liste) {
  try { localStorage.setItem(k, JSON.stringify(liste)); return true; } catch { return false; }
}

/** Paketin izsiz kopyası (kota veya keepalive için). */
export function izsiz(oge) {
  if (oge.tur !== 'deneme') return oge;
  return { ...oge, govde: { ...oge.govde, paket: { ...oge.govde.paket, izler: [], iz_eksik: true } } };
}

/**
 * Kalıcı reddedilen deneme paketi için sırayla denenecek yedekler.
 * 1) olaylar ve izler olmadan, 2) yalnızca deneme_no, sonuç ve zorluk.
 */
export function yedek_paketler(oge) {
  if (oge.tur !== 'deneme') return [];
  const p = oge.govde.paket;
  const gecerli_sonuc = ['basarili', 'vazgecildi', 'zaman_asimi', 'kesildi'].includes(p?.sonuc) ? p.sonuc : 'kesildi';
  const zorluk = Number.isInteger(p?.zorluk_puani) && p.zorluk_puani >= 1 && p.zorluk_puani <= 7 ? p.zorluk_puani : null;
  return [
    { ...oge, yedek: 1, govde: { ...oge.govde, paket: { ...p, olaylar: [], izler: [], iz_eksik: true } } },
    {
      ...oge,
      yedek: 2,
      govde: {
        ...oge.govde,
        paket: { deneme_no: p?.deneme_no, sonuc: gecerli_sonuc, zorluk_puani: zorluk, iz_eksik: true, ozet: {}, olaylar: [], izler: [] },
      },
    },
  ];
}

/**
 * Kuyruğa bir öğe ekler. Kota dolarsa izsiz kopya yazılır.
 * @param {boolean} demo
 * @param {{tur: 'deneme'|'tercih', govde: object}} oge
 * @returns {boolean} yazılabildiyse true
 */
export function kuyruga_ekle(demo, oge) {
  const liste = oku(anahtar(demo));
  const kayit = { ...oge, eklenme: Date.now() }; // Date.now yalnızca kayıt için; süre ölçümüne girmez
  if (yaz(anahtar(demo), [...liste, kayit])) return true;
  return yaz(anahtar(demo), [...liste, izsiz(kayit)]);
}

export function bekleyen_sayisi(demo) {
  return oku(anahtar(demo)).length;
}

export function reddedilen_sayisi(demo) {
  return oku(red_anahtari(demo)).length;
}

// ---------------------------------------------------------------------
// Ölçüm kapısı: deneme sürerken ağ yok
// ---------------------------------------------------------------------
let olcum_suruyor = false;
let iptal_denetcisi = null;
let son_demo = false;

/** Deneme başladı: süren istek iptal edilir, yeni istek atılmaz. */
export function olcum_basladi() {
  olcum_suruyor = true;
  clearTimeout(yeniden_zamanlayici);
  yeniden_zamanlayici = null;
  iptal_denetcisi?.abort();
}

/** Deneme bitti: bekleyen gönderim varsa sürdürülür. */
export function olcum_bitti() {
  olcum_suruyor = false;
}

// ---------------------------------------------------------------------
// Gönderim
// ---------------------------------------------------------------------
let gonderiliyor = null;
let yeniden_zamanlayici = null;
let bekleme_adimi = 0;

/**
 * Kuyruktaki öğeleri sırayla gönderir. Aynı anda tek gönderim çalışır.
 * @returns {Promise<boolean>} kuyruk boşaldıysa true
 */
export function kuyrugu_gonder(demo) {
  son_demo = demo;
  if (olcum_suruyor) return Promise.resolve(false);
  if (!gonderiliyor) {
    gonderiliyor = gonder(demo).finally(() => { gonderiliyor = null; });
  }
  return gonderiliyor;
}

async function tek_gonder(oge, demo, secenekler) {
  if (oge.tur === 'deneme') return deneme_kaydet({ ...oge.govde, demo }, secenekler);
  if (oge.tur === 'tercih') return tercih_kaydet({ ...oge.govde, demo }, secenekler);
  throw new ApiHatasi('bilinmeyen_tur', 400);
}

async function gonder(demo) {
  for (;;) {
    if (olcum_suruyor) return false;
    const liste = oku(anahtar(demo));
    if (liste.length === 0) {
      bekleme_adimi = 0;
      return true;
    }
    const oge = liste[0];
    iptal_denetcisi = new AbortController();
    try {
      await tek_gonder(oge, demo, { signal: iptal_denetcisi.signal });
      bekleme_adimi = 0;
    } catch (hata) {
      if (hata instanceof ApiHatasi && hata.kalici_mi) {
        const red = oku(red_anahtari(demo));
        red.push({ ...oge, hata: hata.message, reddedilme: Date.now() });
        yaz(red_anahtari(demo), red);
        console.error('Paket veritabanınca reddedildi:', hata.message);
        // Yedek paket varsa asıl paketin yerine kuyruğa konur.
        const sonraki_yedek = oge.tur === 'deneme' ? yedek_paketler(oge)[oge.yedek ?? 0] : undefined;
        const guncel = oku(anahtar(demo));
        guncel.shift();
        if (sonraki_yedek) guncel.unshift(sonraki_yedek);
        yaz(anahtar(demo), guncel);
        continue;
      }
      // Geçici hata: artan aralıkla yeniden dene (deneme sürmüyorsa).
      yeniden_dene_kur(demo);
      return false;
    } finally {
      iptal_denetcisi = null;
    }
    // Gönderilen öğeyi kuyruktan çıkar.
    const guncel = oku(anahtar(demo));
    guncel.shift();
    yaz(anahtar(demo), guncel);
  }
}

function yeniden_dene_kur(demo) {
  if (olcum_suruyor || yeniden_zamanlayici) return;
  const bekleme = BEKLEME_ADIMLARI_MS[Math.min(bekleme_adimi, BEKLEME_ADIMLARI_MS.length - 1)];
  bekleme_adimi += 1;
  yeniden_zamanlayici = setTimeout(() => {
    yeniden_zamanlayici = null;
    kuyrugu_gonder(demo);
  }, bekleme);
}

/**
 * Sayfa gizlenirken son gönderim: kuyruğun başındaki paket izsiz olarak
 * keepalive ile gönderilir. Kuyruktan çıkarılmaz (sonuç bilinemez);
 * sonraki açılışta tam paket yeniden gönderilir, sunucu tekrarları yok sayar.
 */
export function son_gonderim(demo) {
  if (olcum_suruyor) return false;
  const oge = oku(anahtar(demo))[0];
  if (!oge) return false;
  const hafif = izsiz(oge);
  if (JSON.stringify(hafif.govde).length > KEEPALIVE_MAKS_BAYT) return false;
  tek_gonder(hafif, demo, { keepalive: true }).catch(() => {});
  return true;
}

/** Sayfa olaylarını bağlar: gizlenince keepalive, bağlantı gelince yeniden dene. */
export function kuyruk_olaylarini_bagla(demo) {
  son_demo = demo;
  const gizlendi = () => { if (document.visibilityState === 'hidden') son_gonderim(son_demo); };
  document.addEventListener('visibilitychange', gizlendi);
  window.addEventListener('pagehide', () => son_gonderim(son_demo));
  window.addEventListener('online', () => {
    clearTimeout(yeniden_zamanlayici);
    yeniden_zamanlayici = null;
    bekleme_adimi = 0;
    kuyrugu_gonder(son_demo);
  });
}
