// "Hariç tutulanlar" sekmesi: hariç tutulan denemeler ve katılımcılar;
// tek tıkla geri alma. (Süzgeçlerdeki "hariç tutulanları göster" seçeneğinden
// bağımsız olarak bütün hariç tutulanlar listelenir.)

import { el, bolum, tablo, sayi, bildir } from './arayuz.js';
import { etiket } from './veri.js';
import { filtrele } from './veri.js';
import { yonetici_cagir } from './sunucu.js';

export function haric_sekmesi_ciz(kap, b) {
  const satirlar = filtrele(b.tum_satirlar, { ...b.filtre, haric_goster: true });
  const denemeler = satirlar.filter((s) => s.deneme_haric_tutuldu);
  const kisi_map = new Map();
  for (const s of satirlar) if (s.katilimci_haric_tutuldu && !kisi_map.has(s.katilimci_id)) kisi_map.set(s.katilimci_id, s);
  const kisiler = [...kisi_map.values()];

  const geri_al = async (dugme, parametreler, metin) => {
    dugme.disabled = true;
    try {
      const r = await yonetici_cagir(b.istemci, 'haric_tutmayi_geri_al', { ...parametreler, p_demo: b.demo });
      bildir(`${metin}: ${r.deneme_sayisi + r.katilimci_sayisi} kayıt geri alındı.`);
      await b.yenile();
    } catch (h) {
      bildir(h.message, { hata: true });
      dugme.disabled = false;
    }
  };

  const deneme_satirlari = denemeler.map((s) => {
    const d = el('button', { type: 'button', class: 'dugme dugme-kucuk' }, 'Geri al');
    d.addEventListener('click', () => geri_al(d, { p_deneme_idler: [Number(s.deneme_id)], p_katilimci_idler: [] }, `${s.katilimci_kodu} deneme ${s.deneme_no}`));
    return [s.katilimci_kodu, etiket('cihaz', s.cihaz), String(s.deneme_no), s.kosul_kodu, etiket('sonuc', s.sonuc),
      { metin: sayi(s.tiklama_suresi_ms), sayi: true }, etiket('haric_nedeni', s.deneme_haric_nedeni), s.deneme_haric_aciklama ?? '', d];
  });
  const kisi_satirlari = kisiler.map((s) => {
    const d = el('button', { type: 'button', class: 'dugme dugme-kucuk' }, 'Geri al');
    d.addEventListener('click', () => geri_al(d, { p_deneme_idler: [], p_katilimci_idler: [s.katilimci_id] }, s.katilimci_kodu));
    return [s.katilimci_kodu, etiket('cihaz', s.cihaz), etiket('durum', s.durum), etiket('haric_nedeni', s.katilimci_haric_nedeni), d];
  });

  const hepsini_geri = el('button', { type: 'button', class: 'dugme', disabled: !denemeler.length }, `Listelenen ${denemeler.length} denemenin hepsini geri al`);
  hepsini_geri.addEventListener('click', () => geri_al(hepsini_geri, { p_deneme_idler: denemeler.map((s) => Number(s.deneme_id)), p_katilimci_idler: [] }, 'Toplu geri alma'));

  kap.replaceChildren(
    bolum(`Hariç tutulan denemeler (${denemeler.length})`,
      el('p', { class: 'aciklama' }, 'Hariç tutma veriyi silmez; geri alınca deneme yeniden analize girer. Her geri alma işlem kaydına yazılır.'),
      denemeler.length
        ? tablo(['Kod', 'Cihaz', 'No', 'Koşul', 'Sonuç', { metin: 'Tıklama (ms)', sayi: true }, 'Neden', 'Açıklama', ''], deneme_satirlari)
        : el('p', { class: 'bilgi-metni' }, 'Hariç tutulan deneme yok.'),
      el('div', { class: 'islem-cubugu' }, hepsini_geri)),
    bolum(`Hariç tutulan katılımcılar (${kisiler.length})`,
      el('p', { class: 'aciklama' }, 'Hariç tutulan katılımcının bütün denemeleri analiz dışıdır ve sıra numarası boşa çıkar.'),
      kisiler.length
        ? tablo(['Kod', 'Cihaz', 'Durum', 'Neden', ''], kisi_satirlari)
        : el('p', { class: 'bilgi-metni' }, 'Hariç tutulan katılımcı yok.')),
  );
}
