-- =====================================================================
-- Yönetim: geniş analiz görünümü ve yönetici fonksiyonları
-- =====================================================================
-- Kurallar (proje kararları):
--   * Ham olaylar değiştirilmez. Hariç tutma veri silmez, yalnızca işaretler.
--   * Her temizleme işlemi aynı işlemde (transaction) islem_kaydi'na yazılır.
--   * Kalıcı silmede işlem kaydında yalnızca katılımcı kodu ve kayıt sayıları kalır.
--   * Bütün fonksiyonlar önce yonetici_mi() denetler; yalnızca 'authenticated'
--     rolüne açıktır (anon çağıramaz).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Geniş tablo: deneme başına bir satır (katılımcı + deneme + özet)
-- security_invoker: görünüm, çağıranın yetkileriyle çalışır; böylece alttaki
-- tabloların RLS kuralları (yalnızca yöneticiler okur) geçerli kalır.
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
      k.yas,
      case when k.yas <= 25 then '18-25' when k.yas <= 34 then '26-34' else '35+' end as yas_grubu,
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
-- Ortak yardımcılar
-- ---------------------------------------------------------------------

-- Yönetici değilse 42501 (insufficient_privilege) hatası.
create function public._yonetici_gerekli()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.yonetici_mi() then
    raise exception using errcode = '42501', message = 'yetkisiz';
  end if;
end;
$$;

-- İşlem kaydına bir satır yazar.
create function public._islem_yaz(
  p_demo boolean, p_islem text, p_kural jsonb, p_etkilenen jsonb, p_neden text, p_aciklama text
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  execute format($q$
    insert into %s (yonetici_id, yonetici_eposta, islem, kural, etkilenen, neden, aciklama)
    values ($1, (select eposta from public.yoneticiler where kullanici_id = $1), $2, $3, $4, $5, $6)
    returning islem_id$q$, public._tablo(p_demo, 'islem_kaydi'))
    into v_id
    using auth.uid(), p_islem, p_kural, p_etkilenen, p_neden, p_aciklama;
  return v_id;
end;
$$;

-- Hariç tutma nedeni denetimi.
create function public._neden_denetle(p_neden text, p_aciklama text)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_neden is null or p_neden not in
     ('asiri_uzun_sure', 'sekme_degistirme', 'teknik_hata', 'katilimci_talebi', 'diger') then
    perform public._girdi_hatasi('gecersiz_neden');
  end if;
  if p_neden = 'diger' and char_length(btrim(coalesce(p_aciklama, ''))) = 0 then
    perform public._girdi_hatasi('aciklama_gerekli');
  end if;
  if char_length(coalesce(p_aciklama, '')) > 500 then
    perform public._girdi_hatasi('gecersiz_aciklama');
  end if;
end;
$$;

revoke all on function public._yonetici_gerekli() from public, anon, authenticated;
revoke all on function public._islem_yaz(boolean, text, jsonb, jsonb, text, text) from public, anon, authenticated;
revoke all on function public._neden_denetle(text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- denemeleri_haric_tut: denemeleri ve/veya katılımcıları hariç tutar.
--   p_kural: önizlemesi yapılan kuralın tanımı (işlem kaydı için; ör.
--            {"kural": "uzun_sure", "esik_sn": 30}); elle seçimde null.
-- Yalnızca henüz hariç tutulmamış kayıtlar değişir; sayılar döndürülür.
-- ---------------------------------------------------------------------
create function public.denemeleri_haric_tut(
  p_deneme_idler    bigint[],
  p_katilimci_idler uuid[],
  p_neden           text,
  p_aciklama        text,
  p_kural           jsonb,
  p_demo            boolean default false
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_denemeler   bigint[];
  v_katilimcilar uuid[];
  v_islem_id    bigint;
begin
  perform public._yonetici_gerekli();
  perform public._neden_denetle(p_neden, p_aciklama);
  if coalesce(cardinality(p_deneme_idler), 0) + coalesce(cardinality(p_katilimci_idler), 0) = 0 then
    perform public._girdi_hatasi('bos_secim');
  end if;
  if coalesce(cardinality(p_deneme_idler), 0) > 50000 or coalesce(cardinality(p_katilimci_idler), 0) > 10000 then
    perform public._girdi_hatasi('cok_buyuk_secim');
  end if;

  execute format($q$
    with g as (
      update %s set haric_tutuldu = true, haric_nedeni = $2, haric_aciklama = nullif(btrim($3), '')
      where deneme_id = any ($1) and not haric_tutuldu
      returning deneme_id)
    select coalesce(array_agg(deneme_id order by deneme_id), '{}') from g$q$, public._tablo(p_demo, 'denemeler'))
    into v_denemeler
    using coalesce(p_deneme_idler, '{}'), p_neden, p_aciklama;

  execute format($q$
    with g as (
      update %s set haric_tutuldu = true, haric_nedeni = $2, haric_aciklama = nullif(btrim($3), '')
      where katilimci_id = any ($1) and not haric_tutuldu
      returning katilimci_id)
    select coalesce(array_agg(katilimci_id), '{}') from g$q$, public._tablo(p_demo, 'katilimcilar'))
    into v_katilimcilar
    using coalesce(p_katilimci_idler, '{}'), p_neden, p_aciklama;

  v_islem_id := public._islem_yaz(p_demo, 'haric_tut', p_kural,
    jsonb_build_object('deneme_idler', to_jsonb(v_denemeler), 'katilimci_idler', to_jsonb(v_katilimcilar)),
    p_neden, nullif(btrim(p_aciklama), ''));

  return jsonb_build_object('islem_id', v_islem_id,
                            'deneme_sayisi', cardinality(v_denemeler),
                            'katilimci_sayisi', cardinality(v_katilimcilar));
end;
$$;

-- ---------------------------------------------------------------------
-- haric_tutmayi_geri_al: işaretleri kaldırır (veri zaten silinmemiştir).
-- ---------------------------------------------------------------------
create function public.haric_tutmayi_geri_al(
  p_deneme_idler    bigint[],
  p_katilimci_idler uuid[],
  p_demo            boolean default false
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_denemeler    jsonb;
  v_katilimcilar jsonb;
  v_islem_id     bigint;
begin
  perform public._yonetici_gerekli();
  if coalesce(cardinality(p_deneme_idler), 0) + coalesce(cardinality(p_katilimci_idler), 0) = 0 then
    perform public._girdi_hatasi('bos_secim');
  end if;

  -- Geri alınan kayıtların önceki nedenleri de işlem kaydına yazılır.
  execute format($q$
    with g as (
      update %1$s d set haric_tutuldu = false, haric_nedeni = null, haric_aciklama = null
      from %1$s eski
      where d.deneme_id = eski.deneme_id and d.deneme_id = any ($1) and d.haric_tutuldu
      returning d.deneme_id, eski.haric_nedeni)
    select coalesce(jsonb_agg(jsonb_build_object('deneme_id', deneme_id, 'onceki_neden', haric_nedeni)), '[]') from g$q$,
    public._tablo(p_demo, 'denemeler'))
    into v_denemeler
    using coalesce(p_deneme_idler, '{}');

  execute format($q$
    with g as (
      update %1$s k set haric_tutuldu = false, haric_nedeni = null, haric_aciklama = null
      from %1$s eski
      where k.katilimci_id = eski.katilimci_id and k.katilimci_id = any ($1) and k.haric_tutuldu
      returning k.katilimci_id, eski.haric_nedeni)
    select coalesce(jsonb_agg(jsonb_build_object('katilimci_id', katilimci_id, 'onceki_neden', haric_nedeni)), '[]') from g$q$,
    public._tablo(p_demo, 'katilimcilar'))
    into v_katilimcilar
    using coalesce(p_katilimci_idler, '{}');

  v_islem_id := public._islem_yaz(p_demo, 'haric_geri_al', null,
    jsonb_build_object('denemeler', v_denemeler, 'katilimcilar', v_katilimcilar), null, null);

  return jsonb_build_object('islem_id', v_islem_id,
                            'deneme_sayisi', jsonb_array_length(v_denemeler),
                            'katilimci_sayisi', jsonb_array_length(v_katilimcilar));
end;
$$;

-- ---------------------------------------------------------------------
-- deneme_sil: tek denemeyi kalıcı siler (olaylar, izler, özet birlikte).
-- Çift onay: panel önce sorar; fonksiyon da katılımcı kodunun ve deneme
-- numarasının yeniden yazılmasını ister (p_onay = 'KOD-n').
-- İşlem kaydında yalnızca kod, deneme no ve silinen kayıt sayıları kalır.
-- ---------------------------------------------------------------------
create function public.deneme_sil(
  p_katilimci_kodu text,
  p_deneme_no      integer,
  p_onay           text,
  p_demo           boolean default false
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_deneme_id bigint;
  v_olay      integer;
  v_iz        integer;
  v_ozet      integer;
  v_islem_id  bigint;
begin
  perform public._yonetici_gerekli();
  if p_onay is distinct from (p_katilimci_kodu || '-' || p_deneme_no) then
    perform public._girdi_hatasi('onay_uyusmuyor');
  end if;

  execute format($q$
    select d.deneme_id from %s d join %s k using (katilimci_id)
    where k.katilimci_kodu = $1 and d.deneme_no = $2$q$,
    public._tablo(p_demo, 'denemeler'), public._tablo(p_demo, 'katilimcilar'))
    into v_deneme_id
    using p_katilimci_kodu, p_deneme_no;
  if v_deneme_id is null then
    perform public._girdi_hatasi('deneme_bulunamadi');
  end if;

  execute format('select count(*) from %s where deneme_id = $1', public._tablo(p_demo, 'olaylar')) into v_olay using v_deneme_id;
  execute format('select count(*) from %s where deneme_id = $1', public._tablo(p_demo, 'izler')) into v_iz using v_deneme_id;
  execute format('select count(*) from %s where deneme_id = $1', public._tablo(p_demo, 'deneme_ozetleri')) into v_ozet using v_deneme_id;
  execute format('delete from %s where deneme_id = $1', public._tablo(p_demo, 'denemeler')) using v_deneme_id;

  v_islem_id := public._islem_yaz(p_demo, 'deneme_sil', null,
    jsonb_build_object('katilimci_kodu', p_katilimci_kodu, 'deneme_no', p_deneme_no,
                       'deneme', 1, 'ozet', v_ozet, 'olay', v_olay, 'iz', v_iz),
    null, null);
  return jsonb_build_object('islem_id', v_islem_id, 'olay', v_olay, 'iz', v_iz, 'ozet', v_ozet);
end;
$$;

-- ---------------------------------------------------------------------
-- katilimci_sil: katılımcıyı ve bütün verisini kalıcı siler.
-- Çift onay: p_onay katılımcı kodunun aynısı olmalı.
-- ---------------------------------------------------------------------
create function public.katilimci_sil(
  p_katilimci_kodu text,
  p_onay           text,
  p_demo           boolean default false
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id       uuid;
  v_sayilar  jsonb := '{}'::jsonb;
  v_n        integer;
  v_tablo    text;
  v_islem_id bigint;
begin
  perform public._yonetici_gerekli();
  if p_onay is distinct from p_katilimci_kodu then
    perform public._girdi_hatasi('onay_uyusmuyor');
  end if;

  execute format('select katilimci_id from %s where katilimci_kodu = $1', public._tablo(p_demo, 'katilimcilar'))
    into v_id using p_katilimci_kodu;
  if v_id is null then
    perform public._girdi_hatasi('katilimci_bulunamadi');
  end if;

  foreach v_tablo in array array['denemeler', 'olaylar', 'izler', 'tercihler'] loop
    execute format('select count(*) from %s where katilimci_id = $1', public._tablo(p_demo, v_tablo))
      into v_n using v_id;
    v_sayilar := v_sayilar || jsonb_build_object(v_tablo, v_n);
  end loop;
  execute format($q$select count(*) from %s o join %s d using (deneme_id) where d.katilimci_id = $1$q$,
                 public._tablo(p_demo, 'deneme_ozetleri'), public._tablo(p_demo, 'denemeler'))
    into v_n using v_id;
  v_sayilar := v_sayilar || jsonb_build_object('deneme_ozetleri', v_n);

  execute format('delete from %s where katilimci_id = $1', public._tablo(p_demo, 'katilimcilar')) using v_id;

  v_islem_id := public._islem_yaz(p_demo, 'katilimci_sil', null,
    jsonb_build_object('katilimci_kodu', p_katilimci_kodu) || v_sayilar, null, null);
  return jsonb_build_object('islem_id', v_islem_id) || v_sayilar;
end;
$$;

-- ---------------------------------------------------------------------
-- ozetleri_guncelle: özetleri ham olaylardan yeniden hesaplanmış
-- değerlerle günceller (panel, site/js/ozet.js ile hesaplar).
-- Ham olaylara dokunulmaz; yalnızca türetilmiş özet satırı değişir.
--   p_ozetler: [{ "deneme_id": 12, "ozet": { ... } }, ...]
-- ---------------------------------------------------------------------
create function public.ozetleri_guncelle(
  p_ozetler jsonb,
  p_neden   text,
  p_demo    boolean default false
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tablo    text := public._tablo(p_demo, 'deneme_ozetleri');
  v_n        integer;
  v_surumler jsonb;
  v_islem_id bigint;
begin
  perform public._yonetici_gerekli();
  if p_ozetler is null or jsonb_typeof(p_ozetler) <> 'array' or jsonb_array_length(p_ozetler) = 0
     or jsonb_array_length(p_ozetler) > 20000 then
    perform public._girdi_hatasi('gecersiz_ozetler');
  end if;
  if exists (select 1 from jsonb_array_elements(p_ozetler) e
             where jsonb_typeof(e -> 'deneme_id') <> 'number' or jsonb_typeof(e -> 'ozet') <> 'object') then
    perform public._girdi_hatasi('gecersiz_ozetler');
  end if;

  -- Satır silinip yeniden yazılır: sonuc ve zorluk_puani denemeler tablosundan gelir.
  execute format($q$
    delete from %s o
    where o.deneme_id in (select (e ->> 'deneme_id')::bigint from jsonb_array_elements($1) e)$q$, v_tablo)
    using p_ozetler;

  execute format($q$
    with girdi as (
      select distinct on ((e ->> 'deneme_id')::bigint) (e ->> 'deneme_id')::bigint as deneme_id, e -> 'ozet' as ozet
      from jsonb_array_elements($1) e
    )
    insert into %1$s
    select (r).* from (
      select jsonb_populate_record(
               null::%1$s,
               (g.ozet - 'deneme_id' - 'hesaplanma_zamani')
               || jsonb_build_object('deneme_id', d.deneme_id, 'sonuc', d.sonuc,
                                     'zorluk_puani', d.zorluk_puani, 'hesaplanma_zamani', now())
             ) as r
      from girdi g join %2$s d using (deneme_id)
    ) s$q$, v_tablo, public._tablo(p_demo, 'denemeler'))
    using p_ozetler;
  get diagnostics v_n = row_count;

  select coalesce(jsonb_agg(distinct e -> 'ozet' -> 'ozet_surumu'), '[]') into v_surumler
  from jsonb_array_elements(p_ozetler) e;

  v_islem_id := public._islem_yaz(p_demo, 'ozet_guncelle', jsonb_build_object('ozet_surumleri', v_surumler),
    jsonb_build_object('deneme_sayisi', v_n), p_neden, null);
  return jsonb_build_object('islem_id', v_islem_id, 'guncellenen', v_n);
end;
$$;

-- ---------------------------------------------------------------------
-- disa_aktarim_kaydet: dışa aktarma ve tam yedek işlem kaydına yazılır
-- (panel "son yedekten bu yana geçen süre"yi buradan gösterir).
-- ---------------------------------------------------------------------
create function public.disa_aktarim_kaydet(
  p_tur    text,
  p_bicim  text,
  p_satir  integer,
  p_filtre jsonb,
  p_demo   boolean default false
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform public._yonetici_gerekli();
  if p_tur is null or char_length(p_tur) > 40 or p_bicim not in ('csv', 'xlsx', 'json') then
    perform public._girdi_hatasi('gecersiz_disa_aktarim');
  end if;
  return public._islem_yaz(p_demo, case when p_tur = 'tam_yedek' then 'tam_yedek' else 'disa_aktar' end,
    p_filtre, jsonb_build_object('tur', p_tur, 'bicim', p_bicim, 'satir', p_satir), null, null);
end;
$$;

-- ---------------------------------------------------------------------
-- Yetkiler: yalnızca giriş yapmış kullanıcı çağırabilir; fonksiyonlar
-- içeride yonetici_mi() denetler.
-- ---------------------------------------------------------------------
revoke all on function public.denemeleri_haric_tut(bigint[], uuid[], text, text, jsonb, boolean) from public, anon;
revoke all on function public.haric_tutmayi_geri_al(bigint[], uuid[], boolean) from public, anon;
revoke all on function public.deneme_sil(text, integer, text, boolean) from public, anon;
revoke all on function public.katilimci_sil(text, text, boolean) from public, anon;
revoke all on function public.ozetleri_guncelle(jsonb, text, boolean) from public, anon;
revoke all on function public.disa_aktarim_kaydet(text, text, integer, jsonb, boolean) from public, anon;

grant execute on function public.denemeleri_haric_tut(bigint[], uuid[], text, text, jsonb, boolean) to authenticated;
grant execute on function public.haric_tutmayi_geri_al(bigint[], uuid[], boolean) to authenticated;
grant execute on function public.deneme_sil(text, integer, text, boolean) to authenticated;
grant execute on function public.katilimci_sil(text, text, boolean) to authenticated;
grant execute on function public.ozetleri_guncelle(jsonb, text, boolean) to authenticated;
grant execute on function public.disa_aktarim_kaydet(text, text, integer, jsonb, boolean) to authenticated;
