// Dışa aktarım (CSV, formül güvenliği, geniş tablo, ham olaylar) ve xlsx yazıcısı.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inflateRawSync } from 'node:zlib';
import {
  csv_olustur, hucre_guvenli, genis_analiz_tablosu, ham_olay_tablosu, deneme_tablosu, anket_tablosu, dosya_adi,
} from '../../site/js/yonetim/disa_aktarim.js';
import { xlsx_olustur, crc32, sutun_harfi } from '../../site/js/yonetim/xlsx.js';

test('formül enjeksiyonu: tehlikeli metinlerin başına tırnak eklenir, sayılar değişmez', () => {
  assert.equal(hucre_guvenli('=1+1'), "'=1+1");
  assert.equal(hucre_guvenli('+90 555'), "'+90 555");
  assert.equal(hucre_guvenli('-bir'), "'-bir");
  assert.equal(hucre_guvenli('@SUM(A1)'), "'@SUM(A1)");
  assert.equal(hucre_guvenli('normal'), 'normal');
  assert.equal(hucre_guvenli(-5), -5);
  const csv = csv_olustur({ basliklar: ['a', 'b'], satirlar: [['=HYPERLINK("x")', -3.5], ['virgül, var', null], [true, { x: 1 }]] });
  assert.ok(csv.startsWith('﻿a,b\r\n'), 'BOM ve başlık');
  assert.ok(csv.includes(`"'=HYPERLINK(""x"")",-3.5`));
  assert.ok(csv.includes('"virgül, var",\r\n'));
  assert.ok(csv.includes('true,"{""x"":1}"'));
});

const satirlar = [
  { deneme_id: 1, katilimci_id: 'a', katilimci_kodu: 'KODA', cihaz: 'mobil', deneme_no: 0, kosul_kodu: 'K1R0', sonuc: 'basarili', tiklama_suresi_ms: 999, haric_tutuldu: false },
  { deneme_id: 2, katilimci_id: 'a', katilimci_kodu: 'KODA', cihaz: 'mobil', deneme_no: 1, kosul_kodu: 'K2R1', urun_kodu: 'kupa', sonuc: 'basarili', tiklama_suresi_ms: 1800, haric_tutuldu: true, haric_nedeni: 'teknik_hata' },
  { deneme_id: 3, katilimci_id: 'a', katilimci_kodu: 'KODA', cihaz: 'mobil', deneme_no: 2, kosul_kodu: 'K1R2', urun_kodu: 'termos', sonuc: 'vazgecildi', tiklama_suresi_ms: null, haric_tutuldu: false },
];
const kisiler = [{ katilimci_id: 'a', katilimci_kodu: 'KODA', cihaz: 'mobil', yas_grubu: '21-30', haric_tutuldu: false }];

test('geniş analiz tablosu: katılımcı başına bir satır, koşul sütunları, hariç bilgisi', () => {
  const t = genis_analiz_tablosu(satirlar, kisiler, ['K1R1', 'K1R2', 'K2R1']);
  assert.equal(t.satirlar.length, 1);
  const deger = (sutun) => t.satirlar[0][t.basliklar.indexOf(sutun)];
  assert.equal(deger('tiklama_suresi_ms_K2R1'), 1800);
  assert.equal(deger('haric_tutuldu_K2R1'), true);
  assert.equal(deger('haric_nedeni_K2R1'), 'teknik_hata');
  assert.equal(deger('sonuc_K1R2'), 'vazgecildi');
  assert.equal(deger('tiklama_suresi_ms_K1R1'), null);
  assert.ok(t.basliklar.includes('haric_tutuldu'));
});

test('ham olaylar: izler satırlara açılır, zamana göre sıralanır, hariç sütunu taşınır', () => {
  const denemeler = new Map(satirlar.map((s) => [s.deneme_id, s]));
  const olaylar = [
    { deneme_id: 2, olay_id: 'o2', cihaz: 'mobil', deneme_no: 1, kosul_kodu: 'K2R1', urun_kodu: 'kupa', sayfa: 'urun', olay_turu: 'tiklama', zaman_ms: 3000, ek: { hedef_buton_mu: true } },
    { deneme_id: 2, olay_id: 'o1', cihaz: 'mobil', deneme_no: 1, kosul_kodu: 'K2R1', urun_kodu: 'kupa', sayfa: 'urun', olay_turu: 'sayfa_goruntulendi', zaman_ms: 1000 },
  ];
  const izler = [{ deneme_id: 2, deneme_no: 1, sayfa: 'urun', iz_turu: 'kaydirma', ornekler: [[2000, null, 100], [1500, null, 50]] }];
  const t = ham_olay_tablosu(olaylar, izler, denemeler);
  const z = t.basliklar.indexOf('zaman_ms');
  const k = t.basliklar.indexOf('kaynak');
  assert.deepEqual(t.satirlar.map((s) => [s[k], s[z]]), [['olay', 1000], ['iz', 1500], ['iz', 2000], ['olay', 3000]]);
  assert.ok(t.satirlar.every((s) => s[t.basliklar.indexOf('haric_tutuldu')] === true));
  assert.equal(t.satirlar[3][t.basliklar.indexOf('ek')], '{"hedef_buton_mu":true}');
});

test('her dosyada hariç tutma sütunları var', () => {
  for (const t of [deneme_tablosu(satirlar), anket_tablosu(kisiler)]) {
    assert.ok(t.basliklar.includes('haric_tutuldu') && t.basliklar.includes('haric_nedeni'), t.ad);
  }
  assert.match(dosya_adi('anket', 'csv', { demo: true, zaman: new Date(2026, 10, 14, 9, 5) }), /^sepete_ekle_anket_demo_20261114-0905\.csv$/);
});

/** Basit ZIP okuyucu (test için): yerel başlıkları dolaşır. */
function zip_oku(veri) {
  const g = new DataView(veri.buffer, veri.byteOffset, veri.byteLength);
  const dosyalar = {};
  let i = 0;
  while (g.getUint32(i, true) === 0x04034b50) {
    const yontem = g.getUint16(i + 8, true);
    const crc = g.getUint32(i + 14, true);
    const boy = g.getUint32(i + 18, true);
    const ad_boyu = g.getUint16(i + 26, true);
    const ad = new TextDecoder().decode(veri.subarray(i + 30, i + 30 + ad_boyu));
    const govde = veri.subarray(i + 30 + ad_boyu, i + 30 + ad_boyu + boy);
    const acik = yontem === 8 ? new Uint8Array(inflateRawSync(govde)) : govde;
    assert.equal(crc32(acik), crc, `${ad} CRC`);
    dosyalar[ad] = new TextDecoder().decode(acik);
    i += 30 + ad_boyu + boy;
  }
  return dosyalar;
}

test('xlsx: geçerli zip, sayfa adları, sayı/metin/mantıksal hücreler', async () => {
  assert.equal(sutun_harfi(0), 'A');
  assert.equal(sutun_harfi(25), 'Z');
  assert.equal(sutun_harfi(26), 'AA');
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  const veri = await xlsx_olustur([
    { ad: 'deneme_ozetleri', basliklar: ['kod', 'sure', 'haric'], satirlar: [['=X<y>&', 1234.5, true], ['ğüşİ', null, false]] },
    { ad: 'çok/uzun:ad[1]?abcdefghijklmnopqrstuvwxyz', basliklar: ['a'], satirlar: [] },
  ], { deger_cevir: hucre_guvenli });
  assert.equal(veri[0], 0x50); // 'P'
  const d = zip_oku(veri);
  assert.ok(d['[Content_Types].xml'].includes('sheet2.xml'));
  assert.ok(d['xl/workbook.xml'].includes('name="deneme_ozetleri"'));
  assert.ok(d['xl/workbook.xml'].includes('name="çok_uzun_ad_1__abcdefghijklmnop"'));
  const s1 = d['xl/worksheets/sheet1.xml'];
  assert.ok(s1.includes(`<c r="A2" t="inlineStr"><is><t xml:space="preserve">'=X&lt;y&gt;&amp;</t></is></c>`));
  assert.ok(s1.includes('<c r="B2"><v>1234.5</v></c>'));
  assert.ok(s1.includes('<c r="C2" t="b"><v>1</v></c>'));
  assert.ok(s1.includes('ğüşİ'));
  assert.ok(!s1.includes('r="B3"'), 'boş hücre yazılmaz');
});
