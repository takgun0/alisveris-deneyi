// Kontrast denetimi.
//
// deney.json'daki renkleri okur, WCAG 2.1 bağıl parlaklık formülüyle bütün
// kontrast oranlarını yazdırır. Hedefler tutmazsa 1 çıkış koduyla biter.
//
// Hedefler (deney.json > kontrast_hedefleri):
//   R1 dolgu / beyaz yüzey : 1,4 – 1,6 arası
//   R2 dolgu / beyaz yüzey : en az 2,9
//   buton yazısı / her dolgu: en az 4,5
//
// Çalıştırma: npm run kontrast

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/** "#RRGGBB" → {r, g, b} (0–255) */
export function hex_coz(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`Geçersiz renk kodu: ${hex}`);
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** WCAG 2.1 bağıl parlaklık (0–1). */
export function bagil_parlaklik(hex) {
  const { r, g, b } = hex_coz(hex);
  const kanal = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * kanal(r) + 0.7152 * kanal(g) + 0.0722 * kanal(b);
}

/** İki renk arasındaki kontrast oranı (1–21). */
export function kontrast_orani(hex1, hex2) {
  const l1 = bagil_parlaklik(hex1);
  const l2 = bagil_parlaklik(hex2);
  const [acik, koyu] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (acik + 0.05) / (koyu + 0.05);
}

/**
 * Bütün oranları hesaplar ve hedeflere göre denetler.
 * @returns {{satirlar: {ad:string, oran:number, hedef:string, tamam:boolean}[], hatasiz: boolean}}
 */
export function kontrast_denetle(deney) {
  const { renkler, kontrast_hedefleri: h } = deney;
  const satirlar = [];
  const ekle = (ad, oran, hedef, tamam) => satirlar.push({ ad, oran, hedef, tamam });

  const r1 = kontrast_orani(renkler.buton.R1, renkler.yuzey);
  ekle('R1 dolgu / beyaz yüzey', r1, `${h.R1_yuzey_min}–${h.R1_yuzey_max}`,
    r1 >= h.R1_yuzey_min && r1 <= h.R1_yuzey_max);

  for (const kod of ['R2', 'R3']) {
    const oran = kontrast_orani(renkler.buton[kod], renkler.yuzey);
    ekle(`${kod} dolgu / beyaz yüzey`, oran, `≥ ${h.R2_yuzey_min}`, oran >= h.R2_yuzey_min);
  }

  // Alıştırma butonu yalnızca bilgi için yazdırılır; hedefi yoktur.
  const r0 = kontrast_orani(renkler.buton.R0, renkler.yuzey);
  ekle('R0 (alıştırma) dolgu / beyaz yüzey', r0, 'bilgi', true);

  for (const [kod, dolgu] of Object.entries(renkler.buton)) {
    const oran = kontrast_orani(renkler.buton_yazi, dolgu);
    ekle(`buton yazısı / ${kod} dolgu`, oran, `≥ ${h.buton_yazi_min}`, oran >= h.buton_yazi_min);
  }

  ekle('metin / zemin', kontrast_orani(renkler.metin, renkler.zemin), 'bilgi', true);
  ekle('metin / vurgu (nötr)', kontrast_orani(renkler.metin, renkler.vurgu_notr), 'bilgi', true);

  return { satirlar, hatasiz: satirlar.every((s) => s.tamam) };
}

// ---- Script olarak çalıştırıldığında ----
const bu_dosya = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === bu_dosya) {
  const kok = path.resolve(path.dirname(bu_dosya), '..');
  const deney = JSON.parse(readFileSync(path.join(kok, 'site', 'yapilandirma', 'deney.json'), 'utf8'));
  const { satirlar, hatasiz } = kontrast_denetle(deney);
  for (const s of satirlar) {
    const durum = s.tamam ? 'TAMAM' : 'HATA ';
    console.log(`${durum}  ${s.oran.toFixed(2).padStart(5)}:1  (hedef ${s.hedef})  ${s.ad}`);
  }
  if (!hatasiz) {
    console.error('Kontrast hedefleri tutmuyor.');
    process.exit(1);
  }
  console.log('Bütün kontrast hedefleri tutuyor.');
}
