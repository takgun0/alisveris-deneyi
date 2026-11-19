// site/js/yonetim/haric_tutma.js birim testleri.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kural_uygula, rozetler, neden_dogrula, KURALLAR } from '../../site/js/yonetim/haric_tutma.js';

let id = 0;
const s = (o) => ({
  deneme_id: ++id, katilimci_id: 'k1', cihaz: 'masaustu', kosul_kodu: 'K1R1', deneme_no: 1, sonuc: 'basarili',
  haric_tutuldu: false, katilimci_haric_tutuldu: false, tiklama_suresi_ms: 1500, sekme_degisti: false, ...o,
});

test('uzun süre kuralı: yalnızca başarılı, alıştırma dışı, hariç olmayan', () => {
  const satirlar = [
    s({ tiklama_suresi_ms: 31000 }), s({ tiklama_suresi_ms: 29000 }),
    s({ tiklama_suresi_ms: 45000, deneme_no: 0 }), s({ tiklama_suresi_ms: 45000, haric_tutuldu: true }),
    s({ tiklama_suresi_ms: null, sonuc: 'zaman_asimi' }),
  ];
  const r = kural_uygula('uzun_sure', { esik_sn: 30 }, satirlar);
  assert.deepEqual(r.deneme_idler, [satirlar[0].deneme_id]);
  assert.deepEqual(r.kural, { kural: 'uzun_sure', esik_sn: 30, olcu: 'tiklama_suresi_ms' });
  assert.throws(() => kural_uygula('uzun_sure', { esik_sn: 0 }, satirlar), RangeError);
});

test('log 3 SS kuralı hücre içinde uygulanır', () => {
  const normal = Array.from({ length: 30 }, (_, i) => s({ tiklama_suresi_ms: 1400 + (i % 7) * 40 }));
  const uc = s({ tiklama_suresi_ms: 9000 });
  const baska_hucre = Array.from({ length: 30 }, (_, i) => s({ kosul_kodu: 'K2R1', tiklama_suresi_ms: 8000 + (i % 7) * 200 }));
  const r = kural_uygula('log_3ss', {}, [...normal, uc, ...baska_hucre]);
  assert.deepEqual(r.deneme_idler, [uc.deneme_id], 'yalnızca kendi hücresinde uç olan seçilir');
});

test('sekme, zaman aşımı ve cihaz uyuşmazlığı', () => {
  const a = s({ sekme_degisti: true });
  const b = s({ sonuc: 'zaman_asimi', tiklama_suresi_ms: null });
  const c1 = s({ katilimci_id: 'k9', cihaz_uyusmazligi: true });
  const c2 = s({ katilimci_id: 'k9', cihaz_uyusmazligi: true, deneme_no: 2 });
  const satirlar = [a, b, c1, c2, s({})];
  assert.deepEqual(kural_uygula('sekme', {}, satirlar).deneme_idler, [a.deneme_id]);
  assert.deepEqual(kural_uygula('zaman_asimi', {}, satirlar).deneme_idler, [b.deneme_id]);
  const r = kural_uygula('cihaz_uyusmazligi', {}, satirlar);
  assert.deepEqual(r.katilimci_idler, ['k9']);
  assert.deepEqual(r.deneme_idler, []);
  assert.equal(r.satirlar.length, 1);
  assert.equal(KURALLAR.cihaz_uyusmazligi.hedef, 'katilimci');
});

test('rozetler', () => {
  const r = rozetler({ cihaz_uyusmazligi: true, tablet_mi: true, sekme_degisti: true, duraklatildi: true, buton_ilk_gorunur: false, iz_eksik: true });
  assert.deepEqual(r.map((x) => x.kod), ['cihaz_uyusmazligi', 'tablet', 'sekme_degisti', 'duraklatildi', 'buton_gorunmuyor', 'iz_eksik']);
  assert.deepEqual(rozetler({ buton_ilk_gorunur: null }), []);
});

test('neden denetimi', () => {
  assert.equal(neden_dogrula('teknik_hata', ''), null);
  assert.ok(neden_dogrula('', ''));
  assert.ok(neden_dogrula('diger', '  '));
  assert.equal(neden_dogrula('diger', 'Yanlış ürün'), null);
});
