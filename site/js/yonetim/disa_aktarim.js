// Dışa aktarım — SAF modül (DOM ve ağ kullanmaz; Node'da test edilir).
//
// Her dosya bir "tablo" nesnesidir: { ad, basliklar: string[], satirlar: any[][] }.
// Bu tablo CSV'ye (UTF-8, BOM'lu) veya xlsx'e (xlsx.js) yazılır.
//
// GÜVENLİK (formül enjeksiyonu): '=', '+', '-', '@' (ve sekme / satır başı)
// ile başlayan METİN hücrelerinin başına tek tırnak eklenir. Sayılar
// (ör. -5) sayı olarak kalır.
//
// Her dosyada hariç tutma sütunları bulunur: haric_tutuldu, haric_nedeni.

const TEHLIKELI_BAS = /^[=+\-@\t\r]/;

/** Metin hücresini formül olarak yorumlanmayacak hâle getirir. */
export function hucre_guvenli(v) {
  if (typeof v === 'string' && TEHLIKELI_BAS.test(v)) return `'${v}`;
  return v;
}

/** Değeri dışa aktarım için düz değere çevirir (nesne/dizi → JSON metni). */
export function duz_deger(v) {
  if (v === null || v === undefined) return null;
  if (Array.isArray(v) || typeof v === 'object') return JSON.stringify(v);
  return v;
}

function csv_hucresi(v) {
  const d = hucre_guvenli(duz_deger(v));
  if (d === null) return '';
  if (typeof d === 'boolean') return d ? 'true' : 'false';
  const m = String(d);
  return /[",\r\n;]/.test(m) ? `"${m.replace(/"/g, '""')}"` : m;
}

/** CSV metni (BOM'lu, CRLF satır sonu, virgül ayraçlı, ondalık nokta). */
export function csv_olustur(tablo) {
  const satirlar = [tablo.basliklar, ...tablo.satirlar].map((s) => s.map(csv_hucresi).join(','));
  return `﻿${satirlar.join('\r\n')}\r\n`;
}

/** Nesne listesinden tablo: sütunlar verilen sırada. */
export function nesnelerden_tablo(ad, nesneler, sutunlar) {
  return { ad, basliklar: sutunlar, satirlar: nesneler.map((n) => sutunlar.map((s) => duz_deger(n[s]))) };
}

// ---------------------------------------------------------------------
// Dosya türleri
// ---------------------------------------------------------------------

export const KATILIMCI_SUTUNLARI = [
  'katilimci_kodu', 'cihaz', 'tablet_mi', 'yas_grubu', 'cinsiyet', 'alisveris_sikligi', 'alisveris_cihazi',
  'katilim_cihazi', 'renk_ayirt_zorlugu', 'cihaz_uyusmazligi', 'sira_no', 'dizi_no', 'urun_kaydirmasi', 'sira_cakismasi',
  'durum', 'baslangic_zamani', 'bitis_zamani', 'uygulama_surumu', 'haric_tutuldu', 'haric_nedeni',
];

export const DENEME_SUTUNLARI = [
  'deneme_id', 'katilimci_kodu', 'cihaz', 'tablet_mi', 'yas_grubu', 'cinsiyet', 'deneme_no', 'alistirma_mi',
  'kosul_kodu', 'konum', 'renk', 'urun_kodu', 'sonuc', 'zorluk_puani',
  'tiklama_suresi_ms', 'tiklama_suresi_net_ms', 'basili_tutma_suresi_ms', 'gorev_suresi_ms', 'gorev_suresi_net_ms',
  'buton_gorunme_suresi_ms', 'buton_gorunme_suresi_net_ms', 'buton_bulma_suresi_ms', 'buton_bulma_suresi_net_ms',
  'hatali_tiklama_sayisi', 'bos_tiklama_sayisi', 'toplam_kaydirma_px', 'sekme_degisti', 'sekme_disi_sure_ms',
  'duraklatildi', 'duraklatma_suresi_ms', 'buton_ilk_gorunur', 'buton_x', 'buton_y', 'buton_genislik', 'buton_yukseklik',
  'ekran_genislik', 'ekran_yukseklik', 'pencere_genislik', 'pencere_yukseklik', 'cihaz_piksel_orani', 'iz_eksik',
  'ozet_surumu', 'kayit_zamani', 'haric_tutuldu', 'haric_nedeni', 'deneme_haric_aciklama',
];

/** Anket (katılımcı başına bir satır). */
export function anket_tablosu(kisiler) {
  return nesnelerden_tablo('anket', kisiler, KATILIMCI_SUTUNLARI);
}

/** Deneme özetleri (deneme başına bir satır). */
export function deneme_tablosu(satirlar) {
  return nesnelerden_tablo('deneme_ozetleri', satirlar, DENEME_SUTUNLARI);
}

/** Tercihler; katılımcı kodu ve hariç tutma bilgisiyle. */
export function tercih_tablosu(tercihler, kisiler) {
  const kisi = new Map(kisiler.map((k) => [k.katilimci_id, k]));
  const satirlar = tercihler.filter((t) => kisi.has(t.katilimci_id)).map((t) => {
    const k = kisi.get(t.katilimci_id);
    return { ...t, katilimci_kodu: k.katilimci_kodu, cihaz: k.cihaz, haric_tutuldu: k.haric_tutuldu, haric_nedeni: k.haric_nedeni };
  });
  return nesnelerden_tablo('tercihler', satirlar,
    ['katilimci_kodu', 'cihaz', 'en_cok_kosul', 'en_az_kosul', 'neden', 'gosterim_sirasi', 'kayit_zamani', 'haric_tutuldu', 'haric_nedeni']);
}

/** İşlem kaydı (yalnızca hariç tutma sütunları boş kalır; tutarlılık için eklenir). */
export function islem_tablosu(islemler) {
  return nesnelerden_tablo('islem_kaydi', islemler.map((i) => ({ ...i, haric_tutuldu: null, haric_nedeni: null })),
    ['islem_id', 'zaman', 'yonetici_eposta', 'islem', 'neden', 'aciklama', 'kural', 'etkilenen', 'haric_tutuldu', 'haric_nedeni']);
}

/**
 * Geniş analiz tablosu: katılımcı başına bir satır; her koşul için sütun
 * grubu (ör. tiklama_suresi_ms_K1R1). Tekrarlı ölçümler analizi içindir.
 */
export function genis_analiz_tablosu(satirlar, kisiler, kosul_kodlari, olculer = ['tiklama_suresi_ms', 'gorev_suresi_ms']) {
  const deneme = new Map();
  for (const s of satirlar) if (s.deneme_no > 0) deneme.set(`${s.katilimci_id}|${s.kosul_kodu}`, s);
  const kosul_alanlari = ['deneme_no', 'urun_kodu', 'sonuc', ...olculer, 'zorluk_puani', 'haric_tutuldu', 'haric_nedeni'];
  const basliklar = [...KATILIMCI_SUTUNLARI, ...kosul_kodlari.flatMap((k) => kosul_alanlari.map((a) => `${a}_${k}`))];
  const tablo_satirlari = kisiler.map((k) => [
    ...KATILIMCI_SUTUNLARI.map((s) => duz_deger(k[s])),
    ...kosul_kodlari.flatMap((kod) => {
      const d = deneme.get(`${k.katilimci_id}|${kod}`);
      return kosul_alanlari.map((a) => (d ? duz_deger(d[a]) : null));
    }),
  ]);
  return { ad: 'genis_analiz', basliklar, satirlar: tablo_satirlari };
}

/**
 * Ham olaylar: olaylar ve izler (her örnek ayrı satıra açılmış) zamana göre
 * sıralı tek tabloda. "kaynak" sütunu 'olay' veya 'iz'dir.
 * @param {object[]} olaylar  olaylar tablosu satırları
 * @param {object[]} izler    izler tablosu satırları
 * @param {Map<number, object>} denemeler  deneme_id → genis_tablo satırı (kod, koşul, hariç bilgisi)
 */
export function ham_olay_tablosu(olaylar, izler, denemeler) {
  const satirlar = [];
  for (const o of olaylar) {
    const d = denemeler.get(Number(o.deneme_id));
    if (!d) continue;
    satirlar.push({
      kaynak: 'olay', olay_id: o.olay_id, katilimci_kodu: d.katilimci_kodu, cihaz: o.cihaz, deneme_no: o.deneme_no,
      kosul_kodu: o.kosul_kodu, urun_kodu: o.urun_kodu, sayfa: o.sayfa, olay_turu: o.olay_turu, zaman_ms: o.zaman_ms,
      x: o.x, y: o.y, hedef_oge: o.hedef_oge, giris_turu: o.giris_turu, ek: o.ek,
      haric_tutuldu: d.haric_tutuldu, haric_nedeni: d.haric_nedeni,
    });
  }
  for (const i of izler) {
    const d = denemeler.get(Number(i.deneme_id));
    if (!d) continue;
    for (const [t, x, y] of i.ornekler) {
      satirlar.push({
        kaynak: 'iz', olay_id: null, katilimci_kodu: d.katilimci_kodu, cihaz: d.cihaz, deneme_no: i.deneme_no,
        kosul_kodu: d.kosul_kodu, urun_kodu: d.urun_kodu, sayfa: i.sayfa, olay_turu: i.iz_turu, zaman_ms: t,
        x, y, hedef_oge: null, giris_turu: null, ek: null,
        haric_tutuldu: d.haric_tutuldu, haric_nedeni: d.haric_nedeni,
      });
    }
  }
  satirlar.sort((a, b) => a.katilimci_kodu.localeCompare(b.katilimci_kodu) || a.deneme_no - b.deneme_no
    || a.zaman_ms - b.zaman_ms || (a.kaynak === b.kaynak ? 0 : a.kaynak === 'olay' ? -1 : 1));
  return nesnelerden_tablo('ham_olaylar', satirlar,
    ['katilimci_kodu', 'cihaz', 'deneme_no', 'kosul_kodu', 'urun_kodu', 'sayfa', 'kaynak', 'olay_turu', 'zaman_ms',
      'x', 'y', 'hedef_oge', 'giris_turu', 'ek', 'olay_id', 'haric_tutuldu', 'haric_nedeni']);
}

/** Dosya adı: sepete_ekle_<tur>_<demo?>_<YYYYAAGG-SSDD>.<uzanti> */
export function dosya_adi(tur, uzanti, { demo = false, zaman = new Date() } = {}) {
  const p = (n) => String(n).padStart(2, '0');
  const z = `${zaman.getFullYear()}${p(zaman.getMonth() + 1)}${p(zaman.getDate())}-${p(zaman.getHours())}${p(zaman.getMinutes())}`;
  return `sepete_ekle_${tur}${demo ? '_demo' : ''}_${z}.${uzanti}`;
}
