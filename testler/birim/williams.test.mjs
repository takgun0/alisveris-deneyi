// Williams tasarımı ve ürün eşleştirme dengesi testleri.
// Çalıştırma: npm run test:birim

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  williams_dizileri_uret, atama_hesapla, plan_olustur, seed_sql_uret,
} from '../../scriptler/williams.mjs';

const deney = JSON.parse(readFileSync(new URL('../../site/yapilandirma/deney.json', import.meta.url), 'utf8'));
const PLAN_SAYISI = 6;

// k0 … k0+adet-1 arasındaki katılımcıların planları
const planlar = (k0, adet) => Array.from({ length: adet }, (_, i) => plan_olustur(k0 + i, deney));

test('deney.json içindeki diziler üreteçle aynı', () => {
  assert.deepEqual(deney.williams.diziler, williams_dizileri_uret(deney.williams.temel_satir));
});

test('seed.sql deney.json ile güncel', () => {
  const seed = readFileSync(new URL('../../supabase/seed.sql', import.meta.url), 'utf8');
  assert.equal(seed.replaceAll('\r\n', '\n'), seed_sql_uret(deney),
    'seed.sql eski; "npm run williams" çalıştırın');
});

test('temel satır ve dizi kuralı', () => {
  assert.deepEqual(deney.williams.temel_satir, [0, 1, 5, 2, 4, 3]);
  const d = williams_dizileri_uret(deney.williams.temel_satir);
  assert.deepEqual(d[1], [1, 2, 0, 3, 5, 4]);
  for (const dizi of d) assert.deepEqual([...dizi].sort(), [0, 1, 2, 3, 4, 5]);
});

test('atama kuralı: dizi = k mod 6, blok = k div 6, r = (k + blok) mod 6', () => {
  assert.deepEqual(atama_hesapla(0), { dizi_no: 0, blok: 0, urun_kaydirmasi: 0 });
  assert.deepEqual(atama_hesapla(5), { dizi_no: 5, blok: 0, urun_kaydirmasi: 5 });
  assert.deepEqual(atama_hesapla(6), { dizi_no: 0, blok: 1, urun_kaydirmasi: 1 });
  assert.deepEqual(atama_hesapla(13), { dizi_no: 1, blok: 2, urun_kaydirmasi: 3 });
});

// Farklı başlangıç bloklarında da denge tutmalı (ilk 10 blok).
for (let blok = 0; blok < 10; blok++) {
  const k0 = blok * 6;

  test(`blok ${blok}: her koşul her deneme sırasında tam 1 kez`, () => {
    const sayac = new Map();
    for (const plan of planlar(k0, 6)) {
      for (const d of plan) {
        const anahtar = `${d.kosul_indeksi}@${d.deneme_no}`;
        sayac.set(anahtar, (sayac.get(anahtar) ?? 0) + 1);
      }
    }
    assert.equal(sayac.size, 36);
    for (const v of sayac.values()) assert.equal(v, 1);
  });

  test(`blok ${blok}: 30 sıralı koşul çiftinin her biri tam 1 kez`, () => {
    const sayac = new Map();
    for (const plan of planlar(k0, 6)) {
      for (let i = 0; i < plan.length - 1; i++) {
        const anahtar = `${plan[i].kosul_indeksi}>${plan[i + 1].kosul_indeksi}`;
        sayac.set(anahtar, (sayac.get(anahtar) ?? 0) + 1);
      }
    }
    assert.equal(sayac.size, 30);
    for (const v of sayac.values()) assert.equal(v, 1);
  });

  test(`blok ${blok}: her ürün her koşulla tam 1 kez`, () => {
    const sayac = new Map();
    for (const plan of planlar(k0, 6)) {
      for (const d of plan) {
        const anahtar = `${d.urun_kodu}|${d.kosul_kodu}`;
        sayac.set(anahtar, (sayac.get(anahtar) ?? 0) + 1);
      }
    }
    assert.equal(sayac.size, 36);
    for (const v of sayac.values()) assert.equal(v, 1);
  });

  test(`blok ${blok}: her katılımcıda 6 farklı ürün ve 6 farklı koşul`, () => {
    for (const plan of planlar(k0, 6)) {
      assert.equal(plan.length, PLAN_SAYISI);
      assert.equal(new Set(plan.map((d) => d.urun_kodu)).size, 6);
      assert.equal(new Set(plan.map((d) => d.kosul_kodu)).size, 6);
      assert.ok(plan.every((d) => d.urun_kodu !== deney.alistirma_urunu.kod));
    }
  });
}

// 12 katılımcılık bloklar (k = 0–11, 12–23, …)
for (let blok12 = 0; blok12 < 6; blok12++) {
  test(`12'lik blok ${blok12}: her ürün her deneme sırasında tam 2 kez`, () => {
    const sayac = new Map();
    for (const plan of planlar(blok12 * 12, 12)) {
      for (const d of plan) {
        const anahtar = `${d.urun_kodu}@${d.deneme_no}`;
        sayac.set(anahtar, (sayac.get(anahtar) ?? 0) + 1);
      }
    }
    assert.equal(sayac.size, 36);
    for (const v of sayac.values()) assert.equal(v, 2);
  });
}

test('konum ve renk koşul kodundan türer', () => {
  for (const k of deney.kosullar) {
    assert.equal(k.kod, k.konum + k.renk);
    assert.equal(deney.kosullar[k.indeks], k);
  }
  assert.deepEqual(deney.kosullar.map((k) => k.kod), ['K1R1', 'K1R2', 'K1R3', 'K2R1', 'K2R2', 'K2R3']);
});
