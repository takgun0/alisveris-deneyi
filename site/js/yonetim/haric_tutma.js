// Hariç tutma kuralları ve rozetler — SAF modül (DOM ve ağ kullanmaz; Node'da test edilir).
//
// Kurallar yalnızca ADAY listesi üretir; hiçbir şeyi değiştirmez. Panel önce
// önizleme gösterir, yönetici onaylarsa tam olarak önizlenen kimlikler
// denemeleri_haric_tut fonksiyonuna gönderilir. Veritabanı veriyi silmez,
// yalnızca işaretler ve işlemi islem_kaydi'na yazar.

export const NEDENLER = ['asiri_uzun_sure', 'sekme_degistirme', 'teknik_hata', 'katilimci_talebi', 'diger'];

/** Satırın üzerindeki uyarı rozetleri. tur: 'uyari' | 'tehlike' | null */
export function rozetler(s) {
  const r = [];
  if (s.cihaz_uyusmazligi) r.push({ kod: 'cihaz_uyusmazligi', metin: 'Cihaz uyuşmazlığı', tur: 'tehlike' });
  if (s.tablet_mi) r.push({ kod: 'tablet', metin: 'Tablet', tur: null });
  if (s.sekme_degisti) r.push({ kod: 'sekme_degisti', metin: 'Sekme değişti', tur: 'uyari' });
  if (s.duraklatildi) r.push({ kod: 'duraklatildi', metin: 'Duraklatıldı', tur: 'uyari' });
  if (s.buton_ilk_gorunur === false) r.push({ kod: 'buton_gorunmuyor', metin: 'Buton ilk anda görünmüyor', tur: 'uyari' });
  if (s.iz_eksik) r.push({ kod: 'iz_eksik', metin: 'İz eksik', tur: null });
  if (s.sira_cakismasi) r.push({ kod: 'sira_cakismasi', metin: 'Sıra çakışması', tur: null });
  return r;
}

/**
 * Kural tanımları.
 *   parametreler: panelde gösterilen girdiler
 *   onerilen_neden: önizlemede varsayılan seçilen neden
 *   hedef: 'deneme' (deneme kimlikleri) veya 'katilimci' (katılımcı kimlikleri)
 */
export const KURALLAR = {
  uzun_sure: {
    ad: 'Tıklama süresi X saniyeden uzun',
    parametreler: [{ ad: 'esik_sn', etiket: 'Eşik (sn)', varsayilan: 30, en_az: 1, en_cok: 60 }],
    onerilen_neden: 'asiri_uzun_sure',
    hedef: 'deneme',
  },
  log_3ss: {
    ad: 'Log süre, cihaz × koşul medyanından 3 SS uzakta',
    parametreler: [{ ad: 'kat', etiket: 'SS katı', varsayilan: 3, en_az: 1, en_cok: 10 }],
    onerilen_neden: 'asiri_uzun_sure',
    hedef: 'deneme',
  },
  sekme: {
    ad: 'Deneme sırasında sekme değiştirildi',
    parametreler: [],
    onerilen_neden: 'sekme_degistirme',
    hedef: 'deneme',
  },
  zaman_asimi: {
    ad: 'Süre doldu (60 sn)',
    parametreler: [],
    onerilen_neden: 'diger',
    onerilen_aciklama: 'Zaman aşımı',
    hedef: 'deneme',
  },
  cihaz_uyusmazligi: {
    ad: 'Cihaz uyuşmazlığı (ankette beyan edilen ≠ tespit edilen)',
    parametreler: [],
    onerilen_neden: 'diger',
    onerilen_aciklama: 'Cihaz uyuşmazlığı',
    hedef: 'katilimci',
  },
};

function standart_sapma(x) {
  if (x.length < 2) return null;
  const m = x.reduce((t, v) => t + v, 0) / x.length;
  return Math.sqrt(x.reduce((t, v) => t + (v - m) ** 2, 0) / (x.length - 1));
}
function medyan(x) {
  if (!x.length) return null;
  const s = [...x].sort((a, b) => a - b);
  const h = (s.length - 1) / 2;
  return (s[Math.floor(h)] + s[Math.ceil(h)]) / 2;
}

/** Henüz hariç tutulmamış, alıştırma olmayan ve sonucu olan denemeler. */
const aday_deneme = (s) => s.deneme_no > 0 && s.sonuc && !s.haric_tutuldu;

/**
 * Bir kuralı uygular ve aday listesini döndürür (hiçbir şeyi değiştirmez).
 * @param {string} kod KURALLAR anahtarı
 * @param {object} parametreler { esik_sn: 30 } gibi
 * @param {object[]} satirlar genis_tablo satırları (süzülmüş olabilir)
 * @param {string} [olcu='tiklama_suresi_ms']
 * @returns {{kural: object, deneme_idler: number[], katilimci_idler: string[], satirlar: object[]}}
 */
export function kural_uygula(kod, parametreler, satirlar, olcu = 'tiklama_suresi_ms') {
  const tanim = KURALLAR[kod];
  if (!tanim) throw new Error(`Bilinmeyen kural: ${kod}`);
  const p = Object.fromEntries(tanim.parametreler.map((x) => {
    const v = Number(parametreler?.[x.ad] ?? x.varsayilan);
    if (!Number.isFinite(v) || v < x.en_az || v > x.en_cok) throw new RangeError(`${x.etiket} ${x.en_az}–${x.en_cok} aralığında olmalı`);
    return [x.ad, v];
  }));
  let secilen = [];

  if (kod === 'uzun_sure') {
    secilen = satirlar.filter((s) => aday_deneme(s) && s.sonuc === 'basarili' && s[olcu] > p.esik_sn * 1000);
  } else if (kod === 'log_3ss') {
    // Her cihaz × koşul hücresinde, başarılı ve hariç tutulmamış denemelerin
    // log süreleri üzerinden: |log x − medyan(log)| > kat × SS(log)
    const hucreler = new Map();
    for (const s of satirlar) {
      if (!aday_deneme(s) || s.sonuc !== 'basarili' || !(s[olcu] > 0)) continue;
      const k = `${s.cihaz}|${s.kosul_kodu}`;
      if (!hucreler.has(k)) hucreler.set(k, []);
      hucreler.get(k).push(s);
    }
    for (const grup of hucreler.values()) {
      const l = grup.map((s) => Math.log(s[olcu]));
      const m = medyan(l);
      const ss = standart_sapma(l);
      if (ss === null || ss === 0) continue;
      grup.forEach((s, i) => { if (Math.abs(l[i] - m) > p.kat * ss) secilen.push(s); });
    }
  } else if (kod === 'sekme') {
    secilen = satirlar.filter((s) => aday_deneme(s) && s.sekme_degisti === true);
  } else if (kod === 'zaman_asimi') {
    secilen = satirlar.filter((s) => aday_deneme(s) && s.sonuc === 'zaman_asimi');
  } else if (kod === 'cihaz_uyusmazligi') {
    secilen = satirlar.filter((s) => s.cihaz_uyusmazligi && !s.katilimci_haric_tutuldu);
  }

  const deneme_idler = tanim.hedef === 'deneme' ? [...new Set(secilen.map((s) => s.deneme_id))].sort((a, b) => a - b) : [];
  const katilimci_idler = tanim.hedef === 'katilimci' ? [...new Set(secilen.map((s) => s.katilimci_id))].sort() : [];
  return {
    kural: { kural: kod, ...p, olcu },
    deneme_idler,
    katilimci_idler,
    satirlar: tanim.hedef === 'deneme' ? secilen : [...new Map(secilen.map((s) => [s.katilimci_id, s])).values()],
  };
}

/** Neden ve açıklama denetimi (veritabanıyla aynı kural). */
export function neden_dogrula(neden, aciklama) {
  if (!NEDENLER.includes(neden)) return 'Bir neden seçin.';
  if (neden === 'diger' && !String(aciklama ?? '').trim()) return '"Diğer" için açıklama yazın.';
  if (String(aciklama ?? '').length > 500) return 'Açıklama en çok 500 karakter olabilir.';
  return null;
}
