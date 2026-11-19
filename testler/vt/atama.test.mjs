// Sıra ataması testleri (yerel Supabase gerekir: npx supabase start).
import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { plan_olustur } from '../../scriptler/williams.mjs';
import {
  havuz, sorgu, temizle, katilimci_olustur, katilimciyi_tamamla, deneme_kaydet, ornek_paket,
  reddedilmeli,
} from '../yardimci/vt.mjs';

const deney = JSON.parse(readFileSync(new URL('../../site/yapilandirma/deney.json', import.meta.url), 'utf8'));

beforeEach(temizle);
after(() => havuz.end());

test('art arda 12 katılımcı 0–11 numaralarını alır; planlar JS kuralıyla aynı ve dengeli', async () => {
  const planlar = [];
  for (let k = 0; k < 12; k++) {
    const s = await katilimci_olustur();
    await katilimciyi_tamamla(s.katilimci_id);
    assert.equal(s.sira_no, k);
    assert.equal(s.plan.length, 7);
    assert.deepEqual(s.plan[0], {
      deneme_no: 0, kosul_indeksi: null, kosul_kodu: 'K1R0', konum: 'K1', renk: 'R0', urun_kodu: 'defter',
    });
    const beklenen = plan_olustur(k, deney);
    assert.deepEqual(s.plan.slice(1), beklenen);
    planlar.push(s.plan.slice(1));
  }
  // Veritabanındaki satırlar da aynı dengeyi taşımalı: her ürün her sırada 2 kez.
  const satirlar = await sorgu(`
    select urun_kodu, deneme_no, count(*)::int as n from public.denemeler
    where deneme_no > 0 group by 1, 2`);
  assert.equal(satirlar.length, 36);
  assert.ok(satirlar.every((r) => r.n === 2));
});

test('masaüstü ve mobil numaraları ayrı dağıtılır', async () => {
  const m1 = await katilimci_olustur({ cihaz: 'masaustu' });
  const t1 = await katilimci_olustur({ cihaz: 'mobil' });
  const m2 = await katilimci_olustur({ cihaz: 'masaustu' });
  const t2 = await katilimci_olustur({ cihaz: 'mobil', tablet_mi: true });
  assert.deepEqual([m1.sira_no, m2.sira_no, t1.sira_no, t2.sira_no], [0, 1, 0, 1]);
});

test('eşzamanlı başlangıçlar farklı numara alır', async () => {
  const sonuclar = await Promise.all(Array.from({ length: 10 }, () => katilimci_olustur()));
  const numaralar = sonuclar.map((s) => s.sira_no).sort((a, b) => a - b);
  assert.deepEqual(numaralar, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
});

test('30 dakikadır etkinliği olmayanın numarası yeniden verilir; dönerse çakışma işaretlenir', async () => {
  const eski = await katilimci_olustur();
  await sorgu(`update public.katilimcilar set son_etkinlik_zamani = now() - interval '31 minutes'
               where katilimci_id = $1`, [eski.katilimci_id]);
  const yeni = await katilimci_olustur();
  assert.equal(yeni.sira_no, 0, 'boşalan numara yeniden verilmeli');

  const [durum] = await sorgu('select durum from public.katilimcilar where katilimci_id = $1', [eski.katilimci_id]);
  assert.equal(durum.durum, 'birakti');

  // Eski katılımcı geri döner ve bir deneme gönderir.
  await deneme_kaydet(eski.katilimci_id, ornek_paket(1));
  const [geri] = await sorgu('select durum, sira_cakismasi from public.katilimcilar where katilimci_id = $1',
    [eski.katilimci_id]);
  assert.deepEqual(geri, { durum: 'devam_ediyor', sira_cakismasi: true });

  // Çakışmalı katılımcı numara tutmaz: sıradaki katılımcı 1 alır.
  assert.equal((await katilimci_olustur()).sira_no, 1);
});

test('bırakan katılımcı numarası başkasına verilmeden dönerse çakışma işaretlenmez', async () => {
  const eski = await katilimci_olustur({ cihaz: 'masaustu' });
  await sorgu(`update public.katilimcilar set son_etkinlik_zamani = now() - interval '31 minutes'
               where katilimci_id = $1`, [eski.katilimci_id]);
  await katilimci_olustur({ cihaz: 'mobil' }); // eskiyi 'birakti' yapar, masaüstü numarasını almaz
  await deneme_kaydet(eski.katilimci_id, ornek_paket(1));
  const [geri] = await sorgu('select durum, sira_cakismasi from public.katilimcilar where katilimci_id = $1',
    [eski.katilimci_id]);
  assert.deepEqual(geri, { durum: 'devam_ediyor', sira_cakismasi: false });
  assert.equal((await katilimci_olustur({ cihaz: 'masaustu' })).sira_no, 1);
});

test('tamamlayan numarasını tutar; hariç tutulanın numarası boşa çıkar', async () => {
  const a = await katilimci_olustur();
  await katilimciyi_tamamla(a.katilimci_id);
  await sorgu(`update public.katilimcilar set son_etkinlik_zamani = now() - interval '2 days'
               where katilimci_id = $1`, [a.katilimci_id]);
  const b = await katilimci_olustur();
  assert.equal(b.sira_no, 1, 'tamamlayan 0 numarasını tutmalı');

  await sorgu(`update public.katilimcilar set haric_tutuldu = true, haric_nedeni = 'teknik_hata'
               where katilimci_id = $1`, [a.katilimci_id]);
  const c = await katilimci_olustur();
  assert.equal(c.sira_no, 0, 'hariç tutulanın numarası yeniden verilmeli');
});

test('demo katılımcıları test_ tablolarına yazılır ve gerçek numara tüketmez', async () => {
  const d1 = await katilimci_olustur({ demo: true });
  const d2 = await katilimci_olustur({ demo: true });
  assert.deepEqual([d1.sira_no, d2.sira_no], [0, 1]);
  const [gercek] = await sorgu('select count(*)::int as n from public.katilimcilar');
  const [demo] = await sorgu('select count(*)::int as n from public.test_katilimcilar');
  assert.equal(gercek.n, 0);
  assert.equal(demo.n, 2);
  assert.equal((await katilimci_olustur()).sira_no, 0);
});

test('kötüye kullanım freni: bir dakikada 30 katılımcıdan fazlası reddedilir', async () => {
  for (let i = 0; i < 30; i++) await katilimci_olustur();
  await reddedilmeli(katilimci_olustur(), 'cok_fazla_katilimci');
  // Demo tabloları ayrı sayılır.
  await katilimci_olustur({ demo: true });
});

test('katılımcı kodu 8 karakter, karışan karakter içermez ve benzersizdir', async () => {
  const kodlar = new Set();
  for (let i = 0; i < 20; i++) {
    const s = await katilimci_olustur({ demo: true });
    assert.match(s.katilimci_kodu, /^[ABCDEFGHJKLMNPQRSTUVWXYZ2-9]{8}$/);
    kodlar.add(s.katilimci_kodu);
  }
  assert.equal(kodlar.size, 20);
});

test('cihaz uyuşmazlığı işaretlenir', async () => {
  const s = await katilimci_olustur({
    cihaz: 'mobil', anket: { yas_grubu: '21-30', cinsiyet: 'erkek', alisveris_sikligi: 'ayda_bir',
      alisveris_cihazi: 'telefon', katilim_cihazi: 'bilgisayar', renk_ayirt_zorlugu: 'hayir' },
  });
  assert.equal(s.cihaz_uyusmazligi, true);
  const [r] = await sorgu('select cihaz_uyusmazligi from public.katilimcilar where katilimci_id = $1', [s.katilimci_id]);
  assert.equal(r.cihaz_uyusmazligi, true);
});
