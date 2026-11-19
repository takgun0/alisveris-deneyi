-- =====================================================================
-- canli_tut: ücretsiz plandaki projenin uykuya geçmemesi için
-- ---------------------------------------------------------------------
-- Supabase, ücretsiz plandaki projeyi bir hafta boyunca yeterli veritabanı
-- etkinliği görmezse duraklatır ("a few user requests to the database each
-- day" yeterli; https://supabase.com/docs/guides/platform/free-project-pausing).
-- .github/workflows/canli_tut.yml bu fonksiyonu her gün yayınlanabilir
-- anahtarla çağırır.
--
-- Hiçbir tabloya dokunmaz, hiçbir veri döndürmez; security invoker'dır.
-- anon'a açık olan tek katılımcı dışı fonksiyondur
-- (testler/vt/guvenlik.test.mjs > ANON_FONKSIYONLARI).
-- =====================================================================

create function public.canli_tut()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select true;
$$;

revoke execute on function public.canli_tut() from public, anon, authenticated;
grant execute on function public.canli_tut() to anon;
