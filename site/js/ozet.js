// Deneme özeti — SAF modül (DOM ve ağ kullanmaz).
//
// Aynı modül üç yerde çalışır:
//   1. deneme sonunda tarayıcıda (site/js/deneme.js),
//   2. yönetim panelindeki "özetleri ham olaylardan yeniden hesapla" işleminde,
//   3. Node'daki birim testlerinde (testler/birim/ozet.test.mjs).
//
// Girdi: bir denemenin olayları ve izleri. Çıktı: deneme_ozetleri satırı.
// Bütün zamanlar milisaniyedir ve "deneme başından" (görev ekranının sıfır
// noktasından) ölçülür; yani olayların zaman_ms alanıdır.
//
// TANIMLAR (veri sözlüğüyle aynı):
//   tiklama_suresi_ms       ürün sayfasının sıfır noktası → Sepete Ekle'deki pointerup
//   basili_tutma_suresi_ms  Sepete Ekle'de pointerdown → pointerup
//   gorev_suresi_ms         "Başla" tıklaması → Sepete Ekle'deki pointerup
//   buton_gorunme_suresi_ms ürün sayfası sıfır noktası → buton_gorundu (0'ın altına inmez)
//   buton_bulma_suresi_ms   (yalnızca masaüstü) sıfır noktası → buton_hover_ilk
//   *_net_ms                aynı süre, aradaki duraklatma (uyarı) süresi çıkarılmış
//   hatali_tiklama_sayisi   ürün sayfasında hedef buton dışındaki etkileşimli öğelere
//                           (üst çubuk, favori, adet seçici) yapılan tıklamalar
//   bos_tiklama_sayisi      ürün sayfasında boş alana veya metne yapılan tıklamalar
//   toplam_kaydirma_px      ürün sayfasında art arda scrollY farklarının mutlak toplamı
//   sekme_disi_sure_ms      deneme boyunca başka sekmede geçen toplam süre
//   duraklatma_suresi_ms    yatay tutma / dar pencere uyarısı açık kalma süresi

export const OZET_SURUMU = '1';

/** Hatalı tıklama sayılan etkileşimli öğeler (data-oge kimlikleri). */
export const HATALI_OGELER = Object.freeze([
  'menu-butonu', 'magaza-logosu', 'arama-kutusu', 'sepet-simgesi',
  'favori-butonu', 'adet-secici', 'adet-azalt', 'adet-artir', 'adet-degeri',
]);

/** Ne hatalı ne boş sayılan, görevin akışına ait öğeler. */
export const AKIS_OGELERI = Object.freeze([
  'hedef-buton', 'vazgec-butonu', 'vazgec-onayla', 'vazgec-iptal', 'vazgec-penceresi',
]);

const yuvarla = (v) => (v === null || v === undefined ? null : Math.round(v * 1000) / 1000);
const sifirdan_kucuk_olmasin = (v) => (v === null ? null : Math.max(0, v));

/**
 * Duraklatma aralıklarını çıkarır: [[baslangic, bitis], ...]
 * Kapanmamış duraklama, verilen son ana kadar sürmüş sayılır.
 */
export function duraklatma_araliklari(olaylar, son_an) {
  const araliklar = [];
  let acik = null;
  for (const o of olaylar) {
    if (o.olay_turu === 'duraklatildi' && acik === null) acik = o.zaman_ms;
    else if (o.olay_turu === 'devam_edildi' && acik !== null) {
      araliklar.push([acik, o.zaman_ms]);
      acik = null;
    }
  }
  if (acik !== null) araliklar.push([acik, Math.max(acik, son_an)]);
  return araliklar;
}

/** Sekme dışında geçen aralıklar (gizlendi → geri_dondu). */
export function sekme_araliklari(olaylar, son_an) {
  const araliklar = [];
  let acik = null;
  for (const o of olaylar) {
    if (o.olay_turu !== 'sekme_degisti') continue;
    const durum = o.ek?.durum;
    if (durum === 'gizlendi' && acik === null) acik = o.zaman_ms;
    else if (durum === 'geri_dondu' && acik !== null) {
      araliklar.push([acik, o.zaman_ms]);
      acik = null;
    }
  }
  if (acik !== null) araliklar.push([acik, Math.max(acik, son_an)]);
  return araliklar;
}

/** [a, b] aralığının duraklatma aralıklarıyla kesişen toplam süresi. */
export function kesisim(araliklar, a, b) {
  let toplam = 0;
  for (const [s, e] of araliklar) {
    const bas = Math.max(a, s);
    const bit = Math.min(b, e);
    if (bit > bas) toplam += bit - bas;
  }
  return toplam;
}

const toplam_sure = (araliklar) => araliklar.reduce((t, [s, e]) => t + (e - s), 0);

/**
 * @param {object} p
 * @param {object[]} p.olaylar  { olay_turu, sayfa, zaman_ms, hedef_oge, ek, ... } (sıralı olmak zorunda değil)
 * @param {object[]} [p.izler]  { sayfa, iz_turu, ornekler: [[zaman_ms, x, y], ...] }
 * @param {'masaustu'|'mobil'} p.cihaz
 * @param {string} p.sonuc       'basarili' | 'vazgecildi' | 'zaman_asimi' | 'kesildi'
 * @param {number|null} [p.zorluk_puani]
 * @returns {object} deneme_ozetleri alanları
 */
export function ozet_hesapla({ olaylar, izler = [], cihaz, sonuc, zorluk_puani = null }) {
  const sirali = [...olaylar].sort((a, b) => a.zaman_ms - b.zaman_ms);
  const ilk = (kosul) => sirali.find(kosul) ?? null;
  const son_an = sirali.length ? sirali[sirali.length - 1].zaman_ms : 0;

  const urun_acilis = ilk((o) => o.olay_turu === 'sayfa_goruntulendi' && o.sayfa === 'urun');
  const basla = ilk((o) => o.olay_turu === 'tiklama' && o.sayfa === 'gorev' && o.hedef_oge === 'basla-butonu');
  const hedef = sonuc === 'basarili'
    ? ilk((o) => o.olay_turu === 'tiklama' && o.sayfa === 'urun' && o.ek?.hedef_buton_mu === true)
    : null;
  const gorundu = ilk((o) => o.olay_turu === 'buton_gorundu');
  const hover = cihaz === 'masaustu' ? ilk((o) => o.olay_turu === 'buton_hover_ilk') : null;

  const duraklar = duraklatma_araliklari(sirali, son_an);
  const sekmeler = sekme_araliklari(sirali, son_an);

  // Brüt ve net (duraklatma çıkarılmış) süre çifti.
  const sure = (bas, bit) => {
    if (bas === null || bit === null) return [null, null];
    const brut = bit - bas;
    return [brut, brut - kesisim(duraklar, bas, bit)];
  };

  const sifir = urun_acilis?.zaman_ms ?? null;
  const [tiklama, tiklama_net] = sure(sifir, hedef?.zaman_ms ?? null);
  const [gorev, gorev_net] = sure(basla?.zaman_ms ?? null, hedef?.zaman_ms ?? null);
  const [gorunme, gorunme_net] = sure(sifir, gorundu?.zaman_ms ?? null);
  const [bulma, bulma_net] = sure(sifir, hover?.zaman_ms ?? null);

  // Ürün sayfasındaki tıklamalar
  let hatali = 0;
  let bos = 0;
  for (const o of sirali) {
    if (o.olay_turu !== 'tiklama' || o.sayfa !== 'urun') continue;
    if (o.ek?.hedef_buton_mu) continue;
    const oge = o.hedef_oge ?? 'bos-alan';
    if (HATALI_OGELER.includes(oge)) hatali += 1;
    else if (!AKIS_OGELERI.includes(oge)) bos += 1;
  }

  // Ürün sayfasında kaydırma: sayfa 0'dan başlar.
  let kaydirma = 0;
  const kaydirma_izi = izler.find((i) => i.sayfa === 'urun' && i.iz_turu === 'kaydirma');
  if (kaydirma_izi) {
    let onceki = 0;
    const ornekler = [...kaydirma_izi.ornekler].sort((a, b) => a[0] - b[0]);
    for (const [, , y] of ornekler) {
      if (typeof y !== 'number') continue;
      kaydirma += Math.abs(y - onceki);
      onceki = y;
    }
  }

  return {
    tiklama_suresi_ms: yuvarla(tiklama),
    tiklama_suresi_net_ms: yuvarla(tiklama_net),
    basili_tutma_suresi_ms: yuvarla(hedef?.ek?.basili_tutma_ms ?? null),
    gorev_suresi_ms: yuvarla(gorev),
    gorev_suresi_net_ms: yuvarla(gorev_net),
    buton_gorunme_suresi_ms: yuvarla(sifirdan_kucuk_olmasin(gorunme)),
    buton_gorunme_suresi_net_ms: yuvarla(sifirdan_kucuk_olmasin(gorunme_net)),
    buton_bulma_suresi_ms: yuvarla(sifirdan_kucuk_olmasin(bulma)),
    buton_bulma_suresi_net_ms: yuvarla(sifirdan_kucuk_olmasin(bulma_net)),
    hatali_tiklama_sayisi: hatali,
    bos_tiklama_sayisi: bos,
    toplam_kaydirma_px: yuvarla(kaydirma),
    sekme_degisti: sirali.some((o) => o.olay_turu === 'sekme_degisti'),
    sekme_disi_sure_ms: yuvarla(toplam_sure(sekmeler)),
    duraklatildi: duraklar.length > 0,
    duraklatma_suresi_ms: yuvarla(toplam_sure(duraklar)),
    sonuc,
    zorluk_puani,
    ozet_surumu: OZET_SURUMU,
  };
}
