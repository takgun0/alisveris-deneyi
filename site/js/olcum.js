// Olay kaydı: bir denemenin bütün olaylarını ve izlerini bellekte toplar.
//
// ÖLÇÜM KURALLARI (proje değişmezleri: süreler yalnızca performance.now() ile; deneme sürerken ağ isteği yok)
//  - Bütün zamanlar performance.now() tabanındadır. Olaylarda event.timeStamp,
//    IntersectionObserver'da entry.time kullanılır; Date.now() hiç kullanılmaz.
//  - zaman_ms, görev ekranının sıfır noktasından itibaren geçen süredir.
//  - Bu modül ağ isteği atmaz. Kayıt yalnızca bellekte ve (sayfa kapanırken)
//    localStorage'da tutulur; gönderim deneme bittikten sonra kuyruk.js ile yapılır.
//
// Olay alanları (veri sözlüğü): olay_id, sayfa, olay_turu, zaman_ms, x, y,
// hedef_oge, giris_turu, ek. katilimci_id, deneme_no, cihaz, kosul_kodu ve
// urun_kodu sunucuda deneme kaydından doldurulur.

const GIRIS_TURLERI = { mouse: 'fare', touch: 'dokunma', pen: 'kalem' };

/** İşaretçi türünü veri sözlüğündeki değere çevirir. */
export function giris_turu(pointer_type) {
  return GIRIS_TURLERI[pointer_type] ?? null;
}

/** Olayın hedefindeki en yakın data-oge kimliği; yoksa 'bos-alan'. */
export function oge_kimligi(hedef) {
  const oge = hedef instanceof Element ? hedef.closest('[data-oge]') : null;
  return oge?.getAttribute('data-oge')?.slice(0, 64) ?? 'bos-alan';
}

const yuvarla = (v) => Math.round(v * 1000) / 1000;
const piksel = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 10) / 10 : null);

function uuid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  // Eski tarayıcılar için: getRandomValues ile sürüm 4 UUID
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export class OlayKaydedici {
  /**
   * @param {object} p
   * @param {number} p.sifir           görev ekranının sıfır noktası (performance.now tabanı)
   * @param {object} p.olcum           deney.json → olcum
   */
  constructor({ sifir, olcum }) {
    this.sifir = sifir;
    this.olcum = olcum;
    this.olaylar = [];
    this.izler = new Map(); // 'sayfa|iz_turu' → [[zaman_ms, x, y], ...]
    this.iz_eksik = false;
    this.olay_siniri_doldu = false;
    this.sayfa = 'gorev';
    this.bayt = 0; // kaba boyut tahmini (JSON uzunluğu)
  }

  /** performance.now tabanındaki bir anı deneme zamanına çevirir (0'ın altına inmez). */
  zaman(an) {
    return yuvarla(Math.max(0, an - this.sifir));
  }

  /**
   * Bir olay ekler. Olay sınırına yaklaşılırsa (son 20 yer) yalnızca
   * deneme sonucunu belirleyen olaylar kabul edilir.
   */
  ekle(olay_turu, an, { x = null, y = null, hedef_oge = null, giris = null, ek = null, sayfa = this.sayfa } = {}) {
    const kritik = ['gorev_tamamlandi', 'vazgecildi', 'zaman_asimi', 'sayfa_goruntulendi'].includes(olay_turu)
      || ek?.hedef_buton_mu === true;
    const sinir = this.olcum.deneme_maks_olay;
    if (this.olaylar.length >= sinir || (!kritik && this.olaylar.length >= sinir - 20)) {
      this.olay_siniri_doldu = true;
      return null;
    }
    const olay = {
      olay_id: uuid(),
      sayfa,
      olay_turu,
      zaman_ms: this.zaman(an),
      x: piksel(x),
      y: piksel(y),
      hedef_oge,
      giris_turu: giris,
      ek,
    };
    this.olaylar.push(olay);
    this.bayt += 260;
    return olay;
  }

  /** İz örneği ekler: [zaman_ms, x, y]. Bayt sınırına yaklaşılırsa iz kesilir ve iz_eksik işaretlenir. */
  iz_ekle(iz_turu, an, x, y) {
    if (this.bayt > this.olcum.deneme_maks_bayt * 0.8) {
      this.iz_eksik = true;
      return;
    }
    const anahtar = `${this.sayfa}|${iz_turu}`;
    if (!this.izler.has(anahtar)) this.izler.set(anahtar, []);
    this.izler.get(anahtar).push([this.zaman(an), piksel(x), piksel(y)]);
    this.bayt += 28;
  }

  sayfa_degisti(sayfa, an) {
    this.sayfa = sayfa;
    this.ekle('sayfa_goruntulendi', an, { sayfa });
  }

  /** İzleri paket biçiminde döndürür. */
  iz_listesi() {
    return [...this.izler].map(([anahtar, ornekler]) => {
      const [sayfa, iz_turu] = anahtar.split('|');
      return { sayfa, iz_turu, ornekler };
    });
  }

  /** localStorage'da saklamak için düz nesne. */
  disari_aktar() {
    return { olaylar: this.olaylar, izler: this.iz_listesi(), iz_eksik: this.iz_eksik };
  }
}

/**
 * Ürün sayfasını dinler: tıklamalar, basış iptali, fare ve kaydırma izleri,
 * hedef butonun görünmesi ve (masaüstünde) üzerine ilk gelinmesi.
 *
 * @param {object} p
 * @param {OlayKaydedici} p.kaydedici
 * @param {HTMLElement} p.hedef_buton
 * @param {'masaustu'|'mobil'} p.cihaz
 * @param {number} p.urun_sifiri  ürün sayfasının sıfır noktası
 * @returns {{ buton: object, kaldir: () => void }}
 *   buton: sıfır noktasındaki buton konumu ve görünürlüğü
 */
export function urun_sayfasini_dinle({ kaydedici, hedef_buton, cihaz, urun_sifiri }) {
  const temizlikler = [];
  const dinle = (hedef, tur, f, secenek = { capture: true, passive: true }) => {
    hedef.addEventListener(tur, f, secenek);
    temizlikler.push(() => hedef.removeEventListener(tur, f, secenek));
  };
  const olcum = kaydedici.olcum;

  // ---- Sıfır noktasındaki buton konumu ve ilk görünürlük ----
  const r = hedef_buton.getBoundingClientRect();
  const gorunen_yukseklik = Math.max(0, Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0));
  const gorunen_genislik = Math.max(0, Math.min(r.right, window.innerWidth) - Math.max(r.left, 0));
  const gorunen_oran = r.width && r.height ? (gorunen_yukseklik * gorunen_genislik) / (r.width * r.height) : 0;
  const ilk_gorunur = gorunen_oran >= olcum.buton_gorunurluk_esigi;
  const buton = {
    buton_ilk_gorunur: ilk_gorunur,
    buton_x: piksel(r.left + window.scrollX),
    buton_y: piksel(r.top + window.scrollY),
    buton_genislik: piksel(r.width),
    buton_yukseklik: piksel(r.height),
  };

  // ---- buton_gorundu ----
  if (ilk_gorunur) {
    kaydedici.ekle('buton_gorundu', urun_sifiri, { hedef_oge: 'hedef-buton', ek: { ilk_anda: true, oran: yuvarla(gorunen_oran) } });
  } else if ('IntersectionObserver' in window) {
    const gozlemci = new IntersectionObserver((girdiler) => {
      for (const g of girdiler) {
        if (g.intersectionRatio >= olcum.buton_gorunurluk_esigi) {
          kaydedici.ekle('buton_gorundu', g.time, { hedef_oge: 'hedef-buton', ek: { ilk_anda: false, oran: yuvarla(g.intersectionRatio) } });
          gozlemci.disconnect();
          return;
        }
      }
    }, { threshold: [olcum.buton_gorunurluk_esigi] });
    gozlemci.observe(hedef_buton);
    temizlikler.push(() => gozlemci.disconnect());
  }

  // ---- buton_hover_ilk (yalnızca masaüstü, yalnızca fare) ----
  if (cihaz === 'masaustu') {
    let goruldu = false;
    const ustune = (olay) => {
      if (goruldu || olay.pointerType !== 'mouse') return;
      goruldu = true;
      kaydedici.ekle('buton_hover_ilk', olay.timeStamp, {
        x: olay.clientX, y: olay.clientY, hedef_oge: 'hedef-buton', giris: 'fare',
      });
    };
    dinle(hedef_buton, 'pointerenter', ustune, { passive: true });
  }

  // ---- Tıklamalar ve basış iptali ----
  const basislar = new Map(); // pointerId → { an, oge, hedef_mi }
  dinle(document, 'pointerdown', (olay) => {
    if (!olay.isPrimary || olay.button !== 0) return;
    basislar.set(olay.pointerId, {
      an: olay.timeStamp,
      oge: oge_kimligi(olay.target),
      hedef_mi: hedef_buton.contains(olay.target),
    });
  });
  dinle(document, 'pointerup', (olay) => {
    const basis = basislar.get(olay.pointerId);
    if (!basis) return;
    basislar.delete(olay.pointerId);
    const hedef_mi = basis.hedef_mi && hedef_buton.contains(olay.target);
    kaydedici.ekle('tiklama', olay.timeStamp, {
      x: olay.clientX,
      y: olay.clientY,
      hedef_oge: oge_kimligi(olay.target),
      giris: giris_turu(olay.pointerType),
      ek: {
        hedef_buton_mu: hedef_mi,
        basili_tutma_ms: yuvarla(olay.timeStamp - basis.an),
        basis_ogesi: basis.oge,
        kaydirma_y: piksel(window.scrollY),
      },
    });
  });
  dinle(document, 'pointercancel', (olay) => {
    const basis = basislar.get(olay.pointerId);
    if (!basis) return;
    basislar.delete(olay.pointerId);
    kaydedici.ekle('basis_iptal', olay.timeStamp, {
      x: olay.clientX, y: olay.clientY, hedef_oge: basis.oge, giris: giris_turu(olay.pointerType),
      ek: { basili_tutma_ms: yuvarla(olay.timeStamp - basis.an) },
    });
  });

  // ---- Fare izi (en çok 50 ms'de bir) ----
  let son_fare = -Infinity;
  dinle(document, 'pointermove', (olay) => {
    if (olay.pointerType !== 'mouse' && olay.pointerType !== 'pen') return;
    if (olay.timeStamp - son_fare < olcum.fare_ornek_araligi_ms) return;
    son_fare = olay.timeStamp;
    kaydedici.iz_ekle('fare', olay.timeStamp, olay.clientX, olay.clientY);
  });

  // ---- Kaydırma izi (en çok 100 ms'de bir; son konum gecikmeli yazılır) ----
  // Örnek: [zaman_ms, scrollX, scrollY]
  let son_kaydirma = -Infinity;
  let bekleyen = null;
  const kaydirma_yaz = (an) => {
    son_kaydirma = an;
    kaydedici.iz_ekle('kaydirma', an, window.scrollX, window.scrollY);
  };
  dinle(window, 'scroll', (olay) => {
    const an = olay.timeStamp;
    if (an - son_kaydirma >= olcum.kaydirma_ornek_araligi_ms) {
      clearTimeout(bekleyen);
      bekleyen = null;
      kaydirma_yaz(an);
    } else if (!bekleyen) {
      bekleyen = setTimeout(() => { bekleyen = null; kaydirma_yaz(performance.now()); },
        olcum.kaydirma_ornek_araligi_ms - (an - son_kaydirma));
    }
  });
  temizlikler.push(() => clearTimeout(bekleyen));

  return {
    buton,
    kaldir: () => temizlikler.splice(0).forEach((t) => t()),
  };
}

/**
 * Deneme boyunca (Başla'dan sonuca kadar) pencere olaylarını dinler:
 * sekme değişikliği, yön ve boyut değişikliği.
 * @returns {() => void} dinleyicileri kaldırır
 */
export function pencereyi_dinle(kaydedici) {
  const temizlikler = [];
  const dinle = (hedef, tur, f) => {
    hedef.addEventListener(tur, f, { passive: true });
    temizlikler.push(() => hedef.removeEventListener(tur, f, { passive: true }));
  };

  dinle(document, 'visibilitychange', (olay) => {
    kaydedici.ekle('sekme_degisti', olay.timeStamp, {
      ek: { durum: document.visibilityState === 'hidden' ? 'gizlendi' : 'geri_dondu' },
    });
  });

  const yon = () => (window.screen?.orientation?.type
    ?? (window.innerWidth > window.innerHeight ? 'landscape' : 'portrait'));
  let son_yon = yon();
  const yon_denetle = (an) => {
    const yeni = yon();
    if (yeni === son_yon) return;
    kaydedici.ekle('yon_degisti', an, { ek: { onceki: son_yon, yeni } });
    son_yon = yeni;
  };
  if (window.screen?.orientation) dinle(window.screen.orientation, 'change', (o) => yon_denetle(o.timeStamp));
  else dinle(window, 'orientationchange', (o) => yon_denetle(o.timeStamp));

  // Boyut değişikliği: en çok 100 ms'de bir
  let son_boyut = -Infinity;
  dinle(window, 'resize', (olay) => {
    if (olay.timeStamp - son_boyut < 100) return;
    son_boyut = olay.timeStamp;
    kaydedici.ekle('boyut_degisti', olay.timeStamp, {
      ek: { genislik: window.innerWidth, yukseklik: window.innerHeight },
    });
    yon_denetle(olay.timeStamp);
  });

  return () => temizlikler.splice(0).forEach((t) => t());
}
