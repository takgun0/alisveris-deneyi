// site/js/yonetim/veri.js birim testleri (süzgeç, katılımcı listesi, Williams blokları).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filtrele, katilimcilar, blok_durumu, ozet_sayilari, BOS_FILTRE, gecen_sure } from '../../site/js/yonetim/veri.js';

const satir = (o) => ({
  katilimci_id: 'a', katilimci_kodu: 'AAAA', cihaz: 'masaustu', yas_grubu: '18-20', cinsiyet: 'kadin',
  alisveris_sikligi: 'ayda_bir', baslangic_zamani: '2026-11-10T10:00:00Z', haric_tutuldu: false,
  katilimci_haric_tutuldu: false, deneme_no: 1, sonuc: 'basarili', durum: 'tamamladi', ...o,
});

test('süzgeçler', () => {
  const s = [satir({}), satir({ katilimci_id: 'b', cihaz: 'mobil', yas_grubu: '51+' }), satir({ katilimci_id: 'c', haric_tutuldu: true, baslangic_zamani: '2026-11-12T10:00:00Z' })];
  assert.equal(filtrele(s, BOS_FILTRE).length, 3);
  assert.deepEqual(filtrele(s, { ...BOS_FILTRE, cihaz: 'mobil' }).map((x) => x.katilimci_id), ['b']);
  assert.deepEqual(filtrele(s, { ...BOS_FILTRE, yas_grubu: '18-20' }).map((x) => x.katilimci_id), ['a', 'c']);
  assert.deepEqual(filtrele(s, { ...BOS_FILTRE, haric_goster: false }).map((x) => x.katilimci_id), ['a', 'b']);
  assert.deepEqual(filtrele(s, { ...BOS_FILTRE, baslangic: '2026-11-11' }).map((x) => x.katilimci_id), ['c']);
  assert.deepEqual(filtrele(s, { ...BOS_FILTRE, bitis: '2026-11-11' }).map((x) => x.katilimci_id), ['a', 'b']);
});

test('katılımcı listesi deneme satırlarından türetilir', () => {
  const k = katilimcilar([satir({ deneme_no: 0 }), satir({ deneme_no: 1 }), satir({ deneme_no: 2, sonuc: null }), satir({ katilimci_id: 'b' })]);
  assert.equal(k.length, 2);
  assert.equal(k[0].deneme_sayisi, 1);
});

test('Williams blok durumu: tamamlanan blok, boş ve süren numaralar', () => {
  const simdi = Date.parse('2026-11-14T12:00:00Z');
  const kisi = (sira_no, durum, ek = {}) => ({ katilimci_id: `k${sira_no}${durum}`, cihaz: 'mobil', sira_no, durum, haric_tutuldu: false, sira_cakismasi: false, baslangic_zamani: '2026-11-14T11:50:00Z', son_etkinlik_zamani: '2026-11-14T11:55:00Z', ...ek });
  const kisiler = [
    ...[0, 1, 2, 3, 4, 5].map((n) => kisi(n, 'tamamladi')),
    kisi(6, 'tamamladi'),
    kisi(7, 'devam_ediyor'),
    kisi(8, 'devam_ediyor', { son_etkinlik_zamani: '2026-11-14T11:00:00Z' }), // 60 dk etkinlik yok → boş
    kisi(9, 'tamamladi', { haric_tutuldu: true }), // hariç → boş
    kisi(10, 'tamamladi', { sira_cakismasi: true }), // çakışma → numara tutmaz
    kisi(11, 'birakti'),
    kisi(0, 'tamamladi', { cihaz: 'masaustu' }),
  ];
  const d = blok_durumu(kisiler, 'mobil', { simdi, bosalma_dakika: 30 });
  assert.equal(d.tamamlanan_blok, 1);
  assert.deepEqual(d.bos_numaralar, [8, 9, 10, 11]);
  assert.deepEqual(d.suren_numaralar, [7]);
  assert.equal(blok_durumu(kisiler, 'masaustu', { simdi }).bos_numaralar.length, 5);
});

test('özet sayıları ve göreli zaman', () => {
  const s = [satir({}), satir({ deneme_no: 2, haric_tutuldu: true }), satir({ deneme_no: 0 })];
  const o = ozet_sayilari(s, katilimcilar(s));
  assert.equal(o.deneme, 2);
  assert.equal(o.gecerli_deneme, 1);
  assert.equal(o.haric_deneme, 1);
  assert.equal(gecen_sure(null), 'hiç');
  assert.equal(gecen_sure(1000, 1000 + 125000), '2 dk önce');
});
