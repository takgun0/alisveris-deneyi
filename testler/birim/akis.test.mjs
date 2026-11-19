// Deney akışının saf modülleri: cihaz tespiti, anket doğrulama, sayaç, durum geçişleri.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cihaz_tespit_et, uyari_durumu } from '../../site/js/cihaz.js';
import { anket_dogrula, cihaz_uyusmazligi_var_mi } from '../../site/js/anket.js';
import { DenemeSayaci } from '../../site/js/sayac.js';
import {
  yeni_durum, katilimci_atandi, adim_degisti, sonraki_deneme, yeniden_acilista_duzelt,
  gecerli_deneme, durumu_oku, durumu_yaz, tamamlanma_kaydi, tamamlandi_isaretle,
} from '../../site/js/durum.js';

// ---------------------------------------------------------------- cihaz
const sorgular = (eslesenler) => (s) => eslesenler.includes(s);
const tespit = (eslesenler, ekran = [1920, 1080]) => cihaz_tespit_et({
  eslesir: sorgular(eslesenler),
  ekran_genislik: ekran[0], ekran_yukseklik: ekran[1],
  pencere_genislik: ekran[0], pencere_yukseklik: ekran[1],
});

test('cihaz: kaba işaretçi → mobil, ince → masaüstü', () => {
  assert.equal(tespit(['(pointer: coarse)'], [390, 844]).cihaz, 'mobil');
  assert.equal(tespit(['(pointer: fine)', '(hover: hover)']).cihaz, 'masaustu');
});

test('cihaz: dokunmatik dizüstü (birincil işaretçi ince) masaüstü sayılır', () => {
  const s = tespit(['(pointer: fine)', '(hover: hover)', '(any-pointer: coarse)', '(any-pointer: fine)']);
  assert.equal(s.cihaz, 'masaustu');
  assert.equal(s.tespit.any_pointer_kaba, true);
});

test('cihaz: işaretçi bilinmiyorsa hover belirler', () => {
  assert.equal(tespit(['(hover: hover)']).cihaz, 'masaustu');
  assert.equal(tespit([]).cihaz, 'mobil');
  assert.equal(tespit([]).tespit.kural, 'hover_yok');
});

test('cihaz: tablet = kaba giriş ve kısa kenar ≥ 600', () => {
  assert.equal(tespit(['(pointer: coarse)'], [390, 844]).tablet_mi, false);
  assert.equal(tespit(['(pointer: coarse)'], [599, 900]).tablet_mi, false);
  assert.equal(tespit(['(pointer: coarse)'], [768, 1024]).tablet_mi, true);
  assert.equal(tespit(['(pointer: coarse)'], [1024, 768]).tablet_mi, true);
  // Kaba değil ama hover yok → mobil, fakat tablet sayılmaz.
  assert.equal(tespit([], [800, 1280]).tablet_mi, false);
  const s = tespit(['(pointer: coarse)'], [768, 1024]);
  assert.equal(s.cihaz, 'mobil');
  assert.equal(s.tespit.ekran_genislik, 768);
});

test('uyarı: mobil yatay, masaüstü dar pencere', () => {
  assert.equal(uyari_durumu({ cihaz: 'mobil', pencere_genislik: 844, pencere_yukseklik: 390 }), 'yatay');
  assert.equal(uyari_durumu({ cihaz: 'mobil', pencere_genislik: 390, pencere_yukseklik: 844 }), null);
  assert.equal(uyari_durumu({ cihaz: 'masaustu', pencere_genislik: 1023, pencere_yukseklik: 800 }), 'dar_pencere');
  assert.equal(uyari_durumu({ cihaz: 'masaustu', pencere_genislik: 1024, pencere_yukseklik: 600 }), null);
  // Masaüstünde yatay/dikey önemli değil.
  assert.equal(uyari_durumu({ cihaz: 'masaustu', pencere_genislik: 1400, pencere_yukseklik: 700 }), null);
});

// ---------------------------------------------------------------- anket
const tam_anket = {
  yas_grubu: '21-30', cinsiyet: 'kadin', alisveris_sikligi: 'ayda_bir', alisveris_cihazi: 'telefon',
  katilim_cihazi: 'bilgisayar', renk_ayirt_zorlugu: 'emin_degilim',
};

test('anket: geçerli yanıtlar olduğu gibi döner', () => {
  const s = anket_dogrula(tam_anket);
  assert.equal(s.gecerli, true);
  assert.deepEqual(s.temiz, tam_anket);
});

test('anket: yaş grubu yalnızca seçeneklerden biri olabilir', () => {
  for (const g of ['18-20', '21-30', '31-40', '41-50', '51+']) {
    assert.equal(anket_dogrula({ ...tam_anket, yas_grubu: g }).gecerli, true, g);
  }
  for (const g of ['0-17', '18-25', '25', '', null, undefined]) {
    assert.equal(anket_dogrula({ ...tam_anket, yas_grubu: g }).gecerli, false, `yas_grubu=${g}`);
  }
});

test('anket: boş veya izin verilmeyen seçenekler', () => {
  const s = anket_dogrula({ ...tam_anket, cinsiyet: null, renk_ayirt_zorlugu: 'belki' });
  assert.equal(s.gecerli, false);
  assert.deepEqual(Object.keys(s.hatalar).sort(), ['cinsiyet', 'renk_ayirt_zorlugu']);
  assert.equal(anket_dogrula({}).gecerli, false);
  assert.equal(Object.keys(anket_dogrula({}).hatalar).length, 6);
});

test('anket: cihaz uyuşmazlığı kuralı', () => {
  assert.equal(cihaz_uyusmazligi_var_mi('bilgisayar', 'masaustu'), false);
  assert.equal(cihaz_uyusmazligi_var_mi('telefon', 'mobil'), false);
  assert.equal(cihaz_uyusmazligi_var_mi('tablet', 'mobil'), false);
  assert.equal(cihaz_uyusmazligi_var_mi('telefon', 'masaustu'), true);
  assert.equal(cihaz_uyusmazligi_var_mi('bilgisayar', 'mobil'), true);
});

// ---------------------------------------------------------------- sayaç
test('sayaç: duraklatmasız 60 sn', () => {
  const s = new DenemeSayaci(60000);
  assert.equal(s.kalan(0), 60000);
  s.baslat(1000);
  assert.equal(s.kalan(31000), 30000);
  assert.equal(s.doldu_mu(60999), false);
  assert.equal(s.doldu_mu(61000), true);
});

test('sayaç: duraklatma süresi sayılmaz', () => {
  const s = new DenemeSayaci(60000);
  s.baslat(0);
  s.duraklat(10000);
  assert.equal(s.gecen_net(25000), 10000, 'açık duraklama da düşülür');
  s.devam(30000);
  assert.equal(s.duraklama(30000), 20000);
  assert.equal(s.gecen_net(40000), 20000);
  assert.equal(s.doldu_mu(79999), false);
  assert.equal(s.doldu_mu(80000), true);
  assert.equal(s.duraklama_sayisi, 1);
});

test('sayaç: çift duraklat/devam yok sayılır; başlamadan duraklatılamaz', () => {
  const s = new DenemeSayaci(60000);
  assert.equal(s.duraklat(5), false);
  s.baslat(0);
  assert.equal(s.duraklat(100), true);
  assert.equal(s.duraklat(200), false);
  assert.equal(s.devam(300), true);
  assert.equal(s.devam(400), false);
  assert.equal(s.duraklama(1000), 200);
});

// ---------------------------------------------------------------- durum
const plan = [
  { deneme_no: 0, kosul_kodu: 'K1R0', urun_kodu: 'defter' },
  ...[1, 2, 3, 4, 5, 6].map((n) => ({ deneme_no: n, kosul_kodu: `K${n}`, urun_kodu: `u${n}` })),
];
const atanmis = () => katilimci_atandi(yeni_durum({ cihaz: 'masaustu' }), { katilimci_id: 'x', plan });

test('durum: atama sonrası alıştırmanın görev ekranı', () => {
  const d = atanmis();
  assert.equal(d.asama, 'deneme');
  assert.equal(gecerli_deneme(d).deneme_no, 0);
  assert.equal(d.deneme_adimi, 'gorev');
});

test('durum: 7 denemeden sonra tercih aşaması', () => {
  let d = atanmis();
  for (let i = 0; i < 6; i++) d = sonraki_deneme(d);
  assert.equal(gecerli_deneme(d).deneme_no, 6);
  d = sonraki_deneme(d);
  assert.equal(d.asama, 'tercih');
});

test('yenileme: görev ekranında kalındıysa aynı denemeden devam', () => {
  const d = adim_degisti(sonraki_deneme(atanmis()), 'gorev');
  const s = yeniden_acilista_duzelt(d);
  assert.equal(s.kesilen_deneme, null);
  assert.equal(gecerli_deneme(s.durum).deneme_no, 1);
  assert.equal(s.durum.deneme_adimi, 'gorev');
});

test('yenileme: ürün sayfasında kalındıysa deneme kesildi, sonrakine geçilir', () => {
  const d = adim_degisti(sonraki_deneme(sonraki_deneme(atanmis())), 'urun');
  const s = yeniden_acilista_duzelt(d);
  assert.equal(s.kesilen_deneme.deneme_no, 2);
  assert.equal(gecerli_deneme(s.durum).deneme_no, 3);
  assert.equal(s.durum.deneme_adimi, 'gorev');
});

test('yenileme: son denemede kesilirse tercih aşamasına geçilir', () => {
  let d = atanmis();
  for (let i = 0; i < 6; i++) d = sonraki_deneme(d);
  const s = yeniden_acilista_duzelt(adim_degisti(d, 'urun'));
  assert.equal(s.kesilen_deneme.deneme_no, 6);
  assert.equal(s.durum.asama, 'tercih');
});

test('yenileme: eklendi veya zorluk ekranında kalındıysa zorluk sorusundan devam', () => {
  for (const adim of ['eklendi', 'zorluk']) {
    const s = yeniden_acilista_duzelt(adim_degisti(atanmis(), adim, 'basarili'));
    assert.equal(s.kesilen_deneme, null);
    assert.equal(s.durum.deneme_adimi, 'zorluk');
    assert.equal(gecerli_deneme(s.durum).deneme_no, 0);
  }
});

test('durum saklama: bozuk veya eski sürüm yok sayılır; hatalar yutulur', () => {
  const depo = new Map();
  const sahte = {
    getItem: (k) => depo.get(k) ?? null,
    setItem: (k, v) => depo.set(k, v),
    removeItem: (k) => depo.delete(k),
  };
  assert.equal(durumu_oku(false, sahte), null);
  durumu_yaz(false, atanmis(), sahte);
  assert.equal(durumu_oku(false, sahte).asama, 'deneme');
  assert.equal(durumu_oku(true, sahte), null, 'demo ayrı anahtar kullanır');
  depo.set('sepete_ekle_durum_v1', '{bozuk');
  assert.equal(durumu_oku(false, sahte), null);
  depo.set('sepete_ekle_durum_v1', JSON.stringify({ surum: 99 }));
  assert.equal(durumu_oku(false, sahte), null);

  const dolu = { getItem: () => { throw new Error('erişim yok'); }, setItem: () => { throw new Error('kota'); } };
  assert.equal(durumu_oku(false, dolu), null);
  assert.equal(durumu_yaz(false, atanmis(), dolu), false);
  assert.equal(tamamlanma_kaydi(false, dolu), null);

  tamamlandi_isaretle(false, 'ABCD2345', sahte);
  assert.deepEqual(tamamlanma_kaydi(false, sahte), { katilimci_kodu: 'ABCD2345' });
  assert.equal(tamamlanma_kaydi(true, sahte), null);
});
