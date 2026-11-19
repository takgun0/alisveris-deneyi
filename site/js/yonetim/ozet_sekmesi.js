// "Özet" sekmesi: katılımcı ve deneme sayıları, Williams blok durumu.

import { el, kart, bolum, tablo, yuzde, sayi } from './arayuz.js';
import { ozet_sayilari, blok_durumu, etiket, YAS_GRUPLARI, gecen_sure } from './veri.js';

export function ozet_sekmesi_ciz(kap, b) {
  const s = ozet_sayilari(b.satirlar, b.kisiler);
  const tum_kisiler = b.tum_kisiler; // blok durumu süzgeçten bağımsızdır
  const son_yedek = b.islemler.filter((i) => i.islem === 'tam_yedek').map((i) => Date.parse(i.zaman)).sort().at(-1);

  const kartlar = el('div', { class: 'kartlar' },
    kart('Katılımcı', s.katilimci, `${s.devam_eden} devam ediyor`),
    kart('Tamamlayan', s.tamamlayan, yuzde(s.tamamlayan, s.katilimci)),
    kart('Bırakan', s.birakan, yuzde(s.birakan, s.katilimci)),
    kart('Masaüstü / Mobil', `${s.cihaz.masaustu ?? 0} / ${s.cihaz.mobil ?? 0}`, `${s.tablet} tablet · ${s.cihaz_uyusmazligi} cihaz uyuşmazlığı`),
    kart('Yaş grupları', YAS_GRUPLARI.map((g) => s.yas_grubu[g] ?? 0).join(' / '), YAS_GRUPLARI.join(' / ')),
    kart('Geçerli deneme', s.gecerli_deneme, `${s.deneme} kayıtlı denemeden (alıştırma hariç)`),
    kart('Hariç tutulan deneme', s.haric_deneme, `${s.hariç_katilimci} katılımcı hariç tutuldu`),
    kart('Son tam yedek', gecen_sure(son_yedek), son_yedek ? new Date(son_yedek).toLocaleString('tr-TR') : 'Dışa aktar sekmesinden alın'),
  );
  if (!son_yedek || Date.now() - son_yedek > 24 * 3600 * 1000) kartlar.lastChild.classList.add('kart-uyari');

  // Sonuç dağılımı
  const sonuclar = tablo(['Sonuç', { metin: 'Deneme', sayi: true }, { metin: 'Oran', sayi: true }],
    ['basarili', 'vazgecildi', 'zaman_asimi', 'kesildi'].map((k) => [etiket('sonuc', k), s.sonuc[k] ?? 0, { metin: yuzde(s.sonuc[k] ?? 0, s.deneme), sayi: true }]));

  // Williams blokları (cihaz başına ayrı numara dizisi)
  const bloklar = ['masaustu', 'mobil'].map((cihaz) => {
    const d = blok_durumu(tum_kisiler, cihaz, { bosalma_dakika: b.deney.olcum.sira_bosalma_dakika });
    return [
      etiket('cihaz', cihaz),
      d.tamamlanan_blok,
      `${d.gecerli_blok * 6}–${d.gecerli_blok * 6 + 5}`,
      d.bos_numaralar.length ? d.bos_numaralar.join(', ') : 'yok',
      d.suren_numaralar.length ? d.suren_numaralar.join(', ') : 'yok',
    ];
  });

  kap.replaceChildren(
    kartlar,
    el('div', { class: 'iki-sutun' },
      bolum('Deneme sonuçları', el('p', { class: 'aciklama' }, 'Alıştırma denemesi dahil değildir.'), sonuclar),
      bolum('Williams blokları',
        el('p', { class: 'aciklama' }, 'Her blok 6 sıra numarasıdır; 6 katılımcının hepsi tamamladığında blok tamamlanır. Süzgeçlerden bağımsızdır; hariç tutulan katılımcının numarası boşa çıkar.'),
        tablo(['Cihaz', { metin: 'Tamamlanan blok', sayi: true }, 'Geçerli blok', 'Boştaki numaralar', 'Süren numaralar'], bloklar))),
    bolum('Son katılımcılar',
      tablo(['Kod', 'Cihaz', 'Yaş', 'Durum', { metin: 'Deneme', sayi: true }, 'Başlangıç', 'Not'],
        [...b.kisiler].sort((x, y) => y.baslangic_zamani.localeCompare(x.baslangic_zamani)).slice(0, 15).map((k) => [
          k.katilimci_kodu,
          etiket('cihaz', k.cihaz) + (k.tablet_mi ? ' (tablet)' : ''),
          k.yas_grubu,
          etiket('durum', k.durum),
          k.deneme_sayisi,
          new Date(k.baslangic_zamani).toLocaleString('tr-TR'),
          [k.haric_tutuldu ? 'hariç' : null, k.cihaz_uyusmazligi ? 'cihaz uyuşmazlığı' : null, k.sira_cakismasi ? 'sıra çakışması' : null].filter(Boolean).join(', '),
        ]))),
  );
}
