// Ön anket ekranı. Sorular ve doğrulama js/anket.js'tedir.

import { el, akis_ekrani, ekrani_goster } from '../ekran.js';
import { ANKET_SORULARI, anket_dogrula } from '../anket.js';

/**
 * @returns {Promise<object>} doğrulanmış anket yanıtları (veritabanı kodlarıyla)
 */
export function anket_goster(sahne) {
  return new Promise((coz) => {
    const hata_kutulari = {};
    const form = el('form', { novalidate: true, 'data-oge': 'anket-formu' });

    for (const soru of ANKET_SORULARI) {
      const hata = el('p', { class: 'alan-hatasi gizli', id: `hata-${soru.alan}`, role: 'alert' });
      hata_kutulari[soru.alan] = hata;

      // Bütün sorular seçeneklidir (radyo düğmeleri).
      const secenekler = el('div', { class: 'secenekler' });
      for (const [kod, etiket] of soru.secenekler) {
        secenekler.append(el('label', { class: 'secenek' },
          el('input', { type: 'radio', name: soru.alan, value: kod, 'data-oge': `soru-${soru.alan}-${kod}` }),
          el('span', {}, etiket)));
      }
      form.append(el('fieldset', { class: 'soru', 'aria-describedby': `hata-${soru.alan}` },
        el('legend', {}, soru.baslik), secenekler, hata));
    }

    const genel_hata = el('p', { class: 'form-hatasi gizli', role: 'alert' }, 'Lütfen işaretli soruları yanıtlayın.');
    form.append(genel_hata,
      el('div', { class: 'akis-dugmeler' },
        el('button', { type: 'submit', class: 'akis-buton', 'data-oge': 'anket-devam' }, 'Devam')));

    form.addEventListener('submit', (olay) => {
      olay.preventDefault();
      const veri = new FormData(form);
      const yanitlar = Object.fromEntries(ANKET_SORULARI.map((s) => [s.alan, veri.get(s.alan)]));
      const { gecerli, hatalar, temiz } = anket_dogrula(yanitlar);

      for (const [alan, kutu] of Object.entries(hata_kutulari)) {
        kutu.textContent = hatalar[alan] ?? '';
        kutu.classList.toggle('gizli', !hatalar[alan]);
      }
      genel_hata.classList.toggle('gizli', gecerli);
      if (gecerli) coz(temiz);
    });

    ekrani_goster(sahne, akis_ekrani(
      el('h1', {}, 'Birkaç kısa soru'),
      el('p', {}, 'Yanıtlarınız yalnızca araştırma için, kimliğinizle ilişkilendirilmeden kullanılır.'),
      form,
    ));
  });
}
