// Demo modu (?demo=1): şerit yalnızca demo modunda vardır, hiçbir öğeyi
// örtmez, canlı sayaç çalışır, versiyon seçici plan içinde geçiş yapar,
// elle cihaz seçimi çalışır ve veriler test_ tablolarına yazılır.

import { test, expect } from '@playwright/test';
import { MASAUSTU, bas, onam_ve_anket, yonetici_belirteci, tablo_oku } from './yardimcilar.mjs';

test.use(MASAUSTU);

test('normal modda demo şeridi ve demo modülü yoktur', async ({ page }) => {
  const yuklenenler = [];
  page.on('request', (r) => yuklenenler.push(new URL(r.url()).pathname));
  await page.goto('/');
  await expect(page.locator('[data-oge="onam-devam"]')).toBeVisible();
  await expect(page.locator('.demo-serit')).toHaveCount(0);
  expect(yuklenenler.some((y) => y.endsWith('/js/demo.js') || y.endsWith('/css/demo.css'))).toBe(false);
});

test('demo: sayaç, versiyon geçişi ve test_ tabloları', async ({ page, request }) => {
  await page.goto('/?demo=1');
  const serit = page.locator('.demo-serit');
  await expect(serit).toBeVisible();
  await onam_ve_anket(page, { mobil: false });

  // Versiyon seçicisinde 7 plan satırı; 3. denemeye geç.
  const versiyon = page.getByLabel('Versiyon');
  await expect(versiyon).toBeEnabled();
  await expect(versiyon.locator('option')).toHaveCount(7);
  const hedef_metin = await versiyon.locator('option').nth(3).textContent();
  const hedef_kosul = hedef_metin.match(/(K[12]R[123])/)[1];
  await versiyon.selectOption('3');
  await expect(page.locator('[data-oge="gorev-sirasi"]')).toHaveText('Görev 3 / 6');

  await bas(page, '[data-oge="basla-butonu"]', false);
  await expect(page.locator('.magaza')).toHaveAttribute('data-konum', hedef_kosul.slice(0, 2));
  await expect(page.locator('.magaza')).toHaveAttribute('data-renk', hedef_kosul.slice(2));
  await expect(versiyon).toBeDisabled();
  await expect(page.locator('.demo-sayac')).toContainText('kalan');

  // Şerit hiçbir mağaza öğesini örtmez: şeridin altı, sahnenin üstünden büyük değil.
  const serit_kutu = await serit.boundingBox();
  const sahne_kutu = await page.locator('#sahne').boundingBox();
  expect(serit_kutu.y + serit_kutu.height).toBeLessThanOrEqual(sahne_kutu.y + 0.5);

  await bas(page, '[data-oge="hedef-buton"]', false);
  await expect(page.locator('.demo-son')).toContainText('eklendi');
  await bas(page, '[data-oge="eklendi-devam"]', false);
  await bas(page, '[data-oge="zorluk-3"]', false);
  await bas(page, '[data-oge="zorluk-devam"]', false);
  await expect(page.locator('[data-oge="gorev-sirasi"]')).toHaveText('Görev 4 / 6');

  // Kayıt test_ tablosunda; gerçek tabloda yok.
  const durum = await page.evaluate(() => JSON.parse(localStorage.getItem('sepete_ekle_demo_durum_v1')));
  const id = durum.katilimci.katilimci_id;
  const belirtec = await yonetici_belirteci(request);
  await expect.poll(async () => (await tablo_oku(request, belirtec, 'test_genis_tablo', `&katilimci_id=eq.${id}`))
    .filter((s) => s.sonuc !== null).map((s) => `${s.deneme_no}:${s.kosul_kodu}:${s.sonuc}`)).toEqual([`3:${hedef_kosul}:basarili`]);
  expect(await tablo_oku(request, belirtec, 'genis_tablo', `&katilimci_id=eq.${id}`)).toHaveLength(0);
});

test('demo: elle mobil seçimi mobil şablonu açar', async ({ page }) => {
  await page.goto('/?demo=1');
  await page.getByLabel('Cihaz').selectOption('mobil');
  await expect(page.locator('body')).toHaveClass(/demo-mobil/);
  await onam_ve_anket(page, { mobil: false });
  await bas(page, '[data-oge="basla-butonu"]', false);
  await expect(page.locator('.magaza')).toHaveAttribute('data-cihaz', 'mobil');
  // Geniş pencerede yatay uyarısı çıkmaz.
  await expect(page.locator('.uyari-ortusu')).toBeHidden();
  const durum = await page.evaluate(() => JSON.parse(localStorage.getItem('sepete_ekle_demo_durum_v1')));
  expect(durum.cihaz.cihaz).toBe('mobil');
  expect(durum.cihaz.tespit.kural).toBe('demo_elle');
});
