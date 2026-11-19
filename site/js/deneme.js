// Bir denemeyi baştan sona yürütür:
//   görev ekranı → ürün sayfası → (eklendi → zorluk) | (vazgeçildi) | (süre doldu)
//
// Zaman sınırı: 60 sn, "Başla" tıklamasından başlar; uyarı (yatay tutma /
// dar pencere) açıkken durur. Sekme değişikliği sayacı durdurmaz.
//
// ÖLÇÜM KURALLARI
//  - Bütün zamanlar performance.now() tabanındadır; olaylarda event.timeStamp.
//  - zaman_ms = görev ekranının sıfır noktasından geçen süre.
//  - Deneme sürerken ağ isteği atılmaz: bu modül api.js'i hiç çağırmaz.
//    Paket deneme bittikten sonra döndürülür ve kuyruğa yazılır.
//  - Ölçüm verisi ürün sayfası bitince localStorage'a yazılır ("olcum" kaydı);
//    zorluk sorusunda sayfa yenilenirse paket bu kayıttan kurulur.
//    Sayfa ürün sayfasındayken kapanırsa (pagehide) yarım kayıt yazılır;
//    yeniden açılışta deneme bu olaylarla 'kesildi' olarak gönderilir.

import { ekrani_goster, isaretci_tiklamasi } from './ekran.js';
import { DenemeSayaci } from './sayac.js';
import {
  gorev_goster, eklendi_goster, zorluk_goster, sure_doldu_goster, vazgec_onayi_sor,
} from './ekranlar/deneme_ekranlari.js';
import { magaza_sayfasi_olustur } from './magaza/sablon.js';
import { OlayKaydedici, urun_sayfasini_dinle, pencereyi_dinle, giris_turu } from './olcum.js';
import { ozet_hesapla } from './ozet.js';
import { olcum_basladi, olcum_bitti } from './kuyruk.js';

// ---------------------------------------------------------------------
// Ölçüm kaydının localStorage'da saklanması
// ---------------------------------------------------------------------
const olcum_anahtari = (demo) => (demo ? 'sepete_ekle_demo_olcum_v1' : 'sepete_ekle_olcum_v1');

/**
 * Ölçüm kaydını yazar. Kota dolarsa izler atılır ve iz_eksik işaretlenir;
 * yine sığmazsa false döner.
 */
export function olcum_sakla(demo, kayit) {
  try {
    localStorage.setItem(olcum_anahtari(demo), JSON.stringify(kayit));
    return true;
  } catch {
    try {
      localStorage.setItem(olcum_anahtari(demo), JSON.stringify({ ...kayit, izler: [], iz_eksik: true }));
      return true;
    } catch {
      return false;
    }
  }
}

/** Verilen denemenin ölçüm kaydını okur (başka denemeye aitse null). */
export function olcum_oku(demo, deneme_no) {
  try {
    const kayit = JSON.parse(localStorage.getItem(olcum_anahtari(demo)) ?? 'null');
    return kayit?.deneme_no === deneme_no ? kayit : null;
  } catch {
    return null;
  }
}

export function olcum_sil(demo) {
  try { localStorage.removeItem(olcum_anahtari(demo)); } catch { /* yok say */ }
}

// ---------------------------------------------------------------------
// Deneme
// ---------------------------------------------------------------------

/**
 * @param {object} p
 * @param {HTMLElement} p.sahne
 * @param {object} p.deney          deney.json
 * @param {object} p.plan_satiri    { deneme_no, kosul_kodu, konum, renk, urun_kodu, ... }
 * @param {'masaustu'|'mobil'} p.cihaz
 * @param {import('./uyari.js').UyariYoneticisi} p.uyari
 * @param {(adim: string, sonuc?: string) => void} p.adim_kaydet  ilerlemeyi localStorage'a yazar
 * @param {boolean} p.demo
 * @param {'gorev'|'zorluk'} [p.baslangic_adimi='gorev'] yenilemeden sonra zorluktan devam için
 * @param {(olay: object) => void} [p.gozlemci]  demo modunda canlı sayaç için (isteğe bağlı)
 * @returns {Promise<{sonuc: string, zorluk_puani: number|null, paket: object}>}
 */
export async function denemeyi_yurut({
  sahne, deney, icerik, plan_satiri, cihaz, uyari, adim_kaydet, demo,
  baslangic_adimi = 'gorev', gozlemci = null,
}) {
  const urun = urun_bul(deney, plan_satiri.urun_kodu);
  const deneme_no = plan_satiri.deneme_no;

  // Yenilemeden sonra yalnızca zorluk sorusu kalmışsa doğrudan ona geç.
  if (baslangic_adimi === 'zorluk') {
    const { puan } = await zorluk_goster(sahne);
    const kayit = olcum_oku(demo, deneme_no);
    const paket = kayit
      ? deneme_paketi({ deneme_no, cihaz, sonuc: 'basarili', zorluk_puani: puan, kayit })
      : deneme_paketi({ deneme_no, cihaz, sonuc: 'basarili', zorluk_puani: puan, kayit: null });
    return { sonuc: 'basarili', zorluk_puani: puan, paket };
  }

  // ---- 1. Görev ekranı ----
  const alistirma_mi = deneme_no === 0;
  let kaydedici = null;
  const { basla_olayi, basis_olayi } = await gorev_goster(sahne, {
    urun_adi: urun.ad,
    deneme_no,
    toplam: 6,
    alistirma_mi,
    sifir_alindi: (sifir) => {
      kaydedici = new OlayKaydedici({ sifir, olcum: deney.olcum });
      kaydedici.sayfa_degisti('gorev', sifir);
    },
  });
  kaydedici.ekle('tiklama', basla_olayi.timeStamp, {
    x: basla_olayi.clientX,
    y: basla_olayi.clientY,
    hedef_oge: 'basla-butonu',
    giris: giris_turu(basla_olayi.pointerType),
    ek: { hedef_buton_mu: false, basili_tutma_ms: Math.round((basla_olayi.timeStamp - basis_olayi.timeStamp) * 1000) / 1000 },
  });

  // Deneme başladı: ağ kapısı kapanır (süren gönderim iptal edilir) ve
  // bundan sonra sayfa yenilenirse deneme 'kesildi' sayılır.
  olcum_basladi();
  adim_kaydet('urun');

  const sayac = new DenemeSayaci(deney.olcum.deneme_sure_siniri_ms);
  sayac.baslat(basla_olayi.timeStamp);
  const pencere_kaldir = pencereyi_dinle(kaydedici);
  if (uyari.acik_mi) {
    sayac.duraklat(basla_olayi.timeStamp);
    kaydedici.ekle('duraklatildi', basla_olayi.timeStamp, { ek: { uyari: uyari.acik_uyari ?? null } });
  }
  gozlemci?.({ tur: 'basladi', sayac });

  // Sayfa ürün sayfasındayken kapanırsa yarım kayıt yazılır (ağ isteği yok).
  let urun_bilgisi = { ekran: ekran_bilgisi(), buton: null };
  const yarim_yaz = () => {
    olcum_sakla(demo, { deneme_no, durum: 'yarim', ...urun_bilgisi, ...kaydedici.disari_aktar() });
  };
  const gizlenince = () => { if (document.visibilityState === 'hidden') yarim_yaz(); };
  window.addEventListener('pagehide', yarim_yaz);
  document.addEventListener('visibilitychange', gizlenince);

  // ---- 2. Ürün sayfası ----
  const sayfa = magaza_sayfasi_olustur({
    cihaz, kosul: plan_satiri, urun, icerik: icerik[urun.kod], renkler: deney.renkler,
  });
  const urun_sifiri = await ekrani_goster(sahne, sayfa.dugum);
  kaydedici.sayfa_degisti('urun', urun_sifiri);
  const dinleyici = urun_sayfasini_dinle({ kaydedici, hedef_buton: sayfa.hedef_buton, cihaz, urun_sifiri });
  urun_bilgisi = { ekran: ekran_bilgisi(), buton: dinleyici.buton };

  const { sonuc, an } = await new Promise((coz) => {
    let bitti = false;
    let zamanlayici = null;
    const temizlikler = [];

    const bitir = (deger, bitis_ani) => {
      if (bitti) return;
      bitti = true;
      clearTimeout(zamanlayici);
      temizlikler.forEach((t) => t());
      coz({ sonuc: deger, an: bitis_ani });
    };

    // Zaman sınırı: kalan süre kadar bekle; uyarı açıkken zamanlayıcı kurulmaz.
    const zamanlayici_kur = () => {
      clearTimeout(zamanlayici);
      if (sayac.durakli_mi) return;
      zamanlayici = setTimeout(() => {
        const simdi = performance.now();
        if (sayac.doldu_mu(simdi)) {
          document.querySelector('.onay-ortusu')?.remove(); // açık Vazgeç penceresi kapanır
          bitir('zaman_asimi', simdi);
        } else {
          zamanlayici_kur();
        }
      }, sayac.kalan(performance.now()) + 5);
    };

    temizlikler.push(uyari.dinle((olay) => {
      if (olay.tur === 'acildi') {
        sayac.duraklat(olay.zaman);
        clearTimeout(zamanlayici);
        kaydedici.ekle('duraklatildi', olay.zaman, { ek: { uyari: olay.uyari } });
      } else {
        sayac.devam(olay.zaman);
        kaydedici.ekle('devam_edildi', olay.zaman, { ek: { uyari: olay.uyari } });
        zamanlayici_kur();
      }
      gozlemci?.({ tur: olay.tur === 'acildi' ? 'duraklatildi' : 'devam_edildi', sayac });
    }));
    zamanlayici_kur();

    // Sepete Ekle: pointerdown ve pointerup ikisi de butonun üzerinde olmalı.
    temizlikler.push(isaretci_tiklamasi(sayfa.hedef_buton, (olay) => bitir('basarili', olay.timeStamp)));

    // Vazgeç: onay istenir; onaylanırsa deneme 'vazgecildi'.
    let onay_acik = false;
    temizlikler.push(isaretci_tiklamasi(sayfa.vazgec_butonu, async () => {
      if (onay_acik) return;
      onay_acik = true;
      const { onaylandi, olay } = await vazgec_onayi_sor();
      onay_acik = false;
      if (onaylandi) bitir('vazgecildi', olay.timeStamp);
    }));
  });

  // ---- Ölçüm bitti ----
  const bitis_olayi = { basarili: 'gorev_tamamlandi', vazgecildi: 'vazgecildi', zaman_asimi: 'zaman_asimi' }[sonuc];
  kaydedici.ekle(bitis_olayi, an, { hedef_oge: sonuc === 'basarili' ? 'hedef-buton' : null });
  if (uyari.acik_mi) kaydedici.ekle('devam_edildi', an, { ek: { uyari: 'deneme_bitti' } });
  dinleyici.kaldir();
  pencere_kaldir();
  window.removeEventListener('pagehide', yarim_yaz);
  document.removeEventListener('visibilitychange', gizlenince);
  gozlemci?.({ tur: 'bitti', sonuc, sure_ms: an - urun_sifiri });

  const kayit = { deneme_no, durum: 'tamam', sonuc, ...urun_bilgisi, ...kaydedici.disari_aktar() };
  olcum_sakla(demo, kayit);
  olcum_bitti(); // ölçüm bitti: ağ kapısı açılır

  // ---- 3. Sonraki ekranlar ----
  if (sonuc === 'basarili') {
    adim_kaydet('eklendi', 'basarili');
    await eklendi_goster(sahne);
    adim_kaydet('zorluk', 'basarili');
    const { puan } = await zorluk_goster(sahne);
    return { sonuc, zorluk_puani: puan, paket: deneme_paketi({ deneme_no, cihaz, sonuc, zorluk_puani: puan, kayit }) };
  }
  if (sonuc === 'zaman_asimi') {
    await sure_doldu_goster(sahne);
  }
  return { sonuc, zorluk_puani: null, paket: deneme_paketi({ deneme_no, cihaz, sonuc, zorluk_puani: null, kayit }) };
}

export function urun_bul(deney, urun_kodu) {
  const urun = [...deney.urunler, deney.alistirma_urunu].find((u) => u.kod === urun_kodu);
  if (!urun) throw new Error(`Bilinmeyen ürün: ${urun_kodu}`);
  return urun;
}

/** Deneme başına kaydedilen ekran ve tarayıcı bilgisi. */
export function ekran_bilgisi() {
  return {
    ekran_genislik: window.screen.width,
    ekran_yukseklik: window.screen.height,
    pencere_genislik: window.innerWidth,
    pencere_yukseklik: window.innerHeight,
    cihaz_piksel_orani: window.devicePixelRatio,
    tarayici_bilgisi: navigator.userAgent.slice(0, 400),
  };
}

const BOS_BUTON = {
  buton_ilk_gorunur: null, buton_x: null, buton_y: null, buton_genislik: null, buton_yukseklik: null,
};

/**
 * Veritabanına gönderilecek deneme paketi. Özet, olaylardan ozet.js ile hesaplanır.
 * @param {object} p
 * @param {object|null} p.kayit  ölçüm kaydı ({olaylar, izler, iz_eksik, ekran, buton}); yoksa boş paket
 */
export function deneme_paketi({ deneme_no, cihaz, sonuc, zorluk_puani, kayit }) {
  const olaylar = kayit?.olaylar ?? [];
  const izler = kayit?.izler ?? [];
  return {
    deneme_no,
    sonuc,
    zorluk_puani,
    iz_eksik: kayit ? Boolean(kayit.iz_eksik) : false,
    ...(kayit?.ekran ?? ekran_bilgisi()),
    ...(kayit?.buton ?? BOS_BUTON),
    ozet: ozet_hesapla({ olaylar, izler, cihaz, sonuc, zorluk_puani }),
    olaylar,
    izler,
  };
}

/** Yeniden açılışta yarıda kalmış denemenin 'kesildi' paketi (localStorage'daki yarım kayıttan). */
export function kesilen_deneme_paketi({ demo, deneme_no, cihaz }) {
  const kayit = olcum_oku(demo, deneme_no);
  // Ölçüm bitmiş ama sonraki denemeye geçilmeden kapanmışsa (vazgeçildi /
  // süre doldu ekranı) kayıttaki sonuç geçerlidir.
  const sonuc = kayit?.durum === 'tamam' && kayit.sonuc !== 'basarili' ? kayit.sonuc : 'kesildi';
  return deneme_paketi({ deneme_no, cihaz, sonuc, zorluk_puani: null, kayit });
}
