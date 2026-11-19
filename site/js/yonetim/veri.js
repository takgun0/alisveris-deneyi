// Yönetim paneli verisi — SAF modül (DOM ve ağ kullanmaz; Node'da test edilir).
//
// Panelin tek veri kaynağı genis_tablo görünümüdür (deneme başına bir satır,
// katılımcı bilgisi her satırda). Katılımcı listesi bu satırlardan türetilir.

// Anketteki yaş seçenekleriyle aynı (site/js/anket.js).
export const YAS_GRUPLARI = ['18-20', '21-30', '31-40', '41-50', '51+'];

/** Veritabanı değerlerinin Türkçe görünen adları. */
export const ETIKETLER = {
  cihaz: { masaustu: 'Masaüstü', mobil: 'Mobil' },
  cinsiyet: { kadin: 'Kadın', erkek: 'Erkek', belirtmek_istemiyorum: 'Belirtmek istemiyor' },
  alisveris_sikligi: {
    yilda_birkac_kez: 'Yılda birkaç kez',
    ayda_bir: 'Ayda bir',
    ayda_birkac_kez: 'Ayda birkaç kez',
    haftada_bir_veya_daha_sik: 'Haftada bir veya daha sık',
  },
  renk_ayirt_zorlugu: { evet: 'Evet', hayir: 'Hayır', emin_degilim: 'Emin değil' },
  durum: { devam_ediyor: 'Devam ediyor', tamamladi: 'Tamamladı', birakti: 'Bıraktı' },
  sonuc: { basarili: 'Başarılı', vazgecildi: 'Vazgeçildi', zaman_asimi: 'Süre doldu', kesildi: 'Kesildi' },
  haric_nedeni: {
    asiri_uzun_sure: 'Aşırı uzun süre',
    sekme_degistirme: 'Sekme değiştirme',
    teknik_hata: 'Teknik hata',
    katilimci_talebi: 'Katılımcı talebi',
    diger: 'Diğer',
  },
  konum: { K1: 'K1 (ürün bilgisinin altı)', K2: 'K2 (yan panel / alt çubuk)' },
  renk: { R1: 'R1 (düşük kontrast)', R2: 'R2 (turuncu)', R3: 'R3 (turuncu + vurgular)' },
};

export const etiket = (alan, deger) => ETIKETLER[alan]?.[deger] ?? (deger ?? '—');

export const BOS_FILTRE = Object.freeze({
  cihaz: '', yas_grubu: '', cinsiyet: '', alisveris_sikligi: '', baslangic: '', bitis: '', haric_goster: true,
});

/**
 * Süzgeç uygular. Tarih aralığı katılımcının başlangıç zamanına göredir
 * (baslangic ve bitis 'YYYY-AA-GG', bitiş günü dahil, yerel saat).
 */
export function filtrele(satirlar, f) {
  const bas = f.baslangic ? new Date(`${f.baslangic}T00:00:00`).getTime() : null;
  const bit = f.bitis ? new Date(`${f.bitis}T23:59:59.999`).getTime() : null;
  return satirlar.filter((s) => {
    if (f.cihaz && s.cihaz !== f.cihaz) return false;
    if (f.yas_grubu && s.yas_grubu !== f.yas_grubu) return false;
    if (f.cinsiyet && s.cinsiyet !== f.cinsiyet) return false;
    if (f.alisveris_sikligi && s.alisveris_sikligi !== f.alisveris_sikligi) return false;
    const t = Date.parse(s.baslangic_zamani);
    if (bas !== null && t < bas) return false;
    if (bit !== null && t > bit) return false;
    if (!f.haric_goster && s.haric_tutuldu) return false;
    return true;
  });
}

/** genis_tablo satırlarından katılımcı listesi (katılımcı başına bir kayıt). */
export function katilimcilar(satirlar) {
  const m = new Map();
  for (const s of satirlar) {
    if (!m.has(s.katilimci_id)) {
      m.set(s.katilimci_id, {
        katilimci_id: s.katilimci_id, katilimci_kodu: s.katilimci_kodu, cihaz: s.cihaz, tablet_mi: s.tablet_mi,
        yas_grubu: s.yas_grubu, cinsiyet: s.cinsiyet, alisveris_sikligi: s.alisveris_sikligi,
        renk_ayirt_zorlugu: s.renk_ayirt_zorlugu, cihaz_uyusmazligi: s.cihaz_uyusmazligi, sira_no: s.sira_no,
        sira_cakismasi: s.sira_cakismasi, durum: s.durum, baslangic_zamani: s.baslangic_zamani,
        bitis_zamani: s.bitis_zamani, son_etkinlik_zamani: s.son_etkinlik_zamani, haric_tutuldu: s.katilimci_haric_tutuldu, haric_nedeni: s.katilimci_haric_nedeni,
        deneme_sayisi: 0,
      });
    }
    if (s.deneme_no > 0 && s.sonuc) m.get(s.katilimci_id).deneme_sayisi += 1;
  }
  return [...m.values()];
}

/**
 * Williams bloklarının durumu (bir cihaz için). Veritabanındaki atama
 * kuralının aynısı: tamamlayan veya son 30 dakikada etkin olan, hariç
 * tutulmamış ve sıra çakışması olmayan katılımcı numarasını tutar.
 * Blok, 6 numaranın 6'sı da tamamlamış katılımcılarca tutuluyorsa tamamdır.
 * @param {object[]} kisiler katilimcilar() çıktısı
 */
export function blok_durumu(kisiler, cihaz, { simdi = Date.now(), bosalma_dakika = 30 } = {}) {
  const tamamlanan = new Set();
  const tutulan = new Set();
  for (const k of kisiler) {
    if (k.cihaz !== cihaz || k.haric_tutuldu || k.sira_cakismasi || k.sira_no === null) continue;
    if (k.durum === 'tamamladi') {
      tamamlanan.add(k.sira_no);
      tutulan.add(k.sira_no);
    } else if (k.durum === 'devam_ediyor') {
      const t = Date.parse(k.son_etkinlik_zamani ?? k.baslangic_zamani);
      if (simdi - t <= bosalma_dakika * 60000) tutulan.add(k.sira_no);
    }
  }
  let blok = 0;
  while ([0, 1, 2, 3, 4, 5].every((i) => tamamlanan.has(blok * 6 + i))) blok++;
  const numaralar = [0, 1, 2, 3, 4, 5].map((i) => blok * 6 + i);
  return {
    tamamlanan_blok: blok,
    gecerli_blok: blok,
    bos_numaralar: numaralar.filter((n) => !tutulan.has(n)),
    suren_numaralar: numaralar.filter((n) => tutulan.has(n) && !tamamlanan.has(n)),
  };
}

/** Sayıya göre sayım: { deger: adet } */
export function say(dizi, alan) {
  const m = {};
  for (const x of dizi) m[x[alan]] = (m[x[alan]] ?? 0) + 1;
  return m;
}

/** Özet kartlarının sayıları. */
export function ozet_sayilari(satirlar, kisiler) {
  const deneme = satirlar.filter((s) => s.deneme_no > 0 && s.sonuc);
  return {
    katilimci: kisiler.length,
    tamamlayan: kisiler.filter((k) => k.durum === 'tamamladi').length,
    devam_eden: kisiler.filter((k) => k.durum === 'devam_ediyor').length,
    birakan: kisiler.filter((k) => k.durum === 'birakti').length,
    cihaz: say(kisiler, 'cihaz'),
    yas_grubu: say(kisiler, 'yas_grubu'),
    tablet: kisiler.filter((k) => k.tablet_mi).length,
    cihaz_uyusmazligi: kisiler.filter((k) => k.cihaz_uyusmazligi).length,
    hariç_katilimci: kisiler.filter((k) => k.haric_tutuldu).length,
    deneme: deneme.length,
    gecerli_deneme: deneme.filter((s) => s.sonuc === 'basarili' && !s.haric_tutuldu).length,
    haric_deneme: deneme.filter((s) => s.haric_tutuldu).length,
    sonuc: say(deneme, 'sonuc'),
  };
}

/** Verinin değişip değişmediğini anlamak için kısa imza (yeniden çizimi azaltır). */
export function veri_imzasi(satirlar, tercihler, islemler) {
  let en_son = '';
  let haric = 0;
  for (const s of satirlar) {
    if (s.kayit_zamani && s.kayit_zamani > en_son) en_son = s.kayit_zamani;
    if (s.haric_tutuldu) haric++;
  }
  return `${satirlar.length}|${en_son}|${haric}|${tercihler.length}|${islemler.length}|${satirlar.filter((s) => s.durum === 'tamamladi').length}`;
}

/** Süreyi okunur biçime çevirir: 1234.5 → "1.235 ms" / "1,23 sn" */
export function sure_yaz(ms, { birim = 'ms' } = {}) {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return '—';
  if (birim === 'sn') return `${(ms / 1000).toLocaleString('tr-TR', { maximumFractionDigits: 2 })} sn`;
  return `${Math.round(ms).toLocaleString('tr-TR')} ms`;
}

/** "3 dk önce" gibi göreli zaman. */
export function gecen_sure(onceki_ms, simdi = Date.now()) {
  if (!onceki_ms) return 'hiç';
  const s = Math.max(0, Math.round((simdi - onceki_ms) / 1000));
  if (s < 60) return `${s} sn önce`;
  if (s < 3600) return `${Math.floor(s / 60)} dk önce`;
  if (s < 86400) return `${Math.floor(s / 3600)} sa önce`;
  return `${Math.floor(s / 86400)} gün önce`;
}
