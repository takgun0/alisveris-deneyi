-- =====================================================================
-- 2. Migrasyon: erişim kuralları
-- ---------------------------------------------------------------------
-- İlke: tarayıcı hiçbir tabloya doğrudan dokunamaz.
--   * Bütün tablolarda satır düzeyi güvenlik (RLS) açıktır.
--   * anon ve authenticated rollerinin bütün tablo yetkileri geri alınır.
--   * anon için hiçbir politika yoktur.
--   * authenticated yalnızca OKUYABİLİR ve yalnızca yonetici_mi() doğruysa;
--     giriş yapmış olmak tek başına yetmez.
--   * Yazma işlemleri yalnızca security definer fonksiyonlarla yapılır
--     (3. ve sonraki migrasyonlar).
-- =====================================================================

-- Bundan sonra oluşturulacak nesnelere otomatik yetki verilmesin.
-- (Supabase yeni tablo ve fonksiyonlara varsayılan olarak anon/authenticated
-- yetkisi verir; Postgres de fonksiyonları PUBLIC'e açar.)
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- Var olan nesnelerden yetkileri geri al.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;

-- Bütün tablolarda RLS'i aç.
do $$
declare
  t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- yonetici_mi(): giriş yapan kullanıcı yoneticiler tablosunda mı?
-- security definer: yoneticiler tablosunu RLS'e takılmadan okuyabilsin.
-- ---------------------------------------------------------------------
create function public.yonetici_mi()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.yoneticiler where kullanici_id = (select auth.uid())
  );
$$;

revoke execute on function public.yonetici_mi() from public, anon, authenticated;
grant execute on function public.yonetici_mi() to authenticated;

-- ---------------------------------------------------------------------
-- Yönetici okuma politikaları
-- authenticated rolüne SELECT yetkisi verilir; hangi satırların görüneceğine
-- RLS politikası karar verir: yalnızca yöneticiler hepsini görür, diğerleri
-- hiçbir satır göremez. INSERT/UPDATE/DELETE yetkisi hiç verilmez.
-- ---------------------------------------------------------------------
do $$
declare
  t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('grant select on public.%I to authenticated', t.tablename);
    execute format(
      'create policy yonetici_okur on public.%I for select to authenticated using ((select public.yonetici_mi()))',
      t.tablename
    );
  end loop;
end;
$$;
