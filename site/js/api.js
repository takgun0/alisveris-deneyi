// Supabase'e erişim: kütüphane kullanmadan, düz fetch ile veritabanı
// fonksiyonlarını (RPC) çağırır. Katılımcı tarafı yalnızca dört fonksiyonu
// çağırabilir: katilimci_olustur, deneme_kaydet, tercih_kaydet, katilimci_bitir.
//
// Yayınlanabilir anahtar "apikey" başlığıyla gönderilir (Supabase belgesi:
// publishable anahtar Authorization: Bearer ile gönderilmez).
//
// Ölçüm kuralı: Bu dosyadaki hiçbir fonksiyon bir deneme sürerken çağrılmaz.

import { SUPABASE_ADRESI, SUPABASE_YAYINLANABILIR_ANAHTAR } from '../yapilandirma/supabase.js';

export class ApiHatasi extends Error {
  /**
   * @param {string} mesaj veritabanının hata kodu (örn. 'gecersiz_yas') veya 'baglanti_yok'
   * @param {number} http_durumu 0 = ağ hatası
   */
  constructor(mesaj, http_durumu, kod = null) {
    super(mesaj);
    this.name = 'ApiHatasi';
    this.http_durumu = http_durumu;
    this.kod = kod;
  }

  /**
   * Kalıcı hata mı? (Yeniden denemek işe yaramaz: girdi reddedildi.)
   * Ağ hatası, zaman aşımı, 429 ve 5xx geçicidir.
   */
  get kalici_mi() {
    const d = this.http_durumu;
    return d >= 400 && d < 500 && d !== 408 && d !== 429;
  }
}

/**
 * Bir veritabanı fonksiyonunu çağırır.
 * @param {string} ad fonksiyon adı
 * @param {object} govde adlandırılmış parametreler ({ p_katilimci_id: ..., ... })
 * @param {{keepalive?: boolean, signal?: AbortSignal}} [secenekler]
 *   keepalive: sayfa kapanırken son gönderim için;
 *   signal: deneme başlarken süren isteği iptal etmek için (iptal geçici hata sayılır)
 */
export async function rpc(ad, govde, { keepalive = false, signal = undefined } = {}) {
  let yanit;
  try {
    yanit = await fetch(`${SUPABASE_ADRESI}/rest/v1/rpc/${ad}`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_YAYINLANABILIR_ANAHTAR,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(govde),
      keepalive,
      signal,
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
  } catch {
    throw new ApiHatasi('baglanti_yok', 0);
  }

  const metin = await yanit.text();
  let veri = null;
  try { veri = metin ? JSON.parse(metin) : null; } catch { /* JSON değil */ }

  if (!yanit.ok) {
    throw new ApiHatasi(veri?.message ?? `http_${yanit.status}`, yanit.status, veri?.code ?? null);
  }
  return veri;
}

// ---- Dört katılımcı fonksiyonu ----

export function katilimci_olustur({ cihaz, tablet_mi, cihaz_tespiti, anket, uygulama_surumu, demo }) {
  return rpc('katilimci_olustur', {
    p_cihaz: cihaz,
    p_tablet_mi: tablet_mi,
    p_cihaz_tespiti: cihaz_tespiti,
    p_anket: anket,
    p_uygulama_surumu: uygulama_surumu,
    p_demo: demo,
  });
}

export function deneme_kaydet({ katilimci_id, paket, demo }, secenekler) {
  return rpc('deneme_kaydet', { p_katilimci_id: katilimci_id, p_paket: paket, p_demo: demo }, secenekler);
}

export function tercih_kaydet({ katilimci_id, en_cok_kosul, en_az_kosul, neden, gosterim_sirasi, demo }, secenekler) {
  return rpc('tercih_kaydet', {
    p_katilimci_id: katilimci_id,
    p_en_cok_kosul: en_cok_kosul,
    p_en_az_kosul: en_az_kosul,
    p_neden: neden,
    p_gosterim_sirasi: gosterim_sirasi,
    p_demo: demo,
  }, secenekler);
}

export function katilimci_bitir({ katilimci_id, demo }) {
  return rpc('katilimci_bitir', { p_katilimci_id: katilimci_id, p_demo: demo });
}
