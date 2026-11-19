// Demo modu (?demo=1): araştırma ekibinin siteyi denemesi ve sunması için.
//
//   - Ekranın üstünde sabit, 36 px yüksekliğinde bir şerit açılır. Şerit için
//     sayfanın üstünde aynı yükseklikte boşluk bırakılır; böylece şerit hiçbir
//     buton veya öğenin üstünü kapatmaz. Boşluk 6 versiyonda aynıdır.
//   - Canlı sayaç: Başla'dan itibaren net süre (duraklamalar çıkarılmış) ve kalan süre.
//   - Versiyon seçici: plan satırları arasında geçiş (yalnızca görev ekranında).
//   - Cihaz seçimi: otomatik / masaüstü / mobil. Değişince demo baştan başlar.
//   - Veriler test_ tablolarına yazılır (bütün çağrılarda p_demo = true).
//
// Bu modül yalnızca demo modunda dinamik olarak yüklenir; normal katılımcı
// sayfasında hiç bulunmaz.

import { el } from './ekran.js';
import { durumu_oku, durumu_yaz, durumu_sil, tamamlandi_anahtari } from './durum.js';
import { olcum_sil } from './deneme.js';

const CIHAZ_ANAHTARI = 'sepete_ekle_demo_cihaz_v1';
const SERIT_YUKSEKLIGI = 36;

/** Elle seçilen cihaz: 'otomatik' | 'masaustu' | 'mobil'. */
export function demo_cihaz_secimi() {
  try {
    const d = localStorage.getItem(CIHAZ_ANAHTARI);
    return d === 'masaustu' || d === 'mobil' ? d : 'otomatik';
  } catch {
    return 'otomatik';
  }
}

/** Otomatik tespiti elle seçimle değiştirir (seçim yoksa olduğu gibi döner). */
export function demo_cihazi_uygula(tespit) {
  const secim = demo_cihaz_secimi();
  if (secim === 'otomatik') return tespit;
  return { ...tespit, cihaz: secim, tablet_mi: false, tespit: { ...tespit.tespit, kural: 'demo_elle', otomatik_cihaz: tespit.cihaz } };
}

/** Demo verisini (durum, ölçüm, tamamlanma) siler ve sayfayı yeniden yükler. */
function demoyu_sifirla() {
  durumu_sil(true);
  olcum_sil(true);
  try { localStorage.removeItem(tamamlandi_anahtari(true)); } catch { /* yok say */ }
  location.reload();
}

function saniye(ms) {
  return (ms / 1000).toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/**
 * Demo şeridini kurar.
 * @returns {{ gozlemci: (olay: object) => void, durum_degisti: (durum: object) => void }}
 */
export function demo_seridini_kur({ deney }) {
  const stil = el('link', { rel: 'stylesheet', href: 'css/demo.css' });
  document.head.append(stil);
  document.body.classList.add('demo-modu');
  if (demo_cihaz_secimi() === 'mobil') document.body.classList.add('demo-mobil');
  document.documentElement.style.setProperty('--demo-serit', `${SERIT_YUKSEKLIGI}px`);

  const sayac_metni = el('span', { class: 'demo-sayac', 'aria-live': 'off' }, 'Sayaç: —');
  const son_sonuc = el('span', { class: 'demo-son' });

  const versiyon = el('select', { class: 'demo-secim', 'aria-label': 'Versiyon', disabled: true },
    el('option', {}, 'Versiyon: anketten sonra'));
  const cihaz = el('select', { class: 'demo-secim', 'aria-label': 'Cihaz' },
    ...[['otomatik', 'Cihaz: otomatik'], ['masaustu', 'Cihaz: masaüstü'], ['mobil', 'Cihaz: mobil']]
      .map(([deger, metin]) => el('option', { value: deger }, metin)));
  cihaz.value = demo_cihaz_secimi();
  const sifirla = el('button', { type: 'button', class: 'demo-dugme' }, 'Baştan başlat');

  cihaz.addEventListener('change', () => {
    try { localStorage.setItem(CIHAZ_ANAHTARI, cihaz.value); } catch { /* yok say */ }
    demoyu_sifirla();
  });
  sifirla.addEventListener('click', demoyu_sifirla);
  versiyon.addEventListener('change', () => {
    const durum = durumu_oku(true);
    if (!durum || durum.asama !== 'deneme') return;
    // Ölçüm başlamamışken plan içinde istenen denemeye atlanır.
    durumu_yaz(true, { ...durum, deneme_indeksi: Number(versiyon.value), deneme_adimi: 'gorev', deneme_sonucu: null });
    location.reload();
  });

  const serit = el('div', { class: 'demo-serit', role: 'region', 'aria-label': 'Demo denetimleri' },
    el('strong', { class: 'demo-etiket' }, 'DEMO'),
    sayac_metni, son_sonuc,
    el('span', { class: 'demo-bosluk' }),
    versiyon, cihaz, sifirla);
  document.body.prepend(serit);

  // Canlı sayaç: yalnızca ekranı günceller; ölçüme karışmaz (süre deneme
  // modülünün kendi sayacından okunur).
  let sayac = null;
  let cerceve = 0;
  const ciz = () => {
    if (!sayac) return;
    const t = performance.now();
    const durakli = sayac.durakli_mi ? ' (duraklatıldı)' : '';
    sayac_metni.textContent = `Süre: ${saniye(sayac.gecen_net(t))} sn · kalan ${saniye(sayac.kalan(t))} sn${durakli}`;
    cerceve = requestAnimationFrame(ciz);
  };

  return {
    gozlemci(olay) {
      if (olay.tur === 'basladi') {
        sayac = olay.sayac;
        versiyon.disabled = true;
        cihaz.disabled = true;
        sifirla.disabled = true;
        son_sonuc.textContent = '';
        cancelAnimationFrame(cerceve);
        cerceve = requestAnimationFrame(ciz);
      } else if (olay.tur === 'bitti') {
        cancelAnimationFrame(cerceve);
        sayac = null;
        cihaz.disabled = false;
        sifirla.disabled = false;
        sayac_metni.textContent = 'Sayaç: —';
        const sonuc = { basarili: 'eklendi', vazgecildi: 'vazgeçildi', zaman_asimi: 'süre doldu' }[olay.sonuc] ?? olay.sonuc;
        son_sonuc.textContent = `Son deneme: ${sonuc}, tıklama ${saniye(olay.sure_ms)} sn`;
      }
    },

    /** Akış her aşama değiştirdiğinde çağrılır; versiyon seçicisini günceller. */
    durum_degisti(durum) {
      const plan = durum.katilimci?.plan;
      if (!plan || durum.asama !== 'deneme') {
        versiyon.disabled = true;
        return;
      }
      versiyon.replaceChildren(...plan.map((p, i) => el('option', { value: String(i) },
        p.deneme_no === 0 ? `Alıştırma · ${p.kosul_kodu}` : `${p.deneme_no}. deneme · ${p.kosul_kodu} (${p.konum}, ${p.renk})`)));
      versiyon.value = String(durum.deneme_indeksi);
      // Geçiş yalnızca görev ekranında (ölçüm başlamadan) yapılabilir.
      versiyon.disabled = durum.deneme_adimi !== 'gorev';
    },
  };
}

export { SERIT_YUKSEKLIGI };
