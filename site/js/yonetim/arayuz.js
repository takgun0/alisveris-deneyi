// Yönetim paneli için küçük arayüz yardımcıları.
// GÜVENLİK: Bütün metinler textContent ile yazılır (el() yardımcısı); innerHTML yok.

import { el } from '../ekran.js';

export { el };

export const NOT_METNI = 'Bu ekran betimsel bir ön izlemedir; nihai istatistiksel analiz dışa aktarılan verilerle yapılacaktır.';

/** Her tablo ve grafiğin altına konan not. */
export const not = () => el('p', { class: 'not' }, NOT_METNI);

/** Sayıyı Türkçe biçimde yazar. */
export function sayi(v, basamak = 0) {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  return v.toLocaleString('tr-TR', { minimumFractionDigits: basamak, maximumFractionDigits: basamak });
}

export const yuzde = (pay, payda) => (payda ? `%${sayi((100 * pay) / payda, 1)}` : '—');

export const aralik_yaz = (a, basamak = 0) => (a ? `[${sayi(a[0], basamak)}–${sayi(a[1], basamak)}]` : '');

/**
 * Tablo oluşturur.
 * @param {(string|{metin: string, sayi?: boolean})[]} basliklar
 * @param {Array<Array<string|number|Node|{metin?: string, dugum?: Node, sayi?: boolean}>>} satirlar
 * @param {{satir_sinifi?: (i: number) => string|null}} [secenek]
 */
export function tablo(basliklar, satirlar, { satir_sinifi = null } = {}) {
  const bas = el('tr', {}, basliklar.map((b) => {
    const h = typeof b === 'string' ? { metin: b } : b;
    return el('th', { class: h.sayi ? 'sayi' : null, scope: 'col' }, h.metin);
  }));
  const govde = satirlar.map((s, i) => el('tr', { class: satir_sinifi?.(i) ?? null }, s.map((h) => {
    if (h instanceof Node) return el('td', {}, h);
    if (h !== null && typeof h === 'object') return el('td', { class: h.sayi ? 'sayi' : null }, h.dugum ?? h.metin ?? '');
    return el('td', { class: typeof h === 'number' ? 'sayi' : null }, typeof h === 'number' ? sayi(h) : (h ?? ''));
  })));
  return el('div', { class: 'tablo-kabi' }, el('table', { class: 'tablo' }, el('thead', {}, bas), el('tbody', {}, govde)));
}

export function kart(baslik, deger, ek = null) {
  return el('div', { class: 'kart' },
    el('p', { class: 'kart-baslik' }, baslik),
    el('p', { class: 'kart-deger' }, String(deger)),
    ek ? el('p', { class: 'kart-ek' }, ek) : null);
}

export function bolum(baslik, ...icerik) {
  return el('section', { class: 'bolum' }, el('h2', {}, baslik), ...icerik);
}

/** Seçim kutusu: secenekler [[deger, etiket], ...] */
export function secim(ad, etiket, secenekler, deger, degisti) {
  const s = el('select', { name: ad, 'aria-label': etiket },
    secenekler.map(([d, e]) => el('option', { value: d, selected: d === deger }, e)));
  s.addEventListener('change', () => degisti(s.value));
  return el('label', { class: 'alan' }, etiket, s);
}

let bildirim_zamanlayici = null;
/** Sağ altta kısa bildirim. */
export function bildir(metin, { hata = false } = {}) {
  document.querySelector('.bildirim')?.remove();
  clearTimeout(bildirim_zamanlayici);
  const b = el('div', { class: `bildirim${hata ? ' bildirim-hata' : ''}`, role: 'status' }, metin);
  document.body.append(b);
  bildirim_zamanlayici = setTimeout(() => b.remove(), hata ? 8000 : 4000);
}

/**
 * Onay penceresi. dogrulama_metni verilirse kullanıcının o metni aynen
 * yazması istenir (kalıcı silme için ikinci onay).
 * @returns {Promise<boolean>}
 */
export function onay_iste({ baslik, metin, onay_etiketi = 'Onayla', tehlikeli = false, dogrulama_metni = null }) {
  return new Promise((coz) => {
    const giris = dogrulama_metni ? el('input', { type: 'text', autocomplete: 'off', 'aria-label': 'Doğrulama metni' }) : null;
    const onay = el('button', { type: 'button', class: `dugme ${tehlikeli ? 'dugme-tehlike' : 'dugme-ana'}`, disabled: Boolean(dogrulama_metni) }, onay_etiketi);
    const vazgec = el('button', { type: 'button', class: 'dugme' }, 'Vazgeç');
    const ortu = el('div', { class: 'ortu', role: 'dialog', 'aria-modal': 'true' },
      el('div', { class: 'pencere' },
        el('h2', {}, baslik),
        ...(Array.isArray(metin) ? metin : [metin]).map((m) => el('p', { class: 'bilgi-metni' }, m)),
        giris ? el('label', { class: 'alan' }, `Onaylamak için şunu yazın: ${dogrulama_metni}`, giris) : null,
        el('div', { class: 'pencere-dugmeleri' }, vazgec, onay)));
    giris?.addEventListener('input', () => { onay.disabled = giris.value.trim() !== dogrulama_metni; });
    const bitir = (sonuc) => { ortu.remove(); coz(sonuc); };
    onay.addEventListener('click', () => bitir(true));
    vazgec.addEventListener('click', () => bitir(false));
    ortu.addEventListener('keydown', (o) => { if (o.key === 'Escape') bitir(false); });
    document.body.append(ortu);
    (giris ?? vazgec).focus();
  });
}

/** Isı haritası hücresi için arka plan rengi (açık maviden koyu maviye). */
export function isi_rengi(oran) {
  const o = Math.max(0, Math.min(1, oran));
  const isik = 94 - o * 56; // %94 → %38
  return { arka: `hsl(210 60% ${isik}%)`, yazi: isik < 60 ? '#FFFFFF' : '#102A43' };
}
