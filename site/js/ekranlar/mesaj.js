// Genel bilgi ekranları: daha önce tamamlandı, gönderiliyor, teşekkür, hata.
// Katılımcı kodu yalnızca textContent ile yazılır.

import { el, akis_ekrani, ekrani_goster } from '../ekran.js';

export function onceden_tamamlandi_goster(sahne, katilimci_kodu) {
  return ekrani_goster(sahne, akis_ekrani(
    el('h1', { 'data-oge': 'onceden-tamamlandi' }, 'Bu cihazda deney daha önce tamamlandı'),
    el('p', {}, 'Katılımınız için teşekkür ederiz. Deneye her cihazdan yalnızca bir kez katılınabilir.'),
    katilimci_kodu ? el('p', {}, 'Katılımcı kodunuz: ', el('strong', { 'data-oge': 'katilimci-kodu' }, katilimci_kodu)) : null,
  ));
}

export function gonderiliyor_goster(sahne, { hata = false } = {}) {
  return ekrani_goster(sahne, akis_ekrani(
    el('h1', {}, 'Yanıtlarınız kaydediliyor…'),
    el('p', {}, hata
      ? 'Şu anda bağlantı kurulamıyor. Bağlantınız geldiğinde kendiliğinden yeniden denenecek; lütfen bu sayfayı kapatmayın.'
      : 'Lütfen bekleyin, bu birkaç saniye sürebilir.'),
  ));
}

export function tesekkur_goster(sahne, katilimci_kodu) {
  const ekran = akis_ekrani(
    el('h1', { 'data-oge': 'tesekkur' }, 'Teşekkür ederiz!'),
    el('p', {}, 'Deney tamamlandı ve yanıtlarınız kaydedildi.'),
    el('p', {}, 'Katılımcı kodunuz:'),
    el('p', { class: 'gorev-metni', 'data-oge': 'katilimci-kodu' }, katilimci_kodu),
    el('p', {}, 'İleride verilerinizin silinmesini isterseniz bu kodu araştırma ekibine iletmeniz yeterlidir. Kodunuzu not etmenizi öneririz.'),
    el('p', {}, 'Artık bu sayfayı kapatabilirsiniz.'),
  );
  ekran.classList.add('akis-ortali');
  return ekrani_goster(sahne, ekran);
}

/**
 * Hata ekranı; "Tekrar dene" düğmesine basılınca çözülür.
 */
export function hata_goster(sahne, mesaj) {
  return new Promise((coz) => {
    const dugme = el('button', { type: 'button', class: 'akis-buton', 'data-oge': 'tekrar-dene' }, 'Tekrar dene');
    dugme.addEventListener('click', () => coz());
    ekrani_goster(sahne, akis_ekrani(
      el('h1', {}, 'Bir sorun oluştu'),
      el('p', {}, mesaj),
      el('div', { class: 'akis-dugmeler' }, dugme),
    ));
  });
}
