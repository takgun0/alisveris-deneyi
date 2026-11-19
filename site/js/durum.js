// Katılımcının ilerleme durumu: localStorage'da saklama ve geçiş kuralları.
//
// Durum nesnesi (localStorage'da JSON olarak durur):
// {
//   surum: 1,
//   asama: 'onam' | 'anket' | 'deneme' | 'tercih' | 'bitis' | 'tamamlandi',
//   cihaz: { cihaz, tablet_mi, tespit },          // deney başında bir kez belirlenir
//   katilimci: { katilimci_id, katilimci_kodu, sira_no, plan: [7 deneme] },
//   deneme_indeksi: 0..6,                          // plan içindeki sıra (0 = alıştırma)
//   deneme_adimi: 'gorev' | 'urun' | 'eklendi' | 'zorluk',
//   deneme_sonucu: null | 'basarili' | ...         // geçerli denemenin sonucu
// }
//
// Geçiş fonksiyonları saftır (girdi durumunu değiştirmez, yenisini döndürür)
// ve Node'da test edilir. Saklama fonksiyonları localStorage hatalarını yutar:
// gizli pencerede veya kota dolduğunda deney yine de çalışır.

export const DURUM_SURUMU = 1;

/** localStorage anahtarı; demo modu gerçek ilerlemeye karışmasın diye ayrıdır. */
export function durum_anahtari(demo) {
  return demo ? 'sepete_ekle_demo_durum_v1' : 'sepete_ekle_durum_v1';
}
export function tamamlandi_anahtari(demo) {
  return demo ? 'sepete_ekle_demo_tamamlandi_v1' : 'sepete_ekle_tamamlandi_v1';
}

// ---------------------------------------------------------------------
// Saklama (saf değil; tarayıcıda kullanılır)
// ---------------------------------------------------------------------
export function durumu_oku(demo, depo = globalThis.localStorage) {
  try {
    const ham = depo.getItem(durum_anahtari(demo));
    if (!ham) return null;
    const durum = JSON.parse(ham);
    return durum?.surum === DURUM_SURUMU ? durum : null;
  } catch {
    return null;
  }
}

export function durumu_yaz(demo, durum, depo = globalThis.localStorage) {
  try {
    depo.setItem(durum_anahtari(demo), JSON.stringify(durum));
    return true;
  } catch {
    return false;
  }
}

export function durumu_sil(demo, depo = globalThis.localStorage) {
  try { depo.removeItem(durum_anahtari(demo)); } catch { /* yok say */ }
}

/**
 * Bu tarayıcıda deney tamamlanmış mı?
 * @returns {{katilimci_kodu: string}|null} tamamlandıysa katılımcı kodu
 */
export function tamamlanma_kaydi(demo, depo = globalThis.localStorage) {
  try {
    const ham = depo.getItem(tamamlandi_anahtari(demo));
    if (!ham) return null;
    const kayit = JSON.parse(ham);
    return typeof kayit?.katilimci_kodu === 'string' ? kayit : null;
  } catch {
    return null;
  }
}

export function tamamlandi_isaretle(demo, katilimci_kodu, depo = globalThis.localStorage) {
  try {
    depo.setItem(tamamlandi_anahtari(demo), JSON.stringify({ katilimci_kodu }));
  } catch { /* yok say */ }
}

// ---------------------------------------------------------------------
// Saf geçişler
// ---------------------------------------------------------------------
export function yeni_durum(cihaz) {
  return {
    surum: DURUM_SURUMU,
    asama: 'onam',
    cihaz,
    katilimci: null,
    deneme_indeksi: 0,
    deneme_adimi: 'gorev',
    deneme_sonucu: null,
  };
}

/** Geçerli denemenin plan satırı. */
export function gecerli_deneme(durum) {
  return durum.katilimci?.plan?.[durum.deneme_indeksi] ?? null;
}

/** Katılımcı oluşturulduktan sonra: ilk deneme (alıştırma) görev ekranı. */
export function katilimci_atandi(durum, katilimci) {
  return { ...durum, asama: 'deneme', katilimci, deneme_indeksi: 0, deneme_adimi: 'gorev', deneme_sonucu: null };
}

/** Denemenin adımını değiştirir. */
export function adim_degisti(durum, deneme_adimi, deneme_sonucu = durum.deneme_sonucu) {
  return { ...durum, deneme_adimi, deneme_sonucu };
}

/** Sonraki denemeye geçer; 6. denemeden sonra tercih sorusuna. */
export function sonraki_deneme(durum) {
  const son_indeks = durum.katilimci.plan.length - 1;
  if (durum.deneme_indeksi >= son_indeks) {
    return { ...durum, asama: 'tercih', deneme_adimi: 'gorev', deneme_sonucu: null };
  }
  return { ...durum, deneme_indeksi: durum.deneme_indeksi + 1, deneme_adimi: 'gorev', deneme_sonucu: null };
}

/**
 * Sayfa yeniden açıldığında kaydedilmiş durumu düzeltir.
 *
 * Kurallar (proje kararları):
 *  - Görev ekranında (Başla'ya basılmadan) kalınmışsa aynı görev ekranından devam edilir.
 *  - Ürün sayfasında kalınmışsa deneme yarıda kalmıştır: tekrarlanmaz,
 *    'kesildi' sonucuyla kaydedilir ve sonraki denemeye geçilir.
 *  - "Eklendi" veya zorluk ekranında kalınmışsa ölçüm tamamlanmıştır:
 *    zorluk sorusundan devam edilir.
 *
 * @returns {{durum: object, kesilen_deneme: object|null}}
 *   kesilen_deneme: 'kesildi' olarak kaydedilmesi gereken plan satırı
 */
export function yeniden_acilista_duzelt(durum) {
  if (durum.asama !== 'deneme') return { durum, kesilen_deneme: null };

  if (durum.deneme_adimi === 'urun') {
    const kesilen_deneme = gecerli_deneme(durum);
    return { durum: sonraki_deneme(durum), kesilen_deneme };
  }
  if (durum.deneme_adimi === 'eklendi') {
    return { durum: adim_degisti(durum, 'zorluk'), kesilen_deneme: null };
  }
  return { durum, kesilen_deneme: null };
}
