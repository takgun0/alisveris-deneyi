// "Dışa aktar" sekmesi: CSV (UTF-8, BOM'lu) ve xlsx dosyaları; tam yedek (JSON).
// Dosyalar süzgeçlere uyar (katılımcı seti süzgeçten geçenlerdir). Her dışa
// aktarım işlem kaydına yazılır; "son tam yedek" zamanı buradan izlenir.

import { el, bolum, bildir } from './arayuz.js';
import { gecen_sure } from './veri.js';
import {
  csv_olustur, hucre_guvenli, anket_tablosu, deneme_tablosu, tercih_tablosu, islem_tablosu,
  genis_analiz_tablosu, ham_olay_tablosu, dosya_adi,
} from './disa_aktarim.js';
import { xlsx_olustur } from './xlsx.js';
import { yonetici_cagir, hepsini_oku_tablo } from './sunucu.js';

const DOSYALAR = [
  ['ham_olaylar', 'Ham olaylar', 'Bütün olaylar; fare ve kaydırma izleri satırlara açılmış, zamana göre sıralı.'],
  ['deneme_ozetleri', 'Deneme özetleri', 'Deneme başına bir satır: koşul, ürün, sonuç, bütün süreler ve sayaçlar.'],
  ['genis_analiz', 'Geniş analiz tablosu', 'Katılımcı başına bir satır; her koşul için ayrı sütunlar (tekrarlı ölçümler analizi için).'],
  ['anket', 'Anket', 'Katılımcı başına bir satır: anket yanıtları, cihaz, atama ve durum.'],
  ['tercihler', 'Tercihler', 'En çok / en az beğenilen tasarım, gerekçe ve gösterim sırası.'],
  ['islem_kaydi', 'İşlem kaydı', 'Bütün temizleme, geri alma, silme ve dışa aktarma işlemleri.'],
];

function indir(veri, ad, tur) {
  const url = URL.createObjectURL(new Blob([veri], { type: tur }));
  const a = el('a', { href: url, download: ad });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/** Bir dosya türü için tabloyu hazırlar (gerekirse ham olayları okur). */
async function tablo_hazirla(tur, b) {
  const kisiler = b.kisiler;
  const kimlikler = new Set(kisiler.map((k) => k.katilimci_id));
  switch (tur) {
    case 'deneme_ozetleri': return deneme_tablosu(b.satirlar);
    case 'genis_analiz': return genis_analiz_tablosu(b.satirlar, kisiler, b.deney.kosullar.map((k) => k.kod));
    case 'anket': return anket_tablosu(kisiler);
    case 'tercihler': return tercih_tablosu(b.tercihler.filter((t) => kimlikler.has(t.katilimci_id)), kisiler);
    case 'islem_kaydi': return islem_tablosu(b.islemler);
    case 'ham_olaylar': {
      const onek = b.demo ? 'test_' : '';
      const [olaylar, izler] = await Promise.all([
        hepsini_oku_tablo(b.istemci, `${onek}olaylar`, 'olay_id'),
        hepsini_oku_tablo(b.istemci, `${onek}izler`, 'iz_id'),
      ]);
      const denemeler = new Map(b.satirlar.map((s) => [Number(s.deneme_id), s]));
      return ham_olay_tablosu(olaylar, izler, denemeler);
    }
    default: throw new Error(`Bilinmeyen dosya: ${tur}`);
  }
}

async function disa_aktar(tur, bicim, b, dugme) {
  dugme.disabled = true;
  const eski = dugme.textContent;
  dugme.textContent = 'Hazırlanıyor…';
  try {
    const t = await tablo_hazirla(tur, b);
    const ad = dosya_adi(tur, bicim, { demo: b.demo });
    if (bicim === 'csv') indir(csv_olustur(t), ad, 'text/csv;charset=utf-8');
    else indir(await xlsx_olustur([t], { deger_cevir: hucre_guvenli }), ad, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    await yonetici_cagir(b.istemci, 'disa_aktarim_kaydet', { p_tur: tur, p_bicim: bicim, p_satir: t.satirlar.length, p_filtre: b.filtre, p_demo: b.demo });
    bildir(`${ad} indirildi (${t.satirlar.length} satır).`);
  } catch (h) {
    bildir(h.message, { hata: true });
  } finally {
    dugme.disabled = false;
    dugme.textContent = eski;
  }
}

/** Tam yedek: bütün tablolar süzgeçsiz, olduğu gibi (JSON). */
async function tam_yedek(b, dugme) {
  dugme.disabled = true;
  dugme.textContent = 'Yedek hazırlanıyor…';
  try {
    const onek = b.demo ? 'test_' : '';
    const tablolar = [['katilimcilar', 'katilimci_id'], ['denemeler', 'deneme_id'], ['deneme_ozetleri', 'deneme_id'],
      ['olaylar', 'olay_id'], ['izler', 'iz_id'], ['tercihler', 'katilimci_id'], ['islem_kaydi', 'islem_id']];
    const veri = {};
    for (const [t, sira] of tablolar) veri[t] = await hepsini_oku_tablo(b.istemci, `${onek}${t}`, sira);
    const yedek = {
      bicim: 'sepete_ekle_tam_yedek', surum: 1, olusturma_zamani: new Date().toISOString(), demo: b.demo,
      satir_sayilari: Object.fromEntries(Object.entries(veri).map(([k, v]) => [k, v.length])),
      tablolar: veri,
    };
    const satir = Object.values(veri).reduce((t, v) => t + v.length, 0);
    indir(JSON.stringify(yedek), dosya_adi('tam_yedek', 'json', { demo: b.demo }), 'application/json');
    await yonetici_cagir(b.istemci, 'disa_aktarim_kaydet', { p_tur: 'tam_yedek', p_bicim: 'json', p_satir: satir, p_filtre: {}, p_demo: b.demo });
    bildir(`Tam yedek indirildi (${satir} satır).`);
    await b.yenile();
  } catch (h) {
    bildir(h.message, { hata: true });
  } finally {
    dugme.disabled = false;
    dugme.textContent = 'Tam yedeği indir (JSON)';
  }
}

export function disa_aktar_sekmesi_ciz(kap, b) {
  const son_yedek = b.islemler.filter((i) => i.islem === 'tam_yedek').map((i) => Date.parse(i.zaman)).sort().at(-1);
  const yedek_dugmesi = el('button', { type: 'button', class: 'dugme dugme-ana' }, 'Tam yedeği indir (JSON)');
  yedek_dugmesi.addEventListener('click', () => tam_yedek(b, yedek_dugmesi));

  const satirlar = DOSYALAR.map(([tur, ad, aciklama]) => {
    const csv = el('button', { type: 'button', class: 'dugme' }, 'CSV');
    const xlsx = el('button', { type: 'button', class: 'dugme' }, 'xlsx');
    csv.addEventListener('click', () => disa_aktar(tur, 'csv', b, csv));
    xlsx.addEventListener('click', () => disa_aktar(tur, 'xlsx', b, xlsx));
    return el('div', { class: 'kural-satiri' },
      el('div', {}, el('h3', {}, ad), el('p', { class: 'bilgi-metni' }, aciklama)),
      el('div', { class: 'islem-cubugu' }, csv, xlsx));
  });

  kap.replaceChildren(
    bolum('Tam yedek',
      el('p', { class: son_yedek && Date.now() - son_yedek < 24 * 3600e3 ? 'aciklama' : 'onizleme' },
        `Son tam yedek: ${gecen_sure(son_yedek)}${son_yedek ? ` (${new Date(son_yedek).toLocaleString('tr-TR')})` : ''}. Ücretsiz Supabase planında otomatik yedek yoktur; veri toplama sürerken her gün yedek alın.`),
      el('p', { class: 'aciklama' }, 'Tam yedek süzgeç uygulamaz: seçili veri setindeki (gerçek veya demo) bütün tabloları olduğu gibi içerir.'),
      el('div', { class: 'islem-cubugu' }, yedek_dugmesi)),
    bolum('Analiz dosyaları',
      el('p', { class: 'aciklama' }, `Dosyalar süzgeçlere uyar: ${b.kisiler.length} katılımcı, ${b.satirlar.length} deneme satırı. Her dosyada haric_tutuldu ve haric_nedeni sütunları vardır. CSV: UTF-8 (BOM'lu), virgül ayraçlı, ondalık ayracı nokta. "=, +, -, @" ile başlayan metinlerin başına tek tırnak eklenir.`),
      ...satirlar),
  );
}
