// Mağaza sayfasının değişmezleri.
//
// 1. Piksel değişmezliği: aynı cihazda 6 versiyonun tam sayfa görüntüsü,
//    izin verilen farkların bulunduğu alanlar (hedef buton yuvaları, dört vurgu
//    öğesi, mobil alt çubuk) aynı renkle örtüldükten sonra BİREBİR aynıdır.
//    Ayrıca bütün [data-oge] öğelerinin konumu, boyutu ve metni aynıdır.
// 2. İlk ekran: masaüstü 1024×600 ve mobil 360×560'ta K1 ilk ekranda tamamen
//    görünür; mobilde K1 ürün görselinin üstünde ve ekranın üst yarısındadır;
//    K1 ve K2 merkezleri arasında en az 200 px vardır; K2 de ilk ekrandadır
//    (masaüstünde yan panelin üstü, mobilde sabit alt çubuk).

import { test, expect } from '@playwright/test';
import { MOBIL, test_sahnesi_ac, magaza_ciz } from './yardimcilar.mjs';

const KOSULLAR = ['K1R1', 'K1R2', 'K1R3', 'K2R1', 'K2R2', 'K2R3'].map((k) => ({ konum: k.slice(0, 2), renk: k.slice(2) }));

/** Bütün [data-oge] öğelerinin geometrisi ve metni (izin verilen farklar hariç). */
async function geometri(page) {
  return page.evaluate(() => [...document.querySelectorAll('#sahne [data-oge]')]
    .filter((o) => !['hedef-buton', 'alt-cubuk'].includes(o.dataset.oge) && !o.closest('.alt-cubuk'))
    .map((o) => {
      const r = o.getBoundingClientRect();
      const s = getComputedStyle(o);
      return {
        oge: o.dataset.oge,
        x: r.x, y: r.y + window.scrollY, g: r.width, y_: r.height,
        // Hedef butonun metni (her koşulda "Sepete Ekle") yuvaya göre farklı kapsayıcıda olduğundan çıkarılır.
        metin: (() => { const k = o.cloneNode(true); k.querySelectorAll('.hedef-buton').forEach((b) => b.remove()); return k.textContent; })(),
        yazi: `${s.fontSize} ${s.fontWeight} ${s.color}`,
        // Vurgu öğelerinin dolgusu koşula göre değişebilir; diğerlerininki değişmez.
        dolgu: o.classList.contains('vurgu') ? null : s.backgroundColor,
      };
    }));
}

/**
 * İzin verilen farkların bulunduğu alanları örter: iki yuva, dört vurgu öğesi
 * ve (mobilde) alt çubuk alanı. Örtüler her versiyonda aynı yerde ve renktedir.
 */
async function farklari_ort(page, cihaz) {
  await page.evaluate((cihaz) => {
    const ortu = (r, sabit) => {
      const d = document.createElement('div');
      d.className = 'e2e-ortu';
      Object.assign(d.style, {
        position: sabit ? 'fixed' : 'absolute', zIndex: 2000, background: '#FF00FF', pointerEvents: 'none',
        left: `${r.left - 2}px`, top: `${r.top - 2 + (sabit ? 0 : window.scrollY)}px`, width: `${r.width + 4}px`, height: `${r.height + 4}px`,
      });
      document.body.append(d);
    };
    for (const o of document.querySelectorAll('#sahne .yuva, #sahne .vurgu')) {
      if (o.closest('.alt-cubuk')) continue;
      ortu(o.getBoundingClientRect(), false);
    }
    if (cihaz === 'mobil') {
      // Alt çubuk (76 px, sabit) yalnızca K2'de vardır; alanı her versiyonda örtülür.
      // bottom: 0 ile konumlanır; tam sayfa görüntüsünde de alt çubukla aynı yerde kalır.
      const d = document.createElement('div');
      d.className = 'e2e-ortu';
      Object.assign(d.style, { position: 'fixed', left: 0, right: 0, bottom: 0, height: '80px', zIndex: 2000, background: '#FF00FF', pointerEvents: 'none' });
      document.body.append(d);
    }
  }, cihaz);
}

for (const [cihaz, ayar] of [['masaustu', { viewport: { width: 1280, height: 800 } }], ['mobil', MOBIL]]) {
  test.describe(`piksel değişmezliği (${cihaz})`, () => {
    test.use(ayar);

    test('6 versiyon izin verilen alanlar dışında birebir aynıdır', async ({ page }) => {
      await test_sahnesi_ac(page);
      let ilk_goruntu = null;
      let ilk_geometri = null;
      for (const k of KOSULLAR) {
        await magaza_ciz(page, { cihaz, ...k });
        // Hedef buton doğru yuvada ve koşulun renginde.
        const yuva = await page.locator('[data-oge="hedef-buton"]').evaluate((b) => b.parentElement.dataset.oge);
        expect(yuva).toBe(k.konum === 'K1' ? 'yuva-1' : 'yuva-2');
        expect(await page.locator('.magaza').getAttribute('data-renk')).toBe(k.renk);

        const g = await geometri(page);
        if (ilk_geometri) expect(g, `${k.konum}${k.renk} geometri`).toEqual(ilk_geometri);
        else ilk_geometri = g;

        await farklari_ort(page, cihaz);
        const goruntu = await page.screenshot({ fullPage: true, animations: 'disabled', caret: 'hide' });
        await page.evaluate(() => document.querySelectorAll('.e2e-ortu').forEach((d) => d.remove()));
        if (ilk_goruntu) {
          expect(goruntu.equals(ilk_goruntu), `${k.konum}${k.renk} görüntüsü K1R1 ile aynı olmalı`).toBe(true);
        } else {
          ilk_goruntu = goruntu;
        }
      }
    });
  });
}

/** Ölçüler: sahnenin görünür alanına göre (kaydırma 0). */
async function olculer(page) {
  return page.evaluate(() => {
    const r = (s) => document.querySelector(s)?.getBoundingClientRect() ?? null;
    return {
      hedef: r('[data-oge="hedef-buton"]'),
      gorsel: r('[data-oge="urun-gorseli"]'),
      yukseklik: window.innerHeight,
      genislik: window.innerWidth,
      kaydirma: window.scrollY,
    };
  });
}

const merkez = (r) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });

for (const [cihaz, ayar] of [
  ['masaustu', { viewport: { width: 1024, height: 600 } }],
  ['mobil', { ...MOBIL, viewport: { width: 360, height: 560 } }],
]) {
  test.describe(`ilk ekran görünürlüğü (${cihaz} ${ayar.viewport.width}×${ayar.viewport.height})`, () => {
    test.use(ayar);

    test('K1 ve K2 ilk ekranda; K1–K2 merkez uzaklığı ≥ 200 px', async ({ page }) => {
      await test_sahnesi_ac(page);
      const merkezler = {};
      for (const konum of ['K1', 'K2']) {
        await magaza_ciz(page, { cihaz, konum, renk: 'R1' });
        const o = await olculer(page);
        expect(o.kaydirma).toBe(0);
        // Buton tamamen ilk ekranda.
        expect(o.hedef.top, `${konum} üst`).toBeGreaterThanOrEqual(0);
        expect(o.hedef.bottom, `${konum} alt`).toBeLessThanOrEqual(o.yukseklik);
        expect(o.hedef.left).toBeGreaterThanOrEqual(0);
        expect(o.hedef.right).toBeLessThanOrEqual(o.genislik);
        if (cihaz === 'mobil' && konum === 'K1') {
          expect(o.hedef.bottom, 'K1 görselin üstünde').toBeLessThanOrEqual(o.gorsel.top);
          expect(merkez(o.hedef).y, 'K1 ekranın üst yarısında').toBeLessThan(o.yukseklik / 2);
        }
        merkezler[konum] = merkez(o.hedef);
      }
      const uzaklik = Math.hypot(merkezler.K1.x - merkezler.K2.x, merkezler.K1.y - merkezler.K2.y);
      expect(uzaklik).toBeGreaterThanOrEqual(200);
    });
  });
}
