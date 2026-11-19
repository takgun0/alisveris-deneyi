// Cihaz türü tespiti ve ekran uyarıları.
//
// Cihaz türü ekran genişliğiyle DEĞİL, giriş yöntemiyle belirlenir:
//   (pointer: coarse)  → mobil
//   (pointer: fine)    → masaustu
//   ikisi de değilse   → (hover: hover) varsa masaustu, yoksa mobil
// Tablet: girişi kaba ve ekranının kısa kenarı ≥ 600 CSS pikseli olan cihaz.
// Tabletler mobil grubunda sayılır ve ayrıca işaretlenir.
//
// Bu dosyadaki fonksiyonlar saftır: tarayıcı değerleri parametre olarak
// verilir; böylece Node'da test edilebilir.

/**
 * @param {object} p
 * @param {(sorgu: string) => boolean} p.eslesir  matchMedia(sorgu).matches
 * @param {number} p.ekran_genislik    screen.width (CSS px)
 * @param {number} p.ekran_yukseklik   screen.height (CSS px)
 * @param {number} p.pencere_genislik  innerWidth
 * @param {number} p.pencere_yukseklik innerHeight
 * @param {number} [p.tablet_min_kisa_kenar=600]
 * @returns {{cihaz: 'masaustu'|'mobil', tablet_mi: boolean, tespit: object}}
 */
export function cihaz_tespit_et({
  eslesir, ekran_genislik, ekran_yukseklik, pencere_genislik, pencere_yukseklik,
  tablet_min_kisa_kenar = 600,
}) {
  const pointer_kaba = eslesir('(pointer: coarse)');
  const pointer_ince = eslesir('(pointer: fine)');
  const hover = eslesir('(hover: hover)');

  let cihaz;
  let kural;
  if (pointer_kaba) {
    cihaz = 'mobil';
    kural = 'pointer_kaba';
  } else if (pointer_ince) {
    cihaz = 'masaustu';
    kural = 'pointer_ince';
  } else {
    cihaz = hover ? 'masaustu' : 'mobil';
    kural = hover ? 'hover_var' : 'hover_yok';
  }

  const kisa_kenar = Math.min(ekran_genislik, ekran_yukseklik);
  const tablet_mi = cihaz === 'mobil' && pointer_kaba && kisa_kenar >= tablet_min_kisa_kenar;

  return {
    cihaz,
    tablet_mi,
    // Katılımcı kaydına yazılan tespit ayrıntıları.
    tespit: {
      kural,
      pointer_kaba,
      pointer_ince,
      hover,
      any_pointer_kaba: eslesir('(any-pointer: coarse)'),
      any_pointer_ince: eslesir('(any-pointer: fine)'),
      any_hover: eslesir('(any-hover: hover)'),
      ekran_genislik,
      ekran_yukseklik,
      pencere_genislik,
      pencere_yukseklik,
    },
  };
}

/**
 * Hangi uyarının gösterilmesi gerektiğini döndürür.
 *   mobil + yatay (genişlik > yükseklik)      → 'yatay'
 *   masaüstü + pencere genişliği < 1024 px     → 'dar_pencere'
 *   aksi halde                                 → null
 */
export function uyari_durumu({ cihaz, pencere_genislik, pencere_yukseklik, masaustu_min_genislik = 1024 }) {
  if (cihaz === 'mobil' && pencere_genislik > pencere_yukseklik) return 'yatay';
  if (cihaz === 'masaustu' && pencere_genislik < masaustu_min_genislik) return 'dar_pencere';
  return null;
}

export const UYARI_METINLERI = Object.freeze({
  yatay: 'Lütfen telefonunuzu dik tutun',
  dar_pencere: 'Lütfen tarayıcı penceresini tam ekran yapın',
});

/** Tarayıcıda çalışırken tespiti yapar (saf olmayan küçük sarmalayıcı). */
export function tarayicida_tespit_et(tablet_min_kisa_kenar) {
  return cihaz_tespit_et({
    eslesir: (sorgu) => window.matchMedia(sorgu).matches,
    ekran_genislik: window.screen.width,
    ekran_yukseklik: window.screen.height,
    pencere_genislik: window.innerWidth,
    pencere_yukseklik: window.innerHeight,
    tablet_min_kisa_kenar,
  });
}
