// "Analiz" sekmesi: koşullara göre betimsel karşılaştırmalar.
//
// Analize yalnızca başarılı, alıştırma olmayan ve hariç tutulmamış denemeler
// girer (istatistik.js → analize_girer). Her tablo ve grafiğin altında
// betimsel ön izleme notu bulunur.

import { el, bolum, tablo, not, sayi, yuzde, aralik_yaz, isi_rengi, secim } from './arayuz.js';
import { betimle, analize_girer, grupla, medyan, ortalama, sayilar } from './istatistik.js';
import { etiket, ETIKETLER, YAS_GRUPLARI } from './veri.js';
import { cizgi_grafigi, cubuk_grafigi, SERI_RENKLERI } from './grafikler.js';

export const OLCULER = [
  ['tiklama_suresi_ms', 'Tıklama süresi (brüt)'],
  ['tiklama_suresi_net_ms', 'Tıklama süresi (net: duraklatma çıkarılmış)'],
  ['gorev_suresi_ms', 'Görev süresi (brüt)'],
  ['gorev_suresi_net_ms', 'Görev süresi (net)'],
];
const CIHAZLAR = ['masaustu', 'mobil'];
const KONUMLAR = ['K1', 'K2'];
const RENKLER = ['R1', 'R2', 'R3'];

const kosul_etiketi = (k) => `${k} · ${k.startsWith('K1') ? 'K1' : 'K2'} ${k.slice(2)}`;

export function analiz_sekmesi_ciz(kap, b) {
  const olcu = b.olcu;
  const analiz = b.satirlar.filter(analize_girer);
  const deger = (s) => s[olcu];
  const ozet_hesapla = (dizi) => betimle(dizi.map(deger));
  const cihaz_satirlari = (c) => analiz.filter((s) => s.cihaz === c);

  const olcu_secimi = secim('olcu', 'Ölçü', OLCULER, olcu, (v) => b.olcu_degistir(v));
  const ust = el('div', { class: 'bolum-baslik' },
    el('p', { class: 'aciklama' }, `Analize giren deneme: ${analiz.length} (başarılı, alıştırma dışı, hariç tutulmamış). Medyan güven aralıkları tohumlu 1000 tekrarlı bootstrap ile, geometrik ortalamanınki log ölçekte t aralığıyla hesaplanır.`),
    olcu_secimi);

  kap.replaceChildren(
    ust,
    isi_haritasi_bolumu(analiz, deger),
    etken_bolumu('Konuma göre', analiz, 'konum', KONUMLAR, ozet_hesapla, cihaz_satirlari),
    etken_bolumu('Renge göre', analiz, 'renk', RENKLER, ozet_hesapla, cihaz_satirlari),
    etkilesim_bolumu(analiz, deger, cihaz_satirlari),
    demografi_bolumu(analiz, deger),
    diger_olculer_bolumu(b.satirlar),
    tercih_bolumu(b),
  );
}

// ---------------------------------------------------------------------
// 2×3 ısı haritası (masaüstü ve mobil yan yana)
// ---------------------------------------------------------------------
function isi_haritasi_bolumu(analiz, deger) {
  const haritalar = CIHAZLAR.map((cihaz) => {
    const hucreler = KONUMLAR.flatMap((k) => RENKLER.map((r) => {
      const x = sayilar(analiz.filter((s) => s.cihaz === cihaz && s.konum === k && s.renk === r).map(deger));
      return { k, r, n: x.length, medyan: medyan(x) };
    }));
    const degerler = hucreler.map((h) => h.medyan).filter((v) => v !== null);
    const en_az = Math.min(...degerler);
    const en_cok = Math.max(...degerler);
    const tablo_ = el('table', { class: 'isi-haritasi' },
      el('thead', {}, el('tr', {}, el('th', {}, ''), RENKLER.map((r) => el('th', { scope: 'col' }, r)))),
      el('tbody', {}, KONUMLAR.map((k) => el('tr', {},
        el('th', { scope: 'row' }, k),
        RENKLER.map((r) => {
          const h = hucreler.find((x) => x.k === k && x.r === r);
          const td = el('td', { title: `${k}${r}: medyan ${sayi(h.medyan)} ms, n = ${h.n}` },
            el('span', { class: 'isi-deger' }, h.medyan === null ? '—' : `${sayi(h.medyan)} ms`),
            el('span', { class: 'isi-n' }, `n = ${h.n}`));
          if (h.medyan !== null) {
            const renk = isi_rengi(en_cok > en_az ? (h.medyan - en_az) / (en_cok - en_az) : 0.5);
            td.style.backgroundColor = renk.arka; // CSSOM: CSP'de izinli
            td.style.color = renk.yazi;
          } else {
            td.style.backgroundColor = '#F3F6F9';
          }
          return td;
        })))));
    return el('div', {}, el('h3', {}, etiket('cihaz', cihaz)), tablo_);
  });
  return bolum('Medyan süre: konum × renk',
    el('p', { class: 'aciklama' }, 'Koyu hücre daha uzun süre demektir. Renk ölçeği her cihaz için ayrı kurulur.'),
    el('div', { class: 'iki-sutun' }, haritalar), not());
}

// ---------------------------------------------------------------------
// Tek etken (konum veya renk): tablo + grafik, cihaz başına ayrı çizgi
// ---------------------------------------------------------------------
function etken_bolumu(baslik, analiz, alan, duzeyler, ozet_hesapla, cihaz_satirlari) {
  const ozetler = CIHAZLAR.map((c) => ({
    cihaz: c,
    duzeyler: duzeyler.map((d) => ({ d, o: ozet_hesapla(cihaz_satirlari(c).filter((s) => s[alan] === d)) })),
  }));
  const satirlar = ozetler.flatMap(({ cihaz, duzeyler: dz }) => dz.map(({ d, o }) => [
    etiket('cihaz', cihaz), etiket(alan, d), o.n,
    { metin: `${sayi(o.ortalama)} ${aralik_yaz(o.ortalama_ga)}`, sayi: true },
    { metin: `${sayi(o.medyan)} ${aralik_yaz(o.medyan_ga)}`, sayi: true },
    { metin: `${sayi(o.geometrik_ortalama)} ${aralik_yaz(o.geometrik_ga)}`, sayi: true },
  ]));
  const tuval_ort = el('canvas', { role: 'img', 'aria-label': `${baslik}: ortalama ve %95 güven aralığı` });
  const tuval_med = el('canvas', { role: 'img', 'aria-label': `${baslik}: medyan ve %95 güven aralığı` });
  const bolum_ = bolum(`${baslik} (ms)`,
    tablo(['Cihaz', alan === 'konum' ? 'Konum' : 'Renk', { metin: 'n', sayi: true },
      { metin: 'Ortalama [%95 GA]', sayi: true }, { metin: 'Medyan [%95 GA]', sayi: true },
      { metin: 'Geometrik ort. [%95 GA]', sayi: true }], satirlar),
    el('div', { class: 'iki-sutun' },
      el('div', { class: 'grafik-kabi' }, tuval_ort),
      el('div', { class: 'grafik-kabi' }, tuval_med)),
    not());
  // Grafikler, tuval belgeye eklendikten sonra çizilir.
  queueMicrotask(() => {
    for (const [tuval, anahtar, ga, ad] of [[tuval_ort, 'ortalama', 'ortalama_ga', 'Ortalama'], [tuval_med, 'medyan', 'medyan_ga', 'Medyan']]) {
      cizgi_grafigi(tuval, {
        baslik: `${ad} ve %95 güven aralığı`,
        etiketler: duzeyler,
        y_baslik: 'ms',
        seriler: ozetler.map(({ cihaz, duzeyler: dz }, i) => ({
          ad: etiket('cihaz', cihaz), renk: SERI_RENKLERI[i],
          degerler: dz.map(({ o }) => o[anahtar]), araliklar: dz.map(({ o }) => o[ga]),
        })),
      });
    }
  });
  return bolum_;
}

// ---------------------------------------------------------------------
// Etkileşim: x = renk, çizgi = konum; cihaz başına ayrı grafik (medyan)
// ---------------------------------------------------------------------
function etkilesim_bolumu(analiz, deger, cihaz_satirlari) {
  const tuvaller = CIHAZLAR.map((c) => el('canvas', { role: 'img', 'aria-label': `${etiket('cihaz', c)} konum × renk etkileşimi` }));
  queueMicrotask(() => CIHAZLAR.forEach((c, i) => {
    cizgi_grafigi(tuvaller[i], {
      baslik: etiket('cihaz', c),
      etiketler: RENKLER,
      y_baslik: 'Medyan (ms)',
      seriler: KONUMLAR.map((k, j) => ({
        ad: k, renk: SERI_RENKLERI[j], kesikli: j === 1,
        degerler: RENKLER.map((r) => medyan(sayilar(cihaz_satirlari(c).filter((s) => s.konum === k && s.renk === r).map(deger)))),
      })),
    });
  }));
  return bolum('Etkileşim grafiği (konum × renk)',
    el('p', { class: 'aciklama' }, 'Çizgiler paralelse konumun etkisi renge göre değişmiyor demektir; kesişen ya da açılan çizgiler olası bir etkileşime işaret eder.'),
    el('div', { class: 'iki-sutun' }, tuvaller.map((t) => el('div', { class: 'grafik-kabi' }, t))),
    not());
}

// ---------------------------------------------------------------------
// Demografik kırılımlar (her grupta R1 – R2 farkı)
// ---------------------------------------------------------------------
function demografi_bolumu(analiz, deger) {
  const alanlar = [
    ['yas_grubu', 'Yaş grubu', YAS_GRUPLARI],
    ['cinsiyet', 'Cinsiyet', Object.keys(ETIKETLER.cinsiyet)],
    ['alisveris_sikligi', 'Alışveriş sıklığı', Object.keys(ETIKETLER.alisveris_sikligi)],
    ['renk_ayirt_zorlugu', 'Renk ayırt etme zorluğu', Object.keys(ETIKETLER.renk_ayirt_zorlugu)],
  ];
  const satirlar = [];
  for (const [alan, ad, degerler] of alanlar) {
    for (const d of degerler) {
      const g = analiz.filter((s) => s[alan] === d);
      const m1 = medyan(sayilar(g.filter((s) => s.renk === 'R1').map(deger)));
      const m2 = medyan(sayilar(g.filter((s) => s.renk === 'R2').map(deger)));
      satirlar.push([
        ad, alan === 'yas_grubu' ? d : etiket(alan, d),
        new Set(g.map((s) => s.katilimci_id)).size, g.length,
        { metin: sayi(medyan(sayilar(g.map(deger)))), sayi: true },
        { metin: sayi(m1), sayi: true }, { metin: sayi(m2), sayi: true },
        { metin: m1 !== null && m2 !== null ? sayi(m1 - m2) : '—', sayi: true },
      ]);
    }
  }
  return bolum('Demografik kırılımlar',
    el('p', { class: 'aciklama' }, 'Süreler medyan (ms). "R1 − R2" pozitifse düşük kontrastlı butona tıklama daha uzun sürmüştür. Küçük gruplarda değerler kararsızdır.'),
    tablo(['Değişken', 'Grup', { metin: 'Katılımcı', sayi: true }, { metin: 'Deneme', sayi: true },
      { metin: 'Medyan', sayi: true }, { metin: 'R1 medyan', sayi: true }, { metin: 'R2 medyan', sayi: true },
      { metin: 'R1 − R2', sayi: true }], satirlar),
    not());
}

// ---------------------------------------------------------------------
// Diğer ölçüler: koşul başına
// ---------------------------------------------------------------------
function diger_olculer_bolumu(tum) {
  const deneme = tum.filter((s) => s.deneme_no > 0 && s.sonuc && !s.haric_tutuldu);
  const satirlar = [];
  for (const c of CIHAZLAR) {
    for (const k of KONUMLAR) {
      for (const r of RENKLER) {
        const hepsi = deneme.filter((s) => s.cihaz === c && s.konum === k && s.renk === r);
        const b = hepsi.filter((s) => s.sonuc === 'basarili');
        const m = (alan) => medyan(sayilar(b.map((s) => s[alan])));
        const o = (alan) => ortalama(sayilar(b.map((s) => s[alan])));
        satirlar.push([
          etiket('cihaz', c), `${k}${r}`, hepsi.length,
          { metin: yuzde(b.length, hepsi.length), sayi: true },
          { metin: sayi(m('gorev_suresi_ms')), sayi: true },
          { metin: sayi(m('buton_gorunme_suresi_ms')), sayi: true },
          { metin: c === 'masaustu' ? sayi(m('buton_bulma_suresi_ms')) : '—', sayi: true },
          { metin: sayi(m('basili_tutma_suresi_ms')), sayi: true },
          { metin: sayi(o('hatali_tiklama_sayisi'), 2), sayi: true },
          { metin: sayi(o('bos_tiklama_sayisi'), 2), sayi: true },
          { metin: sayi(m('toplam_kaydirma_px')), sayi: true },
          { metin: sayi(o('zorluk_puani'), 2), sayi: true },
          { metin: yuzde(hepsi.filter((s) => s.sekme_degisti).length, hepsi.length), sayi: true },
        ]);
      }
    }
  }
  return bolum('Diğer ölçüler (koşul başına)',
    el('p', { class: 'aciklama' }, 'Başarı oranı ve sekme oranı bütün sonuçlanmış denemelerden (hariç tutulanlar dışında); diğer sütunlar başarılı denemelerden hesaplanır. Süreler medyan (ms); hatalı/boş tıklama ve zorluk ortalamadır (zorluk: 1 çok zor – 7 çok kolay).'),
    tablo(['Cihaz', 'Koşul', { metin: 'Deneme', sayi: true }, { metin: 'Başarı', sayi: true },
      { metin: 'Görev süresi', sayi: true }, { metin: 'Görünme', sayi: true }, { metin: 'Bulma (hover)', sayi: true },
      { metin: 'Basılı tutma', sayi: true }, { metin: 'Hatalı tık.', sayi: true }, { metin: 'Boş tık.', sayi: true },
      { metin: 'Kaydırma (px)', sayi: true }, { metin: 'Zorluk', sayi: true }, { metin: 'Sekme değişen', sayi: true }], satirlar),
    not());
}

// ---------------------------------------------------------------------
// Tercih sorusu
// ---------------------------------------------------------------------
function tercih_bolumu(b) {
  const kisi = new Map(b.kisiler.map((k) => [k.katilimci_id, k]));
  const tercihler = b.tercihler.filter((t) => kisi.has(t.katilimci_id) && (b.filtre.haric_goster || !kisi.get(t.katilimci_id).haric_tutuldu));
  const kosullar = b.deney.kosullar.map((k) => k.kod);
  const tuvaller = CIHAZLAR.map((c) => el('canvas', { role: 'img', 'aria-label': `${etiket('cihaz', c)} tercih sayıları` }));
  const satirlar = [];
  for (const c of CIHAZLAR) {
    const t = tercihler.filter((x) => kisi.get(x.katilimci_id).cihaz === c);
    for (const k of kosullar) {
      const cok = t.filter((x) => x.en_cok_kosul === k).length;
      const az = t.filter((x) => x.en_az_kosul === k).length;
      satirlar.push([etiket('cihaz', c), kosul_etiketi(k), cok, { metin: yuzde(cok, t.length), sayi: true }, az, { metin: yuzde(az, t.length), sayi: true }]);
    }
  }
  queueMicrotask(() => CIHAZLAR.forEach((c, i) => {
    const t = tercihler.filter((x) => kisi.get(x.katilimci_id).cihaz === c);
    cubuk_grafigi(tuvaller[i], {
      etiketler: kosullar,
      x_baslik: `${etiket('cihaz', c)} · katılımcı sayısı`,
      seriler: [
        { ad: 'En çok beğenilen', degerler: kosullar.map((k) => t.filter((x) => x.en_cok_kosul === k).length), renk: SERI_RENKLERI[0] },
        { ad: 'En az beğenilen', degerler: kosullar.map((k) => t.filter((x) => x.en_az_kosul === k).length), renk: SERI_RENKLERI[3] },
      ],
    });
  }));
  const nedenler = tercihler.filter((t) => t.neden).sort((x, y) => String(y.kayit_zamani).localeCompare(String(x.kayit_zamani))).slice(0, 40);
  return bolum('Tercih sorusu',
    tablo(['Cihaz', 'Koşul', { metin: 'En çok', sayi: true }, { metin: '%', sayi: true }, { metin: 'En az', sayi: true }, { metin: '%', sayi: true }], satirlar),
    el('div', { class: 'iki-sutun' }, tuvaller.map((t) => el('div', { class: 'grafik-kabi' }, t))),
    el('h3', {}, `Gerekçeler (son ${nedenler.length})`),
    nedenler.length
      ? el('ul', { class: 'liste-metin' }, nedenler.map((t) => el('li', {}, `${t.en_cok_kosul} › ${t.en_az_kosul}: `, t.neden)))
      : el('p', { class: 'bilgi-metni' }, 'Henüz gerekçe yazılmamış.'),
    not());
}
