-- =====================================================================
-- 3. Migrasyon: katılımcı fonksiyonları
-- ---------------------------------------------------------------------
-- Tarayıcının (anon rolü) çağırabildiği yalnızca dört fonksiyon vardır:
--   katilimci_olustur, deneme_kaydet, tercih_kaydet, katilimci_bitir
--
-- Hepsi:
--   * security definer çalışır (tablolara sahibin yetkisiyle yazar),
--   * set search_path = '' ile yazılır (her ad şema önekiyle verilir),
--   * girdiyi kendi içinde doğrular,
--   * p_demo = true ise test_ önekli tablolara yazar.
--
-- Katılımcı UUID'si yetki belirteci gibidir: kayıt yazmak için gereklidir
-- ve yalnızca o katılımcının satırlarına dokunur. Katılımcı kodu UUID
-- yerine kullanılamaz.
--
-- Hata kodları: girdi hataları SQLSTATE 22023 ile döner (PostgREST 400).
-- Mesajın ilk sözcüğü makinece okunur bir koddur (örn. 'gecersiz_yas').
-- =====================================================================


-- ---------------------------------------------------------------------
-- Yardımcı: demo bayrağına göre tam tablo adını döndürür.
--   _tablo(false, 'denemeler') → public.denemeler
--   _tablo(true,  'denemeler') → public.test_denemeler
-- ---------------------------------------------------------------------
create function public._tablo(p_demo boolean, p_ad text)
returns text
language sql
immutable
set search_path = ''
as $$
  select format('public.%I', case when p_demo then 'test_' else '' end || p_ad);
$$;


-- ---------------------------------------------------------------------
-- Yardımcı: girdi hatası fırlatır.
-- ---------------------------------------------------------------------
create function public._girdi_hatasi(p_kod text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = '22023', message = p_kod;
end;
$$;


-- ---------------------------------------------------------------------
-- Yardımcı: 8 karakterlik katılımcı kodu üretir.
-- Karıştırılan karakterler (0, O, 1, I) alfabede yoktur.
-- Rastgelelik gen_random_uuid()'nin kriptografik baytlarından gelir.
-- ---------------------------------------------------------------------
create function public._kod_uret()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_alfabe constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- 32 karakter
  v_bayt   bytea := uuid_send(gen_random_uuid());
  v_kod    text := '';
begin
  for i in 0..7 loop
    -- 256, 32'ye tam bölündüğü için mod alma dağılımı bozmaz.
    v_kod := v_kod || substr(v_alfabe, (get_byte(v_bayt, i) % 32) + 1, 1);
  end loop;
  return v_kod;
end;
$$;


-- ---------------------------------------------------------------------
-- Yardımcı: katılımcının etkinliğini işler (deneme_kaydet, tercih_kaydet,
-- katilimci_bitir çağırır).
--   * son_etkinlik_zamani güncellenir.
--   * 'birakti' durumundaki katılımcı geri dönmüşse 'devam_ediyor' yapılır;
--     bu arada sıra numarası başka bir katılımcıya verilmişse
--     sira_cakismasi işaretlenir (proje kararları).
-- Çağıran, katılımcı satırını önceden 'for update' ile kilitlemiş olmalıdır.
-- ---------------------------------------------------------------------
create function public._etkinlik_isle(p_demo boolean, p_katilimci_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_katilimcilar text := public._tablo(p_demo, 'katilimcilar');
  v_dakika       integer;
  v_k            record;
  v_cakisma      boolean;
begin
  select sira_bosalma_dakika into v_dakika from public.deney_ayarlari;

  execute format('select durum, cihaz, sira_no from %s where katilimci_id = $1', v_katilimcilar)
    into v_k using p_katilimci_id;

  if v_k.durum = 'birakti' then
    -- Aynı numarayı şu an tutan başka bir katılımcı var mı?
    execute format($q$
      select exists (
        select 1 from %s b
        where b.katilimci_id <> $1
          and b.cihaz = $2
          and b.sira_no = $3
          and not b.haric_tutuldu
          and not b.sira_cakismasi
          and (b.durum = 'tamamladi'
               or (b.durum = 'devam_ediyor'
                   and b.son_etkinlik_zamani >= now() - make_interval(mins => $4)))
      )$q$, v_katilimcilar)
      into v_cakisma using p_katilimci_id, v_k.cihaz, v_k.sira_no, v_dakika;

    execute format($q$
      update %s set durum = 'devam_ediyor', sira_cakismasi = sira_cakismasi or $2
      where katilimci_id = $1$q$, v_katilimcilar)
      using p_katilimci_id, coalesce(v_cakisma, false);
  end if;

  execute format('update %s set son_etkinlik_zamani = now() where katilimci_id = $1', v_katilimcilar)
    using p_katilimci_id;
end;
$$;


-- ---------------------------------------------------------------------
-- Yardımcı: katılımcıyı kilitleyerek bulur; yoksa hata verir.
-- ---------------------------------------------------------------------
create function public._katilimci_kilitle(p_demo boolean, p_katilimci_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_var boolean;
begin
  if p_katilimci_id is null then
    perform public._girdi_hatasi('katilimci_bulunamadi');
  end if;
  execute format('select true from %s where katilimci_id = $1 for update',
                 public._tablo(p_demo, 'katilimcilar'))
    into v_var using p_katilimci_id;
  if v_var is null then
    perform public._girdi_hatasi('katilimci_bulunamadi');
  end if;
end;
$$;


-- =====================================================================
-- katilimci_olustur
-- ---------------------------------------------------------------------
-- Anket bittikten sonra bir kez çağrılır. Kilit altında:
--   1. kötüye kullanım frenini denetler (son 1 dakikada en çok 30 katılımcı),
--   2. etkinliği kesilmiş katılımcıları 'birakti' yapar,
--   3. o cihaz türünde boştaki en küçük sıra numarasını (k) verir,
--   4. dizi = k mod 6, blok = k div 6, kaydırma = (k + blok) mod 6 hesaplar,
--   5. alıştırma dahil 7 deneme satırını yazar,
--   6. planı tarayıcıya döndürür.
--
-- Bir sıra numarasını tutanlar: tamamlamış ve hariç tutulmamış olanlar;
-- son 30 dakikada etkinliği olan devam edenler. Sıra çakışması işaretli
-- katılımcılar numara tutmaz.
-- Demo katılımcıları (p_demo) aynı kuralla ama test_ tablolarında numara
-- alır; gerçek numaraları tüketmez.
-- =====================================================================
create function public.katilimci_olustur(
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
  v_yas          integer;
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

  -- Yaş: tam sayı, 18–99.
  if coalesce(jsonb_typeof(p_anket -> 'yas'), '') <> 'number'
     or (p_anket ->> 'yas')::numeric <> trunc((p_anket ->> 'yas')::numeric)
     or (p_anket ->> 'yas')::numeric not between 18 and 99 then
    perform public._girdi_hatasi('gecersiz_yas');
  end if;
  v_yas := (p_anket ->> 'yas')::integer;

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
      yas, cinsiyet, alisveris_sikligi, alisveris_cihazi, katilim_cihazi, renk_ayirt_zorlugu,
      cihaz_uyusmazligi, sira_no, dizi_no, urun_kaydirmasi, uygulama_surumu
    ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
    returning katilimci_id$q$, v_katilimcilar)
    into v_id
    using v_kod, p_cihaz, p_tablet_mi, p_cihaz_tespiti,
          v_yas, p_anket ->> 'cinsiyet', p_anket ->> 'alisveris_sikligi',
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


-- =====================================================================
-- deneme_kaydet
-- ---------------------------------------------------------------------
-- Bir deneme bittikten sonra deneme bilgisi, özet, olaylar ve izler tek
-- pakette gönderilir. Koşul ve ürün tarayıcıdan ALINMAZ; katilimci_olustur'un
-- yazdığı plan satırı güncellenir.
--
-- İdempotent (proje kararları):
--   * Deneme bilgisi ve özet yalnızca ilk kayıtta yazılır (sonuc boşken).
--   * Olaylar olay_id çakışmasında yok sayılır.
--   * İzler (deneme, sayfa, iz türü) çakışmasında yok sayılır; eksik izler
--     sonraki gönderimle tamamlanır.
--   * iz_eksik yalnızca true → false yönünde değişebilir.
--
-- Paket biçimi (p_paket):
-- {
--   "deneme_no": 1, "sonuc": "basarili", "zorluk_puani": 6, "iz_eksik": false,
--   "ekran_genislik": 1920, "ekran_yukseklik": 1080, "pencere_genislik": 1440,
--   "pencere_yukseklik": 900, "cihaz_piksel_orani": 2, "tarayici_bilgisi": "...",
--   "buton_ilk_gorunur": true, "buton_x": 100, "buton_y": 300,
--   "buton_genislik": 220, "buton_yukseklik": 48,
--   "ozet":   { "tiklama_suresi_ms": 1234.5, ... },
--   "olaylar": [ { "olay_id": "uuid", "sayfa": "urun", "olay_turu": "tiklama",
--                  "zaman_ms": 2345.6, "x": 10, "y": 20, "hedef_oge": "hedef-buton",
--                  "giris_turu": "fare", "ek": {...} }, ... ],
--   "izler":  [ { "sayfa": "urun", "iz_turu": "fare", "ornekler": [[t, x, y], ...] } ]
-- }
-- =====================================================================
create function public.deneme_kaydet(
  p_katilimci_id uuid,
  p_paket        jsonb,
  p_demo         boolean default false
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
  v_ozetler      text := public._tablo(p_demo, 'deneme_ozetleri');
  v_olaylar      text := public._tablo(p_demo, 'olaylar');
  v_izler        text := public._tablo(p_demo, 'izler');
  v_ayar         public.deney_ayarlari;
  v_deneme_no    integer;
  v_d            record;
  v_cihaz        text;
  v_yeni         boolean;
  v_olay_dizisi  jsonb;
  v_iz_dizisi    jsonb;
  v_hatali       integer;
  v_eklenen_olay integer := 0;
  v_eklenen_iz   integer := 0;
  v_toplam_olay  integer;
  v_anahtar      text;
  v_deger        jsonb;
begin
  select * into v_ayar from public.deney_ayarlari;

  -- ---- Boyut ve biçim ----
  if p_paket is null or jsonb_typeof(p_paket) <> 'object' then
    perform public._girdi_hatasi('gecersiz_paket');
  end if;
  if octet_length(p_paket::text) > v_ayar.deneme_maks_bayt then
    perform public._girdi_hatasi('paket_cok_buyuk');
  end if;

  perform public._katilimci_kilitle(p_demo, p_katilimci_id);

  if coalesce(jsonb_typeof(p_paket -> 'deneme_no'), '') <> 'number'
     or (p_paket ->> 'deneme_no')::numeric not in (0, 1, 2, 3, 4, 5, 6) then
    perform public._girdi_hatasi('gecersiz_deneme_no');
  end if;
  v_deneme_no := (p_paket ->> 'deneme_no')::integer;

  -- Plan satırı (koşul ve ürün buradan gelir).
  execute format($q$
    select d.deneme_id, d.kosul_kodu, d.urun_kodu, d.sonuc
    from %s d where d.katilimci_id = $1 and d.deneme_no = $2$q$, v_denemeler)
    into v_d using p_katilimci_id, v_deneme_no;
  if v_d.deneme_id is null then
    perform public._girdi_hatasi('deneme_bulunamadi');
  end if;
  execute format('select cihaz from %s where katilimci_id = $1', v_katilimcilar)
    into v_cihaz using p_katilimci_id;

  v_yeni := v_d.sonuc is null;

  -- ---- Olay doğrulaması ----
  v_olay_dizisi := coalesce(p_paket -> 'olaylar', '[]'::jsonb);
  if jsonb_typeof(v_olay_dizisi) <> 'array' then
    perform public._girdi_hatasi('gecersiz_olaylar');
  end if;
  if jsonb_array_length(v_olay_dizisi) > v_ayar.deneme_maks_olay then
    perform public._girdi_hatasi('cok_fazla_olay');
  end if;

  select count(*) into v_hatali
  from jsonb_array_elements(v_olay_dizisi) as e
  where not coalesce(
       jsonb_typeof(e) = 'object'
   and (e ->> 'olay_id') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
   and (e ->> 'olay_turu') = any (v_ayar.olay_turleri)
   and (e ->> 'sayfa') = any (v_ayar.sayfalar)
   and jsonb_typeof(e -> 'zaman_ms') = 'number'
   and (e ->> 'zaman_ms')::double precision between 0 and 3600000
   and (e -> 'x' is null or jsonb_typeof(e -> 'x') = 'null'
        or (jsonb_typeof(e -> 'x') = 'number' and abs((e ->> 'x')::double precision) <= 100000))
   and (e -> 'y' is null or jsonb_typeof(e -> 'y') = 'null'
        or (jsonb_typeof(e -> 'y') = 'number' and abs((e ->> 'y')::double precision) <= 100000))
   and (e ->> 'hedef_oge' is null or char_length(e ->> 'hedef_oge') <= 64)
   and (e ->> 'giris_turu' is null or (e ->> 'giris_turu') in ('fare', 'dokunma', 'kalem'))
   and (e -> 'ek' is null or jsonb_typeof(e -> 'ek') = 'null'
        or (jsonb_typeof(e -> 'ek') = 'object' and octet_length((e -> 'ek')::text) <= 2000)),
   false);
  if v_hatali > 0 then
    perform public._girdi_hatasi('gecersiz_olay');
  end if;

  -- ---- İz doğrulaması ----
  v_iz_dizisi := coalesce(p_paket -> 'izler', '[]'::jsonb);
  if jsonb_typeof(v_iz_dizisi) <> 'array' or jsonb_array_length(v_iz_dizisi) > 16 then
    perform public._girdi_hatasi('gecersiz_izler');
  end if;
  select count(*) into v_hatali
  from jsonb_array_elements(v_iz_dizisi) as i
  where not coalesce(
       jsonb_typeof(i) = 'object'
   and (i ->> 'sayfa') = any (v_ayar.sayfalar)
   and (i ->> 'iz_turu') = any (v_ayar.iz_turleri)
   and jsonb_typeof(i -> 'ornekler') = 'array'
   -- Her örnek [zaman_ms, x, y] biçiminde 3 öğeli bir dizidir; x/y null olabilir.
   and not exists (
     select 1 from jsonb_array_elements(i -> 'ornekler') as o
     where jsonb_typeof(o) <> 'array'
        or jsonb_array_length(o) <> 3
        or jsonb_typeof(o -> 0) <> 'number'
        or (o ->> 0)::double precision not between 0 and 3600000
        or jsonb_typeof(o -> 1) not in ('number', 'null')
        or jsonb_typeof(o -> 2) not in ('number', 'null')
   ),
   false);
  if v_hatali > 0 then
    perform public._girdi_hatasi('gecersiz_iz');
  end if;

  -- ---- Deneme bilgisi ve özet (yalnızca ilk kayıtta) ----
  if v_yeni then
    if coalesce(p_paket ->> 'sonuc', '') <> all (v_ayar.sonuclar) then
      perform public._girdi_hatasi('gecersiz_sonuc');
    end if;
    if p_paket -> 'zorluk_puani' is not null and jsonb_typeof(p_paket -> 'zorluk_puani') <> 'null'
       and (jsonb_typeof(p_paket -> 'zorluk_puani') <> 'number'
            or (p_paket ->> 'zorluk_puani')::numeric not in (1, 2, 3, 4, 5, 6, 7)) then
      perform public._girdi_hatasi('gecersiz_zorluk_puani');
    end if;
    if char_length(coalesce(p_paket ->> 'tarayici_bilgisi', '')) > 400 then
      perform public._girdi_hatasi('gecersiz_tarayici_bilgisi');
    end if;
    -- Sayısal ekran ve buton alanları: sayı ya da boş, makul aralıkta.
    foreach v_anahtar in array array['ekran_genislik', 'ekran_yukseklik', 'pencere_genislik',
                                     'pencere_yukseklik', 'cihaz_piksel_orani',
                                     'buton_x', 'buton_y', 'buton_genislik', 'buton_yukseklik'] loop
      v_deger := p_paket -> v_anahtar;
      if v_deger is not null and jsonb_typeof(v_deger) <> 'null'
         and (jsonb_typeof(v_deger) <> 'number' or abs((v_deger #>> '{}')::double precision) > 100000) then
        perform public._girdi_hatasi('gecersiz_' || v_anahtar);
      end if;
    end loop;
    if p_paket -> 'buton_ilk_gorunur' is not null
       and jsonb_typeof(p_paket -> 'buton_ilk_gorunur') not in ('boolean', 'null') then
      perform public._girdi_hatasi('gecersiz_buton_ilk_gorunur');
    end if;

    -- Özet: nesne olmalı; "_ms" ile biten alanlar 0–3.600.000 aralığında,
    -- sayaçlar ve kaydırma negatif olamaz.
    if p_paket -> 'ozet' is null or jsonb_typeof(p_paket -> 'ozet') <> 'object'
       or octet_length((p_paket -> 'ozet')::text) > 4000 then
      perform public._girdi_hatasi('gecersiz_ozet');
    end if;
    for v_anahtar, v_deger in select key, value from jsonb_each(p_paket -> 'ozet') loop
      if jsonb_typeof(v_deger) = 'number' and (
           (right(v_anahtar, 3) = '_ms' and (v_deger #>> '{}')::double precision not between 0 and 3600000)
           or ((v_deger #>> '{}')::double precision < 0)) then
        perform public._girdi_hatasi('gecersiz_ozet_' || v_anahtar);
      end if;
    end loop;

    execute format($q$
      update %s set
        sonuc              = $2 ->> 'sonuc',
        zorluk_puani       = ($2 ->> 'zorluk_puani')::smallint,
        ekran_genislik     = round(($2 ->> 'ekran_genislik')::numeric)::integer,
        ekran_yukseklik    = round(($2 ->> 'ekran_yukseklik')::numeric)::integer,
        pencere_genislik   = round(($2 ->> 'pencere_genislik')::numeric)::integer,
        pencere_yukseklik  = round(($2 ->> 'pencere_yukseklik')::numeric)::integer,
        cihaz_piksel_orani = ($2 ->> 'cihaz_piksel_orani')::real,
        tarayici_bilgisi   = $2 ->> 'tarayici_bilgisi',
        buton_ilk_gorunur  = ($2 ->> 'buton_ilk_gorunur')::boolean,
        buton_x            = ($2 ->> 'buton_x')::real,
        buton_y            = ($2 ->> 'buton_y')::real,
        buton_genislik     = ($2 ->> 'buton_genislik')::real,
        buton_yukseklik    = ($2 ->> 'buton_yukseklik')::real,
        iz_eksik           = coalesce(($2 ->> 'iz_eksik')::boolean, false),
        kayit_zamani       = now()
      where deneme_id = $1$q$, v_denemeler)
      using v_d.deneme_id, p_paket;

    -- Özet satırı: bilinen alanlar alınır, bilinmeyenler yok sayılır.
    -- deneme_id, sonuc ve zorluk_puani her zaman sunucu tarafından yazılır.
    execute format($q$
      insert into %1$s
      select (r).* from (
        select jsonb_populate_record(
                 null::%1$s,
                 ($2 - 'deneme_id' - 'hesaplanma_zamani')
                 || jsonb_build_object('deneme_id', $1,
                                       'sonuc', $3 ->> 'sonuc',
                                       'zorluk_puani', $3 -> 'zorluk_puani',
                                       'hesaplanma_zamani', now())
               ) as r
      ) s
      on conflict (deneme_id) do nothing$q$, v_ozetler)
      using v_d.deneme_id, p_paket -> 'ozet', p_paket;
  else
    -- Tekrar gönderim: yalnızca iz_eksik true → false olabilir.
    if jsonb_typeof(p_paket -> 'iz_eksik') = 'boolean' and not (p_paket ->> 'iz_eksik')::boolean then
      execute format('update %s set iz_eksik = false where deneme_id = $1', v_denemeler)
        using v_d.deneme_id;
    end if;
  end if;

  -- ---- Olaylar ----
  -- katilimci_id, deneme_no, cihaz, kosul_kodu ve urun_kodu sunucuda doldurulur.
  execute format($q$
    insert into %s (olay_id, deneme_id, katilimci_id, deneme_no, cihaz, kosul_kodu, urun_kodu,
                    sayfa, olay_turu, zaman_ms, x, y, hedef_oge, giris_turu, ek)
    select (e ->> 'olay_id')::uuid, $1, $2, $3, $4, $5, $6,
           e ->> 'sayfa', e ->> 'olay_turu', (e ->> 'zaman_ms')::double precision,
           (e ->> 'x')::real, (e ->> 'y')::real, e ->> 'hedef_oge', e ->> 'giris_turu',
           case when jsonb_typeof(e -> 'ek') = 'object' then e -> 'ek' end
    from jsonb_array_elements($7) as e
    on conflict (olay_id) do nothing$q$, v_olaylar)
    using v_d.deneme_id, p_katilimci_id, v_deneme_no, v_cihaz, v_d.kosul_kodu, v_d.urun_kodu,
          v_olay_dizisi;
  get diagnostics v_eklenen_olay = row_count;

  execute format('select count(*) from %s where deneme_id = $1', v_olaylar)
    into v_toplam_olay using v_d.deneme_id;
  if v_toplam_olay > v_ayar.deneme_maks_olay then
    perform public._girdi_hatasi('cok_fazla_olay');
  end if;

  -- ---- İzler ----
  execute format($q$
    insert into %s (deneme_id, katilimci_id, deneme_no, sayfa, iz_turu, ornekler, ornek_sayisi)
    select $1, $2, $3, i ->> 'sayfa', i ->> 'iz_turu', i -> 'ornekler', jsonb_array_length(i -> 'ornekler')
    from jsonb_array_elements($4) as i
    on conflict (deneme_id, sayfa, iz_turu) do nothing$q$, v_izler)
    using v_d.deneme_id, p_katilimci_id, v_deneme_no, v_iz_dizisi;
  get diagnostics v_eklenen_iz = row_count;

  perform public._etkinlik_isle(p_demo, p_katilimci_id);

  return jsonb_build_object(
    'deneme_no', v_deneme_no,
    'yeni_kayit', v_yeni,
    'eklenen_olay', v_eklenen_olay,
    'eklenen_iz', v_eklenen_iz
  );
end;
$$;


-- =====================================================================
-- tercih_kaydet
-- ---------------------------------------------------------------------
-- En çok ve en az beğenilen koşul, isteğe bağlı "Neden?" metni ve
-- önizlemelerin gösterim sırası. Katılımcı başına bir kez; tekrar
-- gönderim sessizce yok sayılır.
-- =====================================================================
create function public.tercih_kaydet(
  p_katilimci_id    uuid,
  p_en_cok_kosul    text,
  p_en_az_kosul     text,
  p_neden           text,
  p_gosterim_sirasi text[],
  p_demo            boolean default false
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_ayar  public.deney_ayarlari;
  v_sayi  integer;
begin
  select * into v_ayar from public.deney_ayarlari;
  perform public._katilimci_kilitle(p_demo, p_katilimci_id);

  if p_en_cok_kosul is null or not (p_en_cok_kosul = any (v_ayar.kosul_kodlari)) then
    perform public._girdi_hatasi('gecersiz_en_cok_kosul');
  end if;
  if p_en_az_kosul is null or not (p_en_az_kosul = any (v_ayar.kosul_kodlari)) then
    perform public._girdi_hatasi('gecersiz_en_az_kosul');
  end if;
  if p_en_cok_kosul = p_en_az_kosul then
    perform public._girdi_hatasi('ayni_kosul_secildi');
  end if;
  if char_length(coalesce(p_neden, '')) > 500 then
    perform public._girdi_hatasi('neden_cok_uzun');
  end if;
  -- Gösterim sırası, 6 koşul kodunun bir permütasyonu olmalı.
  if p_gosterim_sirasi is null
     or cardinality(p_gosterim_sirasi) <> 6
     or (select array_agg(k order by k) from unnest(p_gosterim_sirasi) k)
        is distinct from (select array_agg(k order by k) from unnest(v_ayar.kosul_kodlari) k) then
    perform public._girdi_hatasi('gecersiz_gosterim_sirasi');
  end if;

  execute format($q$
    insert into %s (katilimci_id, en_cok_kosul, en_az_kosul, neden, gosterim_sirasi)
    values ($1, $2, $3, nullif($4, ''), $5)
    on conflict (katilimci_id) do nothing$q$, public._tablo(p_demo, 'tercihler'))
    using p_katilimci_id, p_en_cok_kosul, p_en_az_kosul, p_neden, p_gosterim_sirasi;
  get diagnostics v_sayi = row_count;

  perform public._etkinlik_isle(p_demo, p_katilimci_id);
  return jsonb_build_object('yeni_kayit', v_sayi = 1);
end;
$$;


-- =====================================================================
-- katilimci_bitir
-- ---------------------------------------------------------------------
-- Bekleyen bütün veriler gönderildikten sonra çağrılır. 6 deneme
-- (1–6) kaydedilmemişse reddeder; böylece 'tamamladi' durumu her zaman
-- 6 denemenin veritabanında olduğu anlamına gelir.
-- =====================================================================
create function public.katilimci_bitir(
  p_katilimci_id uuid,
  p_demo         boolean default false
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_kaydedilen integer;
  v_kod        text;
begin
  perform public._katilimci_kilitle(p_demo, p_katilimci_id);

  execute format($q$
    select count(*) from %s
    where katilimci_id = $1 and deneme_no between 1 and 6 and sonuc is not null$q$,
    public._tablo(p_demo, 'denemeler'))
    into v_kaydedilen using p_katilimci_id;
  if v_kaydedilen < 6 then
    perform public._girdi_hatasi('eksik_deneme');
  end if;

  perform public._etkinlik_isle(p_demo, p_katilimci_id);

  execute format($q$
    update %s set durum = 'tamamladi', bitis_zamani = coalesce(bitis_zamani, now())
    where katilimci_id = $1
    returning katilimci_kodu$q$, public._tablo(p_demo, 'katilimcilar'))
    into v_kod using p_katilimci_id;

  return jsonb_build_object('durum', 'tamamladi', 'katilimci_kodu', v_kod);
end;
$$;


-- ---------------------------------------------------------------------
-- Yetkiler: önce herkesten geri al, sonra yalnızca gerekene ver.
-- security definer fonksiyonun yetki listesi güvenlik sınırıdır.
-- ---------------------------------------------------------------------
revoke execute on function public._tablo(boolean, text)                 from public, anon, authenticated;
revoke execute on function public._girdi_hatasi(text)                   from public, anon, authenticated;
revoke execute on function public._kod_uret()                           from public, anon, authenticated;
revoke execute on function public._etkinlik_isle(boolean, uuid)         from public, anon, authenticated;
revoke execute on function public._katilimci_kilitle(boolean, uuid)     from public, anon, authenticated;
revoke execute on function public.katilimci_olustur(text, boolean, jsonb, jsonb, text, boolean) from public, anon, authenticated;
revoke execute on function public.deneme_kaydet(uuid, jsonb, boolean)   from public, anon, authenticated;
revoke execute on function public.tercih_kaydet(uuid, text, text, text, text[], boolean) from public, anon, authenticated;
revoke execute on function public.katilimci_bitir(uuid, boolean)        from public, anon, authenticated;

grant execute on function public.katilimci_olustur(text, boolean, jsonb, jsonb, text, boolean) to anon, authenticated;
grant execute on function public.deneme_kaydet(uuid, jsonb, boolean)   to anon, authenticated;
grant execute on function public.tercih_kaydet(uuid, text, text, text, text[], boolean) to anon, authenticated;
grant execute on function public.katilimci_bitir(uuid, boolean)        to anon, authenticated;
