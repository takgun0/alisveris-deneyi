// Özet modülü (site/js/ozet.js) ve kuyruk yedekleri için birim testleri.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ozet_hesapla, duraklatma_araliklari, sekme_araliklari, kesisim, OZET_SURUMU,
} from '../../site/js/ozet.js';
import { izsiz, yedek_paketler } from '../../site/js/kuyruk.js';

// Kısa olay kurucu
const o = (olay_turu, zaman_ms, alanlar = {}) => ({ olay_turu, zaman_ms, sayfa: 'urun', ...alanlar });
const basla = (t) => o('tiklama', t, { sayfa: 'gorev', hedef_oge: 'basla-butonu', ek: { hedef_buton_mu: false } });
const urun = (t) => o('sayfa_goruntulendi', t);
const hedef = (t, basili = 90) => o('tiklama', t, { hedef_oge: 'hedef-buton', ek: { hedef_buton_mu: true, basili_tutma_ms: basili } });

test('başarılı masaüstü denemesi: süreler doğru', () => {
  const olaylar = [
    o('sayfa_goruntulendi', 0, { sayfa: 'gorev' }),
    basla(1500),
    urun(1540),
    o('buton_gorundu', 1540),
    o('buton_hover_ilk', 2400),
    o('tiklama', 2000, { hedef_oge: 'favori-butonu', ek: { hedef_buton_mu: false } }),
    o('tiklama', 2100, { hedef_oge: 'urun-adi', ek: { hedef_buton_mu: false } }),
    o('tiklama', 2150, { hedef_oge: 'bos-alan', ek: { hedef_buton_mu: false } }),
    hedef(2800, 95.5),
    o('gorev_tamamlandi', 2800),
  ];
  const z = ozet_hesapla({ olaylar, cihaz: 'masaustu', sonuc: 'basarili', zorluk_puani: 6 });
  assert.equal(z.tiklama_suresi_ms, 1260);
  assert.equal(z.tiklama_suresi_net_ms, 1260);
  assert.equal(z.gorev_suresi_ms, 1300);
  assert.equal(z.basili_tutma_suresi_ms, 95.5);
  assert.equal(z.buton_gorunme_suresi_ms, 0);
  assert.equal(z.buton_bulma_suresi_ms, 860);
  assert.equal(z.hatali_tiklama_sayisi, 1);
  assert.equal(z.bos_tiklama_sayisi, 2);
  assert.equal(z.sekme_degisti, false);
  assert.equal(z.duraklatildi, false);
  assert.equal(z.sonuc, 'basarili');
  assert.equal(z.zorluk_puani, 6);
  assert.equal(z.ozet_surumu, OZET_SURUMU);
});

test('mobilde buton_bulma hesaplanmaz', () => {
  const olaylar = [basla(100), urun(140), o('buton_hover_ilk', 300), hedef(900)];
  const z = ozet_hesapla({ olaylar, cihaz: 'mobil', sonuc: 'basarili' });
  assert.equal(z.buton_bulma_suresi_ms, null);
  assert.equal(z.tiklama_suresi_ms, 760);
});

test('vazgeçildi ve zaman aşımı: tıklama ve görev süresi boş', () => {
  for (const sonuc of ['vazgecildi', 'zaman_asimi', 'kesildi']) {
    // Hedef butona tıklama olsa bile (olmaz ama) sonuç başarılı değilse süre yazılmaz.
    const olaylar = [basla(100), urun(140), o('tiklama', 400, { hedef_oge: 'vazgec-butonu', ek: {} })];
    const z = ozet_hesapla({ olaylar, cihaz: 'masaustu', sonuc });
    assert.equal(z.tiklama_suresi_ms, null);
    assert.equal(z.gorev_suresi_ms, null);
    assert.equal(z.basili_tutma_suresi_ms, null);
    assert.equal(z.bos_tiklama_sayisi, 0, 'Vazgeç düğmesi boş tıklama sayılmaz');
    assert.equal(z.hatali_tiklama_sayisi, 0);
    assert.equal(z.sonuc, sonuc);
  }
});

test('duraklatma: net süreler duraklatma kadar kısalır', () => {
  const olaylar = [
    basla(1000), urun(1040),
    o('duraklatildi', 1500), o('devam_edildi', 3500),
    o('duraklatildi', 4000), o('devam_edildi', 4500),
    hedef(5040),
  ];
  const z = ozet_hesapla({ olaylar, cihaz: 'mobil', sonuc: 'basarili' });
  assert.equal(z.tiklama_suresi_ms, 4000);
  assert.equal(z.tiklama_suresi_net_ms, 1500);
  assert.equal(z.gorev_suresi_ms, 4040);
  assert.equal(z.gorev_suresi_net_ms, 1540);
  assert.equal(z.duraklatildi, true);
  assert.equal(z.duraklatma_suresi_ms, 2500);
});

test('Başla ile ürün sayfası arasındaki duraklatma yalnızca görev süresinden düşer', () => {
  const olaylar = [basla(1000), o('duraklatildi', 1000, { sayfa: 'gorev' }), o('devam_edildi', 1800), urun(1840), hedef(2840)];
  const z = ozet_hesapla({ olaylar, cihaz: 'masaustu', sonuc: 'basarili' });
  assert.equal(z.tiklama_suresi_net_ms, 1000);
  assert.equal(z.gorev_suresi_net_ms, 1040);
});

test('sekme değişikliği: süre toplanır, net süreye etki etmez (sayaç durmaz)', () => {
  const olaylar = [
    basla(0), urun(40),
    o('sekme_degisti', 500, { ek: { durum: 'gizlendi' } }),
    o('sekme_degisti', 2500, { ek: { durum: 'geri_dondu' } }),
    hedef(3040),
  ];
  const z = ozet_hesapla({ olaylar, cihaz: 'masaustu', sonuc: 'basarili' });
  assert.equal(z.sekme_degisti, true);
  assert.equal(z.sekme_disi_sure_ms, 2000);
  assert.equal(z.tiklama_suresi_net_ms, 3000);
});

test('kapanmamış sekme/duraklatma son olaya kadar sayılır', () => {
  const olaylar = [basla(0), urun(40), o('sekme_degisti', 100, { ek: { durum: 'gizlendi' } }), o('zaman_asimi', 60000)];
  const z = ozet_hesapla({ olaylar, cihaz: 'masaustu', sonuc: 'zaman_asimi' });
  assert.equal(z.sekme_disi_sure_ms, 59900);
  assert.deepEqual(duraklatma_araliklari([o('duraklatildi', 10)], 50), [[10, 50]]);
  assert.deepEqual(sekme_araliklari([], 50), []);
  assert.equal(kesisim([[0, 10], [20, 30]], 5, 25), 10);
});

test('buton ilk anda görünmüyorsa görünme süresi kaydırmadan sonra', () => {
  const olaylar = [basla(0), urun(40), o('buton_gorundu', 1240), hedef(2040)];
  const izler = [{ sayfa: 'urun', iz_turu: 'kaydirma', ornekler: [[300, 0, 120], [400, 0, 380], [900, 0, 200]] }];
  const z = ozet_hesapla({ olaylar, izler, cihaz: 'mobil', sonuc: 'basarili' });
  assert.equal(z.buton_gorunme_suresi_ms, 1200);
  assert.equal(z.toplam_kaydirma_px, 380 + 180);
});

test('olay sırası karışık gelse de sonuç aynı', () => {
  const olaylar = [hedef(2040), urun(40), basla(0)];
  const z = ozet_hesapla({ olaylar, cihaz: 'masaustu', sonuc: 'basarili' });
  assert.equal(z.tiklama_suresi_ms, 2000);
});

test('özet alanları veritabanı tablosuyla aynı', async () => {
  const { readFileSync } = await import('node:fs');
  const sql = readFileSync(new URL('../../supabase/migrations/20261114000001_tablolar.sql', import.meta.url), 'utf8');
  const z = ozet_hesapla({ olaylar: [], cihaz: 'masaustu', sonuc: 'kesildi' });
  for (const alan of Object.keys(z)) assert.match(sql, new RegExp(`\\b${alan}\\b`), `${alan} tabloda yok`);
});

test('kuyruk: izsiz kopya ve yedek paketler', () => {
  const oge = {
    tur: 'deneme',
    govde: { katilimci_id: 'x', paket: { deneme_no: 3, sonuc: 'basarili', zorluk_puani: 5, ozet: { a: 1 }, olaylar: [1], izler: [2], iz_eksik: false } },
  };
  const h = izsiz(oge);
  assert.deepEqual(h.govde.paket.izler, []);
  assert.equal(h.govde.paket.iz_eksik, true);
  assert.deepEqual(oge.govde.paket.izler, [2], 'asıl paket değişmez');

  const [y1, y2] = yedek_paketler(oge);
  assert.equal(y1.yedek, 1);
  assert.deepEqual(y1.govde.paket.olaylar, []);
  assert.deepEqual(y1.govde.paket.ozet, { a: 1 });
  assert.equal(y2.yedek, 2);
  assert.deepEqual(y2.govde.paket, { deneme_no: 3, sonuc: 'basarili', zorluk_puani: 5, iz_eksik: true, ozet: {}, olaylar: [], izler: [] });
  assert.deepEqual(yedek_paketler({ tur: 'tercih', govde: {} }), []);
});
