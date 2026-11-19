// Karşılama ve onam ekranı.
// "Okudum, katılmayı kabul ediyorum" işaretlenmeden devam edilemez.

import { el, akis_ekrani, ekrani_goster } from '../ekran.js';

export function onam_goster(sahne) {
  return new Promise((coz) => {
    const kutu = el('input', { type: 'checkbox', id: 'onam-kutusu', 'data-oge': 'onam-kutusu' });
    const devam = el('button', { type: 'button', class: 'akis-buton', disabled: true, 'data-oge': 'onam-devam' }, 'Devam');

    kutu.addEventListener('change', () => { devam.disabled = !kutu.checked; });
    devam.addEventListener('click', () => { if (kutu.checked) coz(); });

    const ekran = akis_ekrani(
      el('h1', {}, 'Alışveriş sitesi deneyine hoş geldiniz'),
      el('p', {}, 'Bu çalışma bir üniversite araştırma projesinin parçasıdır. Bir alışveriş sitesinin farklı tasarımlarının ürün sayfasında nasıl kullanıldığını inceliyoruz.'),
      el('h2', {}, 'Ne yapacaksınız?'),
      el('ul', {},
        el('li', {}, 'Önce birkaç kısa soruyu yanıtlayacaksınız.'),
        el('li', {}, 'Ardından kurgusal bir mağazada, size söylenen ürünü sepete ekleyeceksiniz. Bir alıştırmadan sonra 6 kısa görev vardır.'),
        el('li', {}, 'Çalışma yaklaşık 5–10 dakika sürer.')),
      el('h2', {}, 'Haklarınız ve gizlilik'),
      el('ul', {},
        el('li', {}, 'Katılım tamamen gönüllüdür. İstediğiniz an sayfayı kapatarak bırakabilirsiniz.'),
        el('li', {}, 'Adınız, e-posta adresiniz veya başka bir kimlik bilginiz sorulmaz ve toplanmaz.'),
        el('li', {}, 'Görevler sırasında sayfadaki tıklama, dokunma, imleç ve kaydırma hareketleriniz ile süreler kaydedilir.'),
        el('li', {}, 'Uygulama IP adresinizi kaydetmez; barındırma hizmetleri kendi güvenlik günlüklerini tutabilir.'),
        el('li', {}, 'Sonunda size kısa bir katılımcı kodu verilir. Verilerinizin silinmesini isterseniz bu kodu araştırma ekibine iletmeniz yeterlidir.')),
      el('label', { class: 'onay-kutusu', for: 'onam-kutusu' }, kutu, el('span', {}, 'Okudum, katılmayı kabul ediyorum')),
      el('div', { class: 'akis-dugmeler' }, devam),
    );
    ekrani_goster(sahne, ekran);
  });
}
