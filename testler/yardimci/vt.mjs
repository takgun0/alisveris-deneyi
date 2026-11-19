// Veritabanı testleri için yardımcılar.
//
// Testler YEREL Supabase'in Postgres'ine doğrudan bağlanır (CLI'nin
// varsayılan yerel adresi; canlı projeyle ilgisi yoktur). Fonksiyonlar,
// tarayıcının kullandığı rolle (anon) çağrılır; böylece yetkiler de sınanır.
// Kurulum ve doğrulama işleri yerel "postgres" kullanıcısıyla yapılır.

import pg from 'pg';
import { randomUUID } from 'node:crypto';

export const VT_ADRESI =
  process.env.YEREL_VT_ADRESI ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

export const havuz = new pg.Pool({ connectionString: VT_ADRESI, max: 12 });

/** Yönetici (postgres) olarak sorgu çalıştırır. */
export async function sorgu(sql, parametreler = []) {
  return (await havuz.query(sql, parametreler)).rows;
}

/**
 * Bir sorguyu verilen rolle, kendi işleminde çalıştırır.
 * @param {string} rol 'anon' veya 'authenticated'
 * @param {string|null} kullanici_id authenticated için auth.uid() değeri
 */
export async function rolle(rol, sql, parametreler = [], kullanici_id = null) {
  const istemci = await havuz.connect();
  try {
    await istemci.query('begin');
    await istemci.query(`set local role ${rol}`);
    if (kullanici_id) {
      await istemci.query(`select set_config('request.jwt.claims', $1, true)`,
        [JSON.stringify({ sub: kullanici_id, role: rol })]);
    }
    const sonuc = await istemci.query(sql, parametreler);
    await istemci.query('commit');
    return sonuc.rows;
  } catch (hata) {
    await istemci.query('rollback').catch(() => {});
    throw hata;
  } finally {
    istemci.release();
  }
}

/** Bütün katılımcı verisini (gerçek ve test_) siler. */
export async function temizle() {
  await sorgu('truncate public.katilimcilar, public.test_katilimcilar, public.islem_kaydi, public.test_islem_kaydi restart identity cascade');
}

export const ornek_anket = Object.freeze({
  yas_grubu: '21-30',
  cinsiyet: 'kadin',
  alisveris_sikligi: 'ayda_bir',
  alisveris_cihazi: 'telefon',
  katilim_cihazi: 'bilgisayar',
  renk_ayirt_zorlugu: 'hayir',
});

/** Tarayıcının yaptığı gibi anon rolüyle katılımcı oluşturur. */
export async function katilimci_olustur({
  cihaz = 'masaustu', tablet_mi = false, anket = ornek_anket, demo = false,
} = {}) {
  const anket_son = { ...anket };
  if (cihaz === 'mobil' && anket === ornek_anket) anket_son.katilim_cihazi = 'telefon';
  const satir = await rolle('anon',
    `select public.katilimci_olustur($1, $2, $3, $4, $5, $6) as s`,
    [cihaz, tablet_mi, { genislik: 1440 }, anket_son, 'test', demo]);
  return satir[0].s;
}

/** Geçerli bir deneme paketi üretir. */
export function ornek_paket(deneme_no, degisiklik = {}) {
  return {
    deneme_no,
    sonuc: 'basarili',
    zorluk_puani: 6,
    iz_eksik: false,
    ekran_genislik: 1920, ekran_yukseklik: 1080,
    pencere_genislik: 1440, pencere_yukseklik: 900,
    cihaz_piksel_orani: 2,
    tarayici_bilgisi: 'Test tarayıcısı',
    buton_ilk_gorunur: true,
    buton_x: 500, buton_y: 320, buton_genislik: 220, buton_yukseklik: 48,
    ozet: { tiklama_suresi_ms: 1500.25, gorev_suresi_ms: 2400, hatali_tiklama_sayisi: 0 },
    olaylar: [
      { olay_id: randomUUID(), sayfa: 'urun', olay_turu: 'sayfa_goruntulendi', zaman_ms: 900 },
      { olay_id: randomUUID(), sayfa: 'urun', olay_turu: 'tiklama', zaman_ms: 2400,
        x: 600, y: 340, hedef_oge: 'hedef-buton', giris_turu: 'fare', ek: { hedef_buton_mu: true } },
    ],
    izler: [
      { sayfa: 'urun', iz_turu: 'fare', ornekler: [[950, 10, 20], [1000, 15, 25]] },
      { sayfa: 'urun', iz_turu: 'kaydirma', ornekler: [[1100, null, 0], [1200, null, 40]] },
    ],
    ...degisiklik,
  };
}

export async function deneme_kaydet(katilimci_id, paket, demo = false) {
  const satir = await rolle('anon', 'select public.deneme_kaydet($1, $2, $3) as s',
    [katilimci_id, paket, demo]);
  return satir[0].s;
}

/** Katılımcının 6 denemesini kaydedip deneyi bitirir. */
export async function katilimciyi_tamamla(katilimci_id, demo = false) {
  for (let n = 0; n <= 6; n++) await deneme_kaydet(katilimci_id, ornek_paket(n), demo);
  await rolle('anon', 'select public.katilimci_bitir($1, $2)', [katilimci_id, demo]);
}

/** Bir sözün belirli bir hata koduyla reddedildiğini doğrular. */
export async function reddedilmeli(soz, mesaj_parcasi) {
  try {
    await soz;
  } catch (hata) {
    if (mesaj_parcasi && !String(hata.message).includes(mesaj_parcasi)) {
      throw new Error(`Beklenen hata "${mesaj_parcasi}", gelen: "${hata.message}"`);
    }
    return hata;
  }
  throw new Error(`Reddedilmesi gerekirdi${mesaj_parcasi ? ` (${mesaj_parcasi})` : ''}`);
}
