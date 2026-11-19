// Uçtan uca testlerin ortak yardımcıları.

import { expect } from '@playwright/test';

export const API = 'http://127.0.0.1:54321';
export const SAHTE_PAROLA = 'sahte-yonetici-parolasi';
export const YONETICI_EPOSTA = 'yonetici@ornek.test';

export const MASAUSTU = { viewport: { width: 1280, height: 800 } };
export const MOBIL = {
  viewport: { width: 360, height: 640 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
};

/** Bir öğeye fare veya dokunmayla basar (cihaza göre). */
export async function bas(sayfa, seci, mobil) {
  const oge = typeof seci === 'string' ? sayfa.locator(seci) : seci;
  await expect(oge).toBeVisible();
  if (mobil) await oge.tap();
  else await oge.click();
}

/** Onam ve anketi doldurur. */
export async function onam_ve_anket(sayfa, { mobil }) {
  await sayfa.locator('[data-oge="onam-kutusu"]').check();
  await bas(sayfa, '[data-oge="onam-devam"]', mobil);
  const cihaz = mobil ? 'telefon' : 'bilgisayar';
  for (const secim of ['yas_grubu-21-30', 'cinsiyet-kadin', 'alisveris_sikligi-ayda_bir', `alisveris_cihazi-${cihaz}`,
    `katilim_cihazi-${cihaz}`, 'renk_ayirt_zorlugu-hayir']) {
    await sayfa.locator(`[data-oge="soru-${secim}"]`).check();
  }
  await bas(sayfa, '[data-oge="anket-devam"]', mobil);
}

/** Yönetici olarak sahte API'ye giriş yapar; erişim belirtecini döndürür. */
export async function yonetici_belirteci(istek) {
  const y = await istek.post(`${API}/auth/v1/token?grant_type=password`, {
    data: { email: YONETICI_EPOSTA, password: SAHTE_PAROLA },
    headers: { apikey: 'test' },
  });
  expect(y.ok()).toBeTruthy();
  return (await y.json()).access_token;
}

/** Yönetici belirteciyle bir tabloyu süzerek okur. */
export async function tablo_oku(istek, belirtec, tablo, sorgu = '') {
  const y = await istek.get(`${API}/rest/v1/${tablo}?select=*${sorgu}`, {
    headers: { apikey: 'test', Authorization: `Bearer ${belirtec}` },
  });
  expect(y.ok()).toBeTruthy();
  return y.json();
}

/**
 * Mağaza sayfasını akıştan bağımsız çizmek için test sahnesi: index.html'in
 * stilleriyle aynı, uygulama betiği olmadan. Aynı kökenden sunulur.
 */
export async function test_sahnesi_ac(sayfa) {
  const html = await (await sayfa.request.get('/')).text();
  const sade = html.replace(/<script[^>]*><\/script>/g, '');
  await sayfa.route('**/e2e-sahne.html', (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: sade }));
  await sayfa.goto('/e2e-sahne.html');
}

/**
 * Test sahnesinde bir koşulun mağaza sayfasını çizer (uygulamadaki gibi:
 * görseller çözülür, sahneye eklenir, iki kare beklenir).
 */
export async function magaza_ciz(sayfa, { cihaz, konum, renk, urun_kodu }) {
  await sayfa.evaluate(async ({ cihaz, konum, renk, urun_kodu }) => {
    const { magaza_sayfasi_olustur } = await import('./js/magaza/sablon.js');
    const { ekrani_goster } = await import('./js/ekran.js');
    const deney = await (await fetch('yapilandirma/deney.json')).json();
    const icerik = (await (await fetch('icerik/urunler.json')).json()).urunler;
    const urun = [...deney.urunler, deney.alistirma_urunu].find((u) => u.kod === (urun_kodu ?? deney.urunler[0].kod));
    await document.fonts.load('600 16px Inter', 'Sepete Ekle ğüşıöç');
    await document.fonts.load('400 16px Inter', 'Sepete Ekle ğüşıöç');
    const s = magaza_sayfasi_olustur({ cihaz, kosul: { konum, renk }, urun, icerik: icerik[urun.kod], renkler: deney.renkler });
    await ekrani_goster(document.getElementById('sahne'), s.dugum);
    await document.fonts.ready;
  }, { cihaz, konum, renk, urun_kodu });
}
