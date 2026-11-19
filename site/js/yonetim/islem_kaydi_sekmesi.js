// "İşlem kaydı" sekmesi: hariç tutma, geri alma, silme, özet güncelleme ve
// dışa aktarma işlemlerinin listesi (en yeni üstte). Yalnızca okunur.

import { el, bolum, tablo } from './arayuz.js';
import { etiket } from './veri.js';

const ISLEM_ADLARI = {
  haric_tut: 'Hariç tutma',
  haric_geri_al: 'Hariç tutmayı geri alma',
  deneme_sil: 'Deneme silme',
  katilimci_sil: 'Katılımcı silme',
  ozet_guncelle: 'Özet güncelleme',
  disa_aktar: 'Dışa aktarma',
  tam_yedek: 'Tam yedek',
};

function etkilenen_ozeti(i) {
  const e = i.etkilenen ?? {};
  switch (i.islem) {
    case 'haric_tut': return `${e.deneme_idler?.length ?? 0} deneme, ${e.katilimci_idler?.length ?? 0} katılımcı`;
    case 'haric_geri_al': return `${e.denemeler?.length ?? 0} deneme, ${e.katilimcilar?.length ?? 0} katılımcı`;
    case 'deneme_sil': return `${e.katilimci_kodu} / deneme ${e.deneme_no}: ${e.olay} olay, ${e.iz} iz`;
    case 'katilimci_sil': return `${e.katilimci_kodu}: ${e.denemeler} deneme, ${e.olaylar} olay, ${e.izler} iz`;
    case 'ozet_guncelle': return `${e.deneme_sayisi} özet`;
    default: return e.tur ? `${e.tur} (${e.bicim}), ${e.satir} satır` : JSON.stringify(e);
  }
}

export function islem_kaydi_sekmesi_ciz(kap, b) {
  const islemler = [...b.islemler].sort((x, y) => Number(y.islem_id) - Number(x.islem_id));
  kap.replaceChildren(bolum(`İşlem kaydı (${islemler.length})`,
    el('p', { class: 'aciklama' }, 'Kayıtlar veritabanında işlemle aynı anda yazılır ve panelden değiştirilemez.'),
    islemler.length
      ? tablo(['No', 'Zaman', 'Yönetici', 'İşlem', 'Etkilenen', 'Neden', 'Açıklama', 'Kural / süzgeç'],
        islemler.map((i) => [
          String(i.islem_id), new Date(i.zaman).toLocaleString('tr-TR'), i.yonetici_eposta ?? '—',
          ISLEM_ADLARI[i.islem] ?? i.islem, etkilenen_ozeti(i),
          i.neden ? etiket('haric_nedeni', i.neden) : '', i.aciklama ?? '',
          i.kural ? JSON.stringify(i.kural) : '',
        ]))
      : el('p', { class: 'bilgi-metni' }, 'Henüz işlem yok.')));
}
