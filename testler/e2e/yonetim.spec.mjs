// Yönetim paneli: giriş, kurala göre toplu hariç tutma, geri alma, işlem kaydı
// ve dışa aktarma (CSV ve xlsx). Sahte API 40 sahte katılımcıyla başlar.

import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { SAHTE_PAROLA, YONETICI_EPOSTA, yonetici_belirteci, tablo_oku } from './yardimcilar.mjs';

test.use({ viewport: { width: 1400, height: 900 } });

async function giris(page) {
  await page.goto('/admin/');
  await page.getByLabel('Kullanıcı adı').fill(YONETICI_EPOSTA);
  await page.getByLabel('Parola').fill(SAHTE_PAROLA);
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  await expect(page.getByRole('tab', { name: 'Özet' })).toBeVisible();
}

async function bildirim_bekle(page, metin) {
  await expect(page.locator('.bildirim')).toContainText(metin, { timeout: 15_000 });
}

test('hatalı parola reddedilir', async ({ page }) => {
  await page.goto('/admin/');
  await page.getByLabel('Kullanıcı adı').fill(YONETICI_EPOSTA);
  await page.getByLabel('Parola').fill('yanlis');
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  await expect(page.getByRole('alert')).toHaveText('Kullanıcı adı veya parola hatalı.');
});

test('5 hatalı denemeden sonra giriş kilitlenir; yenilemede kilit sürer', async ({ page }) => {
  await page.goto('/admin/');
  const dugme = page.getByRole('button', { name: 'Giriş yap' });
  for (let i = 1; i <= 5; i++) {
    await page.getByLabel('Kullanıcı adı').fill(YONETICI_EPOSTA);
    await page.getByLabel('Parola').fill(`yanlis-${i}`);
    await dugme.click();
    await expect(page.getByRole('alert')).not.toHaveText('');
  }
  await expect(page.getByRole('alert')).toContainText('Çok fazla hatalı deneme.');
  await expect(dugme).toBeDisabled();
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('Çok fazla hatalı deneme.');
  await expect(page.getByRole('button', { name: 'Giriş yap' })).toBeDisabled();
});

test('kurala göre toplu hariç tutma, geri alma ve işlem kaydı', async ({ page, request }) => {
  await giris(page);
  await page.getByRole('tab', { name: 'Denemeler ve temizleme' }).click();

  // Kural: tıklama süresi 3 sn'den uzun (sahte veride birçok deneme).
  await page.getByLabel('Eşik (sn)').fill('3');
  await page.getByLabel('Eşik (sn)').dispatchEvent('change');
  await page.getByRole('button', { name: 'Önizle' }).click();
  const onizleme = page.locator('.onizleme');
  await expect(onizleme).toContainText('hariç tutulacak');
  const n = Number((await onizleme.locator('p').first().textContent()).match(/(\d+) deneme/)[1]);
  expect(n).toBeGreaterThan(0);

  await page.getByRole('button', { name: 'Önizlenenleri hariç tut' }).click();
  await bildirim_bekle(page, `${n} deneme, 0 katılımcı hariç tutuldu`);

  // Veritabanında: tam olarak n deneme hariç; veri silinmedi.
  const belirtec = await yonetici_belirteci(request);
  const denemeler = await tablo_oku(request, belirtec, 'denemeler');
  expect(denemeler.filter((d) => d.haric_tutuldu)).toHaveLength(n);
  expect(denemeler.filter((d) => d.haric_tutuldu).every((d) => d.haric_nedeni === 'asiri_uzun_sure')).toBe(true);

  // Geri alma (toplu).
  await page.getByRole('tab', { name: 'Hariç tutulanlar' }).click();
  await expect(page.getByRole('heading', { name: `Hariç tutulan denemeler (${n})` })).toBeVisible();
  await page.getByRole('button', { name: `Listelenen ${n} denemenin hepsini geri al` }).click();
  await bildirim_bekle(page, `${n} kayıt geri alındı`);
  const sonra = await tablo_oku(request, belirtec, 'denemeler');
  expect(sonra.filter((d) => d.haric_tutuldu)).toHaveLength(0);
  expect(sonra).toHaveLength(denemeler.length);

  // İşlem kaydı: iki işlem, kural bilgisiyle.
  await page.getByRole('tab', { name: 'İşlem kaydı' }).click();
  const tablo = page.locator('table');
  await expect(tablo).toContainText('Hariç tutma');
  await expect(tablo).toContainText('Hariç tutmayı geri alma');
  const kayit = await tablo_oku(request, belirtec, 'islem_kaydi');
  const haric = kayit.find((i) => i.islem === 'haric_tut');
  expect(haric.kural).toMatchObject({ kural: 'uzun_sure', esik_sn: 3 });
  expect(haric.etkilenen.deneme_idler).toHaveLength(n);
  expect(kayit.some((i) => i.islem === 'haric_geri_al')).toBe(true);
});

test('dışa aktarma: CSV (BOM, CRLF) ve xlsx; işlem kaydına yazılır', async ({ page, request }) => {
  await giris(page);
  await page.getByRole('tab', { name: 'Dışa aktar' }).click();
  const satir = page.locator('.kural-satiri', { has: page.getByRole('heading', { name: 'Deneme özetleri' }) });

  const [csv_indirme] = await Promise.all([page.waitForEvent('download'), satir.getByRole('button', { name: 'CSV' }).click()]);
  expect(csv_indirme.suggestedFilename()).toMatch(/\.csv$/);
  const csv = await readFile(await csv_indirme.path());
  expect([...csv.subarray(0, 3)]).toEqual([0xEF, 0xBB, 0xBF]);
  const metin = csv.toString('utf8').slice(1);
  const satirlar = metin.split('\r\n').filter(Boolean);
  expect(satirlar.length).toBeGreaterThan(1);
  const basliklar = satirlar[0].split(',');
  for (const b of ['katilimci_kodu', 'deneme_no', 'kosul_kodu', 'tiklama_suresi_ms', 'haric_tutuldu', 'haric_nedeni']) {
    expect(basliklar).toContain(b);
  }
  expect(metin.includes('\n') && !/[^\r]\n/.test(metin)).toBe(true); // yalnızca CRLF

  const [xlsx_indirme] = await Promise.all([page.waitForEvent('download'), satir.getByRole('button', { name: 'xlsx' }).click()]);
  expect(xlsx_indirme.suggestedFilename()).toMatch(/\.xlsx$/);
  const xlsx = await readFile(await xlsx_indirme.path());
  expect(xlsx.subarray(0, 2).toString('latin1')).toBe('PK');
  await bildirim_bekle(page, 'indirildi');

  const belirtec = await yonetici_belirteci(request);
  const kayit = await tablo_oku(request, belirtec, 'islem_kaydi');
  const aktarimlar = kayit.filter((i) => i.islem === 'disa_aktar' && i.etkilenen.tur === 'deneme_ozetleri');
  expect(aktarimlar.map((i) => i.etkilenen.bicim).sort()).toEqual(['csv', 'xlsx']);
});

test('panel başka bir sayfanın çerçevesi içinde başlamaz', async ({ page }) => {
  await page.route('**/e2e-cerceve.html', (r) => r.fulfill({ contentType: 'text/html', body: '<iframe src="/admin/" width="800" height="600"></iframe>' }));
  await page.goto('/e2e-cerceve.html');
  const cerceve = page.frameLocator('iframe');
  await expect(cerceve.getByText('Yönetim paneli başka bir sayfanın içinde açılamaz.')).toBeVisible();
  await expect(cerceve.getByLabel('Parola')).toHaveCount(0);
});
