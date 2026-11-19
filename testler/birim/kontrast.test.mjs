// Kontrast hesapları ve hedefleri.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { kontrast_orani, bagil_parlaklik, kontrast_denetle } from '../../scriptler/kontrast.mjs';

const deney = JSON.parse(readFileSync(new URL('../../site/yapilandirma/deney.json', import.meta.url), 'utf8'));
const { renkler } = deney;
const yaklasik = (a, b, tolerans = 0.005) => assert.ok(Math.abs(a - b) <= tolerans, `${a} ≈ ${b}`);

test('WCAG uç değerleri', () => {
  yaklasik(bagil_parlaklik('#FFFFFF'), 1);
  yaklasik(bagil_parlaklik('#000000'), 0);
  yaklasik(kontrast_orani('#000000', '#FFFFFF'), 21);
  yaklasik(kontrast_orani('#777777', '#777777'), 1);
});

test('metindeki oranlar (2 basamak)', () => {
  yaklasik(kontrast_orani(renkler.buton.R1, renkler.yuzey), 1.51);
  yaklasik(kontrast_orani(renkler.buton.R1, renkler.buton_yazi), 9.72);
  yaklasik(kontrast_orani(renkler.buton.R2, renkler.yuzey), 2.94);
  yaklasik(kontrast_orani(renkler.buton.R2, renkler.buton_yazi), 4.98);
  yaklasik(kontrast_orani(renkler.buton.R0, renkler.yuzey), 1.60);
});

test('renk kodları değişmedi', () => {
  assert.equal(renkler.zemin, '#F3F6F9');
  assert.equal(renkler.yuzey, '#FFFFFF');
  assert.equal(renkler.metin, '#102A43');
  assert.equal(renkler.buton_yazi, '#102A43');
  assert.equal(renkler.buton.R1, '#BCD6EA');
  assert.equal(renkler.buton.R2, '#E8781E');
  assert.equal(renkler.buton.R3, renkler.buton.R2, 'R3 butonu R2 ile birebir aynı');
  assert.equal(renkler.buton.R0, '#C8CDD4');
  assert.equal(renkler.vurgu.R1, '#D6E4F0');
  assert.equal(renkler.vurgu.R2, '#D6E4F0');
  assert.equal(renkler.vurgu.R3, '#E8781E');
  assert.equal(renkler.vurgu.R0, '#D6E4F0');
});

test('bütün hedefler tutuyor', () => {
  const { satirlar, hatasiz } = kontrast_denetle(deney);
  assert.ok(hatasiz, satirlar.filter((s) => !s.tamam).map((s) => s.ad).join(', '));
});

test('hedef tutmazsa denetim hata verir', () => {
  const bozuk = structuredClone(deney);
  bozuk.renkler.buton.R1 = '#FFFFFF';
  assert.equal(kontrast_denetle(bozuk).hatasiz, false);
});
