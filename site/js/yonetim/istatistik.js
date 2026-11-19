// Betimsel istatistik — SAF modül (DOM ve ağ kullanmaz; Node'da test edilir).
//
// Yönetim panelindeki bütün sayılar buradan gelir. Bu ekran betimsel bir ön
// izlemedir; nihai istatistiksel analiz dışa aktarılan verilerle yapılır.
//
//   ortalama için güven aralığı      : t dağılımı (n − 1 sd)
//   geometrik ortalama ve aralığı    : log ölçekte t aralığı, exp ile geri dönüştürülür
//   medyan için güven aralığı        : tohumlu bootstrap (yüzdelik yöntemi, varsayılan 1000 tekrar)

/** Sonlu sayıları alır (null, NaN, Infinity atılır). */
export function sayilar(dizi) {
  return dizi.filter((v) => typeof v === 'number' && Number.isFinite(v));
}

export function ortalama(x) {
  return x.length ? x.reduce((t, v) => t + v, 0) / x.length : null;
}

/** Örneklem standart sapması (n − 1). */
export function standart_sapma(x) {
  if (x.length < 2) return null;
  const m = ortalama(x);
  return Math.sqrt(x.reduce((t, v) => t + (v - m) ** 2, 0) / (x.length - 1));
}

/** Doğrusal ara değerli yüzdelik (R'nin varsayılanı, tip 7). */
export function yuzdelik(x, p) {
  if (!x.length) return null;
  const s = [...x].sort((a, b) => a - b);
  const h = (s.length - 1) * p;
  const alt = Math.floor(h);
  const ust = Math.ceil(h);
  return s[alt] + (h - alt) * (s[ust] - s[alt]);
}

export const medyan = (x) => yuzdelik(x, 0.5);

/** Geometrik ortalama (yalnızca pozitif değerler). */
export function geometrik_ortalama(x) {
  const p = x.filter((v) => v > 0);
  return p.length ? Math.exp(ortalama(p.map(Math.log))) : null;
}

// ---------------------------------------------------------------------
// Dağılım fonksiyonları
// ---------------------------------------------------------------------

/** Standart normal dağılımın ters birikimli fonksiyonu (Acklam, bağıl hata < 1.2e-9). */
export function normal_ters(p) {
  if (p <= 0 || p >= 1) throw new RangeError('p (0,1) aralığında olmalı');
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const alt = 0.02425;
  if (p < alt) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - alt) return -normal_ters(1 - p);
  const q = p - 0.5;
  const r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

/** log Γ(x) (Lanczos yaklaşımı). */
function log_gamma(x) {
  const g = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x;
  const t = x + 5.5 - (x + 0.5) * Math.log(x + 5.5);
  let s = 1.000000000190015;
  for (const c of g) s += c / ++y;
  return -t + Math.log(2.5066282746310005 * s / x);
}

/** Düzenlenmiş eksik beta fonksiyonu I_x(a, b) (sürekli kesir; Numerical Recipes). */
export function eksik_beta(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const on = Math.exp(log_gamma(a + b) - log_gamma(a) - log_gamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  const kesir = (x, a, b) => {
    const kucuk = 1e-300;
    let c = 1;
    let d = 1 - (a + b) * x / (a + 1);
    if (Math.abs(d) < kucuk) d = kucuk;
    d = 1 / d;
    let h = d;
    for (let m = 1; m <= 300; m++) {
      const m2 = 2 * m;
      let aa = m * (b - m) * x / ((a + m2 - 1) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < kucuk) d = kucuk;
      c = 1 + aa / c; if (Math.abs(c) < kucuk) c = kucuk;
      d = 1 / d; h *= d * c;
      aa = -(a + m) * (a + b + m) * x / ((a + m2) * (a + m2 + 1));
      d = 1 + aa * d; if (Math.abs(d) < kucuk) d = kucuk;
      c = 1 + aa / c; if (Math.abs(c) < kucuk) c = kucuk;
      d = 1 / d;
      const del = d * c;
      h *= del;
      if (Math.abs(del - 1) < 3e-14) break;
    }
    return h;
  };
  return x < (a + 1) / (a + b + 2) ? on * kesir(x, a, b) / a : 1 - on * kesir(1 - x, b, a) / b;
}

/** t dağılımının birikimli fonksiyonu. */
export function t_dagilimi(t, sd) {
  const p = 0.5 * eksik_beta(sd / (sd + t * t), sd / 2, 0.5);
  return t >= 0 ? 1 - p : p;
}

/** t dağılımının ters birikimli fonksiyonu (ikiye bölme; mutlak hata < 1e-9). */
export function t_ters(p, sd) {
  if (p <= 0 || p >= 1) throw new RangeError('p (0,1) aralığında olmalı');
  if (p < 0.5) return -t_ters(1 - p, sd);
  let alt = 0;
  let ust = 1;
  while (t_dagilimi(ust, sd) < p) ust *= 2;
  for (let i = 0; i < 200 && ust - alt > 1e-10; i++) {
    const orta = (alt + ust) / 2;
    if (t_dagilimi(orta, sd) < p) alt = orta; else ust = orta;
  }
  return (alt + ust) / 2;
}

/** Ortalama için t güven aralığı. */
export function ortalama_guven_araligi(x, duzey = 0.95) {
  if (x.length < 2) return null;
  const m = ortalama(x);
  const h = t_ters(1 - (1 - duzey) / 2, x.length - 1) * standart_sapma(x) / Math.sqrt(x.length);
  return [m - h, m + h];
}

/** Geometrik ortalama için aralık: log ölçekte t aralığı, exp ile geri dönüştürülür. */
export function geometrik_guven_araligi(x, duzey = 0.95) {
  const l = x.filter((v) => v > 0).map(Math.log);
  const a = ortalama_guven_araligi(l, duzey);
  return a ? [Math.exp(a[0]), Math.exp(a[1])] : null;
}

// ---------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------

/** Tohumlu sözde rastgele sayı üreteci (mulberry32); [0, 1). */
export function rastgele_uretec(tohum) {
  let a = tohum >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Medyan için yüzdelik bootstrap güven aralığı (aynı tohum → aynı sonuç). */
export function medyan_guven_araligi(x, { tekrar = 1000, tohum = 20261114, duzey = 0.95 } = {}) {
  if (x.length < 2) return null;
  const r = rastgele_uretec(tohum);
  const n = x.length;
  const medyanlar = new Float64Array(tekrar);
  const ornek = new Float64Array(n);
  for (let i = 0; i < tekrar; i++) {
    for (let j = 0; j < n; j++) ornek[j] = x[Math.floor(r() * n)];
    medyanlar[i] = medyan(Array.from(ornek));
  }
  const m = Array.from(medyanlar);
  return [yuzdelik(m, (1 - duzey) / 2), yuzdelik(m, 1 - (1 - duzey) / 2)];
}

/**
 * Bir ölçünün bütün betimsel özeti.
 * @param {Array<number|null>} ham
 * @param {{bootstrap?: boolean, tekrar?: number, tohum?: number}} [secenek]
 */
export function betimle(ham, { bootstrap = true, tekrar = 1000, tohum = 20261114 } = {}) {
  const x = sayilar(ham);
  return {
    n: x.length,
    ortalama: ortalama(x),
    ortalama_ga: ortalama_guven_araligi(x),
    standart_sapma: standart_sapma(x),
    medyan: medyan(x),
    medyan_ga: bootstrap ? medyan_guven_araligi(x, { tekrar, tohum }) : null,
    geometrik_ortalama: geometrik_ortalama(x),
    geometrik_ga: geometrik_guven_araligi(x),
    en_kucuk: x.length ? Math.min(...x) : null,
    en_buyuk: x.length ? Math.max(...x) : null,
  };
}

/** Satırları anahtara göre gruplar: Map(anahtar → satırlar). */
export function grupla(satirlar, anahtar) {
  const m = new Map();
  for (const s of satirlar) {
    const k = typeof anahtar === 'function' ? anahtar(s) : s[anahtar];
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(s);
  }
  return m;
}

/**
 * Analize giren denemeler: başarılı, alıştırma değil, hariç tutulmamış.
 * (Panelde "hariç tutulanları göster" seçeneği bu kuralı değiştirmez.)
 */
export function analize_girer(s) {
  return s.sonuc === 'basarili' && !s.alistirma_mi && s.deneme_no > 0 && !s.haric_tutuldu;
}
