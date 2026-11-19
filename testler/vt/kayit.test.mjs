// deneme_kaydet, tercih_kaydet, katilimci_bitir: idempotentlik ve girdi doğrulaması.
// (yerel Supabase gerekir: npx supabase start)
import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  havuz, sorgu, rolle, temizle, katilimci_olustur, deneme_kaydet, ornek_paket, ornek_anket,
  reddedilmeli,
} from '../yardimci/vt.mjs';

beforeEach(temizle);
after(() => havuz.end());

const say = async (tablo, katilimci_id) =>
  (await sorgu(`select count(*)::int as n from public.${tablo} where katilimci_id = $1`, [katilimci_id]))[0].n;

const tercih = (id, en_cok, en_az, neden, sira, demo = false) =>
  rolle('anon', 'select public.tercih_kaydet($1, $2, $3, $4, $5, $6) as s', [id, en_cok, en_az, neden, sira, demo]);

const SIRA = ['K2R3', 'K1R1', 'K1R2', 'K1R3', 'K2R1', 'K2R2'];

test('aynı paket iki kez gönderilirse veri çoğalmaz', async () => {
  const k = await katilimci_olustur();
  const paket = ornek_paket(1);
  const ilk = await deneme_kaydet(k.katilimci_id, paket);
  const ikinci = await deneme_kaydet(k.katilimci_id, paket);
  assert.deepEqual(ilk, { deneme_no: 1, yeni_kayit: true, eklenen_olay: 2, eklenen_iz: 2 });
  assert.deepEqual(ikinci, { deneme_no: 1, yeni_kayit: false, eklenen_olay: 0, eklenen_iz: 0 });
  assert.equal(await say('olaylar', k.katilimci_id), 2);
  assert.equal(await say('izler', k.katilimci_id), 2);
  const [o] = await sorgu(`select count(*)::int as n from public.deneme_ozetleri o
    join public.denemeler d using (deneme_id) where d.katilimci_id = $1`, [k.katilimci_id]);
  assert.equal(o.n, 1);
});

test('kısmi gönderimden sonra tam paket eksik izleri tamamlar, deneme bilgisini değiştirmez', async () => {
  const k = await katilimci_olustur();
  const tam = ornek_paket(2);
  // Sayfa kapanırken giden kısmi paket: iz yok, iz_eksik işaretli.
  await deneme_kaydet(k.katilimci_id, { ...tam, izler: [], iz_eksik: true });
  let [d] = await sorgu('select iz_eksik, zorluk_puani from public.denemeler where katilimci_id = $1 and deneme_no = 2',
    [k.katilimci_id]);
  assert.equal(d.iz_eksik, true);

  // Sonradan tam paket (farklı bir zorluk puanıyla bile) — ilk kayıt korunur.
  const sonuc = await deneme_kaydet(k.katilimci_id, { ...tam, zorluk_puani: 2 });
  assert.equal(sonuc.eklenen_iz, 2);
  [d] = await sorgu('select iz_eksik, zorluk_puani from public.denemeler where katilimci_id = $1 and deneme_no = 2',
    [k.katilimci_id]);
  assert.deepEqual(d, { iz_eksik: false, zorluk_puani: 6 });

  // iz_eksik geri true olamaz.
  await deneme_kaydet(k.katilimci_id, { ...tam, iz_eksik: true });
  [d] = await sorgu('select iz_eksik from public.denemeler where katilimci_id = $1 and deneme_no = 2', [k.katilimci_id]);
  assert.equal(d.iz_eksik, false);
});

test('koşul ve ürün tarayıcıdan alınmaz; plan satırından gelir', async () => {
  const k = await katilimci_olustur();
  const paket = ornek_paket(3);
  paket.kosul_kodu = 'K2R3';
  paket.urun_kodu = 'sahte';
  paket.olaylar[0].kosul_kodu = 'K2R3';
  paket.olaylar[0].urun_kodu = 'sahte';
  await deneme_kaydet(k.katilimci_id, paket);
  const plan = k.plan.find((p) => p.deneme_no === 3);
  const olaylar = await sorgu('select distinct kosul_kodu, urun_kodu, cihaz, deneme_no from public.olaylar where katilimci_id = $1',
    [k.katilimci_id]);
  assert.deepEqual(olaylar, [{ kosul_kodu: plan.kosul_kodu, urun_kodu: plan.urun_kodu, cihaz: 'masaustu', deneme_no: 3 }]);
  const [d] = await sorgu('select kosul_kodu, urun_kodu from public.denemeler where katilimci_id = $1 and deneme_no = 3',
    [k.katilimci_id]);
  assert.deepEqual(d, { kosul_kodu: plan.kosul_kodu, urun_kodu: plan.urun_kodu });
});

test('özette sonuç ve zorluk sunucuda yazılır, bilinmeyen alanlar yok sayılır', async () => {
  const k = await katilimci_olustur();
  await deneme_kaydet(k.katilimci_id, ornek_paket(1, {
    sonuc: 'vazgecildi', zorluk_puani: null,
    ozet: { tiklama_suresi_ms: null, sonuc: 'basarili', zorluk_puani: 7, bilinmeyen_alan: 5 },
  }));
  const [o] = await sorgu(`select o.sonuc, o.zorluk_puani from public.deneme_ozetleri o
    join public.denemeler d using (deneme_id) where d.katilimci_id = $1`, [k.katilimci_id]);
  assert.deepEqual(o, { sonuc: 'vazgecildi', zorluk_puani: null });
});

test('geçersiz katılımcı girdileri reddedilir', async () => {
  const bozuk = (degisiklik) => katilimci_olustur({ anket: { ...ornek_anket, ...degisiklik } });
  // Yaş grubu yalnızca anketteki seçeneklerden biri olabilir (18 yaş altı yok).
  await reddedilmeli(bozuk({ yas_grubu: '0-17' }), 'gecersiz_yas_grubu');
  await reddedilmeli(bozuk({ yas_grubu: '18-25' }), 'gecersiz_yas_grubu');
  await reddedilmeli(bozuk({ yas_grubu: 30 }), 'gecersiz_yas_grubu');
  await reddedilmeli(bozuk({ yas_grubu: undefined }), 'gecersiz_yas_grubu');
  await reddedilmeli(bozuk({ cinsiyet: 'baska' }), 'gecersiz_cinsiyet');
  await reddedilmeli(bozuk({ alisveris_sikligi: 'hic' }), 'gecersiz_alisveris_sikligi');
  await reddedilmeli(bozuk({ katilim_cihazi: 'saat' }), 'gecersiz_katilim_cihazi');
  await reddedilmeli(bozuk({ renk_ayirt_zorlugu: 'belki' }), 'gecersiz_renk_ayirt_zorlugu');
  await reddedilmeli(katilimci_olustur({ cihaz: 'tablet' }), 'gecersiz_cihaz');
  await reddedilmeli(katilimci_olustur({ cihaz: 'masaustu', tablet_mi: true }), 'gecersiz_tablet');
  const [n] = await sorgu('select count(*)::int as n from public.katilimcilar');
  assert.equal(n.n, 0);
});

test('geçersiz deneme paketleri reddedilir ve hiçbir şey yazılmaz', async () => {
  const k = await katilimci_olustur();
  const id = k.katilimci_id;
  const p = (d) => ornek_paket(1, d);

  await reddedilmeli(deneme_kaydet(randomUUID(), p({})), 'katilimci_bulunamadi');
  await reddedilmeli(deneme_kaydet(id, ornek_paket(7)), 'gecersiz_deneme_no');
  await reddedilmeli(deneme_kaydet(id, p({ sonuc: 'harika' })), 'gecersiz_sonuc');
  await reddedilmeli(deneme_kaydet(id, p({ zorluk_puani: 8 })), 'gecersiz_zorluk_puani');
  await reddedilmeli(deneme_kaydet(id, p({ zorluk_puani: 0 })), 'gecersiz_zorluk_puani');
  await reddedilmeli(deneme_kaydet(id, p({ tarayici_bilgisi: 'x'.repeat(401) })), 'gecersiz_tarayici_bilgisi');
  await reddedilmeli(deneme_kaydet(id, p({ buton_x: 'sol' })), 'gecersiz_buton_x');
  await reddedilmeli(deneme_kaydet(id, p({ ozet: { tiklama_suresi_ms: -5 } })), 'gecersiz_ozet');
  await reddedilmeli(deneme_kaydet(id, p({ ozet: { tiklama_suresi_ms: 4000000 } })), 'gecersiz_ozet');

  const olay = (d) => p({ olaylar: [{ olay_id: randomUUID(), sayfa: 'urun', olay_turu: 'tiklama', zaman_ms: 5, ...d }] });
  await reddedilmeli(deneme_kaydet(id, olay({ olay_turu: 'kotu_olay' })), 'gecersiz_olay');
  await reddedilmeli(deneme_kaydet(id, olay({ sayfa: 'sepet' })), 'gecersiz_olay');
  await reddedilmeli(deneme_kaydet(id, olay({ olay_id: 'uuid-degil' })), 'gecersiz_olay');
  await reddedilmeli(deneme_kaydet(id, olay({ zaman_ms: -1 })), 'gecersiz_olay');
  await reddedilmeli(deneme_kaydet(id, olay({ zaman_ms: '5' })), 'gecersiz_olay');
  await reddedilmeli(deneme_kaydet(id, olay({ giris_turu: 'klavye' })), 'gecersiz_olay');
  await reddedilmeli(deneme_kaydet(id, olay({ hedef_oge: 'x'.repeat(65) })), 'gecersiz_olay');
  await reddedilmeli(deneme_kaydet(id, olay({ ek: { metin: 'x'.repeat(3000) } })), 'gecersiz_olay');

  await reddedilmeli(deneme_kaydet(id, p({ izler: [{ sayfa: 'urun', iz_turu: 'tus', ornekler: [] }] })), 'gecersiz_iz');
  await reddedilmeli(deneme_kaydet(id, p({ izler: [{ sayfa: 'urun', iz_turu: 'fare', ornekler: [[1, 2]] }] })), 'gecersiz_iz');

  // 6000'den fazla olay
  const cok = Array.from({ length: 6001 }, (_, i) => ({
    olay_id: randomUUID(), sayfa: 'urun', olay_turu: 'tiklama', zaman_ms: i,
  }));
  await reddedilmeli(deneme_kaydet(id, p({ olaylar: cok })), 'cok_fazla_olay');

  // 2 MB'tan büyük paket
  const buyuk = [{ sayfa: 'urun', iz_turu: 'fare', ornekler: Array.from({ length: 120000 }, (_, i) => [i, 1234.5678, 9876.5432]) }];
  await reddedilmeli(deneme_kaydet(id, p({ izler: buyuk })), 'paket_cok_buyuk');

  assert.equal(await say('olaylar', id), 0);
  assert.equal(await say('izler', id), 0);
  const [d] = await sorgu('select count(*)::int as n from public.denemeler where katilimci_id = $1 and sonuc is not null', [id]);
  assert.equal(d.n, 0);
});

test('demo katılımcısının UUID’si gerçek tablolara yazamaz (ve tersi)', async () => {
  const demo = await katilimci_olustur({ demo: true });
  const gercek = await katilimci_olustur();
  await reddedilmeli(deneme_kaydet(demo.katilimci_id, ornek_paket(1), false), 'katilimci_bulunamadi');
  await reddedilmeli(deneme_kaydet(gercek.katilimci_id, ornek_paket(1), true), 'katilimci_bulunamadi');
});

test('tercih_kaydet: doğrulama ve tek kayıt', async () => {
  const k = await katilimci_olustur();
  const id = k.katilimci_id;
  await reddedilmeli(tercih(id, 'K1R1', 'K1R1', null, SIRA), 'ayni_kosul_secildi');
  await reddedilmeli(tercih(id, 'K9R9', 'K1R1', null, SIRA), 'gecersiz_en_cok_kosul');
  await reddedilmeli(tercih(id, 'K1R1', 'K2R2', 'x'.repeat(501), SIRA), 'neden_cok_uzun');
  await reddedilmeli(tercih(id, 'K1R1', 'K2R2', null, SIRA.slice(0, 5)), 'gecersiz_gosterim_sirasi');
  await reddedilmeli(tercih(id, 'K1R1', 'K2R2', null, [...SIRA.slice(0, 5), 'K1R1']), 'gecersiz_gosterim_sirasi');
  await reddedilmeli(tercih(randomUUID(), 'K1R1', 'K2R2', null, SIRA), 'katilimci_bulunamadi');

  const metin = '=HYPERLINK("x") ve Türkçe ğüşiöç';
  const [ilk] = await tercih(id, 'K1R2', 'K2R1', metin, SIRA);
  const [ikinci] = await tercih(id, 'K2R3', 'K1R1', 'başka', SIRA);
  assert.deepEqual([ilk.s, ikinci.s], [{ yeni_kayit: true }, { yeni_kayit: false }]);
  const [r] = await sorgu('select en_cok_kosul, en_az_kosul, neden, gosterim_sirasi from public.tercihler where katilimci_id = $1', [id]);
  assert.deepEqual(r, { en_cok_kosul: 'K1R2', en_az_kosul: 'K2R1', neden: metin, gosterim_sirasi: SIRA });
});

test('katilimci_bitir: 6 deneme kaydedilmeden tamamlanamaz', async () => {
  const k = await katilimci_olustur();
  const id = k.katilimci_id;
  for (let n = 0; n <= 5; n++) await deneme_kaydet(id, ornek_paket(n));
  await reddedilmeli(rolle('anon', 'select public.katilimci_bitir($1)', [id]), 'eksik_deneme');
  await deneme_kaydet(id, ornek_paket(6, { sonuc: 'zaman_asimi', zorluk_puani: null }));
  const [r] = await rolle('anon', 'select public.katilimci_bitir($1) as s', [id]);
  assert.deepEqual(r.s, { durum: 'tamamladi', katilimci_kodu: k.katilimci_kodu });
  const [d] = await sorgu('select durum, bitis_zamani is not null as bitti from public.katilimcilar where katilimci_id = $1', [id]);
  assert.deepEqual(d, { durum: 'tamamladi', bitti: true });
});

test('anon hiçbir tabloyu okuyamaz, yazamaz; yardımcı fonksiyonları çağıramaz', async () => {
  const tablolar = (await sorgu(`select tablename from pg_tables where schemaname = 'public'`)).map((r) => r.tablename);
  // 3 ortak tablo + 7 veri tablosu × 2 takım (gerçek ve test_)
  assert.ok(tablolar.length >= 17, `tablo sayısı: ${tablolar.length}`);
  for (const t of tablolar) {
    await reddedilmeli(rolle('anon', `select * from public.${t} limit 1`), 'permission denied');
    await reddedilmeli(rolle('anon', `delete from public.${t}`), 'permission denied');
  }
  for (const f of ['public._kod_uret()', `public._tablo(false, 'x')`, 'public.yonetici_mi()']) {
    await reddedilmeli(rolle('anon', `select ${f}`), 'permission denied');
  }
});

test('her tabloda RLS açık', async () => {
  const kapali = await sorgu(`select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`);
  assert.deepEqual(kapali, []);
});

test('yönetici olmayan giriş yapmış kullanıcı hiçbir satır göremez; yönetici görür', async () => {
  const k = await katilimci_olustur();
  const yonetici = randomUUID();
  const siradan = randomUUID();
  await sorgu(`insert into auth.users (id, aud, role, email) values ($1, 'authenticated', 'authenticated', 'y@ornek.test'),
               ($2, 'authenticated', 'authenticated', 's@ornek.test')`, [yonetici, siradan]);
  try {
    await sorgu('insert into public.yoneticiler (kullanici_id, eposta) values ($1, $2)', [yonetici, 'y@ornek.test']);
    const gorunen = await rolle('authenticated', 'select katilimci_id from public.katilimcilar', [], siradan);
    assert.deepEqual(gorunen, []);
    const yon = await rolle('authenticated', 'select katilimci_id from public.katilimcilar', [], yonetici);
    assert.deepEqual(yon.map((r) => r.katilimci_id), [k.katilimci_id]);
    // Yönetici bile tabloya doğrudan yazamaz.
    await reddedilmeli(rolle('authenticated', `update public.katilimcilar set yas_grubu = '51+'`, [], yonetici), 'permission denied');
    await reddedilmeli(rolle('authenticated', `delete from public.olaylar`, [], yonetici), 'permission denied');
  } finally {
    await sorgu('delete from auth.users where id = any($1)', [[yonetici, siradan]]);
  }
});

test('ozet.js ile kurulan paket olduğu gibi kaydedilir (yedek paketler de kabul edilir)', async () => {
  const { ozet_hesapla } = await import('../../site/js/ozet.js');
  const { yedek_paketler } = await import('../../site/js/kuyruk.js');
  const k = await katilimci_olustur();
  const olaylar = [
    { olay_id: randomUUID(), sayfa: 'gorev', olay_turu: 'sayfa_goruntulendi', zaman_ms: 0 },
    { olay_id: randomUUID(), sayfa: 'gorev', olay_turu: 'tiklama', zaman_ms: 1500, hedef_oge: 'basla-butonu', giris_turu: 'fare', ek: { hedef_buton_mu: false, basili_tutma_ms: 80 } },
    { olay_id: randomUUID(), sayfa: 'urun', olay_turu: 'sayfa_goruntulendi', zaman_ms: 1520.5 },
    { olay_id: randomUUID(), sayfa: 'urun', olay_turu: 'buton_gorundu', zaman_ms: 1520.5, hedef_oge: 'hedef-buton', ek: { ilk_anda: true, oran: 1 } },
    { olay_id: randomUUID(), sayfa: 'urun', olay_turu: 'duraklatildi', zaman_ms: 1800, ek: { uyari: 'dar_pencere' } },
    { olay_id: randomUUID(), sayfa: 'urun', olay_turu: 'devam_edildi', zaman_ms: 2300, ek: { uyari: 'dar_pencere' } },
    { olay_id: randomUUID(), sayfa: 'urun', olay_turu: 'tiklama', zaman_ms: 3020.5, x: 600, y: 340, hedef_oge: 'hedef-buton', giris_turu: 'fare', ek: { hedef_buton_mu: true, basili_tutma_ms: 95 } },
    { olay_id: randomUUID(), sayfa: 'urun', olay_turu: 'gorev_tamamlandi', zaman_ms: 3020.5, hedef_oge: 'hedef-buton' },
  ];
  const ozet = ozet_hesapla({ olaylar, cihaz: 'masaustu', sonuc: 'basarili', zorluk_puani: 6 });
  await deneme_kaydet(k.katilimci_id, ornek_paket(1, { ozet, olaylar, izler: [] }));
  const [s] = await sorgu(
    `select o.* from public.deneme_ozetleri o join public.denemeler d using (deneme_id)
      where d.katilimci_id = $1 and d.deneme_no = 1`, [k.katilimci_id]);
  assert.equal(s.tiklama_suresi_ms, 1500);
  assert.equal(s.tiklama_suresi_net_ms, 1000);
  assert.equal(s.gorev_suresi_ms, 1520.5);
  assert.equal(s.duraklatildi, true);
  assert.equal(s.duraklatma_suresi_ms, 500);
  assert.equal(s.ozet_surumu, '1');

  // Kalıcı ret durumunda kullanılan yedek paketler veritabanınca kabul edilmeli.
  const [y1, y2] = yedek_paketler({ tur: 'deneme', govde: { paket: ornek_paket(2) } });
  await deneme_kaydet(k.katilimci_id, y1.govde.paket);
  await deneme_kaydet(k.katilimci_id, y2.govde.paket);
  await deneme_kaydet(k.katilimci_id, yedek_paketler({ tur: 'deneme', govde: { paket: ornek_paket(3) } })[1].govde.paket);
  const [d3] = await sorgu('select sonuc, iz_eksik from public.denemeler where katilimci_id = $1 and deneme_no = 3', [k.katilimci_id]);
  assert.deepEqual(d3, { sonuc: 'basarili', iz_eksik: true });
});
