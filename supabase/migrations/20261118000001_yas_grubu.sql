-- =====================================================================
-- Yaş sorusu seçenekli oldu (18 Kasım 2026, ekip kararı):
--   katilimcilar.yas (tam sayı) → katilimcilar.yas_grubu
--   ('18-20', '21-30', '31-40', '41-50', '51+'; 18 yaş altı katılamaz).
-- Var olan satırların yaşı gruba çevrilir, sonra yas sütunu kaldırılır.
-- Geniş tablo görünümleri yas sütununa bağlı olduğundan önce kaldırılır,
-- sonra yas_grubu ile yeniden oluşturulur. katilimci_olustur aynı imzayla
-- yeniden tanımlanır (yetkileri değişmez).
-- =====================================================================

drop view public.genis_tablo;
drop view public.test_genis_tablo;

do $$
declare
  v_onek text;
begin
  foreach v_onek in array array['', 'test_'] loop
    execute format('alter table public.%skatilimcilar add column yas_grubu text', v_onek);
    execute format($q$
      update public.%skatilimcilar set yas_grubu = case
        when yas <= 20 then '18-20' when yas <= 30 then '21-30'
        when yas <= 40 then '31-40' when yas <= 50 then '41-50' else '51+' end$q$, v_onek);
    execute format('alter table public.%skatilimcilar alter column yas_grubu set not null', v_onek);
    execute format($q$alter table public.%1$skatilimcilar add constraint %1$skatilimcilar_yas_grubu_check
      check (yas_grubu in ('18-20', '21-30', '31-40', '41-50', '51+'))$q$, v_onek);
    execute format('alter table public.%skatilimcilar drop column yas', v_onek);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- Geniş tablo görünümleri (20261114000004_yonetim.sql ile aynı; yalnızca
-- yas ve hesaplanan yas_grubu yerine saklanan yas_grubu)
-- ---------------------------------------------------------------------
create function public._genis_tablo_olustur(p_onek text)
returns void
language plpgsql
as $fonksiyon$
begin
  execute format($ddl$
    create view public.%1$sgenis_tablo
    with (security_invoker = true)
    as
    select
      d.deneme_id,
      k.katilimci_id,
      k.katilimci_kodu,
      k.cihaz,
      k.tablet_mi,
      k.yas_grubu,
      k.cinsiyet,
      k.alisveris_sikligi,
      k.alisveris_cihazi,
      k.katilim_cihazi,
      k.renk_ayirt_zorlugu,
      k.cihaz_uyusmazligi,
      k.sira_no,
      k.dizi_no,
      k.urun_kaydirmasi,
      k.sira_cakismasi,
      k.durum,
      k.baslangic_zamani,
      k.bitis_zamani,
      k.son_etkinlik_zamani,
      k.uygulama_surumu,
      k.haric_tutuldu   as katilimci_haric_tutuldu,
      k.haric_nedeni    as katilimci_haric_nedeni,
      d.deneme_no,
      d.alistirma_mi,
      d.kosul_indeksi,
      d.kosul_kodu,
      d.konum,
      d.renk,
      d.urun_kodu,
      d.sonuc,
      d.zorluk_puani,
      d.ekran_genislik,
      d.ekran_yukseklik,
      d.pencere_genislik,
      d.pencere_yukseklik,
      d.cihaz_piksel_orani,
      d.buton_ilk_gorunur,
      d.buton_x,
      d.buton_y,
      d.buton_genislik,
      d.buton_yukseklik,
      d.iz_eksik,
      d.kayit_zamani,
      d.haric_tutuldu   as deneme_haric_tutuldu,
      d.haric_nedeni    as deneme_haric_nedeni,
      d.haric_aciklama  as deneme_haric_aciklama,
      (d.haric_tutuldu or k.haric_tutuldu) as haric_tutuldu,
      coalesce(d.haric_nedeni, k.haric_nedeni) as haric_nedeni,
      o.tiklama_suresi_ms,
      o.tiklama_suresi_net_ms,
      o.basili_tutma_suresi_ms,
      o.gorev_suresi_ms,
      o.gorev_suresi_net_ms,
      o.buton_gorunme_suresi_ms,
      o.buton_gorunme_suresi_net_ms,
      o.buton_bulma_suresi_ms,
      o.buton_bulma_suresi_net_ms,
      o.hatali_tiklama_sayisi,
      o.bos_tiklama_sayisi,
      o.toplam_kaydirma_px,
      o.sekme_degisti,
      o.sekme_disi_sure_ms,
      o.duraklatildi,
      o.duraklatma_suresi_ms,
      o.ozet_surumu
    from public.%1$sdenemeler d
    join public.%1$skatilimcilar k using (katilimci_id)
    left join public.%1$sdeneme_ozetleri o using (deneme_id)
  $ddl$, p_onek);
  execute format('revoke all on public.%sgenis_tablo from anon, public', p_onek);
  execute format('grant select on public.%sgenis_tablo to authenticated', p_onek);
end;
$fonksiyon$;

select public._genis_tablo_olustur('');
select public._genis_tablo_olustur('test_');
drop function public._genis_tablo_olustur(text);

-- ---------------------------------------------------------------------
-- katilimci_olustur: anketteki yas yerine yas_grubu
-- ---------------------------------------------------------------------
create or replace function public.katilimci_olustur(
  p_cihaz           text,
  p_tablet_mi       boolean,
  p_cihaz_tespiti   jsonb,
  p_anket           jsonb,
  p_uygulama_surumu text,
  p_demo            boolean default false
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_katilimcilar text := public._tablo(p_demo, 'katilimcilar');
  v_denemeler    text := public._tablo(p_demo, 'denemeler');
  v_ayar         public.deney_ayarlari;
  v_son_dakika   integer;
  v_sira         integer;
  v_blok         integer;
  v_dizi_no      integer;
  v_kaydirma     integer;
  v_kosul_sirasi smallint[];
  v_kod          text;
  v_kod_var      boolean;
  v_id           uuid;
  v_c            integer;
  v_plan         jsonb := '[]'::jsonb;
  v_uyusmazlik   boolean;
begin
  select * into v_ayar from public.deney_ayarlari;
  if v_ayar is null then
    raise exception 'deney_ayarlari bos: seed.sql uygulanmamis';
  end if;

  -- ---- Girdi doğrulaması ----
  if p_cihaz is null or p_cihaz not in ('masaustu', 'mobil') then
    perform public._girdi_hatasi('gecersiz_cihaz');
  end if;
  if p_tablet_mi is null or (p_tablet_mi and p_cihaz <> 'mobil') then
    perform public._girdi_hatasi('gecersiz_tablet');
  end if;
  if p_cihaz_tespiti is not null and (jsonb_typeof(p_cihaz_tespiti) <> 'object'
                                      or octet_length(p_cihaz_tespiti::text) > 1000) then
    perform public._girdi_hatasi('gecersiz_cihaz_tespiti');
  end if;
  if p_uygulama_surumu is null or char_length(p_uygulama_surumu) not between 1 and 64 then
    perform public._girdi_hatasi('gecersiz_uygulama_surumu');
  end if;
  if p_anket is null or jsonb_typeof(p_anket) <> 'object' then
    perform public._girdi_hatasi('gecersiz_anket');
  end if;

  -- Yaş grubu: seçeneklerden biri (18 yaş altı katılamaz).
  if coalesce(p_anket ->> 'yas_grubu', '') not in ('18-20', '21-30', '31-40', '41-50', '51+') then
    perform public._girdi_hatasi('gecersiz_yas_grubu');
  end if;

  if coalesce(p_anket ->> 'cinsiyet', '') not in ('kadin', 'erkek', 'belirtmek_istemiyorum') then
    perform public._girdi_hatasi('gecersiz_cinsiyet');
  end if;
  if coalesce(p_anket ->> 'alisveris_sikligi', '') not in
       ('yilda_birkac_kez', 'ayda_bir', 'ayda_birkac_kez', 'haftada_bir_veya_daha_sik') then
    perform public._girdi_hatasi('gecersiz_alisveris_sikligi');
  end if;
  if coalesce(p_anket ->> 'alisveris_cihazi', '') not in ('bilgisayar', 'telefon', 'tablet') then
    perform public._girdi_hatasi('gecersiz_alisveris_cihazi');
  end if;
  if coalesce(p_anket ->> 'katilim_cihazi', '') not in ('bilgisayar', 'telefon', 'tablet') then
    perform public._girdi_hatasi('gecersiz_katilim_cihazi');
  end if;
  if coalesce(p_anket ->> 'renk_ayirt_zorlugu', '') not in ('evet', 'hayir', 'emin_degilim') then
    perform public._girdi_hatasi('gecersiz_renk_ayirt_zorlugu');
  end if;

  -- Anketteki cihaz ile otomatik tespit uyuşuyor mu?
  -- (bilgisayar ↔ masaustu; telefon veya tablet ↔ mobil)
  v_uyusmazlik := (p_anket ->> 'katilim_cihazi' = 'bilgisayar') <> (p_cihaz = 'masaustu');

  -- ---- Kilit: aynı tablo setinde katilimci_olustur çağrıları sıraya girer ----
  perform pg_advisory_xact_lock(hashtext('katilimci_olustur:' || p_demo::text));

  -- Kötüye kullanım freni: son 1 dakikada en çok 30 katılımcı.
  execute format('select count(*) from %s where baslangic_zamani > now() - interval ''1 minute''',
                 v_katilimcilar)
    into v_son_dakika;
  if v_son_dakika >= 30 then
    raise exception using errcode = 'P0001', message = 'cok_fazla_katilimci';
  end if;

  -- Etkinliği kesilmiş katılımcılar 'birakti' olur; numaraları boşa çıkar.
  execute format($q$
    update %s set durum = 'birakti'
    where durum = 'devam_ediyor'
      and son_etkinlik_zamani < now() - make_interval(mins => $1)$q$, v_katilimcilar)
    using v_ayar.sira_bosalma_dakika;

  -- Boştaki en küçük sıra numarası.
  -- 0..(o cihazdaki katılımcı sayısı) aralığında mutlaka boş bir numara vardır.
  execute format($q$
    select min(n)::integer
    from generate_series(0, (select count(*) from %1$s where cihaz = $1)) as n
    where not exists (
      select 1 from %1$s k
      where k.cihaz = $1
        and k.sira_no = n
        and not k.haric_tutuldu
        and not k.sira_cakismasi
        and (k.durum = 'tamamladi'
             or (k.durum = 'devam_ediyor'
                 and k.son_etkinlik_zamani >= now() - make_interval(mins => $2)))
    )$q$, v_katilimcilar)
    into v_sira using p_cihaz, v_ayar.sira_bosalma_dakika;

  v_blok     := v_sira / 6;
  v_dizi_no  := v_sira % 6;
  v_kaydirma := (v_sira + v_blok) % 6;

  select kosul_sirasi into v_kosul_sirasi from public.diziler where dizi_no = v_dizi_no;
  if v_kosul_sirasi is null then
    raise exception 'diziler bos: seed.sql uygulanmamis';
  end if;

  -- Benzersiz katılımcı kodu.
  loop
    v_kod := public._kod_uret();
    execute format('select exists (select 1 from %s where katilimci_kodu = $1)', v_katilimcilar)
      into v_kod_var using v_kod;
    exit when not v_kod_var;
  end loop;

  -- ---- Katılımcıyı yaz ----
  execute format($q$
    insert into %s (
      katilimci_kodu, cihaz, tablet_mi, cihaz_tespiti,
      yas_grubu, cinsiyet, alisveris_sikligi, alisveris_cihazi, katilim_cihazi, renk_ayirt_zorlugu,
      cihaz_uyusmazligi, sira_no, dizi_no, urun_kaydirmasi, uygulama_surumu
    ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
    returning katilimci_id$q$, v_katilimcilar)
    into v_id
    using v_kod, p_cihaz, p_tablet_mi, p_cihaz_tespiti,
          p_anket ->> 'yas_grubu', p_anket ->> 'cinsiyet', p_anket ->> 'alisveris_sikligi',
          p_anket ->> 'alisveris_cihazi', p_anket ->> 'katilim_cihazi', p_anket ->> 'renk_ayirt_zorlugu',
          v_uyusmazlik, v_sira, v_dizi_no, v_kaydirma, p_uygulama_surumu;

  -- ---- Plan: alıştırma (deneme 0) ----
  execute format($q$
    insert into %s (katilimci_id, deneme_no, kosul_indeksi, kosul_kodu, konum, renk, urun_kodu)
    values ($1, 0, null, 'K1R0', 'K1', 'R0', $2)$q$, v_denemeler)
    using v_id, v_ayar.alistirma_urunu;
  v_plan := v_plan || jsonb_build_object(
    'deneme_no', 0, 'kosul_indeksi', null, 'kosul_kodu', 'K1R0',
    'konum', 'K1', 'renk', 'R0', 'urun_kodu', v_ayar.alistirma_urunu);

  -- ---- Plan: 6 deneme ----
  -- Koşul indeksi c olan denemenin ürünü: urunler[(c + kaydırma) mod 6].
  -- (Postgres dizileri 1'den başladığı için indekslere +1 eklenir.)
  for i in 1..6 loop
    v_c := v_kosul_sirasi[i];
    execute format($q$
      insert into %s (katilimci_id, deneme_no, kosul_indeksi, kosul_kodu, konum, renk, urun_kodu)
      values ($1, $2, $3, $4, $5, $6, $7)$q$, v_denemeler)
      using v_id, i, v_c, v_ayar.kosul_kodlari[v_c + 1],
            left(v_ayar.kosul_kodlari[v_c + 1], 2), right(v_ayar.kosul_kodlari[v_c + 1], 2),
            v_ayar.urun_kodlari[((v_c + v_kaydirma) % 6) + 1];
    v_plan := v_plan || jsonb_build_object(
      'deneme_no', i, 'kosul_indeksi', v_c, 'kosul_kodu', v_ayar.kosul_kodlari[v_c + 1],
      'konum', left(v_ayar.kosul_kodlari[v_c + 1], 2), 'renk', right(v_ayar.kosul_kodlari[v_c + 1], 2),
      'urun_kodu', v_ayar.urun_kodlari[((v_c + v_kaydirma) % 6) + 1]);
  end loop;

  return jsonb_build_object(
    'katilimci_id', v_id,
    'katilimci_kodu', v_kod,
    'cihaz', p_cihaz,
    'sira_no', v_sira,
    'dizi_no', v_dizi_no,
    'urun_kaydirmasi', v_kaydirma,
    'cihaz_uyusmazligi', v_uyusmazlik,
    'plan', v_plan
  );
end;
$$;
