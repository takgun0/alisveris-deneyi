// Sahte katılımcı verisi üretir ve DEMO tablolarına (test_ önekli) yazar.
//
//   npm run sahte-veri                    → yerel Supabase'e 40 sahte katılımcı
//   npm run sahte-veri -- --sayi=120 --tohum=7
//   node scriptler/sahte_veri.mjs --adres=https://<ref>.supabase.co --anahtar=sb_publishable_... --canli
//
// Veriler katılımcı uygulamasının kullandığı dört fonksiyonla (katilimci_olustur,
// deneme_kaydet, tercih_kaydet, katilimci_bitir) ve YAYINLANABİLİR anahtarla
// yazılır; gizli anahtar gerekmez ve kullanılmaz. Her çağrıda p_demo = true
// olduğundan gerçek tablolara hiçbir şey yazılmaz.
//
// Paketler gerçekçidir: olaylar ve izler üretilir, özet tarayıcıdaki
// ozet.js ile hesaplanır (scriptler/sahte_veri_uretec.mjs).
//
// Veritabanı dakikada en çok 30 katılımcı başlatılmasına izin verir; sınır
// aşılınca betik bir dakika bekleyip devam eder.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sahte_katilimci, sahte_paket, sahte_tercih, rastgele_uretec } from './sahte_veri_uretec.mjs';
import { SUPABASE_ADRESI, SUPABASE_YAYINLANABILIR_ANAHTAR } from '../site/yapilandirma/supabase.js';

const kok = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const deney = JSON.parse(readFileSync(path.join(kok, 'site', 'yapilandirma', 'deney.json'), 'utf8'));

const arguman = (ad, varsayilan) => {
  const a = process.argv.find((x) => x.startsWith(`--${ad}=`));
  return a ? a.slice(ad.length + 3) : varsayilan;
};
const SAYI = Number(arguman('sayi', 40));
const TOHUM = Number(arguman('tohum', 20261114));
const ADRES = arguman('adres', process.env.SUPABASE_ADRESI ?? SUPABASE_ADRESI).replace(/\/$/, '');
const ANAHTAR = arguman('anahtar', process.env.SUPABASE_YAYINLANABILIR_ANAHTAR ?? SUPABASE_YAYINLANABILIR_ANAHTAR);

if (!Number.isInteger(SAYI) || SAYI < 1 || SAYI > 1000) {
  console.error('--sayi 1 ile 1000 arasında bir tam sayı olmalı.');
  process.exit(1);
}
const yerel = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(ADRES);
if (!yerel && !process.argv.includes('--canli')) {
  console.error(`Adres yerel değil (${ADRES}). Canlı projenin demo tablolarına yazmak için --canli ekleyin.`);
  process.exit(1);
}
if (/^sb_secret_/.test(ANAHTAR) || /service_role/.test(ANAHTAR)) {
  console.error('Gizli anahtar kullanılmaz. Yayınlanabilir (sb_publishable_...) anahtarı verin.');
  process.exit(1);
}

const bekle = (ms) => new Promise((coz) => setTimeout(coz, ms));

async function rpc(ad, govde) {
  for (let deneme = 0; ; deneme += 1) {
    const yanit = await fetch(`${ADRES}/rest/v1/rpc/${ad}`, {
      method: 'POST',
      headers: { apikey: ANAHTAR, 'Content-Type': 'application/json' },
      body: JSON.stringify(govde),
    });
    const metin = await yanit.text();
    const veri = metin ? JSON.parse(metin) : null;
    if (yanit.ok) return veri;
    if (veri?.message === 'cok_fazla_katilimci' && deneme < 5) {
      process.stdout.write(' (dakikalık sınır; 60 sn bekleniyor)');
      await bekle(61_000);
      continue;
    }
    throw new Error(`${ad}: HTTP ${yanit.status} ${veri?.message ?? metin}`);
  }
}

const r = rastgele_uretec(TOHUM);
const kosul_kodlari = deney.kosullar.map((k) => k.kod);
const sayac = { katilimci: 0, deneme: 0, tamamlayan: 0 };

console.log(`${ADRES} → demo (test_) tabloları: ${SAYI} sahte katılımcı (tohum ${TOHUM})`);
for (let i = 0; i < SAYI; i += 1) {
  const cihaz = r() < 0.5 ? 'masaustu' : 'mobil';
  const k = sahte_katilimci(r, cihaz);
  const yan = await rpc('katilimci_olustur', {
    p_cihaz: cihaz,
    p_tablet_mi: k.tablet_mi,
    p_cihaz_tespiti: { kural: 'sahte_veri' },
    p_anket: k.anket,
    p_uygulama_surumu: 'sahte-veri',
    p_demo: true,
  });
  sayac.katilimci += 1;
  for (const p of yan.plan.slice(0, k.deneme_sayisi)) {
    await rpc('deneme_kaydet', { p_katilimci_id: yan.katilimci_id, p_paket: sahte_paket({ plan_satiri: p, cihaz, r }), p_demo: true });
    sayac.deneme += 1;
  }
  if (k.deneme_sayisi === yan.plan.length) {
    const t = sahte_tercih(r, kosul_kodlari);
    await rpc('tercih_kaydet', {
      p_katilimci_id: yan.katilimci_id, p_en_cok_kosul: t.en_cok_kosul, p_en_az_kosul: t.en_az_kosul,
      p_neden: t.neden || null, p_gosterim_sirasi: t.gosterim_sirasi, p_demo: true,
    });
    await rpc('katilimci_bitir', { p_katilimci_id: yan.katilimci_id, p_demo: true });
    sayac.tamamlayan += 1;
  }
  process.stdout.write(`\r${i + 1}/${SAYI} katılımcı`);
}
console.log(`\nBitti: ${sayac.katilimci} katılımcı (${sayac.tamamlayan} tamamladı), ${sayac.deneme} deneme.`);
