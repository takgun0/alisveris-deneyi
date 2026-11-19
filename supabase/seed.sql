-- BU DOSYA ÜRETİLİR. Elle düzenlemeyin: npm run williams
-- Kaynak: site/yapilandirma/deney.json

-- Williams dizileri: her satır, bir dizideki 6 koşul indeksinin sunum sırası.
insert into public.diziler (dizi_no, kosul_sirasi) values
  (0, array[0, 1, 5, 2, 4, 3]::smallint[]),
  (1, array[1, 2, 0, 3, 5, 4]::smallint[]),
  (2, array[2, 3, 1, 4, 0, 5]::smallint[]),
  (3, array[3, 4, 2, 5, 1, 0]::smallint[]),
  (4, array[4, 5, 3, 0, 2, 1]::smallint[]),
  (5, array[5, 0, 4, 1, 3, 2]::smallint[])
on conflict (dizi_no) do update set kosul_sirasi = excluded.kosul_sirasi;

-- Plan üretimi ve girdi doğrulamasında kullanılan listeler
-- (indeks sırası deney.json ile aynı).
insert into public.deney_ayarlari
  (tek, kosul_kodlari, urun_kodlari, alistirma_urunu, sayfalar, olay_turleri,
   iz_turleri, sonuclar, sira_bosalma_dakika, deneme_maks_olay, deneme_maks_bayt)
values (
  true,
  array['K1R1', 'K1R2', 'K1R3', 'K2R1', 'K2R2', 'K2R3'],
  array['kulaklik', 'termos', 'sirt_cantasi', 'masa_lambasi', 'kupa', 'mouse'],
  'defter',
  array['gorev', 'urun', 'eklendi', 'zorluk'],
  array['sayfa_goruntulendi', 'buton_gorundu', 'buton_hover_ilk', 'tiklama', 'basis_iptal', 'sekme_degisti', 'yon_degisti', 'boyut_degisti', 'duraklatildi', 'devam_edildi', 'vazgecildi', 'zaman_asimi', 'gorev_tamamlandi'],
  array['fare', 'kaydirma'],
  array['basarili', 'vazgecildi', 'zaman_asimi', 'kesildi'],
  30,
  6000,
  2097152
)
on conflict (tek) do update set
  kosul_kodlari = excluded.kosul_kodlari,
  urun_kodlari = excluded.urun_kodlari,
  alistirma_urunu = excluded.alistirma_urunu,
  sayfalar = excluded.sayfalar,
  olay_turleri = excluded.olay_turleri,
  iz_turleri = excluded.iz_turleri,
  sonuclar = excluded.sonuclar,
  sira_bosalma_dakika = excluded.sira_bosalma_dakika,
  deneme_maks_olay = excluded.deneme_maks_olay,
  deneme_maks_bayt = excluded.deneme_maks_bayt;
