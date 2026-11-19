// Ekran altyapısı: DOM oluşturma, ekran değiştirme (sıfır noktası) ve
// işaretçi (fare/parmak) tıklaması.
//
// GÜVENLİK: Metinler yalnızca textContent ile yazılır; innerHTML kullanılmaz.

/**
 * Küçük DOM yardımcısı.
 *   el('button', { class: 'akis-buton', type: 'button', 'data-oge': 'basla-butonu' }, 'Başla')
 * Özellikler setAttribute ile yazılır; 'style' özelliği kullanılmaz (CSP).
 * Çocuklar dizi, düğüm veya metin olabilir; metinler textContent olarak eklenir.
 */
export function el(etiket, ozellikler = {}, ...cocuklar) {
  const dugum = document.createElement(etiket);
  for (const [ad, deger] of Object.entries(ozellikler ?? {})) {
    if (deger === false || deger === null || deger === undefined) continue;
    if (ad === 'metin') dugum.textContent = deger;
    else dugum.setAttribute(ad, deger === true ? '' : String(deger));
  }
  ekle(dugum, cocuklar);
  return dugum;
}

function ekle(dugum, cocuklar) {
  for (const cocuk of cocuklar) {
    if (cocuk === null || cocuk === undefined || cocuk === false) continue;
    if (Array.isArray(cocuk)) ekle(dugum, cocuk);
    else if (cocuk instanceof Node) dugum.appendChild(cocuk);
    else dugum.appendChild(document.createTextNode(String(cocuk)));
  }
}

/** Bir sonraki animasyon karesinin zamanını döndürür (performance.now tabanı). */
export function kare_bekle() {
  return new Promise((coz) => requestAnimationFrame(coz));
}

/**
 * Ekranı değiştirir ve SIFIR NOKTASINI döndürür.
 *
 * Sıfır noktası: ekrandaki tüm görseller çözüldükten ve ekran çizildikten
 * sonraki an. Adımlar:
 *   1. yeni ekrandaki görseller decode() ile çözülür,
 *   2. ekran sahneye eklenir ve kaydırma en üste alınır,
 *   3. art arda iki requestAnimationFrame beklenir;
 *      ikinci karenin zaman damgası sıfırdır.
 *
 * @param {HTMLElement} sahne
 * @param {HTMLElement} dugum yeni ekran
 * @returns {Promise<number>} sıfır noktası (performance.now zaman tabanı, ms)
 */
export async function ekrani_goster(sahne, dugum) {
  const gorseller = [...dugum.querySelectorAll('img')];
  await Promise.all(gorseller.map((g) => g.decode().catch(() => {})));
  sahne.replaceChildren(dugum);
  window.scrollTo(0, 0);
  await kare_bekle();
  return kare_bekle();
}

/**
 * İşaretçi tıklaması: pointerdown ve pointerup ikisi de öğenin üzerindeyse
 * geri çağırır. Fare ve parmak aynı kodla ölçülür.
 *  - Yalnızca birincil düğme (sol tık / tek parmak) sayılır.
 *  - pointercancel (ör. kaydırma başlatan dokunuş) basışı iptal eder.
 *  - Klavye (Enter/Boşluk) tetiklemez: 'click' dinlenmez.
 *
 * Dokunmatik ekranlarda tarayıcı, pointerdown'da işaretçiyi öğeye "yakalar";
 * böylece parmak dışarı kaysa bile pointerup öğede görünür. Yakalamayı
 * bırakıyoruz ki pointerup gerçekten parmağın kalktığı öğede oluşsun.
 *
 * @param {HTMLElement} oge
 * @param {(olay: PointerEvent, basis_olayi: PointerEvent) => void} geri_cagir
 * @returns {() => void} dinleyicileri kaldıran fonksiyon
 */
export function isaretci_tiklamasi(oge, geri_cagir) {
  let basis = null;

  const asagi = (olay) => {
    if (!olay.isPrimary || olay.button !== 0) return;
    if (oge.hasPointerCapture?.(olay.pointerId)) oge.releasePointerCapture(olay.pointerId);
    basis = olay;
  };
  const yukari = (olay) => {
    if (!basis || olay.pointerId !== basis.pointerId) return;
    const onceki = basis;
    basis = null;
    if (oge.contains(olay.target)) geri_cagir(olay, onceki);
  };
  const iptal = (olay) => {
    if (basis && olay.pointerId === basis.pointerId) basis = null;
  };
  // Öğe dışında bırakılan basışlar için belge düzeyinde de dinlenir.
  const belge_yukari = (olay) => {
    if (basis && olay.pointerId === basis.pointerId && !oge.contains(olay.target)) basis = null;
  };

  oge.addEventListener('pointerdown', asagi);
  oge.addEventListener('pointerup', yukari);
  oge.addEventListener('pointercancel', iptal);
  document.addEventListener('pointerup', belge_yukari);
  return () => {
    oge.removeEventListener('pointerdown', asagi);
    oge.removeEventListener('pointerup', yukari);
    oge.removeEventListener('pointercancel', iptal);
    document.removeEventListener('pointerup', belge_yukari);
  };
}

/** Basit akış ekranı kabuğu: <section class="akis"><div class="akis-kart">…</div></section> */
export function akis_ekrani(...icerik) {
  return el('section', { class: 'akis' }, el('div', { class: 'akis-kart' }, ...icerik));
}
