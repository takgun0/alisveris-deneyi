// Ekran uyarıları: mobilde yatay tutma, masaüstünde dar pencere.
//
// Uyarı açıkken tam ekran bir örtü gösterilir; deney ekranındaki hiçbir
// öğeye dokunulamaz. Açılma ve kapanma anları dinleyicilere bildirilir;
// deneme modülü bunlarla sayacı duraklatır (duraklatildi / devam_edildi).

import { uyari_durumu, UYARI_METINLERI } from './cihaz.js';
import { el } from './ekran.js';

export class UyariYoneticisi {
  /**
   * @param {object} p
   * @param {'masaustu'|'mobil'} p.cihaz deney başında belirlenen cihaz türü
   * @param {number} p.masaustu_min_genislik
   * @param {boolean} [p.yon_denetimi=true] demo modunda elle mobil seçilince kapatılır
   */
  constructor({ cihaz, masaustu_min_genislik, yon_denetimi = true }) {
    this.cihaz = cihaz;
    this.masaustu_min_genislik = masaustu_min_genislik;
    this.yon_denetimi = yon_denetimi;
    this.acik_uyari = null;
    this.dinleyiciler = new Set();
    this.ortu = el('div', { class: 'uyari-ortusu gizli', role: 'alertdialog', 'aria-live': 'assertive' },
      el('p', { 'data-oge': 'uyari-metni' }));
    document.body.appendChild(this.ortu);

    // resize olayı hem pencere boyutu hem ekran yönü değişiminde gelir.
    this._denetle = (olay) => this.denetle(olay?.timeStamp ?? performance.now(), olay?.type ?? 'baslangic');
    window.addEventListener('resize', this._denetle);
    window.addEventListener('orientationchange', this._denetle);
    this.denetle(performance.now(), 'baslangic');
  }

  /**
   * Dinleyici: (olay) => void
   *   olay = { tur: 'acildi'|'kapandi', uyari: 'yatay'|'dar_pencere', zaman: number }
   */
  dinle(geri_cagir) {
    this.dinleyiciler.add(geri_cagir);
    return () => this.dinleyiciler.delete(geri_cagir);
  }

  get acik_mi() { return this.acik_uyari !== null; }

  denetle(zaman) {
    let yeni = uyari_durumu({
      cihaz: this.cihaz,
      pencere_genislik: window.innerWidth,
      pencere_yukseklik: window.innerHeight,
      masaustu_min_genislik: this.masaustu_min_genislik,
    });
    if (yeni === 'yatay' && !this.yon_denetimi) yeni = null;
    if (yeni === this.acik_uyari) return;

    const onceki = this.acik_uyari;
    this.acik_uyari = yeni;
    if (onceki) this.bildir({ tur: 'kapandi', uyari: onceki, zaman });
    if (yeni) {
      this.ortu.querySelector('p').textContent = UYARI_METINLERI[yeni];
      this.ortu.classList.remove('gizli');
      this.bildir({ tur: 'acildi', uyari: yeni, zaman });
    } else {
      this.ortu.classList.add('gizli');
    }
  }

  bildir(olay) {
    for (const d of this.dinleyiciler) d(olay);
  }
}
