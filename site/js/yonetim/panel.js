// Yönetim paneli giriş noktası.
//
//  - Supabase Auth ile e-posta + parola girişi (kayıt kapalıdır; yöneticiler
//    elle eklenir). Veri yalnızca "yoneticiler" tablosundaki kullanıcılara
//    görünür (RLS); yönetici olmayan giriş boş veri görür ve uyarılır.
//  - Veri 10 saniyede bir yenilenir; durdurulabilir.
//  - Gerçek veri ile demo verisi (test_ tabloları) arasında geçiş yapılabilir.
//  - Tablolar 1000 satırlık sayfalarla okunur (API'nin max_rows sınırı).
//
// Tarayıcıda yalnızca yayınlanabilir anahtar bulunur; gizli anahtar kullanılmaz.

import { SUPABASE_ADRESI, SUPABASE_YAYINLANABILIR_ANAHTAR } from '../../yapilandirma/supabase.js';
import { el, secim, bildir } from './arayuz.js';
import { BOS_FILTRE, filtrele, katilimcilar, veri_imzasi, YAS_GRUPLARI, ETIKETLER } from './veri.js';
import { grafikleri_temizle } from './grafikler.js';
import { hepsini_oku_tablo } from './sunucu.js';
import { yeni_durum, hatali_deneme, kalan_kilit, sure_metni } from './giris_siniri.js';
import { ozet_sekmesi_ciz } from './ozet_sekmesi.js';
import { analiz_sekmesi_ciz } from './analiz_sekmesi.js';
import { denemeler_sekmesi_ciz } from './denemeler_sekmesi.js';
import { haric_sekmesi_ciz } from './haric_sekmesi.js';
import { disa_aktar_sekmesi_ciz } from './disa_aktar_sekmesi.js';
import { islem_kaydi_sekmesi_ciz } from './islem_kaydi_sekmesi.js';

const YENILEME_MS = 10000;
const icerik = document.getElementById('icerik');
const ust_durum = document.getElementById('ust-durum');

const SEKMELER = [
  ['ozet', 'Özet', ozet_sekmesi_ciz],
  ['analiz', 'Analiz', analiz_sekmesi_ciz],
  ['denemeler', 'Denemeler ve temizleme', denemeler_sekmesi_ciz],
  ['haric', 'Hariç tutulanlar', haric_sekmesi_ciz],
  ['disa_aktar', 'Dışa aktar', disa_aktar_sekmesi_ciz],
  ['islem_kaydi', 'İşlem kaydı', islem_kaydi_sekmesi_ciz],
];

// Kullanıcı tercihi olarak yalnızca görünüm ayarları saklanır (veri değil).
const tercih_oku = () => { try { return JSON.parse(sessionStorage.getItem('panel_gorunum') ?? '{}'); } catch { return {}; } };
const tercih_yaz = (t) => { try { sessionStorage.setItem('panel_gorunum', JSON.stringify(t)); } catch { /* yok say */ } };

const durum = {
  istemci: null,
  kullanici: null,
  deney: null,
  demo: false,
  sekme: 'ozet',
  olcu: 'tiklama_suresi_ms',
  filtre: { ...BOS_FILTRE },
  satirlar: [],
  tercihler: [],
  islemler: [],
  imza: null,
  son_guncelleme: null,
  otomatik: true,
  zamanlayici: null,
  yukleniyor: false,
};
{
  const t = tercih_oku();
  if (typeof t.demo === 'boolean') durum.demo = t.demo;
  if (SEKMELER.some(([k]) => k === t.sekme)) durum.sekme = t.sekme;
  if (typeof t.olcu === 'string') durum.olcu = t.olcu;
  if (t.filtre) durum.filtre = { ...BOS_FILTRE, ...t.filtre };
}

// ---------------------------------------------------------------------
// Başlangıç ve giriş
// ---------------------------------------------------------------------
async function baslat() {
  if (!globalThis.supabase?.createClient) throw new Error('supabase-js yüklenemedi');
  durum.deney = await (await fetch('../yapilandirma/deney.json', { cache: 'no-cache' })).json();
  durum.istemci = globalThis.supabase.createClient(SUPABASE_ADRESI, SUPABASE_YAYINLANABILIR_ANAHTAR, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
  const { data } = await durum.istemci.auth.getSession();
  if (data.session) await oturum_acildi(data.session.user);
  else giris_goster();
}

// Kullanıcı adıyla giriş: Supabase Auth e-posta biçiminde bir adres ister.
// "@" içermeyen girdiye bu uzantı eklenir (ör. takgun → takgun@deney.local).
// Adres gerçek bir posta kutusu değildir; hesap panelden "Auto Confirm User"
// ile açılır. Uzantı gizli değildir; güvenliği parola ve yoneticiler tablosu sağlar.
const KULLANICI_ADI_UZANTISI = '@deney.local';
export function giris_adresi(girdi) {
  const temiz = String(girdi ?? '').trim();
  return temiz.includes('@') ? temiz : temiz.toLowerCase() + KULLANICI_ADI_UZANTISI;
}

// Deneme freni durumu bu tarayıcıda saklanır (giris_siniri.js).
const GIRIS_SINIRI_ANAHTARI = 'sepete_ekle_yonetim_giris_siniri_v1';
function giris_siniri_oku() {
  try { return JSON.parse(localStorage.getItem(GIRIS_SINIRI_ANAHTARI)) ?? yeni_durum(); } catch { return yeni_durum(); }
}
function giris_siniri_yaz(d) {
  try { localStorage.setItem(GIRIS_SINIRI_ANAHTARI, JSON.stringify(d)); } catch { /* depolama kapalı */ }
}
function giris_siniri_sil() {
  try { localStorage.removeItem(GIRIS_SINIRI_ANAHTARI); } catch { /* depolama kapalı */ }
}

function giris_goster(mesaj = '') {
  ust_durum.replaceChildren();
  const eposta = el('input', { type: 'text', name: 'eposta', autocomplete: 'username', autocapitalize: 'none', spellcheck: 'false', required: true });
  const parola = el('input', { type: 'password', name: 'parola', autocomplete: 'current-password', required: true });
  const hata = el('p', { class: 'hata-metni', role: 'alert' }, mesaj);
  const dugme = el('button', { type: 'submit', class: 'dugme dugme-ana' }, 'Giriş yap');
  const form = el('form', { class: 'giris', novalidate: true },
    el('h2', {}, 'Yönetici girişi'),
    el('p', {}, 'Yalnızca araştırma ekibinin yönetici hesapları girebilir.'),
    el('label', { class: 'alan' }, 'Kullanıcı adı', eposta),
    el('label', { class: 'alan' }, 'Parola', parola),
    hata, dugme);
  // Kilit sürerken düğme kapalı kalır ve kalan süre gösterilir.
  let kilit_sayaci = null;
  function kilidi_goster() {
    clearInterval(kilit_sayaci);
    const guncelle = () => {
      const kalan = kalan_kilit(giris_siniri_oku(), Date.now());
      dugme.disabled = kalan > 0;
      if (kalan > 0) {
        hata.textContent = `Çok fazla hatalı deneme. ${sure_metni(kalan)} sonra tekrar deneyin.`;
      } else {
        clearInterval(kilit_sayaci);
        if (hata.textContent.startsWith('Çok fazla')) hata.textContent = '';
      }
    };
    guncelle();
    kilit_sayaci = setInterval(guncelle, 1000);
  }

  form.addEventListener('submit', async (o) => {
    o.preventDefault();
    if (kalan_kilit(giris_siniri_oku(), Date.now()) > 0) { kilidi_goster(); return; }
    if (!eposta.value || !parola.value) { hata.textContent = 'Kullanıcı adı ve parola gerekli.'; return; }
    dugme.disabled = true;
    hata.textContent = '';
    const { data, error } = await durum.istemci.auth.signInWithPassword({ email: giris_adresi(eposta.value), password: parola.value });
    dugme.disabled = false;
    if (error) {
      if (error.status === 429) {
        // Supabase'in sunucu tarafı sınırı (IP başına).
        hata.textContent = 'Çok fazla giriş denemesi yapıldı. Birkaç dakika sonra tekrar deneyin.';
        return;
      }
      if (error.status === 400 || error.code === 'invalid_credentials') {
        const yeni = hatali_deneme(giris_siniri_oku(), Date.now());
        giris_siniri_yaz(yeni);
        parola.value = '';
        hata.textContent = 'Kullanıcı adı veya parola hatalı.';
        if (kalan_kilit(yeni, Date.now()) > 0) kilidi_goster();
        return;
      }
      hata.textContent = 'Giriş yapılamadı. Bağlantıyı kontrol edip tekrar deneyin.';
      return;
    }
    giris_siniri_sil();
    clearInterval(kilit_sayaci);
    await oturum_acildi(data.user);
  });
  if (kalan_kilit(giris_siniri_oku(), Date.now()) > 0) kilidi_goster();
  icerik.replaceChildren(form);
  eposta.focus();
}

async function oturum_acildi(kullanici) {
  durum.kullanici = kullanici;
  const { data: yonetici, error } = await durum.istemci.rpc('yonetici_mi');
  if (error || yonetici !== true) {
    await durum.istemci.auth.signOut();
    giris_goster('Bu hesap yönetici olarak tanımlı değil. Araştırma ekibine başvurun.');
    return;
  }
  iskelet_ciz();
  await yenile({ zorla: true });
  otomatik_yenilemeyi_kur();
}

async function cikis() {
  clearInterval(durum.zamanlayici);
  await durum.istemci.auth.signOut();
  grafikleri_temizle();
  durum.satirlar = [];
  durum.tercihler = [];
  durum.islemler = [];
  giris_goster();
}

// ---------------------------------------------------------------------
// Veri
// ---------------------------------------------------------------------
const tablo_adi = (ad) => (durum.demo ? `test_${ad}` : ad);

async function yenile({ zorla = false } = {}) {
  if (durum.yukleniyor) return;
  durum.yukleniyor = true;
  try {
    const [satirlar, tercihler, islemler] = await Promise.all([
      hepsini_oku_tablo(durum.istemci, tablo_adi('genis_tablo'), 'deneme_id'),
      hepsini_oku_tablo(durum.istemci, tablo_adi('tercihler'), 'katilimci_id'),
      hepsini_oku_tablo(durum.istemci, tablo_adi('islem_kaydi'), 'islem_id'),
    ]);
    durum.son_guncelleme = new Date();
    const imza = veri_imzasi(satirlar, tercihler, islemler);
    durum.satirlar = satirlar;
    durum.tercihler = tercihler;
    durum.islemler = islemler;
    if (zorla || imza !== durum.imza) {
      durum.imza = imza;
      sekmeyi_ciz();
    }
    durum_cubugunu_ciz();
  } catch (hata) {
    console.error(hata);
    if (hata?.code === 'PGRST301' || hata?.status === 401) { await cikis(); return; }
    bildir('Veri alınamadı. Bağlantıyı kontrol edin; panel yeniden deneyecek.', { hata: true });
    durum_cubugunu_ciz('Veri alınamadı');
  } finally {
    durum.yukleniyor = false;
  }
}

function otomatik_yenilemeyi_kur() {
  clearInterval(durum.zamanlayici);
  if (!durum.otomatik) return;
  durum.zamanlayici = setInterval(() => {
    if (document.visibilityState === 'visible' && !document.querySelector('.ortu')) yenile();
  }, YENILEME_MS);
}

// ---------------------------------------------------------------------
// Çizim
// ---------------------------------------------------------------------
let sekme_kabi = null;
let suzgec_kabi = null;
let sekme_cubugu = null;

function iskelet_ciz() {
  suzgec_kabi = el('div', { class: 'suzgecler' });
  sekme_cubugu = el('div', { class: 'sekmeler', role: 'tablist' });
  sekme_kabi = el('div', { role: 'tabpanel' });
  icerik.replaceChildren(suzgec_kabi, sekme_cubugu, sekme_kabi);
  suzgecleri_ciz();
  sekme_cubugunu_ciz();
}

function gorunumu_kaydet() {
  tercih_yaz({ demo: durum.demo, sekme: durum.sekme, olcu: durum.olcu, filtre: durum.filtre });
}

function suzgecleri_ciz() {
  const f = durum.filtre;
  const degistir = (alan) => (deger) => { durum.filtre = { ...durum.filtre, [alan]: deger }; gorunumu_kaydet(); sekmeyi_ciz(); };
  const hepsi = ['', 'Hepsi'];
  const tarih = (alan, etiket) => {
    const g = el('input', { type: 'date', value: f[alan] });
    g.addEventListener('change', () => degistir(alan)(g.value));
    return el('label', { class: 'alan' }, etiket, g);
  };
  const haric = el('input', { type: 'checkbox', checked: f.haric_goster });
  haric.addEventListener('change', () => degistir('haric_goster')(haric.checked));
  const sifirla = el('button', { type: 'button', class: 'dugme' }, 'Süzgeçleri sıfırla');
  sifirla.addEventListener('click', () => { durum.filtre = { ...BOS_FILTRE }; gorunumu_kaydet(); suzgecleri_ciz(); sekmeyi_ciz(); });

  suzgec_kabi.replaceChildren(
    secim('cihaz', 'Cihaz', [hepsi, ...Object.entries(ETIKETLER.cihaz)], f.cihaz, degistir('cihaz')),
    secim('yas_grubu', 'Yaş grubu', [hepsi, ...YAS_GRUPLARI.map((g) => [g, g])], f.yas_grubu, degistir('yas_grubu')),
    secim('cinsiyet', 'Cinsiyet', [hepsi, ...Object.entries(ETIKETLER.cinsiyet)], f.cinsiyet, degistir('cinsiyet')),
    secim('alisveris_sikligi', 'Alışveriş sıklığı', [hepsi, ...Object.entries(ETIKETLER.alisveris_sikligi)], f.alisveris_sikligi, degistir('alisveris_sikligi')),
    tarih('baslangic', 'Başlangıç tarihi'),
    tarih('bitis', 'Bitiş tarihi'),
    el('label', { class: 'alan-satir' }, haric, 'Hariç tutulanları göster'),
    sifirla,
  );
}

function sekme_cubugunu_ciz() {
  sekme_cubugu.replaceChildren(...SEKMELER.map(([kod, ad]) => {
    const d = el('button', { type: 'button', class: 'sekme', role: 'tab', 'aria-selected': String(kod === durum.sekme) }, ad);
    d.addEventListener('click', () => { durum.sekme = kod; gorunumu_kaydet(); sekme_cubugunu_ciz(); sekmeyi_ciz(); });
    return d;
  }));
}

/** Sekmelere verilen bağlam: süzülmüş veri ve işlemler. */
function baglam() {
  const satirlar = filtrele(durum.satirlar, durum.filtre);
  return {
    deney: durum.deney,
    demo: durum.demo,
    istemci: durum.istemci,
    filtre: durum.filtre,
    olcu: durum.olcu,
    satirlar,
    tum_satirlar: durum.satirlar,
    kisiler: katilimcilar(satirlar),
    tum_kisiler: katilimcilar(durum.satirlar),
    tercihler: durum.tercihler,
    islemler: durum.islemler,
    olcu_degistir: (v) => { durum.olcu = v; gorunumu_kaydet(); sekmeyi_ciz(); },
    yenile: () => yenile({ zorla: true }),
    yeniden_ciz: () => sekmeyi_ciz(),
    kullanici: durum.kullanici,
    otomatik_durdur: () => { durum.otomatik = false; otomatik_yenilemeyi_kur(); durum_cubugunu_ciz(); },
  };
}

function sekmeyi_ciz() {
  if (!sekme_kabi) return;
  const kaydirma = window.scrollY;
  grafikleri_temizle();
  const [, , ciz] = SEKMELER.find(([k]) => k === durum.sekme) ?? SEKMELER[0];
  ciz(sekme_kabi, baglam());
  window.scrollTo(0, kaydirma);
}

function durum_cubugunu_ciz(hata = null) {
  const veri_seti = el('div', { class: 'veri-seti', role: 'group', 'aria-label': 'Veri seti' },
    ...[[false, 'Gerçek veri'], [true, 'Demo verisi']].map(([demo, ad]) => {
      const d = el('button', { type: 'button', 'aria-pressed': String(durum.demo === demo) }, ad);
      d.addEventListener('click', () => {
        if (durum.demo === demo) return;
        durum.demo = demo;
        durum.imza = null;
        gorunumu_kaydet();
        yenile({ zorla: true });
      });
      return d;
    }));
  const oto = el('button', { type: 'button', class: 'dugme' }, durum.otomatik ? 'Otomatik yenilemeyi durdur' : 'Otomatik yenilemeyi başlat');
  oto.addEventListener('click', () => { durum.otomatik = !durum.otomatik; otomatik_yenilemeyi_kur(); durum_cubugunu_ciz(); });
  const simdi = el('button', { type: 'button', class: 'dugme' }, 'Şimdi yenile');
  simdi.addEventListener('click', () => yenile({ zorla: true }));
  const cik = el('button', { type: 'button', class: 'dugme' }, 'Çıkış');
  cik.addEventListener('click', cikis);
  const zaman = durum.son_guncelleme ? durum.son_guncelleme.toLocaleTimeString('tr-TR') : '—';
  ust_durum.replaceChildren(...[
    durum.demo ? el('span', { class: 'demo-etiketi' }, 'DEMO VERİSİ') : null,
    veri_seti,
    el('span', {}, hata ?? `Son güncelleme: ${zaman}${durum.otomatik ? ' · 10 sn\'de bir yenilenir' : ' · otomatik yenileme durdu'}`),
    simdi, oto,
    el('span', {}, durum.kullanici?.email ?? ''),
    cik,
  ].filter(Boolean));
}

baslat().catch((hata) => {
  console.error(hata);
  icerik.replaceChildren(el('p', { class: 'hata-metni' }, 'Panel yüklenemedi. Sayfayı yenileyin; sorun sürerse yapılandırmayı (yapilandirma/supabase.js) kontrol edin.'));
});
