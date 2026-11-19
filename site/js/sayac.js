// Deneme sayacı: 60 saniyelik zaman sınırı için duraklatılabilir kronometre.
//
// Saf sınıftır; saati okumaz. Bütün zamanlar dışarıdan, performance.now()
// zaman tabanında verilir (olaylarda event.timeStamp, aksi halde
// performance.now()). Böylece Node'da sahte zamanla test edilir.
//
// Sayaç "Başla" tıklamasından başlar ve uyarı (yatay tutma, dar pencere)
// açıkken durur. Sekme değişikliği sayacı DURDURMAZ (proje kararı).

export class DenemeSayaci {
  /** @param {number} sinir_ms zaman sınırı (ör. 60000) */
  constructor(sinir_ms) {
    this.sinir_ms = sinir_ms;
    this.baslangic = null;        // Başla anı
    this.duraklama_basi = null;   // açık duraklamanın başlangıcı
    this.toplam_duraklama = 0;    // kapanmış duraklamaların toplamı
    this.duraklama_sayisi = 0;
  }

  baslat(t) {
    this.baslangic = t;
  }

  get basladi_mi() { return this.baslangic !== null; }
  get durakli_mi() { return this.duraklama_basi !== null; }

  duraklat(t) {
    if (!this.basladi_mi || this.durakli_mi) return false;
    this.duraklama_basi = t;
    this.duraklama_sayisi += 1;
    return true;
  }

  devam(t) {
    if (!this.durakli_mi) return false;
    this.toplam_duraklama += Math.max(0, t - this.duraklama_basi);
    this.duraklama_basi = null;
    return true;
  }

  /** t anına kadar biriken duraklama (açık duraklama dahil). */
  duraklama(t) {
    const acik = this.durakli_mi ? Math.max(0, t - this.duraklama_basi) : 0;
    return this.toplam_duraklama + acik;
  }

  /** Başla'dan t'ye kadar duraklamalar çıkarılmış geçen süre. */
  gecen_net(t) {
    if (!this.basladi_mi) return 0;
    return Math.max(0, t - this.baslangic - this.duraklama(t));
  }

  /** Zaman sınırına kalan süre (ms). */
  kalan(t) {
    return Math.max(0, this.sinir_ms - this.gecen_net(t));
  }

  doldu_mu(t) {
    return this.basladi_mi && this.kalan(t) <= 0;
  }
}
