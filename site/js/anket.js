// Ön anket: soruların tanımı ve doğrulaması (saf modül).
//
// Seçenek kodları veritabanındaki izin verilen değerlerle birebir aynıdır
// (supabase/migrations/..._tablolar.sql > katilimcilar).

export const ANKET_SORULARI = Object.freeze([
  {
    // Seçenekli (ekip kararı, 18 Kasım 2026). 18 yaş altı katılamaz.
    alan: 'yas_grubu',
    tur: 'secim',
    baslik: 'Yaşınız',
    secenekler: [
      ['18-20', '18–20'],
      ['21-30', '21–30'],
      ['31-40', '31–40'],
      ['41-50', '41–50'],
      ['51+', '51 ve üzeri'],
    ],
  },
  {
    alan: 'cinsiyet',
    tur: 'secim',
    baslik: 'Cinsiyetiniz',
    secenekler: [
      ['kadin', 'Kadın'],
      ['erkek', 'Erkek'],
      ['belirtmek_istemiyorum', 'Belirtmek istemiyorum'],
    ],
  },
  {
    alan: 'alisveris_sikligi',
    tur: 'secim',
    baslik: 'Ne sıklıkla çevrim içi alışveriş yaparsınız?',
    secenekler: [
      ['yilda_birkac_kez', 'Yılda birkaç kez'],
      ['ayda_bir', 'Ayda bir'],
      ['ayda_birkac_kez', 'Ayda birkaç kez'],
      ['haftada_bir_veya_daha_sik', 'Haftada bir veya daha sık'],
    ],
  },
  {
    alan: 'alisveris_cihazi',
    tur: 'secim',
    baslik: 'Çevrim içi alışverişi en çok hangi cihazdan yaparsınız?',
    secenekler: [
      ['bilgisayar', 'Bilgisayar'],
      ['telefon', 'Telefon'],
      ['tablet', 'Tablet'],
    ],
  },
  {
    alan: 'katilim_cihazi',
    tur: 'secim',
    baslik: 'Bu deneye hangi cihazla katılıyorsunuz?',
    secenekler: [
      ['bilgisayar', 'Bilgisayar'],
      ['telefon', 'Telefon'],
      ['tablet', 'Tablet'],
    ],
  },
  {
    alan: 'renk_ayirt_zorlugu',
    tur: 'secim',
    baslik: 'Renkleri ayırt etmekte zorluk yaşıyor musunuz?',
    secenekler: [
      ['evet', 'Evet'],
      ['hayir', 'Hayır'],
      ['emin_degilim', 'Emin değilim'],
    ],
  },
]);

/**
 * Anket yanıtlarını doğrular.
 * @param {Record<string, string|number|null|undefined>} yanitlar ham form değerleri
 * @returns {{gecerli: boolean, hatalar: Record<string,string>, temiz: object}}
 *   temiz: veritabanına gönderilecek nesne
 */
export function anket_dogrula(yanitlar) {
  const hatalar = {};
  const temiz = {};

  for (const soru of ANKET_SORULARI) {
    // Bütün sorular seçeneklidir; yalnızca listedeki kodlar kabul edilir.
    const ham = yanitlar?.[soru.alan];
    const izinli = soru.secenekler.map(([kod]) => kod);
    if (!izinli.includes(ham)) {
      hatalar[soru.alan] = 'Lütfen bir seçenek işaretleyin.';
      continue;
    }
    temiz[soru.alan] = ham;
  }

  return { gecerli: Object.keys(hatalar).length === 0, hatalar, temiz };
}

/** Anketteki cihaz yanıtı otomatik tespitle uyuşmuyor mu? (Veritabanıyla aynı kural.) */
export function cihaz_uyusmazligi_var_mi(katilim_cihazi, cihaz) {
  return (katilim_cihazi === 'bilgisayar') !== (cihaz === 'masaustu');
}
