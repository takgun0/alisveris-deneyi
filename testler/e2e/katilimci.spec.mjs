// Katılımcı akışı (masaüstü ve mobil): onam → anket → alıştırma + 6 deneme
// → tercih → teşekkür. Sonra veritabanında (sahte API) kayıtlar denetlenir.
//
// Denetlenenler:
//   - deneme sürerken (Başla'dan hedef butona kadar) hiç ağ isteği atılmaz,
//   - 7 deneme kaydı, 6 koşulun her biri bir kez, alıştırma K1R0,
//   - süreler pozitif ve olay sayısı tutarlı, katılımcı 'tamamlandi',
//   - bir denemede "Vazgeç" → sonuç 'vazgecildi' ve tıklama süresi yok,
//   - hatalı tıklama (favori) sayılır.

import { test, expect } from '@playwright/test';
import {
  MASAUSTU, MOBIL, bas, onam_ve_anket, yonetici_belirteci, tablo_oku,
} from './yardimcilar.mjs';

for (const [ad, ayar, mobil] of [['masaüstü', MASAUSTU, false], ['mobil', MOBIL, true]]) {
  test.describe(`katılımcı akışı (${ad})`, () => {
    test.use(ayar);

    test('deney baştan sona tamamlanır ve kayıtlar doğrudur', async ({ page, request }) => {
      // Deneme pencereleri (Başla pointerup → hedef/Vazgeç onayı pointerup) sayfanın
      // kendi zaman tabanında kaydedilir; istekler Resource Timing ile karşılaştırılır.
      // (Playwright'ın request olayı birkaç ms gecikebildiğinden sayfa içi ölçüm kullanılır.)
      await page.addInitScript(() => {
        window.__deneme_pencereleri = [];
        document.addEventListener('pointerup', (o) => {
          const oge = o.target.closest?.('[data-oge]')?.dataset.oge;
          if (oge === 'basla-butonu') window.__deneme_pencereleri.push([o.timeStamp, null]);
          if (oge === 'hedef-buton' || oge === 'vazgec-onayla') {
            const son = window.__deneme_pencereleri.at(-1);
            if (son && son[1] === null) son[1] = o.timeStamp;
          }
        }, true);
      });
      await page.goto('/');
      await onam_ve_anket(page, { mobil });

      const goruleri = [];
      for (let i = 0; i < 7; i += 1) {
        await expect(page.locator('[data-oge="basla-butonu"]')).toBeVisible();
        await bas(page, '[data-oge="basla-butonu"]', mobil);

        const magaza = page.locator('.magaza');
        await expect(magaza).toBeVisible();
        goruleri.push({ konum: await magaza.getAttribute('data-konum'), renk: await magaza.getAttribute('data-renk') });

        if (i === 1) {
          // Hatalı tıklama (favori), sonra hedef buton.
          await bas(page, '[data-oge="favori-butonu"]', mobil);
        }
        if (i === 3) {
          // Vazgeç → onay.
          await bas(page, '[data-oge="vazgec-butonu"]', mobil);
          await bas(page, '[data-oge="vazgec-onayla"]', mobil);
          continue;
        }
        const hedef = page.locator('[data-oge="hedef-buton"]');
        await hedef.scrollIntoViewIfNeeded();
        await bas(page, hedef, mobil);

        await bas(page, '[data-oge="eklendi-devam"]', mobil);
        await bas(page, '[data-oge="zorluk-4"]', mobil);
        await bas(page, '[data-oge="zorluk-devam"]', mobil);
      }

      const { pencereler, istekler } = await page.evaluate(() => ({
        pencereler: window.__deneme_pencereleri,
        istekler: performance.getEntriesByType('resource').map((e) => ({ ad: e.name, bas: e.startTime })),
      }));
      expect(pencereler).toHaveLength(7);
      const ihlaller = istekler.filter((r) => pencereler.some(([p0, p1]) => r.bas >= p0 && r.bas <= (p1 ?? Infinity)));
      expect(ihlaller, 'deneme sürerken ağ isteği atılmamalı').toEqual([]);
      expect(istekler.filter((r) => r.ad.includes('deneme_kaydet')).length).toBeGreaterThanOrEqual(7);

      // Alıştırma K1R0; sonraki 6 deneme 6 koşulun her biri bir kez.
      expect(goruleri[0]).toEqual({ konum: 'K1', renk: 'R0' });
      const kosullar = goruleri.slice(1).map((g) => g.konum + g.renk).sort();
      expect(kosullar).toEqual(['K1R1', 'K1R2', 'K1R3', 'K2R1', 'K2R2', 'K2R3']);

      // Tercih sorusu.
      await bas(page, '[data-oge="tercih-en-cok-1"]', mobil);
      await bas(page, '[data-oge="tercih-en-az-2"]', mobil);
      await bas(page, '[data-oge="tercih-devam"]', mobil);
      await expect(page.locator('[data-oge="tesekkur"]')).toBeVisible({ timeout: 30_000 });
      const kod = (await page.locator('[data-oge="katilimci-kodu"]').textContent()).trim();
      expect(kod).toMatch(/^[A-Z0-9]{8}$/);

      // ---- Veritabanı denetimi ----
      const belirtec = await yonetici_belirteci(request);
      const satirlar = await tablo_oku(request, belirtec, 'genis_tablo', `&katilimci_kodu=eq.${kod}`);
      expect(satirlar).toHaveLength(7);
      satirlar.sort((a, b) => a.deneme_no - b.deneme_no);
      expect(satirlar.every((s) => s.cihaz === (mobil ? 'mobil' : 'masaustu'))).toBe(true);
      expect(satirlar.every((s) => s.durum === 'tamamladi')).toBe(true);
      expect(satirlar[0]).toMatchObject({ deneme_no: 0, kosul_kodu: 'K1R0', konum: 'K1', renk: 'R0' });

      for (const s of satirlar) {
        const gorulen = goruleri[s.deneme_no];
        expect(s.kosul_kodu, `deneme ${s.deneme_no} koşulu`).toBe(gorulen.konum + gorulen.renk);
        if (s.deneme_no === 3) {
          expect(s.sonuc).toBe('vazgecildi');
          expect(s.tiklama_suresi_ms).toBeNull();
          continue;
        }
        expect(s.sonuc).toBe('basarili');
        expect(s.zorluk_puani).toBe(4);
        expect(s.tiklama_suresi_ms).toBeGreaterThan(0);
        expect(s.gorev_suresi_ms).toBeGreaterThanOrEqual(s.tiklama_suresi_ms);
        expect(s.iz_eksik).toBe(false);
      }
      expect(satirlar[1].hatali_tiklama_sayisi).toBeGreaterThanOrEqual(1);

      // Olaylar: her denemede sayfa görüntüleme ve bitiş olayı var.
      const olaylar = await tablo_oku(request, belirtec, 'olaylar', `&katilimci_id=eq.${satirlar[0].katilimci_id}`);
      for (const s of satirlar) {
        const bu = olaylar.filter((o) => Number(o.deneme_id) === Number(s.deneme_id)).map((o) => o.olay_turu);
        expect(bu).toContain('sayfa_goruntulendi');
        expect(bu).toContain(s.sonuc === 'basarili' ? 'gorev_tamamlandi' : 'vazgecildi');
      }

      // Tercih kaydı.
      const tercihler = await tablo_oku(request, belirtec, 'tercihler', `&katilimci_id=eq.${satirlar[0].katilimci_id}`);
      expect(tercihler).toHaveLength(1);
    });
  });
}

test.describe('yenileme kuralları', () => {
  test.use(MASAUSTU);

  test('ürün sayfasında yenilenen deneme "kesildi" olarak kaydedilir ve sonraki göreve geçilir', async ({ page, request }) => {
    await page.goto('/');
    await onam_ve_anket(page, { mobil: false });
    await bas(page, '[data-oge="basla-butonu"]', false);
    await expect(page.locator('.magaza')).toBeVisible();
    await page.reload();
    await expect(page.locator('[data-oge="gorev-sirasi"]')).toHaveText('Görev 1 / 6');

    const durum = await page.evaluate(() => JSON.parse(localStorage.getItem('sepete_ekle_durum_v1')));
    const belirtec = await yonetici_belirteci(request);
    await expect.poll(async () => {
      const s = await tablo_oku(request, belirtec, 'genis_tablo', `&katilimci_id=eq.${durum.katilimci.katilimci_id}`);
      return s.filter((x) => x.sonuc !== null).map((x) => `${x.deneme_no}:${x.sonuc}`);
    }).toEqual(['0:kesildi']);
  });
});
