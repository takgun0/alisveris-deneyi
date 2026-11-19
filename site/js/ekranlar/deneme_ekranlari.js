// Bir denemenin ürün sayfası dışındaki ekranları:
//   görev ekranı → (ürün sayfası) → "ürün sepetinize eklendi" → zorluk sorusu
// ve "süre doldu" bildirimi, Vazgeç onay penceresi.

import { el, akis_ekrani, ekrani_goster, isaretci_tiklamasi } from '../ekran.js';

/**
 * Görev ekranı: "[Ürün adı] ürününü sepetinize ekleyin.", "Görev n / 6", "Başla".
 * @returns {Promise<{sifir: number, basla_olayi: PointerEvent}>}
 *   basla_olayi.timeStamp denemenin başlangıcıdır (zaman_ms = 0).
 */
export async function gorev_goster(sahne, { urun_adi, deneme_no, toplam, alistirma_mi, sifir_alindi = null }) {
  const basla = el('button', { type: 'button', class: 'akis-buton', 'data-oge': 'basla-butonu' }, 'Başla');
  const ust = alistirma_mi ? 'Alıştırma' : `Görev ${deneme_no} / ${toplam}`;
  const aciklama = alistirma_mi
    ? 'Bu bir alıştırmadır ve sonuçlara katılmaz. Hazır olduğunuzda Başla\'ya basın.'
    : 'Hazır olduğunuzda Başla\'ya basın.';

  const ekran = akis_ekrani(
    el('p', { class: 'akis-ust-bilgi', 'data-oge': 'gorev-sirasi' }, ust),
    el('p', { class: 'gorev-metni', 'data-oge': 'gorev-metni' }, `${urun_adi} ürününü sepetinize ekleyin.`),
    el('p', {}, aciklama),
    el('div', { class: 'akis-dugmeler' }, basla),
  );
  ekran.classList.add('akis-ortali');

  const sifir = await ekrani_goster(sahne, ekran);
  sifir_alindi?.(sifir); // olay kaydı bu andan başlar (zaman_ms = 0)
  const { basla_olayi, basis_olayi } = await new Promise((coz) => {
    const kaldir = isaretci_tiklamasi(basla, (olay, basis) => {
      kaldir();
      coz({ basla_olayi: olay, basis_olayi: basis });
    });
  });
  return { sifir, basla_olayi, basis_olayi };
}

/** "Ürün sepetinize eklendi" ekranı; Devam'a basılınca biter. */
export async function eklendi_goster(sahne) {
  const devam = el('button', { type: 'button', class: 'akis-buton', 'data-oge': 'eklendi-devam' }, 'Devam');
  const ekran = akis_ekrani(
    el('h1', { 'data-oge': 'eklendi-metni' }, 'Ürün sepetinize eklendi'),
    el('div', { class: 'akis-dugmeler' }, devam),
  );
  ekran.classList.add('akis-ortali');
  const sifir = await ekrani_goster(sahne, ekran);
  const olay = await new Promise((coz) => {
    const kaldir = isaretci_tiklamasi(devam, (o) => { kaldir(); coz(o); });
  });
  return { sifir, devam_olayi: olay };
}

/**
 * Zorluk sorusu: "Bu görevi tamamlamak ne kadar kolaydı?" 1 (çok zor) – 7 (çok kolay).
 * @returns {Promise<{sifir: number, puan: number, devam_olayi: PointerEvent}>}
 */
export async function zorluk_goster(sahne) {
  let secilen = null;
  const devam = el('button', { type: 'button', class: 'akis-buton', disabled: true, 'data-oge': 'zorluk-devam' }, 'Devam');
  const olcek = el('div', { class: 'olcek', role: 'group', 'aria-label': 'Kolaylık puanı, 1 çok zor, 7 çok kolay' });

  for (let puan = 1; puan <= 7; puan++) {
    const dugme = el('button', {
      type: 'button', class: 'olcek-secenek', 'aria-pressed': 'false', 'data-oge': `zorluk-${puan}`,
    }, String(puan));
    dugme.addEventListener('click', () => {
      secilen = puan;
      for (const d of olcek.children) d.setAttribute('aria-pressed', String(d === dugme));
      devam.disabled = false;
    });
    olcek.append(dugme);
  }

  const ekran = akis_ekrani(
    el('h1', {}, 'Bu görevi tamamlamak ne kadar kolaydı?'),
    olcek,
    el('div', { class: 'olcek-uclari' }, el('span', {}, '1 = Çok zor'), el('span', {}, '7 = Çok kolay')),
    el('div', { class: 'akis-dugmeler' }, devam),
  );
  const sifir = await ekrani_goster(sahne, ekran);
  const devam_olayi = await new Promise((coz) => {
    const kaldir = isaretci_tiklamasi(devam, (o) => {
      if (secilen === null) return;
      kaldir();
      coz(o);
    });
  });
  return { sifir, puan: secilen, devam_olayi };
}

/** "Süre doldu, sonraki göreve geçiyoruz" — kısa bir süre gösterilip kendiliğinden geçilir. */
export async function sure_doldu_goster(sahne, bekleme_ms = 3000) {
  const ekran = akis_ekrani(el('h1', { 'data-oge': 'sure-doldu' }, 'Süre doldu, sonraki göreve geçiyoruz'));
  ekran.classList.add('akis-ortali');
  await ekrani_goster(sahne, ekran);
  await new Promise((coz) => setTimeout(coz, bekleme_ms));
}

/**
 * Vazgeç onay penceresi. Sayfanın üstüne örtü olarak eklenir; sayfadaki
 * öğelerin yerini değiştirmez.
 * @returns {Promise<{onaylandi: boolean, olay: PointerEvent}>}
 */
export function vazgec_onayi_sor() {
  return new Promise((coz) => {
    const evet = el('button', { type: 'button', class: 'akis-buton', 'data-oge': 'vazgec-onayla' }, 'Evet, vazgeç');
    const hayir = el('button', { type: 'button', class: 'akis-buton akis-buton-ikincil', 'data-oge': 'vazgec-iptal' }, 'Hayır');
    const ortu = el('div', { class: 'onay-ortusu', role: 'dialog', 'aria-modal': 'true', 'data-oge': 'vazgec-penceresi' },
      el('div', { class: 'onay-penceresi' },
        el('p', {}, 'Bu üründen vazgeçmek istediğinize emin misiniz?'),
        el('div', { class: 'akis-dugmeler' }, hayir, evet)));

    const bitir = (onaylandi) => (olay) => {
      kaldir_evet();
      kaldir_hayir();
      ortu.remove();
      coz({ onaylandi, olay });
    };
    const kaldir_evet = isaretci_tiklamasi(evet, bitir(true));
    const kaldir_hayir = isaretci_tiklamasi(hayir, bitir(false));
    document.body.appendChild(ortu);
  });
}
