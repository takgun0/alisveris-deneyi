// Tarayıcı geçmişi ve sayfadan ayrılma koruması.
//
// Tek sayfalık uygulamada ekranlar adres değişmeden değişir. Geri tuşu
// akışı bozmasın diye geçmişe bir "tampon" kayıt eklenir; geri tuşuna
// basıldığında (popstate) tampon yeniden eklenir ve ekran değişmez.
//
// Sayfadan ayrılma (kapatma, yenileme, başka adrese gitme) denenirse
// tarayıcının standart uyarısı çıkar.

export function geri_tusunu_kilitle() {
  history.pushState({ deney: true }, '');
  window.addEventListener('popstate', () => {
    history.pushState({ deney: true }, '');
  });
  // Bazı tarayıcılar kullanıcı etkileşimi olmadan eklenen geçmiş kayıtlarını
  // geri tuşunda atlar; ilk dokunuşta tampon bir kez daha eklenir.
  document.addEventListener('pointerdown', () => history.pushState({ deney: true }, ''), { once: true });
}

let ayrilma_dinleyicisi = null;

export function ayrilma_uyarisini_ac() {
  if (ayrilma_dinleyicisi) return;
  ayrilma_dinleyicisi = (olay) => {
    olay.preventDefault();
    olay.returnValue = ''; // eski tarayıcılar için
  };
  window.addEventListener('beforeunload', ayrilma_dinleyicisi);
}

export function ayrilma_uyarisini_kapat() {
  if (!ayrilma_dinleyicisi) return;
  window.removeEventListener('beforeunload', ayrilma_dinleyicisi);
  ayrilma_dinleyicisi = null;
}
