import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  yeni_durum, hatali_deneme, kalan_kilit, sure_metni, SERBEST_DENEME, ILK_KILIT_MS, EN_UZUN_KILIT_MS,
} from '../../site/js/yonetim/giris_siniri.js';

test('ilk 4 hatalı deneme kilitlemez, 5. deneme 1 dakika kilitler', () => {
  let d = yeni_durum();
  for (let i = 1; i < SERBEST_DENEME; i++) {
    d = hatali_deneme(d, 1000);
    assert.equal(kalan_kilit(d, 1000), 0);
  }
  d = hatali_deneme(d, 1000);
  assert.equal(kalan_kilit(d, 1000), ILK_KILIT_MS);
});

test('kilitten sonraki her hata süreyi ikiye katlar, en çok 30 dakika', () => {
  let d = yeni_durum();
  const sureler = [];
  for (let i = 0; i < 12; i++) {
    d = hatali_deneme(d, 0);
    sureler.push(kalan_kilit(d, 0));
  }
  assert.deepEqual(sureler.slice(4, 10), [1, 2, 4, 8, 16, 30].map((dk) => dk * 60_000));
  assert.equal(sureler.at(-1), EN_UZUN_KILIT_MS);
});

test('kilit süresi zamanla biter; bozuk durum güvenle okunur', () => {
  const d = hatali_deneme({ hatali: 4, kilit_bitis: 0 }, 0);
  assert.equal(kalan_kilit(d, ILK_KILIT_MS + 1), 0);
  assert.equal(kalan_kilit(null, 5), 0);
  assert.equal(hatali_deneme(undefined, 0).hatali, 1);
});

test('süre metni', () => {
  assert.equal(sure_metni(45_000), '45 saniye');
  assert.equal(sure_metni(59_001), '1 dakika');
  assert.equal(sure_metni(180_000), '3 dakika');
});
