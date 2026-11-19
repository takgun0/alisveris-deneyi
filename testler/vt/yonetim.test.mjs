// Yönetici fonksiyonları ve geniş tablo: yetki, işlem kaydı, veri bütünlüğü.
// (yerel Supabase gerekir: npx supabase start)
import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  havuz, sorgu, rolle, temizle, katilimci_olustur, deneme_kaydet, ornek_paket, katilimciyi_tamamla,
  reddedilmeli,
} from '../yardimci/vt.mjs';

const YONETICI = randomUUID();
const SIRADAN = randomUUID();

before(async () => {
  await sorgu(`insert into auth.users (id, aud, role, email) values
    ($1, 'authenticated', 'authenticated', 'yonetici@ornek.test'),
    ($2, 'authenticated', 'authenticated', 'siradan@ornek.test')`, [YONETICI, SIRADAN]);
  await sorgu('insert into public.yoneticiler (kullanici_id, eposta) values ($1, $2)', [YONETICI, 'yonetici@ornek.test']);
});
beforeEach(temizle);
after(async () => {
  await sorgu('delete from public.yoneticiler where kullanici_id = $1', [YONETICI]);
  await sorgu('delete from auth.users where id = any($1)', [[YONETICI, SIRADAN]]);
  await havuz.end();
});

const yonetici = (sql, p) => rolle('authenticated', sql, p, YONETICI);
const deneme_idleri = async (katilimci_id) =>
  (await sorgu('select deneme_id from public.denemeler where katilimci_id = $1 order by deneme_no', [katilimci_id]))
    .map((r) => Number(r.deneme_id));

test('geniş tablo yalnızca yöneticiye satır döndürür; anon erişemez', async () => {
  const k = await katilimci_olustur();
  await katilimciyi_tamamla(k.katilimci_id);
  const satirlar = await yonetici('select * from public.genis_tablo order by deneme_no');
  assert.equal(satirlar.length, 7);
  assert.equal(satirlar[1].tiklama_suresi_ms, 1500.25);
  assert.equal(satirlar[0].alistirma_mi, true);
  assert.equal(satirlar[0].yas_grubu, '21-30'); // örnek anketteki yaş grubu
  assert.deepEqual(await rolle('authenticated', 'select * from public.genis_tablo', [], SIRADAN), []);
  await reddedilmeli(rolle('anon', 'select * from public.genis_tablo'), 'permission denied');
  await reddedilmeli(rolle('anon', 'select * from public.test_genis_tablo'), 'permission denied');
});

test('hariç tutma: işaretler, veri silmez, işlem kaydı yazar; geri alma geri getirir', async () => {
  const k = await katilimci_olustur();
  await katilimciyi_tamamla(k.katilimci_id);
  const idler = await deneme_idleri(k.katilimci_id);
  const olay_once = (await sorgu('select count(*)::int n from public.olaylar'))[0].n;

  const [{ s }] = await yonetici(
    'select public.denemeleri_haric_tut($1, $2, $3, $4, $5) as s',
    [[idler[1], idler[2]], [], 'asiri_uzun_sure', null, { kural: 'uzun_sure', esik_sn: 30 }]);
  assert.equal(s.deneme_sayisi, 2);

  // Aynı denemeler ikinci kez hariç tutulursa değişen olmaz.
  const [{ s: s2 }] = await yonetici('select public.denemeleri_haric_tut($1, $2, $3, $4, $5) as s',
    [[idler[1]], [], 'teknik_hata', null, null]);
  assert.equal(s2.deneme_sayisi, 0);

  const d = await sorgu('select deneme_no, haric_tutuldu, haric_nedeni from public.denemeler where katilimci_id = $1 order by deneme_no', [k.katilimci_id]);
  assert.deepEqual(d.filter((r) => r.haric_tutuldu).map((r) => [r.deneme_no, r.haric_nedeni]),
    [[1, 'asiri_uzun_sure'], [2, 'asiri_uzun_sure']]);
  assert.equal((await sorgu('select count(*)::int n from public.olaylar'))[0].n, olay_once, 'olaylar silinmemeli');

  const kayit = await sorgu('select * from public.islem_kaydi order by islem_id');
  assert.equal(kayit[0].islem, 'haric_tut');
  assert.equal(kayit[0].yonetici_eposta, 'yonetici@ornek.test');
  assert.deepEqual(kayit[0].kural, { kural: 'uzun_sure', esik_sn: 30 });
  assert.deepEqual(kayit[0].etkilenen.deneme_idler, [idler[1], idler[2]]);

  const [{ g }] = await yonetici('select public.haric_tutmayi_geri_al($1, $2) as g', [[idler[1]], []]);
  assert.equal(g.deneme_sayisi, 1);
  const son = await sorgu('select * from public.islem_kaydi order by islem_id desc limit 1');
  assert.equal(son[0].islem, 'haric_geri_al');
  assert.deepEqual(son[0].etkilenen.denemeler, [{ deneme_id: idler[1], onceki_neden: 'asiri_uzun_sure' }]);
  const kalan = await sorgu('select count(*)::int n from public.denemeler where haric_tutuldu');
  assert.equal(kalan[0].n, 1);
});

test('hariç tutma nedeni zorunlu; "diğer" açıklama ister', async () => {
  const k = await katilimci_olustur();
  const idler = await deneme_idleri(k.katilimci_id);
  const cagir = (neden, aciklama) => yonetici('select public.denemeleri_haric_tut($1, $2, $3, $4, null)',
    [[idler[1]], [], neden, aciklama]);
  await reddedilmeli(cagir(null, null), 'gecersiz_neden');
  await reddedilmeli(cagir('keyfi', null), 'gecersiz_neden');
  await reddedilmeli(cagir('diger', '  '), 'aciklama_gerekli');
  await cagir('diger', 'Katılımcı görevi yanlış anladığını yazdı');
  await reddedilmeli(yonetici('select public.denemeleri_haric_tut($1, $2, $3, null, null)', [[], [], 'teknik_hata']), 'bos_secim');
});

test('katılımcıyı hariç tutmak sıra numarasını boşa çıkarır', async () => {
  const k = await katilimci_olustur();
  await katilimciyi_tamamla(k.katilimci_id);
  await yonetici('select public.denemeleri_haric_tut($1, $2, $3, null, null)', [[], [k.katilimci_id], 'katilimci_talebi']);
  const yeni = await katilimci_olustur();
  assert.equal(yeni.sira_no, k.sira_no);
  const [g] = await yonetici('select haric_tutuldu, haric_nedeni from public.genis_tablo where katilimci_id = $1 limit 1', [k.katilimci_id]);
  assert.deepEqual(g, { haric_tutuldu: true, haric_nedeni: 'katilimci_talebi' });
});

test('kalıcı silme: çift onay, kayıt sayıları; işlem kaydında kişisel veri yok', async () => {
  const k = await katilimci_olustur();
  await katilimciyi_tamamla(k.katilimci_id);
  const kod = k.katilimci_kodu;

  await reddedilmeli(yonetici('select public.deneme_sil($1, $2, $3)', [kod, 3, 'yanlis']), 'onay_uyusmuyor');
  const [{ s }] = await yonetici('select public.deneme_sil($1, $2, $3) as s', [kod, 3, `${kod}-3`]);
  assert.deepEqual([s.olay, s.iz, s.ozet], [2, 2, 1]);
  assert.equal((await sorgu('select count(*)::int n from public.denemeler where katilimci_id = $1', [k.katilimci_id]))[0].n, 6);

  await reddedilmeli(yonetici('select public.katilimci_sil($1, $2)', [kod, 'baska']), 'onay_uyusmuyor');
  const [{ s: ks }] = await yonetici('select public.katilimci_sil($1, $2) as s', [kod, kod]);
  assert.equal(ks.denemeler, 6);
  assert.equal(ks.olaylar, 12);
  for (const t of ['katilimcilar', 'denemeler', 'olaylar', 'izler', 'deneme_ozetleri']) {
    assert.equal((await sorgu(`select count(*)::int n from public.${t}`))[0].n, 0, t);
  }
  const kayit = await sorgu(`select etkilenen from public.islem_kaydi where islem = 'katilimci_sil'`);
  assert.deepEqual(Object.keys(kayit[0].etkilenen).sort(),
    ['deneme_ozetleri', 'denemeler', 'izler', 'katilimci_kodu', 'olaylar', 'tercihler']);
});

test('özet güncelleme: yalnızca özet değişir, sonuç ve zorluk denemeden gelir', async () => {
  const k = await katilimci_olustur();
  await deneme_kaydet(k.katilimci_id, ornek_paket(1));
  const [id] = (await deneme_idleri(k.katilimci_id)).slice(1);
  const [{ s }] = await yonetici('select public.ozetleri_guncelle($1, $2) as s', [
    JSON.stringify([{ deneme_id: id, ozet: { tiklama_suresi_ms: 999, sonuc: 'vazgecildi', ozet_surumu: '2' } }]),
    'ozet.js sürüm 2',
  ]);
  assert.equal(s.guncellenen, 1);
  const [o] = await sorgu('select tiklama_suresi_ms, sonuc, zorluk_puani, ozet_surumu from public.deneme_ozetleri where deneme_id = $1', [id]);
  assert.deepEqual(o, { tiklama_suresi_ms: 999, sonuc: 'basarili', zorluk_puani: 6, ozet_surumu: '2' });
  const [kayit] = await sorgu(`select kural, etkilenen, neden from public.islem_kaydi where islem = 'ozet_guncelle'`);
  assert.deepEqual(kayit, { kural: { ozet_surumleri: ['2'] }, etkilenen: { deneme_sayisi: 1 }, neden: 'ozet.js sürüm 2' });
});

test('dışa aktarım kaydı', async () => {
  await yonetici('select public.disa_aktarim_kaydet($1, $2, $3, $4)', ['tam_yedek', 'json', 10, {}]);
  await yonetici('select public.disa_aktarim_kaydet($1, $2, $3, $4)', ['ham_olaylar', 'csv', 5, { cihaz: 'mobil' }]);
  const r = await sorgu('select islem, etkilenen from public.islem_kaydi order by islem_id');
  assert.deepEqual(r.map((x) => x.islem), ['tam_yedek', 'disa_aktar']);
  await reddedilmeli(yonetici('select public.disa_aktarim_kaydet($1, $2, $3, $4)', ['x', 'exe', 1, {}]), 'gecersiz_disa_aktarim');
});

test('yönetici olmayan ve anonim kullanıcı yönetici fonksiyonlarını çağıramaz', async () => {
  const k = await katilimci_olustur();
  await katilimciyi_tamamla(k.katilimci_id);
  const idler = await deneme_idleri(k.katilimci_id);
  const cagrilar = [
    ['select public.denemeleri_haric_tut($1, $2, $3, null, null)', [[idler[1]], [], 'teknik_hata']],
    ['select public.haric_tutmayi_geri_al($1, $2)', [[idler[1]], []]],
    ['select public.deneme_sil($1, $2, $3)', [k.katilimci_kodu, 1, `${k.katilimci_kodu}-1`]],
    ['select public.katilimci_sil($1, $2)', [k.katilimci_kodu, k.katilimci_kodu]],
    ['select public.ozetleri_guncelle($1, $2)', [JSON.stringify([{ deneme_id: idler[1], ozet: {} }]), 'x']],
    ['select public.disa_aktarim_kaydet($1, $2, $3, $4)', ['tam_yedek', 'json', 1, {}]],
  ];
  for (const [sql, p] of cagrilar) {
    await reddedilmeli(rolle('authenticated', sql, p, SIRADAN), 'yetkisiz');
    await reddedilmeli(rolle('anon', sql, p), 'permission denied');
  }
  // Hiçbir şey değişmedi
  assert.equal((await sorgu('select count(*)::int n from public.denemeler where haric_tutuldu')).at(0).n, 0);
  assert.equal((await sorgu('select count(*)::int n from public.islem_kaydi')).at(0).n, 0);
  assert.equal((await sorgu('select count(*)::int n from public.olaylar')).at(0).n, 14);
});

test('demo tabloları ayrı: test_ işlemleri gerçek kayda dokunmaz', async () => {
  const k = await katilimci_olustur({ demo: true });
  await katilimciyi_tamamla(k.katilimci_id, true);
  const id = (await sorgu('select deneme_id from public.test_denemeler where katilimci_id = $1 and deneme_no = 1', [k.katilimci_id]))[0].deneme_id;
  await yonetici('select public.denemeleri_haric_tut($1, $2, $3, null, null, true)', [[id], [], 'teknik_hata']);
  assert.equal((await sorgu('select count(*)::int n from public.test_islem_kaydi')).at(0).n, 1);
  assert.equal((await sorgu('select count(*)::int n from public.islem_kaydi')).at(0).n, 0);
  assert.equal((await yonetici('select count(*)::int n from public.test_genis_tablo where haric_tutuldu')).at(0).n, 1);
});
