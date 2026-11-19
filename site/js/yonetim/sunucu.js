// Panelin Supabase ile konuşan yardımcıları (supabase-js istemcisi üzerinden).

const SAYFA = 1000; // API'nin max_rows sınırı

/** Veritabanı hata kodlarının Türkçe açıklaması. */
const HATA_METINLERI = {
  yetkisiz: 'Bu işlem için yönetici yetkisi gerekli.',
  gecersiz_neden: 'Geçerli bir hariç tutma nedeni seçin.',
  aciklama_gerekli: '"Diğer" nedeni için açıklama yazın.',
  gecersiz_aciklama: 'Açıklama en çok 500 karakter olabilir.',
  bos_secim: 'Hiçbir kayıt seçilmedi.',
  cok_buyuk_secim: 'Seçim çok büyük; süzgeçle daraltın.',
  onay_uyusmuyor: 'Onay metni eşleşmedi; işlem yapılmadı.',
  deneme_bulunamadi: 'Deneme bulunamadı (silinmiş olabilir).',
  katilimci_bulunamadi: 'Katılımcı bulunamadı (silinmiş olabilir).',
  gecersiz_ozetler: 'Özet verisi geçersiz.',
  gecersiz_disa_aktarim: 'Dışa aktarım kaydı geçersiz.',
};

/**
 * Yönetici fonksiyonunu çağırır; hata olursa Türkçe mesajlı Error fırlatır.
 * Not: Her fonksiyon veritabanında yonetici_mi() ile ayrıca denetlenir.
 */
export async function yonetici_cagir(istemci, ad, parametreler) {
  const { data, error } = await istemci.rpc(ad, parametreler);
  if (error) {
    const kod = String(error.message ?? '').split(/\s/)[0];
    console.error(ad, error);
    throw new Error(HATA_METINLERI[kod] ?? `İşlem yapılamadı (${error.message ?? 'bilinmeyen hata'}).`);
  }
  return data;
}

/** Bir tabloyu 1000 satırlık sayfalarla tümüyle okur. */
export async function hepsini_oku_tablo(istemci, tablo, sira = null) {
  const satirlar = [];
  for (let bas = 0; ; bas += SAYFA) {
    let sorgu = istemci.from(tablo).select('*');
    if (sira) sorgu = sorgu.order(sira, { ascending: true });
    const { data, error } = await sorgu.range(bas, bas + SAYFA - 1);
    if (error) throw Object.assign(new Error(`${tablo} okunamadı: ${error.message}`), { code: error.code, status: error.status });
    satirlar.push(...data);
    if (data.length < SAYFA) return satirlar;
  }
}
