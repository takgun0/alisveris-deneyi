// Tercih sorusu: o cihaz türündeki 6 versiyonun küçük önizlemeleri karışık
// sırayla gösterilir. Katılımcı en çok ve en az beğendiğini seçer (ikisi aynı
// olamaz) ve isteğe bağlı olarak "Neden?" sorusunu yanıtlar (en çok 500 karakter).
//
// Önizlemeler ayrı görsel değildir: aynı mağaza şablonunun ilk ekranının
// küçültülmüş, etkileşimsiz halidir ve hepsi alıştırma ürününü gösterir.

import { el, ekrani_goster } from '../ekran.js';
import { magaza_sayfasi_olustur } from '../magaza/sablon.js';

/** Kriptografik rastgelelikle Fisher–Yates karıştırma. */
export function karistir(dizi) {
  const sonuc = [...dizi];
  const rastgele = new Uint32Array(sonuc.length);
  crypto.getRandomValues(rastgele);
  for (let i = sonuc.length - 1; i > 0; i--) {
    const j = rastgele[i] % (i + 1);
    [sonuc[i], sonuc[j]] = [sonuc[j], sonuc[i]];
  }
  return sonuc;
}

// İlk ekran boyutları ve küçültme oranları.
const ILK_EKRAN = {
  masaustu: { genislik: 1024, yukseklik: 600, olcek: 0.28 },
  mobil: { genislik: 360, yukseklik: 560, olcek: 0.4 },
};

function onizleme_olustur({ cihaz, kosul, deney, icerik }) {
  const boyut = ILK_EKRAN[cihaz];
  const { dugum } = magaza_sayfasi_olustur({
    cihaz,
    kosul,
    urun: deney.alistirma_urunu,
    icerik: icerik[deney.alistirma_urunu.kod],
    renkler: deney.renkler,
    onizleme: true,
  });
  const cerceve = el('div', { class: 'onizleme-cerceve', 'aria-hidden': 'true' }, dugum);
  cerceve.inert = true;
  cerceve.style.width = `${boyut.genislik}px`;
  cerceve.style.height = `${boyut.yukseklik}px`;
  cerceve.style.transform = `scale(${boyut.olcek})`;
  const kutu = el('div', { class: 'onizleme-kutusu' }, cerceve);
  kutu.style.width = `${Math.round(boyut.genislik * boyut.olcek)}px`;
  kutu.style.height = `${Math.round(boyut.yukseklik * boyut.olcek)}px`;
  return kutu;
}

/**
 * @param {HTMLElement} sahne
 * @param {object} p
 * @param {'masaustu'|'mobil'} p.cihaz
 * @param {string[]} p.gosterim_sirasi karıştırılmış 6 koşul kodu
 * @returns {Promise<{en_cok_kosul: string, en_az_kosul: string, neden: string|null, gosterim_sirasi: string[]}>}
 */
export function tercih_goster(sahne, { cihaz, gosterim_sirasi, deney, icerik }) {
  return new Promise((coz) => {
    const secim = { en_cok: null, en_az: null };
    const dugmeler = []; // { kod, tur, dugme }
    const devam = el('button', { type: 'button', class: 'akis-buton', disabled: true, 'data-oge': 'tercih-devam' }, 'Devam');

    const guncelle = () => {
      for (const { kod, tur, dugme } of dugmeler) {
        dugme.setAttribute('aria-pressed', String(secim[tur] === kod));
      }
      devam.disabled = !(secim.en_cok && secim.en_az && secim.en_cok !== secim.en_az);
    };

    const kartlar = gosterim_sirasi.map((kod, sira) => {
      const kosul = deney.kosullar.find((k) => k.kod === kod);
      const en_cok = el('button', { type: 'button', class: 'tercih-dugmesi', 'aria-pressed': 'false', 'data-oge': `tercih-en-cok-${sira + 1}` }, 'En çok beğendim');
      const en_az = el('button', { type: 'button', class: 'tercih-dugmesi', 'aria-pressed': 'false', 'data-oge': `tercih-en-az-${sira + 1}` }, 'En az beğendim');
      en_cok.addEventListener('click', () => {
        secim.en_cok = kod;
        if (secim.en_az === kod) secim.en_az = null; // ikisi aynı olamaz
        guncelle();
      });
      en_az.addEventListener('click', () => {
        secim.en_az = kod;
        if (secim.en_cok === kod) secim.en_cok = null;
        guncelle();
      });
      dugmeler.push({ kod, tur: 'en_cok', dugme: en_cok }, { kod, tur: 'en_az', dugme: en_az });
      return el('div', { class: 'tercih-karti', 'data-oge': `tercih-karti-${sira + 1}` },
        el('p', { class: 'tercih-etiketi' }, `Tasarım ${sira + 1}`),
        onizleme_olustur({ cihaz, kosul, deney, icerik }),
        el('div', { class: 'tercih-dugmeleri' }, en_cok, en_az));
    });

    const neden = el('textarea', {
      id: 'tercih-neden', maxlength: 500, rows: 3, class: 'metin-alani', 'data-oge': 'tercih-neden',
    });
    const sayac = el('p', { class: 'karakter-sayaci' }, '0 / 500');
    neden.addEventListener('input', () => { sayac.textContent = `${neden.value.length} / 500`; });

    devam.addEventListener('click', () => {
      if (devam.disabled) return;
      const metin = neden.value.trim().slice(0, 500);
      coz({
        en_cok_kosul: secim.en_cok,
        en_az_kosul: secim.en_az,
        neden: metin === '' ? null : metin,
        gosterim_sirasi: [...gosterim_sirasi],
      });
    });

    const ekran = el('section', { class: 'akis' }, el('div', { class: 'akis-kart akis-kart-genis' },
      el('h1', {}, 'Son bir soru'),
      el('p', {}, 'Görevlerde aynı mağazanın farklı tasarımlarını gördünüz. Aşağıda bu tasarımlar küçültülmüş olarak yer alıyor. En çok ve en az beğendiğiniz tasarımı seçin.'),
      el('div', { class: `tercih-izgarasi tercih-${cihaz}` }, kartlar),
      el('label', { class: 'soru-baslik', for: 'tercih-neden' }, 'Neden? (isteğe bağlı)'),
      neden, sayac,
      el('div', { class: 'akis-dugmeler' }, devam)));
    ekrani_goster(sahne, ekran);
  });
}
