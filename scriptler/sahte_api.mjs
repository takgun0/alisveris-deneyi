// BELLEKTE çalışan sahte Supabase API'si — yalnızca Docker / yerel Supabase
// yokken arayüzü (katılımcı sitesi ve yönetim paneli) denemek içindir.
//
//   - Katılımcı RPC'leri: katilimci_olustur, deneme_kaydet, tercih_kaydet, katilimci_bitir (ve canli_tut)
//   - Yönetici RPC'leri: yonetici_mi, denemeleri_haric_tut, haric_tutmayi_geri_al,
//     deneme_sil, katilimci_sil, ozetleri_guncelle, disa_aktarim_kaydet
//   - Tablo okuma (GET /rest/v1/<tablo>): offset/limit ve basit eq/in süzgeçleri
//   - Giriş (POST /auth/v1/token?grant_type=password): e-posta herhangi biri,
//     parola SAHTE_PAROLA. Oturum yalnızca bellekte tutulur.
//
// UYARI: Veri saklanmaz; doğrulama ve güvenlik kuralları kısmen taklit edilir.
// Asıl davranış supabase/migrations altındadır ve npm run test:vt ile sınanır.

import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { plan_olustur, atama_hesapla } from './williams.mjs';
import { sahte_katilimci, sahte_paket, sahte_tercih, rastgele_uretec } from './sahte_veri_uretec.mjs';

export const SAHTE_PAROLA = 'sahte-yonetici-parolasi';
const HARFLER = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

class Hata extends Error {
  constructor(mesaj, durum = 400, kod = '22023') { super(mesaj); this.durum = durum; this.kod = kod; }
}

function yeni_depo() {
  return {
    katilimcilar: new Map(), denemeler: [], ozetler: new Map(), olaylar: [], olay_idleri: new Set(),
    izler: [], tercihler: new Map(), islem_kaydi: [], sonraki_deneme_id: 1, sonraki_islem_id: 1,
  };
}

export function sahte_api_olustur({ deney, port = 54321, sahte_veri = 0 } = {}) {
  const depolar = { '': yeni_depo(), test_: yeni_depo() };
  const depo_sec = (demo) => (demo ? depolar.test_ : depolar['']);
  const oturumlar = new Map(); // erisim belirteci → kullanıcı
  const kosul_kodlari = deney.kosullar.map((k) => k.kod);
  const bosalma_ms = deney.olcum.sira_bosalma_dakika * 60000;

  // ------------------------------------------------------------------
  // Katılımcı fonksiyonları
  // ------------------------------------------------------------------
  function katilimci_olustur(g, simdi = Date.now()) {
    const d = depo_sec(g.p_demo);
    if (!['masaustu', 'mobil'].includes(g.p_cihaz)) throw new Hata('gecersiz_cihaz');
    const a = g.p_anket ?? {};
    if (!['18-20', '21-30', '31-40', '41-50', '51+'].includes(a.yas_grubu)) throw new Hata('gecersiz_yas_grubu');
    for (const k of d.katilimcilar.values()) {
      if (k.durum === 'devam_ediyor' && simdi - k._son_etkinlik > bosalma_ms) k.durum = 'birakti';
    }
    const tutulan = new Set([...d.katilimcilar.values()]
      .filter((k) => k.cihaz === g.p_cihaz && !k.haric_tutuldu && !k.sira_cakismasi
        && (k.durum === 'tamamladi' || (k.durum === 'devam_ediyor' && simdi - k._son_etkinlik <= bosalma_ms)))
      .map((k) => k.sira_no));
    let sira = 0;
    while (tutulan.has(sira)) sira++;
    const { dizi_no, urun_kaydirmasi } = atama_hesapla(sira);
    const id = randomUUID();
    let kod;
    do { kod = Array.from({ length: 8 }, () => HARFLER[Math.floor(Math.random() * 32)]).join(''); }
    while ([...d.katilimcilar.values()].some((k) => k.katilimci_kodu === kod));
    const uyusmazlik = (a.katilim_cihazi === 'bilgisayar') !== (g.p_cihaz === 'masaustu');
    const zaman = new Date(simdi).toISOString();
    d.katilimcilar.set(id, {
      katilimci_id: id, katilimci_kodu: kod, cihaz: g.p_cihaz, tablet_mi: Boolean(g.p_tablet_mi),
      cihaz_tespiti: g.p_cihaz_tespiti ?? null, ...a, cihaz_uyusmazligi: uyusmazlik,
      sira_no: sira, dizi_no, urun_kaydirmasi, sira_cakismasi: false, durum: 'devam_ediyor',
      baslangic_zamani: zaman, bitis_zamani: null, son_etkinlik_zamani: zaman, _son_etkinlik: simdi,
      uygulama_surumu: g.p_uygulama_surumu ?? 'sahte', haric_tutuldu: false, haric_nedeni: null, haric_aciklama: null,
    });
    const plan = [
      { deneme_no: 0, kosul_indeksi: null, kosul_kodu: 'K1R0', konum: 'K1', renk: 'R0', urun_kodu: deney.alistirma_urunu.kod },
      ...plan_olustur(sira, deney),
    ];
    for (const p of plan) {
      d.denemeler.push({
        deneme_id: d.sonraki_deneme_id++, katilimci_id: id, deneme_no: p.deneme_no, alistirma_mi: p.deneme_no === 0,
        kosul_indeksi: p.kosul_indeksi, kosul_kodu: p.kosul_kodu, konum: p.konum, renk: p.renk, urun_kodu: p.urun_kodu,
        ekran_genislik: null, ekran_yukseklik: null, pencere_genislik: null, pencere_yukseklik: null,
        cihaz_piksel_orani: null, tarayici_bilgisi: null, buton_ilk_gorunur: null, buton_x: null, buton_y: null,
        buton_genislik: null, buton_yukseklik: null, zorluk_puani: null, sonuc: null, iz_eksik: false,
        kayit_zamani: null, haric_tutuldu: false, haric_nedeni: null, haric_aciklama: null,
      });
    }
    return { katilimci_id: id, katilimci_kodu: kod, cihaz: g.p_cihaz, sira_no: sira, dizi_no, urun_kaydirmasi, cihaz_uyusmazligi: uyusmazlik, plan };
  }

  function etkinlik(d, k, simdi) {
    if (k.durum === 'birakti') {
      k.durum = 'devam_ediyor';
      const baska = [...d.katilimcilar.values()].some((o) => o !== k && o.cihaz === k.cihaz && o.sira_no === k.sira_no
        && !o.haric_tutuldu && !o.sira_cakismasi && o.durum !== 'birakti');
      if (baska) k.sira_cakismasi = true;
    }
    k._son_etkinlik = simdi;
    k.son_etkinlik_zamani = new Date(simdi).toISOString();
  }

  function deneme_kaydet(g, simdi = Date.now()) {
    const d = depo_sec(g.p_demo);
    const k = d.katilimcilar.get(g.p_katilimci_id);
    if (!k) throw new Hata('katilimci_bulunamadi');
    const p = g.p_paket;
    const den = d.denemeler.find((x) => x.katilimci_id === k.katilimci_id && x.deneme_no === p.deneme_no);
    if (!den) throw new Hata('deneme_bulunamadi');
    const yeni = den.sonuc === null;
    if (yeni) {
      if (!deney.sonuclar.includes(p.sonuc)) throw new Hata('gecersiz_sonuc');
      for (const a of ['zorluk_puani', 'ekran_genislik', 'ekran_yukseklik', 'pencere_genislik', 'pencere_yukseklik',
        'cihaz_piksel_orani', 'tarayici_bilgisi', 'buton_ilk_gorunur', 'buton_x', 'buton_y', 'buton_genislik', 'buton_yukseklik']) {
        den[a] = p[a] ?? null;
      }
      den.sonuc = p.sonuc;
      den.iz_eksik = Boolean(p.iz_eksik);
      den.kayit_zamani = new Date(simdi).toISOString();
      d.ozetler.set(den.deneme_id, { ...p.ozet, deneme_id: den.deneme_id, sonuc: p.sonuc, zorluk_puani: p.zorluk_puani ?? null, hesaplanma_zamani: den.kayit_zamani });
    } else if (p.iz_eksik === false) {
      den.iz_eksik = false;
    }
    let eklenen_olay = 0;
    for (const o of p.olaylar ?? []) {
      if (d.olay_idleri.has(o.olay_id)) continue;
      d.olay_idleri.add(o.olay_id);
      d.olaylar.push({ ...o, deneme_id: den.deneme_id, katilimci_id: k.katilimci_id, deneme_no: den.deneme_no, cihaz: k.cihaz, kosul_kodu: den.kosul_kodu, urun_kodu: den.urun_kodu });
      eklenen_olay++;
    }
    let eklenen_iz = 0;
    for (const i of p.izler ?? []) {
      if (d.izler.some((x) => x.deneme_id === den.deneme_id && x.sayfa === i.sayfa && x.iz_turu === i.iz_turu)) continue;
      d.izler.push({ iz_id: d.izler.length + 1, deneme_id: den.deneme_id, katilimci_id: k.katilimci_id, deneme_no: den.deneme_no, sayfa: i.sayfa, iz_turu: i.iz_turu, ornekler: i.ornekler, ornek_sayisi: i.ornekler.length });
      eklenen_iz++;
    }
    etkinlik(d, k, simdi);
    console.log(`  deneme_kaydet: ${k.katilimci_kodu} deneme ${p.deneme_no} → ${p.sonuc} (zorluk ${p.zorluk_puani}) `
      + `olay ${p.olaylar?.length ?? 0}, iz ${(p.izler ?? []).map((i) => `${i.sayfa}/${i.iz_turu}:${i.ornekler.length}`).join(' ')}, `
      + `tiklama ${p.ozet?.tiklama_suresi_ms} ms, hatali ${p.ozet?.hatali_tiklama_sayisi}, bos ${p.ozet?.bos_tiklama_sayisi}`);
    return { deneme_no: p.deneme_no, yeni_kayit: yeni, eklenen_olay, eklenen_iz };
  }

  function tercih_kaydet(g, simdi = Date.now()) {
    const d = depo_sec(g.p_demo);
    const k = d.katilimcilar.get(g.p_katilimci_id);
    if (!k) throw new Hata('katilimci_bulunamadi');
    if (g.p_en_cok_kosul === g.p_en_az_kosul) throw new Hata('gecersiz_en_az_kosul');
    if (d.tercihler.has(k.katilimci_id)) return { yeni_kayit: false };
    d.tercihler.set(k.katilimci_id, {
      katilimci_id: k.katilimci_id, en_cok_kosul: g.p_en_cok_kosul, en_az_kosul: g.p_en_az_kosul,
      neden: g.p_neden || null, gosterim_sirasi: g.p_gosterim_sirasi, kayit_zamani: new Date(simdi).toISOString(),
    });
    etkinlik(d, k, simdi);
    return { yeni_kayit: true };
  }

  function katilimci_bitir(g, simdi = Date.now()) {
    const d = depo_sec(g.p_demo);
    const k = d.katilimcilar.get(g.p_katilimci_id);
    if (!k) throw new Hata('katilimci_bulunamadi');
    const eksik = d.denemeler.filter((x) => x.katilimci_id === k.katilimci_id && x.deneme_no > 0 && x.sonuc === null);
    if (eksik.length) throw new Hata('eksik_deneme');
    if (k.durum !== 'tamamladi') {
      k.durum = 'tamamladi';
      k.bitis_zamani = new Date(simdi).toISOString();
    }
    etkinlik(d, k, simdi);
    return { durum: 'tamamladi', katilimci_kodu: k.katilimci_kodu };
  }

  // ------------------------------------------------------------------
  // Yönetici fonksiyonları
  // ------------------------------------------------------------------
  const NEDENLER = ['asiri_uzun_sure', 'sekme_degistirme', 'teknik_hata', 'katilimci_talebi', 'diger'];
  function islem_yaz(d, kullanici, islem, kural, etkilenen, neden, aciklama) {
    const satir = {
      islem_id: d.sonraki_islem_id++, zaman: new Date().toISOString(), yonetici_id: kullanici.id,
      yonetici_eposta: kullanici.email, islem, kural: kural ?? null, etkilenen, neden: neden ?? null, aciklama: aciklama ?? null,
    };
    d.islem_kaydi.push(satir);
    return satir.islem_id;
  }

  const yonetici_fonksiyonlari = {
    yonetici_mi: () => true,
    denemeleri_haric_tut(g, kullanici) {
      const d = depo_sec(g.p_demo);
      if (!NEDENLER.includes(g.p_neden)) throw new Hata('gecersiz_neden');
      if (g.p_neden === 'diger' && !String(g.p_aciklama ?? '').trim()) throw new Hata('aciklama_gerekli');
      const di = new Set(g.p_deneme_idler ?? []);
      const ki = new Set(g.p_katilimci_idler ?? []);
      if (!di.size && !ki.size) throw new Hata('bos_secim');
      const degisen_d = [];
      for (const x of d.denemeler) {
        if (di.has(x.deneme_id) && !x.haric_tutuldu) {
          Object.assign(x, { haric_tutuldu: true, haric_nedeni: g.p_neden, haric_aciklama: g.p_aciklama?.trim() || null });
          degisen_d.push(x.deneme_id);
        }
      }
      const degisen_k = [];
      for (const x of d.katilimcilar.values()) {
        if (ki.has(x.katilimci_id) && !x.haric_tutuldu) {
          Object.assign(x, { haric_tutuldu: true, haric_nedeni: g.p_neden, haric_aciklama: g.p_aciklama?.trim() || null });
          degisen_k.push(x.katilimci_id);
        }
      }
      const islem_id = islem_yaz(d, kullanici, 'haric_tut', g.p_kural, { deneme_idler: degisen_d, katilimci_idler: degisen_k }, g.p_neden, g.p_aciklama);
      return { islem_id, deneme_sayisi: degisen_d.length, katilimci_sayisi: degisen_k.length };
    },
    haric_tutmayi_geri_al(g, kullanici) {
      const d = depo_sec(g.p_demo);
      const di = new Set(g.p_deneme_idler ?? []);
      const ki = new Set(g.p_katilimci_idler ?? []);
      if (!di.size && !ki.size) throw new Hata('bos_secim');
      const denemeler = [];
      for (const x of d.denemeler) {
        if (di.has(x.deneme_id) && x.haric_tutuldu) {
          denemeler.push({ deneme_id: x.deneme_id, onceki_neden: x.haric_nedeni });
          Object.assign(x, { haric_tutuldu: false, haric_nedeni: null, haric_aciklama: null });
        }
      }
      const katilimcilar = [];
      for (const x of d.katilimcilar.values()) {
        if (ki.has(x.katilimci_id) && x.haric_tutuldu) {
          katilimcilar.push({ katilimci_id: x.katilimci_id, onceki_neden: x.haric_nedeni });
          Object.assign(x, { haric_tutuldu: false, haric_nedeni: null, haric_aciklama: null });
        }
      }
      const islem_id = islem_yaz(d, kullanici, 'haric_geri_al', null, { denemeler, katilimcilar });
      return { islem_id, deneme_sayisi: denemeler.length, katilimci_sayisi: katilimcilar.length };
    },
    deneme_sil(g, kullanici) {
      const d = depo_sec(g.p_demo);
      if (g.p_onay !== `${g.p_katilimci_kodu}-${g.p_deneme_no}`) throw new Hata('onay_uyusmuyor');
      const k = [...d.katilimcilar.values()].find((x) => x.katilimci_kodu === g.p_katilimci_kodu);
      const den = k && d.denemeler.find((x) => x.katilimci_id === k.katilimci_id && x.deneme_no === g.p_deneme_no);
      if (!den) throw new Hata('deneme_bulunamadi');
      const olay = d.olaylar.filter((o) => o.deneme_id === den.deneme_id).length;
      const iz = d.izler.filter((o) => o.deneme_id === den.deneme_id).length;
      const ozet = d.ozetler.has(den.deneme_id) ? 1 : 0;
      d.olaylar = d.olaylar.filter((o) => o.deneme_id !== den.deneme_id);
      d.izler = d.izler.filter((o) => o.deneme_id !== den.deneme_id);
      d.ozetler.delete(den.deneme_id);
      d.denemeler = d.denemeler.filter((x) => x !== den);
      const islem_id = islem_yaz(d, kullanici, 'deneme_sil', null, { katilimci_kodu: g.p_katilimci_kodu, deneme_no: g.p_deneme_no, deneme: 1, ozet, olay, iz });
      return { islem_id, olay, iz, ozet };
    },
    katilimci_sil(g, kullanici) {
      const d = depo_sec(g.p_demo);
      if (g.p_onay !== g.p_katilimci_kodu) throw new Hata('onay_uyusmuyor');
      const k = [...d.katilimcilar.values()].find((x) => x.katilimci_kodu === g.p_katilimci_kodu);
      if (!k) throw new Hata('katilimci_bulunamadi');
      const id = k.katilimci_id;
      const idler = new Set(d.denemeler.filter((x) => x.katilimci_id === id).map((x) => x.deneme_id));
      const sayilar = {
        denemeler: idler.size,
        olaylar: d.olaylar.filter((o) => o.katilimci_id === id).length,
        izler: d.izler.filter((o) => o.katilimci_id === id).length,
        tercihler: d.tercihler.has(id) ? 1 : 0,
        deneme_ozetleri: [...idler].filter((i) => d.ozetler.has(i)).length,
      };
      d.olaylar = d.olaylar.filter((o) => o.katilimci_id !== id);
      d.izler = d.izler.filter((o) => o.katilimci_id !== id);
      for (const i of idler) d.ozetler.delete(i);
      d.denemeler = d.denemeler.filter((x) => x.katilimci_id !== id);
      d.tercihler.delete(id);
      d.katilimcilar.delete(id);
      const islem_id = islem_yaz(d, kullanici, 'katilimci_sil', null, { katilimci_kodu: g.p_katilimci_kodu, ...sayilar });
      return { islem_id, ...sayilar };
    },
    ozetleri_guncelle(g, kullanici) {
      const d = depo_sec(g.p_demo);
      let n = 0;
      const surumler = new Set();
      for (const { deneme_id, ozet } of g.p_ozetler ?? []) {
        const den = d.denemeler.find((x) => x.deneme_id === deneme_id);
        if (!den) continue;
        d.ozetler.set(deneme_id, { ...ozet, deneme_id, sonuc: den.sonuc, zorluk_puani: den.zorluk_puani, hesaplanma_zamani: new Date().toISOString() });
        surumler.add(ozet.ozet_surumu);
        n++;
      }
      const islem_id = islem_yaz(d, kullanici, 'ozet_guncelle', { ozet_surumleri: [...surumler] }, { deneme_sayisi: n }, g.p_neden);
      return { islem_id, guncellenen: n };
    },
    disa_aktarim_kaydet(g, kullanici) {
      const d = depo_sec(g.p_demo);
      if (!['csv', 'xlsx', 'json'].includes(g.p_bicim)) throw new Hata('gecersiz_disa_aktarim');
      return islem_yaz(d, kullanici, g.p_tur === 'tam_yedek' ? 'tam_yedek' : 'disa_aktar', g.p_filtre, { tur: g.p_tur, bicim: g.p_bicim, satir: g.p_satir });
    },
  };

  // ------------------------------------------------------------------
  // Tablolar (yalnızca yönetici okuyabilir)
  // ------------------------------------------------------------------
  const temiz = (k) => Object.fromEntries(Object.entries(k).filter(([a]) => !a.startsWith('_')));

  function tablo(ad) {
    const demo = ad.startsWith('test_');
    const d = depo_sec(demo);
    const kisa = demo ? ad.slice(5) : ad;
    switch (kisa) {
      case 'katilimcilar': return [...d.katilimcilar.values()].map(temiz);
      case 'denemeler': return d.denemeler;
      case 'deneme_ozetleri': return [...d.ozetler.values()];
      case 'olaylar': return d.olaylar;
      case 'izler': return d.izler;
      case 'tercihler': return [...d.tercihler.values()];
      case 'islem_kaydi': return d.islem_kaydi;
      case 'genis_tablo':
        return d.denemeler.map((x) => {
          const k = d.katilimcilar.get(x.katilimci_id);
          const o = d.ozetler.get(x.deneme_id) ?? {};
          return {
            deneme_id: x.deneme_id, katilimci_id: k.katilimci_id, katilimci_kodu: k.katilimci_kodu, cihaz: k.cihaz,
            tablet_mi: k.tablet_mi, yas_grubu: k.yas_grubu, cinsiyet: k.cinsiyet,
            alisveris_sikligi: k.alisveris_sikligi, alisveris_cihazi: k.alisveris_cihazi, katilim_cihazi: k.katilim_cihazi,
            renk_ayirt_zorlugu: k.renk_ayirt_zorlugu, cihaz_uyusmazligi: k.cihaz_uyusmazligi, sira_no: k.sira_no,
            dizi_no: k.dizi_no, urun_kaydirmasi: k.urun_kaydirmasi, sira_cakismasi: k.sira_cakismasi, durum: k.durum,
            baslangic_zamani: k.baslangic_zamani, bitis_zamani: k.bitis_zamani, son_etkinlik_zamani: k.son_etkinlik_zamani, uygulama_surumu: k.uygulama_surumu,
            katilimci_haric_tutuldu: k.haric_tutuldu, katilimci_haric_nedeni: k.haric_nedeni,
            deneme_no: x.deneme_no, alistirma_mi: x.alistirma_mi, kosul_indeksi: x.kosul_indeksi, kosul_kodu: x.kosul_kodu,
            konum: x.konum, renk: x.renk, urun_kodu: x.urun_kodu, sonuc: x.sonuc, zorluk_puani: x.zorluk_puani,
            ekran_genislik: x.ekran_genislik, ekran_yukseklik: x.ekran_yukseklik, pencere_genislik: x.pencere_genislik,
            pencere_yukseklik: x.pencere_yukseklik, cihaz_piksel_orani: x.cihaz_piksel_orani,
            buton_ilk_gorunur: x.buton_ilk_gorunur, buton_x: x.buton_x, buton_y: x.buton_y,
            buton_genislik: x.buton_genislik, buton_yukseklik: x.buton_yukseklik, iz_eksik: x.iz_eksik,
            kayit_zamani: x.kayit_zamani, deneme_haric_tutuldu: x.haric_tutuldu, deneme_haric_nedeni: x.haric_nedeni,
            deneme_haric_aciklama: x.haric_aciklama, haric_tutuldu: x.haric_tutuldu || k.haric_tutuldu,
            haric_nedeni: x.haric_nedeni ?? k.haric_nedeni,
            tiklama_suresi_ms: o.tiklama_suresi_ms ?? null, tiklama_suresi_net_ms: o.tiklama_suresi_net_ms ?? null,
            basili_tutma_suresi_ms: o.basili_tutma_suresi_ms ?? null, gorev_suresi_ms: o.gorev_suresi_ms ?? null,
            gorev_suresi_net_ms: o.gorev_suresi_net_ms ?? null, buton_gorunme_suresi_ms: o.buton_gorunme_suresi_ms ?? null,
            buton_gorunme_suresi_net_ms: o.buton_gorunme_suresi_net_ms ?? null, buton_bulma_suresi_ms: o.buton_bulma_suresi_ms ?? null,
            buton_bulma_suresi_net_ms: o.buton_bulma_suresi_net_ms ?? null, hatali_tiklama_sayisi: o.hatali_tiklama_sayisi ?? null,
            bos_tiklama_sayisi: o.bos_tiklama_sayisi ?? null, toplam_kaydirma_px: o.toplam_kaydirma_px ?? null,
            sekme_degisti: o.sekme_degisti ?? null, sekme_disi_sure_ms: o.sekme_disi_sure_ms ?? null,
            duraklatildi: o.duraklatildi ?? null, duraklatma_suresi_ms: o.duraklatma_suresi_ms ?? null,
            ozet_surumu: o.ozet_surumu ?? null,
          };
        });
      default: return null;
    }
  }

  /** PostgREST benzeri süzgeç: ?sutun=eq.deger, ?sutun=in.(a,b), ?sutun=gte.x, ?sutun=lte.x */
  function suz(satirlar, parametreler) {
    let sonuc = satirlar;
    for (const [sutun, ifade] of parametreler) {
      if (['select', 'order', 'offset', 'limit'].includes(sutun)) continue;
      const [op, ...geri] = ifade.split('.');
      const deger = geri.join('.');
      const esit = (a, b) => String(a) === b;
      if (op === 'eq') sonuc = sonuc.filter((s) => esit(s[sutun], deger));
      else if (op === 'in') {
        const liste = deger.replace(/^\(|\)$/g, '').split(',').map((v) => v.replace(/^"|"$/g, ''));
        sonuc = sonuc.filter((s) => liste.includes(String(s[sutun])));
      } else if (op === 'gte') sonuc = sonuc.filter((s) => String(s[sutun]) >= deger);
      else if (op === 'lte') sonuc = sonuc.filter((s) => String(s[sutun]) <= deger);
      else if (op === 'is') sonuc = sonuc.filter((s) => (deger === 'null' ? s[sutun] === null : String(s[sutun]) === deger));
    }
    const sira = parametreler.get('order');
    if (sira) {
      const [sutun, yon] = sira.split(',')[0].split('.');
      sonuc = [...sonuc].sort((a, b) => (a[sutun] > b[sutun] ? 1 : a[sutun] < b[sutun] ? -1 : 0) * (yon === 'desc' ? -1 : 1));
    }
    return sonuc;
  }

  // ------------------------------------------------------------------
  // Başlangıç verisi
  // ------------------------------------------------------------------
  function veri_uret(n, demo, tohum) {
    const r = rastgele_uretec(tohum);
    const simdi = Date.now();
    for (let i = 0; i < n; i++) {
      const cihaz = r() < 0.5 ? 'masaustu' : 'mobil';
      const k = sahte_katilimci(r, cihaz);
      const t0 = simdi - (n - i) * (10 * 24 * 3600 * 1000 / n);
      const yan = katilimci_olustur({ p_cihaz: cihaz, p_tablet_mi: k.tablet_mi, p_anket: k.anket, p_uygulama_surumu: 'sahte', p_demo: demo }, t0);
      for (const p of yan.plan.slice(0, k.deneme_sayisi)) {
        deneme_kaydet({ p_katilimci_id: yan.katilimci_id, p_paket: sahte_paket({ plan_satiri: p, cihaz, r }), p_demo: demo }, t0 + 60000 * (p.deneme_no + 1));
      }
      if (k.deneme_sayisi === 7) {
        const t = sahte_tercih(r, kosul_kodlari);
        tercih_kaydet({ p_katilimci_id: yan.katilimci_id, p_en_cok_kosul: t.en_cok_kosul, p_en_az_kosul: t.en_az_kosul, p_neden: t.neden, p_gosterim_sirasi: t.gosterim_sirasi, p_demo: demo }, t0 + 8 * 60000);
        katilimci_bitir({ p_katilimci_id: yan.katilimci_id, p_demo: demo }, t0 + 8 * 60000);
      }
    }
  }
  if (sahte_veri > 0) {
    const log = console.log;
    console.log = () => {};
    veri_uret(sahte_veri, false, 1);
    veri_uret(Math.ceil(sahte_veri / 4), true, 2);
    console.log = log;
    console.log(`Sahte veri: ${sahte_veri} gerçek, ${Math.ceil(sahte_veri / 4)} demo katılımcı üretildi.`);
  }

  // ------------------------------------------------------------------
  // HTTP
  // ------------------------------------------------------------------
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'apikey, content-type, authorization, x-client-info, prefer, range, range-unit, accept-profile, content-profile, x-supabase-api-version',
    'Access-Control-Allow-Methods': 'GET, POST, HEAD, OPTIONS',
    'Access-Control-Expose-Headers': 'Content-Range',
  };
  const json = (yanit, durum, veri, ek = {}) => {
    yanit.writeHead(durum, { ...cors, 'Content-Type': 'application/json', ...ek });
    yanit.end(veri === undefined ? '' : JSON.stringify(veri));
  };
  const kullanici_bul = (istek) => {
    const b = (istek.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
    return oturumlar.get(b) ?? null;
  };
  const KATILIMCI = { katilimci_olustur, deneme_kaydet, tercih_kaydet, katilimci_bitir, canli_tut: () => true };

  const sunucu = http.createServer((istek, yanit) => {
    if (istek.method === 'OPTIONS') { yanit.writeHead(204, cors).end(); return; }
    let govde = '';
    istek.on('data', (p) => { govde += p; });
    istek.on('end', () => {
      const adres = new URL(istek.url, 'http://yerel');
      try {
        // ---- Giriş ----
        if (adres.pathname === '/auth/v1/token') {
          const g = JSON.parse(govde || '{}');
          if (adres.searchParams.get('grant_type') === 'password') {
            if (g.password !== SAHTE_PAROLA) {
              json(yanit, 400, { error: 'invalid_grant', error_description: 'Invalid login credentials', code: 'invalid_credentials', msg: 'Invalid login credentials' });
              return;
            }
            const kullanici = { id: randomUUID(), aud: 'authenticated', role: 'authenticated', email: g.email, app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
            const belirtec = `sahte-${randomUUID()}`;
            const yenileme = `yenile-${randomUUID()}`;
            oturumlar.set(belirtec, kullanici);
            oturumlar.set(yenileme, kullanici);
            json(yanit, 200, { access_token: belirtec, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: yenileme, user: kullanici });
            return;
          }
          if (adres.searchParams.get('grant_type') === 'refresh_token') {
            const kullanici = oturumlar.get(g.refresh_token);
            if (!kullanici) { json(yanit, 400, { error: 'invalid_grant', code: 'refresh_token_not_found' }); return; }
            const belirtec = `sahte-${randomUUID()}`;
            oturumlar.set(belirtec, kullanici);
            json(yanit, 200, { access_token: belirtec, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: g.refresh_token, user: kullanici });
            return;
          }
        }
        if (adres.pathname === '/auth/v1/user') {
          const k = kullanici_bul(istek);
          k ? json(yanit, 200, k) : json(yanit, 401, { code: 'bad_jwt', msg: 'invalid JWT' });
          return;
        }
        if (adres.pathname === '/auth/v1/logout') {
          oturumlar.delete((istek.headers.authorization ?? '').replace(/^Bearer\s+/i, ''));
          json(yanit, 204);
          return;
        }

        // ---- RPC ----
        if (adres.pathname.startsWith('/rest/v1/rpc/')) {
          const ad = adres.pathname.slice('/rest/v1/rpc/'.length);
          const g = JSON.parse(govde || '{}');
          if (KATILIMCI[ad]) { json(yanit, 200, KATILIMCI[ad](g)); return; }
          if (yonetici_fonksiyonlari[ad]) {
            const k = kullanici_bul(istek);
            if (!k) { json(yanit, 401, { code: '42501', message: 'permission denied for function ' + ad }); return; }
            json(yanit, 200, yonetici_fonksiyonlari[ad](g, k));
            return;
          }
          throw new Hata('bilinmeyen_fonksiyon', 404, 'PGRST202');
        }

        // ---- Tablolar ----
        if (adres.pathname.startsWith('/rest/v1/')) {
          const ad = adres.pathname.slice('/rest/v1/'.length);
          const satirlar = tablo(ad);
          if (!satirlar) throw new Hata('bilinmeyen_tablo', 404, '42P01');
          // RLS taklidi: yönetici değilse boş liste
          const suzulmus = kullanici_bul(istek) ? suz(satirlar, adres.searchParams) : [];
          const bas = Number(adres.searchParams.get('offset') ?? 0);
          const limit = Math.min(Number(adres.searchParams.get('limit') ?? 1000), 1000); // max_rows = 1000
          const parca = suzulmus.slice(bas, bas + limit);
          const aralik = parca.length ? `${bas}-${bas + parca.length - 1}/${suzulmus.length}` : `*/${suzulmus.length}`;
          json(yanit, 200, istek.method === 'HEAD' ? undefined : parca, { 'Content-Range': aralik });
          return;
        }
        throw new Hata('bulunamadi', 404);
      } catch (h) {
        json(yanit, h.durum ?? 400, { code: h.kod ?? '22023', message: h.message });
      }
    });
  });
  sunucu.listen(port, '127.0.0.1', () => console.log(`Sahte API: http://127.0.0.1:${port} (veri saklanmaz; yönetici parolası: ${SAHTE_PAROLA})`));
  return sunucu;
}
