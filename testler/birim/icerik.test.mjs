// Ürün içerikleri: her üründe eşit uzunluk ve yapı; görseller kurallara uygun.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const oku = (yol) => readFileSync(new URL(`../../site/${yol}`, import.meta.url), 'utf8');
const deney = JSON.parse(oku('yapilandirma/deney.json'));
const icerik = JSON.parse(oku('icerik/urunler.json')).urunler;
const kodlar = [...deney.urunler.map((u) => u.kod), deney.alistirma_urunu.kod];

const kelime_sayisi = (metin) => metin.trim().split(/\s+/).length;

test('ürün listesi ve fiyatlar görev metniyle aynı', () => {
  assert.deepEqual(deney.urunler.map((u) => [u.kod, u.ad, u.fiyat_tl]), [
    ['kulaklik', 'Kablosuz Kulaklık', 849],
    ['termos', 'Çelik Termos', 799],
    ['sirt_cantasi', 'Sırt Çantası', 899],
    ['masa_lambasi', 'Masa Lambası', 829],
    ['kupa', 'Seramik Kupa Seti', 749],
    ['mouse', 'Kablosuz Mouse', 779],
  ]);
  assert.deepEqual(deney.alistirma_urunu, { kod: 'defter', ad: 'Defter Seti', fiyat_tl: 789 });
  assert.deepEqual(Object.keys(icerik).sort(), [...kodlar].sort());
});

for (const kod of kodlar) {
  test(`${kod}: içerik yapısı ve uzunluğu`, () => {
    const u = icerik[kod];
    assert.ok(u.kategori && u.kategori.length <= 14, 'kategori kısa olmalı (vurgu öğesine sığsın)');

    // Tek cümlelik kısa açıklama
    assert.match(u.kisa_aciklama, /^[^.!?]+[.!?]$/, 'kısa açıklama tek cümle olmalı');
    assert.ok(u.kisa_aciklama.length <= 110, 'kısa açıklama masaüstünde 3 satıra sığmalı');

    // Üç paragraf, toplam 210–230 kelime
    assert.equal(u.aciklama.length, 3);
    const toplam = u.aciklama.reduce((t, p) => t + kelime_sayisi(p), 0);
    assert.ok(toplam >= 210 && toplam <= 230, `açıklama ${toplam} kelime (210–230 olmalı)`);

    // Sekiz satırlı teknik özellik tablosu
    assert.equal(u.ozellikler.length, 8);
    for (const satir of u.ozellikler) {
      assert.equal(satir.length, 2);
      assert.ok(satir[0] && satir[1]);
    }

    // Beş maddelik kullanım ve bakım
    assert.equal(u.bakim.length, 5);
  });

  test(`${kod}: görsel SVG — yazı yok, turuncu yok, yalnızca mavi-gri tonlar`, () => {
    const yol = new URL(`../../site/gorseller/urunler/${kod}.svg`, import.meta.url);
    assert.ok(existsSync(yol));
    const svg = readFileSync(yol, 'utf8');
    assert.doesNotMatch(svg, /<text|<image|href=/i, 'görselde yazı veya dış kaynak olmamalı');
    const renkler = new Set(svg.match(/#[0-9A-Fa-f]{6}/g).map((r) => r.toUpperCase()));
    const izinli = new Set(['#F0F4F8', '#D9E2EC', '#9FB3C8', '#627D98']);
    for (const r of renkler) assert.ok(izinli.has(r), `izin verilmeyen renk ${r}`);
    // Zemin dışında en çok üç ton
    assert.ok([...renkler].filter((r) => r !== '#F0F4F8').length <= 3);
  });
}

test('mağaza stillerinde turuncu yalnızca değişkenle gelir', () => {
  // Turuncu (#E8781E) mağaza sayfasında yalnızca R2/R3 dolgusu olarak, deney.json'dan gelir.
  const css = oku('css/magaza.css') + oku('css/temel.css');
  assert.doesNotMatch(css, /#E8781E/i);
});

test('şablonda koşula bağlı tek dal: yuva seçimi ve alt çubuk', () => {
  const kaynak = oku('js/magaza/sablon.js');
  const konum_dallari = kaynak.match(/kosul\.konum/g) ?? [];
  const renk_kullanimi = kaynak.match(/kosul\.renk/g) ?? [];
  // data-konum, yuva seçimi ve alt çubuk: 3; data-renk ve iki renk değişkeni: 3.
  assert.equal(konum_dallari.length, 3, 'kosul.konum yalnızca yuva ve alt çubuk için kullanılmalı');
  assert.equal(renk_kullanimi.length, 3, 'kosul.renk yalnızca iki renk değişkeni için kullanılmalı');
});
