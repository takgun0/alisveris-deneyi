// Yönetici girişi için deneme freni (saf modül; durum dışarıdan verilir).
//
// Kural: ilk 5 hatalı denemeden sonra giriş 1 dakika kilitlenir; kilitten
// sonraki her hatalı deneme süreyi ikiye katlar (1, 2, 4, 8, 16, en çok 30 dk).
// Başarılı giriş sayacı sıfırlar.
//
// Bu fren tarayıcıdadır: paneli kullanan kişiyi yavaşlatır ama API'yi doğrudan
// çağıran birini durduramaz. Asıl sunucu tarafı koruma Supabase Auth'un IP
// başına uyguladığı giriş sınırıdır (Authentication > Rate Limits).
// Süre hesabı duvar saatiyle yapılır; bu ölçüm verisi değildir.

export const SERBEST_DENEME = 5;
export const ILK_KILIT_MS = 60_000;
export const EN_UZUN_KILIT_MS = 30 * 60_000;

/** Boş durum. */
export function yeni_durum() {
  return { hatali: 0, kilit_bitis: 0 };
}

/** Şu an kilitliyse kalan süre (ms), değilse 0. */
export function kalan_kilit(durum, simdi) {
  return Math.max(0, (durum?.kilit_bitis ?? 0) - simdi);
}

/** Hatalı denemeden sonraki yeni durum. */
export function hatali_deneme(durum, simdi) {
  const hatali = (durum?.hatali ?? 0) + 1;
  if (hatali < SERBEST_DENEME) return { hatali, kilit_bitis: 0 };
  const kat = 2 ** (hatali - SERBEST_DENEME);
  const sure = Math.min(ILK_KILIT_MS * kat, EN_UZUN_KILIT_MS);
  return { hatali, kilit_bitis: simdi + sure };
}

/** Kalan süreyi Türkçe yazar: "45 saniye", "3 dakika". */
export function sure_metni(ms) {
  const sn = Math.ceil(ms / 1000);
  return sn < 60 ? `${sn} saniye` : `${Math.ceil(sn / 60)} dakika`;
}
