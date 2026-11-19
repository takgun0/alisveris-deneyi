// site/js/yonetim/istatistik.js birim testleri. Referans değerler R ile
// karşılaştırılarak seçildi (qt, qnorm, quantile type 7).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  sayilar, ortalama, standart_sapma, yuzdelik, medyan, geometrik_ortalama, normal_ters, t_ters,
  ortalama_guven_araligi, geometrik_guven_araligi, medyan_guven_araligi, rastgele_uretec, betimle,
  grupla, analize_girer,
} from '../../site/js/yonetim/istatistik.js';

const yakin = (a, b, tol, mesaj) => assert.ok(Math.abs(a - b) <= tol, `${mesaj ?? ''} ${a} ≉ ${b}`);

test('temel ölçüler', () => {
  const x = [2, 4, 4, 4, 5, 5, 7, 9];
  assert.equal(ortalama(x), 5);
  yakin(standart_sapma(x), 2.13809, 1e-5);
  assert.equal(medyan(x), 4.5);
  assert.equal(medyan([3, 1, 2]), 2);
  assert.equal(yuzdelik([1, 2, 3, 4], 0.25), 1.75); // R: quantile(1:4, .25) = 1.75
  yakin(geometrik_ortalama([1, 10, 100]), 10, 1e-12);
  assert.deepEqual(sayilar([1, null, NaN, Infinity, 2, undefined]), [1, 2]);
  assert.equal(ortalama([]), null);
  assert.equal(standart_sapma([1]), null);
});

test('normal ve t dağılımı yüzdelikleri', () => {
  yakin(normal_ters(0.975), 1.959964, 1e-6);
  yakin(normal_ters(0.001), -3.090232, 1e-6);
  // R: qt(.975, df)
  const beklenen = { 1: 12.7062, 2: 4.302653, 3: 3.182446, 5: 2.570582, 10: 2.228139, 30: 2.042272, 100: 1.983972 };
  for (const [sd, t] of Object.entries(beklenen)) yakin(t_ters(0.975, Number(sd)), t, 1e-4, `sd=${sd}`);
  yakin(t_ters(0.025, 10), -2.228139, 1e-5);
});

test('güven aralıkları', () => {
  const x = [10, 12, 9, 11, 13, 10, 12, 11];
  // R: t.test(x)$conf.int → 9.905391, 12.094609 (qt(.975,7) = 2.364624)
  const [a, b] = ortalama_guven_araligi(x);
  yakin(a, 9.905391, 1e-5);
  yakin(b, 12.094609, 1e-5);
  // Geometrik aralık geometrik ortalamayı içerir ve pozitif
  const [ga, gb] = geometrik_guven_araligi([800, 1200, 950, 3000, 1500]);
  const g = geometrik_ortalama([800, 1200, 950, 3000, 1500]);
  assert.ok(ga > 0 && ga < g && g < gb);
  assert.equal(ortalama_guven_araligi([5]), null);
});

test('bootstrap tohumlu ve tekrarlanabilir', () => {
  const r1 = rastgele_uretec(42);
  const r2 = rastgele_uretec(42);
  for (let i = 0; i < 5; i++) assert.equal(r1(), r2());
  const x = Array.from({ length: 40 }, (_, i) => 500 + ((i * 37) % 23) * 50);
  const a1 = medyan_guven_araligi(x, { tohum: 7 });
  const a2 = medyan_guven_araligi(x, { tohum: 7 });
  assert.deepEqual(a1, a2);
  assert.ok(a1[0] <= medyan(x) && medyan(x) <= a1[1]);
});

test('betimle ve gruplama', () => {
  const b = betimle([1000, 1200, null, 1100, 900], { tekrar: 200 });
  assert.equal(b.n, 4);
  assert.equal(b.medyan, 1050);
  assert.equal(b.en_kucuk, 900);
  const g = grupla([{ k: 'a' }, { k: 'b' }, { k: 'a' }], 'k');
  assert.deepEqual([...g.keys()], ['a', 'b']);
  assert.equal(g.get('a').length, 2);
});

test('analize yalnızca başarılı, alıştırma olmayan, hariç tutulmamış denemeler girer', () => {
  const s = { sonuc: 'basarili', alistirma_mi: false, deneme_no: 2, haric_tutuldu: false };
  assert.equal(analize_girer(s), true);
  assert.equal(analize_girer({ ...s, sonuc: 'vazgecildi' }), false);
  assert.equal(analize_girer({ ...s, alistirma_mi: true, deneme_no: 0 }), false);
  assert.equal(analize_girer({ ...s, haric_tutuldu: true }), false);
});
