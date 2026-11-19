-- =====================================================================
-- 1. Migrasyon: tablolar
-- ---------------------------------------------------------------------
-- Veri tabloları iki takım halinde oluşturulur:
--   * gerçek veri:  katilimcilar, denemeler, ...
--   * demo verisi:  test_katilimcilar, test_denemeler, ...
-- İki takımın şeması birebir aynı olsun diye tablolar tek bir yardımcı
-- fonksiyonla, yalnızca önek değiştirilerek oluşturulur.
--
-- Ortak (önekesiz, tek kopya) tablolar: yoneticiler, diziler, deney_ayarlari.
-- Alan adları README'deki veri sözlüğüyle birebir aynıdır.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Ortak tablolar
-- ---------------------------------------------------------------------

-- Panel yetkisi olan Supabase Auth kullanıcıları.
-- Supabase panosundan elle eklenir (README: "Yönetici hesapları").
create table public.yoneticiler (
  kullanici_id uuid primary key references auth.users (id) on delete cascade,
  eposta       text,
  eklenme_zamani timestamptz not null default now()
);

-- 6 Williams dizisi. seed.sql tarafından deney.json'dan doldurulur.
create table public.diziler (
  dizi_no      smallint primary key check (dizi_no between 0 and 5),
  kosul_sirasi smallint[] not null check (cardinality(kosul_sirasi) = 6)
);

-- Plan üretiminde ve girdi doğrulamasında kullanılan listeler.
-- Tek satırlık tablo; seed.sql tarafından deney.json'dan doldurulur.
create table public.deney_ayarlari (
  tek                 boolean primary key default true check (tek),
  kosul_kodlari       text[] not null check (cardinality(kosul_kodlari) = 6),
  urun_kodlari        text[] not null check (cardinality(urun_kodlari) = 6),
  alistirma_urunu     text not null,
  sayfalar            text[] not null,
  olay_turleri        text[] not null,
  iz_turleri          text[] not null,
  sonuclar            text[] not null,
  sira_bosalma_dakika integer not null,
  deneme_maks_olay    integer not null,
  deneme_maks_bayt    integer not null
);

-- ---------------------------------------------------------------------
-- Veri tabloları (önekli iki takım)
-- ---------------------------------------------------------------------
create function public._tablo_seti_olustur(p_onek text)
returns void
language plpgsql
as $fonksiyon$
begin
  -- %1$s yerine önek ('' veya 'test_') gelir.
  execute format($ddl$

    -- Katılımcılar: anket yanıtları, cihaz, atama ve durum bilgisi.
    create table public.%1$skatilimcilar (
      katilimci_id       uuid primary key default gen_random_uuid(),
      katilimci_kodu     text not null unique,
      cihaz              text not null check (cihaz in ('masaustu', 'mobil')),
      tablet_mi          boolean not null default false,
      cihaz_tespiti      jsonb,
      yas                smallint not null check (yas between 18 and 99),
      cinsiyet           text not null check (cinsiyet in ('kadin', 'erkek', 'belirtmek_istemiyorum')),
      alisveris_sikligi  text not null check (alisveris_sikligi in
                           ('yilda_birkac_kez', 'ayda_bir', 'ayda_birkac_kez', 'haftada_bir_veya_daha_sik')),
      alisveris_cihazi   text not null check (alisveris_cihazi in ('bilgisayar', 'telefon', 'tablet')),
      katilim_cihazi     text not null check (katilim_cihazi in ('bilgisayar', 'telefon', 'tablet')),
      renk_ayirt_zorlugu text not null check (renk_ayirt_zorlugu in ('evet', 'hayir', 'emin_degilim')),
      cihaz_uyusmazligi  boolean not null default false,
      sira_no            integer check (sira_no >= 0),
      dizi_no            smallint not null check (dizi_no between 0 and 5),
      urun_kaydirmasi    smallint not null check (urun_kaydirmasi between 0 and 5),
      sira_cakismasi     boolean not null default false,
      durum              text not null default 'devam_ediyor'
                           check (durum in ('devam_ediyor', 'tamamladi', 'birakti')),
      baslangic_zamani   timestamptz not null default now(),
      bitis_zamani       timestamptz,
      son_etkinlik_zamani timestamptz not null default now(),
      uygulama_surumu    text not null check (char_length(uygulama_surumu) <= 64),
      haric_tutuldu      boolean not null default false,
      haric_nedeni       text check (haric_nedeni in
                           ('asiri_uzun_sure', 'sekme_degistirme', 'teknik_hata', 'katilimci_talebi', 'diger')),
      haric_aciklama     text check (char_length(haric_aciklama) <= 500)
    );
    create index %1$skatilimcilar_sira_idx on public.%1$skatilimcilar (cihaz, sira_no);
    create index %1$skatilimcilar_baslangic_idx on public.%1$skatilimcilar (baslangic_zamani);

    -- Denemeler: katılımcı başına 7 satır (0 = alıştırma).
    -- Koşul ve ürün katilimci_olustur tarafından yazılır; tarayıcıdan alınmaz.
    create table public.%1$sdenemeler (
      deneme_id          bigint generated always as identity primary key,
      katilimci_id       uuid not null references public.%1$skatilimcilar (katilimci_id) on delete cascade,
      deneme_no          smallint not null check (deneme_no between 0 and 6),
      alistirma_mi       boolean generated always as (deneme_no = 0) stored,
      kosul_indeksi      smallint check (kosul_indeksi between 0 and 5),
      kosul_kodu         text not null,
      konum              text not null check (konum in ('K1', 'K2')),
      renk               text not null check (renk in ('R0', 'R1', 'R2', 'R3')),
      urun_kodu          text not null,
      ekran_genislik     integer,
      ekran_yukseklik    integer,
      pencere_genislik   integer,
      pencere_yukseklik  integer,
      cihaz_piksel_orani real,
      tarayici_bilgisi   text check (char_length(tarayici_bilgisi) <= 400),
      buton_ilk_gorunur  boolean,
      buton_x            real,
      buton_y            real,
      buton_genislik     real,
      buton_yukseklik    real,
      zorluk_puani       smallint check (zorluk_puani between 1 and 7),
      sonuc              text check (sonuc in ('basarili', 'vazgecildi', 'zaman_asimi', 'kesildi')),
      iz_eksik           boolean not null default false,
      kayit_zamani       timestamptz,
      haric_tutuldu      boolean not null default false,
      haric_nedeni       text check (haric_nedeni in
                           ('asiri_uzun_sure', 'sekme_degistirme', 'teknik_hata', 'katilimci_talebi', 'diger')),
      haric_aciklama     text check (char_length(haric_aciklama) <= 500),
      unique (katilimci_id, deneme_no)
    );

    -- Deneme özetleri: site/js/ozet.js'in çıktısı; deneme başına bir satır.
    -- Süreler milisaniye; "_net" olanlardan duraklatma süresi çıkarılmıştır.
    create table public.%1$sdeneme_ozetleri (
      deneme_id                  bigint primary key references public.%1$sdenemeler (deneme_id) on delete cascade,
      tiklama_suresi_ms          double precision,
      tiklama_suresi_net_ms      double precision,
      basili_tutma_suresi_ms     double precision,
      gorev_suresi_ms            double precision,
      gorev_suresi_net_ms        double precision,
      buton_gorunme_suresi_ms    double precision,
      buton_gorunme_suresi_net_ms double precision,
      buton_bulma_suresi_ms      double precision,
      buton_bulma_suresi_net_ms  double precision,
      hatali_tiklama_sayisi      integer,
      bos_tiklama_sayisi         integer,
      toplam_kaydirma_px         double precision,
      sekme_degisti              boolean,
      sekme_disi_sure_ms         double precision,
      duraklatildi               boolean,
      duraklatma_suresi_ms       double precision,
      sonuc                      text,
      zorluk_puani               smallint,
      ozet_surumu                text,
      hesaplanma_zamani          timestamptz not null default now()
    );

    -- Ham olaylar (fare ve kaydırma örnekleri hariç). Değiştirilmez.
    create table public.%1$solaylar (
      olay_id      uuid primary key,
      deneme_id    bigint not null references public.%1$sdenemeler (deneme_id) on delete cascade,
      katilimci_id uuid not null references public.%1$skatilimcilar (katilimci_id) on delete cascade,
      deneme_no    smallint not null,
      cihaz        text not null,
      kosul_kodu   text not null,
      urun_kodu    text not null,
      sayfa        text not null,
      olay_turu    text not null,
      zaman_ms     double precision not null,
      x            real,
      y            real,
      hedef_oge    text,
      giris_turu   text,
      ek           jsonb
    );
    create index %1$solaylar_deneme_idx on public.%1$solaylar (deneme_id, zaman_ms);

    -- Paketli izler: deneme ve sayfa başına tek satırda [zaman_ms, x, y] dizileri.
    -- Kaydırma izinde x her zaman null'dır, y = scrollY.
    create table public.%1$sizler (
      iz_id        bigint generated always as identity primary key,
      deneme_id    bigint not null references public.%1$sdenemeler (deneme_id) on delete cascade,
      katilimci_id uuid not null references public.%1$skatilimcilar (katilimci_id) on delete cascade,
      deneme_no    smallint not null,
      sayfa        text not null,
      iz_turu      text not null check (iz_turu in ('fare', 'kaydirma')),
      ornekler     jsonb not null,
      ornek_sayisi integer not null,
      unique (deneme_id, sayfa, iz_turu)
    );

    -- Tercih sorusu yanıtları; katılımcı başına bir satır.
    create table public.%1$stercihler (
      katilimci_id    uuid primary key references public.%1$skatilimcilar (katilimci_id) on delete cascade,
      en_cok_kosul    text not null,
      en_az_kosul     text not null,
      neden           text check (char_length(neden) <= 500),
      gosterim_sirasi text[] not null check (cardinality(gosterim_sirasi) = 6),
      kayit_zamani    timestamptz not null default now(),
      check (en_cok_kosul <> en_az_kosul)
    );

    -- İşlem kaydı: her hariç tutma, geri alma, silme ve yeniden hesaplama.
    create table public.%1$sislem_kaydi (
      islem_id        bigint generated always as identity primary key,
      zaman           timestamptz not null default now(),
      yonetici_id     uuid,
      yonetici_eposta text,
      islem           text not null,
      kural           jsonb,
      etkilenen       jsonb,
      neden           text,
      aciklama        text
    );

  $ddl$, p_onek);
end;
$fonksiyon$;

select public._tablo_seti_olustur('');
select public._tablo_seti_olustur('test_');
drop function public._tablo_seti_olustur(text);
