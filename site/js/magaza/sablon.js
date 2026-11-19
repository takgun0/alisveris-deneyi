// Mağaza ürün sayfası şablonu ("Tivana").
//
// Her cihaz türü için TEK şablon vardır; 6 versiyon yapılandırmayla oluşur:
//   { cihaz: 'mobil', konum: 'K2', renk: 'R3', urun: 'termos' }
//
// DEĞİŞMEZ (proje kuralı): Versiyonlar arasında yalnızca şunlar değişir:
//   - hedef butonun dolgu rengi           (--buton-dolgu)
//   - hedef butonun bulunduğu yuva         (K1 → Yuva 1, K2 → Yuva 2)
//   - dört vurgu öğesinin dolgu rengi      (--vurgu-dolgu)
//   - mobil alt çubuğun varlığı            (yalnızca mobil K2)
// Bu dosyada koşula (konum/renk) bağlı başka hiçbir dal YOKTUR; yeni bir dal
// eklerken değişmezlik testinin (testler/e2e) geçtiğinden emin olun.
//
// Tanınabilir her öğe bir data-oge kimliği taşır; olay kaydındaki
// hedef_oge alanı bu kimliktir. data-tiklanabilir işaretli öğeler
// tıklanabilir görünür; hedef buton dışındakilere yapılan tıklamalar
// hatalı tıklama sayılır (bkz. site/js/ozet.js).
//
// GÜVENLİK: Metinler yalnızca textContent ile yazılır.

import { el } from '../ekran.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Küçük satır içi SVG ikonu (yalnızca çizgi; metin yok). */
function ikon(yollar, sinif = '') {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  if (sinif) svg.setAttribute('class', sinif);
  for (const d of yollar) {
    const yol = document.createElementNS(SVG_NS, 'path');
    yol.setAttribute('d', d);
    if (sinif === 'kalp-ikon') yol.setAttribute('class', 'kalp');
    svg.appendChild(yol);
  }
  return svg;
}

const IKONLAR = {
  menu: ['M4 6h16', 'M4 12h16', 'M4 18h16'],
  arama: ['M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z', 'M20 20l-4-4'],
  sepet: ['M3 4h2l2.4 10.2a1 1 0 0 0 1 .8h8.9a1 1 0 0 0 1-.8L20 8H6.2', 'M9 20h.01', 'M17 20h.01'],
  kalp: ['M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z'],
};

/** Fiyatı Türkçe biçimde yazar: 849 → "849 TL" */
export function fiyat_metni(fiyat_tl) {
  return `${fiyat_tl.toLocaleString('tr-TR')} TL`;
}

/**
 * Ürün sayfasını oluşturur.
 *
 * @param {object} p
 * @param {'masaustu'|'mobil'} p.cihaz
 * @param {{konum: 'K1'|'K2', renk: 'R0'|'R1'|'R2'|'R3'}} p.kosul
 * @param {{kod: string, ad: string, fiyat_tl: number}} p.urun    deney.json'daki ürün
 * @param {object} p.icerik   icerik/urunler.json'daki ürün içeriği
 * @param {object} p.renkler  deney.json > renkler
 * @param {boolean} [p.onizleme=false] tercih sorusu için etkileşimsiz kopya
 * @returns {{dugum: HTMLElement, hedef_buton: HTMLButtonElement, vazgec_butonu: HTMLButtonElement}}
 */
export function magaza_sayfasi_olustur({ cihaz, kosul, urun, icerik, renkler, onizleme = false }) {
  const masaustu = cihaz === 'masaustu';

  // ---- Koşula bağlı tek yer: iki renk değişkeni ----
  const kok = el('div', {
    class: `magaza ${masaustu ? 'magaza-masaustu' : 'magaza-mobil'}`,
    'data-cihaz': cihaz,
    'data-konum': kosul.konum,
    'data-renk': kosul.renk,
  });
  kok.style.setProperty('--buton-dolgu', renkler.buton[kosul.renk]);
  kok.style.setProperty('--vurgu-dolgu', renkler.vurgu[kosul.renk]);

  // ---- Hedef buton ----
  const hedef_buton = el('button', {
    type: 'button', class: 'hedef-buton', 'data-oge': 'hedef-buton',
  }, 'Sepete Ekle');

  // ---- Üst çubuk (tıklanabilir görünür, hiçbir yere götürmez) ----
  const ust = el('header', { class: 'ust-cubuk', 'data-oge': 'ust-cubuk' },
    el('div', { class: `ust-cubuk-ic${masaustu ? ' sabit-genislik' : ''}` },
      el('button', { type: 'button', class: 'ust-dugme menu-butonu', 'data-oge': 'menu-butonu', 'data-tiklanabilir': true, 'aria-label': 'Menü' },
        ikon(IKONLAR.menu), masaustu ? 'Kategoriler' : null),
      el('button', { type: 'button', class: 'ust-dugme magaza-logosu', 'data-oge': 'magaza-logosu', 'data-tiklanabilir': true }, 'Tivana'),
      el('div', { class: 'arama-kutusu', role: 'search', 'data-oge': 'arama-kutusu', 'data-tiklanabilir': true },
        ikon(IKONLAR.arama), el('span', {}, masaustu ? 'Ürün, kategori veya marka ara' : 'Ürün ara')),
      el('button', { type: 'button', class: 'ust-dugme sepet-simgesi', 'data-oge': 'sepet-simgesi', 'data-tiklanabilir': true, 'aria-label': 'Sepetim' },
        ikon(IKONLAR.sepet))));

  // ---- Vurgu öğeleri (her koşulda aynı yer, boyut, metin) ----
  const kampanya = el('div', { class: `kampanya-bandi vurgu${masaustu ? ' sabit-genislik' : ''}`, 'data-oge': 'kampanya-bandi' },
    'Kasım fırsatları: seçili ürünlerde %20 indirim');
  const kategori = el('span', { class: 'kategori-vurgusu vurgu', 'data-oge': 'kategori-vurgusu' }, icerik.kategori);
  const rozetler = el('div', { class: 'rozetler', 'data-oge': 'rozetler' },
    el('span', { class: 'indirim-etiketi vurgu', 'data-oge': 'indirim-etiketi' }, '%20 indirim'),
    el('span', { class: 'kargo-rozeti vurgu', 'data-oge': 'kargo-rozeti' }, 'Hızlı kargo'));

  // ---- Ürün bilgileri ----
  const ad = el('h1', { class: 'urun-adi', 'data-oge': 'urun-adi' }, urun.ad);
  const fiyat = el('p', { class: 'fiyat', 'data-oge': 'fiyat' }, fiyat_metni(urun.fiyat_tl));
  const kisa = el('p', { class: 'kisa-aciklama', 'data-oge': 'kisa-aciklama' }, icerik.kisa_aciklama);
  const gorsel = el('figure', { class: 'urun-gorseli', 'data-oge': 'urun-gorseli' },
    el('img', {
      src: `gorseller/urunler/${urun.kod}.svg`, alt: urun.ad, width: 400, height: 400,
      draggable: 'false', decoding: 'sync',
    }));

  // ---- Sade gri öğeler: Favorilere ekle, adet seçici, Vazgeç ----
  const favori = el('button', {
    type: 'button', class: 'gri-oge favori-butonu', 'data-oge': 'favori-butonu',
    'data-tiklanabilir': true, 'aria-pressed': 'false',
  }, ikon(IKONLAR.kalp, 'kalp-ikon'), 'Favorilere ekle');
  const adet_degeri = el('span', { class: 'adet-degeri', 'data-oge': 'adet-degeri', 'aria-live': 'polite' }, '1');
  const azalt = el('button', { type: 'button', 'data-oge': 'adet-azalt', 'data-tiklanabilir': true, 'aria-label': 'Adedi azalt' }, '−');
  const artir = el('button', { type: 'button', 'data-oge': 'adet-artir', 'data-tiklanabilir': true, 'aria-label': 'Adedi artır' }, '+');
  const adet = el('div', { class: 'gri-oge adet-secici', 'data-oge': 'adet-secici' }, azalt, adet_degeri, artir);
  const vazgec_butonu = el('button', {
    type: 'button', class: 'gri-oge vazgec-butonu', 'data-oge': 'vazgec-butonu', 'data-tiklanabilir': true,
  }, 'Vazgeç');
  const islem = el('div', { class: 'islem-satiri', 'data-oge': 'islem-satiri' }, favori, adet, vazgec_butonu);

  if (!onizleme) {
    // Favori ve adet seçici çalışır ama görevi etkilemez. Metin ve boyut değişmez.
    favori.addEventListener('click', () => {
      favori.setAttribute('aria-pressed', String(favori.getAttribute('aria-pressed') !== 'true'));
    });
    let sayi = 1;
    azalt.addEventListener('click', () => { sayi = Math.max(1, sayi - 1); adet_degeri.textContent = String(sayi); });
    artir.addEventListener('click', () => { sayi = Math.min(10, sayi + 1); adet_degeri.textContent = String(sayi); });
  }

  // ---- Yuvalar: ikisi de her koşulda var ve aynı yüksekliği kaplar ----
  const yuva_1 = el('div', { class: 'yuva yuva-1', 'data-oge': 'yuva-1' });
  const yuva_2 = el('div', { class: 'yuva yuva-2', 'data-oge': 'yuva-2' });
  (kosul.konum === 'K1' ? yuva_1 : yuva_2).appendChild(hedef_buton);

  const teslimat_icerigi = [
    el('h2', { class: 'teslimat-basligi' }, 'Teslimat ve iade bilgisi'),
    el('ul', { class: 'teslimat-listesi' },
      el('li', {}, 'Saat 15.00\'e kadar verilen siparişler aynı gün kargoda.'),
      el('li', {}, '500 TL ve üzeri siparişlerde kargo ücretsiz.'),
      el('li', {}, '14 gün içinde ücretsiz iade.')),
  ];

  // ---- Alt bölümler: açıklama, teknik özellikler, kullanım ve bakım ----
  const alt_bolumler = [
    el('section', { class: 'alt-bolum', 'data-oge': 'aciklama' },
      el('h2', {}, 'Ürün açıklaması'),
      icerik.aciklama.map((p) => el('p', {}, p))),
    el('section', { class: 'alt-bolum', 'data-oge': 'ozellikler' },
      el('h2', {}, 'Teknik özellikler'),
      el('table', { class: 'ozellik-tablosu' },
        el('tbody', {}, icerik.ozellikler.map(([baslik, deger]) =>
          el('tr', {}, el('th', { scope: 'row' }, baslik), el('td', {}, deger)))))),
    el('section', { class: 'alt-bolum', 'data-oge': 'bakim' },
      el('h2', {}, 'Kullanım ve bakım'),
      el('ul', {}, icerik.bakim.map((m) => el('li', {}, m)))),
  ];
  const alt_bilgi = el('footer', { class: 'alt-bilgi', 'data-oge': 'alt-bilgi' },
    'Tivana kurgusal bir mağazadır; bu sayfa bir araştırma için hazırlanmıştır.');

  // ---- İskelet ----
  if (masaustu) {
    // Üstte solda görsel, ortada bilgi alanı, sağda yan panel; altta açıklama.
    // Favori/adet/Vazgeç fiyatın üstündedir; Yuva 1 bilgi alanının son öğesidir.
    kok.append(
      ust,
      kampanya,
      el('main', { class: 'urun-alani sabit-genislik', 'data-oge': 'urun-alani' },
        el('div', { class: 'urun-karti', 'data-oge': 'urun-karti' },
          gorsel,
          el('div', { class: 'bilgi-alani', 'data-oge': 'bilgi-alani' },
            kategori, ad, rozetler, kisa, islem, fiyat, yuva_1),
          el('aside', { class: 'yan-panel', 'data-oge': 'teslimat-paneli' },
            yuva_2, ...teslimat_icerigi)),
        el('div', { class: 'alt-bolumler sabit-genislik' }, alt_bolumler)),
      alt_bilgi,
    );
  } else {
    // Tek sütun. Yuva 1 bilerek ürün görselinin ÜSTÜNDEDİR (K1 ekranın üst
    // yarısında, K2 en altta kalsın diye). Bu sırayı değiştirmeyin.
    const parcalar = [
      ust,
      kampanya,
      el('main', { class: 'urun-alani', 'data-oge': 'urun-alani' },
        kategori, ad, rozetler, fiyat, yuva_1, gorsel, kisa, islem,
        el('section', { class: 'teslimat', 'data-oge': 'teslimat-paneli' }, ...teslimat_icerigi)),
      ...alt_bolumler,
      alt_bilgi,
      el('div', { class: 'alt-bosluk', 'data-oge': 'alt-bosluk' }),
    ];
    // Alt çubuk yalnızca K2'de vardır; içinde Yuva 2 bulunur.
    if (kosul.konum === 'K2') {
      parcalar.push(el('div', { class: 'alt-cubuk', 'data-oge': 'alt-cubuk' }, yuva_2));
    }
    kok.append(...parcalar);
  }

  return { dugum: kok, hedef_buton, vazgec_butonu };
}
