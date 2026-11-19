// Williams Latin kare üreteci.
//
// Koşulların sunum sırası, birinci dereceden taşıma etkilerini dengeleyen bir
// Williams tasarımıyla belirlenir. 6 koşul olduğu (çift sayı) için 6 dizi yeter.
//
// Çalıştırma:  npm run williams
// Ne yapar:    6 diziyi üretir, site/yapilandirma/deney.json içindeki
//              "williams.diziler" alanına ve supabase/seed.sql dosyasına yazar.
//
// Bu dosyadaki fonksiyonlar saf (yan etkisiz) fonksiyonlardır ve birim
// testlerinde de kullanılır. Dosya yazma işi yalnızca script doğrudan
// çalıştırıldığında yapılır.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const KOSUL_SAYISI = 6;

/**
 * Temel satırdan 6 Williams dizisini üretir.
 * Dizi i, temel satırın her öğesine i eklenerek (mod 6) bulunur.
 * @param {number[]} temel_satir örnek: [0, 1, 5, 2, 4, 3]
 * @returns {number[][]} 6 dizi; her dizi 6 koşul indeksinden oluşur
 */
export function williams_dizileri_uret(temel_satir) {
  const diziler = [];
  for (let i = 0; i < KOSUL_SAYISI; i++) {
    diziler.push(temel_satir.map((c) => (c + i) % KOSUL_SAYISI));
  }
  return diziler;
}

/**
 * Cihaz içi sıra numarası k olan katılımcının atama bilgilerini hesaplar.
 * Kural (veritabanındaki katilimci_olustur fonksiyonuyla birebir aynı):
 *   dizi = k mod 6, blok = floor(k / 6), ürün kaydırması r = (k + blok) mod 6
 * @param {number} sira_no k (0'dan başlar)
 */
export function atama_hesapla(sira_no) {
  const blok = Math.floor(sira_no / KOSUL_SAYISI);
  return {
    dizi_no: sira_no % KOSUL_SAYISI,
    blok,
    urun_kaydirmasi: (sira_no + blok) % KOSUL_SAYISI,
  };
}

/**
 * Bir katılımcının 6 denemelik planını üretir (alıştırma hariç).
 * Koşul indeksi c olan denemenin ürünü: urunler[(c + r) mod 6].
 * @param {number} sira_no k
 * @param {object} deney deney.json içeriği (williams.diziler dolu olmalı)
 * @returns {{deneme_no:number, kosul_indeksi:number, kosul_kodu:string, konum:string, renk:string, urun_kodu:string}[]}
 */
export function plan_olustur(sira_no, deney) {
  const { dizi_no, urun_kaydirmasi } = atama_hesapla(sira_no);
  const dizi = deney.williams.diziler[dizi_no];
  return dizi.map((c, sira) => {
    const kosul = deney.kosullar[c];
    return {
      deneme_no: sira + 1,
      kosul_indeksi: c,
      kosul_kodu: kosul.kod,
      konum: kosul.konum,
      renk: kosul.renk,
      urun_kodu: deney.urunler[(c + urun_kaydirmasi) % KOSUL_SAYISI].kod,
    };
  });
}

// SQL metin değeri için tek tırnakları kaçırır.
function sql_metin(deger) {
  return `'${String(deger).replaceAll("'", "''")}'`;
}

/** supabase/seed.sql içeriğini üretir. */
export function seed_sql_uret(deney) {
  const satirlar = deney.williams.diziler
    .map((d, i) => `  (${i}, array[${d.join(', ')}]::smallint[])`)
    .join(',\n');
  const kosul_kodlari = deney.kosullar.map((k) => sql_metin(k.kod)).join(', ');
  const urun_kodlari = deney.urunler.map((u) => sql_metin(u.kod)).join(', ');
  const liste = (dizi) => `array[${dizi.map(sql_metin).join(', ')}]`;
  return `-- BU DOSYA ÜRETİLİR. Elle düzenlemeyin: npm run williams
-- Kaynak: site/yapilandirma/deney.json

-- Williams dizileri: her satır, bir dizideki 6 koşul indeksinin sunum sırası.
insert into public.diziler (dizi_no, kosul_sirasi) values
${satirlar}
on conflict (dizi_no) do update set kosul_sirasi = excluded.kosul_sirasi;

-- Plan üretimi ve girdi doğrulamasında kullanılan listeler
-- (indeks sırası deney.json ile aynı).
insert into public.deney_ayarlari
  (tek, kosul_kodlari, urun_kodlari, alistirma_urunu, sayfalar, olay_turleri,
   iz_turleri, sonuclar, sira_bosalma_dakika, deneme_maks_olay, deneme_maks_bayt)
values (
  true,
  array[${kosul_kodlari}],
  array[${urun_kodlari}],
  ${sql_metin(deney.alistirma_urunu.kod)},
  ${liste(deney.sayfalar)},
  ${liste(deney.olay_turleri)},
  ${liste(deney.iz_turleri)},
  ${liste(deney.sonuclar)},
  ${Number(deney.olcum.sira_bosalma_dakika)},
  ${Number(deney.olcum.deneme_maks_olay)},
  ${Number(deney.olcum.deneme_maks_bayt)}
)
on conflict (tek) do update set
  kosul_kodlari = excluded.kosul_kodlari,
  urun_kodlari = excluded.urun_kodlari,
  alistirma_urunu = excluded.alistirma_urunu,
  sayfalar = excluded.sayfalar,
  olay_turleri = excluded.olay_turleri,
  iz_turleri = excluded.iz_turleri,
  sonuclar = excluded.sonuclar,
  sira_bosalma_dakika = excluded.sira_bosalma_dakika,
  deneme_maks_olay = excluded.deneme_maks_olay,
  deneme_maks_bayt = excluded.deneme_maks_bayt;
`;
}

// ---- Script olarak çalıştırıldığında dosyaları yaz ----
const bu_dosya = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === bu_dosya) {
  const kok = path.resolve(path.dirname(bu_dosya), '..');
  const deney_yolu = path.join(kok, 'site', 'yapilandirma', 'deney.json');
  const seed_yolu = path.join(kok, 'supabase', 'seed.sql');

  const deney = JSON.parse(readFileSync(deney_yolu, 'utf8'));
  deney.williams.diziler = williams_dizileri_uret(deney.williams.temel_satir);

  // Diziler tek satırda okunabilsin diye JSON'u biraz sıkıştırarak yazıyoruz.
  const json = JSON.stringify(deney, null, 2).replace(
    /\[\s+([\d,\s]+?)\s+\]/g,
    (_, ic) => `[${ic.split(/,\s*/).join(', ')}]`,
  );
  writeFileSync(deney_yolu, json + '\n', 'utf8');
  writeFileSync(seed_yolu, seed_sql_uret(deney), 'utf8');

  console.log('Williams dizileri:');
  deney.williams.diziler.forEach((d, i) => console.log(`  dizi ${i}: ${d.join(' ')}`));
  console.log('Yazıldı: site/yapilandirma/deney.json, supabase/seed.sql');
}
