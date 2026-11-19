// Gerçekçi sahte katılımcı verisi üreteci — SAF modül (ağ ve dosya kullanmaz).
//
// İki yerde kullanılır:
//   - scriptler/sahte_veri.mjs: yerel Supabase'in test_ tablolarına yazar,
//   - scriptler/sahte_api.mjs: Docker yokken yönetim panelini denemek için.
//
// Paketler gerçek uygulamanın gönderdiği biçimdedir: olaylar ve izler
// üretilir, özet site/js/ozet.js ile olaylardan hesaplanır. Böylece sahte
// veri ile gerçek veri aynı yoldan geçer.
//
// Varsayılan etkiler yalnızca paneli denemek içindir; araştırmanın beklentisi
// DEĞİLDİR (K2 ve R1 biraz yavaş, R3 vurgu yüzünden hafif yavaş).

import { randomUUID } from 'node:crypto';
import { ozet_hesapla } from '../site/js/ozet.js';
import { rastgele_uretec } from '../site/js/yonetim/istatistik.js';

export { rastgele_uretec };

/** Ağırlıklı seçim: [[deger, agirlik], ...] */
function sec(r, secenekler) {
  const toplam = secenekler.reduce((t, [, a]) => t + a, 0);
  let x = r() * toplam;
  for (const [d, a] of secenekler) {
    x -= a;
    if (x <= 0) return d;
  }
  return secenekler.at(-1)[0];
}

/** Standart normal (Box–Muller). */
function normal(r) {
  const u = Math.max(r(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
}

const yuvarla = (v) => Math.round(v * 10) / 10;

/** Yaşı anketteki seçeneğe çevirir. */
function yas_grubu(y) {
  return y <= 20 ? '18-20' : y <= 30 ? '21-30' : y <= 40 ? '31-40' : y <= 50 ? '41-50' : '51+';
}

/** Sahte anket yanıtı (cihaza uygun katılım cihazıyla; %3 uyuşmazlık). */
export function sahte_anket(r, cihaz) {
  const uyusmaz = r() < 0.03;
  const dogru = cihaz === 'masaustu' ? 'bilgisayar' : sec(r, [['telefon', 9], ['tablet', 1]]);
  return {
    yas_grubu: yas_grubu(Math.max(18, Math.min(75, Math.round(sec(r, [[21, 5], [29, 3], [42, 2]]) + normal(r) * 3.5)))),
    cinsiyet: sec(r, [['kadin', 48], ['erkek', 48], ['belirtmek_istemiyorum', 4]]),
    alisveris_sikligi: sec(r, [['yilda_birkac_kez', 15], ['ayda_bir', 30], ['ayda_birkac_kez', 35], ['haftada_bir_veya_daha_sik', 20]]),
    alisveris_cihazi: sec(r, [['bilgisayar', 35], ['telefon', 60], ['tablet', 5]]),
    katilim_cihazi: uyusmaz ? (dogru === 'bilgisayar' ? 'telefon' : 'bilgisayar') : dogru,
    renk_ayirt_zorlugu: sec(r, [['hayir', 90], ['evet', 4], ['emin_degilim', 6]]),
  };
}

/** Tıklama süresi (ms) için koşul etkileri. */
function beklenen_sure(cihaz, konum, renk, alistirma_mi) {
  let m = cihaz === 'masaustu' ? 1350 : 1650;
  if (konum === 'K2') m += cihaz === 'masaustu' ? 380 : 120;
  if (renk === 'R1') m += 420;
  if (renk === 'R3') m += 140;
  if (alistirma_mi) m += 700;
  return m;
}

/**
 * Bir deneme için gerçek uygulamanın göndereceği paketi üretir.
 * @param {object} p
 * @param {object} p.plan_satiri {deneme_no, konum, renk, ...}
 * @param {'masaustu'|'mobil'} p.cihaz
 * @param {() => number} p.r rastgele üreteç
 * @param {string} [p.sonuc] verilmezse olasılıkla seçilir
 */
export function sahte_paket({ plan_satiri, cihaz, r, sonuc }) {
  const { deneme_no, konum, renk } = plan_satiri;
  const alistirma_mi = deneme_no === 0;
  sonuc ??= sec(r, [['basarili', 95], ['vazgecildi', 1.5], ['zaman_asimi', 2], ['kesildi', 1.5]]);

  const olaylar = [];
  const izler = [];
  const ekle = (sayfa, olay_turu, zaman_ms, alan = {}) =>
    olaylar.push({ olay_id: randomUUID(), sayfa, olay_turu, zaman_ms: yuvarla(zaman_ms), x: null, y: null, hedef_oge: null, giris_turu: null, ek: null, ...alan });
  const giris = cihaz === 'masaustu' ? 'fare' : 'dokunma';

  // Görev ekranı
  ekle('gorev', 'sayfa_goruntulendi', 0);
  const basla = 1200 + r() * 3000;
  ekle('gorev', 'tiklama', basla, { hedef_oge: 'basla-butonu', giris_turu: giris, x: 640, y: 160, ek: { hedef_buton_mu: false, basili_tutma_ms: yuvarla(60 + r() * 80) } });
  const urun = basla + 15 + r() * 25;
  ekle('urun', 'sayfa_goruntulendi', urun);

  // Buton ilk anda görünür mü? (%4 küçük ekran: kaydırınca görünür)
  const ilk_gorunur = r() > 0.04;
  let sure = beklenen_sure(cihaz, konum, renk, alistirma_mi) * Math.exp(normal(r) * 0.33);
  if (!ilk_gorunur) sure += 600;
  ekle('urun', 'buton_gorundu', ilk_gorunur ? urun : urun + sure * 0.6, { hedef_oge: 'hedef-buton', ek: { ilk_anda: ilk_gorunur, oran: 1 } });

  // Kaydırma izi
  const kaydirma = [];
  if (!ilk_gorunur || r() < 0.25) {
    const derin = 100 + r() * 500;
    kaydirma.push([yuvarla(urun + sure * 0.3), null, yuvarla(derin)]);
    kaydirma.push([yuvarla(urun + sure * 0.55), null, ilk_gorunur ? 0 : yuvarla(derin * 0.6)]);
  }

  // Sekme değişikliği (%3) ve duraklatma (%2)
  if (r() < 0.03) {
    const bas = urun + sure * 0.4;
    const uzunluk = 1500 + r() * 6000;
    ekle('urun', 'sekme_degisti', bas, { ek: { durum: 'gizlendi' } });
    ekle('urun', 'sekme_degisti', bas + uzunluk, { ek: { durum: 'geri_dondu' } });
    sure += uzunluk;
  }
  if (r() < 0.02) {
    const bas = urun + sure * 0.3;
    const uzunluk = 2000 + r() * 4000;
    const uyari = cihaz === 'masaustu' ? 'dar_pencere' : 'yatay';
    ekle('urun', 'duraklatildi', bas, { ek: { uyari } });
    ekle('urun', 'devam_edildi', bas + uzunluk, { ek: { uyari } });
    sure += uzunluk;
  }

  // Hatalı ve boş tıklamalar
  if (r() < 0.06) ekle('urun', 'tiklama', urun + sure * 0.5, { hedef_oge: sec(r, [['favori-butonu', 2], ['adet-artir', 1], ['arama-kutusu', 1]]), giris_turu: giris, x: 300, y: 230, ek: { hedef_buton_mu: false, basili_tutma_ms: 90 } });
  if (r() < 0.08) ekle('urun', 'tiklama', urun + sure * 0.45, { hedef_oge: 'urun-adi', giris_turu: giris, x: 420, y: 130, ek: { hedef_buton_mu: false, basili_tutma_ms: 80 } });

  // Fare izi (masaüstü)
  if (cihaz === 'masaustu') {
    const ornekler = [];
    for (let t = urun + 50; t < urun + Math.min(sure, 20000); t += 50 + r() * 30) {
      ornekler.push([yuvarla(t), yuvarla(300 + r() * 500), yuvarla(150 + r() * 300)]);
    }
    izler.push({ sayfa: 'urun', iz_turu: 'fare', ornekler });
  }
  if (kaydirma.length) izler.push({ sayfa: 'urun', iz_turu: 'kaydirma', ornekler: kaydirma });

  // Sonuç
  if (sonuc === 'basarili') {
    if (cihaz === 'masaustu') ekle('urun', 'buton_hover_ilk', urun + sure * (0.75 + r() * 0.15), { hedef_oge: 'hedef-buton', giris_turu: 'fare', x: 440, y: 480 });
    const t = urun + sure;
    ekle('urun', 'tiklama', t, { hedef_oge: 'hedef-buton', giris_turu: giris, x: 440, y: 490, ek: { hedef_buton_mu: true, basili_tutma_ms: yuvarla(70 + r() * 90), basis_ogesi: 'hedef-buton', kaydirma_y: 0 } });
    ekle('urun', 'gorev_tamamlandi', t, { hedef_oge: 'hedef-buton' });
  } else if (sonuc === 'vazgecildi') {
    ekle('urun', 'tiklama', urun + sure * 2, { hedef_oge: 'vazgec-butonu', giris_turu: giris, ek: { hedef_buton_mu: false, basili_tutma_ms: 80 } });
    ekle('urun', 'vazgecildi', urun + sure * 2 + 900);
  } else if (sonuc === 'zaman_asimi') {
    ekle('urun', 'zaman_asimi', basla + 60000);
  }

  const zorluk_puani = sonuc === 'basarili'
    ? Math.max(1, Math.min(7, Math.round(7.4 - sure / 900 + normal(r) * 0.8)))
    : null;
  const masaustu = cihaz === 'masaustu';
  return {
    deneme_no,
    sonuc,
    zorluk_puani,
    iz_eksik: false,
    ekran_genislik: masaustu ? 1920 : 390,
    ekran_yukseklik: masaustu ? 1080 : 844,
    pencere_genislik: masaustu ? 1440 : 390,
    pencere_yukseklik: masaustu ? 820 : 720,
    cihaz_piksel_orani: masaustu ? 1 : 3,
    tarayici_bilgisi: masaustu ? 'Sahte veri (masaüstü)' : 'Sahte veri (mobil)',
    buton_ilk_gorunur: ilk_gorunur,
    buton_x: masaustu ? (konum === 'K1' ? 333 : 726) : 16,
    buton_y: masaustu ? (konum === 'K1' ? 466 : 174) : (konum === 'K1' ? 233 : 656),
    buton_genislik: masaustu ? 220 : 358,
    buton_yukseklik: masaustu ? 48 : 52,
    ozet: ozet_hesapla({ olaylar, izler, cihaz, sonuc, zorluk_puani }),
    olaylar,
    izler,
  };
}

/** Sahte tercih yanıtı: R2/R3 daha çok beğenilir, R1 daha az. */
export function sahte_tercih(r, kosul_kodlari) {
  const agirlik = (k, ters) => {
    const renk = k.slice(2);
    const a = { R1: 1, R2: 3, R3: 2 }[renk];
    return ters ? 4 - a : a;
  };
  const en_cok = sec(r, kosul_kodlari.map((k) => [k, agirlik(k, false)]));
  const kalan = kosul_kodlari.filter((k) => k !== en_cok);
  const en_az = sec(r, kalan.map((k) => [k, agirlik(k, true)]));
  const nedenler = ['', '', 'Buton daha kolay göze çarpıyordu.', 'Renkler daha uyumluydu.', 'Sade görünüyordu.', 'Butonu hemen buldum.'];
  const gosterim = [...kosul_kodlari].sort(() => r() - 0.5);
  return { en_cok_kosul: en_cok, en_az_kosul: en_az, neden: nedenler[Math.floor(r() * nedenler.length)], gosterim_sirasi: gosterim };
}

/**
 * Bir katılımcının akışını üretir: anket, kaç deneme yapacağı (%6 bırakır),
 * her deneme için paket ve tercih.
 */
export function sahte_katilimci(r, cihaz) {
  const birakir = r() < 0.06;
  return {
    cihaz,
    tablet_mi: cihaz === 'mobil' && r() < 0.06,
    anket: sahte_anket(r, cihaz),
    deneme_sayisi: birakir ? Math.floor(r() * 6) : 7, // 0..5 deneme sonra bırakır veya hepsini yapar
  };
}
