// "Denemeler ve temizleme" sekmesi:
//   - kurala göre hariç tutma (önce önizleme, sonra tam olarak önizlenen kimlikler gönderilir),
//   - deneme listesi, rozetler ve elle seçerek hariç tutma,
//   - katılımcı hariç tutma ve kalıcı silme (çift onay),
//   - özetleri ham olaylardan yeniden hesaplama.

import { el, bolum, tablo, sayi, bildir, onay_iste, secim } from './arayuz.js';
import { KURALLAR, NEDENLER, kural_uygula, rozetler, neden_dogrula } from './haric_tutma.js';
import { etiket } from './veri.js';
import { ozet_hesapla, OZET_SURUMU } from '../ozet.js';
import { yonetici_cagir, hepsini_oku_tablo } from './sunucu.js';

const SAYFA_BOYU = 100;
// Sekme yeniden çizildiğinde (10 sn yenileme) seçim ve önizleme kaybolmasın.
const yerel = { secili: new Set(), onizleme: null, sayfa: 0, arama: '', alistirma: false, kural: 'uzun_sure', parametreler: {} };

/** Neden seçimi + açıklama alanı. */
function neden_alani(onerilen = '', onerilen_aciklama = '') {
  const s = el('select', { 'aria-label': 'Hariç tutma nedeni' },
    el('option', { value: '' }, 'Neden seçin…'),
    NEDENLER.map((n) => el('option', { value: n, selected: n === onerilen }, etiket('haric_nedeni', n))));
  const a = el('input', { type: 'text', maxlength: 500, placeholder: 'Açıklama ("Diğer" için zorunlu)', value: onerilen_aciklama });
  return {
    dugum: el('div', { class: 'islem-cubugu' }, el('label', { class: 'alan' }, 'Neden', s), el('label', { class: 'alan' }, 'Açıklama', a)),
    deger: () => ({ neden: s.value, aciklama: a.value.trim() }),
  };
}

export function denemeler_sekmesi_ciz(kap, b) {
  kap.replaceChildren(
    kural_bolumu(b),
    katilimci_bolumu(b),
    liste_bolumu(b),
    yeniden_hesap_bolumu(b),
  );
}

// ---------------------------------------------------------------------
// Kurala göre hariç tutma
// ---------------------------------------------------------------------
function kural_bolumu(b) {
  const tanim = KURALLAR[yerel.kural];
  const parametre_girdileri = tanim.parametreler.map((p) => {
    const g = el('input', { type: 'number', min: p.en_az, max: p.en_cok, step: 'any', value: yerel.parametreler[p.ad] ?? p.varsayilan });
    g.addEventListener('change', () => { yerel.parametreler[p.ad] = Number(g.value); });
    return el('label', { class: 'alan' }, p.etiket, g);
  });
  const onizle = el('button', { type: 'button', class: 'dugme dugme-ana' }, 'Önizle');
  const kural_secimi = secim('kural', 'Kural', Object.entries(KURALLAR).map(([k, t]) => [k, t.ad]), yerel.kural, (v) => {
    yerel.kural = v; yerel.parametreler = {}; yerel.onizleme = null; b.yeniden_ciz();
  });
  onizle.addEventListener('click', () => {
    try {
      // Kural, süzgeçlerden geçmiş satırlara uygulanır.
      const sonuc = kural_uygula(yerel.kural, yerel.parametreler, b.satirlar, b.olcu.startsWith('tiklama') ? b.olcu : 'tiklama_suresi_ms');
      yerel.onizleme = { ...sonuc, kod: yerel.kural, demo: b.demo };
      b.yeniden_ciz();
    } catch (h) {
      bildir(h.message, { hata: true });
    }
  });

  const icerik = [el('div', { class: 'kural-satiri' }, kural_secimi, ...parametre_girdileri, onizle)];
  const o = yerel.onizleme;
  if (o && o.demo === b.demo) {
    const sayi_metni = tanim.hedef === 'deneme'
      ? `${o.deneme_idler.length} deneme (${new Set(o.satirlar.map((s) => s.katilimci_id)).size} katılımcı) hariç tutulacak.`
      : `${o.katilimci_idler.length} katılımcı (bütün denemeleriyle) hariç tutulacak.`;
    const neden = neden_alani(KURALLAR[o.kod].onerilen_neden, KURALLAR[o.kod].onerilen_aciklama ?? '');
    const uygula = el('button', { type: 'button', class: 'dugme dugme-ana', disabled: !(o.deneme_idler.length + o.katilimci_idler.length) }, 'Önizlenenleri hariç tut');
    const vazgec = el('button', { type: 'button', class: 'dugme' }, 'Önizlemeyi kapat');
    vazgec.addEventListener('click', () => { yerel.onizleme = null; b.yeniden_ciz(); });
    uygula.addEventListener('click', async () => {
      const { neden: n, aciklama } = neden.deger();
      const hata = neden_dogrula(n, aciklama);
      if (hata) { bildir(hata, { hata: true }); return; }
      uygula.disabled = true;
      try {
        // Tam olarak önizlenen kimlikler gönderilir (aradaki yenilemeler listeyi değiştirmez).
        const r = await yonetici_cagir(b.istemci, 'denemeleri_haric_tut', {
          p_deneme_idler: o.deneme_idler, p_katilimci_idler: o.katilimci_idler,
          p_neden: n, p_aciklama: aciklama || null, p_kural: o.kural, p_demo: b.demo,
        });
        bildir(`${r.deneme_sayisi} deneme, ${r.katilimci_sayisi} katılımcı hariç tutuldu. Geri almak için "Hariç tutulanlar" sekmesine bakın.`);
        yerel.onizleme = null;
        await b.yenile();
      } catch (h) {
        bildir(h.message, { hata: true });
        uygula.disabled = false;
      }
    });
    icerik.push(el('div', { class: 'onizleme' },
      el('p', {}, el('strong', {}, 'Önizleme: '), sayi_metni),
      tablo(['Kod', 'Cihaz', 'Deneme', 'Koşul', 'Sonuç', { metin: 'Tıklama (ms)', sayi: true }, 'Rozetler'],
        o.satirlar.slice(0, 25).map((s) => [s.katilimci_kodu, etiket('cihaz', s.cihaz), String(s.deneme_no), s.kosul_kodu,
          etiket('sonuc', s.sonuc), { metin: sayi(s.tiklama_suresi_ms), sayi: true }, rozet_dugumu(s)])),
      o.satirlar.length > 25 ? el('p', { class: 'bilgi-metni' }, `… ve ${o.satirlar.length - 25} satır daha.`) : null,
      neden.dugum,
      el('div', { class: 'islem-cubugu' }, uygula, vazgec)));
  }
  return bolum('Kurala göre hariç tutma',
    el('p', { class: 'aciklama' }, 'Kural, yukarıdaki süzgeçlerden geçen denemelere uygulanır. Önce önizleme gösterilir; onaylarsanız yalnızca önizlenen kayıtlar işaretlenir. Veri silinmez, her işlem işlem kaydına yazılır.'),
    ...icerik);
}

// ---------------------------------------------------------------------
// Katılımcı işlemleri
// ---------------------------------------------------------------------
function katilimci_bolumu(b) {
  const kod = el('input', { type: 'text', maxlength: 8, placeholder: 'ör. 7AFVG48S', autocomplete: 'off' });
  const neden = neden_alani('katilimci_talebi');
  const haric = el('button', { type: 'button', class: 'dugme' }, 'Katılımcıyı hariç tut');
  const sil = el('button', { type: 'button', class: 'dugme dugme-tehlike' }, 'Katılımcıyı kalıcı sil');
  const bul = () => {
    const k = b.tum_kisiler.find((x) => x.katilimci_kodu === kod.value.trim().toUpperCase());
    if (!k) bildir('Bu kodla katılımcı bulunamadı (seçili veri setinde).', { hata: true });
    return k;
  };
  haric.addEventListener('click', async () => {
    const k = bul();
    if (!k) return;
    const { neden: n, aciklama } = neden.deger();
    const hata = neden_dogrula(n, aciklama);
    if (hata) { bildir(hata, { hata: true }); return; }
    try {
      const r = await yonetici_cagir(b.istemci, 'denemeleri_haric_tut', {
        p_deneme_idler: [], p_katilimci_idler: [k.katilimci_id], p_neden: n, p_aciklama: aciklama || null,
        p_kural: { kural: 'elle_katilimci', katilimci_kodu: k.katilimci_kodu }, p_demo: b.demo,
      });
      bildir(r.katilimci_sayisi ? `${k.katilimci_kodu} hariç tutuldu.` : `${k.katilimci_kodu} zaten hariç tutulmuş.`);
      await b.yenile();
    } catch (h) { bildir(h.message, { hata: true }); }
  });
  sil.addEventListener('click', async () => {
    const k = bul();
    if (!k) return;
    const ilk = await onay_iste({
      baslik: 'Katılımcıyı kalıcı sil',
      metin: [`${k.katilimci_kodu} kodlu katılımcının anket yanıtları, bütün denemeleri, olayları, izleri ve tercihi kalıcı olarak silinecek. Bu işlem geri alınamaz.`,
        'Veriyi analizden çıkarmak için silmek yerine "hariç tut" kullanın. Kalıcı silme yalnızca katılımcı verisinin silinmesini istediğinde kullanılmalıdır.'],
      onay_etiketi: 'Devam et', tehlikeli: true,
    });
    if (!ilk) return;
    const ikinci = await onay_iste({
      baslik: 'Son onay', metin: 'İşlem kaydında yalnızca katılımcı kodu ve silinen kayıt sayıları kalır.',
      onay_etiketi: 'Kalıcı olarak sil', tehlikeli: true, dogrulama_metni: k.katilimci_kodu,
    });
    if (!ikinci) return;
    try {
      const r = await yonetici_cagir(b.istemci, 'katilimci_sil', { p_katilimci_kodu: k.katilimci_kodu, p_onay: k.katilimci_kodu, p_demo: b.demo });
      bildir(`${k.katilimci_kodu} silindi: ${r.denemeler} deneme, ${r.olaylar} olay, ${r.izler} iz.`);
      kod.value = '';
      await b.yenile();
    } catch (h) { bildir(h.message, { hata: true }); }
  });
  return bolum('Katılımcı işlemleri',
    el('div', { class: 'islem-cubugu' }, el('label', { class: 'alan' }, 'Katılımcı kodu', kod)),
    neden.dugum,
    el('div', { class: 'islem-cubugu' }, haric, sil));
}

// ---------------------------------------------------------------------
// Deneme listesi
// ---------------------------------------------------------------------
function rozet_dugumu(s) {
  const r = rozetler(s);
  if (s.haric_tutuldu) r.unshift({ metin: `Hariç: ${etiket('haric_nedeni', s.haric_nedeni)}`, tur: 'tehlike' });
  return el('span', {}, r.map((x) => el('span', { class: `rozet${x.tur ? ` rozet-${x.tur}` : ''}` }, x.metin)));
}

function liste_bolumu(b) {
  const arama = el('input', { type: 'search', placeholder: 'Katılımcı kodu', value: yerel.arama, 'aria-label': 'Katılımcı koduna göre ara' });
  arama.addEventListener('change', () => { yerel.arama = arama.value.trim().toUpperCase(); yerel.sayfa = 0; b.yeniden_ciz(); });
  const alistirma = el('input', { type: 'checkbox', checked: yerel.alistirma });
  alistirma.addEventListener('change', () => { yerel.alistirma = alistirma.checked; yerel.sayfa = 0; b.yeniden_ciz(); });

  const liste = b.satirlar
    .filter((s) => (yerel.alistirma || s.deneme_no > 0) && (!yerel.arama || s.katilimci_kodu.includes(yerel.arama)))
    .sort((x, y) => String(y.baslangic_zamani).localeCompare(String(x.baslangic_zamani)) || x.deneme_no - y.deneme_no);
  const sayfa_sayisi = Math.max(1, Math.ceil(liste.length / SAYFA_BOYU));
  yerel.sayfa = Math.min(yerel.sayfa, sayfa_sayisi - 1);
  const parca = liste.slice(yerel.sayfa * SAYFA_BOYU, (yerel.sayfa + 1) * SAYFA_BOYU);
  // Görünmeyen (süzgeç dışı kalmış) seçimler bırakılır.
  const gorunen = new Set(liste.map((s) => s.deneme_id));
  for (const id of yerel.secili) if (!gorunen.has(id)) yerel.secili.delete(id);

  const satirlar = parca.map((s) => {
    const kutu = el('input', { type: 'checkbox', checked: yerel.secili.has(s.deneme_id), disabled: s.haric_tutuldu || s.deneme_no === 0, 'aria-label': `${s.katilimci_kodu} deneme ${s.deneme_no} seç` });
    kutu.addEventListener('change', () => { kutu.checked ? yerel.secili.add(s.deneme_id) : yerel.secili.delete(s.deneme_id); secim_metni.textContent = `${yerel.secili.size} deneme seçili`; });
    const sil = el('button', { type: 'button', class: 'dugme dugme-kucuk' }, 'Sil');
    sil.addEventListener('click', () => deneme_sil(b, s));
    return [kutu, s.katilimci_kodu, etiket('cihaz', s.cihaz), String(s.deneme_no), s.kosul_kodu, s.urun_kodu,
      etiket('sonuc', s.sonuc), { metin: sayi(s.tiklama_suresi_ms), sayi: true }, { metin: sayi(s.gorev_suresi_ms), sayi: true },
      { metin: s.zorluk_puani ?? '—', sayi: true }, rozet_dugumu(s), sil];
  });

  const secim_metni = el('span', { class: 'bilgi-metni' }, `${yerel.secili.size} deneme seçili`);
  const neden = neden_alani();
  const haric = el('button', { type: 'button', class: 'dugme dugme-ana' }, 'Seçilenleri hariç tut');
  haric.addEventListener('click', async () => {
    if (!yerel.secili.size) { bildir('Önce deneme seçin.', { hata: true }); return; }
    const { neden: n, aciklama } = neden.deger();
    const hata = neden_dogrula(n, aciklama);
    if (hata) { bildir(hata, { hata: true }); return; }
    try {
      const r = await yonetici_cagir(b.istemci, 'denemeleri_haric_tut', {
        p_deneme_idler: [...yerel.secili], p_katilimci_idler: [], p_neden: n, p_aciklama: aciklama || null,
        p_kural: { kural: 'elle_secim' }, p_demo: b.demo,
      });
      bildir(`${r.deneme_sayisi} deneme hariç tutuldu.`);
      yerel.secili.clear();
      await b.yenile();
    } catch (h) { bildir(h.message, { hata: true }); }
  });
  const onceki = el('button', { type: 'button', class: 'dugme', disabled: yerel.sayfa === 0 }, '‹ Önceki');
  const sonraki = el('button', { type: 'button', class: 'dugme', disabled: yerel.sayfa >= sayfa_sayisi - 1 }, 'Sonraki ›');
  onceki.addEventListener('click', () => { yerel.sayfa--; b.yeniden_ciz(); });
  sonraki.addEventListener('click', () => { yerel.sayfa++; b.yeniden_ciz(); });

  return bolum('Denemeler',
    el('div', { class: 'islem-cubugu' }, el('label', { class: 'alan' }, 'Ara', arama),
      el('label', { class: 'alan-satir' }, alistirma, 'Alıştırma denemelerini göster'),
      el('span', { class: 'bilgi-metni' }, `${liste.length} deneme · sayfa ${yerel.sayfa + 1}/${sayfa_sayisi}`), onceki, sonraki),
    tablo(['', 'Kod', 'Cihaz', 'No', 'Koşul', 'Ürün', 'Sonuç', { metin: 'Tıklama (ms)', sayi: true }, { metin: 'Görev (ms)', sayi: true },
      { metin: 'Zorluk', sayi: true }, 'Rozetler', ''], satirlar, { satir_sinifi: (i) => (parca[i].haric_tutuldu ? 'haric' : null) }),
    el('div', { class: 'islem-cubugu' }, secim_metni), neden.dugum, el('div', { class: 'islem-cubugu' }, haric));
}

async function deneme_sil(b, s) {
  const ilk = await onay_iste({
    baslik: 'Denemeyi kalıcı sil',
    metin: [`${s.katilimci_kodu} kodlu katılımcının ${s.deneme_no}. denemesi (${s.kosul_kodu}) ile bütün olayları, izleri ve özeti kalıcı olarak silinecek. Bu işlem geri alınamaz.`,
      'Analizden çıkarmak için silmek yerine "hariç tut" kullanın.'],
    onay_etiketi: 'Devam et', tehlikeli: true,
  });
  if (!ilk) return;
  const dogrulama = `${s.katilimci_kodu}-${s.deneme_no}`;
  const ikinci = await onay_iste({ baslik: 'Son onay', metin: 'İşlem kaydında yalnızca kod, deneme numarası ve silinen kayıt sayıları kalır.', onay_etiketi: 'Kalıcı olarak sil', tehlikeli: true, dogrulama_metni: dogrulama });
  if (!ikinci) return;
  try {
    const r = await yonetici_cagir(b.istemci, 'deneme_sil', { p_katilimci_kodu: s.katilimci_kodu, p_deneme_no: s.deneme_no, p_onay: dogrulama, p_demo: b.demo });
    bildir(`Deneme silindi: ${r.olay} olay, ${r.iz} iz, ${r.ozet} özet.`);
    await b.yenile();
  } catch (h) { bildir(h.message, { hata: true }); }
}

// ---------------------------------------------------------------------
// Özetleri ham olaylardan yeniden hesaplama
// ---------------------------------------------------------------------
const OZET_ALANLARI = ['tiklama_suresi_ms', 'tiklama_suresi_net_ms', 'basili_tutma_suresi_ms', 'gorev_suresi_ms', 'gorev_suresi_net_ms',
  'buton_gorunme_suresi_ms', 'buton_gorunme_suresi_net_ms', 'buton_bulma_suresi_ms', 'buton_bulma_suresi_net_ms',
  'hatali_tiklama_sayisi', 'bos_tiklama_sayisi', 'toplam_kaydirma_px', 'sekme_degisti', 'sekme_disi_sure_ms',
  'duraklatildi', 'duraklatma_suresi_ms', 'ozet_surumu'];

function yeniden_hesap_bolumu(b) {
  const sonuc = el('p', { class: 'bilgi-metni' }, '');
  const denetle = el('button', { type: 'button', class: 'dugme' }, 'Farkları denetle');
  denetle.addEventListener('click', async () => {
    denetle.disabled = true;
    sonuc.textContent = 'Ham olaylar okunuyor…';
    try {
      const onek = b.demo ? 'test_' : '';
      const [olaylar, izler] = await Promise.all([
        hepsini_oku_tablo(b.istemci, `${onek}olaylar`, 'olay_id'),
        hepsini_oku_tablo(b.istemci, `${onek}izler`, 'iz_id'),
      ]);
      const olay_grubu = Map.groupBy ? Map.groupBy(olaylar, (o) => Number(o.deneme_id)) : grupla(olaylar);
      const iz_grubu = Map.groupBy ? Map.groupBy(izler, (o) => Number(o.deneme_id)) : grupla(izler);
      const farkli = [];
      for (const s of b.tum_satirlar) {
        if (!s.sonuc) continue;
        const yeni = ozet_hesapla({
          olaylar: olay_grubu.get(Number(s.deneme_id)) ?? [], izler: iz_grubu.get(Number(s.deneme_id)) ?? [],
          cihaz: s.cihaz, sonuc: s.sonuc, zorluk_puani: s.zorluk_puani,
        });
        const esit = OZET_ALANLARI.every((a) => {
          const x = yeni[a]; const y = s[a];
          if (typeof x === 'number' && typeof y === 'number') return Math.abs(x - y) < 0.01;
          return (x ?? null) === (y ?? null);
        });
        if (!esit) farkli.push({ deneme_id: Number(s.deneme_id), ozet: yeni });
      }
      sonuc.textContent = farkli.length
        ? `${farkli.length} denemenin kayıtlı özeti, ozet.js sürüm ${OZET_SURUMU} ile hesaplanandan farklı.`
        : `Bütün özetler ham olaylarla tutarlı (ozet.js sürüm ${OZET_SURUMU}).`;
      if (farkli.length) {
        const guncelle = el('button', { type: 'button', class: 'dugme dugme-ana' }, `${farkli.length} özeti güncelle`);
        guncelle.addEventListener('click', async () => {
          const tamam = await onay_iste({ baslik: 'Özetleri güncelle', metin: 'Yalnızca türetilmiş özet satırları değişir; ham olaylara dokunulmaz. İşlem kaydına yazılır.', onay_etiketi: 'Güncelle' });
          if (!tamam) return;
          try {
            const r = await yonetici_cagir(b.istemci, 'ozetleri_guncelle', { p_ozetler: farkli, p_neden: `ozet.js sürüm ${OZET_SURUMU} ile yeniden hesaplama`, p_demo: b.demo });
            bildir(`${r.guncellenen} özet güncellendi.`);
            await b.yenile();
          } catch (h) { bildir(h.message, { hata: true }); }
        });
        sonuc.append(' ', guncelle);
      }
    } catch (h) {
      sonuc.textContent = h.message;
    } finally {
      denetle.disabled = false;
    }
  });
  return bolum('Özetleri ham olaylardan yeniden hesapla',
    el('p', { class: 'aciklama' }, 'Özet hesaplama kuralı (site/js/ozet.js) değişirse, kayıtlı özetler ham olaylardan yeniden hesaplanabilir. Önce farklar gösterilir.'),
    el('div', { class: 'islem-cubugu' }, denetle), sonuc);
}

function grupla(dizi) {
  const m = new Map();
  for (const o of dizi) {
    const k = Number(o.deneme_id);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(o);
  }
  return m;
}
